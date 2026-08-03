// ---------------------------------------------------------------------------
// Signalling contract test.
//
// The bug that broke video was a protocol mismatch: the client emitted
// `offer`/`answer`/`ice-candidate` and listened for `room-users`, while the
// server spoke `signal` and `room-joined`. Nothing threw — the events simply
// went nowhere, so no peer connection was ever built.
//
// These tests pin the contract from the client's side, using the real server
// over a real socket, so that class of silent mismatch fails loudly instead.
// ---------------------------------------------------------------------------

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { io } from 'socket.io-client';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Random high port: a leftover server from an earlier run must not make us hang.
const PORT = 5100 + Math.floor(Math.random() * 400);
const URL = `http://localhost:${PORT}`;

let server;
const openSockets = new Set();

test.before(async () => {
  // stdio ignored on purpose: reading the child's stdout leaves a stream handle
  // open and the test runner then never exits.
  server = spawn(process.execPath, ['server.js'], {
    cwd: root,
    env: { ...process.env, PORT: String(PORT) },
    stdio: 'ignore'
  });

  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${URL}/healthz`);
      if (res.ok) return;
    } catch {
      /* not listening yet */
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`server never came up on ${PORT}`);
});

test.after(() => {
  // A socket left open by a failing assert would keep the runner alive.
  openSockets.forEach((s) => s.close());
  openSockets.clear();
  server?.kill();
});

/** Connect a client and wait until socket.id exists. */
async function connect() {
  const socket = io(URL, { transports: ['websocket'], forceNew: true });
  openSockets.add(socket);
  await once(socket, 'connect');
  return socket;
}

/** Resolve with the next payload for `event`, or reject after `ms`. */
function waitFor(socket, event, ms = 4000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for "${event}"`)), ms);
    socket.once(event, (payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

const room = () => 'r' + Math.random().toString(36).slice(2, 8);

test('join-room answers with room-joined and the joiner\'s own identity', async () => {
  const a = await connect();
  const roomId = room();

  const joined = waitFor(a, 'room-joined');
  a.emit('join-room', { roomId, userName: 'Aarav', device: 'mobile' });
  const payload = await joined;

  assert.equal(payload.you.name, 'Aarav', 'server should echo our name back');
  assert.equal(payload.you.device, 'mobile', 'device type must survive the round trip');
  assert.equal(payload.you.socketId, a.id);
  assert.deepEqual(payload.users, [], 'first joiner sees an empty peer list');
  assert.ok(Array.isArray(payload.messages));
  assert.equal(typeof payload.loveMeter, 'number');
  a.close();
});

test('second joiner is told about the first, and the first is notified', async () => {
  const a = await connect();
  const b = await connect();
  const roomId = room();

  a.emit('join-room', { roomId, userName: 'Aarav', device: 'desktop' });
  await waitFor(a, 'room-joined');

  const aSeesB = waitFor(a, 'user-joined');
  const bJoined = waitFor(b, 'room-joined');
  b.emit('join-room', { roomId, userName: 'Diya', device: 'mobile' });

  const [bPayload, joinEvt] = await Promise.all([bJoined, aSeesB]);

  // This is what drives ensureSession() on the client — if the existing-user
  // list is empty the newcomer never builds a peer and the call stays black.
  assert.equal(bPayload.users.length, 1, 'newcomer must receive the existing peer');
  assert.equal(bPayload.users[0].socketId, a.id);
  assert.equal(bPayload.users[0].name, 'Aarav');
  assert.equal(joinEvt.socketId, b.id, 'existing peer must learn the newcomer id');
  assert.equal(joinEvt.device, 'mobile');

  a.close();
  b.close();
});

test('signal relays SDP and ICE to exactly one target', async () => {
  const a = await connect();
  const b = await connect();
  const c = await connect();
  const roomId = room();

  for (const [s, n] of [[a, 'A'], [b, 'B'], [c, 'C']]) {
    s.emit('join-room', { roomId, userName: n });
    await waitFor(s, 'room-joined');
  }

  // C must never see traffic addressed to B.
  let leaked = false;
  c.on('signal', () => { leaked = true; });

  const bGot = waitFor(b, 'signal');
  const description = { type: 'offer', sdp: 'v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\n' };
  a.emit('signal', { to: b.id, description });

  const relayed = await bGot;
  assert.equal(relayed.from, a.id, 'receiver must learn who sent it');
  assert.deepEqual(relayed.description, description, 'SDP must arrive byte-identical');

  const bGotIce = waitFor(b, 'signal');
  const candidate = { candidate: 'candidate:1 1 udp 2130706431 10.0.0.1 5000 typ host', sdpMid: '0', sdpMLineIndex: 0 };
  a.emit('signal', { to: b.id, candidate });
  const ice = await bGotIce;
  assert.deepEqual(ice.candidate, candidate, 'ICE candidate must arrive intact');

  await new Promise((r) => setTimeout(r, 150));
  assert.equal(leaked, false, 'signals must be unicast, not broadcast');

  a.close(); b.close(); c.close();
});

test('media toggles broadcast to the room including the sender', async () => {
  const a = await connect();
  const b = await connect();
  const roomId = room();
  a.emit('join-room', { roomId, userName: 'A' });
  await waitFor(a, 'room-joined');
  b.emit('join-room', { roomId, userName: 'B' });
  await waitFor(b, 'room-joined');

  const bSees = waitFor(b, 'user-media-toggled');
  a.emit('toggle-media', { micOn: false, videoOn: true });
  const evt = await bSees;

  assert.equal(evt.socketId, a.id);
  assert.equal(evt.micOn, false, 'mute state must propagate for the MicOff badge');
  assert.equal(evt.videoOn, true);

  a.close(); b.close();
});

test('screen-share carries the trackId receivers need to label the track', async () => {
  const a = await connect();
  const b = await connect();
  const roomId = room();
  a.emit('join-room', { roomId, userName: 'A' });
  await waitFor(a, 'room-joined');
  b.emit('join-room', { roomId, userName: 'B' });
  await waitFor(b, 'room-joined');

  const bSees = waitFor(b, 'user-screen-share');
  a.emit('screen-share', { isSharing: true, trackId: 'track-xyz' });
  const evt = await bSees;

  assert.equal(evt.socketId, a.id);
  assert.equal(evt.isSharing, true);
  assert.equal(evt.trackId, 'track-xyz', 'without trackId the screen shows up as the camera');

  a.close(); b.close();
});

test('chat messages reach both partners with sender identity', async () => {
  const a = await connect();
  const b = await connect();
  const roomId = room();
  a.emit('join-room', { roomId, userName: 'Aarav' });
  await waitFor(a, 'room-joined');
  b.emit('join-room', { roomId, userName: 'Diya' });
  await waitFor(b, 'room-joined');

  const aEcho = waitFor(a, 'new-message');
  const bGot = waitFor(b, 'new-message');
  a.emit('send-message', { text: 'miss you' });
  const [mine, theirs] = await Promise.all([aEcho, bGot]);

  // The sender needs the echo too: Room.jsx renders its own bubbles from it.
  assert.equal(mine.text, 'miss you');
  assert.equal(mine.senderId, a.id, 'senderId drives left/right bubble alignment');
  assert.equal(theirs.senderName, 'Aarav');
  assert.ok(theirs.time, 'messages need a timestamp for the chat UI');

  a.close(); b.close();
});

test('chat history is replayed to someone who joins late', async () => {
  const a = await connect();
  const roomId = room();
  a.emit('join-room', { roomId, userName: 'A' });
  await waitFor(a, 'room-joined');
  a.emit('send-message', { text: 'first' });
  await waitFor(a, 'new-message');

  const b = await connect();
  b.emit('join-room', { roomId, userName: 'B' });
  const payload = await waitFor(b, 'room-joined');
  assert.equal(payload.messages.length, 1);
  assert.equal(payload.messages[0].text, 'first');

  a.close(); b.close();
});

test('reactions raise the love meter and award a combo when both react fast', async () => {
  const a = await connect();
  const b = await connect();
  const roomId = room();
  a.emit('join-room', { roomId, userName: 'A' });
  await waitFor(a, 'room-joined');
  b.emit('join-room', { roomId, userName: 'B' });
  await waitFor(b, 'room-joined');

  const firstMeter = waitFor(a, 'love-meter');
  a.emit('send-reaction', { emoji: '❤️' });
  const m1 = await firstMeter;
  assert.equal(m1.value, 2, 'a single reaction is worth 2');

  // Partner reacts inside the 4s window → combo bonus on top.
  const combo = waitFor(a, 'love-combo');
  b.emit('send-reaction', { emoji: '😘' });
  const evt = await combo;
  assert.equal(evt.emoji, '😘');

  a.close(); b.close();
});

test('gifts, love notes and completed challenges all move the meter', async () => {
  const a = await connect();
  const roomId = room();
  a.emit('join-room', { roomId, userName: 'A' });
  await waitFor(a, 'room-joined');

  const giftSeen = waitFor(a, 'new-gift');
  a.emit('send-gift', { gift: { id: 'ring', emoji: '💍', label: 'Promise Ring', points: 15 } });
  const gift = await giftSeen;
  assert.equal(gift.gift.points, 15);
  assert.equal(gift.senderName, 'A');

  const noteSeen = waitFor(a, 'new-love-note');
  a.emit('send-love-note', { text: 'you are my favourite' });
  const note = await noteSeen;
  assert.equal(note.text, 'you are my favourite');

  const scores = waitFor(a, 'challenge-scores');
  a.emit('challenge', { type: 'done' });
  const table = await scores;
  assert.equal(table[a.id], 1, 'completing a challenge scores a point');

  a.close();
});

test('challenge offers carry the prompt payload to the partner', async () => {
  const a = await connect();
  const b = await connect();
  const roomId = room();
  a.emit('join-room', { roomId, userName: 'Aarav' });
  await waitFor(a, 'room-joined');
  b.emit('join-room', { roomId, userName: 'Diya' });
  await waitFor(b, 'room-joined');

  const bSees = waitFor(b, 'challenge');
  const payload = { categoryId: 'spicy', label: 'Hot & Spicy', emoji: '🔥', prompt: 'Say my name' };
  a.emit('challenge', { type: 'offer', payload });
  const evt = await bSees;

  assert.equal(evt.type, 'offer');
  assert.equal(evt.fromName, 'Aarav');
  assert.deepEqual(evt.payload, payload, 'the prompt must survive so the banner can render it');

  a.close(); b.close();
});

test('leaving tells the partner so the peer connection is torn down', async () => {
  const a = await connect();
  const b = await connect();
  const roomId = room();
  a.emit('join-room', { roomId, userName: 'A' });
  await waitFor(a, 'room-joined');
  b.emit('join-room', { roomId, userName: 'B' });
  await waitFor(b, 'room-joined');

  const bSees = waitFor(b, 'user-left');
  a.emit('leave-room');
  const evt = await bSees;
  assert.equal(evt.socketId, a.id, 'without this the stale tile never disappears');

  a.close(); b.close();
});

test('an abrupt disconnect also fires user-left', async () => {
  const a = await connect();
  const b = await connect();
  const roomId = room();
  a.emit('join-room', { roomId, userName: 'A' });
  await waitFor(a, 'room-joined');
  b.emit('join-room', { roomId, userName: 'B' });
  await waitFor(b, 'room-joined');

  const bSees = waitFor(b, 'user-left');
  const aId = a.id; // socket.io clears .id on close, so capture it first
  a.close(); // simulate a closed laptop / lost network
  const evt = await bSees;
  assert.equal(evt.socketId, aId);
  b.close();
});

test('rooms are isolated from each other', async () => {
  const a = await connect();
  const b = await connect();
  a.emit('join-room', { roomId: room(), userName: 'A' });
  const pa = await waitFor(a, 'room-joined');
  b.emit('join-room', { roomId: room(), userName: 'B' });
  const pb = await waitFor(b, 'room-joined');

  assert.deepEqual(pa.users, []);
  assert.deepEqual(pb.users, []);

  let crossTalk = false;
  b.on('new-message', () => { crossTalk = true; });
  a.emit('send-message', { text: 'private' });
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(crossTalk, false, 'messages must not leak across rooms');

  a.close(); b.close();
});

test('room codes are normalised so shared links always match', async () => {
  const a = await connect();
  const b = await connect();
  const code = room().toUpperCase();

  a.emit('join-room', { roomId: code, userName: 'A' });
  await waitFor(a, 'room-joined');

  // The invite link lowercases the code; both must land in the same room.
  const bJoined = waitFor(b, 'room-joined');
  b.emit('join-room', { roomId: code.toLowerCase(), userName: 'B' });
  const payload = await bJoined;
  assert.equal(payload.users.length, 1, 'case differences must not split the room');

  a.close(); b.close();
});

/* ------------------------------------------------------------------ static */

test('client and server agree on every socket event name', () => {
  const serverSrc = readFileSync(path.join(root, 'server.js'), 'utf8');
  const clientSrc = readFileSync(path.join(root, 'src/hooks/useCall.js'), 'utf8');

  const names = (src, re) => {
    const out = new Set();
    for (const m of src.matchAll(re)) out.add(m[1]);
    return out;
  };

  const serverHandles = names(serverSrc, /socket\.on\(\s*'([\w-]+)'/g);
  const serverEmits = names(serverSrc, /emit\(\s*'([\w-]+)'/g);
  const clientEmits = names(clientSrc, /emit\(\s*'([\w-]+)'/g);
  const clientListens = names(clientSrc, /socket\.on\(\s*'([\w-]+)'/g);

  const ignore = new Set(['connect', 'disconnect', 'connect_error']);

  for (const evt of clientEmits) {
    if (ignore.has(evt)) continue;
    assert.ok(serverHandles.has(evt), `client emits "${evt}" but the server has no handler for it`);
  }
  for (const evt of clientListens) {
    if (ignore.has(evt)) continue;
    assert.ok(serverEmits.has(evt), `client listens for "${evt}" but the server never emits it`);
  }
});
