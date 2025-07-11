"use client";
import React, { useEffect, useRef, useState } from "react";

const CallingStatus = ({receivingCall, callingStatus, endCall, rejectCall, answerCall}) => {
  return (
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
  );
}



export default CallingStatus;