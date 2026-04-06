import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createHash } from 'crypto'
import { nanoid } from 'nanoid'
import { insertProject, getProject, findExistingSample, insertSample, countRecentSharesByIp } from './_shared/db.js'
import { uploadSample } from './_shared/gcs.js'
import { getClientIp, applyRateLimit } from './_shared/rate-limit.js'

export const config = { maxDuration: 30 }

const BURST_RATE_LIMIT = { max: 10, windowMs: 60_000 }
const RATE_LIMIT_WINDOW_SECONDS = 60 * 60 // 1 hour
const RATE_LIMIT_MAX_SHARES = 10
const MAX_SAMPLES = 64
const MAX_SAMPLE_SIZE_BYTES = 2 * 1024 * 1024 // 2 MB per sample
const MAX_SNAPSHOT_SIZE_BYTES = 100 * 1024 // 100 KB

type ShareRequestSample = {
  /** Original blob URL (used as key to map back to snapshot) */
  originalUrl: string
  /** Base64-encoded audio data */
  audioBase64: string
}

type ShareRequestBody = {
  /** Serialized ProjectSnapshot JSON */
  snapshot: string
  /** Samples that need uploading (blob: URLs with their audio data) */
  samples: ShareRequestSample[]
}

const sha256 = (buffer: Buffer) => createHash('sha256').update(buffer).digest('hex')

// ---------------------------------------------------------------------------
// POST /api/share — create a share link
// GET  /api/share?id=xxx — load a shared project
// ---------------------------------------------------------------------------

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // --- Load a shared project ---
  if (req.method === 'GET') {
    const id = req.query.id
    if (typeof id !== 'string' || !id) {
      res.status(400).json({ error: 'Missing share id.' })
      return
    }

    try {
      const snapshotJson = await getProject(id)
      if (!snapshotJson) {
        res.status(404).json({ error: 'Share not found or expired.' })
        return
      }
      res.setHeader('Cache-Control', 'public, max-age=300')
      res.status(200).json({ snapshot: snapshotJson })
    } catch (error) {
      console.error('share load error:', error)
      res.status(500).json({ error: 'Failed to load share.' })
    }
    return
  }

  // --- Create a share ---
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Use GET or POST /api/share.' })
    return
  }

  if (applyRateLimit(req, res, 'share', BURST_RATE_LIMIT)) return

  try {
    const body = req.body as ShareRequestBody
    if (!body.snapshot || typeof body.snapshot !== 'string') {
      res.status(400).json({ error: 'Missing snapshot.' })
      return
    }
    if (body.snapshot.length > MAX_SNAPSHOT_SIZE_BYTES) {
      res.status(400).json({ error: 'Snapshot too large.' })
      return
    }

    const samples = body.samples ?? []
    if (samples.length > MAX_SAMPLES) {
      res.status(400).json({ error: `Too many samples (max ${MAX_SAMPLES}).` })
      return
    }

    // Rate limiting
    const clientIp = getClientIp(req)
    const recentCount = await countRecentSharesByIp(clientIp, RATE_LIMIT_WINDOW_SECONDS)
    if (recentCount >= RATE_LIMIT_MAX_SHARES) {
      res.status(429).json({ error: 'Rate limit exceeded. Try again later.' })
      return
    }

    // Upload samples with dedup
    const urlMap: Record<string, string> = {} // originalUrl → gcsUrl
    const sampleHashes: string[] = []

    for (const sample of samples) {
      const audioBuffer = Buffer.from(sample.audioBase64, 'base64')
      if (audioBuffer.length > MAX_SAMPLE_SIZE_BYTES) {
        res.status(400).json({ error: `Sample too large (max ${MAX_SAMPLE_SIZE_BYTES / 1024}KB).` })
        return
      }

      const hash = sha256(audioBuffer)

      // Check if already uploaded (dedup)
      const existingUrl = await findExistingSample(hash)
      if (existingUrl) {
        urlMap[sample.originalUrl] = existingUrl
        sampleHashes.push(hash)
        continue
      }

      // Upload to Cloud Storage
      const { gcsPath, gcsUrl } = await uploadSample(hash, audioBuffer)
      await insertSample(hash, gcsPath, gcsUrl, audioBuffer.length)
      urlMap[sample.originalUrl] = gcsUrl
      sampleHashes.push(hash)
    }

    // Rewrite snapshot with permanent URLs
    let snapshotJson = body.snapshot
    for (const [originalUrl, gcsUrl] of Object.entries(urlMap)) {
      snapshotJson = snapshotJson.replaceAll(JSON.stringify(originalUrl), JSON.stringify(gcsUrl))
    }

    // Also clear needsUpload flags
    snapshotJson = snapshotJson.replaceAll('"needsUpload":true', '"needsUpload":false')

    // Store project
    const shareId = nanoid(8)
    await insertProject(shareId, snapshotJson, sampleHashes, clientIp)

    res.status(201).json({ id: shareId })
  } catch (error) {
    console.error('share create error:', error)
    res.status(500).json({ error: 'Failed to create share.' })
  }
}
