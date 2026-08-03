// ---------------------------------------------------------------------------
// Lobby — name, avatar, device check, then create or join a room.
//
// The preview stream is stopped before handing off to Room: some phones only
// allow one open camera handle at a time, and leaving this one running is a
// classic cause of a black tile once the call starts.
// ---------------------------------------------------------------------------

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Video, Mic, MicOff, VideoOff, Settings, Sparkles, ArrowRight, ShieldCheck,
  Users, Globe2, RefreshCw, AlertCircle, Heart, Smartphone, Monitor, Tablet, SwitchCamera
} from 'lucide-react';
import { detectDeviceType, isHandheld, getVideoConstraints, AUDIO_CONSTRAINTS } from '../lib/webrtc';

const DEVICE_META = {
  mobile: { icon: Smartphone, label: 'Phone — portrait mode' },
  tablet: { icon: Tablet, label: 'Tablet' },
  desktop: { icon: Monitor, label: 'Desktop — widescreen' }
};

export default function Lobby({ onJoinRoom, invitedRoom = '' }) {
  const deviceType = useMemo(() => detectDeviceType(), []);
  const handheld = isHandheld(deviceType);
  const DeviceIcon = DEVICE_META[deviceType].icon;

  const [userName, setUserName] = useState(() => localStorage.getItem('omnicall_username') || '');
  const [roomIdInput, setRoomIdInput] = useState(invitedRoom);
  const [micOn, setMicOn] = useState(true);
  const [videoOn, setVideoOn] = useState(true);
  const [facingMode, setFacingMode] = useState('user');
  const [permissionError, setPermissionError] = useState(null);
  const [devices, setDevices] = useState({ audio: [], video: [] });
  const [showSettings, setShowSettings] = useState(false);
  const [avatarSeed, setAvatarSeed] = useState(
    () => localStorage.getItem('omnicall_avatar') || Math.random().toString(36).slice(2, 8)
  );

  const streamRef = useRef(null);
  const videoRef = useRef(null);

  const avatarUrl = `https://api.dicebear.com/7.x/bottts/svg?seed=${avatarSeed}`;

  useEffect(() => {
    if (invitedRoom) setRoomIdInput(invitedRoom);
  }, [invitedRoom]);

  const startPreview = async (mode = facingMode) => {
    setPermissionError(null);
    streamRef.current?.getTracks().forEach((t) => t.stop());

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: getVideoConstraints(deviceType, mode),
        audio: AUDIO_CONSTRAINTS
      });
      streamRef.current = stream;
      stream.getAudioTracks().forEach((t) => { t.enabled = micOn; });
      stream.getVideoTracks().forEach((t) => { t.enabled = videoOn; });
      if (videoRef.current) videoRef.current.srcObject = stream;

      const list = await navigator.mediaDevices.enumerateDevices();
      setDevices({
        audio: list.filter((d) => d.kind === 'audioinput'),
        video: list.filter((d) => d.kind === 'videoinput')
      });
    } catch (err) {
      console.warn('[lobby] preview failed', err);
      setPermissionError(
        err?.name === 'NotAllowedError'
          ? 'Camera/mic blocked. Allow permission from the browser address bar, then retry.'
          : 'No camera found. You can still join with audio only.'
      );
    }
  };

  useEffect(() => {
    startPreview();
    return () => streamRef.current?.getTracks().forEach((t) => t.stop());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleMic = () => {
    const next = !micOn;
    streamRef.current?.getAudioTracks().forEach((t) => { t.enabled = next; });
    setMicOn(next);
  };

  const toggleVideo = () => {
    const next = !videoOn;
    streamRef.current?.getVideoTracks().forEach((t) => { t.enabled = next; });
    setVideoOn(next);
  };

  const flipPreview = () => {
    const next = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(next);
    startPreview(next);
  };

  const randomizeAvatar = () => {
    const seed = Math.random().toString(36).slice(2, 8);
    setAvatarSeed(seed);
    localStorage.setItem('omnicall_avatar', seed);
  };

  const enterRoom = (roomId) => {
    localStorage.setItem('omnicall_username', userName.trim());
    // Release the camera so Room can reopen it cleanly.
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    onJoinRoom({ roomId, userName: userName.trim(), avatar: avatarUrl, micOn, videoOn });
  };

  const createRoom = (e) => {
    e.preventDefault();
    if (!userName.trim()) return setPermissionError('Please enter your name first.');
    enterRoom(Math.random().toString(36).slice(2, 8));
  };

  const joinRoom = (e) => {
    e.preventDefault();
    if (!userName.trim()) return setPermissionError('Please enter your name first.');
    if (!roomIdInput.trim()) return setPermissionError('Enter the room code your partner shared.');
    enterRoom(roomIdInput.trim().toLowerCase());
  };

  return (
    <div className="relative flex min-h-screen flex-col items-center overflow-x-hidden px-4 py-6 sm:px-6">
      <div className="pointer-events-none absolute left-1/4 top-1/4 h-[420px] w-[420px] animate-pulse-slow rounded-full bg-pink-600/20 blur-[120px]" />
      <div className="pointer-events-none absolute bottom-1/4 right-1/4 h-[420px] w-[420px] animate-pulse-slow rounded-full bg-purple-600/20 blur-[120px]" />

      {/* Header */}
      <header className="z-10 mb-6 flex w-full max-w-5xl items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl bg-gradient-to-tr from-pink-500 via-purple-500 to-indigo-600 p-2.5 shadow-lg shadow-pink-500/30">
            <Heart className="h-5 w-5 fill-white text-white" />
          </div>
          <div>
            <h1 className="bg-gradient-to-r from-pink-300 via-purple-200 to-indigo-200 bg-clip-text text-xl font-extrabold text-transparent sm:text-2xl">
              OmniCall
            </h1>
            <p className="text-[11px] font-semibold text-pink-300/70">Video calling, made for couples</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 rounded-full border border-pink-500/30 bg-white/5 px-3 py-1.5 text-[11px] font-semibold text-pink-200">
          <DeviceIcon className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{DEVICE_META[deviceType].label}</span>
        </div>
      </header>

      {permissionError && (
        <div className="z-10 mb-4 flex w-full max-w-5xl items-center justify-between gap-3 rounded-2xl border border-pink-500/40 bg-pink-500/15 p-3 text-xs text-pink-100">
          <span className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-pink-400" />
            {permissionError}
          </span>
          <button
            onClick={() => startPreview()}
            className="flex shrink-0 items-center gap-1.5 rounded-lg bg-pink-500 px-3 py-1.5 font-bold text-white hover:bg-pink-400"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Retry
          </button>
        </div>
      )}

      <div className="z-10 grid w-full max-w-5xl flex-1 grid-cols-1 items-center gap-6 lg:grid-cols-12">
        {/* Camera preview — portrait frame on phones, widescreen on desktop */}
        <div className="flex flex-col gap-3 lg:col-span-7">
          <div
            className="relative mx-auto w-full overflow-hidden rounded-3xl border border-pink-500/20 bg-[#120722] shadow-2xl"
            style={{ aspectRatio: handheld ? '3 / 4' : '16 / 9', maxWidth: handheld ? '360px' : undefined }}
          >
            {videoOn ? (
              <video ref={videoRef} autoPlay playsInline webkit-playsinline="true" muted className="h-full w-full -scale-x-100 object-cover" />
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-[#130b21]">
                <img src={avatarUrl} alt="Avatar" className="h-20 w-20 rounded-full border border-pink-500/40 bg-[#0d0518] p-2" />
                <p className="text-sm text-pink-200/70">Camera is off</p>
              </div>
            )}

            <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-2xl border border-white/15 bg-black/50 p-2 backdrop-blur-xl">
              <PreviewBtn on={micOn} onClick={toggleMic} OnIcon={Mic} OffIcon={MicOff} />
              <PreviewBtn on={videoOn} onClick={toggleVideo} OnIcon={Video} OffIcon={VideoOff} />
              {handheld && (
                <button onClick={flipPreview} className="rounded-xl bg-purple-950/80 p-3 text-pink-200 hover:bg-purple-900" title="Flip camera">
                  <SwitchCamera className="h-5 w-5" />
                </button>
              )}
              <button
                onClick={() => setShowSettings((s) => !s)}
                className="rounded-xl bg-purple-950/80 p-3 text-pink-200 hover:bg-purple-900"
                title="Devices"
              >
                <Settings className="h-5 w-5" />
              </button>
            </div>

            <div className="absolute left-4 top-4 flex items-center gap-1.5 rounded-full border border-pink-500/30 bg-black/50 px-3 py-1 text-[11px] font-semibold text-pink-100 backdrop-blur-md">
              <span className="h-2 w-2 animate-pulse rounded-full bg-pink-400" />
              Live preview
            </div>
          </div>

          {showSettings && (
            <div className="animate-fade-in grid grid-cols-1 gap-3 rounded-2xl border border-pink-500/30 bg-white/5 p-4 text-xs sm:grid-cols-2">
              <DeviceSelect label="Microphone" items={devices.audio} fallback="Default mic" />
              <DeviceSelect label="Camera" items={devices.video} fallback="Default camera" />
            </div>
          )}
        </div>

        {/* Join card */}
        <div className="flex flex-col gap-5 rounded-3xl border border-white/15 bg-[#150a29]/70 p-6 shadow-2xl backdrop-blur-xl lg:col-span-5">
          <div>
            <h2 className="text-xl font-extrabold text-white">Ready to connect?</h2>
            <p className="mt-1 text-sm text-pink-200/70">Works across phone, tablet and desktop.</p>
          </div>

          <div className="flex items-center gap-3 rounded-2xl border border-pink-500/20 bg-white/5 p-3">
            <div className="relative shrink-0">
              <img src={avatarUrl} alt="Avatar" className="h-14 w-14 rounded-2xl border border-pink-500/40 bg-[#170a2c] p-1" />
              <button
                onClick={randomizeAvatar}
                className="absolute -bottom-1 -right-1 rounded-full bg-gradient-to-r from-pink-500 to-purple-600 p-1.5 text-white shadow-md transition-transform hover:scale-110"
                title="New avatar"
              >
                <RefreshCw className="h-3 w-3" />
              </button>
            </div>
            <div className="min-w-0 flex-1">
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-pink-300">Your name</label>
              <input
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                placeholder="e.g. Aarav"
                className="w-full bg-transparent text-base font-semibold text-white placeholder-purple-300/40 focus:outline-none"
              />
            </div>
          </div>

          <button
            onClick={createRoom}
            className="btn-lovable-primary flex w-full items-center justify-center gap-3 rounded-2xl px-6 py-4 text-base font-bold text-white shadow-xl"
          >
            <Sparkles className="h-5 w-5" />
            Start instant call
            <ArrowRight className="ml-auto h-5 w-5" />
          </button>

          <div className="relative flex items-center justify-center">
            <div className="w-full border-t border-white/10" />
            <span className="absolute bg-[#150a29] px-3 text-[10px] font-bold uppercase tracking-wider text-pink-300/60">
              or join with code
            </span>
          </div>

          <form onSubmit={joinRoom} className="flex gap-2">
            <input
              value={roomIdInput}
              onChange={(e) => setRoomIdInput(e.target.value)}
              placeholder="Room code"
              className="min-w-0 flex-1 rounded-xl border border-purple-800/70 bg-[#170a2c]/90 px-4 py-3 text-sm text-white placeholder-purple-300/40 focus:border-pink-500 focus:outline-none"
            />
            <button
              type="submit"
              className="shrink-0 rounded-xl border border-pink-500/30 bg-white/5 px-5 py-3 text-sm font-semibold text-pink-300 hover:bg-white/10 hover:text-white"
            >
              Join
            </button>
          </form>

          <div className="grid grid-cols-3 gap-2 border-t border-white/10 pt-3 text-center">
            <Feature icon={ShieldCheck} tone="text-pink-400" label="P2P encrypted" />
            <Feature icon={Users} tone="text-purple-400" label="Any device" />
            <Feature icon={Globe2} tone="text-indigo-400" label="Zero setup" />
          </div>
        </div>
      </div>
    </div>
  );
}

function PreviewBtn({ on, onClick, OnIcon, OffIcon }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-xl p-3 transition-all ${on ? 'bg-purple-950/80 text-white hover:bg-purple-900' : 'bg-rose-500 text-white shadow-lg shadow-rose-500/40'}`}
    >
      {on ? <OnIcon className="h-5 w-5" /> : <OffIcon className="h-5 w-5" />}
    </button>
  );
}

function DeviceSelect({ label, items, fallback }) {
  return (
    <div>
      <label className="mb-1 block text-purple-200/70">{label}</label>
      <select className="w-full rounded-xl border border-purple-800/80 bg-[#180d2e] p-2.5 text-pink-100 focus:border-pink-500 focus:outline-none">
        {items.length === 0 && <option>{fallback}</option>}
        {items.map((d) => (
          <option key={d.deviceId} value={d.deviceId}>
            {d.label || `${label} ${d.deviceId.slice(0, 5)}`}
          </option>
        ))}
      </select>
    </div>
  );
}

function Feature({ icon: Icon, tone, label }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-2.5">
      <Icon className={`mx-auto mb-1 h-4 w-4 ${tone}`} />
      <span className="text-[10px] font-semibold text-pink-200/70">{label}</span>
    </div>
  );
}
