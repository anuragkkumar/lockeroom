# Lockeroom — Real-Time Campus Chat Platform

> A zero-friction, ephemeral real-time messaging platform for college CS students. No accounts, no login — just pick a nickname and start chatting.

**Live Demo:** [lockeroom-1.onrender.com](https://lockeroom-1.onrender.com) &nbsp;|&nbsp; **Backend API:** [lockeroom-backend.onrender.com](https://lockeroom-backend.onrender.com/api/health)

---

## Architecture Overview

```
┌─────────────────────────────────────┐     ┌──────────────────────────────────────┐
│         Frontend  (Vercel)          │────▶│         Backend  (Render)            │
│  React 19 · Tailwind · Socket.IO   │     │  Node.js · Express · Socket.IO       │
│         SPA with edge CDN           │◀────│  SQLite (WAL) · REST + WebSocket     │
└─────────────────────────────────────┘     └──────────────────────────────────────┘
```

- **Frontend** served via Vercel global edge CDN (zero server runtime cost)
- **Backend** stateful WebSocket + REST microservice on Render with dynamic CORS origin reflection
- **Database** SQLite in Write-Ahead Logging (WAL) mode — zero-latency persistence, no external DB hop

---

## Key Engineering Decisions

### 1. Matchmaking Queue — Atomic Collision-Free Stranger Pairing
The stranger chat uses an **in-memory priority queue** with atomic splice operations. Each match attempt:
- Checks both socket ID **and** device fingerprint to prevent self-matching
- Falls back gracefully if a candidate disconnects mid-match
- Maintains a `recentStrangerPartners` Map (10-min TTL) for post-disconnect abuse reporting

### 2. Dual-Window Sliding Rate Limiter
Server-side anti-spam without user accounts or external Redis:
- **Burst window:** 5 msgs / 5s
- **Sustained window:** 30 msgs / 60s
- **Minimum gap:** 350ms between any two messages
- Per-socket memory buckets, pruned on disconnect

### 3. Device-Level Moderation Without PII
- Device fingerprint banning persisted in SQLite
- Reconnecting banned devices are rejected at the WebSocket handshake layer
- All in-flight sockets for a banned device are disconnected server-side instantly

### 4. SQLite Dual-Engine Adapter
```js
try {
  Database = require('better-sqlite3');   // native C++ — faster, synchronous
} catch {
  Database = require('node:sqlite').DatabaseSync;  // Node 22+ built-in fallback
}
```
Zero-compilation resilience across Node versions and cloud build environments.

---

## Features

| Feature | Details |
|---------|---------|
| **Zero-friction sessions** | Nickname-only, no account, no OAuth |
| **19 concurrent channels** | `#general` + `#section-a` through `#section-r` |
| **Stranger matchmaking** | 1:1 anonymous pairing, skip, leave, and post-disconnect reporting |
| **Real-time presence** | Live per-room online counts, Discord-style unread badges |
| **Anti-spam rate limiting** | Dual sliding-window + 350ms debounce, server-enforced |
| **Moderator console** | Token-authenticated at `/mod` — reports, bans, live viewer stats |
| **Live viewer panel** | Per-room online breakdown, stranger queue stats, auto-refreshes every 10s |
| **Device banning** | Persistent SQLite ban list, enforced on connect + all active sockets |

---

## Tech Stack

| Layer | Technologies |
|-------|-------------|
| **Frontend** | React 19, Tailwind CSS, Radix UI, Lucide Icons, Sonner, `socket.io-client` |
| **Backend** | Node.js, Express.js, Socket.IO v4 |
| **Database** | SQLite 3 (WAL mode) via `better-sqlite3` / `node:sqlite` |
| **Deployment** | Frontend → Vercel · Backend → Render |
| **Tooling** | craco, ESLint, Git |

---

## Local Development

### Backend
```bash
cd backend
npm install --omit=optional
npm start
# → http://localhost:8001
# → Socket.IO at /api/socket.io/
```

Create `backend/.env`:
```env
PORT=8001
MOD_TOKEN=<your-secret-moderator-token>
```

### Frontend
```bash
cd frontend
npm install --legacy-peer-deps
npm start
# → http://localhost:3000
```

Create `frontend/.env`:
```env
PORT=3000
REACT_APP_BACKEND_URL=http://localhost:8001
```

---

## Production Deployment

### Backend → Render (Web Service)
| Setting | Value |
|---------|-------|
| **Root Directory** | `backend` |
| **Build Command** | `npm install` |
| **Start Command** | `node server.js` |
| **Environment Variable** | `MOD_TOKEN=<your-private-token>` |
| **Health Check Path** | `/api/health` |

### Frontend → Vercel
| Setting | Value |
|---------|-------|
| **Root Directory** | `frontend` |
| **Framework** | Create React App |
| **Environment Variable** | `REACT_APP_BACKEND_URL=https://your-backend.onrender.com` |

The `frontend/vercel.json` includes SPA rewrite rules for client-side routing.

---

## API Reference

```
GET  /api/health              → { status, service, time }
GET  /api/rooms               → { general, sections[] }
GET  /api/messages/:room      → { room, messages[] }

POST /api/mod/verify          → verify moderator token
GET  /api/mod/reports         → paginated report list (open/resolved/all)
POST /api/mod/reports/:id/resolve
POST /api/mod/reports/:id/reopen
POST /api/mod/ban             → ban device by ID
POST /api/mod/unban           → unban device
GET  /api/mod/bans            → list all banned devices
GET  /api/mod/stats           → live online counts per room + stranger queue
```

**Socket.IO Events**

| Event | Direction | Description |
|-------|-----------|-------------|
| `room:join` | Client → Server | Join a public channel |
| `room:leave` | Client → Server | Leave a channel |
| `message:send` | Client → Server | Broadcast a message (rate-limited) |
| `stranger:find` | Client → Server | Enter matchmaking queue |
| `stranger:skip` | Client → Server | Skip current stranger, re-queue |
| `stranger:leave` | Client → Server | End stranger session |
| `stranger:report` | Client → Server | Report stranger (up to 10 min post-disconnect) |
| `presence:update` | Server → Client | Room online count update |
| `banned` | Server → Client | Device ban notification |

---

## Security

- **No PII stored**: device fingerprinting is a randomly generated UUID stored in `localStorage`, never tied to identity
- **Secret tokens**: `MOD_TOKEN` is never committed — set exclusively via platform environment variables
- **CORS**: Dynamic origin reflection with `credentials: true` for cross-domain Vercel ↔ Render communication
- **Rate limiting**: Server-enforced; cannot be bypassed by client-side manipulation

---

*Built by [@anuragkkumar](https://github.com/anuragkkumar)*
