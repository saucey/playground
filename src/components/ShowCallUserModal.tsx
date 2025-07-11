"use client";
import React, { useEffect, useRef, useState } from "react";
import io, { Socket } from "socket.io-client";
import Peer, { SignalData } from "simple-peer";
import RegisterUsername from "./Register";

const ShowCallUserModal = ({registeredUsers, setShowCallUserModal, setIdToCall, callUser, me}) => {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
    <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-xl font-bold text-gray-900">Call a User</h3>
        <button 
          onClick={() => setShowCallUserModal(false)}
          className="text-gray-500 hover:text-gray-700"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div className="mb-6">
        <p className="text-gray-600">Select a user to call from the list</p>
        <div className="mt-4 max-h-60 overflow-y-auto">
          {registeredUsers.length > 0 ? (
            <ul className="divide-y divide-gray-200">
              {registeredUsers
                .filter(user => user.socketId !== me) // Filter out current user
                .map(user => (
                  <li key={user.socketId} className="py-3">
                    <button
                      onClick={() => {
                        setIdToCall(user.socketId);
                        callUser(user.socketId);
                        setShowCallUserModal(false);
                      }}
                      className="w-full text-left hover:bg-gray-50 p-2 rounded flex items-center"
                      disabled={user.inCall && user.inCallWith !== me}
                    >
                      <span className={`flex-1 ${user.inCall && user.inCallWith !== me ? 'text-gray-400' : 'text-gray-800'}`}>
                        {user.customId || user.socketId.slice(0, 6)}
                      </span>
                      {user.inCall && user.inCallWith !== me && (
                        <span className="text-xs text-gray-500">In call</span>
                      )}
                    </button>
                  </li>
                ))}
            </ul>
          ) : (
            <p className="text-gray-500 text-center py-4">No other users available</p>
          )}
        </div>
      </div>
      <div className="flex justify-end">
        <button
          onClick={() => setShowCallUserModal(false)}
          className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
        >
          Cancel
        </button>
      </div>
    </div>
  </div>
  );
}



export default ShowCallUserModal;