import type { IncomingMessage, ServerResponse } from 'node:http'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { createAnthropic } from '@ai-sdk/anthropic'
import { streamText } from 'ai'
import { requestSchema, transformSampleSchema, executeGenerateKit, executeTransformSample, CHAT_SYSTEM_PROMPT } from './api/_shared'

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

  const chatHandler = async (
    req: IncomingMessage,
    res: ServerResponse,
    next: (error?: unknown) => void,
  ) => {
    if (req.url !== '/api/chat') {
      next()
      return
    }

    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'Use POST /api/chat.' })
      return
    }

    if (!env.ANTHROPIC_API_KEY) {
      sendJson(res, 500, { error: 'Missing ANTHROPIC_API_KEY.' })
      return
    }

    try {
      const { messages } = await readJsonBody(req) as { messages?: Array<{ role: string; content: string }> }
      if (!messages || !Array.isArray(messages) || messages.length === 0) {
        sendJson(res, 400, { error: 'messages array is required.' })
        return
      }

      const anthropic = createAnthropic({ apiKey: env.ANTHROPIC_API_KEY })
      const result = streamText({
        model: anthropic('claude-haiku-4-5-20251001'),
        system: CHAT_SYSTEM_PROMPT,
        messages: messages as Array<{ role: 'user' | 'assistant'; content: string }>,
      })

      res.setHeader('Content-Type', 'text/event-stream')
      res.setHeader('Cache-Control', 'no-cache')
      res.setHeader('Connection', 'keep-alive')

      for await (const chunk of result.textStream) {
        res.write(`data: ${JSON.stringify(chunk)}\n\n`)
      }
      res.write('data: [DONE]\n\n')
      res.end()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unexpected chat error.'
      if (!res.headersSent) {
        sendJson(res, 500, { error: message })
      } else {
        res.end()
      }
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
          server.middlewares.use(chatHandler)
        },
        configurePreviewServer(server) {
          server.middlewares.use(generateKitHandler)
          server.middlewares.use(transformSampleHandler)
          server.middlewares.use(chatHandler)
        },
      },
    ],
  }
})
