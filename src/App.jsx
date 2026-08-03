import React, { useCallback, useEffect, useState } from 'react';
import Lobby from './components/Lobby';
import Room from './components/Room';

export default function App() {
  const [userConfig, setUserConfig] = useState(null);
  // A ?room=xyz link should land the user in the lobby with the code prefilled,
  // so they still pick a name and check their camera before joining.
  const [invitedRoom, setInvitedRoom] = useState('');

  useEffect(() => {
    const room = new URLSearchParams(window.location.search).get('room');
    if (room) setInvitedRoom(room.trim().toLowerCase());
  }, []);

  const handleJoinRoom = useCallback((config) => {
    setUserConfig(config);
    window.history.pushState({}, '', `${window.location.pathname}?room=${config.roomId}`);
  }, []);

  const handleLeaveRoom = useCallback(() => {
    setUserConfig(null);
    window.history.pushState({}, '', window.location.pathname);
  }, []);

  return userConfig ? (
    // Keying on roomId guarantees a clean teardown/rebuild of the call engine
    // if the user ever switches rooms without a full reload.
    <Room key={userConfig.roomId} userConfig={userConfig} onLeaveRoom={handleLeaveRoom} />
  ) : (
    <Lobby invitedRoom={invitedRoom} onJoinRoom={handleJoinRoom} />
  );
}
