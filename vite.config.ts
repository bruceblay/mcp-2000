import { createAnthropic } from '@ai-sdk/anthropic'
import { generateText, tool } from 'ai'
import { mkdir, writeFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { join } from 'node:path'
import { bankKits, type Pad } from './src/mock-kit'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { z } from 'zod'

const requestSchema = z.object({
  prompt: z.string().min(1),
  bankId: z.enum(['A', 'B', 'C', 'D']).optional(),
  mode: z.enum(['kit', 'pad', 'loop']).default('kit'),
  selectedPadId: z.string().optional(),
})

const allTemplatePads = bankKits.A
const allPadIds = allTemplatePads.map((pad) => pad.id) as [string, ...string[]]

const kitPlanItemSchema = z.object({
  padId: z.enum(allPadIds),
  sampleName: z.string().min(1).max(48),
  prompt: z.string().min(1).max(260),
  durationSeconds: z.number().min(0.5).max(8),
  promptInfluence: z.number().min(0).max(1),
})

const kitPlanSchema = z.object({
  summary: z.string(),
  samples: z.array(kitPlanItemSchema).length(16),
})

const singlePadPlanSchema = z.object({
  summary: z.string(),
  sample: z.object({
    padId: z.string(),
    sampleName: z.string().min(1).max(48),
    prompt: z.string().min(1).max(260),
    durationSeconds: z.number().min(0.5).max(8),
    promptInfluence: z.number().min(0).max(1),
  }),
})

const loopPlanSchema = z.object({
  summary: z.string(),
  loop: z.object({
    sampleName: z.string().min(1).max(56),
    prompt: z.string().min(1).max(320),
    durationSeconds: z.number().min(3).max(30),
    promptInfluence: z.number().min(0).max(1),
    bpm: z.number().int().min(60).max(180),
  }),
})

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

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32) || 'sample'

const buildKitPlannerPrompt = (userPrompt: string) =>
  [
    'User prompt: ' + userPrompt,
    'Create fresh audio generation prompts for all 16 pads in this MPC-style bank:',
    allTemplatePads.map((pad) => '- ' + pad.id + ' | ' + pad.label + ' | group: ' + pad.group).join('\n'),
    'Drum and FX pads should usually be one-shots.',
    'Texture and melodic pads can be short phrases, stabs, tonal hits, ambiences, or sample fragments.',
    'Return distinctive sample names with personality. Do not reuse generic pad role names like Kick 01 or Snare 02 as the sampleName.',
    'Keep the full kit stylistically coherent around the user prompt while giving each pad a clear role.',
  ].join('\n\n')

const buildSinglePadPlannerPrompt = (userPrompt: string, pad: Pad) =>
  [
    'User prompt: ' + userPrompt,
    'Create one fresh audio generation prompt for this exact pad role:',
    '- ' + pad.id + ' | ' + pad.label + ' | group: ' + pad.group,
    'Return a one-shot if the pad is a drum or fx hit.',
    'Return a short sample fragment if the pad is melodic or texture based.',
    'Return a distinctive short sampleName with personality. Do not just repeat the pad label.',
    'The result should be bold and specific, not generic or neutral.',
  ].join('\n\n')

const buildLoopPlannerPrompt = (userPrompt: string) =>
  [
    'User prompt: ' + userPrompt,
    'Create one looping sample generation prompt for an MPC-inspired chop source.',
    'The result should be a cohesive loop, not a single hit.',
    'Favor loops that are rich enough to chop into multiple slices.',
    'Return a descriptive sampleName, a BPM, and a duration between 4 and 16 seconds unless the prompt strongly implies something else.',
  ].join('\n\n')

