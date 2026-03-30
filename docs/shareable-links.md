# Shareable Links — Requirements & Implementation Plan

## The Idea

Allow users to share a link to their MCP-2000 session. When someone opens the
link they get their own independent copy — two people never overwrite each
other's sequences.

---

## Current State of Persistence

| What                     | Where it lives today      | Survives reload? |
| ------------------------ | ------------------------- | ---------------- |
| Pad configs / sequences  | React state (in-memory)   | No               |
| Mixer / effects          | React state               | No               |
| Audio samples            | AudioBuffer in memory      | No               |
| MIDI mappings            | localStorage              | Yes              |

**There is no project save/load at all today.** Before sharing can work, we
need a serializable "project snapshot" and somewhere to put it.

---

## What Needs to Be Stored per Shared Project

### 1. Project State (small)

All the settings that define a session, serialized as JSON:

- 4 × BankState (16 pads each — labels, sample names, URLs, source types)
- 4 × 16 PadPlaybackSettings (trim, pitch, gain, pan, mode, reversed)
- Sequences per bank (step patterns, per-step pitch offsets, mutes, length)
- Effect chains per bank + master effect chain
- Mixer state (bank gains, mutes, solos, master gain)
- Tempo

**Estimated size: ~15-25 KB JSON, ~4-8 KB compressed.**

This is trivially small. URL-encodable if we wanted.

### 2. Audio Samples (large — the real problem)

Each bank has 16 pads. A full project = up to 64 samples.

| Format          | Per sample      | Full project (64 pads) |
| --------------- | --------------- | ---------------------- |
| MP3 (from API)  | 200-500 KB      | 3-8 MB                 |
| WAV (lossless)  | 1-3 MB          | 15-45 MB               |
| AudioBuffer RAM | ~2.8 MB         | ~45-90 MB              |

**Pre-loaded fixture kits** (acoustic guitar, Kraftwerk, ice, etc.) are served
from `/public/` — these have stable URLs and don't need to be stored again.

**Generated samples** are the problem. They come back from ElevenLabs as base64
MP3 and are decoded into memory. There's no persistent URL for them. If we
only store the project state JSON with the *original* sample URLs, generated
samples would be lost.

---

## Requirements

### Must Have

1. **Snapshot project state** — serialize all bank/sequence/mixer/effects data
   into a single JSON blob.
2. **Store generated audio** — persist the MP3 bytes for any AI-generated or
   uploaded samples so they survive beyond the session.
3. **Generate a shareable URL** — short link like `mcp2000.app/s/abc123`.
4. **Load from URL → independent copy** — opening a share link creates a fresh
   local session seeded from the snapshot. No connection back to the original.
5. **No auth required** — sharing should be anonymous and frictionless.

### Nice to Have

- Expiration / TTL on shared projects (auto-cleanup)
- "Fork" badge showing the project was loaded from a share
- Download project as a local file (offline sharing)

### Non-Goals (for now)

- Real-time collaboration / multiplayer
- User accounts or project libraries
- Version history
- Comments or social features

---

## Architecture for Scale

Target: **thousands of users per day**, growing over time.

### Traffic & Storage Model

Assumptions at 2,000 daily users:

| Metric                          | Estimate                         |
| ------------------------------- | -------------------------------- |
| Users / day                     | 2,000                            |
| Share rate                      | ~20% → **400 new shares/day**    |
| Audio per project               | ~5 MB (MP3)                      |
| State JSON per project          | ~8 KB compressed                 |
| New storage / day               | ~2 GB                            |
| Reads per share (avg)           | ~3 opens → **6+ GB egress/day**  |
| Steady state (30-day TTL)       | ~60 GB stored                    |
| Steady state (90-day TTL)       | ~180 GB stored                   |

### Recommended: Google Cloud Storage + Firestore

Using GCP since it's already set up and familiar.

| Component         | Service                  | Role                         | Cost at scale     |
| ----------------- | ------------------------ | ---------------------------- | ----------------- |
| **Audio storage** | Cloud Storage            | Persist generated samples    | ~$1.50/mo (60 GB) |
| **Audio delivery** | Cloud CDN (optional)    | Edge-cache immutable audio   | ~$5-10/mo         |
| **Project state** | Firestore                | Project snapshots + metadata | Free tier → ~$5/mo |
| **Cleanup**       | Firestore TTL + Vercel Cron | Auto-expire projects, cron cleans GCS | $0     |
| **App hosting**   | Vercel                   | Frontend + API (existing)    | Existing plan     |
| **Total**         |                          |                              | **~$5-20/mo**     |

