"use client";
import React, { useEffect, useRef, useState } from "react";


const RoomView = ({currentRoom, myVideoRoom, leaveRoom, registeredUsers, me, roomVideoReady}) => {
  return (
   // Add room view component
  <div className="fixed inset-0 bg-black z-50 flex flex-col">
    <div className="p-4 bg-gray-800 text-white flex justify-between">
      <h2 className="text-xl font-bold">{currentRoom?.name}</h2>
      <button onClick={leaveRoom} className="text-red-500">Leave</button>
    </div>
    
    <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4 p-4">
      {/* Render local video */}
      <div className="bg-black rounded-lg overflow-hidden border border-red-700">
        <video
          ref={myVideoRoom}
          autoPlay
          playsInline
          muted={false}
          className="w-full h-full object-cover"
        />
        <div className="absolute bottom-2 left-2 text-white bg-black bg-opacity-50 px-2 py-1 rounded">
          You
        </div>
      
        {!roomVideoReady && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
              <span className="text-white">Setting up your video...</span>
            </div>
        )}
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
}



export default RoomView;