require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');

const {
  insertMessage,
  getLatestMessages,
  getMessagesBefore,
  markRead,
  getUnreadCount,
  insertReport,
  listReports,
  reportStats,
  resolveReport,
  reopenReport,
} = require('./db');

const PORT = parseInt(process.env.PORT || '8001', 10);
const MOD_TOKEN = process.env.MOD_TOKEN || '';

// Room definitions
const SECTIONS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R'];
const PUBLIC_ROOMS = ['general', ...SECTIONS.map((s) => `section-${s.toLowerCase()}`)];
const PUBLIC_ROOMS_SET = new Set(PUBLIC_ROOMS);

function isStrangerRoom(room) {
  return typeof room === 'string' && room.startsWith('stranger-');
}

// -------- Express app --------
const app = express();
app.use(cors({ origin: '*', credentials: true }));
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'cs-chatroom', time: Date.now() });
});

app.get('/api/rooms', (_req, res) => {
  res.json({
    general: 'general',
    sections: SECTIONS.map((s) => ({ id: `section-${s.toLowerCase()}`, label: `Section ${s}` })),
  });
});

// Return latest 50 messages (used by REST fallback if needed)
app.get('/api/messages/:room', (req, res) => {
  const room = req.params.room;
  if (!PUBLIC_ROOMS_SET.has(room)) {
    return res.status(404).json({ error: 'unknown room' });
  }
  const messages = getLatestMessages(room, 50);
  res.json({ room, messages });
});

// -------- Moderator endpoints --------
function requireMod(req, res, next) {
  if (!MOD_TOKEN) {
    return res.status(503).json({ error: 'moderator disabled: MOD_TOKEN not configured' });
  }
  const provided =
    req.get('x-mod-token') ||
    (req.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (provided !== MOD_TOKEN) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
}

app.post('/api/mod/verify', (req, res) => {
  const provided = (req.body && req.body.token) || req.get('x-mod-token') || '';
  if (!MOD_TOKEN) return res.status(503).json({ ok: false, error: 'mod disabled' });
  if (provided !== MOD_TOKEN) return res.status(401).json({ ok: false, error: 'invalid token' });
  res.json({ ok: true });
});

app.get('/api/mod/reports', requireMod, (req, res) => {
  const status = ['open', 'resolved', 'all'].includes(req.query.status) ? req.query.status : 'open';
  const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
  const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
  const reports = listReports({ status, limit, offset });
  const stats = reportStats();
  res.json({ status, limit, offset, stats, reports });
});

app.post('/api/mod/reports/:id/resolve', requireMod, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const note = (req.body && req.body.note) || '';
  const ok = resolveReport(id, note);
  if (!ok) return res.status(404).json({ ok: false, error: 'not found' });
  res.json({ ok: true, id });
});

app.post('/api/mod/reports/:id/reopen', requireMod, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const ok = reopenReport(id);
  if (!ok) return res.status(404).json({ ok: false, error: 'not found' });
  res.json({ ok: true, id });
});

// -------- HTTP + Socket.IO --------
const server = http.createServer(app);
const io = new Server(server, {
  path: '/api/socket.io/',
  cors: { origin: '*', methods: ['GET', 'POST'], credentials: true },
});

// State
const waitingQueue = []; // [{ socketId, deviceId, nickname }]
const strangerPairs = new Map(); // socket.id -> { room, partnerId }

function getRoomSize(room) {
  const s = io.sockets.adapter.rooms.get(room);
  return s ? s.size : 0;
}

function broadcastPresence(room) {
  if (!PUBLIC_ROOMS_SET.has(room)) return;
  io.to(room).emit('presence:update', { room, online: getRoomSize(room) });
}

