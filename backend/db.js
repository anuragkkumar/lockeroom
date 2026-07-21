const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, 'chat.db');
const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room TEXT NOT NULL,
    nickname TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_room_time ON messages(room, created_at);

  CREATE TABLE IF NOT EXISTS last_seen (
    device_id TEXT NOT NULL,
    room TEXT NOT NULL,
    last_seen_at INTEGER NOT NULL,
    PRIMARY KEY (device_id, room)
  );

  CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reporter_device_id TEXT NOT NULL,
    reported_device_id TEXT NOT NULL,
    room TEXT,
    created_at INTEGER NOT NULL
  );
`);

// Migration: add columns if the table pre-existed without them
try {
  const cols = db.prepare("PRAGMA table_info(reports)").all().map((c) => c.name);
  if (!cols.includes('resolved')) db.exec('ALTER TABLE reports ADD COLUMN resolved INTEGER NOT NULL DEFAULT 0');
  if (!cols.includes('resolved_at')) db.exec('ALTER TABLE reports ADD COLUMN resolved_at INTEGER');
  if (!cols.includes('note')) db.exec('ALTER TABLE reports ADD COLUMN note TEXT');
} catch (e) {
  console.warn('[cs-chatroom] reports migration warning:', e.message);
}

// Prepared statements
const stmts = {
  insertMessage: db.prepare(
    'INSERT INTO messages (room, nickname, content, created_at) VALUES (?, ?, ?, ?)'
  ),
  latestMessages: db.prepare(
    'SELECT id, room, nickname, content, created_at FROM messages WHERE room = ? ORDER BY created_at DESC, id DESC LIMIT ?'
  ),
  messagesBefore: db.prepare(
    'SELECT id, room, nickname, content, created_at FROM messages WHERE room = ? AND (created_at < ? OR (created_at = ? AND id < ?)) ORDER BY created_at DESC, id DESC LIMIT ?'
  ),
  countAfter: db.prepare(
    'SELECT COUNT(*) as c FROM messages WHERE room = ? AND created_at > ?'
  ),
  countAll: db.prepare(
    'SELECT COUNT(*) as c FROM messages WHERE room = ?'
  ),
  getLastSeen: db.prepare(
    'SELECT last_seen_at FROM last_seen WHERE device_id = ? AND room = ?'
  ),
  upsertLastSeen: db.prepare(
    `INSERT INTO last_seen (device_id, room, last_seen_at) VALUES (?, ?, ?)
     ON CONFLICT(device_id, room) DO UPDATE SET last_seen_at = excluded.last_seen_at`
  ),
  insertReport: db.prepare(
    'INSERT INTO reports (reporter_device_id, reported_device_id, room, created_at) VALUES (?, ?, ?, ?)'
  ),
  listReports: db.prepare(
    `SELECT id, reporter_device_id, reported_device_id, room, created_at, resolved, resolved_at, note
     FROM reports
     WHERE (@status = 'all')
        OR (@status = 'open' AND resolved = 0)
        OR (@status = 'resolved' AND resolved = 1)
     ORDER BY created_at DESC
     LIMIT @limit OFFSET @offset`
  ),
  countReports: db.prepare(
    `SELECT
       COUNT(*) as total,
       SUM(CASE WHEN resolved = 0 THEN 1 ELSE 0 END) as open,
       SUM(CASE WHEN resolved = 1 THEN 1 ELSE 0 END) as resolved
     FROM reports`
  ),
  countReportsForDevice: db.prepare(
    'SELECT COUNT(*) as c FROM reports WHERE reported_device_id = ?'
  ),
  resolveReport: db.prepare(
    'UPDATE reports SET resolved = 1, resolved_at = ?, note = ? WHERE id = ?'
  ),
  reopenReport: db.prepare(
    'UPDATE reports SET resolved = 0, resolved_at = NULL WHERE id = ?'
  ),
};

function insertMessage(room, nickname, content) {
  const created_at = Date.now();
  const info = stmts.insertMessage.run(room, nickname, content, created_at);
  return { id: info.lastInsertRowid, room, nickname, content, created_at };
}

function getLatestMessages(room, limit = 50) {
  const rows = stmts.latestMessages.all(room, limit);
  return rows.reverse();
}

function getMessagesBefore(room, beforeCreatedAt, beforeId, limit = 50) {
  const rows = stmts.messagesBefore.all(room, beforeCreatedAt, beforeCreatedAt, beforeId, limit);
  return rows.reverse();
}

function markRead(device_id, room, ts = Date.now()) {
  stmts.upsertLastSeen.run(device_id, room, ts);
  return ts;
}

function getUnreadCount(device_id, room) {
  const seen = stmts.getLastSeen.get(device_id, room);
  if (!seen) return 0; // First time ever — treat as 0
  return stmts.countAfter.get(room, seen.last_seen_at).c;
}

function insertReport(reporter, reported, room) {
  stmts.insertReport.run(reporter, reported, room || null, Date.now());
}

function listReports({ status = 'open', limit = 50, offset = 0 } = {}) {
  const rows = stmts.listReports.all({
    status,
    limit: Math.min(200, Math.max(1, Number(limit) || 50)),
    offset: Math.max(0, Number(offset) || 0),
  });
  // Enrich with per-device report counts
  const deviceCounts = new Map();
  for (const r of rows) {
    if (!deviceCounts.has(r.reported_device_id)) {
      deviceCounts.set(
        r.reported_device_id,
        stmts.countReportsForDevice.get(r.reported_device_id).c
      );
    }
  }
  return rows.map((r) => ({
    ...r,
    resolved: !!r.resolved,
    reported_device_report_count: deviceCounts.get(r.reported_device_id) || 0,
  }));
}

function reportStats() {
  const row = stmts.countReports.get();
  return {
    total: row.total || 0,
    open: row.open || 0,
    resolved: row.resolved || 0,
  };
}

function resolveReport(id, note = '') {
  const info = stmts.resolveReport.run(Date.now(), (note || '').toString().slice(0, 500), id);
  return info.changes > 0;
}

function reopenReport(id) {
  const info = stmts.reopenReport.run(id);
  return info.changes > 0;
}

module.exports = {
  db,
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
};
