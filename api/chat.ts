import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createAnthropic } from '@ai-sdk/anthropic'
import { streamText } from 'ai'
import { z } from 'zod'
import { CHAT_SYSTEM_PROMPT } from './_shared/index.js'
import { applyRateLimit } from './_shared/rate-limit.js'

export const config = { maxDuration: 60 }

const RATE_LIMIT = { max: 30, windowMs: 60_000 }

const chatRequestSchema = z.object({
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string().min(1).max(4000),
  })).min(1).max(50),
})

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Use POST /api/chat.' })
    return
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    res.status(500).json({ error: 'Missing ANTHROPIC_API_KEY.' })
    return
  }

  if (applyRateLimit(req, res, 'chat', RATE_LIMIT)) return

  const parsed = chatRequestSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid messages.' })
    return
  }

  const { messages } = parsed.data

  const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const result = streamText({
    model: anthropic('claude-haiku-4-5-20251001'),
    system: CHAT_SYSTEM_PROMPT,
    messages,
  })

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')

  const reader = result.textStream

  for await (const chunk of reader) {
    res.write(`data: ${JSON.stringify(chunk)}\n\n`)
  }

  res.write('data: [DONE]\n\n')
  res.end()
}
