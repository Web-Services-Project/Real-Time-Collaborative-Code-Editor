// WebSocket layer: broadcasts live edits and cursor/presence info to everyone
// in a room. Deliberately last-write-wins for the text content — a real
// implementation would swap this for a CRDT (Yjs) or OT, which is out of
// scope for this assignment set but noted in docs/design.md.
const http = require('http');
const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');

const PORT = process.env.PORT || 4003;
const DOCS_URL = process.env.DOCUMENTS_SERVICE_URL || 'http://localhost:4002';

const app = express();
app.use(cors());
app.get('/health', (req, res) => res.json({ status: 'ok', service: 'collaboration-service' }));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// roomId -> Map<socketId, { userId, userName, color }>
const presence = new Map();
// roomId -> debounce timer, so we don't hit documents-service on every keystroke
const saveTimers = new Map();

const COLORS = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899'];
function colorFor(userId) {
  let hash = 0;
  for (const ch of String(userId)) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return COLORS[hash % COLORS.length];
}

function broadcastPresence(roomId) {
  const members = Array.from((presence.get(roomId) || new Map()).values());
  io.to(roomId).emit('presence', { members });
}

function scheduleSave(roomId, content) {
  clearTimeout(saveTimers.get(roomId));
  const timer = setTimeout(async () => {
    try {
      await fetch(`${DOCS_URL}/documents/${roomId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
    } catch (err) {
      console.error(`failed to persist room ${roomId}:`, err.message);
    }
  }, 800);
  saveTimers.set(roomId, timer);
}

io.on('connection', (socket) => {
  const { roomId, userId, userName } = socket.handshake.query;
  if (!roomId || !userId) {
    socket.disconnect(true);
    return;
  }

  socket.join(roomId);
  if (!presence.has(roomId)) presence.set(roomId, new Map());
  presence.get(roomId).set(socket.id, { userId, userName: userName || 'Anonymous', color: colorFor(userId) });
  broadcastPresence(roomId);

  socket.on('edit', ({ content }) => {
    socket.to(roomId).emit('edit', { content, fromUserId: userId });
    scheduleSave(roomId, content);
  });

  socket.on('cursor', ({ position }) => {
    socket.to(roomId).emit('cursor', { userId, userName, position, color: colorFor(userId) });
  });

  socket.on('disconnect', () => {
    const room = presence.get(roomId);
    if (room) {
      room.delete(socket.id);
      if (room.size === 0) presence.delete(roomId);
    }
    broadcastPresence(roomId);
  });
});

server.listen(PORT, () => console.log(`collaboration-service listening on :${PORT}`));
