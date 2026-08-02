import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { 
  Mic, MicOff, Video, VideoOff, MessageSquare, 
  PhoneOff, Share2, Copy, Check, Users, Radio, AlertCircle, RefreshCw, Smartphone, Activity
} from 'lucide-react';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
    { urls: 'stun:global.stun.twilio.com:3478' },
    {
      urls: [
        'turn:openrelay.metered.ca:80',
        'turn:openrelay.metered.ca:443',
        'turn:openrelay.metered.ca:443?transport=tcp',
        'turns:openrelay.metered.ca:443?transport=tcp'
      ],
      username: 'openrelay',
      credential: 'openrelay'
    }
  ]
};

export default function Room({ userConfig, onLeaveRoom }) {
  const { roomId, userName, avatar, micOn: initialMic, videoOn: initialVideo } = userConfig;

  const [micOn, setMicOn] = useState(initialMic);
  const [videoOn, setVideoOn] = useState(initialVideo);
  const [showChat, setShowChat] = useState(false);
  const [copied, setCopied] = useState(false);
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [participants, setParticipants] = useState([]);
  const [remoteStreams, setRemoteStreams] = useState(new Map());
  const [connectionStates, setConnectionStates] = useState(new Map());
  const [mediaError, setMediaError] = useState(null);

  const socketRef = useRef(null);
  const localStreamRef = useRef(null);
  const localVideoRef = useRef(null);
  const peersRef = useRef(new Map());
  const candidateQueues = useRef(new Map());

  useEffect(() => {
    const socket = io(window.location.origin, {
      transports: ['websocket', 'polling']
    });
    socketRef.current = socket;

    async function initMobileAdaptiveWebRTC() {
      let localStream;
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      console.log('[App] Device environment:', isMobile ? 'Mobile' : 'PC Desktop');

      // Native Constraints tailored for Mobile Portrait vs PC Landscape Sensors
      const videoConstraints = isMobile
        ? { width: { ideal: 720 }, height: { ideal: 1280 }, facingMode: 'user', frameRate: { ideal: 30 } }
        : { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } };

      try {
        localStream = await navigator.mediaDevices.getUserMedia({
          video: videoConstraints,
          audio: { echoCancellation: true, noiseSuppression: true }
        });
      } catch (err) {
        console.warn('Adaptive constraints failed, trying basic getUserMedia:', err);
        try {
          localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        } catch (e) {
          console.error('Camera/Mic permission error:', e);
          setMediaError('Could not access Camera or Microphone. Please allow browser permissions.');
          localStream = new MediaStream();
        }
      }

      localStreamRef.current = localStream;
      localStream.getAudioTracks().forEach(t => { t.enabled = initialMic; });
      localStream.getVideoTracks().forEach(t => { 
        t.enabled = initialVideo;
        t.onmute = () => console.warn('Mobile video track muted by OS');
        t.onunmute = () => console.log('Mobile video track unmuted by OS');
      });

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = localStream;
      }

      // Join room via Socket.io
      socket.emit('join-room', {
        roomId,
        userName,
        avatar,
        micOn: initialMic,
        videoOn: initialVideo
      });

      // Handlers
      socket.on('room-users', (existingUsers) => {
        console.log('[Socket] Existing room users list:', existingUsers);
        setParticipants([
          { socketId: socket.id, name: userName, avatar, micOn: initialMic, videoOn: initialVideo },
          ...existingUsers
        ]);

        existingUsers.forEach(user => {
          createOfferToUser(user.socketId);
        });
      });

      socket.on('user-joined', (newUser) => {
        console.log('[Socket] New user joined room:', newUser);
        setParticipants(prev => [...prev.filter(p => p.socketId !== newUser.socketId), newUser]);
      });

      socket.on('offer', async ({ from, offer }) => {
        console.log('[WebRTC] Received offer from:', from);
        await handleReceiveOffer(from, offer);
      });

      socket.on('answer', async ({ from, answer }) => {
        console.log('[WebRTC] Received answer from:', from);
        await handleReceiveAnswer(from, answer);
      });

      socket.on('ice-candidate', async ({ from, candidate }) => {
        await handleReceiveCandidate(from, candidate);
      });

      socket.on('room-chat-history', (history) => {
        if (Array.isArray(history)) setMessages(history);
      });

      socket.on('new-message', (msg) => {
        setMessages(prev => [...prev, msg]);
      });

      socket.on('user-media-toggled', ({ socketId, micOn, videoOn }) => {
        setParticipants(prev => prev.map(p => p.socketId === socketId ? { ...p, micOn, videoOn } : p));
      });

      socket.on('user-left', ({ socketId }) => {
        if (peersRef.current.has(socketId)) {
          peersRef.current.get(socketId).close();
          peersRef.current.delete(socketId);
        }
        candidateQueues.current.delete(socketId);
        setRemoteStreams(prev => {
          const next = new Map(prev);
          next.delete(socketId);
          return next;
        });
        setConnectionStates(prev => {
          const next = new Map(prev);
          next.delete(socketId);
          return next;
        });
        setParticipants(prev => prev.filter(p => p.socketId !== socketId));
      });
    }

    initMobileAdaptiveWebRTC();

    return () => {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(t => t.stop());
      }
      peersRef.current.forEach(peer => peer.close());
      socket.disconnect();
    };
  }, [roomId]);

  // WEBRTC PEER CONNECTION CREATOR WITH MOBILE TRANSCEIVERS
  function createPeer(targetSocketId) {
    if (peersRef.current.has(targetSocketId)) {
      return peersRef.current.get(targetSocketId);
    }

    console.log('[WebRTC] Creating RTCPeerConnection for target:', targetSocketId);
    const peer = new RTCPeerConnection(ICE_SERVERS);

    // Add local tracks & transceivers
    if (localStreamRef.current && localStreamRef.current.getTracks().length > 0) {
      localStreamRef.current.getTracks().forEach(track => {
        console.log('[WebRTC] Adding track to peer:', track.kind, track.label);
        peer.addTrack(track, localStreamRef.current);
      });
    } else {
      console.warn('[WebRTC] Local tracks missing, adding default transceivers');
      peer.addTransceiver('audio', { direction: 'sendrecv' });
      peer.addTransceiver('video', { direction: 'sendrecv' });
    }

    peer.onicecandidate = (event) => {
      if (event.candidate) {
        socketRef.current?.emit('ice-candidate', {
          to: targetSocketId,
          candidate: event.candidate
        });
      }
    };

    peer.ontrack = (event) => {
      console.log('[WebRTC] Received remote track from:', targetSocketId, event.track.kind);
      
      setRemoteStreams(prev => {
        const prevStream = prev.get(targetSocketId);
        const existingTracks = prevStream ? prevStream.getTracks() : [];
        const hasTrack = existingTracks.some(t => t.id === event.track.id);
        const updatedTracks = hasTrack ? existingTracks : [...existingTracks, event.track];
        
        return new Map(prev).set(targetSocketId, new MediaStream(updatedTracks));
      });
    };

    peer.oniceconnectionstatechange = () => {
      console.log(`[WebRTC] ICE Connection State (${targetSocketId}):`, peer.iceConnectionState);
      setConnectionStates(prev => new Map(prev).set(targetSocketId, peer.iceConnectionState));

      if (peer.iceConnectionState === 'failed') {
        console.warn(`[WebRTC] ICE connection failed. Restarting ICE...`);
        try { peer.restartIce(); } catch (e) {}
      }
    };

    peer.onconnectionstatechange = () => {
      console.log(`[WebRTC] Peer Connection State (${targetSocketId}):`, peer.connectionState);
      setConnectionStates(prev => new Map(prev).set(targetSocketId, peer.connectionState));
    };

    peersRef.current.set(targetSocketId, peer);
    return peer;
  }

  async function createOfferToUser(targetSocketId) {
    const peer = createPeer(targetSocketId);
    try {
      const offer = await peer.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true
      });
      await peer.setLocalDescription(offer);
      socketRef.current?.emit('offer', { to: targetSocketId, offer });
    } catch (err) {
      console.error('[WebRTC] Create offer error:', err);
    }
  }

  async function handleReceiveOffer(fromSocketId, offerSignal) {
    const peer = createPeer(fromSocketId);
    try {
      if (peer.signalingState !== 'stable') {
        console.warn(`[WebRTC] Ignore offer from ${fromSocketId} because signalingState is ${peer.signalingState}`);
        return;
      }

      await peer.setRemoteDescription(new RTCSessionDescription(offerSignal));

      if (candidateQueues.current.has(fromSocketId)) {
        const candidates = candidateQueues.current.get(fromSocketId);
        for (const candidate of candidates) {
          await peer.addIceCandidate(candidate);
        }
        candidateQueues.current.delete(fromSocketId);
      }

      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      socketRef.current?.emit('answer', { to: fromSocketId, answer });
    } catch (err) {
      console.error('[WebRTC] Handle offer error:', err);
    }
  }

  async function handleReceiveAnswer(fromSocketId, answerSignal) {
    const peer = peersRef.current.get(fromSocketId);
    if (peer) {
      try {
        if (peer.signalingState === 'have-local-offer') {
          await peer.setRemoteDescription(new RTCSessionDescription(answerSignal));

          if (candidateQueues.current.has(fromSocketId)) {
            const candidates = candidateQueues.current.get(fromSocketId);
            for (const candidate of candidates) {
              await peer.addIceCandidate(candidate);
            }
            candidateQueues.current.delete(fromSocketId);
          }
        } else {
          console.warn(`[WebRTC] Safely ignoring answer from ${fromSocketId} because signalingState is ${peer.signalingState}`);
        }
      } catch (err) {
        console.error('[WebRTC] Handle answer error:', err);
      }
    }
  }

  async function handleReceiveCandidate(fromSocketId, candidateData) {
    const peer = peersRef.current.get(fromSocketId);
    const candidate = new RTCIceCandidate(candidateData);

    if (peer && peer.remoteDescription && peer.remoteDescription.type) {
      try {
        await peer.addIceCandidate(candidate);
      } catch (e) {
        console.warn('ICE Candidate add error:', e);
      }
    } else {
      if (!candidateQueues.current.has(fromSocketId)) {
        candidateQueues.current.set(fromSocketId, []);
      }
      candidateQueues.current.get(fromSocketId).push(candidate);
    }
  }

  // Toggle Mic
  const handleToggleMic = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach(t => { t.enabled = !micOn; });
    }
    const nextMic = !micOn;
    setMicOn(nextMic);
    socketRef.current?.emit('toggle-media', { micOn: nextMic, videoOn });
  };

  // Toggle Video
  const handleToggleVideo = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getVideoTracks().forEach(t => { t.enabled = !videoOn; });
    }
    const nextVideo = !videoOn;
    setVideoOn(nextVideo);
    socketRef.current?.emit('toggle-media', { micOn, videoOn: nextVideo });
  };

  // Send Chat
  const handleSendChat = (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    socketRef.current?.emit('send-message', { message: chatInput.trim() });
    setChatInput('');
  };

  // Copy Link
  const handleCopyLink = () => {
    const link = `${window.location.origin}/?room=${roomId}`;
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const remoteUsers = participants.filter(p => p.socketId !== socketRef.current?.id);

  return (
    <div className="relative h-screen w-screen bg-[#090314] flex flex-col overflow-hidden text-slate-100 font-['Plus_Jakarta_Sans',sans-serif]">
      
      {/* Top Header */}
      <header className="h-14 px-4 glass-panel border-b border-white/10 flex items-center justify-between z-30">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-tr from-pink-500 to-purple-600 rounded-xl shadow-lg shadow-pink-500/30">
            <Radio className="w-4 h-4 text-white animate-pulse" />
          </div>
          <div>
            <h2 className="font-bold text-white text-sm flex items-center gap-2">
              OmniCall Room <span className="px-2 py-0.5 rounded-md bg-pink-500/20 text-pink-300 font-mono text-xs border border-pink-500/30">{roomId}</span>
            </h2>
            <p className="text-[10px] text-pink-200/70">Mobile ↔ PC Dual Camera Sync</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleCopyLink}
            className="px-3 py-1.5 rounded-xl glass-button text-xs font-semibold text-pink-200 flex items-center gap-1.5 border border-pink-500/30 shadow-md"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Link Copied!' : 'Copy Link'}</span>
          </button>
        </div>
      </header>

      {/* Permission Error Banner */}
      {mediaError && (
        <div className="bg-pink-500/20 border-b border-pink-500/40 px-4 py-2 text-pink-200 text-xs flex items-center justify-between z-40">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-pink-400 flex-shrink-0" />
            <span>{mediaError}</span>
          </div>
          <button 
            onClick={() => window.location.reload()} 
            className="px-2.5 py-1 bg-pink-500 text-white font-bold rounded-md hover:bg-pink-400 text-xs flex items-center gap-1 shadow-md"
          >
            <RefreshCw className="w-3 h-3" /> Allow Camera & Mic
          </button>
        </div>
      )}

      {/* Main Video View */}
      <div className="flex-1 flex overflow-hidden relative p-3 md:p-6">
        
        <div className="flex-1 flex items-center justify-center relative">
          
          {remoteUsers.length === 0 ? (
            /* Waiting State */
            <div className="w-full max-w-2xl aspect-video rounded-3xl glass-panel border border-white/15 shadow-2xl flex flex-col items-center justify-center gap-4 p-8 text-center bg-[#110721]/80">
              <div className="p-4 bg-pink-500/20 rounded-full border border-pink-500/40 animate-pulse">
                <Users className="w-10 h-10 text-pink-400" />
              </div>
              <div>
                <h3 className="text-xl font-extrabold text-white">Waiting for someone to join...</h3>
                <p className="text-xs text-pink-200/70 mt-1">Share Room Code <strong className="text-pink-400">{roomId}</strong> or copy link to start call!</p>
              </div>
              <button
                onClick={handleCopyLink}
                className="px-6 py-3 rounded-2xl btn-lovable-primary text-white font-bold text-xs flex items-center gap-2 shadow-lg"
              >
                <Share2 className="w-4 h-4" /> Copy Invite Link
              </button>
            </div>
          ) : (
            /* Render Remote Streams Grid */
            <div className={`w-full h-full grid gap-4 ${
              remoteUsers.length === 1 ? 'grid-cols-1 max-w-4xl' : 'grid-cols-1 sm:grid-cols-2 max-w-6xl'
            } items-center justify-center mx-auto`}>
              {remoteUsers.map((user) => {
                const stream = remoteStreams.get(user.socketId);
                const connState = connectionStates.get(user.socketId) || 'connecting';
                return (
                  <NativeVideoTile
                    key={user.socketId}
                    user={user}
                    stream={stream}
                    connState={connState}
                  />
                );
              })}
            </div>
          )}

          {/* Picture-in-Picture LOCAL VIDEO */}
          <div className="absolute bottom-4 right-4 w-32 sm:w-56 aspect-[3/4] sm:aspect-video rounded-2xl glass-panel overflow-hidden border-2 border-pink-500/50 shadow-2xl z-20 bg-slate-950">
            {videoOn ? (
              <video
                ref={(el) => {
                  if (el && localStreamRef.current && el.srcObject !== localStreamRef.current) {
                    el.srcObject = localStreamRef.current;
                  }
                }}
                autoPlay
                playsInline
                webkit-playsinline="true"
                muted
                className="w-full h-full object-cover transform -scale-x-100"
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center bg-[#150a26] p-2 text-center">
                <img src={avatar} alt="You" className="w-10 h-10 rounded-full p-0.5 border border-pink-500/40" />
                <span className="text-[10px] text-pink-200/70 mt-1 font-medium">You (Cam Off)</span>
              </div>
            )}
            <div className="absolute bottom-1.5 left-2 px-2 py-0.5 rounded-md glass-panel text-[10px] font-bold text-white">
              You
            </div>
          </div>

        </div>

        {/* Side Chat */}
        {showChat && (
          <div className="w-72 md:w-80 h-full glass-panel border-l border-white/15 flex flex-col shadow-2xl z-40 animate-slide-in">
            <div className="p-4 border-b border-white/10 flex items-center justify-between font-bold text-white text-sm">
              <span>In-Call Chat</span>
              <button onClick={() => setShowChat(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.map(msg => (
                <div key={msg.id} className="flex flex-col">
                  <div className="flex items-center gap-1 mb-1">
                    <span className="text-[10px] font-bold text-pink-300">{msg.senderName}</span>
                    <span className="text-[9px] text-slate-500">{msg.time}</span>
                  </div>
                  <div className="bg-pink-600/90 text-white p-2.5 rounded-2xl rounded-tl-none text-xs leading-relaxed max-w-[90%] shadow-md">
                    {msg.text}
                  </div>
                </div>
              ))}
            </div>

            <form onSubmit={handleSendChat} className="p-3 border-t border-white/10 flex gap-2">
              <input
                type="text"
                placeholder="Type a message..."
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                className="flex-1 bg-[#170a2c] border border-purple-800/80 rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
              />
              <button type="submit" className="p-2 rounded-xl bg-pink-600 text-white font-bold text-xs">
                Send
              </button>
            </form>
          </div>
        )}

      </div>

      {/* Controls */}
      <footer className="p-4 flex items-center justify-center gap-3 z-30">
        
        <button
          onClick={handleToggleMic}
          className={`p-3.5 rounded-2xl transition-all ${
            micOn ? 'glass-button text-white border border-pink-500/30' : 'bg-rose-500 text-white shadow-lg shadow-rose-500/40'
          }`}
          title={micOn ? "Mute Mic" : "Unmute Mic"}
        >
          {micOn ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
        </button>

        <button
          onClick={handleToggleVideo}
          className={`p-3.5 rounded-2xl transition-all ${
            videoOn ? 'glass-button text-white border border-pink-500/30' : 'bg-rose-500 text-white shadow-lg shadow-rose-500/40'
          }`}
          title={videoOn ? "Turn off Camera" : "Turn on Camera"}
        >
          {videoOn ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
        </button>

        <button
          onClick={() => setShowChat(!showChat)}
          className={`p-3.5 rounded-2xl transition-all ${
            showChat ? 'bg-pink-600 text-white' : 'glass-button text-white border border-pink-500/30'
          }`}
          title="Toggle Chat"
        >
          <MessageSquare className="w-5 h-5" />
        </button>

        <button
          onClick={onLeaveRoom}
          className="p-3.5 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-bold transition-all shadow-lg shadow-rose-600/40 ml-2"
          title="End Call"
        >
          <PhoneOff className="w-5 h-5" />
        </button>

      </footer>

    </div>
  );
}

// ALWAYS-MOUNTED Video Tile Component
function NativeVideoTile({ user, stream, connState }) {
  const videoRef = useRef(null);
  const audioRef = useRef(null);
  const [hasVideoTrack, setHasVideoTrack] = useState(false);

  useEffect(() => {
    if (stream) {
      const vTracks = stream.getVideoTracks();
      const hasActiveVideo = vTracks.length > 0 && vTracks.some(t => t.readyState === 'live');
      setHasVideoTrack(hasActiveVideo);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(e => console.warn('Video play catch:', e));
      }
      if (audioRef.current) {
        audioRef.current.srcObject = stream;
        audioRef.current.play().catch(e => console.warn('Audio play catch:', e));
      }
    } else {
      setHasVideoTrack(false);
    }
  }, [stream, user.videoOn]);

  const showVideo = stream && hasVideoTrack && user.videoOn !== false;

  return (
    <div className="relative w-full aspect-video rounded-3xl glass-panel overflow-hidden border border-white/15 shadow-2xl bg-[#110721] flex items-center justify-center border-pink-500/30">
      
      {/* Voice Audio Element */}
      <audio
        ref={audioRef}
        autoPlay
        playsInline
        webkit-playsinline="true"
      />

      {/* Video Element - ALWAYS MOUNTED */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        webkit-playsinline="true"
        muted
        className={`w-full h-full object-cover transition-opacity duration-300 ${
          showVideo ? 'opacity-100' : 'opacity-0 absolute pointer-events-none'
        }`}
      />

      {/* Avatar / Loading Overlay when Video is Off or Stream Connecting */}
      {!showVideo && (
        <div className="flex flex-col items-center justify-center gap-3 p-4 z-10">
          <img
            src={user.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${user.socketId}`}
            alt={user.name || 'User'}
            className="w-20 h-20 rounded-full p-1 bg-slate-900 border border-pink-500/40 shadow-lg"
          />
          <span className="text-xs text-pink-200 font-semibold">{user.name || 'Participant'}</span>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-pink-500/20 border border-pink-500/30 text-[10px] text-pink-300">
            <Activity className="w-3 h-3 text-pink-400 animate-spin" />
            <span>{connState === 'connected' ? 'Camera Off' : `Connecting (${connState})...`}</span>
          </div>
        </div>
      )}

      {/* Participant Info Overlay */}
      <div className="absolute bottom-3 left-3 px-3 py-1 rounded-xl glass-panel border border-white/15 text-xs font-bold text-white flex items-center gap-1.5 z-20">
        <span>{user.name || 'Participant'}</span>
        <Smartphone className="w-3.5 h-3.5 text-pink-400" />
      </div>
    </div>
  );
}
