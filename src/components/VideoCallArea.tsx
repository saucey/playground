"use client";
import React, { useEffect, useRef, useState } from "react";
import io, { Socket } from "socket.io-client";
import Peer, { SignalData } from "simple-peer";
import RegisterUsername from "./Register";

const VideoCallArea = ({userVideo, myVideo, callTarget, callAccepted, callingStatus, stream}) => {
  return (
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
  );
}



export default VideoCallArea;