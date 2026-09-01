import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireCronSecret } from '../_shared/rate-limit.js'
import { listRecentPrompts } from '../_shared/db.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Use GET /api/shares/prompts.' })
    return
  }

  if (requireCronSecret(req, res)) return

  try {
    const limit = Math.min(Number(req.query.limit) || 100, 500)
    const prompts = await listRecentPrompts(limit)

    res.setHeader('Cache-Control', 'no-store')
    res.status(200).json({ prompts })
  } catch (error) {
    console.error('list prompts error:', error)
    res.status(500).json({ error: 'Failed to list prompts.' })
  }
}
