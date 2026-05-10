# PortID Sync Server

The self-hostable backend for PortID. Zero-knowledge by design — it stores **only** username → encrypted-data-hash mappings. Never sees plaintext.

## Quick Deploy

### Vercel (recommended for free tier)
```bash
cd sync-server
npx vercel --prod
```

### Railway
[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/template)
```bash
cd sync-server
railway up
```

### Docker
```bash
cd sync-server
docker build -t portid-sync .
docker run -p 3000:3000 -v ./data:/app portid-sync
```

### Local
```bash
cd sync-server
npm install
npm start
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3000 | Server port |
| `DB_PATH` | ./portid.db | SQLite database path |
| `STORAGE_MODE` | auto | `ipfs` (Pinata) or `local` (disk). Auto-detects from PINATA_JWT |
| `PINATA_JWT` | — | Pinata API token for IPFS pinning |
| `PORTID_SECRET` | — | Secret for dashboard `/api/stats` endpoint |
| `RATE_LIMIT_MAX` | 100 | Max requests per 15-minute window |

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Server status |
| POST | `/api/register` | Register new user |
| POST | `/api/set-hash` | Update user's backup hash |
| GET | `/api/get-hash` | Get user's current hash |
| POST | `/api/backup` | Upload encrypted data → IPFS |
| GET | `/api/restore` | Download encrypted data from IPFS |
| GET | `/api/stats` | Developer dashboard metrics |
| POST | `/api/device/register` | Register a new device |

## Storage Modes

**IPFS (production):** Set `PINATA_JWT` — encrypted blobs are pinned to IPFS via Pinata. Free tier gives 500 pins. Data is content-addressed and decentralized.

**Local (development):** Without `PINATA_JWT`, encrypted blobs are stored as files in `.blobs/`. Uses SHA-256 content hashing to simulate IPFS addressing. Works offline.

## What the server knows

- Username (per app)
- IPFS hash (pointer to encrypted data)
- Backup count and timing
- Device count
- Storage size

## What the server NEVER knows

- Passwords
- Recovery keys
- Decrypted user data
- What the data contains