io.on('connection', (socket) => {
  const { deviceId, nickname } = socket.handshake.auth || {};
  socket.data.deviceId = deviceId || `anon-${socket.id}`;
  socket.data.nickname = (nickname || 'anonymous').toString().slice(0, 32);
  socket.data.currentRoom = null;

  // ---- Public room: join ----
  socket.on('room:join', ({ room }, cb) => {
    try {
      if (!PUBLIC_ROOMS_SET.has(room)) {
        cb && cb({ ok: false, error: 'unknown room' });
        return;
      }

      // Leave previous public room
      if (socket.data.currentRoom && PUBLIC_ROOMS_SET.has(socket.data.currentRoom)) {
        const prev = socket.data.currentRoom;
        socket.leave(prev);
        broadcastPresence(prev);
      }

      socket.join(room);
      socket.data.currentRoom = room;

      const messages = getLatestMessages(room, 50);
      const online = getRoomSize(room);
      cb && cb({ ok: true, room, messages, online });
      broadcastPresence(room);
    } catch (err) {
      cb && cb({ ok: false, error: err.message });
    }
  });

  // ---- Public room: leave ----
  socket.on('room:leave', ({ room }, cb) => {
    if (!PUBLIC_ROOMS_SET.has(room)) {
      cb && cb({ ok: false });
      return;
    }
    socket.leave(room);
    if (socket.data.currentRoom === room) socket.data.currentRoom = null;
    broadcastPresence(room);
    cb && cb({ ok: true });
  });

  // ---- Load older messages ----
  socket.on('messages:loadOlder', ({ room, beforeCreatedAt, beforeId }, cb) => {
    if (!PUBLIC_ROOMS_SET.has(room)) {
      cb && cb({ ok: false, error: 'unknown room' });
      return;
    }
    const messages = getMessagesBefore(
      room,
      Number(beforeCreatedAt) || Date.now(),
      Number(beforeId) || 0,
      50
    );
    cb && cb({ ok: true, room, messages });
  });

  // ---- Send message ----
  socket.on('message:send', ({ room, content, nickname }, cb) => {
    try {
      const nick = (nickname || socket.data.nickname || 'anonymous').toString().slice(0, 32);
      const trimmed = (content || '').toString().trim().slice(0, 2000);
      if (!trimmed) {
        cb && cb({ ok: false, error: 'empty' });
        return;
      }

      // Stranger room
      if (isStrangerRoom(room)) {
        const pair = strangerPairs.get(socket.id);
        if (!pair || pair.room !== room) {
          cb && cb({ ok: false, error: 'not in stranger room' });
          return;
        }
        const payload = {
          id: `s-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          room,
          nickname: nick,
          content: trimmed,
          created_at: Date.now(),
        };
        io.to(room).emit('message:new', payload);
        cb && cb({ ok: true, message: payload });
        return;
      }

      // Public rooms
      if (!PUBLIC_ROOMS_SET.has(room)) {
        cb && cb({ ok: false, error: 'unknown room' });
        return;
      }
      const saved = insertMessage(room, nick, trimmed);
      io.to(room).emit('message:new', saved);
      // Bump unread counters for everyone in this room outside their current view
      io.emit('message:bump', { room, id: saved.id, created_at: saved.created_at });
      cb && cb({ ok: true, message: saved });
    } catch (err) {
      cb && cb({ ok: false, error: err.message });
    }
  });

  // ---- Mark read ----
  socket.on('room:markRead', ({ room }, cb) => {
    if (!PUBLIC_ROOMS_SET.has(room)) {
      cb && cb({ ok: false });
      return;
    }
    const ts = markRead(socket.data.deviceId, room);
    cb && cb({ ok: true, room, last_seen_at: ts });
  });

  // ---- Unread snapshot ----
  socket.on('unread:snapshot', (_payload, cb) => {
    const result = {};
    for (const r of PUBLIC_ROOMS) {
      result[r] = getUnreadCount(socket.data.deviceId, r);
    }
    cb && cb({ ok: true, unread: result });
  });

  // ---- Presence snapshot ----
  socket.on('presence:snapshot', (_payload, cb) => {
    const result = {};
    for (const r of PUBLIC_ROOMS) result[r] = getRoomSize(r);
    cb && cb({ ok: true, online: result });
  });

  // ==================== RANDOM STRANGER ====================
  function cleanupPair(sid, reason = 'left') {
    const pair = strangerPairs.get(sid);
    if (!pair) return;
    const { room, partnerId } = pair;
    strangerPairs.delete(sid);

    const partner = io.sockets.sockets.get(partnerId);
    if (partner) {
      partner.leave(room);
      strangerPairs.delete(partnerId);
      partner.emit('stranger:left', { room, reason });
    }
    const me = io.sockets.sockets.get(sid);
    if (me) me.leave(room);
  }

  function removeFromQueue(sid) {
    const idx = waitingQueue.findIndex((e) => e.socketId === sid);
    if (idx !== -1) waitingQueue.splice(idx, 1);
  }

  function tryMatch() {
    while (waitingQueue.length >= 2) {
      const a = waitingQueue.shift();
      const b = waitingQueue.shift();
      const sa = io.sockets.sockets.get(a.socketId);
      const sb = io.sockets.sockets.get(b.socketId);
      if (!sa || !sb) {
        // If one is missing, put the other back
        if (sa) waitingQueue.unshift(a);
        if (sb) waitingQueue.unshift(b);
        continue;
      }
      const room = `stranger-${uuidv4()}`;
      sa.join(room);
      sb.join(room);
      strangerPairs.set(sa.id, { room, partnerId: sb.id });
      strangerPairs.set(sb.id, { room, partnerId: sa.id });
      sa.emit('stranger:matched', { room, partnerNickname: b.nickname });
      sb.emit('stranger:matched', { room, partnerNickname: a.nickname });
    }
  }

  socket.on('stranger:find', ({ nickname } = {}, cb) => {
    // Leave any current stranger pair first
    if (strangerPairs.has(socket.id)) cleanupPair(socket.id, 'skipped');
    removeFromQueue(socket.id);

    const nick = (nickname || socket.data.nickname || 'anonymous').toString().slice(0, 32);
    socket.data.nickname = nick;
    waitingQueue.push({ socketId: socket.id, deviceId: socket.data.deviceId, nickname: nick });
    cb && cb({ ok: true, queued: true });
    tryMatch();
  });

  socket.on('stranger:cancel', (_p, cb) => {
    removeFromQueue(socket.id);
    cb && cb({ ok: true });
  });

  socket.on('stranger:skip', (_p, cb) => {
    cleanupPair(socket.id, 'skipped');
    // Re-enter queue
    waitingQueue.push({
      socketId: socket.id,
      deviceId: socket.data.deviceId,
      nickname: socket.data.nickname,
    });
    cb && cb({ ok: true, queued: true });
    tryMatch();
  });

  socket.on('stranger:leave', (_p, cb) => {
    cleanupPair(socket.id, 'left');
    removeFromQueue(socket.id);
    cb && cb({ ok: true });
  });

  socket.on('stranger:report', ({ room } = {}, cb) => {
    const pair = strangerPairs.get(socket.id);
    if (!pair) {
      cb && cb({ ok: false, error: 'not in stranger chat' });
      return;
    }
    const partner = io.sockets.sockets.get(pair.partnerId);
    const reportedDeviceId = partner?.data?.deviceId || 'unknown';
    insertReport(socket.data.deviceId, reportedDeviceId, room || pair.room);
    cb && cb({ ok: true });
  });

  socket.on('disconnect', () => {
    removeFromQueue(socket.id);
    if (strangerPairs.has(socket.id)) cleanupPair(socket.id, 'disconnected');
    if (socket.data.currentRoom && PUBLIC_ROOMS_SET.has(socket.data.currentRoom)) {
      broadcastPresence(socket.data.currentRoom);
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[cs-chatroom] server listening on 0.0.0.0:${PORT}`);
  console.log(`[cs-chatroom] socket.io path: /api/socket.io/`);
});
