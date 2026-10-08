import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireCronSecret } from '../_shared/rate-limit.js'
import { listRecentChats } from '../_shared/db.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Use GET /api/shares/chats.' })
    return
  }

  if (requireCronSecret(req, res)) return

  try {
    const limit = Math.min(Number(req.query.limit) || 200, 500)
    const turns = await listRecentChats(limit)

    // Group flat turns back into threads, newest thread first.
    const threads = new Map<string, { conversationId: string; startedAt: number; turns: string[] }>()
    for (const turn of [...turns].sort((a, b) => a.createdAt - b.createdAt)) {
      const existing = threads.get(turn.conversationId)
      if (existing) existing.turns.push(turn.message)
      else threads.set(turn.conversationId, {
        conversationId: turn.conversationId,
        startedAt: turn.createdAt,
        turns: [turn.message],
      })
    }

    res.setHeader('Cache-Control', 'no-store')
    res.status(200).json({
      threads: [...threads.values()].sort((a, b) => b.startedAt - a.startedAt),
    })
  } catch (error) {
    console.error('list chats error:', error)
    res.status(500).json({ error: 'Failed to list chats.' })
  }
}
