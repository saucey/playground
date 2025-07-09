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
const [showNewMeetingModal, setShowNewMeetingModal] = useState(false);
const [showJoinMeetingModal, setShowJoinMeetingModal] = useState(false);
const [showRecordScreenModal, setShowRecordScreenModal] = useState(false);
const [showCallUserModal, setShowCallUserModal] = useState(false);

const [showCallModal, setShowCallModal] = useState(false);
  const [callTarget, setCallTarget] = useState<RegisteredUser | null>(null);
  
  // Add this state for the welcome message
const [welcomeMessage, setWelcomeMessage] = useState("");

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
  
  // For individual user registrations
  socket.on("user-registered", (user: RegisteredUser) => {
    setIsRegistered(true);
    // Update user list without duplicates
    setRegisteredUsers(prev => {
      // Check if user already exists
      const exists = prev.some(u => u.socketId === user.socketId);
      return exists ? prev : [...prev, user];
    });
  
    // Only set welcome if this is our own registration
    if (user.socketId === socket.id) { // Use socket.id instead of me
      setWelcomeMessage(`Welcome, ${user.customId}!`);
    }
  });

  socket.on("user-unregistered", (socketId: string) => {
    setRegisteredUsers(prev => prev.filter(u => u.socketId !== socketId));
  });
  
  socket.on("users-updated", (users: RegisteredUser[]) => {
    setRegisteredUsers(users);
    console.log(users, 'users-updated')
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
      setCallingStatus(`${callerCustomId} is calling you...`);
      playIncomingRingtone();

      // Store the caller's information for later use
      setCallTarget({
        socketId: from,
        customId: callerCustomId,
        inCall: true,
        inCallWith: me
      });
      
      // Show a notification to the callee
      if (Notification.permission === "granted") {
        new Notification("Incoming Call", {
          body: `${callerCustomId} is calling you`,
          icon: "/favicon.ico"
        });
      } else if (Notification.permission !== "denied") {
        Notification.requestPermission().then(permission => {
          if (permission === "granted") {
            new Notification("Incoming Call", {
              body: `${callerCustomId} is calling you`,
              icon: "/favicon.ico"
            });
          }
        });
      }
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
          video: { 
            facingMode: "user",
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 30 }
          },
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
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
      // resetCallState();
    };
  }, []);

  // Reinitialize video when call modal opens
  useEffect(() => {
    if (showCallModal && stream && myVideo.current) {
      myVideo.current.srcObject = stream;
      myVideo.current.onloadedmetadata = () => {
        myVideo.current?.play().catch((e) => console.error("Video play error:", e));
      };
    }
  }, [showCallModal, stream]);

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
// Update your callUser function to use the modal
const callUser = (id: string) => {
  resetCallState();
  
  if (!stream) {
    setError("No local stream available");
    return;
  }

  const targetUser = registeredUsers.find(u => u.socketId === id);
  if (!targetUser) return;

  setCallTarget(targetUser);
  setShowCallModal(true);
  setCallingStatus(`Calling ${targetUser.customId || targetUser.socketId.slice(0, 6)}...`);
  
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
    
    // Use a function that will retry until the video element is available
    const trySetStream = () => {
      if (userVideo.current) {
        userVideo.current.srcObject = currentStream;
        userVideo.current.onloadedmetadata = () => {
          userVideo.current?.play()
            .catch(e => console.error("Remote video play error:", e));
        };
      } else {
        // Retry after a short delay if element isn't available yet
        setTimeout(trySetStream, 100);
      }
    };
    
    trySetStream();
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
    setTimeout(() => {
      resetCallState();
      setShowCallModal(false);
    }, 2000);
  });

  peer.on("close", () => {
    console.log('closed');
    resetCallState();
    setShowCallModal(false);
  });

  connectionRef.current = peer;
};
// Update the answerCall function to show the call modal
const answerCall = () => {
  // Prevent ringtone from restarting
  setReceivingCall(false);
  stopIncomingRingtone();
  setShowCallModal(true);

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
    console.log('got stream');
    
    // Use a function that will retry until the video element is available
    const trySetStream = () => {
      if (userVideo.current) {
        userVideo.current.srcObject = currentStream;
        userVideo.current.onloadedmetadata = () => {
          userVideo.current?.play()
            .catch(e => console.error("Remote video play error:", e));
        };
      } else {
        // Retry after a short delay if element isn't available yet
        setTimeout(trySetStream, 100);
      }
    };
    
    trySetStream();
  });

  peer.on("connect", () => {
    setCallAccepted(true);
    setCallingStatus("");
  });

  peer.on("error", (err) => {
    console.error("Peer error:", err);
    setError("Call connection failed");
    resetCallState();
    setShowCallModal(false);
  });

  peer.on("close", () => {
    resetCallState();
    setShowCallModal(false);
  });

  peer.signal(callerSignal);
  connectionRef.current = peer;
};

