import React, { useState, useEffect, useRef } from 'react';
import { 
  Video, Mic, MicOff, VideoOff, Settings, Sparkles, 
  ArrowRight, ShieldCheck, Users, Radio, Globe2, RefreshCw, AlertCircle, Heart
} from 'lucide-react';

export default function Lobby({ onJoinRoom }) {
  const [userName, setUserName] = useState(() => localStorage.getItem('omnicall_username') || '');
  const [roomIdInput, setRoomIdInput] = useState('');
  const [micOn, setMicOn] = useState(true);
  const [videoOn, setVideoOn] = useState(true);
  const [stream, setStream] = useState(null);
  const [permissionError, setPermissionError] = useState(null);
  const [devices, setDevices] = useState({ audio: [], video: [] });
  const [selectedAudio, setSelectedAudio] = useState('');
  const [selectedVideo, setSelectedVideo] = useState('');
  const [avatarSeed, setAvatarSeed] = useState(() => localStorage.getItem('omnicall_avatar') || Math.random().toString(36).substring(7));
  const [showSettings, setShowSettings] = useState(false);

  const localVideoRef = useRef(null);

  const randomizeAvatar = () => {
    const newSeed = Math.random().toString(36).substring(7);
    setAvatarSeed(newSeed);
    localStorage.setItem('omnicall_avatar', newSeed);
  };

  const avatarUrl = `https://api.dicebear.com/7.x/bottts/svg?seed=${avatarSeed}`;

  const requestMedia = async () => {
    setPermissionError(null);
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280, max: 1920 },
          height: { ideal: 720, max: 1080 },
          frameRate: { ideal: 30 }
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      setStream(mediaStream);
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = mediaStream;
      }

      const deviceInfos = await navigator.mediaDevices.enumerateDevices();
      const audioDevs = deviceInfos.filter(d => d.kind === 'audioinput');
      const videoDevs = deviceInfos.filter(d => d.kind === 'videoinput');
      setDevices({ audio: audioDevs, video: videoDevs });
      if (audioDevs.length > 0) setSelectedAudio(audioDevs[0].deviceId);
      if (videoDevs.length > 0) setSelectedVideo(videoDevs[0].deviceId);

    } catch (err) {
      console.warn('Camera/Microphone permission denied:', err);
      setPermissionError('Camera or Microphone permission is blocked. Please allow browser access to continue in HD.');
    }
  };

  useEffect(() => {
    requestMedia();
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const toggleMic = () => {
    if (stream) {
      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack) audioTrack.enabled = !micOn;
    }
    setMicOn(!micOn);
  };

  const toggleVideo = () => {
    if (stream) {
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) videoTrack.enabled = !videoOn;
    }
    setVideoOn(!videoOn);
  };

  const handleCreateRoom = (e) => {
    e.preventDefault();
    if (!userName.trim()) return alert('Please enter your name!');
    localStorage.setItem('omnicall_username', userName);
    const newRoomId = Math.random().toString(36).substring(2, 8);
    onJoinRoom({
      roomId: newRoomId,
      userName: userName.trim(),
      avatar: avatarUrl,
      micOn,
      videoOn
    });
  };

  const handleJoinExistingRoom = (e) => {
    e.preventDefault();
    if (!userName.trim()) return alert('Please enter your name!');
    if (!roomIdInput.trim()) return alert('Please enter a valid Room Code!');
    localStorage.setItem('omnicall_username', userName);
    onJoinRoom({
      roomId: roomIdInput.trim().toLowerCase(),
      userName: userName.trim(),
      avatar: avatarUrl,
      micOn,
      videoOn
    });
  };

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center p-4 md:p-8 overflow-hidden">
      
      {/* Lovable Vibrant Ambient Glows */}
      <div className="absolute top-1/4 left-1/4 w-[450px] h-[450px] bg-pink-600/25 rounded-full blur-[120px] pointer-events-none animate-pulse-slow"></div>
      <div className="absolute bottom-1/4 right-1/4 w-[450px] h-[450px] bg-purple-600/25 rounded-full blur-[120px] pointer-events-none animate-pulse-slow"></div>

      {/* Header */}
      <header className="absolute top-6 left-6 right-6 flex items-center justify-between max-w-7xl mx-auto z-20">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-gradient-to-tr from-pink-500 via-purple-500 to-indigo-600 rounded-2xl shadow-lg shadow-pink-500/30">
            <Heart className="w-6 h-6 text-white fill-white animate-pulse" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight bg-gradient-to-r from-pink-300 via-purple-200 to-indigo-200 bg-clip-text text-transparent">
              OmniCall
            </h1>
            <p className="text-xs text-pink-300/80 font-semibold tracking-wide">Next-Gen Lovable HD Platform</p>
          </div>
        </div>

        <div className="flex items-center gap-2 px-4 py-2 rounded-full glass-panel text-xs text-pink-300 font-semibold border border-pink-500/30 shadow-lg shadow-pink-500/10">
          <span className="w-2.5 h-2.5 rounded-full bg-pink-500 animate-ping"></span>
          <span>Lovable WebRTC HD</span>
        </div>
      </header>

      {/* Permission Warning */}
      {permissionError && (
        <div className="w-full max-w-4xl mb-4 mt-20 lg:mt-0 p-4 rounded-2xl bg-pink-500/20 border border-pink-500/40 text-pink-200 text-xs flex items-center justify-between z-30 shadow-xl">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-pink-400 flex-shrink-0" />
            <span>{permissionError}</span>
          </div>
          <button
            onClick={requestMedia}
            className="px-3 py-1.5 bg-pink-500 text-white font-bold rounded-lg hover:bg-pink-400 transition-colors flex items-center gap-1.5 shadow-md"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Allow Camera & Mic
          </button>
        </div>
      )}

      {/* Main Form Grid */}
      <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-12 gap-8 my-auto pt-20 lg:pt-0">
        
        {/* Left Column: HD Camera Preview */}
        <div className="lg:col-span-7 flex flex-col gap-4">
          <div className="relative w-full aspect-video rounded-3xl glass-panel overflow-hidden border border-white/15 shadow-2xl group border-pink-500/20">
            {videoOn ? (
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover transform -scale-x-100"
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center bg-[#130b21]/90 gap-4">
                <img src={avatarUrl} alt="Avatar" className="w-24 h-24 rounded-full p-2 glass-panel border border-pink-500/40 shadow-xl shadow-pink-500/20" />
                <p className="text-sm text-pink-200/70 font-medium">Camera is turned off</p>
              </div>
            )}

            {/* Video overlay controls */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-3 p-2 rounded-2xl glass-panel border border-white/15 shadow-2xl backdrop-blur-xl">
              <button
                type="button"
                onClick={toggleMic}
                className={`p-3 rounded-xl transition-all ${
                  micOn 
                    ? 'bg-purple-950/80 text-white hover:bg-purple-900' 
                    : 'bg-rose-500 text-white shadow-lg shadow-rose-500/40'
                }`}
                title={micOn ? "Mute Microphone" : "Unmute Microphone"}
              >
                {micOn ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
              </button>

              <button
                type="button"
                onClick={toggleVideo}
                className={`p-3 rounded-xl transition-all ${
                  videoOn 
                    ? 'bg-purple-950/80 text-white hover:bg-purple-900' 
                    : 'bg-rose-500 text-white shadow-lg shadow-rose-500/40'
                }`}
                title={videoOn ? "Turn off Camera" : "Turn on Camera"}
              >
                {videoOn ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
              </button>

              <button
                type="button"
                onClick={() => setShowSettings(!showSettings)}
                className="p-3 rounded-xl bg-purple-950/80 text-pink-200 hover:text-white hover:bg-purple-900 transition-all"
                title="Device Settings"
              >
                <Settings className="w-5 h-5" />
              </button>
            </div>

            <div className="absolute top-4 left-4 px-3.5 py-1.5 rounded-full glass-panel text-xs font-semibold text-pink-100 flex items-center gap-2 border border-pink-500/30">
              <span className="w-2 h-2 rounded-full bg-pink-400 animate-pulse"></span>
              Live HD Camera Preview
            </div>
          </div>

          {/* Settings Drawer */}
          {showSettings && (
            <div className="p-4 rounded-2xl glass-card border border-pink-500/30 text-xs flex flex-col gap-3 animate-fade-in shadow-xl">
              <h4 className="font-semibold text-pink-300 flex items-center gap-2">
                <Settings className="w-4 h-4" /> Hardware Device Setup
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-purple-200/70 block mb-1">Microphone</label>
                  <select 
                    value={selectedAudio} 
                    onChange={e => setSelectedAudio(e.target.value)}
                    className="w-full bg-[#180d2e] border border-purple-800/80 rounded-xl p-2.5 text-pink-100 focus:outline-none focus:border-pink-500"
                  >
                    {devices.audio.map(d => (
                      <option key={d.deviceId} value={d.deviceId}>{d.label || `Mic ${d.deviceId.slice(0,5)}`}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-purple-200/70 block mb-1">Camera</label>
                  <select 
                    value={selectedVideo} 
                    onChange={e => setSelectedVideo(e.target.value)}
                    className="w-full bg-[#180d2e] border border-purple-800/80 rounded-xl p-2.5 text-pink-100 focus:outline-none focus:border-pink-500"
                  >
                    {devices.video.map(d => (
                      <option key={d.deviceId} value={d.deviceId}>{d.label || `Camera ${d.deviceId.slice(0,5)}`}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Lovable Form Card */}
        <div className="lg:col-span-5 flex flex-col justify-center gap-6">
          <div className="p-6 md:p-8 rounded-3xl glass-panel border border-white/15 shadow-2xl flex flex-col gap-6 relative overflow-hidden">
            
            <div className="absolute top-0 right-0 w-32 h-32 bg-pink-500/10 rounded-full blur-2xl pointer-events-none"></div>

            <div>
              <h2 className="text-2xl font-extrabold text-white tracking-tight">Ready to connect?</h2>
              <p className="text-sm text-pink-200/70 mt-1">Start or join a high quality encrypted video call.</p>
            </div>

            {/* Profile Avatar & Name */}
            <div className="flex items-center gap-4 p-3.5 rounded-2xl glass-card border border-pink-500/20">
              <div className="relative">
                <img src={avatarUrl} alt="Avatar" className="w-14 h-14 rounded-2xl bg-[#170a2c] border border-pink-500/40 p-1 shadow-lg" />
                <button
                  type="button"
                  onClick={randomizeAvatar}
                  className="absolute -bottom-1 -right-1 p-1.5 bg-gradient-to-r from-pink-500 to-purple-600 text-white rounded-full hover:scale-110 shadow-md transition-transform"
                  title="Randomize Avatar"
                >
                  <RefreshCw className="w-3 h-3" />
                </button>
              </div>
              <div className="flex-1">
                <label className="text-[11px] font-bold text-pink-300 uppercase tracking-wider block mb-1">Display Name</label>
                <input
                  type="text"
                  placeholder="Enter your name (e.g. Alex)"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  className="w-full bg-transparent text-white font-semibold focus:outline-none placeholder-purple-300/40 text-base"
                />
              </div>
            </div>

            {/* Lovable CTA Action */}
            <div className="flex flex-col gap-3">
              <button
                onClick={handleCreateRoom}
                className="w-full py-4 px-6 rounded-2xl btn-lovable-primary text-white font-bold text-base shadow-xl flex items-center justify-center gap-3"
              >
                <Sparkles className="w-5 h-5 text-pink-200" />
                <span>Start Instant Meeting</span>
                <ArrowRight className="w-5 h-5 ml-auto" />
              </button>

              <div className="relative flex items-center justify-center my-2">
                <div className="border-t border-white/10 w-full"></div>
                <span className="bg-[#120824] px-3 text-[11px] text-pink-300/60 uppercase tracking-wider font-bold">Or join with code</span>
              </div>

              {/* Join Form */}
              <form onSubmit={handleJoinExistingRoom} className="flex gap-2">
                <input
                  type="text"
                  placeholder="Enter 6-char Room Code"
                  value={roomIdInput}
                  onChange={(e) => setRoomIdInput(e.target.value)}
                  className="flex-1 bg-[#170a2c]/90 border border-purple-800/80 focus:border-pink-500 rounded-xl px-4 py-3 text-white text-sm focus:outline-none placeholder-purple-300/40"
                />
                <button
                  type="submit"
                  className="px-5 py-3 rounded-xl glass-button text-pink-300 font-semibold text-sm hover:text-white flex items-center gap-2 border border-pink-500/30"
                >
                  Join
                </button>
              </form>
            </div>

            {/* Features */}
            <div className="grid grid-cols-3 gap-2 pt-2 border-t border-white/10 text-center">
              <div className="p-2.5 rounded-2xl glass-card">
                <ShieldCheck className="w-4 h-4 text-pink-400 mx-auto mb-1" />
                <span className="text-[10px] text-pink-200/70 font-semibold">P2P Encrypted</span>
              </div>
              <div className="p-2.5 rounded-2xl glass-card">
                <Users className="w-4 h-4 text-purple-400 mx-auto mb-1" />
                <span className="text-[10px] text-pink-200/70 font-semibold">Multi-user HD</span>
              </div>
              <div className="p-2.5 rounded-2xl glass-card">
                <Globe2 className="w-4 h-4 text-indigo-400 mx-auto mb-1" />
                <span className="text-[10px] text-pink-200/70 font-semibold">Zero Setup</span>
              </div>
            </div>

          </div>
        </div>

      </div>

      <footer className="mt-auto py-4 text-xs text-pink-300/60 font-medium flex items-center gap-2">
        <span>Crafted with Lovable WebRTC</span>
        <span>•</span>
        <span>OmniCall v2.0</span>
      </footer>
    </div>
  );
}
