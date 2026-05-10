/**
 * PortID Sync Server
 * 
 * A minimal, self-hostable sync server for PortID.
 * Stores ONLY: username → encrypted_data_hash mappings.
 * Never sees plaintext user data.
 * 
 * Endpoints:
 *   POST /api/register       — Register a new user (stores username + initial hash)
 *   POST /api/set-hash       — Update a user's backup hash
 *   GET  /api/get-hash       — Get a user's current backup hash
 *   POST /api/backup         — Upload encrypted data, pin to IPFS, return hash
 *   GET  /api/restore        — Download encrypted data from IPFS by hash
 *   GET  /api/stats          — Developer dashboard metadata (no user data)
 *   GET  /api/health         — Server health check
 * 
 * Storage: SQLite (single file, zero-config, embedded)
 * IPFS: Pinata (free tier: 500 pins) or local file storage fallback
 * 
 * Deploy: Vercel, Railway, Fly.io, Docker, or any Node.js host.
 * 
 * Environment variables:
 *   PORT              — Server port (default: 3000)
 *   PORTID_SECRET     — Server admin secret for dashboard access
 *   PINATA_JWT        — Pinata API JWT for IPFS pinning (optional)
 *   STORAGE_MODE      — "ipfs" (default) or "local" (stores encrypted blobs on disk)
 *   DB_PATH           — SQLite database path (default: ./portid.db)
 *   RATE_LIMIT_MAX    — Max requests per 15min window (default: 100)
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Config ──────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;
const DB_PATH = process.env.DB_PATH || join(__dirname, 'portid.db');
const STORAGE_MODE = process.env.STORAGE_MODE || (process.env.PINATA_JWT ? 'ipfs' : 'local');
const PINATA_JWT = process.env.PINATA_JWT || '';
const PORTID_SECRET = process.env.PORTID_SECRET || '';
const RATE_LIMIT_MAX = parseInt(process.env.RATE_LIMIT_MAX || '100');
const BLOB_DIR = join(__dirname, '.blobs');

// ── Database ────────────────────────────────────────────────────────────────

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 5000');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    app_id TEXT NOT NULL,
    username TEXT NOT NULL,
    hash TEXT,
    device_count INTEGER DEFAULT 1,
    backup_count INTEGER DEFAULT 0,
    storage_bytes INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    last_backup_at TEXT,
    UNIQUE(app_id, username)
  );

  CREATE TABLE IF NOT EXISTS backups (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    app_id TEXT NOT NULL,
    username TEXT NOT NULL,
    hash TEXT NOT NULL,
    size_bytes INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_users_app ON users(app_id);
  CREATE INDEX IF NOT EXISTS idx_backups_app ON backups(app_id);
`);

// ── IPFS / Storage ──────────────────────────────────────────────────────────

async function pinToIPFS(encryptedData) {
  if (STORAGE_MODE === 'local') {
    // Local fallback: store as files, use content hash as "IPFS hash"
    const { createHash } = await import('crypto');
    const dataStr = JSON.stringify({ kaironBackup: encryptedData, timestamp: Date.now() });
    const hash = 'Qm' + createHash('sha256').update(dataStr).digest('hex').slice(0, 44);
    
    if (!existsSync(BLOB_DIR)) mkdirSync(BLOB_DIR, { recursive: true });
    writeFileSync(join(BLOB_DIR, hash), dataStr);
    return { hash, size: Buffer.byteLength(dataStr) };
  }

  // Pinata IPFS pinning
  const payload = JSON.stringify({
    pinataContent: { kaironBackup: encryptedData },
    pinataMetadata: { name: `portid-backup-${Date.now()}` },
  });

  const res = await fetch('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${PINATA_JWT}`,
    },
    body: payload,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Pinata error: ${res.status} ${err}`);
  }

  const data = await res.json();
  return { hash: data.IpfsHash, size: Buffer.byteLength(payload) };
}

async function fetchFromIPFS(hash) {
  if (STORAGE_MODE === 'local') {
    const filePath = join(BLOB_DIR, hash);
    if (!existsSync(filePath)) return null;
    return JSON.parse(readFileSync(filePath, 'utf8'));
  }

  // Fetch from IPFS gateway
  const gateways = [
    `https://gateway.pinata.cloud/ipfs/${hash}`,
    `https://ipfs.io/ipfs/${hash}`,
    `https://cloudflare-ipfs.com/ipfs/${hash}`,
  ];

  for (const url of gateways) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (res.ok) return await res.json();
    } catch (e) { continue; }
  }
  return null;
}

// ── Express App ─────────────────────────────────────────────────────────────

const app = express();
app.use(cors());
app.use(helmet());
app.use(express.json({ limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Try again later.' },
});
app.use('/api/', limiter);

// ── Health ──────────────────────────────────────────────────────────────────

app.get('/api/health', (req, res) => {
  const userCount = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
  res.json({
    status: 'ok',
    version: '0.1.0',
    storage_mode: STORAGE_MODE,
    users: userCount,
    uptime_seconds: Math.floor(process.uptime()),
  });
});

// ── Register ────────────────────────────────────────────────────────────────

app.post('/api/register', (req, res) => {
  const { app_id, username } = req.body;
  if (!app_id || !username) {
    return res.status(400).json({ error: 'app_id and username required' });
  }

  try {
    db.prepare(`
      INSERT INTO users (app_id, username, hash) VALUES (?, ?, NULL)
    `).run(app_id, username);
    res.json({ status: 'registered', app_id, username });
  } catch (e) {
    if (e.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'Username already registered for this app' });
    }
    res.status(500).json({ error: e.message });
  }
});

// ── Set Hash ────────────────────────────────────────────────────────────────

app.post('/api/set-hash', (req, res) => {
  const { app_id, username, hash } = req.body;
  if (!app_id || !username || !hash) {
    return res.status(400).json({ error: 'app_id, username, and hash required' });
  }

  // Upsert: create user if not exists, update hash if exists
  const existing = db.prepare('SELECT id FROM users WHERE app_id = ? AND username = ?').get(app_id, username);
  
  if (existing) {
    db.prepare(`
      UPDATE users SET hash = ?, last_backup_at = datetime('now'), backup_count = backup_count + 1
      WHERE app_id = ? AND username = ?
    `).run(hash, app_id, username);
  } else {
    db.prepare(`
      INSERT INTO users (app_id, username, hash, last_backup_at, backup_count) 
      VALUES (?, ?, ?, datetime('now'), 1)
    `).run(app_id, username, hash);
  }

  res.json({ status: 'updated', hash });
});

// ── Get Hash ────────────────────────────────────────────────────────────────

app.get('/api/get-hash', (req, res) => {
  const { app_id, username } = req.query;
  if (!app_id || !username) {
    return res.status(400).json({ error: 'app_id and username query params required' });
  }

  const row = db.prepare('SELECT hash FROM users WHERE app_id = ? AND username = ?').get(app_id, username);
  if (!row) {
    return res.status(404).json({ error: 'User not found' });
  }

  res.json({ ipfsHash: row.hash, app_id, username });
});

// ── Backup ──────────────────────────────────────────────────────────────────

app.post('/api/backup', async (req, res) => {
  const { encryptedData, username, app_id } = req.body;
  if (!encryptedData) {
    return res.status(400).json({ error: 'encryptedData required' });
  }

  try {
    const { hash, size } = await pinToIPFS(encryptedData);

    // Track backup
    if (app_id && username) {
      db.prepare(`
        INSERT INTO backups (app_id, username, hash, size_bytes) VALUES (?, ?, ?, ?)
      `).run(app_id || 'unknown', username || 'unknown', hash, size);

      db.prepare(`
        UPDATE users SET hash = ?, storage_bytes = storage_bytes + ?, 
        backup_count = backup_count + 1, last_backup_at = datetime('now')
        WHERE app_id = ? AND username = ?
      `).run(hash, size, app_id, username);
    }

    res.json({ ipfsHash: hash, size });
  } catch (e) {
    res.status(500).json({ error: `Backup failed: ${e.message}` });
  }
});

// ── Restore ─────────────────────────────────────────────────────────────────

app.get('/api/restore', async (req, res) => {
  const { hash } = req.query;
  if (!hash) {
    return res.status(400).json({ error: 'hash query param required' });
  }

  try {
    const data = await fetchFromIPFS(hash);
    if (!data) {
      return res.status(404).json({ error: 'Backup not found' });
    }
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: `Restore failed: ${e.message}` });
  }
});

// ── Developer Dashboard Stats ───────────────────────────────────────────────

app.get('/api/stats', (req, res) => {
  // Optional: protect with PORTID_SECRET
  const secret = req.headers['x-portid-secret'] || req.query.secret;
  if (PORTID_SECRET && secret !== PORTID_SECRET) {
    return res.status(401).json({ error: 'Unauthorized. Provide x-portid-secret header.' });
  }

  const { app_id } = req.query;

  if (app_id) {
    // Per-app stats
    const users = db.prepare('SELECT COUNT(*) as c FROM users WHERE app_id = ?').get(app_id).c;
    const totalBackups = db.prepare('SELECT COUNT(*) as c FROM backups WHERE app_id = ?').get(app_id).c;
    const totalStorage = db.prepare('SELECT COALESCE(SUM(storage_bytes), 0) as s FROM users WHERE app_id = ?').get(app_id).s;
    const totalDevices = db.prepare('SELECT COALESCE(SUM(device_count), 0) as d FROM users WHERE app_id = ?').get(app_id).d;
    const activeLastDay = db.prepare(`
      SELECT COUNT(*) as c FROM users WHERE app_id = ? AND last_backup_at > datetime('now', '-1 day')
    `).get(app_id).c;
    const activeLastWeek = db.prepare(`
      SELECT COUNT(*) as c FROM users WHERE app_id = ? AND last_backup_at > datetime('now', '-7 days')
    `).get(app_id).c;

    res.json({
      app_id,
      users,
      total_backups: totalBackups,
      total_storage_bytes: totalStorage,
      total_storage_mb: Math.round(totalStorage / 1024 / 1024 * 10) / 10,
      total_devices: totalDevices,
      active_last_24h: activeLastDay,
      active_last_7d: activeLastWeek,
    });
  } else {
    // Global stats (all apps)
    const apps = db.prepare('SELECT DISTINCT app_id FROM users').all().map(r => r.app_id);
    const totalUsers = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
    const totalBackups = db.prepare('SELECT COUNT(*) as c FROM backups').get().c;
    const totalStorage = db.prepare('SELECT COALESCE(SUM(storage_bytes), 0) as s FROM users').get().s;

    res.json({
      apps: apps.length,
      app_ids: apps,
      total_users: totalUsers,
      total_backups: totalBackups,
      total_storage_bytes: totalStorage,
      total_storage_mb: Math.round(totalStorage / 1024 / 1024 * 10) / 10,
      storage_mode: STORAGE_MODE,
    });
  }
});

// ── Device Registration ─────────────────────────────────────────────────────

app.post('/api/device/register', (req, res) => {
  const { app_id, username } = req.body;
  if (!app_id || !username) {
    return res.status(400).json({ error: 'app_id and username required' });
  }

  const row = db.prepare('SELECT id FROM users WHERE app_id = ? AND username = ?').get(app_id, username);
  if (!row) {
    return res.status(404).json({ error: 'User not found' });
  }

  db.prepare('UPDATE users SET device_count = device_count + 1 WHERE app_id = ? AND username = ?')
    .run(app_id, username);

  const updated = db.prepare('SELECT device_count FROM users WHERE app_id = ? AND username = ?')
    .get(app_id, username);

  res.json({ status: 'device_registered', device_count: updated.device_count });
});

// ── Start ───────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n🔐 PortID Sync Server`);
  console.log(`   Port: ${PORT}`);
  console.log(`   Storage: ${STORAGE_MODE}`);
  console.log(`   Database: ${DB_PATH}`);
  console.log(`   Rate limit: ${RATE_LIMIT_MAX} req/15min`);
  console.log(`\n   Ready.\n`);
});

export default app;
