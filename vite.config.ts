import type { IncomingMessage, ServerResponse } from 'node:http'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { requestSchema, transformSampleSchema, executeGenerateKit, executeTransformSample } from './api/_shared'

const readJsonBody = async (req: IncomingMessage) => {
  const chunks: Uint8Array[] = []

  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }

  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

const sendJson = (res: ServerResponse, status: number, payload: unknown) => {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(payload))
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  const generateKitHandler = async (
    req: IncomingMessage,
    res: ServerResponse,
    next: (error?: unknown) => void,
  ) => {
    if (req.url !== '/api/generate-kit') {
      next()
      return
    }

    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'Use POST /api/generate-kit.' })
      return
    }

    if (!env.ANTHROPIC_API_KEY) {
      sendJson(res, 500, { error: 'Missing ANTHROPIC_API_KEY. Add it to your environment before generating kits.' })
      return
    }

    try {
      const parsedRequest = requestSchema.parse(await readJsonBody(req))
      const result = await executeGenerateKit(
        env.ANTHROPIC_API_KEY,
        env.ELEVENLABS_API_KEY || '',
        parsedRequest,
      )

      if (result.type === 'sequence') {
        sendJson(res, 200, {
          bankId: result.bankId,
          summary: result.summary,
          generatedSequence: result.generatedSequence,
        })
        return
      }

      if (result.type === 'loop') {
        sendJson(res, 200, {
          bankId: result.bankId,
          summary: result.summary,
          generatedLoop: result.generatedLoop,
        })
        return
      }

      sendJson(res, 200, {
        bankId: result.bankId,
        summary: result.summary,
        generatedPads: result.generatedPads,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unexpected generation error.'
      sendJson(res, 500, { error: message })
    }
  }

  const transformSampleHandler = async (
    req: IncomingMessage,
    res: ServerResponse,
    next: (error?: unknown) => void,
  ) => {
    if (req.url !== '/api/transform-sample') {
      next()
      return
    }

    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'Use POST /api/transform-sample.' })
      return
    }

    if (!env.ELEVENLABS_API_KEY) {
      sendJson(res, 500, { error: 'Missing ELEVENLABS_API_KEY. Add it to your environment before transforming samples.' })
      return
    }

    try {
      const parsedRequest = transformSampleSchema.parse(await readJsonBody(req))
      const result = await executeTransformSample(env.ELEVENLABS_API_KEY, parsedRequest)

      sendJson(res, 200, {
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
      sendJson(res, 500, { error: message })
    }
  }

  return {
    plugins: [
      react(),
      {
        name: 'local-generate-kit-api',
        configureServer(server) {
          server.middlewares.use(generateKitHandler)
          server.middlewares.use(transformSampleHandler)
        },
        configurePreviewServer(server) {
          server.middlewares.use(generateKitHandler)
          server.middlewares.use(transformSampleHandler)
        },
      },
    ],
  }
})
