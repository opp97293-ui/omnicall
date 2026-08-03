// ---------------------------------------------------------------------------
// useCall — the single source of truth for a room.
//
// Owns the socket, every PeerSession, local media and all couple-mode state.
// The UI below it is intentionally dumb: it renders what this hook exposes.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import {
  PeerSession,
  getLocalMedia,
  getVideoConstraints,
  AUDIO_CONSTRAINTS,
  webRTCSupported
} from '../lib/webrtc';

const STATS_INTERVAL_MS = 2000;

export function useCall({ roomId, userName, avatar, micOn: wantMic, videoOn: wantVideo, deviceType }) {
  /* ---- connection ---- */
  const [selfId, setSelfId] = useState(null);
  const [socketLive, setSocketLive] = useState(false);
  const [participants, setParticipants] = useState([]); // remote peers only
  const [media, setMedia] = useState(new Map()); // socketId -> { camera, screen }
  const [states, setStates] = useState(new Map()); // socketId -> RTC state
  const [quality, setQuality] = useState(new Map()); // socketId -> { kbps, width, height }

  /* ---- local devices ---- */
  const [micOn, setMicOn] = useState(wantMic);
  const [videoOn, setVideoOn] = useState(wantVideo);
  const [sharing, setSharing] = useState(false);
  const [facingMode, setFacingMode] = useState('user');
  const [mediaError, setMediaError] = useState(null);
  const [localReady, setLocalReady] = useState(false);
  const [audioBlocked, setAudioBlocked] = useState(false);

  /* ---- couple mode ---- */
  const [messages, setMessages] = useState([]);
  const [reactions, setReactions] = useState([]);
  const [gifts, setGifts] = useState([]);
  const [loveNotes, setLoveNotes] = useState([]);
  const [loveMeter, setLoveMeter] = useState(0);
  const [scores, setScores] = useState({});
  const [challenge, setChallenge] = useState(null);
  const [combo, setCombo] = useState(null);
  const [momentFlash, setMomentFlash] = useState(null);
  const [unreadChat, setUnreadChat] = useState(0);

  const socketRef = useRef(null);
  const localStreamRef = useRef(null);
  const screenStreamRef = useRef(null);
  const sessionsRef = useRef(new Map()); // socketId -> PeerSession
  const statsRef = useRef(new Map());
  const chatOpenRef = useRef(false);
  const selfIdRef = useRef(null);

  /* ----------------------------------------------------------------- utils */

  const patchMedia = useCallback((socketId, patch) => {
    setMedia((prev) => {
      const next = new Map(prev);
      next.set(socketId, { ...(next.get(socketId) || { camera: null, screen: null }), ...patch });
      return next;
    });
  }, []);

  const dropPeer = useCallback((socketId) => {
    const session = sessionsRef.current.get(socketId);
    if (session) session.close();
    sessionsRef.current.delete(socketId);
    statsRef.current.delete(socketId);
    setMedia((prev) => {
      const next = new Map(prev);
      next.delete(socketId);
      return next;
    });
    setStates((prev) => {
      const next = new Map(prev);
      next.delete(socketId);
      return next;
    });
    setQuality((prev) => {
      const next = new Map(prev);
      next.delete(socketId);
      return next;
    });
    setParticipants((prev) => prev.filter((p) => p.socketId !== socketId));
  }, []);

  /** Create (or reuse) the peer session for a remote socket id. */
  const ensureSession = useCallback(
    (socketId) => {
      const existing = sessionsRef.current.get(socketId);
      if (existing && !existing.closed) return existing;

      const session = new PeerSession({
        socketId,
        selfId: selfIdRef.current,
        localStream: localStreamRef.current,
        sendSignal: (payload) => socketRef.current?.emit('signal', payload),
        onTrack: ({ track, stream, kind }) => {
          patchMedia(socketId, { [kind]: stream });
          // A remote track that ends (partner stopped sharing) clears its slot.
          track.addEventListener('ended', () => {
            if (kind === 'screen') patchMedia(socketId, { screen: null });
          });
        },
        onState: (state) => {
          setStates((prev) => new Map(prev).set(socketId, state));
        },
        onDebug: (msg) => console.debug('[webrtc]', msg)
      });

      sessionsRef.current.set(socketId, session);
      return session;
    },
    [patchMedia]
  );

  /* ------------------------------------------------------- bootstrap room */

  useEffect(() => {
    if (!webRTCSupported()) {
      setMediaError('This browser does not support WebRTC. Please use Chrome, Edge, Safari or Firefox.');
      return undefined;
    }

    let disposed = false;
    const socket = io({ transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.on('connect', () => {
      selfIdRef.current = socket.id;
      setSelfId(socket.id);
      setSocketLive(true);
      socket.emit('join-room', {
        roomId,
        userName,
        avatar,
        micOn: wantMic,
        videoOn: wantVideo,
        device: deviceType
      });
    });

    socket.on('disconnect', () => setSocketLive(false));

    socket.on('room-joined', (payload) => {
      if (disposed) return;
      setParticipants(payload.users || []);
      setMessages(payload.messages || []);
      setLoveNotes(payload.loveNotes || []);
      setLoveMeter(payload.loveMeter || 0);
      setScores(payload.scores || {});
      // Sessions auto-negotiate from their constructor; glare is handled inside.
      (payload.users || []).forEach((u) => ensureSession(u.socketId));
    });

    socket.on('user-joined', (user) => {
      if (disposed) return;
      setParticipants((prev) => [...prev.filter((p) => p.socketId !== user.socketId), user]);
      ensureSession(user.socketId);
    });

    socket.on('user-left', ({ socketId }) => dropPeer(socketId));

    socket.on('signal', ({ from, description, candidate }) => {
      if (disposed || !from) return;
      ensureSession(from).handleSignal({ description, candidate });
    });

    socket.on('user-media-toggled', ({ socketId, micOn: m, videoOn: v }) => {
      setParticipants((prev) => prev.map((p) => (p.socketId === socketId ? { ...p, micOn: m, videoOn: v } : p)));
    });

    socket.on('user-hand-toggled', ({ socketId, raisedHand }) => {
      setParticipants((prev) => prev.map((p) => (p.socketId === socketId ? { ...p, raisedHand } : p)));
    });

    socket.on('user-screen-share', ({ socketId, isSharing, trackId }) => {
      const session = sessionsRef.current.get(socketId);
      if (session) session.setRemoteScreenTrackId(isSharing ? trackId : null);
      if (!isSharing) patchMedia(socketId, { screen: null });
      setParticipants((prev) => prev.map((p) => (p.socketId === socketId ? { ...p, sharing: isSharing } : p)));
    });

    /* ---- chat & couple events ---- */
    socket.on('new-message', (msg) => {
      setMessages((prev) => [...prev, msg]);
      if (!chatOpenRef.current && msg.senderId !== selfIdRef.current) {
        setUnreadChat((n) => n + 1);
      }
    });

    socket.on('new-reaction', (r) => {
      setReactions((prev) => [...prev.slice(-24), { ...r, at: performance.now() }]);
    });

    socket.on('new-gift', (g) => {
      setGifts((prev) => [...prev.slice(-8), { ...g, at: performance.now() }]);
    });

    socket.on('love-meter', ({ value }) => setLoveMeter(value));
    socket.on('love-combo', ({ emoji }) => {
      setCombo({ emoji, at: performance.now() });
      setTimeout(() => setCombo(null), 2600);
    });

    socket.on('new-love-note', (note) => setLoveNotes((prev) => [...prev, note]));
    socket.on('challenge-scores', (s) => setScores(s || {}));

    socket.on('challenge', (evt) => {
      if (evt.type === 'offer') setChallenge({ ...evt.payload, from: evt.from, fromName: evt.fromName, status: 'offered' });
      else if (evt.type === 'accept') setChallenge((c) => (c ? { ...c, status: 'active' } : c));
      else if (evt.type === 'skip' || evt.type === 'done') setChallenge(null);
    });

    socket.on('partner-moment', ({ name }) => {
      setMomentFlash(name);
      setTimeout(() => setMomentFlash(null), 1800);
    });

    /* ---- acquire local media, then publish to any peer already waiting ---- */
    (async () => {
      const { stream, error } = await getLocalMedia(deviceType, 'user');
      if (disposed) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      localStreamRef.current = stream;
      stream.getAudioTracks().forEach((t) => { t.enabled = wantMic; });
      stream.getVideoTracks().forEach((t) => { t.enabled = wantVideo; });

      if (error && stream.getTracks().length === 0) {
        setMediaError('Camera aur microphone allow karein — browser ne access block kiya hai.');
      } else if (error && stream.getVideoTracks().length === 0) {
        setMediaError('Camera nahi mila — audio-only mode me connected hain.');
      }

      setLocalReady(true);

      // Peers created before media arrived still need our tracks.
      sessionsRef.current.forEach((session) => {
        session.localStream = stream;
        const a = stream.getAudioTracks()[0];
        const v = stream.getVideoTracks()[0];
        if (a) session.replaceAudioTrack(a);
        if (v) session.replaceVideoTrack(v);
      });
    })();

    return () => {
      disposed = true;
      sessionsRef.current.forEach((s) => s.close());
      sessionsRef.current.clear();
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      screenStreamRef.current?.getTracks().forEach((t) => t.stop());
      socket.emit('leave-room');
      socket.removeAllListeners();
      socket.disconnect();
    };
    // Re-running this would tear down the call; a room change remounts Room instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  /* --------------------------------------------------------- stats polling */

  useEffect(() => {
    const timer = setInterval(async () => {
      const entries = await Promise.all(
        [...sessionsRef.current.entries()].map(async ([id, session]) => {
          const prev = statsRef.current.get(id);
          const stats = await session.readStats(prev);
          if (stats) statsRef.current.set(id, stats);
          return [id, stats];
        })
      );
      setQuality((prevMap) => {
        const next = new Map(prevMap);
        entries.forEach(([id, s]) => { if (s) next.set(id, s); });
        return next;
      });
    }, STATS_INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);

  /* ------------------------------------------------------------- controls */

  const toggleMic = useCallback(() => {
    const next = !micOn;
    localStreamRef.current?.getAudioTracks().forEach((t) => { t.enabled = next; });
    setMicOn(next);
    socketRef.current?.emit('toggle-media', { micOn: next, videoOn });
  }, [micOn, videoOn]);

  const toggleVideo = useCallback(() => {
    const next = !videoOn;
    localStreamRef.current?.getVideoTracks().forEach((t) => { t.enabled = next; });
    setVideoOn(next);
    socketRef.current?.emit('toggle-media', { micOn, videoOn: next });
  }, [micOn, videoOn]);

  /** Front/back camera swap — replaceTrack keeps the connection alive. */
  const flipCamera = useCallback(async () => {
    const next = facingMode === 'user' ? 'environment' : 'user';
    try {
      const fresh = await navigator.mediaDevices.getUserMedia({
        video: getVideoConstraints(deviceType, next),
        audio: false
      });
      const track = fresh.getVideoTracks()[0];
      if (!track) return;
      track.enabled = videoOn;

      const old = localStreamRef.current?.getVideoTracks()[0];
      if (old) {
        localStreamRef.current.removeTrack(old);
        old.stop();
      }
      localStreamRef.current?.addTrack(track);
      await Promise.all([...sessionsRef.current.values()].map((s) => s.replaceVideoTrack(track)));
      setFacingMode(next);
    } catch (err) {
      console.warn('[call] camera flip failed', err);
    }
  }, [deviceType, facingMode, videoOn]);

  const startScreenShare = useCallback(async () => {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setMediaError('Screen share is only available on desktop browsers.');
      return;
    }
    try {
      const display = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      const track = display.getVideoTracks()[0];
      if (!track) return;
      screenStreamRef.current = display;

      // Announce the track id *before* publishing so receivers can label it.
      socketRef.current?.emit('screen-share', { isSharing: true, trackId: track.id });
      await Promise.all([...sessionsRef.current.values()].map((s) => s.addScreenTrack(track, display)));
      setSharing(true);

      track.addEventListener('ended', () => stopScreenShare());
    } catch (err) {
      if (err?.name !== 'NotAllowedError') console.warn('[call] screen share failed', err);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopScreenShare = useCallback(async () => {
    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    screenStreamRef.current = null;
    await Promise.all([...sessionsRef.current.values()].map((s) => s.removeScreenTrack()));
    socketRef.current?.emit('screen-share', { isSharing: false, trackId: null });
    setSharing(false);
  }, []);

  const toggleScreenShare = useCallback(() => {
    if (sharing) stopScreenShare();
    else startScreenShare();
  }, [sharing, startScreenShare, stopScreenShare]);

  /* --------------------------------------------------------- couple actions */

  const sendMessage = useCallback((text) => {
    if (!text?.trim()) return;
    socketRef.current?.emit('send-message', { text: text.trim() });
  }, []);

  const sendReaction = useCallback((emoji) => {
    socketRef.current?.emit('send-reaction', { emoji });
  }, []);

  const sendGift = useCallback((gift) => {
    socketRef.current?.emit('send-gift', { gift });
  }, []);

  const sendLoveNote = useCallback((text) => {
    if (!text?.trim()) return;
    socketRef.current?.emit('send-love-note', { text: text.trim() });
  }, []);

  const offerChallenge = useCallback((payload) => {
    setChallenge({ ...payload, from: selfIdRef.current, fromName: userName, status: 'offered' });
    socketRef.current?.emit('challenge', { type: 'offer', payload });
  }, [userName]);

  const respondChallenge = useCallback((type) => {
    if (type === 'accept') setChallenge((c) => (c ? { ...c, status: 'active' } : c));
    else setChallenge(null);
    socketRef.current?.emit('challenge', { type });
  }, []);

  const captureMoment = useCallback(() => {
    socketRef.current?.emit('moment-captured');
  }, []);

  const raiseHand = useCallback((raisedHand) => {
    socketRef.current?.emit('toggle-raise-hand', { raisedHand });
  }, []);

  const markChatOpen = useCallback((open) => {
    chatOpenRef.current = open;
    if (open) setUnreadChat(0);
  }, []);

  /** iOS blocks autoplay with sound until a gesture; the UI calls this on tap. */
  const unlockAudio = useCallback(() => {
    document.querySelectorAll('audio,video').forEach((el) => el.play?.().catch(() => {}));
    setAudioBlocked(false);
  }, []);

  return {
    selfId,
    socketLive,
    participants,
    media,
    states,
    quality,
    localStream: localStreamRef.current,
    localReady,
    mediaError,
    setMediaError,
    micOn,
    videoOn,
    sharing,
    facingMode,
    audioBlocked,
    setAudioBlocked,
    unlockAudio,
    toggleMic,
    toggleVideo,
    flipCamera,
    toggleScreenShare,
    messages,
    unreadChat,
    markChatOpen,
    reactions,
    gifts,
    loveNotes,
    loveMeter,
    scores,
    challenge,
    combo,
    momentFlash,
    sendMessage,
    sendReaction,
    sendGift,
    sendLoveNote,
    offerChallenge,
    respondChallenge,
    captureMoment,
    raiseHand
  };
}
