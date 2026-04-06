import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requestSchema, executeGenerateKit } from './_shared/index.js'
import { logPrompt } from './_shared/db.js'
import { applyRateLimit } from './_shared/rate-limit.js'

export const config = { maxDuration: 60 }

const RATE_LIMIT = { max: 8, windowMs: 60_000 }

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Use POST /api/generate-kit.' })
    return
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    res.status(500).json({ error: 'Missing ANTHROPIC_API_KEY.' })
    return
  }

  if (applyRateLimit(req, res, 'generate-kit', RATE_LIMIT)) return

  try {
    const parsedRequest = requestSchema.parse(req.body)
    const mode = parsedRequest.mode === 'random-sequence' ? 'generate-sequence' as const
      : parsedRequest.mode === 'sequence' ? 'generate-sequence' as const
      : parsedRequest.mode === 'loop' ? 'generate-loop' as const
      : parsedRequest.mode === 'pad' ? 'generate-pad' as const
      : 'generate-kit' as const
    logPrompt(mode, parsedRequest.prompt, { bankId: parsedRequest.bankId, mode: parsedRequest.mode })
    const result = await executeGenerateKit(
      process.env.ANTHROPIC_API_KEY,
      process.env.ELEVENLABS_API_KEY || '',
      parsedRequest,
    )

    if (result.type === 'sequence') {
      res.status(200).json({
        bankId: result.bankId,
        summary: result.summary,
        generatedSequence: result.generatedSequence,
      })
      return
    }

    if (result.type === 'loop') {
      res.status(200).json({
        bankId: result.bankId,
        summary: result.summary,
        generatedLoop: result.generatedLoop,
      })
      return
    }

    res.status(200).json({
      bankId: result.bankId,
      summary: result.summary,
      generatedPads: result.generatedPads,
    })
  } catch (error) {
    console.error('generate-kit error:', error)
    res.status(500).json({ error: 'Generation failed. Please try again.' })
  }
}
