import type { VercelRequest, VercelResponse } from '@vercel/node'
import { listRecentPrompts } from '../_shared/db.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Use GET /api/shares/prompts.' })
    return
  }

  const authHeader = req.headers.authorization
  if (authHeader !== `Bearer ${process.env.CRON_SECRET?.trim()}`) {
    res.status(401).json({ error: 'Unauthorized.' })
    return
  }

  try {
    const limit = Math.min(Number(req.query.limit) || 100, 500)
    const prompts = await listRecentPrompts(limit)

    res.setHeader('Cache-Control', 'no-store')
    res.status(200).json({ prompts })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to list prompts.'
    res.status(500).json({ error: message })
  }
}