### Why Firestore

- **Built-in TTL** — set an `expiresAt` timestamp field and Firestore
  auto-deletes expired documents. No cron needed for project cleanup.
- **Serverless** — no schema migrations, no connection pooling, no infra to
  manage.
- **Generous free tier** — 1 GiB storage, 50K reads/day, 20K writes/day.
  At 400 shares/day that's well within free.
- **Indexed queries** — rate limiting by IP, orphan sample detection.

### Why Cloud Storage

- Already set up in the project's GCP account
- Public bucket + `Cache-Control: immutable` headers for browser/CDN caching
- Cloud CDN can be added later if egress costs grow
- Familiar tooling (gsutil, console, IAM)

### Content-Hash Deduplication

Many projects will share the same audio samples (especially fixture kits, but
also when users fork and re-share). Before uploading to GCS:

1. SHA-256 hash the audio file
2. Check if hash exists in the `shared_samples` Firestore collection
3. If yes → reuse the existing GCS URL, increment ref count
4. If no → upload to GCS as `samples/{hash}.mp3`

This reduces storage 20-40% and makes cleanup safe — only delete blobs when
ref count hits zero.

### CDN Strategy

Audio samples are **write-once, read-many, immutable**. Perfect for caching:

- GCS public bucket serves audio with `Cache-Control: public, max-age=31536000, immutable`
- URLs are content-addressed: `storage.googleapis.com/{bucket}/samples/{sha256}.mp3`
- Cloud CDN can be layered on top later if egress costs grow
- Browser caching alone handles most repeat visits

### Rate Limiting & Abuse Prevention

| Layer              | Limit                          | Mechanism         |
| ------------------ | ------------------------------ | ----------------- |
| Share creation      | 10/hour per IP                | Vercel middleware  |
| Upload size         | 20 MB max per project         | API validation     |
| Total samples       | 64 max per project (4 × 16)  | Schema constraint  |
| Concurrent uploads  | 4 parallel per client         | Client-side        |

At this scale, a reCAPTCHA or similar challenge on share creation is worth
adding if bot abuse appears.

### Automated Cleanup

**Projects:** Firestore TTL auto-deletes expired project documents — no cron
needed.

**Orphaned audio files:** Daily Vercel Cron job (`/api/cron/cleanup-shares`):

1. Query Firestore for samples with `refCount <= 0`
2. Delete those files from Cloud Storage
3. Delete the Firestore sample documents

This keeps GCS storage bounded at the TTL steady state.

### Alternatives Considered

**Vercel Blob + KV** — convenient but expensive at scale. Egress kills you
past ~100 projects/day.

**Cloudflare R2** — zero egress fees, but adds a new account/service. Worth
revisiting if GCS egress costs become significant.

**Supabase** — good all-in-one (Postgres + storage) but another account to
manage when GCP is already available.

**URL-encoded state only** — works for the ~8 KB of settings JSON, but cannot
include audio. Could be a fallback for fixture-kit-only projects.

---

## Implementation Plan

### Phase 1: Serializable Project Snapshot

**Goal:** Define the project format and prove we can round-trip it.

1. Define a `ProjectSnapshot` TypeScript type covering all saveable state
2. Write `serializeProject()` — walks current React state → JSON blob
3. Write `deserializeProject()` — JSON blob → sets all React state
4. Classify sample URLs: fixture (public path) vs generated (needs upload)
5. Add a snapshot format version field for future migrations

**This phase has value on its own** — even without sharing, it enables
save/load, undo/redo, and any future persistence features.

### Phase 2: Audio Sample Storage (Cloud Storage)

**Goal:** Generated/uploaded samples get persisted with deduplication.

1. Create a public Cloud Storage bucket with uniform access control
2. Single `POST /api/share` endpoint handles both sample upload and project
   creation in one request:
   - SHA-256 hashes each audio file for dedup
   - Uploads to GCS as `samples/{hash}.mp3` if not already present
   - Stores sample metadata in Firestore `shared_samples` collection
   - Rewrites snapshot URLs and stores in `shared_projects` collection
3. During share flow, upload non-fixture samples → rewrite snapshot with
   permanent GCS URLs

### Phase 3: Share Link Creation & Loading

**Goal:** End-to-end sharing works.

1. `POST /api/share` endpoint (combined with Phase 2):
   - Generates short ID (nanoid, 8 chars)
   - Stores snapshot in Firestore with TTL (30 days)
   - Returns share URL