// Update the rejectCall function
const rejectCall = () => {
  socket.emit("reject-call", { to: caller });
  resetCallState();
  setCallingStatus("");
};
  
  
  const endCall = () => {
    socket.emit("end-call");
    resetCallState();
  };

  return (
  <div className="max-w-4xl mx-auto p-6">
    {error && (
      <div className="flex items-center justify-between bg-red-100 text-red-800 border border-red-300 px-4 py-3 rounded mb-4">
        <span>{error}</span>
        <button onClick={() => setError(null)} className="text-lg font-bold">×</button>
      </div>
    )}

{isRegistered && welcomeMessage && (
  <div className="text-center mb-6">
    <h2 className="text-2xl font-bold text-gray-800">{welcomeMessage}</h2>
    <p className="text-gray-600">Select an option below to get started</p>
  </div>
)}

{callingStatus && (
  <div className="flex items-center justify-between bg-blue-100 text-blue-800 border border-blue-300 px-4 py-3 rounded mb-4">
    <span>{callingStatus}</span>
    {receivingCall ? (
      <div className="flex space-x-2">
        <button 
          onClick={rejectCall}
          className="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600"
        >
          Reject
        </button>
        <button 
          onClick={answerCall}
          className="px-3 py-1 bg-green-500 text-white rounded hover:bg-green-600"
        >
          Answer
        </button>
      </div>
    ) : (
      <button onClick={endCall} className="text-lg font-bold">×</button>
    )}
  </div>
)}
    {!isRegistered ? (
      <RegisterUsername registerUser={registerUser} customId={customId} setCustomId={setCustomId} />
    ) : (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
        {/* New Meeting Card */}
        <div 
          onClick={() => setShowNewMeetingModal(true)}
          className="flex flex-col items-center p-6 bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow cursor-pointer"
        >
          <div className="bg-blue-100 p-4 rounded-xl mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900">New Meeting</h3>
        </div>

        {/* Join Meeting Card */}
        <div 
          onClick={() => setShowJoinMeetingModal(true)}
          className="flex flex-col items-center p-6 bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow cursor-pointer"
        >
          <div className="bg-green-100 p-4 rounded-xl mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900">Join Meeting</h3>
        </div>

        {/* Record Screen Card */}
        <div 
          onClick={() => setShowRecordScreenModal(true)}
          className="flex flex-col items-center p-6 bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow cursor-pointer"
        >
          <div className="bg-purple-100 p-4 rounded-xl mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900">Record Screen</h3>
        </div>

        {/* Call a User Card */}
        <div 
          onClick={() => setShowCallUserModal(true)}
          className="flex flex-col items-center p-6 bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow cursor-pointer"
        >
          <div className="bg-red-100 p-4 rounded-xl mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900">Call a User</h3>
        </div>
      </div>
      )}
      {showNewMeetingModal && (
  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
    <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-xl font-bold text-gray-900">New Meeting</h3>
        <button 
          onClick={() => setShowNewMeetingModal(false)}
          className="text-gray-500 hover:text-gray-700"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div className="mb-6">
        <p className="text-gray-600">Create a new meeting and invite participants</p>
        {/* Placeholder for meeting creation form */}
        <div className="mt-4 p-4 bg-gray-100 rounded-lg">
          <p className="text-gray-500">Meeting creation form will go here</p>
        </div>
      </div>
      <div className="flex justify-end space-x-3">
        <button
          onClick={() => setShowNewMeetingModal(false)}
          className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          onClick={() => {
            console.log("New meeting created");
            setShowNewMeetingModal(false);
          }}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          Create Meeting
        </button>
      </div>
    </div>
  </div>
)}

{/* Join Meeting Modal */}
{showJoinMeetingModal && (
  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
    <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-xl font-bold text-gray-900">Join Meeting</h3>
        <button 
          onClick={() => setShowJoinMeetingModal(false)}
          className="text-gray-500 hover:text-gray-700"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div className="mb-6">
        <p className="text-gray-600">Enter the meeting ID to join</p>
        <div className="mt-4">
          <input
            type="text"
            placeholder="Meeting ID"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <input
            type="text"
            placeholder="Your name (optional)"
            className="w-full mt-3 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>
      <div className="flex justify-end space-x-3">
        <button
          onClick={() => setShowJoinMeetingModal(false)}
          className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          onClick={() => {
            console.log("Joining meeting");
            setShowJoinMeetingModal(false);
          }}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          Join
        </button>
      </div>
    </div>
  </div>
)}

{/* Record Screen Modal */}
{showRecordScreenModal && (
  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
    <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-xl font-bold text-gray-900">Record Screen</h3>
        <button 
          onClick={() => setShowRecordScreenModal(false)}
          className="text-gray-500 hover:text-gray-700"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div className="mb-6">
        <p className="text-gray-600">Record your screen, microphone, or both</p>
        <div className="mt-4 space-y-3">
          <div className="flex items-center">
            <input type="checkbox" id="record-screen" className="h-4 w-4 text-blue-600 focus:ring-blue-500" defaultChecked />
            <label htmlFor="record-screen" className="ml-2 text-gray-700">Screen</label>
          </div>
          <div className="flex items-center">
            <input type="checkbox" id="record-audio" className="h-4 w-4 text-blue-600 focus:ring-blue-500" defaultChecked />
            <label htmlFor="record-audio" className="ml-2 text-gray-700">Microphone</label>
          </div>
          <div className="flex items-center">
            <input type="checkbox" id="record-camera" className="h-4 w-4 text-blue-600 focus:ring-blue-500" />
            <label htmlFor="record-camera" className="ml-2 text-gray-700">Camera</label>
          </div>
        </div>
      </div>
      <div className="flex justify-end space-x-3">
        <button
          onClick={() => setShowRecordScreenModal(false)}
          className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          onClick={() => {
            startRecording();
            setShowRecordScreenModal(false);
          }}
          className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
        >
          Start Recording
        </button>
      </div>
    </div>
  </div>
)}

{/* Call User Modal */}
{showCallUserModal && (
  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
    <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-xl font-bold text-gray-900">Call a User</h3>
        <button 
          onClick={() => setShowCallUserModal(false)}
          className="text-gray-500 hover:text-gray-700"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div className="mb-6">
        <p className="text-gray-600">Select a user to call from the list</p>
        <div className="mt-4 max-h-60 overflow-y-auto">
          {registeredUsers.length > 0 ? (
            <ul className="divide-y divide-gray-200">
              {registeredUsers
                .filter(user => user.socketId !== me) // Filter out current user
                .map(user => (
                  <li key={user.socketId} className="py-3">
                    <button
                      onClick={() => {
                        setIdToCall(user.socketId);
                        callUser(user.socketId);
                        setShowCallUserModal(false);
                      }}
                      className="w-full text-left hover:bg-gray-50 p-2 rounded flex items-center"
                      disabled={user.inCall && user.inCallWith !== me}
                    >
                      <span className={`flex-1 ${user.inCall && user.inCallWith !== me ? 'text-gray-400' : 'text-gray-800'}`}>
                        {user.customId || user.socketId.slice(0, 6)}
                      </span>
                      {user.inCall && user.inCallWith !== me && (
                        <span className="text-xs text-gray-500">In call</span>
                      )}
                    </button>
                  </li>
                ))}
            </ul>
          ) : (
            <p className="text-gray-500 text-center py-4">No other users available</p>
          )}
        </div>
      </div>
      <div className="flex justify-end">
        <button
          onClick={() => setShowCallUserModal(false)}
          className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
        >
          Cancel
        </button>
      </div>
    </div>
  </div>
)}
{/* Call Modal */}
{/* Call Modal */}
{showCallModal && (
  <div className="fixed inset-0 bg-black z-50 flex flex-col">
    {/* Video Area */}
    <div className="flex-1 relative overflow-hidden">
      {/* Remote Video - Always rendered but hidden when not connected */}
      <video
        ref={userVideo}
        autoPlay
        playsInline
        muted={false}
        className={`absolute inset-0 w-full h-full object-contain bg-black ${callAccepted ? 'block' : 'hidden'}`}
      />
      
      {/* Fallback UI when not connected */}
      {!callAccepted && (
        <div className="absolute inset-0 flex flex-col items-center justify-center h-full text-white">
          <div className="w-32 h-32 rounded-full bg-gray-800 flex items-center justify-center mb-4">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-16 w-16 text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
              />
            </svg>
          </div>
          <h3 className="text-2xl font-semibold">
            {callTarget?.customId || callTarget?.socketId.slice(0, 6)}
          </h3>
          <p className="text-gray-400 mt-2">
            {callingStatus || "Connecting..."}
          </p>
        </div>
      )}

      {/* Local Video */}
      {stream && (
        <div className="absolute bottom-4 right-4 w-32 h-48 rounded-lg overflow-hidden bg-black border border-gray-700">
          <video
            ref={myVideo}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
          />
        </div>
      )}
    </div>

    {/* Control Panel */}
    <div className="bg-gray-900 bg-opacity-80 py-4 px-6 flex justify-center items-center">
      <div className="flex space-x-6 items-end"> {/* Added items-end to align at the bottom */}
        {/* Mute Button */}
        <div className="flex flex-col items-center">
          <button
            onClick={toggleMute}
            className={`flex items-center justify-center w-14 h-14 rounded-full ${isMuted ? 'bg-red-600 text-white' : 'bg-gray-700 text-white'}`}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              {isMuted ? (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
                  clipRule="evenodd"
                />
              ) : (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
                />
              )}
            </svg>
          </button>
          <span className="text-xs mt-2 text-white">{isMuted ? "Unmute" : "Mute"}</span>
        </div>

        {/* Video Button */}
        <div className="flex flex-col items-center">
          <button
            onClick={toggleVideo}
            className={`flex items-center justify-center w-14 h-14 rounded-full ${!isVideoOn ? 'bg-red-600 text-white' : 'bg-gray-700 text-white'}`}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
              />
            </svg>
          </button>
          <span className="text-xs mt-2 text-white">{isVideoOn ? "Stop Video" : "Start Video"}</span>
        </div>

        {/* End Call Button */}
        <div className="flex flex-col items-center">
          <button
            onClick={() => {
              endCall();
              setShowCallModal(false);
            }}
            className="flex items-center justify-center w-14 h-14 rounded-full bg-red-600 text-white"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.257-1.128a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.279 3H5z"
              />
            </svg>
          </button>
          <span className="text-xs mt-2 text-white">End Call</span>
        </div>
      </div>
    </div>
  </div>
)}
  </div>
);
  
};

export default VideoCall;