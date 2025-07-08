"use client";
import React, { useEffect, useRef, useState } from "react";
import io, { Socket } from "socket.io-client";
import Peer, { SignalData } from "simple-peer";

const SOCKET_URL = process.env.NODE_ENV === 'development' 
  ? "http://localhost:5555"
  : "wss://video-call.devonauts.co.uk";

const socket: Socket = io("wss://video-call.devonauts.co.uk", {
  transports: ["websocket"],
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
});

// Ringtone audio files
const RINGTONE_OUTGOING = "/mixkit-happy-bells-notification-937.mp3";
const RINGTONE_INCOMING = "/mixkit-happy-bells-notification-937.mp3";

interface RegisteredUser {
  socketId: string;
  customId: string;
  inCall: boolean;
  inCallWith?: string;
}

const VideoCall: React.FC = () => {
  const [me, setMe] = useState<string>("");
  const [customId, setCustomId] = useState<string>("");
  const [isRegistered, setIsRegistered] = useState<boolean>(false);
  const [registeredUsers, setRegisteredUsers] = useState<RegisteredUser[]>([]);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [receivingCall, setReceivingCall] = useState<boolean>(false);
  const [caller, setCaller] = useState<string>("");
  const [callerSignal, setCallerSignal] = useState<SignalData | null>(null);
  const [callAccepted, setCallAccepted] = useState<boolean>(false);
  const [idToCall, setIdToCall] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [callingStatus, setCallingStatus] = useState<string>("");
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [needsUserInteraction, setNeedsUserInteraction] = useState(false);

  const myVideo = useRef<HTMLVideoElement>(null);
  const userVideo = useRef<HTMLVideoElement>(null);
  const connectionRef = useRef<Peer.Instance | null>(null);
  const outgoingRingtoneRef = useRef<HTMLAudioElement | null>(null);
  const incomingRingtoneHTMLRef = useRef<HTMLAudioElement | null>(null);
  const incomingRingtoneWebRef = useRef<AudioBufferSourceNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  const [isRecording, setIsRecording] = useState(false);
  const [recordedChunks, setRecordedChunks] = useState<Blob[]>([]);
  const [recordedVideoUrl, setRecordedVideoUrl] = useState<string | null>(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);

// Update the startRecording function to only record the screen
const startRecording = async () => {
  try {
    let audioStream: MediaStream | null = null;
    let screenStream: MediaStream | null = null;
    let webcamStream: MediaStream | null = null;
    
    try {
      // Try to get microphone audio first
      audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (audioError) {
      console.warn("Microphone access denied, recording without audio", audioError);
    }

    try {
      // Get screen capture
      screenStream = await (navigator.mediaDevices as any).getDisplayMedia({
        video: {
          displaySurface: 'browser',
          cursor: 'always'
        },
        audio: audioStream ? false : {  // Only ask for system audio if no microphone
          echoCancellation: false,
          noiseSuppression: false
        }
      });

      // Get webcam stream with constrained resolution for better performance
      webcamStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 320, max: 640 },
          height: { ideal: 180, max: 360 },
          frameRate: { ideal: 15, max: 30 }
        }
      });
    } catch (screenError) {
      console.error("Screen share cancelled", screenError);
      if (audioStream) audioStream.getTracks().forEach(t => t.stop());
      if (webcamStream) webcamStream.getTracks().forEach(t => t.stop());
      throw new Error("Screen sharing is required");
    }

    // Create a canvas to combine the streams
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get canvas context');
    
    // Set canvas dimensions to match screen stream
    const screenTrack = screenStream.getVideoTracks()[0];
    const screenSettings = screenTrack.getSettings();
    canvas.width = screenSettings.width || 1280;
    canvas.height = screenSettings.height || 720;
    
    // Create video elements for the streams
    const screenVideo = document.createElement('video');
    screenVideo.srcObject = new MediaStream([screenTrack]);
    screenVideo.autoplay = true;
    screenVideo.playsInline = true;
    
    const webcamVideo = document.createElement('video');
    webcamVideo.srcObject = new MediaStream(webcamStream.getVideoTracks());
    webcamVideo.autoplay = true;
    webcamVideo.playsInline = true;
    
    // Webcam overlay dimensions and position (top right)
    const webcamWidth = Math.min(canvas.width / 4, 320); // Max 320px width
    const webcamHeight = (webcamWidth * 9) / 16; // 16:9 aspect ratio
    const webcamX = canvas.width - webcamWidth - 20; // 20px from right
    const webcamY = 20; // 20px from top
    
    // Use a timer instead of requestAnimationFrame for more consistent frame rate
    let animationFrameId: number;
    let lastDrawTime = 0;
    const targetFPS = 25;
    const frameDelay = 1000 / targetFPS;
    
    const drawFrame = () => {
      const now = performance.now();
      if (now - lastDrawTime >= frameDelay) {
        lastDrawTime = now;
        
        try {
          // Draw screen
          ctx.drawImage(screenVideo, 0, 0, canvas.width, canvas.height);
          
          // Draw webcam overlay with rounded corners
          ctx.save();
          // Create rounded rectangle path
          const cornerRadius = 10;
          ctx.beginPath();
          ctx.moveTo(webcamX + cornerRadius, webcamY);
          ctx.lineTo(webcamX + webcamWidth - cornerRadius, webcamY);
          ctx.quadraticCurveTo(webcamX + webcamWidth, webcamY, webcamX + webcamWidth, webcamY + cornerRadius);
          ctx.lineTo(webcamX + webcamWidth, webcamY + webcamHeight - cornerRadius);
          ctx.quadraticCurveTo(webcamX + webcamWidth, webcamY + webcamHeight, webcamX + webcamWidth - cornerRadius, webcamY + webcamHeight);
          ctx.lineTo(webcamX + cornerRadius, webcamY + webcamHeight);
          ctx.quadraticCurveTo(webcamX, webcamY + webcamHeight, webcamX, webcamY + webcamHeight - cornerRadius);
          ctx.lineTo(webcamX, webcamY + cornerRadius);
          ctx.quadraticCurveTo(webcamX, webcamY, webcamX + cornerRadius, webcamY);
          ctx.closePath();
          ctx.clip();
          
          // Draw webcam video
          ctx.drawImage(webcamVideo, webcamX, webcamY, webcamWidth, webcamHeight);
          
          // Add border
          ctx.strokeStyle = 'white';
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.restore();
        } catch (e) {
          console.error('Error drawing frame:', e);
        }
      }
      animationFrameId = requestAnimationFrame(drawFrame);
    };
    
    // Wait for both videos to be ready
    await Promise.all([
      new Promise<void>((resolve) => {
        screenVideo.onloadedmetadata = () => {
          screenVideo.play().catch(console.error);
          resolve();
        };
      }),
      new Promise<void>((resolve) => {
        webcamVideo.onloadedmetadata = () => {
          webcamVideo.play().catch(console.error);
          resolve();
        };
      })
    ]);
    
    // Start drawing
    drawFrame();
    
    // Capture canvas stream
    const canvasStream = canvas.captureStream(targetFPS);
    
    // Combine audio tracks
    const audioTracks = [
      ...(audioStream ? audioStream.getAudioTracks() : []),
      ...(screenStream.getAudioTracks().length ? screenStream.getAudioTracks() : [])
    ];
    
    if (audioTracks.length > 0) {
      audioTracks.forEach(track => canvasStream.addTrack(track));
    }

    const recorder = new MediaRecorder(canvasStream, {
      mimeType: 'video/webm;codecs=vp9,opus',
      audioBitsPerSecond: 128000,
      videoBitsPerSecond: 2500000
    });

    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        chunks.push(e.data);
      }
    };

    recorder.onstop = () => {
      cancelAnimationFrame(animationFrameId);
      const blob = new Blob(chunks, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      setRecordedChunks(chunks);
      setRecordedVideoUrl(url);
      setShowPreviewModal(true);
      
      // Clean up streams
      screenStream.getTracks().forEach(track => track.stop());
      if (webcamStream) webcamStream.getTracks().forEach(track => track.stop());
      if (audioStream) audioStream.getTracks().forEach(track => track.stop());
      
      // Clean up video elements
      screenVideo.srcObject = null;
      webcamVideo.srcObject = null;
    };

    // Handle if user stops sharing via browser UI
    screenStream.getVideoTracks()[0].onended = () => {
      if (isRecording) {
        stopRecording();
      }
    };

    recorder.start(100); // Collect data every 100ms
    mediaRecorderRef.current = recorder;
    setIsRecording(true);
  } catch (err) {
    console.error('Error starting screen recording:', err);
    setError('Failed to start screen recording. Please check permissions.');
  }
};

