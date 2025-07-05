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
  const [callEnded, setCallEnded] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const myVideo = useRef<HTMLVideoElement>(null);
  const userVideo = useRef<HTMLVideoElement>(null);
  const connectionRef = useRef<Peer.Instance | null>(null);

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

    socket.on("call-answered", (signal: SignalData) => {
      setCallAccepted(true);
      if (connectionRef.current) {
        connectionRef.current.signal(signal);
      }
    });

    socket.on("call-ended", () => {
      endCall();
    });

    return () => {
      socket.off("connect");
      socket.off("connect_error");
      socket.off("call-made");
      socket.off("call-answered");
      socket.off("call-ended");

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

    setCallEnded(false);
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
      console.log("Caller peer connected");
      setCallAccepted(true);
    });

    peer.on("error", (err) => {
      console.error("Peer error:", err);
      setError("Call connection failed");
    });

    peer.on("close", () => {
      endCall();
    });

    socket.once("call-answered", (signal: SignalData) => {
      peer.signal(signal);
    });

    connectionRef.current = peer;
  };

  const answerCall = () => {
    if (!stream || !callerSignal) {
      setError("Cannot answer call: missing stream or signal");
      return;
    }

    setCallEnded(false);
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
      console.log("Callee peer connected");
      setCallAccepted(true);
    });

    peer.on("error", (err) => {
      console.error("Peer error:", err);
      setError("Call connection failed");
    });

    peer.on("close", () => {
      endCall();
    });

    peer.signal(callerSignal);
    connectionRef.current = peer;
  };

  const endCall = () => {
    setCallAccepted(false);
    setReceivingCall(false);
    setCallEnded(true);
    
    if (connectionRef.current) {
      connectionRef.current.destroy();
    }
    
    if (userVideo.current) {
      userVideo.current.srcObject = null;
    }
    
    socket.emit("end-call");
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
          className="w-full rounded-lg border border-gray-300"
          style={{ maxWidth: "200px" }}
        />
        <video 
          playsInline 
          ref={userVideo} 
          autoPlay 
          className="w-full rounded-lg border border-gray-300"
          style={{ maxWidth: "200px", display: callAccepted ? "block" : "none" }}
        />
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
            disabled={callAccepted}
          />
          <div className="flex space-x-2">
            <button 
              onClick={() => callUser(idToCall)} 
              className="bg-blue-500 text-white px-4 py-2 rounded flex-1 disabled:bg-blue-300"
              disabled={!me || !idToCall || callAccepted}
            >
              Call
            </button>
            {callAccepted && (
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
    </div>
  );
};

export default VideoCall;