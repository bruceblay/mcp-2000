import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requestSchema, executeGenerateKit } from './_shared'

export const config = { maxDuration: 60 }

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Use POST /api/generate-kit.' })
    return
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    res.status(500).json({ error: 'Missing ANTHROPIC_API_KEY.' })
    return
  }

  try {
    const parsedRequest = requestSchema.parse(req.body)
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
    const message = error instanceof Error ? error.message : 'Unexpected generation error.'
    res.status(500).json({ error: message })
  }
}
