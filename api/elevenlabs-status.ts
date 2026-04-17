import type { VercelRequest, VercelResponse } from '@vercel/node'
import { applyRateLimit } from './_shared/rate-limit.js'

export const config = { maxDuration: 8 }

const RATE_LIMIT = { max: 5, windowMs: 60_000 }
const MIN_REMAINING_CREDITS = 50

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  if (applyRateLimit(req, res, 'elevenlabs-status', RATE_LIMIT)) return

  const apiKey = process.env.ELEVENLABS_API_KEY
  if (!apiKey) {
    res.status(200).json({ available: false })
    return
  }

  try {
    const response = await fetch('https://api.elevenlabs.io/v1/user/subscription', {
      headers: { 'xi-api-key': apiKey },
      signal: AbortSignal.timeout(4000),
    })

    if (!response.ok) {
      res.status(200).json({ available: false })
      return
    }

    const data = await response.json() as { character_count?: number; character_limit?: number }
    const limit = Number(data?.character_limit)
    const count = Number(data?.character_count)

    if (!Number.isFinite(limit) || !Number.isFinite(count)) {
      res.status(200).json({ available: true })
      return
    }

    res.status(200).json({ available: limit - count > MIN_REMAINING_CREDITS })
  } catch {
    res.status(200).json({ available: false })
  }
}
