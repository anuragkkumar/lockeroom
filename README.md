# CS Chatroom ("Lockeroom")

A fast, real-time web chatroom for college Computer Science students. Zero friction: nickname-only sessions, section rooms (A–R), a global `#general` room, Omegle-style anonymous 1:1 Stranger chat, and a full Moderator Console.

---

## 🚀 Quick Start

### 1. Backend Setup

```bash
cd backend
npm install --omit=optional
npm start
```
- Server runs on `http://localhost:8001`
- Socket.IO path: `/api/socket.io/`
- Default environment variables are in `backend/.env`:
  - `PORT=8001`
  - `MOD_TOKEN=<set your secret token>`

Run automated verification tests:
```bash
npm test
```

### 2. Frontend Setup

```bash
cd frontend
npm install --legacy-peer-deps
npm start
```
- Client runs on `http://localhost:3000`
- Environment variables configured in `frontend/.env`:
  - `PORT=3000`
  - `REACT_APP_BACKEND_URL=http://localhost:8001`

---

## 🌟 Key Features

1. **No-Account / Pseudonymous Sessions**: Pick a handle on the landing page and start chatting immediately.
2. **Channel Directory**:
   - `#general`: Department-wide public channel.
   - `#section-a` through `#section-r`: 18 isolated section channels.
   - `#random-stranger`: 1:1 anonymous pairing with skip, leave, and post-disconnect reporting.
3. **Real-Time Badges & Presence**:
   - Live online member counts per room.
   - Discord-inspired unread badges (`#23a559` green pill).
4. **Rate Limiting & Safety**:
   - Server-side sliding window (min 350ms gap, 5 msgs / 5s burst, 30 msgs / 60s sustained).
   - Instant reporting for abusive strangers.
5. **Moderator Portal (`/mod`)**:
   - Authenticated console (Token set via `MOD_TOKEN` environment variable).
   - Review reported sessions, repeat offender tracking, resolve/reopen reports, and ban offending device IDs.

---

## 🛠️ Tech Stack

- **Frontend**: React 19, Tailwind CSS, shadcn / Radix UI, Lucide Icons, Sonner (toasts), `socket.io-client`.
- **Backend**: Node.js, Express, Socket.IO, SQLite (`node:sqlite` / `better-sqlite3`).
- **Database**: SQLite at `backend/data/chat.db` (WAL mode enabled).
