import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingTimeout: 25000,
  pingInterval: 10000,
  maxHttpBufferSize: 1e6
});

const PORT = process.env.PORT || 5000;

/**
 * roomId -> {
 *   users: Map<socketId, User>,
 *   messages: [], loveNotes: [], gifts: [],
 *   loveMeter: number, scores: {}, lastReaction: { socketId, at } | null
 * }
 */
const rooms = new Map();

const MAX_MESSAGES = 300;
const MAX_NOTES = 100;
const COMBO_WINDOW_MS = 4000;

function getRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      users: new Map(),
      messages: [],
      loveNotes: [],
      loveMeter: 0,
      scores: {},
      lastReaction: null
    });
  }
  return rooms.get(roomId);
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function clockTime() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

io.on('connection', (socket) => {
  let roomId = null;
  let me = null;

  const room = () => (roomId ? rooms.get(roomId) : null);

  socket.on('join-room', (payload = {}) => {
    const { roomId: rid, userName, avatar, micOn = true, videoOn = true, device = 'desktop' } = payload;
    if (!rid || typeof rid !== 'string') return;

    // Re-join after a socket reconnect: drop the previous identity first.
    if (roomId && roomId !== rid) leave();

    roomId = rid.trim().toLowerCase().slice(0, 40);
    socket.join(roomId);
    const data = getRoom(roomId);

    me = {
      socketId: socket.id,
      name: (userName || `Guest-${socket.id.slice(0, 4)}`).slice(0, 32),
      avatar: avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${socket.id}`,
      device,
      micOn: !!micOn,
      videoOn: !!videoOn,
      sharing: false,
      raisedHand: false,
      joinedAt: Date.now(),
      joinedTime: clockTime()
    };
    data.users.set(socket.id, me);
    if (data.scores[socket.id] == null) data.scores[socket.id] = 0;

    socket.emit('room-joined', {
      you: me,
      users: [...data.users.values()].filter((u) => u.socketId !== socket.id),
      messages: data.messages,
      loveNotes: data.loveNotes,
      loveMeter: data.loveMeter,
      scores: data.scores
    });

    socket.to(roomId).emit('user-joined', me);
    console.log(`[room:${roomId}] + ${me.name} (${me.device}) — ${data.users.size} online`);
  });

  /* ---------------- WebRTC signalling (perfect negotiation) ---------------- */
  // A single channel carries both SDP and ICE so ordering is preserved per sender.
  socket.on('signal', ({ to, description, candidate } = {}) => {
    if (!to) return;
    io.to(to).emit('signal', { from: socket.id, description, candidate });
  });

  /* ---------------- Presence / media state ---------------- */
  socket.on('toggle-media', ({ micOn, videoOn } = {}) => {
    const data = room();
    if (!data || !me) return;
    me.micOn = !!micOn;
    me.videoOn = !!videoOn;
    io.to(roomId).emit('user-media-toggled', { socketId: socket.id, micOn: me.micOn, videoOn: me.videoOn });
  });

  socket.on('toggle-raise-hand', ({ raisedHand } = {}) => {
    const data = room();
    if (!data || !me) return;
    me.raisedHand = !!raisedHand;
    io.to(roomId).emit('user-hand-toggled', { socketId: socket.id, raisedHand: me.raisedHand });
  });

  // trackId lets receivers tell the screen track apart from the camera track.
  socket.on('screen-share', ({ isSharing, trackId } = {}) => {
    const data = room();
    if (!data || !me) return;
    me.sharing = !!isSharing;
    socket.to(roomId).emit('user-screen-share', { socketId: socket.id, isSharing: !!isSharing, trackId });
  });

  /* ---------------- Chat ---------------- */
  socket.on('send-message', ({ text, private: isPrivate } = {}) => {
    const data = room();
    if (!data || !me || !text) return;
    const msg = {
      id: uid(),
      senderId: socket.id,
      senderName: me.name,
      senderAvatar: me.avatar,
      text: String(text).slice(0, 1000),
      private: !!isPrivate,
      time: clockTime()
    };
    data.messages.push(msg);
    if (data.messages.length > MAX_MESSAGES) data.messages.shift();
    io.to(roomId).emit('new-message', msg);
  });

  /* ---------------- Reactions, gifts & the love meter ---------------- */
  socket.on('send-reaction', ({ emoji } = {}) => {
    const data = room();
    if (!data || !me || !emoji) return;

    io.to(roomId).emit('new-reaction', {
      id: uid(),
      senderId: socket.id,
      senderName: me.name,
      emoji: String(emoji).slice(0, 8)
    });

    bumpLoveMeter(2);

    // Both partners reacting inside the window = combo bonus.
    const now = Date.now();
    const last = data.lastReaction;
    if (last && last.socketId !== socket.id && now - last.at < COMBO_WINDOW_MS) {
      bumpLoveMeter(8);
      io.to(roomId).emit('love-combo', { emoji });
      data.lastReaction = null;
    } else {
      data.lastReaction = { socketId: socket.id, at: now };
    }
  });

  socket.on('send-gift', ({ gift } = {}) => {
    const data = room();
    if (!data || !me || !gift) return;
    const entry = {
      id: uid(),
      senderId: socket.id,
      senderName: me.name,
      gift: {
        id: String(gift.id || '').slice(0, 32),
        emoji: String(gift.emoji || '🎁').slice(0, 8),
        label: String(gift.label || 'Gift').slice(0, 40),
        points: Math.min(Number(gift.points) || 5, 25)
      },
      time: clockTime()
    };
    io.to(roomId).emit('new-gift', entry);
    bumpLoveMeter(entry.gift.points);
  });

  function bumpLoveMeter(points) {
    const data = room();
    if (!data) return;
    data.loveMeter = Math.max(0, Math.min(100, data.loveMeter + points));
    io.to(roomId).emit('love-meter', { value: data.loveMeter });
  }

  /* ---------------- Love notes (persisted for the room) ---------------- */
  socket.on('send-love-note', ({ text } = {}) => {
    const data = room();
    if (!data || !me || !text) return;
    const note = {
      id: uid(),
      senderId: socket.id,
      senderName: me.name,
      text: String(text).slice(0, 300),
      time: clockTime()
    };
    data.loveNotes.push(note);
    if (data.loveNotes.length > MAX_NOTES) data.loveNotes.shift();
    io.to(roomId).emit('new-love-note', note);
    bumpLoveMeter(3);
  });

  /* ---------------- Couple challenges ---------------- */
  // type: 'offer' | 'accept' | 'skip' | 'done' | 'rate'
  socket.on('challenge', ({ type, payload } = {}) => {
    const data = room();
    if (!data || !me || !type) return;

    if (type === 'done') {
      data.scores[socket.id] = (data.scores[socket.id] || 0) + 1;
      io.to(roomId).emit('challenge-scores', data.scores);
      bumpLoveMeter(6);
    }

    io.to(roomId).emit('challenge', {
      from: socket.id,
      fromName: me.name,
      type,
      payload: payload || null
    });
  });

  /* ---------------- Shared moments ---------------- */
  socket.on('moment-captured', () => {
    const data = room();
    if (!data || !me) return;
    socket.to(roomId).emit('partner-moment', { socketId: socket.id, name: me.name });
    bumpLoveMeter(4);
  });

  /* ---------------- Teardown ---------------- */
  socket.on('leave-room', leave);
  socket.on('disconnect', () => {
    leave();
    console.log(`[socket] disconnected ${socket.id}`);
  });

  function leave() {
    if (!roomId) return;
    const data = rooms.get(roomId);
    if (data && data.users.delete(socket.id)) {
      io.to(roomId).emit('user-left', { socketId: socket.id });
      console.log(`[room:${roomId}] - ${me?.name || socket.id} — ${data.users.size} online`);
      if (data.users.size === 0) rooms.delete(roomId);
    }
    socket.leave(roomId);
    roomId = null;
    me = null;
  }
});

app.get('/healthz', (_req, res) => {
  res.json({ ok: true, rooms: rooms.size });
});

app.use(express.static(path.join(__dirname, 'dist')));
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`OmniCall signalling server → http://localhost:${PORT}`);
});
