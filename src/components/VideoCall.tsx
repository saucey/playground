"use client";
import React, { useEffect, useRef, useState } from "react";
import io, { Socket } from "socket.io-client";
import Peer, { SignalData } from "simple-peer";
import RegisterUsername from "./Register";
import ControlPanel from "./ControlPanel";
import VideoCallArea from "./VideoCallArea";
// import ShowCallUserModal from "./showCallUserModal";
import ShowJoinMeetingModal from "./ShowJoinMeetingModal";
import ShowRecordScreenModal from "./ShowRecordScreenModal";
import ShowNewMeetingModal from "./ShowNewMeetingModal";
import AppCards from "./AppCards";
import CallingStatus from "./CallingStatus";

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

interface MeetingRoom {
  id: string;
  name: string;
  createdBy: string;
  admin: string;
  participants: string[];
  createdAt: Date;
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
  
const [meetingRooms, setMeetingRooms] = useState<MeetingRoom[]>([]);
const [currentRoom, setCurrentRoom] = useState<MeetingRoom | null>(null);
const [showMeetingRooms, setShowMeetingRooms] = useState(false);
  
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

  socket.on("room-created", (room: MeetingRoom) => {
    setMeetingRooms(prev => [...prev, room]);
  });
  
  socket.on("rooms-updated", (rooms: MeetingRoom[]) => {
    setMeetingRooms(rooms);
  });
  
  socket.on("room-updated", (room: MeetingRoom) => {
    setCurrentRoom(room);
  });
  
  // Get existing rooms on load
  socket.emit("get-rooms");

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
    socket.off("room-created");
    socket.off("rooms-updated");
    socket.off("room-updated");
  };
}, [socket]);
  
  // Create room handler
const createMeetingRoom = (name: string) => {
  if (socket) {
    socket.emit("create-room", name);
    setShowNewMeetingModal(false);
  }
};

// Join room handler
const joinRoom = (roomId: string) => {
  if (socket) {
    socket.emit("join-room", roomId);
    setCurrentRoom(meetingRooms.find(r => r.id === roomId) || null);
  }
};

// Leave room handler
const leaveRoom = () => {
  if (socket && currentRoom) {
    socket.emit("leave-room", currentRoom.id);
    setCurrentRoom(null);
  }
};

// Render meeting room cards
const renderMeetingRooms = () => (
  <div className="mt-8">
    <h2 className="text-xl font-bold mb-4">Active Meetings</h2>
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {meetingRooms.map(room => {
        const creator = registeredUsers.find(u => u.socketId === room.createdBy);
        return (
          <div 
            key={room.id}
            className="border rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer"
            onClick={() => joinRoom(room.id)}
          >
            <h3 className="font-semibold">{room.name}</h3>
            <p className="text-sm text-gray-600">
              Created by: {creator?.customId || "Unknown"}
            </p>
            <p className="text-sm">
              Participants: {room.participants.length}
            </p>
            <p className="text-xs text-gray-500">
              {new Date(room.createdAt).toLocaleTimeString()}
            </p>
          </div>
        );
      })}
    </div>
  </div>
);

// Update the New Meeting modal to create rooms
const NewMeetingModal = () => (
  // ... existing modal structure ...
  <form onSubmit={(e) => {
    e.preventDefault();
    const roomName = (e.target as any).elements['meeting-title'].value;
    createMeetingRoom(roomName);
  }}>
    {/* ... form fields ... */}
  </form>
);

// Add room view component
const RoomView = () => (
  <div className="fixed inset-0 bg-black z-50 flex flex-col">
    <div className="p-4 bg-gray-800 text-white flex justify-between">
      <h2 className="text-xl font-bold">{currentRoom?.name}</h2>
      <button onClick={leaveRoom} className="text-red-500">Leave</button>
    </div>
    
    <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4 p-4">
      {/* Render local video */}
      <div className="bg-black rounded-lg overflow-hidden">
        <video
          ref={myVideo}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover"
        />
        <div className="absolute bottom-2 left-2 text-white bg-black bg-opacity-50 px-2 py-1 rounded">
          You
        </div>
      </div>
      
      {/* Render remote participants */}
      {currentRoom?.participants
        .filter(id => id !== me)
        .map(id => {
          const user = registeredUsers.find(u => u.socketId === id);
          return (
            <div key={id} className="bg-black rounded-lg overflow-hidden">
              <div className="w-full h-full flex items-center justify-center bg-gray-900">
                <span className="text-white">
                  {user?.customId || "Participant"}
                </span>
              </div>
              <div className="absolute bottom-2 left-2 text-white bg-black bg-opacity-50 px-2 py-1 rounded">
                {user?.customId || "Participant"}
              </div>
            </div>
          );
        })}
    </div>
    
    {/* Controls */}
    <div className="bg-gray-900 py-4 flex justify-center">
      <div className="flex space-x-4">
        {/* ... existing call controls ... */}
      </div>
    </div>
  </div>
);


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
  
  const stopOutgoingRingtone = () => {
    if (outgoingRingtoneRef.current) {
      outgoingRingtoneRef.current.pause();
      outgoingRingtoneRef.current.currentTime = 0;
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
        alert("Incoming call");
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
      <CallingStatus receivingCall={receivingCall} callingStatus={callingStatus} endCall={endCall} rejectCall={rejectCall} answerCall={answerCall} />
    )}
    {!isRegistered ? (
      <RegisterUsername registerUser={registerUser} customId={customId} setCustomId={setCustomId} />
    ) : (
      <AppCards setShowNewMeetingModal={setShowNewMeetingModal} setShowJoinMeetingModal={setShowJoinMeetingModal} setShowRecordScreenModal={setShowRecordScreenModal} setShowCallUserModal={setShowCallUserModal} />  
    )}

    {renderMeetingRooms()}
  
    {currentRoom && <RoomView />}

    {showNewMeetingModal && (
      <ShowNewMeetingModal setShowNewMeetingModal={setShowNewMeetingModal} createMeetingRoom={createMeetingRoom} />
      )}

      {/* Join Meeting Modal */}
      {showJoinMeetingModal && (
        <ShowJoinMeetingModal setShowJoinMeetingModal={setShowJoinMeetingModal} /> 
      )}

      {/* Record Screen Modal */}
      {showRecordScreenModal && (
        <ShowRecordScreenModal setShowRecordScreenModal={setShowRecordScreenModal} startRecording={startRecording} />
      )}

      {/* Call User Modal */}
      {showCallUserModal && (
        // <ShowCallUserModal registeredUsers={registeredUsers} setShowCallUserModal={setShowCallUserModal} setIdToCall={setIdToCall} callUser={callUser} me={me} />
      )}
      {/* Call Modal */}
      {showCallModal && (
        <div className="fixed inset-0 bg-black z-50 flex flex-col">
          <VideoCallArea userVideo={userVideo} myVideo={myVideo} callTarget={callTarget} callAccepted={callAccepted} callingStatus={callingStatus} stream={stream} />
          <ControlPanel isMuted={isMuted} isVideoOn={isVideoOn} toggleMute={toggleMute} toggleVideo={toggleVideo} endCall={endCall} setShowCallModal={setShowCallModal} />
        </div>
      )}
  </div>
);
  
};

export default VideoCall;