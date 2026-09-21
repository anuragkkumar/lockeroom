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
  banDevice,
  unbanDevice,
  isDeviceBanned,
  listBannedDevices,
} = require('./db');

const PORT = parseInt(process.env.PORT || '8001', 10);
const MOD_TOKEN = (process.env.MOD_TOKEN || '').trim();

// Room definitions
const SECTIONS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R'];
const PUBLIC_ROOMS = ['general', ...SECTIONS.map((s) => `section-${s.toLowerCase()}`)];
const PUBLIC_ROOMS_SET = new Set(PUBLIC_ROOMS);

function isStrangerRoom(room) {
  return typeof room === 'string' && room.startsWith('stranger-');
}

// -------- Express app --------
const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

app.get('/', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'Lockeroom Backend API',
    health: '/api/health',
    rooms: '/api/rooms'
  });
});

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
  const provided = String(
    req.get('x-mod-token') ||
    (req.get('authorization') || '').replace(/^Bearer\s+/i, '') ||
    ''
  ).trim();
  if (provided !== MOD_TOKEN) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
}

app.post('/api/mod/verify', (req, res) => {
  const provided = String((req.body && req.body.token) || req.get('x-mod-token') || '').trim();
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

app.post('/api/mod/ban', requireMod, (req, res) => {
  const { deviceId, reason } = req.body || {};
  if (!deviceId) return res.status(400).json({ ok: false, error: 'deviceId required' });
  banDevice(deviceId, reason || 'Banned by moderator');
  // Disconnect any active sockets belonging to this device
  for (const [, s] of io.sockets.sockets) {
    if (s.data?.deviceId === deviceId) {
      s.emit('banned', { error: 'device_banned', reason: reason || 'Banned by moderator' });
      s.disconnect(true);
    }
  }
  res.json({ ok: true, deviceId });
});

app.post('/api/mod/unban', requireMod, (req, res) => {
  const { deviceId } = req.body || {};
  if (!deviceId) return res.status(400).json({ ok: false, error: 'deviceId required' });
  const ok = unbanDevice(deviceId);
  res.json({ ok, deviceId });
});

app.get('/api/mod/bans', requireMod, (_req, res) => {
  const bans = listBannedDevices();
  res.json({ bans });
});

app.get('/api/mod/stats', requireMod, (_req, res) => {
  const totalOnline = io.sockets.sockets.size;
  const perRoom = {};
  for (const room of PUBLIC_ROOMS) {
    perRoom[room] = getRoomSize(room);
  }
  // Count active stranger pairs
  const strangerActive = strangerPairs.size; // each side stored separately
  const strangerSearching = waitingQueue.length;
  res.json({
    totalOnline,
    perRoom,
    stranger: { paired: Math.floor(strangerActive / 2), searching: strangerSearching },
  });
});

// -------- HTTP + Socket.IO --------
const server = http.createServer(app);
const io = new Server(server, {
  path: '/api/socket.io/',
  cors: { origin: (origin, callback) => callback(null, true), methods: ['GET', 'POST'], credentials: true },
});

// State
const waitingQueue = []; // [{ socketId, deviceId, nickname }]
const strangerPairs = new Map(); // socket.id -> { room, partnerId }
const recentStrangerPartners = new Map(); // socket.id -> { partnerDeviceId, room, ts }

function getRoomSize(room) {
  const s = io.sockets.adapter.rooms.get(room);
  return s ? s.size : 0;
}

function broadcastPresence(room) {
  if (!PUBLIC_ROOMS_SET.has(room)) return;
  io.to(room).emit('presence:update', { room, online: getRoomSize(room) });
}

// -------- Rate limiter (sliding window, per socket) --------
// Rules: max 5 messages / 5s (burst), max 30 messages / 60s (sustained), min 350ms gap
const RATE_BURST = { window: 5000, max: 5 };
const RATE_SUSTAINED = { window: 60000, max: 30 };
const MIN_GAP_MS = 350;
const rateBuckets = new Map(); // socketId -> number[] (timestamps)

function checkRateLimit(socketId) {
  const now = Date.now();
  const arr = rateBuckets.get(socketId) || [];
  // Prune old
  const cutoff = now - RATE_SUSTAINED.window;
  let i = 0;
  while (i < arr.length && arr[i] < cutoff) i++;
  const pruned = i === 0 ? arr : arr.slice(i);

  // Min gap
  if (pruned.length > 0 && now - pruned[pruned.length - 1] < MIN_GAP_MS) {
    return { ok: false, retryAfter: MIN_GAP_MS - (now - pruned[pruned.length - 1]), rule: 'too-fast' };
  }
  // Burst window
  const burstCutoff = now - RATE_BURST.window;
  const burstCount = pruned.filter((t) => t >= burstCutoff).length;
  if (burstCount >= RATE_BURST.max) {
    return { ok: false, retryAfter: RATE_BURST.window, rule: 'burst' };
  }
  // Sustained window
  if (pruned.length >= RATE_SUSTAINED.max) {
    return { ok: false, retryAfter: RATE_SUSTAINED.window, rule: 'sustained' };
  }
  pruned.push(now);
  rateBuckets.set(socketId, pruned);
  return { ok: true };
}


io.on('connection', (socket) => {
  const { deviceId, nickname } = socket.handshake.auth || {};
  const devId = deviceId || `anon-${socket.id}`;
  if (isDeviceBanned(devId)) {
    socket.emit('banned', { error: 'device_banned', reason: 'Device is banned by moderator' });
    socket.disconnect(true);
    return;
  }
  socket.data.deviceId = devId;
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

      if (isDeviceBanned(socket.data.deviceId)) {
        cb && cb({ ok: false, error: 'device_banned' });
        return;
      }

      // Rate limit BEFORE any broadcast/persist
      const rl = checkRateLimit(socket.id);
      if (!rl.ok) {
        cb && cb({
          ok: false,
          error: 'rate_limited',
          rule: rl.rule,
          retryAfter: rl.retryAfter,
        });
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
    const me = io.sockets.sockets.get(sid);

    // Save recent partner for both sides so either can report even after separation
    if (me && partner) {
      recentStrangerPartners.set(sid, {
        partnerDeviceId: partner.data?.deviceId || 'unknown',
        room,
        ts: Date.now(),
      });
      recentStrangerPartners.set(partnerId, {
        partnerDeviceId: me.data?.deviceId || 'unknown',
        room,
        ts: Date.now(),
      });
    }

    if (partner) {
      partner.leave(room);
      strangerPairs.delete(partnerId);
      partner.emit('stranger:left', { room, reason });
    }
    if (me) me.leave(room);
  }

  function removeFromQueue(sid) {
    const idx = waitingQueue.findIndex((e) => e.socketId === sid);
    if (idx !== -1) waitingQueue.splice(idx, 1);
  }

  function tryMatch() {
    while (waitingQueue.length >= 2) {
      const a = waitingQueue.shift();
      // Ensure b is a different socket and distinct device
      const bIdx = waitingQueue.findIndex(
        (e) => e.socketId !== a.socketId && e.deviceId !== a.deviceId
      );
      if (bIdx === -1) {
        // No suitable distinct partner available right now; put a back and stop
        waitingQueue.unshift(a);
        break;
      }
      const [b] = waitingQueue.splice(bIdx, 1);

      const sa = io.sockets.sockets.get(a.socketId);
      const sb = io.sockets.sockets.get(b.socketId);
      if (!sa || !sb) {
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
    if (isDeviceBanned(socket.data.deviceId)) {
      cb && cb({ ok: false, error: 'device_banned' });
      return;
    }

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
    if (isDeviceBanned(socket.data.deviceId)) {
      cb && cb({ ok: false, error: 'device_banned' });
      return;
    }

    cleanupPair(socket.id, 'skipped');
    removeFromQueue(socket.id); // Ensure removed before re-entering queue
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
    let reportedDeviceId = null;
    let reportRoom = room;

    const pair = strangerPairs.get(socket.id);
    if (pair) {
      const partner = io.sockets.sockets.get(pair.partnerId);
      reportedDeviceId = partner?.data?.deviceId || 'unknown';
      reportRoom = room || pair.room;
    } else {
      // Fallback to recently disconnected partner (within 10 minutes)
      const recent = recentStrangerPartners.get(socket.id);
      if (recent && Date.now() - recent.ts < 10 * 60 * 1000) {
        reportedDeviceId = recent.partnerDeviceId;
        reportRoom = room || recent.room;
      }
    }

    if (!reportedDeviceId) {
      cb && cb({ ok: false, error: 'not in stranger chat' });
      return;
    }

    insertReport(socket.data.deviceId, reportedDeviceId, reportRoom);
    cb && cb({ ok: true });
  });

  socket.on('disconnect', () => {
    removeFromQueue(socket.id);
    if (strangerPairs.has(socket.id)) cleanupPair(socket.id, 'disconnected');
    if (socket.data.currentRoom && PUBLIC_ROOMS_SET.has(socket.data.currentRoom)) {
      broadcastPresence(socket.data.currentRoom);
    }
    rateBuckets.delete(socket.id);
    // Expire old entries from recentStrangerPartners
    const cutoff = Date.now() - 10 * 60 * 1000;
    for (const [sid, item] of recentStrangerPartners) {
      if (item.ts < cutoff) recentStrangerPartners.delete(sid);
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[cs-chatroom] server listening on 0.0.0.0:${PORT}`);
  console.log(`[cs-chatroom] socket.io path: /api/socket.io/`);
});
