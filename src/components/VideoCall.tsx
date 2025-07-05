"use client";
import React, { useEffect, useRef, useState } from "react";
import io, { Socket } from "socket.io-client";
import Peer, { SignalData } from "simple-peer";

// Use your computer's local IP or deployed server URL here
const socket: Socket = io("wss://s4w80gocwk0k4o04o4go840s.79.99.41.39.sslip.io", {
  transports: ["websocket"], // Force WebSocket for better mobile support
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

  const myVideo = useRef<HTMLVideoElement>(null);
  const userVideo = useRef<HTMLVideoElement>(null);
  const connectionRef = useRef<Peer.Instance | null>(null);

  useEffect(() => {
    const setupMedia = async () => {
      try {
        const currentStream = await navigator.mediaDevices.getUserMedia({ 
          video: { facingMode: "user" }, // Prefer front camera on mobile
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

    setupMedia();

    socket.on("connect", () => {
      console.log("Connected with ID:", socket.id);
      setMe(socket.id);
    });

    socket.on("connect_error", (err) => {
      console.error("Connection error:", err);
      setError("Connection failed. Please check your network.");
    });

    socket.on("call-made", ({ from, signal }: { from: string; signal: SignalData }) => {
      setReceivingCall(true);
      setCaller(from);
      setCallerSignal(signal);
    });

    return () => {
      // Cleanup
      socket.off("connect");
      socket.off("connect_error");
      socket.off("call-made");
      
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
      
      if (connectionRef.current) {
        connectionRef.current.destroy();
      }
    };
  }, []);

  const callUser = (id: string) => {
    if (!stream) {
      setError("No local stream available");
      return;
    }

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

    peer.on("error", (err) => {
      console.error("Peer error:", err);
      setError("Call connection failed");
    });

    socket.once("call-answered", (signal: SignalData) => {
      setCallAccepted(true);
      peer.signal(signal);
    });

    connectionRef.current = peer;
  };

  const answerCall = () => {
    if (!stream || !callerSignal) {
      setError("Cannot answer call: missing stream or signal");
      return;
    }

    setCallAccepted(true);

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

    peer.on("error", (err) => {
      console.error("Peer error:", err);
      setError("Call connection failed");
    });

    peer.signal(callerSignal);
    connectionRef.current = peer;
  };

  return (
    <div className="p-4 max-w-md mx-auto">
      <h1 className="text-xl font-bold mb-2">Video Calling App</h1>
      
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      <div className="flex gap-4">
        <video 
          playsInline 
          muted 
          ref={myVideo} 
          autoPlay 
          className="w-full rounded-lg"
          style={{ maxWidth: "200px" }}
        />
        {callAccepted && (
          <video 
            playsInline 
            ref={userVideo} 
            autoPlay 
            className="w-full rounded-lg"
            style={{ maxWidth: "200px" }}
          />
        )}
      </div>

      <div className="mt-4">
        <p className="mb-2">Your ID: {me || "Connecting..."}</p>
        <div className="flex flex-col space-y-2">
          <input
            type="text"
            placeholder="Enter ID to call"
            value={idToCall}
            onChange={(e) => setIdToCall(e.target.value)}
            className="border p-2 rounded"
          />
          <button 
            onClick={() => callUser(idToCall)} 
            className="bg-blue-500 text-white px-4 py-2 rounded disabled:bg-blue-300"
            disabled={!me || !idToCall}
          >
            Call
          </button>
        </div>
      </div>

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
              onClick={() => setReceivingCall(false)} 
              className="bg-red-500 text-white px-4 py-2 rounded flex-1"
            >
              Decline
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default VideoCall;