"use client";
import React, { useEffect, useRef, useState } from "react";
import io, { Socket } from "socket.io-client";
import Peer, { SignalData } from "simple-peer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
// import { Icons } from "@/components/icons";
import {
  Phone,
  Video,
  Mic,
  MicOff,
  PhoneOff,
  AlertCircle,
  X,
  UserPlus,
  VideoOff
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export const Icons = {
  videoOff: VideoOff,
  userPlus: UserPlus,
  x: X,
  alertCircle: AlertCircle,
  phone: Phone,
  video: Video,
  mic: Mic,
  micOff: MicOff,
  phoneOff: PhoneOff,
};

const SOCKET_URL = process.env.NODE_ENV === 'development' 
  ? "http://localhost:5555"
  : "wss://video-call.devonauts.co.uk";

const socket: Socket = io(SOCKET_URL, {
  transports: ["websocket"],
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
});

interface RegisteredUser {
  socketId: string;
  customId: string;
  inCall: boolean;
  inCallWith?: string;
}

export default function VideoCall() {
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

  const myVideo = useRef<HTMLVideoElement>(null);
  const userVideo = useRef<HTMLVideoElement>(null);
  const connectionRef = useRef<Peer.Instance | null>(null);

  const isCallButtonDisabled = () => {
    const targetUser = registeredUsers.find(u => u.socketId === idToCall);
    return !me || !idToCall || callAccepted || callingStatus !== "" || receivingCall || 
           (targetUser?.inCall && targetUser.inCallWith !== me);
  };

  const resetCallState = () => {
    setCallAccepted(false);
    setReceivingCall(false);
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

  // Initialize media stream with echo cancellation
  useEffect(() => {
    const setupMedia = async () => {
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user" },
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
    };
  }, []);

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

    socket.on("registration-error", (message: string) => {
      setError(message);
    });

    return () => {
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

  const registerUser = () => {
    if (!customId.trim()) {
      setError("Please enter a custom ID");
      return;
    }
    setError(null);
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
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' }
        ]
      }
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
        userVideo.current.play().catch(e => console.error("Remote video play error:", e));
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
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' }
        ]
      }
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
    <div className="container mx-auto p-4 max-w-4xl">
      <Card className="border-0 shadow-none sm:shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-2xl font-bold flex items-center gap-2">
            <Icons.video className="w-6 h-6" />
            Video Connect
          </CardTitle>
        </CardHeader>

        {error && (
          <Alert variant="destructive" className="mb-4">
            <Icons.alertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>
              {error}
              <Button variant="ghost" size="sm" onClick={() => setError(null)} className="ml-2">
                <Icons.x className="h-4 w-4" />
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {callingStatus && (
          <Alert className="mb-4">
            <Icons.phone className="h-4 w-4" />
            <AlertTitle>{callingStatus}</AlertTitle>
            <Button variant="ghost" size="sm" onClick={endCall} className="ml-2">
              <Icons.x className="h-4 w-4" />
            </Button>
          </Alert>
        )}

        <CardContent>
          {!isRegistered ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <h2 className="text-lg font-semibold">Register Your ID</h2>
                <div className="flex gap-2">
                  <Input
                    placeholder="Enter your display name"
                    value={customId}
                    onChange={(e) => setCustomId(e.target.value)}
                  />
                  <Button onClick={registerUser}>
                    <Icons.userPlus className="mr-2 h-4 w-4" />
                    Register
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div className="relative rounded-lg overflow-hidden bg-muted aspect-video">
                  <video 
                    playsInline 
                    muted
                    ref={myVideo} 
                    autoPlay 
                    className="w-full h-full object-cover"
                    style={{ 
                      transform: "scaleX(-1)",
                      backgroundColor: !isVideoOn ? "black" : "transparent"
                    }}
                  />
                  <div className="absolute bottom-2 left-2 flex gap-2">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button 
                          variant={isMuted ? "destructive" : "secondary"} 
                          size="icon" 
                          onClick={toggleMute}
                          className="rounded-full w-10 h-10"
                        >
                          {isMuted ? (
                            <Icons.micOff className="h-5 w-5" />
                          ) : (
                            <Icons.mic className="h-5 w-5" />
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        {isMuted ? "Unmute" : "Mute"}
                      </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button 
                          variant={!isVideoOn ? "destructive" : "secondary"} 
                          size="icon" 
                          onClick={toggleVideo}
                          className="rounded-full w-10 h-10"
                        >
                          {isVideoOn ? (
                            <Icons.video className="h-5 w-5" />
                          ) : (
                            <Icons.videoOff className="h-5 w-5" />
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        {isVideoOn ? "Turn off camera" : "Turn on camera"}
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <Badge variant="secondary" className="absolute top-2 left-2">
                    You
                  </Badge>
                </div>

                <div className="relative rounded-lg overflow-hidden bg-muted aspect-video">
                  <video 
                    playsInline 
                    ref={userVideo} 
                    autoPlay 
                    className="w-full h-full object-cover"
                    style={{ 
                      display: callAccepted ? "block" : "none",
                      backgroundColor: callAccepted ? "transparent" : "black"
                    }}
                  />
                  {callAccepted && (
                    <Badge variant="secondary" className="absolute top-2 left-2">
                      {registeredUsers.find(u => u.socketId === idToCall)?.customId || "Remote"}
                    </Badge>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="md:col-span-1">
                  <CardHeader className="pb-2">
                    <h3 className="font-semibold">Available Users</h3>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {registeredUsers.filter(u => u.socketId !== me).map(user => {
                        const isInCallWithMe = user.inCallWith === me;
                        const isInCallWithSomeoneElse = user.inCall && !isInCallWithMe;
                        
                        return (
                          <div
                            key={user.socketId} 
                            onClick={() => !isInCallWithSomeoneElse && setIdToCall(user.socketId)}
                            className={`p-3 rounded-lg flex items-center justify-between cursor-pointer transition-colors ${
                              isInCallWithSomeoneElse 
                                ? 'bg-muted opacity-70' 
                                : 'hover:bg-accent'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <Avatar className="h-8 w-8">
                                <AvatarFallback>
                                  {user.customId.charAt(0).toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                              <div>
                                <p className="font-medium">{user.customId}</p>
                                <p className="text-xs text-muted-foreground">
                                  {user.socketId.slice(0, 6)}
                                </p>
                              </div>
                            </div>
                            {isInCallWithMe && (
                              <Badge variant="success">In call</Badge>
                            )}
                            {isInCallWithSomeoneElse && (
                              <Badge variant="destructive">Busy</Badge>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>

                <Card className="md:col-span-2">
                  <CardHeader className="pb-2">
                    <h3 className="font-semibold">Call Controls</h3>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-sm">
                          Your ID: {customId}
                        </Badge>
                        <Badge variant="outline" className="text-sm">
                          {me.slice(0, 6)}
                        </Badge>
                      </div>

                      <div className="flex gap-2">
                        <Input
                          placeholder="Enter ID to call"
                          value={idToCall}
                          onChange={(e) => setIdToCall(e.target.value)}
                          disabled={callAccepted || callingStatus !== "" || receivingCall}
                        />
                        <Button 
                          onClick={() => callUser(idToCall)} 
                          disabled={isCallButtonDisabled()}
                        >
                          <Icons.phone className="mr-2 h-4 w-4" />
                          Call
                        </Button>
                      </div>

                      {receivingCall && !callAccepted && (
                        <div className="space-y-2">
                          <p className="text-sm">
                            {registeredUsers.find(u => u.socketId === caller)?.customId || caller.slice(0, 6)} is calling...
                          </p>
                          <div className="flex gap-2">
                            <Button 
                              onClick={answerCall}
                              className="flex-1"
                              variant="success"
                            >
                              <Icons.phone className="mr-2 h-4 w-4" />
                              Answer
                            </Button>
                            <Button 
                              onClick={rejectCall}
                              className="flex-1"
                              variant="destructive"
                            >
                              <Icons.phoneOff className="mr-2 h-4 w-4" />
                              Decline
                            </Button>
                          </div>
                        </div>
                      )}

                      {callAccepted && (
                        <Button 
                          onClick={endCall}
                          variant="destructive"
                          className="w-full"
                        >
                          <Icons.phoneOff className="mr-2 h-4 w-4" />
                          End Call
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}