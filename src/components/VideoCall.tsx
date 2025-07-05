"use client";
import React, { useEffect, useRef, useState } from "react";
import io, { Socket } from "socket.io-client";
import Peer, { SignalData } from "simple-peer";

const SOCKET_URL =
  process.env.NODE_ENV! === "development"
    ? "wss://video-call.devonauts.co.uk"
    : "http://localhost:5555";

// Initialize the socket
const socket: Socket = io(SOCKET_URL, {
  transports: ["websocket"],
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
});

interface RegisteredUser {
  socketId: string;
  customId: string;
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
  const [callEnded, setCallEnded] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [callingStatus, setCallingStatus] = useState<string>("");

  const myVideo = useRef<HTMLVideoElement>(null);
  const userVideo = useRef<HTMLVideoElement>(null);
  const connectionRef = useRef<Peer.Instance | null>(null);

  const isCallButtonDisabled = () => {
    return !me || !idToCall || callAccepted || callingStatus !== "" || receivingCall;
  };

  const resetCallState = () => {
    setCallAccepted(false);
    setReceivingCall(false);
    setCallEnded(true);
    setCallingStatus("");
    setCaller("");
    setCallerSignal(null);
    
    if (connectionRef.current) {
      connectionRef.current.destroy();
      connectionRef.current = null;
    }
    
    if (userVideo.current) {
      userVideo.current.srcObject = null;
    }
  };

  // Initialize media stream and video element
  useEffect(() => {
    const setupMedia = async () => {
      try {
        const currentStream = await navigator.mediaDevices.getUserMedia({ 
          video: { facingMode: "user" },
          audio: true 
        });
        setStream(currentStream);
        
        // Directly assign stream to video element
        if (myVideo.current) {
          myVideo.current.srcObject = currentStream;
          myVideo.current.onloadedmetadata = () => {
            myVideo.current?.play().catch(e => console.error("Video play error:", e));
          };
        }
      } catch (err) {
        console.error("Failed to get media devices", err);
        setError("Could not access camera/microphone. Please check permissions.");
      }
    };

    setupMedia();

    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  // Fallback to ensure video element gets stream
  useEffect(() => {
    if (stream && myVideo.current && !myVideo.current.srcObject) {
      myVideo.current.srcObject = stream;
      myVideo.current.onloadedmetadata = () => {
        myVideo.current?.play().catch(e => console.error("Video play error:", e));
      };
    }
  }, [stream, myVideo.current]);

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
      }
    });

    socket.on("call-answered", (signal: SignalData) => {
      setCallAccepted(true);
      setCallingStatus("");
      if (connectionRef.current) {
        connectionRef.current.signal(signal);
      }
    });

    socket.on("call-rejected", () => {
      setCallingStatus("Call was rejected");
      setTimeout(() => resetCallState(), 2000);
    });

    socket.on("call-ended", () => {
      resetCallState();
    });

    return () => {
      socket.off("connect");
      socket.off("registered");
      socket.off("user-registered");
      socket.off("user-unregistered");
      socket.off("connect_error");
      socket.off("call-made");
      socket.off("call-answered");
      socket.off("call-rejected");
      socket.off("call-ended");
    };
  }, []);

  const registerUser = () => {
    if (!customId.trim()) {
      setError("Please enter a custom ID");
      return;
    }
    socket.emit("register", customId);
  };

  const callUser = (id: string) => {
    if (!stream) {
      setError("No local stream available");
      return;
    }

    resetCallState();
    setCallingStatus(`Calling ${registeredUsers.find(u => u.socketId === id)?.customId || id.slice(0, 6)}...`);
    
    const peer = new Peer({
      initiator: true,
      trickle: false,
      stream: stream,
    });

    peer.on("signal", (data: SignalData) => {
      socket.emit("call-user", {
        userToCall: id,
        signalData: data,
        from: me,
        customId: customId
      });
    });

    peer.on("stream", (currentStream: MediaStream) => {
      if (userVideo.current) {
        userVideo.current.srcObject = currentStream;
      }
    });

    peer.on("connect", () => {
      setCallAccepted(true);
      setCallingStatus("");
    });

    peer.on("error", (err) => {
      console.error("Peer error:", err);
      setError("Call connection failed");
      setCallingStatus("Call failed");
      setTimeout(() => resetCallState(), 2000);
    });

    peer.on("close", () => {
      resetCallState();
    });

    connectionRef.current = peer;
  };

  const answerCall = () => {
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
              disabled={!customId.trim()}
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
                muted 
                ref={myVideo} 
                autoPlay 
                className="w-full rounded-lg border border-gray-300"
                style={{ 
                  maxWidth: "200px",
                  display: "block",
                  transform: "scaleX(-1)" // Mirror effect
                }}
              />
              <div className="absolute bottom-2 left-2 bg-black bg-opacity-50 text-white px-2 py-1 rounded text-xs">
                You
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

          <div className="mb-4">
            <h2 className="text-lg font-semibold mb-2">Available Users</h2>
            <ul className="max-h-40 overflow-y-auto border rounded p-2">
              {registeredUsers.filter(u => u.socketId !== me).map(user => (
                <li 
                  key={user.socketId} 
                  className="p-2 hover:bg-gray-100 cursor-pointer flex justify-between items-center"
                  onClick={() => setIdToCall(user.socketId)}
                >
                  <span>{user.customId}</span>
                  <span className="text-xs text-gray-500">({user.socketId.slice(0, 6)})</span>
                </li>
              ))}
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
    </div>
  );
};

export default VideoCall;