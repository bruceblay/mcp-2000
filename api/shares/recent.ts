import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireCronSecret } from '../_shared/rate-limit.js'
import { listRecentShares } from '../_shared/db.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Use GET /api/shares/recent.' })
    return
  }

  if (requireCronSecret(req, res)) return

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
