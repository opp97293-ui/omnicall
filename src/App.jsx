import React, { useState, useEffect } from 'react';
import Lobby from './components/Lobby';
import Room from './components/Room';

export default function App() {
  const [userConfig, setUserConfig] = useState(null);

  // Check URL search params for direct room link (e.g. ?room=abc123)
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const roomParam = urlParams.get('room');
    if (roomParam) {
      // pre-fill room ID in lobby or handle appropriately
    }
  }, []);

  const handleJoinRoom = (config) => {
    setUserConfig(config);
    // Update URL query string without reloading page
    const newUrl = `${window.location.pathname}?room=${config.roomId}`;
    window.history.pushState({ path: newUrl }, '', newUrl);
  };

  const handleLeaveRoom = () => {
    setUserConfig(null);
    // Clear URL search param
    window.history.pushState({}, '', window.location.pathname);
  };

  return (
    <div className="w-full min-h-screen bg-[#0b0f19] text-slate-100 font-['Plus_Jakarta_Sans',sans-serif]">
      {userConfig ? (
        <Room userConfig={userConfig} onLeaveRoom={handleLeaveRoom} />
      ) : (
        <Lobby onJoinRoom={handleJoinRoom} />
      )}
    </div>
  );
}