2. `GET /api/share?id=xxx` endpoint:
   - Looks up snapshot in Firestore
   - Returns full project JSON
   - 404 for expired/missing links
3. Frontend: detect `?s=xxx` in URL on app load
   - Fetch snapshot → `deserializeProject()` → user has their own copy
   - Clear the URL param — no persistent link back to the original
4. UI: "Share" button in header → uploads samples → creates link → copies
   to clipboard
5. Rate limiting: 10 shares/hour per IP, 2 MB max per sample, 64 max samples

### Phase 4: Cleanup & Observability

1. Enable Firestore TTL policy on `shared_projects.expiresAt` field
   (auto-deletes expired project docs)
2. Vercel Cron job (`/api/cron/cleanup-shares`, daily):
   - Find orphaned samples (refCount <= 0) in Firestore
   - Delete their GCS files
   - Delete the Firestore sample docs
3. Error handling: expired links, failed uploads, quota exceeded

### Phase 5: Polish

- Progress bar during share creation (parallel sample upload)
- "Loaded from shared link" fork badge
- Download project as `.mcp2000` JSON file (offline sharing)
- Turnstile CAPTCHA on share creation if abuse appears

---

## Data Flow

```
User clicks "Share"
        │
        ▼
serializeProject() → ProjectSnapshot JSON
        │
        ▼
For each non-fixture sample:
  SHA-256 hash → check dedup → upload to GCS if new
        │
        ▼
Rewrite snapshot with permanent GCS URLs
        │
        ▼
POST /api/share → Firestore (project doc + sample refs)
        │
        ▼
Return URL: mcp2000.app/s/abc123 → clipboard
        │
        ║
        ║  (someone opens link)
        ║
        ▼
GET /api/share?id=abc123 → fetch snapshot from Firestore
        │
        ▼
deserializeProject() → populate React state
        │
        ▼
Fetch audio from GCS (cached) → decode → AudioBuffers
        │
        ▼
Independent session — no connection to original
```

### Cleanup Flow (daily cron)

```
/api/cron/cleanup-shares
        │
        ▼
Query Firestore: shared_samples where refCount <= 0
        │
        ▼
DELETE matching files from Cloud Storage
        │
        ▼
DELETE matching Firestore sample docs
```

(Firestore TTL auto-deletes expired project docs — no cron needed for that.)

---

## Firestore Collections

### `shared_projects` (TTL-enabled)

```
doc id: nanoid (8 chars)
{
  snapshot:     string     // Full ProjectSnapshot JSON (~8-25 KB)
  sampleHashes: string[]  // SHA-256 hashes of linked audio samples
  createdAt:    timestamp
  expiresAt:    timestamp  // Firestore TTL deletes doc after this
  creatorIp:    string     // For rate limiting
}
```

### `shared_samples`

```
doc id: SHA-256 hash of audio content
{
  gcsPath:    string     // Cloud Storage path: samples/{hash}.mp3
  gcsUrl:     string     // Public URL
  sizeBytes:  number
  refCount:   number     // Incremented per project link, cron deletes at 0
  createdAt:  timestamp
}
```

---

## Open Questions

1. **TTL policy** — 30 days seems right to start. Can extend for popular
   projects later (e.g., "pin" a project by resetting its TTL when opened).
2. **Sample licensing** — ElevenLabs TOS allows redistribution of generated
   audio? Worth checking before launch.
3. **R2 region** — single region (auto) or multi-region? Auto is fine with
   CDN in front.

---

## Verdict

**Feasible at scale. ~$5-20/month on GCP handles thousands of daily users.**

The project state is tiny (~8 KB compressed). Audio storage (~5 MB/project)
is the dominant cost. At 60 GB steady state with a 30-day TTL, Cloud Storage
costs ~$1.50/month. Firestore's free tier covers the metadata easily.

The architecture is:
- **Cloud Storage** for audio (public bucket, immutable cache headers)
- **Firestore** for project metadata (serverless, TTL auto-expiry)
- **Vercel** for app hosting + API + cron (existing infrastructure)
- **Content-hash dedup** to cut storage 20-40%

**Environment variables needed in Vercel:**
- `GCP_PROJECT_ID` — your GCP project
- `GOOGLE_APPLICATION_CREDENTIALS` — path to service account key JSON
  (or use Vercel's GCP integration for workload identity)
- `GCS_BUCKET_NAME` — the Cloud Storage bucket for audio samples
- `CRON_SECRET` — any random string to protect the cleanup endpoint
