"use client";
import React, { useEffect, useRef, useState } from "react";
import io, { Socket } from "socket.io-client";
import Peer, { SignalData } from "simple-peer";
import RegisterUsername from "./Register";

const ControlPanel = ({isMuted, isVideoOn, toggleMute, toggleVideo, endCall, setShowCallModal}) => {
  return (
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
  );
}



export default ControlPanel;