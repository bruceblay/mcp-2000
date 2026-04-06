import type { VercelRequest, VercelResponse } from '@vercel/node'
import { transformSampleSchema, executeTransformSample } from './_shared/index.js'
import { logPrompt } from './_shared/db.js'
import { applyRateLimit } from './_shared/rate-limit.js'

export const config = { maxDuration: 60 }

const RATE_LIMIT = { max: 10, windowMs: 60_000 }

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Use POST /api/transform-sample.' })
    return
  }

  if (!process.env.ELEVENLABS_API_KEY) {
    res.status(500).json({ error: 'Missing ELEVENLABS_API_KEY.' })
    return
  }

  if (applyRateLimit(req, res, 'transform-sample', RATE_LIMIT)) return

  try {
    const parsedRequest = transformSampleSchema.parse(req.body)
    logPrompt('transform-sample', parsedRequest.prompt, { sampleName: parsedRequest.sampleName, editorSource: parsedRequest.editorSource })
    const result = await executeTransformSample(process.env.ELEVENLABS_API_KEY, parsedRequest)

    res.status(200).json({
      summary: result.summary,
      transformedSample: {
        sampleName: result.sampleName,
        sampleFile: result.sampleFile,
        sourceType: result.sourceType,
        audioBase64: result.audioBase64,
      },
    })
  } catch (error) {
    console.error('transform-sample error:', error)
    res.status(500).json({ error: 'Transform failed. Please try again.' })
  }
}
