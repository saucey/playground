"use client";
import React, { useEffect, useRef, useState } from "react";
import io, { Socket } from "socket.io-client";
import Peer, { SignalData } from "simple-peer";
import RegisterUsername from "./Register";

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_ENV === 'local' 
  ? "http://localhost:5555"
  : "wss://video-call.devonauts.co.uk";

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
const [socket, setSocket] = useState<Socket | null>(null);
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
  
  useEffect(() => {
    console.log(process.env.NEXT_PUBLIC_SOCKET_ENV)
    const newSocket = io(SOCKET_URL, {
      transports: ["websocket", "polling"], // Fallback to polling if WS fails
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      autoConnect: true,
    });
    
    setSocket(newSocket);
    
    return () => {
      newSocket.disconnect();
    };
  }, []);

// Socket event listeners
  useEffect(() => {
  if (!socket) return;
    
  socket.on("connect", () => {
    console.log("Connected with ID:", socket.id);
    setMe(socket.id);
  });
    
  socket.on("registered", (users: RegisteredUser[]) => {
    console.log(registeredUsers, 'registered')
    setIsRegistered(true);
    setRegisteredUsers(users);
  });

  socket.on("user-registered", (user: RegisteredUser) => {
    setRegisteredUsers(prev => [...prev, user]);
    console.log(registeredUsers, 'user-registered')
  });

  socket.on("user-unregistered", (socketId: string) => {
    setRegisteredUsers(prev => prev.filter(u => u.socketId !== socketId));
    console.log(registeredUsers, 'user-unregistered')
  });
  
  socket.on("users-updated", (users: RegisteredUser[]) => {
    setRegisteredUsers(users);
    console.log(registeredUsers, 'users-updated')
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
      // setError(`${callerCustomId} is calling you...`);
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
    
    // Add to your client's socket event listeners
  socket.on("call-rejected", () => {
    setCallingStatus("Call was rejected");
    resetCallState()
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
}, [socket]);

// Update the startRecording function to only record the screen
const startRecording = async () => {
  try {
    let audioStream: MediaStream | null = null;
    let screenStream: MediaStream | null = null;
    
    try {
      // Try to get microphone audio first
      audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (audioError) {
      console.warn("Microphone access denied, recording without audio", audioError);
    }

    try {
      // Then get screen capture
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
    } catch (screenError) {
      console.error("Screen share cancelled", screenError);
      if (audioStream) audioStream.getTracks().forEach(t => t.stop());
      throw new Error("Screen sharing is required");
    }

    // Combine streams
    const combinedStream = new MediaStream([
      ...screenStream.getVideoTracks(),
      ...(audioStream ? audioStream.getAudioTracks() : 
          screenStream.getAudioTracks().length ? screenStream.getAudioTracks() : [])
    ]);

    if (combinedStream.getAudioTracks().length === 0) {
      console.warn("No audio tracks available in recording");
    }

    const recorder = new MediaRecorder(combinedStream, {
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
      const blob = new Blob(chunks, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      setRecordedChunks(chunks);
      setRecordedVideoUrl(url);
      setShowPreviewModal(true);
      
      // Clean up stream
      screenStream.getTracks().forEach(track => track.stop());
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
    socket.emit("reject-call", { to: caller });
    resetCallState();
  };
  
  const endCall = () => {
    socket.emit("end-call");
    resetCallState();
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      {/* <h1 className="text-2xl font-bold text-gray-800 mb-4">🎥 Video Calling App</h1> */}
  
      {error && (
        <div className="flex items-center justify-between bg-red-100 text-red-800 border border-red-300 px-4 py-3 rounded mb-4">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-lg font-bold">×</button>
        </div>
      )}
  
      {callingStatus && (
        <div className="flex items-center justify-between bg-blue-100 text-blue-800 border border-blue-300 px-4 py-3 rounded mb-4">
          <span>{callingStatus}</span>
          <button onClick={endCall} className="text-lg font-bold">×</button>
        </div>
      )}
  
        {!isRegistered ? (
          <RegisterUsername registerUser={registerUser} customId={customId} setCustomId={setCustomId} />
        ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mt-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mt-8">
  {/* New Meeting */}
  <div
    onClick={() => console.log('Start New Meeting')}
    className="flex flex-col items-center p-6 bg-white shadow-md rounded-xl cursor-pointer hover:bg-gray-50 transition"
  >
    <div className="bg-blue-100 text-blue-600 p-4 rounded-full mb-4">
      {/* Replace with a real icon */}
      <svg className="w-12 h-12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 16h8M8 12h8m-8-4h8M4 6h16M4 18h16" />
      </svg>
    </div>
    <span className="text-lg font-semibold text-gray-700">New Meeting</span>
  </div>

  {/* Join Meeting */}
  <div
    onClick={() => console.log('Join Meeting')}
    className="flex flex-col items-center p-6 bg-white shadow-md rounded-xl cursor-pointer hover:bg-gray-50 transition"
  >
    <div className="bg-green-100 text-green-600 p-4 rounded-full mb-4">
      <svg className="w-12 h-12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16h6m2 4H7a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v12a2 2 0 01-2 2z" />
      </svg>
    </div>
    <span className="text-lg font-semibold text-gray-700">Join Meeting</span>
  </div>

  {/* Record Screen */}
  <div
    onClick={() => console.log('Record Screen')}
    className="flex flex-col items-center p-6 bg-white shadow-md rounded-xl cursor-pointer hover:bg-gray-50 transition"
  >
    <div className="bg-red-100 text-red-600 p-4 rounded-full mb-4">
      <svg className="w-12 h-12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="3" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.36-6.36l-.71.71M6.34 17.66l-.7.7m12.02 0l-.7-.7M6.34 6.34l-.7-.7" />
      </svg>
    </div>
    <span className="text-lg font-semibold text-gray-700">Record Screen</span>
  </div>

  {/* Call a User */}
  <div
    onClick={() => console.log('Call a User')}
    className="flex flex-col items-center p-6 bg-white shadow-md rounded-xl cursor-pointer hover:bg-gray-50 transition"
  >
    <div className="bg-purple-100 text-purple-600 p-4 rounded-full mb-4">
      <svg className="w-12 h-12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 5a3 3 0 00-6 0v2a3 3 0 006 0V5zM6 10v10a1 1 0 001 1h10a1 1 0 001-1V10m-4 4h-4" />
      </svg>
    </div>
    <span className="text-lg font-semibold text-gray-700">Call a User</span>
  </div>
</div>

          </div>
        </>
      )}
    </div>
  );
  
};

export default VideoCall;