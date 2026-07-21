# CS Chatroom — PRD

## Original Problem
Build a real-time web chatroom app for a college CS department called **CS Chatroom**.

## Tech Stack
- Backend: Node.js + Express + Socket.IO (port 8001, supervised)
- Frontend: React (CRA) + Tailwind + shadcn/ui, sonner for toasts
- Database: SQLite (better-sqlite3) at `/app/backend/data/chat.db`
- Socket.IO path: `/api/socket.io/` (routed via K8s ingress)

## Architecture
- Landing (`/`) → nickname entry → Chat (`/chat`)
- Device identity: persistent `device_id` (crypto.randomUUID) in localStorage; nickname stored per session
- Rooms: `general` + `section-a..section-r` (18) + ephemeral `stranger-<uuid>`
- Socket events: `room:join`, `room:leave`, `message:send`, `message:new`, `message:bump`, `messages:loadOlder`, `presence:update/snapshot`, `unread:snapshot`, `room:markRead`, `stranger:find/skip/cancel/leave/report/matched/left`
- SQLite tables: `messages`, `last_seen`, `reports`

## User Personas
- CS students between classes wanting a low-friction chat
- Students in a specific section wanting section-scoped chat
- Users wanting anonymous 1:1 chat with a random peer

## Core Requirements (static)
1. No accounts — nickname-only sessions
2. Section rooms A–R + General with live online count and 50-msg history
3. Random Stranger matchmaking with skip/report/disconnect handling (ephemeral)
4. Unread badges per device with live real-time bumps
5. Discord-inspired minimal dark UI, green accents, mobile responsive

## Implemented (2026-02)
- ✅ Node + Express + Socket.IO backend with SQLite persistence
- ✅ Landing page (hero, nickname entry, 3 feature cards)
- ✅ Sidebar with General + 18 sections + pinned Random Stranger + user strip + logout
- ✅ Chat panel (header w/ live online count, message feed, input with Enter-to-send)
- ✅ Message persistence + latest-50 on join + infinite scroll for older
- ✅ Unread badges (green pill) with live bump events; markRead on open
- ✅ First-time-device unread returns 0 per spec
- ✅ Random Stranger: queue, matchmaking, skip, leave, report, disconnect
- ✅ Presence broadcasts on join/leave/disconnect
- ✅ Mobile hamburger sidebar overlay
- ✅ 18/18 backend tests + all UI flows verified

## Backlog / Nice-to-haves
- P1: Server-side rate limiting on `message:send`
- P1: Emoji reactions / message deletion
- P1: Section-specific banner/topic settings
- P2: PWA install + push notifications
- P2: Message search
- P2: Slash commands (/me, /shrug)
- P2: Basic moderation admin view for reports

## Test Credentials
None — nickname-only. See `/app/memory/test_credentials.md`.

## Iteration 2 (2026-02) — Moderator Console
- ✅ MOD_TOKEN env-based auth (currently `cs-mod-2026`)
- ✅ Backend REST: POST /api/mod/verify, GET /api/mod/reports (open/resolved/all), POST /api/mod/reports/:id/resolve, POST /api/mod/reports/:id/reopen
- ✅ SQLite migration: added `resolved`, `resolved_at`, `note` columns to reports
- ✅ Frontend /mod route with sign-in gate (sessionStorage) + stats cards + filter tabs + resolve/reopen actions + repeat-offender highlight
- ✅ Landing footer discoverability link "moderator ↗"
- ✅ 13/13 new backend mod tests + 18 prior tests passing; UI verified end-to-end

## Iteration 3 & 4 (2026-02)
- ✅ Bug fix: Landing page channel grid tiles (GEN + A–R) and 3 feature cards are now clickable — navigate to the target room; if no nickname, focus input and remember target (iter 3, 11/11)
- ✅ P1: Server-side rate limiter on `message:send` (MIN_GAP=350ms, BURST=5/5s, SUSTAINED=30/60s); per-socket sliding window; applies to public + stranger rooms; bucket cleared on disconnect. Frontend maps rule → human toast.
- ✅ P2: Sidebar channel clicks now push URL query params (?room=/tab=stranger); direct-link `/chat?room=section-k` opens that section on mount. General room keeps URL clean.
- ✅ P2: Moderator console pagination (page size 25; prev/next controls; `showing X–Y of Z` + `page N / M`; filter change resets to page 1). Backend `/api/mod/reports?limit&offset` already supported.
- ✅ 42/42 backend tests + full UI verification (iter 4).
