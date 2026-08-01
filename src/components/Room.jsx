import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import Peer from 'peerjs';
import { 
  Mic, MicOff, Video, VideoOff, MessageSquare, 
  PhoneOff, Share2, Copy, Check, ShieldCheck, Users, Radio, AlertCircle, RefreshCw
} from 'lucide-react';

export default function Room({ userConfig, onLeaveRoom }) {
  const { roomId, userName, avatar, micOn: initialMic, videoOn: initialVideo } = userConfig;

  const [micOn, setMicOn] = useState(initialMic);
  const [videoOn, setVideoOn] = useState(initialVideo);
  const [showChat, setShowChat] = useState(false);
  const [copied, setCopied] = useState(false);
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [remotePeers, setRemotePeers] = useState(new Map());
  const [mediaError, setMediaError] = useState(null);
  const [myPeerId, setMyPeerId] = useState(null);

  const socketRef = useRef(null);
  const peerRef = useRef(null);
  const localStreamRef = useRef(null);
  const localVideoRef = useRef(null);
  const callsRef = useRef(new Map());

  useEffect(() => {
    let isSubscribed = true;

    async function startVideoApp() {
      // 1. Get Local Stream FIRST
      let localStream;
      try {
        localStream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
          audio: { echoCancellation: true, noiseSuppression: true }
        });
      } catch (err) {
        console.warn('Camera/Mic permission error:', err);
        if (isSubscribed) {
          setMediaError('Could not access Camera or Microphone. Please allow browser permissions.');
        }
        localStream = new MediaStream();
      }

      if (!isSubscribed) return;

      localStreamRef.current = localStream;
      localStream.getAudioTracks().forEach(t => { t.enabled = initialMic; });
      localStream.getVideoTracks().forEach(t => { t.enabled = initialVideo; });

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = localStream;
      }

      // 2. Initialize PeerJS SECOND with guaranteed Stream
      const peer = new Peer({
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:global.stun.twilio.com:3478' },
            {
              urls: [
                'turn:openrelay.metered.ca:80',
                'turn:openrelay.metered.ca:443',
                'turn:openrelay.metered.ca:443?transport=tcp'
              ],
              username: 'openrelay',
              credential: 'openrelay'
            }
          ]
        }
      });
      peerRef.current = peer;

      // Handle incoming calls reliably
      peer.on('call', (call) => {
        console.log('[PeerJS] Answering call from:', call.peer);
        call.answer(localStreamRef.current);

        call.on('stream', (remoteStream) => {
          console.log('[PeerJS] Remote stream received:', call.peer);
          if (isSubscribed) {
            setRemotePeers(prev => {
              const updated = new Map(prev);
              const existing = updated.get(call.peer) || {};
              return updated.set(call.peer, { ...existing, stream: remoteStream, peerId: call.peer });
            });
          }
        });

        callsRef.current.set(call.peer, call);
      });

      // 3. Connect Socket.io THIRD once Peer ID is ready
      peer.on('open', (peerId) => {
        console.log('[PeerJS] Peer ID ready:', peerId);
        if (isSubscribed) setMyPeerId(peerId);

        const socket = io(window.location.origin, {
          transports: ['websocket', 'polling']
        });
        socketRef.current = socket;

        socket.emit('join-room', {
          roomId,
          userName,
          avatar,
          peerId,
          micOn: initialMic,
          videoOn: initialVideo
        });

        socket.on('room-users', (existingUsers) => {
          existingUsers.forEach(user => {
            if (user.peerId && user.peerId !== peerId) {
              console.log('[PeerJS] Calling existing user:', user.peerId);
              const call = peer.call(user.peerId, localStreamRef.current);
              
              call.on('stream', (remoteStream) => {
                console.log('[PeerJS] Stream received from existing user:', user.peerId);
                if (isSubscribed) {
                  setRemotePeers(prev => {
                    const updated = new Map(prev);
                    return updated.set(user.peerId, { 
                      stream: remoteStream, 
                      name: user.name, 
                      avatar: user.avatar,
                      peerId: user.peerId,
                      micOn: user.micOn,
                      videoOn: user.videoOn 
                    });
                  });
                }
              });

              callsRef.current.set(user.peerId, call);
            }
          });
        });

        socket.on('user-joined', (newUser) => {
          if (newUser.peerId && newUser.peerId !== peerId) {
            console.log('[PeerJS] User joined room:', newUser.name, newUser.peerId);
            setRemotePeers(prev => {
              const updated = new Map(prev);
              const existing = updated.get(newUser.peerId) || {};
              return updated.set(newUser.peerId, {
                ...existing,
                name: newUser.name,
                avatar: newUser.avatar,
                peerId: newUser.peerId,
                micOn: newUser.micOn,
                videoOn: newUser.videoOn
              });
            });

            // 2-way call fallback
            if (!callsRef.current.has(newUser.peerId)) {
              console.log('[PeerJS] Fallback calling newUser:', newUser.peerId);
              const call = peer.call(newUser.peerId, localStreamRef.current);
              call.on('stream', (remoteStream) => {
                if (isSubscribed) {
                  setRemotePeers(prev => {
                    const updated = new Map(prev);
                    const existing = updated.get(newUser.peerId) || {};
                    return updated.set(newUser.peerId, { ...existing, stream: remoteStream, peerId: newUser.peerId });
                  });
                }
              });
              callsRef.current.set(newUser.peerId, call);
            }
          }
        });

        socket.on('room-chat-history', (history) => {
          if (Array.isArray(history) && isSubscribed) setMessages(history);
        });

        socket.on('new-message', (msg) => {
          if (isSubscribed) setMessages(prev => [...prev, msg]);
        });

        socket.on('user-media-toggled', ({ socketId, micOn, videoOn }) => {
          if (isSubscribed) {
            setRemotePeers(prev => {
              const updated = new Map(prev);
              for (let [pId, pData] of updated.entries()) {
                if (pData.socketId === socketId) {
                  updated.set(pId, { ...pData, micOn, videoOn });
                }
              }
              return updated;
            });
          }
        });

        socket.on('user-left', ({ socketId }) => {
          if (isSubscribed) {
            setRemotePeers(prev => {
              const updated = new Map(prev);
              for (let [pId, pData] of updated.entries()) {
                if (pData.socketId === socketId) {
                  if (callsRef.current.has(pId)) {
                    callsRef.current.get(pId).close();
                    callsRef.current.delete(pId);
                  }
                  updated.delete(pId);
                }
              }
              return updated;
            });
          }
        });

      });
    }

    startVideoApp();

    return () => {
      isSubscribed = false;
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(t => t.stop());
      }
      callsRef.current.forEach(call => call.close());
      if (peerRef.current) peerRef.current.destroy();
      if (socketRef.current) socketRef.current.disconnect();
    };
  }, [roomId]);

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

  // Copy Room Link
  const handleCopyLink = () => {
    const link = `${window.location.origin}/?room=${roomId}`;
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const remotePeersList = Array.from(remotePeers.values());

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
            <p className="text-[10px] text-pink-200/70">PeerJS HD Stream • 2-Way Sync</p>
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

      {/* Permission Warning */}
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

      {/* Main Video View Area */}
      <div className="flex-1 flex overflow-hidden relative p-3 md:p-6">
        
        {/* Remote Video (Full Container) or Split Grid */}
        <div className="flex-1 flex items-center justify-center relative">
          
          {remotePeersList.length === 0 ? (
            /* Waiting State when alone in room */
            <div className="w-full max-w-2xl aspect-video rounded-3xl glass-panel border border-white/15 shadow-2xl flex flex-col items-center justify-center gap-4 p-8 text-center bg-[#110721]/80">
              <div className="p-4 bg-pink-500/20 rounded-full border border-pink-500/40 animate-pulse">
                <Users className="w-10 h-10 text-pink-400" />
              </div>
              <div>
                <h3 className="text-xl font-extrabold text-white">Waiting for someone to join...</h3>
                <p className="text-xs text-pink-200/70 mt-1">Share the Room Code <strong className="text-pink-400">{roomId}</strong> or copy the link to invite your friend!</p>
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
              remotePeersList.length === 1 ? 'grid-cols-1 max-w-4xl' : 'grid-cols-1 sm:grid-cols-2 max-w-6xl'
            } items-center justify-center mx-auto`}>
              {remotePeersList.map((peerData) => (
                <PeerVideoTile key={peerData.peerId} peerData={peerData} />
              ))}
            </div>
          )}

          {/* Picture-in-Picture LOCAL VIDEO */}
          <div className="absolute bottom-4 right-4 w-36 sm:w-56 aspect-[3/4] sm:aspect-video rounded-2xl glass-panel overflow-hidden border-2 border-pink-500/50 shadow-2xl z-20 bg-slate-950">
            {videoOn ? (
              <video
                ref={(el) => {
                  if (el && localStreamRef.current && el.srcObject !== localStreamRef.current) {
                    el.srcObject = localStreamRef.current;
                  }
                }}
                autoPlay
                playsInline
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

        {/* Simple Side Chat Drawer */}
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

      {/* Simplified Controls Toolbar */}
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

// Ultra Robust Peer Video Tile with React DOM Callback Ref Attachment
function PeerVideoTile({ peerData }) {
  return (
    <div className="relative w-full aspect-video rounded-3xl glass-panel overflow-hidden border border-white/15 shadow-2xl bg-[#110721] flex items-center justify-center border-pink-500/30">
      
      {/* Audio Element for voice */}
      <audio
        ref={(el) => {
          if (el && peerData.stream && el.srcObject !== peerData.stream) {
            el.srcObject = peerData.stream;
            el.play().catch(console.warn);
          }
        }}
        autoPlay
        playsInline
      />

      {/* Video Element for 2-way stream */}
      {peerData.stream ? (
        <video
          ref={(el) => {
            if (el && peerData.stream && el.srcObject !== peerData.stream) {
              el.srcObject = peerData.stream;
              el.play().catch(console.warn);
            }
          }}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="flex flex-col items-center justify-center gap-3 p-4">
          <img
            src={peerData.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${peerData.peerId}`}
            alt={peerData.name || 'User'}
            className="w-20 h-20 rounded-full p-1 bg-slate-900 border border-pink-500/40 shadow-lg"
          />
          <span className="text-xs text-pink-200 font-semibold">{peerData.name || 'Connecting...'}</span>
          <span className="text-[10px] text-pink-300/60 animate-pulse">Connecting HD Video Stream...</span>
        </div>
      )}

      <div className="absolute bottom-3 left-3 px-3 py-1 rounded-xl glass-panel border border-white/15 text-xs font-bold text-white">
        {peerData.name || 'Participant'}
      </div>
    </div>
  );
}
