"use client";
import React, { useEffect, useRef, useState } from "react";


const ShowRecordScreenModal = ({setShowRecordScreenModal, startRecording}) => {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
    <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-xl font-bold text-gray-900">Record Screen</h3>
        <button 
          onClick={() => setShowRecordScreenModal(false)}
          className="text-gray-500 hover:text-gray-700"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div className="mb-6">
        <p className="text-gray-600">Record your screen, microphone, or both</p>
        <div className="mt-4 space-y-3">
          <div className="flex items-center">
            <input type="checkbox" id="record-screen" className="h-4 w-4 text-blue-600 focus:ring-blue-500" defaultChecked />
            <label htmlFor="record-screen" className="ml-2 text-gray-700">Screen</label>
          </div>
          <div className="flex items-center">
            <input type="checkbox" id="record-audio" className="h-4 w-4 text-blue-600 focus:ring-blue-500" defaultChecked />
            <label htmlFor="record-audio" className="ml-2 text-gray-700">Microphone</label>
          </div>
          <div className="flex items-center">
            <input type="checkbox" id="record-camera" className="h-4 w-4 text-blue-600 focus:ring-blue-500" />
            <label htmlFor="record-camera" className="ml-2 text-gray-700">Camera</label>
          </div>
        </div>
      </div>
      <div className="flex justify-end space-x-3">
        <button
          onClick={() => setShowRecordScreenModal(false)}
          className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          onClick={() => {
            startRecording();
            setShowRecordScreenModal(false);
          }}
          className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
        >
          Start Recording
        </button>
      </div>
    </div>
  </div>
  );
}



export default ShowRecordScreenModal;