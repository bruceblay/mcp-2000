import type { VercelRequest, VercelResponse } from '@vercel/node'
import { transformSampleSchema, executeTransformSample } from './_shared/index.js'
import { logPrompt } from './_shared/db.js'

export const config = { maxDuration: 60 }

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Use POST /api/transform-sample.' })
    return
  }

  if (!process.env.ELEVENLABS_API_KEY) {
    res.status(500).json({ error: 'Missing ELEVENLABS_API_KEY.' })
    return
  }

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
    const message = error instanceof Error ? error.message : 'Unexpected transform error.'
    res.status(500).json({ error: message })
  }
}
