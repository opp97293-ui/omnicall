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
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 5000;

// Rooms state: roomId -> Map(socketId -> UserInfo)
const rooms = new Map();

io.on('connection', (socket) => {
  console.log(`[Socket] Connected: ${socket.id}`);

  let currentRoomId = null;
  let currentUser = null;

  socket.on('join-room', ({ roomId, userName, avatar, micOn = true, videoOn = true, peerId }) => {
    currentRoomId = roomId;
    socket.join(roomId);

    if (!rooms.has(roomId)) {
      rooms.set(roomId, {
        users: new Map(),
        messages: []
      });
    }

    const roomData = rooms.get(roomId);
    const roomUsers = roomData.users;

    currentUser = {
      socketId: socket.id,
      peerId: peerId || socket.id,
      name: userName || `User-${socket.id.slice(0, 4)}`,
      avatar: avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${socket.id}`,
      micOn,
      videoOn,
      raisedHand: false,
      joinedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    roomUsers.set(socket.id, currentUser);

    // Send existing users list & room chat history
    const existingUsers = Array.from(roomUsers.values()).filter(u => u.socketId !== socket.id);
    socket.emit('room-users', existingUsers);
    socket.emit('room-chat-history', roomData.messages);

    // Notify others in room that a new user joined
    socket.to(roomId).emit('user-joined', currentUser);
    console.log(`[Room ${roomId}] User ${currentUser.name} (${socket.id}) joined.`);
  });

  // Native WebRTC Signal Routing (Offer, Answer, ICE Candidates)
  socket.on('offer', ({ to, offer }) => {
    console.log(`[Signal] Offer from ${socket.id} to ${to}`);
    io.to(to).emit('offer', { from: socket.id, offer });
  });

  socket.on('answer', ({ to, answer }) => {
    console.log(`[Signal] Answer from ${socket.id} to ${to}`);
    io.to(to).emit('answer', { from: socket.id, answer });
  });

  socket.on('ice-candidate', ({ to, candidate }) => {
    io.to(to).emit('ice-candidate', { from: socket.id, candidate });
  });

  socket.on('sending-signal', ({ to, signal, fromUser }) => {
    io.to(to).emit('user-signal', {
      signal,
      from: socket.id,
      fromUser
    });
  });

  socket.on('returning-signal', ({ to, signal }) => {
    io.to(to).emit('receiving-returned-signal', {
      signal,
      from: socket.id
    });
  });

  // Media toggle updates (Mic / Camera)
  socket.on('toggle-media', ({ micOn, videoOn }) => {
    if (currentRoomId && rooms.has(currentRoomId)) {
      const roomUsers = rooms.get(currentRoomId).users;
      if (roomUsers.has(socket.id)) {
        const user = roomUsers.get(socket.id);
        user.micOn = micOn;
        user.videoOn = videoOn;
        io.to(currentRoomId).emit('user-media-toggled', {
          socketId: socket.id,
          micOn,
          videoOn
        });
      }
    }
  });

  // Raise hand
  socket.on('toggle-raise-hand', ({ raisedHand }) => {
    if (currentRoomId && rooms.has(currentRoomId)) {
      const roomUsers = rooms.get(currentRoomId).users;
      if (roomUsers.has(socket.id)) {
        const user = roomUsers.get(socket.id);
        user.raisedHand = raisedHand;
        io.to(currentRoomId).emit('user-hand-toggled', {
          socketId: socket.id,
          raisedHand
        });
      }
    }
  });

  // Chat message
  socket.on('send-message', ({ message }) => {
    if (currentRoomId && currentUser && rooms.has(currentRoomId)) {
      const roomData = rooms.get(currentRoomId);
      const chatMsg = {
        id: Date.now().toString() + Math.random().toString(36).substr(2, 4),
        senderId: socket.id,
        senderName: currentUser.name,
        senderAvatar: currentUser.avatar,
        text: message,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      roomData.messages.push(chatMsg);
      if (roomData.messages.length > 200) roomData.messages.shift();

      io.to(currentRoomId).emit('new-message', chatMsg);
    }
  });

  // Emoji Reactions
  socket.on('send-reaction', ({ emoji }) => {
    if (currentRoomId && currentUser) {
      io.to(currentRoomId).emit('new-reaction', {
        id: Date.now().toString() + Math.random().toString(36).substr(2, 4),
        senderName: currentUser.name,
        emoji
      });
    }
  });

  // Screen share signal broadcast
  socket.on('screen-share-status', ({ isSharing }) => {
    if (currentRoomId) {
      socket.to(currentRoomId).emit('user-screen-share', {
        socketId: socket.id,
        isSharing
      });
    }
  });

  // Leave room
  socket.on('leave-room', () => {
    handleLeave();
  });

  socket.on('disconnect', () => {
    console.log(`[Socket] Disconnected: ${socket.id}`);
    handleLeave();
  });

  function handleLeave() {
    if (currentRoomId && rooms.has(currentRoomId)) {
      const roomData = rooms.get(currentRoomId);
      const roomUsers = roomData.users;
      if (roomUsers.has(socket.id)) {
        roomUsers.delete(socket.id);
        io.to(currentRoomId).emit('user-left', { socketId: socket.id });
        if (roomUsers.size === 0) {
          rooms.delete(currentRoomId);
        }
      }
    }
    currentRoomId = null;
    currentUser = null;
  }
});

// Serve frontend assets
app.use(express.static(path.join(__dirname, 'dist')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

httpServer.listen(PORT, () => {
  console.log(`🚀 OmniCall Signaling Server running on http://localhost:${PORT}`);
});