const stopRecording = () => {
  if (mediaRecorderRef.current && isRecording) {
    mediaRecorderRef.current.stop();
    setIsRecording(false);
  }
};

const downloadRecording = () => {
  if (recordedVideoUrl) {
    const a = document.createElement('a');
    a.href = recordedVideoUrl;
    a.download = `recording-${new Date().toISOString()}.webm`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(recordedVideoUrl);
    }, 100);
  }
};

const closePreviewModal = () => {
  setShowPreviewModal(false);
  if (recordedVideoUrl) {
    URL.revokeObjectURL(recordedVideoUrl);
    setRecordedVideoUrl(null);
  }
  setRecordedChunks([]);
};

  const isCallButtonDisabled = () => {
    const targetUser = registeredUsers.find(u => u.socketId === idToCall);
    return !me || !idToCall || callAccepted || callingStatus !== "" || receivingCall || 
           (targetUser?.inCall && targetUser.inCallWith !== me);
  };

  const playOutgoingRingtone = () => {
    console.log('playing outgoing ringtone');
    // Always create a new instance to ensure fresh state
    if (outgoingRingtoneRef.current) {
      outgoingRingtoneRef.current.pause();
      outgoingRingtoneRef.current.currentTime = 0;
      outgoingRingtoneRef.current = null;
    }
    
    outgoingRingtoneRef.current = new Audio(RINGTONE_OUTGOING);
    outgoingRingtoneRef.current.loop = true;
  
    outgoingRingtoneRef.current
      .play()
      .then(() => {
        console.log("Outgoing ringtone playing");
      })
      .catch((e) => {
        console.error("Could not play outgoing ringtone:", e);
        setNeedsUserInteraction(true);
      });
  };
  
  const stopOutgoingRingtone = () => {
    if (outgoingRingtoneRef.current) {
      outgoingRingtoneRef.current.pause();
      outgoingRingtoneRef.current.currentTime = 0;
    }
  };

  const playIncomingRingtone = () => {
    stopIncomingRingtone(); // <-- Add this to prevent stacking
  
    if (typeof window !== 'undefined' && window.AudioContext) {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
  
      fetch(RINGTONE_INCOMING)
        .then(res => res.arrayBuffer())
        .then(buffer => audioContextRef.current!.decodeAudioData(buffer))
        .then(decodedBuffer => {
          const source = audioContextRef.current!.createBufferSource();
          source.buffer = decodedBuffer;
          source.loop = true;
          source.connect(audioContextRef.current!.destination);
          source.start(0);
  
          incomingRingtoneWebRef.current = source;
        })
        .catch(err => {
          console.warn("Web Audio failed, using HTML Audio fallback", err);
          if (!incomingRingtoneHTMLRef.current) {
            incomingRingtoneHTMLRef.current = new Audio(RINGTONE_INCOMING);
            incomingRingtoneHTMLRef.current.loop = true;
          }
          incomingRingtoneHTMLRef.current.play().catch(e => {
            console.error("Fallback HTML5 audio failed:", e);
            setNeedsUserInteraction(true);
          });
        });
    }
  };
  
  

  const stopIncomingRingtone = () => {
    // Stop Web Audio version
    if (incomingRingtoneWebRef.current) {
      try {
        incomingRingtoneWebRef.current.stop();
      } catch (e) {
        console.error("Error stopping web audio ringtone:", e);
      }
      incomingRingtoneWebRef.current.disconnect();
      incomingRingtoneWebRef.current = null;
    }
  
    // Stop HTML Audio fallback
    if (incomingRingtoneHTMLRef.current) {
      try {
        incomingRingtoneHTMLRef.current.pause();
        incomingRingtoneHTMLRef.current.currentTime = 0;
      } catch (e) {
        console.error("Error stopping HTML ringtone:", e);
      }
      incomingRingtoneHTMLRef.current = null;
    }
  };

  const resetCallState = () => {
    console.log('resetting call state');
    setCallAccepted(false);
    setReceivingCall(false);
    setCallingStatus("");
    setCaller("");
    setCallerSignal(null);
    setNeedsUserInteraction(false);
    
    // Stop all ringtones
    stopOutgoingRingtone();
    stopIncomingRingtone();
    
    if (connectionRef.current) {
      connectionRef.current.destroy();
      connectionRef.current = null;
    }
    
    if (userVideo.current) {
      userVideo.current.srcObject = null;
    }
  };

  // Initialize media stream
  useEffect(() => {
    const setupMedia = async () => {
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user" },
          audio: true,
        });
        setStream(mediaStream);
  
        const tryAssignStream = () => {
          if (myVideo.current) {
            myVideo.current.srcObject = mediaStream;
            myVideo.current.onloadedmetadata = () => {
              myVideo.current?.play().catch((e) => console.error("Video play error:", e));
            };
          } else {
            requestAnimationFrame(tryAssignStream);
          }
        };
  
        tryAssignStream();
      } catch (err) {
        console.error("Failed to get media devices", err);
        setError("Could not access camera/microphone. Please check permissions.");
      }
    };
  
    setupMedia();
  
    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
      resetCallState();
    };
  }, []);

  // Mobile audio workaround
  useEffect(() => {
    if (receivingCall) {
      const handleUserInteraction = () => {
        playIncomingRingtone();
        document.removeEventListener('click', handleUserInteraction);
        document.removeEventListener('touchstart', handleUserInteraction);
      };

      document.addEventListener('click', handleUserInteraction);
      document.addEventListener('touchstart', handleUserInteraction);

      return () => {
        document.removeEventListener('click', handleUserInteraction);
        document.removeEventListener('touchstart', handleUserInteraction);
      };
    }
  }, [receivingCall]);

  useEffect(() => {
    if (callAccepted && typeof window !== 'undefined') {
      const handleUserInteraction = () => {
        if (userVideo.current) {
          userVideo.current.muted = false;
          userVideo.current.play().catch(e => console.log("Play attempt failed:", e));
        }
      };
      
      document.addEventListener('click', handleUserInteraction);
      document.addEventListener('touchstart', handleUserInteraction);
      
      return () => {
        document.removeEventListener('click', handleUserInteraction);
        document.removeEventListener('touchstart', handleUserInteraction);
      };
    }
  }, [callAccepted]);

  // Socket event listeners
  useEffect(() => {
    socket.on("connect", () => {
      console.log("Connected with ID:", socket.id);
      setMe(socket.id);
    });

    socket.on("registered", (users: RegisteredUser[]) => {
      setIsRegistered(true);
      setRegisteredUsers(users);
    });

    socket.on("user-registered", (user: RegisteredUser) => {
      setRegisteredUsers(prev => [...prev, user]);
    });

    socket.on("user-unregistered", (socketId: string) => {
      setRegisteredUsers(prev => prev.filter(u => u.socketId !== socketId));
    });

    socket.on("users-updated", (users: RegisteredUser[]) => {
      setRegisteredUsers(users);
    });

    socket.on("connect_error", (err) => {
      console.error("Connection error:", err);
      setError("Connection failed. Please check your network.");
    });

    socket.on("call-made", ({ from, signal, customId: callerCustomId }) => {
      if (!callAccepted && !callingStatus) {
        setReceivingCall(true);
        setCaller(from);
        setCallerSignal(signal);
        setError(`${callerCustomId} is calling you...`);
        playIncomingRingtone();
      }
    });

    socket.on("call-answered", (signal: SignalData) => {
      setCallAccepted(true);
      setCallingStatus("");
      stopOutgoingRingtone();
      if (connectionRef.current) {
        connectionRef.current.signal(signal);
      }
    });

    socket.on("call-rejected", () => {
      setCallingStatus("Call was rejected");
      stopOutgoingRingtone();
      setTimeout(() => resetCallState(), 2000);
    });

    socket.on("call-ended", () => {
      resetCallState();
    });

    socket.on("registration-error", (message: string) => {
      setError(message);
    });

    return () => {
      stopOutgoingRingtone();
      stopIncomingRingtone();
      socket.off("connect");
      socket.off("registered");
      socket.off("user-registered");
      socket.off("user-unregistered");
      socket.off("users-updated");
      socket.off("connect_error");
      socket.off("call-made");
      socket.off("call-answered");
      socket.off("call-rejected");
      socket.off("call-ended");
      socket.off("registration-error");
    };
  }, []);

  // Media control functions
  const toggleMute = () => {
    if (stream) {
      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length > 0) {
        const newMutedState = !audioTracks[0].enabled;
        audioTracks[0].enabled = newMutedState;
        setIsMuted(!newMutedState);
        
        if (connectionRef.current) {
          connectionRef.current.replaceTrack(
            audioTracks[0],
            audioTracks[0],
            stream
          );
        }
      }
    }
  };

  const toggleVideo = async () => {
    if (!stream) return;

    const videoTracks = stream.getVideoTracks();
    if (videoTracks.length > 0) {
      const newVideoState = !videoTracks[0].enabled;
      videoTracks[0].enabled = newVideoState;
      setIsVideoOn(newVideoState);

      if (connectionRef.current) {
        connectionRef.current.replaceTrack(
          videoTracks[0],
          videoTracks[0],
          stream
        );
      }
    } else if (!isVideoOn) {
      try {
        const videoStream = await navigator.mediaDevices.getUserMedia({ 
          video: { facingMode: "user" }
        });
        const videoTrack = videoStream.getVideoTracks()[0];
        stream.addTrack(videoTrack);
        
        if (connectionRef.current) {
          connectionRef.current.replaceTrack(
            videoTrack,
            videoTrack,
            stream
          );
        }
        
        setIsVideoOn(true);
        videoStream.getTracks().forEach(track => {
          if (track.kind === 'audio') track.stop();
        });
      } catch (err) {
        console.error("Failed to re-enable video", err);
        setError("Could not re-enable video. Please check permissions.");
      }
    }
  };

  // User registration
  const registerUser = () => {
    if (!customId.trim()) {
      setError("Please enter a custom ID");
      return;
    }
    setError(null);
    socket.emit("register", customId);
  };

  // Call management
  const callUser = (id: string) => {
    resetCallState();
  
    if (!stream) {
      setError("No local stream available");
      return;
    }
  
    const targetUser = registeredUsers.find(u => u.socketId === id);
    setCallingStatus(`Calling ${targetUser?.customId || id.slice(0, 6)}...`);
    
    // Start the ringtone after state is reset
    playOutgoingRingtone();
    
    const peer = new Peer({
      initiator: true,
      trickle: false,
      stream: stream,
    });

    peer.on("signal", (data: SignalData) => {
      console.log('sending signal');
      socket.emit("call-user", {
        userToCall: id,
        signalData: data,
        from: me,
        customId: customId
      });
    });

    peer.on("stream", (currentStream: MediaStream) => {
      console.log('got stream');
      if (userVideo.current) {
        userVideo.current.srcObject = currentStream;
        userVideo.current.play().catch(e => console.error("Remote video play error:", e));
      }
    });

    peer.on("connect", () => {
      console.log('connected');
      setCallAccepted(true);
      setCallingStatus("");
      stopOutgoingRingtone();
    });

    peer.on("error", (err) => {
      console.error("Peer error:", err);
      setError("Call connection failed");
      setCallingStatus("Call failed");
      stopOutgoingRingtone();
      setTimeout(() => resetCallState(), 2000);
    });

    peer.on("close", () => {
      console.log('closed');
      resetCallState();
    });

    connectionRef.current = peer;
  };

  const answerCall = () => {
    // Prevent ringtone from restarting
    setReceivingCall(false);
    stopIncomingRingtone();
  
    if (!stream || !callerSignal) {
      setError("Cannot answer call: missing stream or signal");
      return;
    }
  
    const peer = new Peer({
      initiator: false,
      trickle: false,
      stream: stream,
    });
  
    peer.on("signal", (data: SignalData) => {
      socket.emit("answer-call", { signal: data, to: caller });
    });
  
    peer.on("stream", (currentStream: MediaStream) => {
      if (userVideo.current) {
        userVideo.current.srcObject = currentStream;
        userVideo.current.play().catch(e => console.error("Remote video play error:", e));
      }
    });
  
    peer.on("connect", () => {
      setCallAccepted(true);
    });
  
    peer.on("error", (err) => {
      console.error("Peer error:", err);
      setError("Call connection failed");
      resetCallState();
    });
  
    peer.on("close", () => {
      resetCallState();
    });
  
    peer.signal(callerSignal);
    connectionRef.current = peer;
  };
  

  const rejectCall = () => {
    stopIncomingRingtone();
    socket.emit("reject-call", { to: caller });
    resetCallState();
  };

  const endCall = () => {
    socket.emit("end-call");
    resetCallState();
  };

  return (
    <div className="p-4 max-w-md mx-auto">
      <h1 className="text-xl font-bold mb-2">Video Calling App</h1>
      
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
          <button onClick={() => setError(null)} className="float-right font-bold">×</button>
        </div>
      )}

      {callingStatus && (
        <div className="bg-blue-100 border border-blue-400 text-blue-700 px-4 py-3 rounded mb-4">
          {callingStatus}
          <button onClick={endCall} className="float-right font-bold">×</button>
        </div>
      )}

      {!isRegistered ? (
        <div className="mb-4">
          <h2 className="text-lg font-semibold mb-2">Register Your ID</h2>
          <div className="flex space-x-2">
            <input
              type="text"
              placeholder="Enter your custom ID"
              value={customId}
              onChange={(e) => setCustomId(e.target.value)}
              className="border p-2 rounded flex-1"
            />
            <button 
              onClick={registerUser} 
              className="bg-blue-500 text-white px-4 py-2 rounded"
            >
              Register
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex gap-4 mb-4">
            <div className="relative">
              <video 
                playsInline 
                muted={true}
                ref={myVideo} 
                autoPlay 
                className="w-full rounded-lg border border-gray-300"
                style={{ 
                  maxWidth: "200px",
                  display: "block",
                  transform: "scaleX(-1)",
                  backgroundColor: !isVideoOn ? "black" : "transparent"
                }}
              />
              <div className="absolute bottom-2 left-2 bg-black bg-opacity-50 text-white px-2 py-1 rounded text-xs">
                You
              </div>
              <div className="absolute top-2 left-2 flex gap-2">
                <button 
                  onClick={toggleMute}
                  className={`bg-black bg-opacity-50 text-white p-2 rounded-full ${isMuted ? 'bg-red-500' : ''}`}
                  title={isMuted ? "Unmute microphone" : "Mute microphone"}
                >
                  {isMuted ? (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" clipRule="evenodd" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                    </svg>
                  )}
                </button>
                <button 
                  onClick={toggleVideo}
                  className={`bg-black bg-opacity-50 text-white p-2 rounded-full ${!isVideoOn ? 'bg-red-500' : ''}`}
                  title={isVideoOn ? "Turn off camera" : "Turn on camera"}
                >
                  {isVideoOn ? (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
            <div className="relative">
              <video 
                playsInline 
                ref={userVideo} 
                autoPlay 
                className="w-full rounded-lg border border-gray-300"
                style={{ 
                  maxWidth: "200px", 
                  display: callAccepted ? "block" : "none",
                  backgroundColor: callAccepted ? "transparent" : "black"
                }}
              />
              {callAccepted && (
                <div className="absolute bottom-2 left-2 bg-black bg-opacity-50 text-white px-2 py-1 rounded text-xs">
                  {registeredUsers.find(u => u.socketId === idToCall)?.customId || "Remote"}
                </div>
              )}
            </div>
          </div>
            
          <div className="mt-4 flex space-x-2">
            {!isRecording ? (
              <button
                onClick={startRecording}
                className="bg-green-500 text-white px-4 py-2 rounded flex-1"
                disabled={isRecording}
              >
                Start Recording
              </button>
            ) : (
              <button
                onClick={stopRecording}
                className="bg-red-500 text-white px-4 py-2 rounded flex-1"
              >
                Stop Recording
              </button>
            )}
          </div>

          <div className="mb-4">
            <h2 className="text-lg font-semibold mb-2">Available Users</h2>
            <ul className="max-h-40 overflow-y-auto border rounded p-2">
              {registeredUsers.filter(u => u.socketId !== me).map(user => {
                const isInCallWithMe = user.inCallWith === me;
                const isInCallWithSomeoneElse = user.inCall && !isInCallWithMe;
                
                return (
                  <li 
                    key={user.socketId} 
                    className={`p-2 ${isInCallWithSomeoneElse ? 'bg-gray-100 opacity-50' : 'hover:bg-gray-100'} cursor-pointer flex justify-between items-center`}
                    onClick={() => !isInCallWithSomeoneElse && setIdToCall(user.socketId)}
                    title={isInCallWithSomeoneElse ? "User is in another call" : ""}
                  >
                    <div className="flex items-center">
                      <span>{user.customId}</span>
                      {isInCallWithMe && (
                        <span className="ml-2 text-xs text-green-500">(In call with you)</span>
                      )}
                      {isInCallWithSomeoneElse && (
                        <span className="ml-2 text-xs text-red-500">(In call)</span>
                      )}
                    </div>
                    <span className="text-xs text-gray-500">({user.socketId.slice(0, 6)})</span>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="mt-4">
            <p className="mb-2">Your ID: <span className="font-semibold">{customId}</span> <span className="text-xs text-gray-500">({me.slice(0, 6)})</span></p>
            <div className="flex flex-col space-y-2">
              <input
                type="text"
                placeholder="Enter ID to call"
                value={idToCall}
                onChange={(e) => setIdToCall(e.target.value)}
                className="border p-2 rounded"
                disabled={callAccepted || callingStatus !== "" || receivingCall}
              />
              <div className="flex space-x-2">
                {!callAccepted && !receivingCall ? (
                  <button 
                    onClick={() => callUser(idToCall)} 
                    className="bg-blue-500 text-white px-4 py-2 rounded flex-1 disabled:bg-blue-300"
                    disabled={isCallButtonDisabled()}
                  >
                    Call
                  </button>
                ) : (
                  <button 
                    onClick={endCall} 
                    className="bg-red-500 text-white px-4 py-2 rounded flex-1"
                  >
                    End Call
                  </button>
                )}
              </div>
            </div>
          </div>

          {receivingCall && !callAccepted && (
            <div className="mt-4 p-3 bg-gray-100 rounded">
              <p className="mb-2">{registeredUsers.find(u => u.socketId === caller)?.customId || caller.slice(0, 6)} is calling...</p>
              {needsUserInteraction && (
                <div className="mb-2 p-2 bg-yellow-100 rounded">
                  <p className="text-sm">Tap the button below to enable call audio:</p>
                  <button 
                    onClick={() => {
                      playIncomingRingtone();
                      setNeedsUserInteraction(false);
                    }}
                    className="bg-blue-500 text-white px-4 py-2 rounded mt-2 w-full"
                  >
                    Enable Sound
                  </button>
                </div>
              )}
              <div className="flex space-x-2">
                <button 
                  onClick={answerCall} 
                  className="bg-green-500 text-white px-4 py-2 rounded flex-1"
                >
                  Answer
                </button>
                <button 
                  onClick={rejectCall} 
                  className="bg-red-500 text-white px-4 py-2 rounded flex-1"
                >
                  Decline
                </button>
              </div>
            </div>
          )}
        </>
      )}
      {showPreviewModal && recordedVideoUrl && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
          <div className="bg-white p-4 rounded-lg max-w-3xl w-full">
            <h2 className="text-xl font-bold mb-4">Recording Preview</h2>
            <video 
              controls 
              src={recordedVideoUrl} 
              className="w-full mb-4"
              autoPlay
            />
            <div className="flex justify-end space-x-2">
              <button
                onClick={closePreviewModal}
                className="bg-gray-500 text-white px-4 py-2 rounded"
              >
                Cancel
              </button>
              <button
                onClick={downloadRecording}
                className="bg-blue-500 text-white px-4 py-2 rounded"
              >
                Download
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VideoCall;