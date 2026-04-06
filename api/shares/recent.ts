import type { VercelRequest, VercelResponse } from '@vercel/node'
import { timingSafeEqual } from 'crypto'
import { listRecentShares } from '../_shared/db.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Use GET /api/shares/recent.' })
    return
  }

  const authHeader = req.headers.authorization ?? ''
  const expected = `Bearer ${process.env.CRON_SECRET?.trim() ?? ''}`
  const a = Buffer.from(authHeader)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    res.status(401).json({ error: 'Unauthorized.' })
    return
  }

  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200)
    const shares = await listRecentShares(limit)

    res.setHeader('Cache-Control', 'no-store')
    res.status(200).json({ shares })
  } catch (error) {
    console.error('list shares error:', error)
    res.status(500).json({ error: 'Failed to list shares.' })
  }
}
