import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createAnthropic } from '@ai-sdk/anthropic'
import { streamText } from 'ai'
import { CHAT_SYSTEM_PROMPT } from './_shared/index.js'

export const config = { maxDuration: 60 }

type ChatMessage = { role: 'user' | 'assistant'; content: string }

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Use POST /api/chat.' })
    return
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    res.status(500).json({ error: 'Missing ANTHROPIC_API_KEY.' })
    return
  }

  const { messages } = req.body as { messages?: ChatMessage[] }
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: 'messages array is required.' })
    return
  }

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