const generateElevenLabsSample = async (
  apiKey: string,
  planItem: { prompt: string; durationSeconds: number; promptInfluence: number; loop?: boolean },
) => {
  const response = await fetch('https://api.elevenlabs.io/v1/sound-generation', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'xi-api-key': apiKey,
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify({
      text: planItem.prompt,
      duration_seconds: planItem.durationSeconds,
      prompt_influence: planItem.promptInfluence,
      loop: planItem.loop ?? false,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error('ElevenLabs sound generation failed: ' + errorText)
  }

  return Buffer.from(await response.arrayBuffer())
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, mapper: (item: T) => Promise<R>) {
  const results: R[] = []

  for (let index = 0; index < items.length; index += limit) {
    const batch = items.slice(index, index + limit)
    const batchResults = await Promise.all(batch.map((item) => mapper(item)))
    results.push(...batchResults)
  }

  return results
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const anthropic = createAnthropic({
    apiKey: env.ANTHROPIC_API_KEY,
  })

  const generateOneSampleFromPlan = async (
    generatedDir: string,
    templatePad: Pad,
    samplePlan: { sampleName: string; prompt: string; durationSeconds: number; promptInfluence: number },
  ) => {
    const audioBuffer = await generateElevenLabsSample(env.ELEVENLABS_API_KEY, samplePlan)
    const fileName = Date.now() + '-' + templatePad.id + '-' + slugify(samplePlan.sampleName) + '.mp3'
    await writeFile(join(generatedDir, fileName), audioBuffer)

    return {
      ...templatePad,
      sampleName: samplePlan.sampleName,
      sampleFile: fileName,
      sampleUrl: '/generated/' + encodeURIComponent(fileName),
      sourceType: 'generated' as const,
      durationLabel: samplePlan.durationSeconds.toFixed(1) + 's generated',
    } satisfies Pad
  }

  const generateLoopFromPlan = async (
    generatedDir: string,
    loopPlan: { sampleName: string; prompt: string; durationSeconds: number; promptInfluence: number; bpm: number },
  ) => {
    const audioBuffer = await generateElevenLabsSample(env.ELEVENLABS_API_KEY, {
      prompt: loopPlan.prompt,
      durationSeconds: loopPlan.durationSeconds,
      promptInfluence: loopPlan.promptInfluence,
      loop: true,
    })
    const fileName = Date.now() + '-loop-' + slugify(loopPlan.sampleName) + '.mp3'
    await writeFile(join(generatedDir, fileName), audioBuffer)

    return {
      sampleName: loopPlan.sampleName,
      sampleFile: fileName,
      sampleUrl: '/generated/' + encodeURIComponent(fileName),
      durationLabel: loopPlan.durationSeconds.toFixed(1) + 's loop',
      durationSeconds: loopPlan.durationSeconds,
      bpm: loopPlan.bpm,
      sourceType: 'generated' as const,
    }
  }

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

    if (!env.ELEVENLABS_API_KEY) {
      sendJson(res, 500, { error: 'Missing ELEVENLABS_API_KEY. Add it to your environment before generating real samples.' })
      return
    }

    try {
      const parsedRequest = requestSchema.parse(await readJsonBody(req))
      const generatedDir = join(process.cwd(), 'public', 'generated')
      await mkdir(generatedDir, { recursive: true })

      if (parsedRequest.mode === 'loop') {
        const loopResult = await generateText({
          model: anthropic('claude-sonnet-4-5'),
          temperature: 0.85,
          toolChoice: { type: 'tool', toolName: 'submitLoopPlan' },
          system: [
            'You are designing a loop for an MPC-inspired sampler workflow.',
            'Return one cohesive loop plan that will be good for chopping into pads.',
            'The loop should be stylistically committed and sampleable, not generic background filler.',
            'You must call submitLoopPlan exactly once.',
          ].join(' '),
          prompt: buildLoopPlannerPrompt(parsedRequest.prompt),
          tools: {
            submitLoopPlan: tool({
              description: 'Submit one loop-generation plan for a chop-ready sample.',
              inputSchema: loopPlanSchema,
              execute: async (input) => input,
            }),
          },
        })

        const toolResult = loopResult.toolResults.find((entry) => entry.toolName === 'submitLoopPlan')
        if (!toolResult || toolResult.type !== 'tool-result') {
          sendJson(res, 500, { error: 'Anthropic did not return a loop generation plan.' })
          return
        }

        const output = loopPlanSchema.parse(toolResult.output)
        const generatedLoop = await generateLoopFromPlan(generatedDir, output.loop)

        sendJson(res, 200, {
          bankId: parsedRequest.bankId,
          summary: output.summary,
          generatedLoop,
        })
        return
      }

      if (parsedRequest.mode === 'pad') {
        const templatePad = allTemplatePads.find((pad) => pad.id === parsedRequest.selectedPadId)
        if (!templatePad) {
          sendJson(res, 400, { error: 'Select a pad before generating a single sample.' })
          return
        }

        const padResult = await generateText({
          model: anthropic('claude-sonnet-4-5'),
          temperature: 0.9,
          toolChoice: { type: 'tool', toolName: 'submitSinglePadPlan' },
          system: [
            'You are designing one sampler sound for an MPC-inspired web app.',
            'Make the result stylistically committed and immediately usable.',
            'Return a concise prompt for sound generation plus duration guidance.',
            'Return a descriptive sampleName, not the raw pad label.',
            'You must call submitSinglePadPlan exactly once.',
          ].join(' '),
          prompt: buildSinglePadPlannerPrompt(parsedRequest.prompt, templatePad),
          tools: {
            submitSinglePadPlan: tool({
              description: 'Submit a generation plan for the selected pad.',
              inputSchema: singlePadPlanSchema,
              execute: async (input) => input,
            }),
          },
        })

        const toolResult = padResult.toolResults.find((entry) => entry.toolName === 'submitSinglePadPlan')
        if (!toolResult || toolResult.type !== 'tool-result') {
          sendJson(res, 500, { error: 'Anthropic did not return a single-pad generation plan.' })
          return
        }

        const output = singlePadPlanSchema.parse(toolResult.output)
        const generatedPad = await generateOneSampleFromPlan(generatedDir, templatePad, output.sample)

        sendJson(res, 200, {
          bankId: parsedRequest.bankId,
          summary: output.summary,
          generatedPads: [generatedPad],
        })
        return
      }

      const planResult = await generateText({
        model: anthropic('claude-sonnet-4-5'),
        temperature: 0.85,
        toolChoice: { type: 'tool', toolName: 'submitKitPlan' },
        system: [
          'You are designing a full 16-pad sampler bank for an MPC-inspired web app.',
          'Return one generation plan for every pad role in the bank.',
          'The bank should feel coherent and inspired by the user prompt, but the individual pads should still have variety and personality.',
          'Return descriptive sample names, not generic role labels.',
          'You must call submitKitPlan exactly once.',
        ].join(' '),
        prompt: buildKitPlannerPrompt(parsedRequest.prompt),
        tools: {
          submitKitPlan: tool({
            description: 'Submit the 16-pad generation plan for the full bank.',
            inputSchema: kitPlanSchema,
            execute: async (input) => input,
          }),
        },
      })

      const toolResult = planResult.toolResults.find((entry) => entry.toolName === 'submitKitPlan')
      if (!toolResult || toolResult.type !== 'tool-result') {
        sendJson(res, 500, { error: 'Anthropic did not return a full-kit generation plan.' })
        return
      }

      const output = kitPlanSchema.parse(toolResult.output)
      const generatedPads = await mapWithConcurrency(output.samples, 4, async (samplePlan) => {
        const templatePad = allTemplatePads.find((pad) => pad.id === samplePlan.padId)
        if (!templatePad) {
          throw new Error('Missing pad template for ' + samplePlan.padId)
        }

        return generateOneSampleFromPlan(generatedDir, templatePad, samplePlan)
      })

      sendJson(res, 200, {
        bankId: parsedRequest.bankId,
        summary: output.summary,
        generatedPads,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unexpected generation error.'
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
        },
        configurePreviewServer(server) {
          server.middlewares.use(generateKitHandler)
        },
      },
    ],
  }
})
