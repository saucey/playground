"use client";
import React, { useEffect, useRef, useState } from "react";
import io, { Socket } from "socket.io-client";
import Peer, { SignalData } from "simple-peer";

const socket: Socket = io("wss://video-call.devonauts.co.uk", {
  transports: ["websocket"],
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
});

const VideoCall: React.FC = () => {
  const [me, setMe] = useState<string>("");
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [receivingCall, setReceivingCall] = useState<boolean>(false);
  const [caller, setCaller] = useState<string>("");
  const [callerSignal, setCallerSignal] = useState<SignalData | null>(null);
  const [callAccepted, setCallAccepted] = useState<boolean>(false);
  const [idToCall, setIdToCall] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [calling, setCalling] = useState<boolean>(false);
  const [customId, setCustomId] = useState<string>("");
  const [registered, setRegistered] = useState<boolean>(false);

  const myVideo = useRef<HTMLVideoElement>(null);
  const userVideo = useRef<HTMLVideoElement>(null);
  const connectionRef = useRef<Peer.Instance | null>(null);

  const resetCallStates = () => {
    setCallAccepted(false);
    setReceivingCall(false);
    setCalling(false);
    setCaller("");
    setCallerSignal(null);
    if (userVideo.current) {
      userVideo.current.srcObject = null;
    }
  };

  const endCall = () => {
    if (connectionRef.current) {
      connectionRef.current.destroy();
      connectionRef.current = null;
    }
    if (callAccepted && me && caller) {
      socket.emit("end-call", { to: caller });
    }
    resetCallStates();
  };

  useEffect(() => {
    if (registered) {
      socket.connect();
    }

    return () => {
      socket.disconnect();
    };
  }, [registered]);

  useEffect(() => {
    if (!registered) return;

    socket.on("connect", () => {
      console.log("Connected as:", customId);
      setMe(customId);
      socket.emit("register-id", customId);
    });

    socket.on("connect_error", (err) => {
      console.error("Connection error:", err);
      setError("Connection failed. Please check your network.");
    });

    socket.on("user-not-found", ({ userToCall }) => {
      setError(`User ${userToCall} not found`);
      setCalling(false);
    });

    return () => {
      socket.off("connect");
      socket.off("connect_error");
      socket.off("user-not-found");
    };
  }, [registered, customId]);

  useEffect(() => {
    const setupMedia = async () => {
      try {
        const currentStream = await navigator.mediaDevices.getUserMedia({ 
          video: { facingMode: "user" },
          audio: true 
        });
        setStream(currentStream);
        if (myVideo.current) {
          myVideo.current.srcObject = currentStream;
        }
      } catch (err) {
        console.error("Failed to get media devices", err);
        setError("Could not access camera/microphone. Please check permissions.");
      }
    };

    if (registered) {
      setupMedia();

      socket.on("call-made", ({ from, signal }: { from: string; signal: SignalData }) => {
        if (!callAccepted && !calling) {
          setReceivingCall(true);
          setCaller(from);
          setCallerSignal(signal);
        }
      });

      socket.on("call-answered", (signal: SignalData) => {
        setCallAccepted(true);
        setCalling(false);
        if (connectionRef.current) {
          connectionRef.current.signal(signal);
        }
      });

      socket.on("call-ended", () => {
        endCall();
      });

      socket.on("user-disconnected", ({ userId }) => {
        if (callAccepted && caller === userId) {
          endCall();
          setError(`${userId} has disconnected`);
        }
      });

      return () => {
        socket.off("call-made");
        socket.off("call-answered");
        socket.off("call-ended");
        socket.off("user-disconnected");
      };
    }
  }, [registered, callAccepted, calling]);

  useEffect(() => {
    return () => {
      endCall();
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [stream]);

  const callUser = (id: string) => {
    if (!stream) {
      setError("No local stream available");
      return;
    }

    if (callAccepted || calling) {
      setError("Already in a call");
      return;
    }

    setCalling(true);
    setIdToCall(id);

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
      });
    });

    peer.on("stream", (currentStream: MediaStream) => {
      if (userVideo.current) {
        userVideo.current.srcObject = currentStream;
      }
    });

    peer.on("connect", () => {
      setCallAccepted(true);
      setCalling(false);
    });

    peer.on("close", endCall);
    peer.on("error", (err) => {
      console.error("Peer error:", err);
      setError("Call connection failed");
      endCall();
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
      setReceivingCall(false);
    });

    peer.on("close", endCall);
    peer.on("error", (err) => {
      console.error("Peer error:", err);
      setError("Call connection failed");
      endCall();
    });

    peer.signal(callerSignal);
    connectionRef.current = peer;
  };

  if (!registered) {
    return (
      <div className="p-4 max-w-md mx-auto">
        <h1 className="text-xl font-bold mb-2">Enter Test User ID</h1>
        <input
          type="text"
          placeholder="e.g., user1 or user2"
          value={customId}
          onChange={(e) => setCustomId(e.target.value)}
          className="border p-2 rounded mb-2 w-full"
        />
        <button
          onClick={() => {
            if (customId.trim()) setRegistered(true);
          }}
          className="bg-blue-500 text-white px-4 py-2 rounded w-full"
        >
          Register
        </button>
      </div>
    );
  }

  return (
    <div className="p-4 max-w-md mx-auto">
      <h1 className="text-xl font-bold mb-2">Video Calling App</h1>
      
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
          <button onClick={() => setError(null)} className="float-right font-bold">×</button>
        </div>
      )}

      <div className="flex gap-4">
        <video 
          playsInline 
          muted 
          ref={myVideo} 
          autoPlay 
          className="w-full rounded-lg border border-red-500"
          style={{ maxWidth: "200px" }}
        />
        <video 
          playsInline 
          ref={userVideo} 
          autoPlay 
          className="w-full rounded-lg border border-blue-500"
          style={{ maxWidth: "200px", display: callAccepted ? "block" : "none" }}
        />
      </div>

      <div className="mt-4">
        <p className="mb-2">Your ID: <span className="font-mono">{me}</span></p>
        <div className="flex flex-col space-y-2">
          <input
            type="text"
            placeholder="Enter ID to call"
            value={idToCall}
            onChange={(e) => setIdToCall(e.target.value)}
            className="border p-2 rounded"
            disabled={callAccepted || calling}
          />
          <button 
            onClick={() => callUser(idToCall)} 
            className="bg-blue-500 text-white px-4 py-2 rounded disabled:bg-blue-300"
            disabled={!me || !idToCall || callAccepted || calling}
          >
            {calling ? "Calling..." : "Call"}
          </button>
        </div>
      </div>

      {calling && (
        <div className="mt-4 p-3 bg-blue-100 rounded">
          <p className="text-blue-800">Calling {idToCall}...</p>
          <button 
            onClick={endCall}
            className="bg-red-500 text-white px-4 py-2 rounded mt-2 w-full"
          >
            Cancel Call
          </button>
        </div>
      )}

      {receivingCall && !callAccepted && (
        <div className="mt-4 p-3 bg-gray-100 rounded">
          <p className="mb-2">{caller} is calling you...</p>
          <div className="flex space-x-2">
            <button 
              onClick={answerCall} 
              className="bg-green-500 text-white px-4 py-2 rounded flex-1"
            >
              Answer
            </button>
            <button 
              onClick={endCall} 
              className="bg-red-500 text-white px-4 py-2 rounded flex-1"
            >
              Decline
            </button>
          </div>
        </div>
      )}

      {callAccepted && (
        <button 
          onClick={endCall}
          className="bg-red-500 text-white px-4 py-2 rounded mt-4 w-full"
        >
          End Call
        </button>
      )}
    </div>
  );
};

export default VideoCall;