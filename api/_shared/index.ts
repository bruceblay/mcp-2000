import { createAnthropic } from '@ai-sdk/anthropic'
import { generateText, tool } from 'ai'
import { z } from 'zod'

// --- Types (mirrored from src/mock-kit.ts to avoid cross-boundary imports) ---

type PadGroup = 'drums' | 'textures' | 'melodic' | 'fx' | 'chop'
type PadSourceType = 'generated' | 'uploaded' | 'resampled'

export type Pad = {
  id: string
  label: string
  keyTrigger: string
  group: PadGroup
  sampleName: string
  sampleFile: string
  sampleUrl: string
  sourceType: PadSourceType
  durationLabel: string
  gain: number
}

// --- Template data (Bank A pad layout used for generation planning) ---

export const allTemplatePads: Pad[] = [
  { id: 'pad-1', label: 'Kick 01', keyTrigger: '1', group: 'drums', sampleName: '', sampleFile: '', sampleUrl: '', sourceType: 'uploaded', durationLabel: '', gain: 1.0 },
  { id: 'pad-2', label: 'Snare 02', keyTrigger: '2', group: 'drums', sampleName: '', sampleFile: '', sampleUrl: '', sourceType: 'uploaded', durationLabel: '', gain: 0.92 },
  { id: 'pad-3', label: 'Hat 03', keyTrigger: '3', group: 'drums', sampleName: '', sampleFile: '', sampleUrl: '', sourceType: 'uploaded', durationLabel: '', gain: 0.68 },
  { id: 'pad-4', label: 'Open Hat 04', keyTrigger: '4', group: 'drums', sampleName: '', sampleFile: '', sampleUrl: '', sourceType: 'uploaded', durationLabel: '', gain: 0.7 },
  { id: 'pad-5', label: 'Clap 05', keyTrigger: 'Q', group: 'textures', sampleName: '', sampleFile: '', sampleUrl: '', sourceType: 'uploaded', durationLabel: '', gain: 0.82 },
  { id: 'pad-6', label: 'Perc 06', keyTrigger: 'W', group: 'textures', sampleName: '', sampleFile: '', sampleUrl: '', sourceType: 'uploaded', durationLabel: '', gain: 0.72 },
  { id: 'pad-7', label: 'Cowbell 07', keyTrigger: 'E', group: 'textures', sampleName: '', sampleFile: '', sampleUrl: '', sourceType: 'uploaded', durationLabel: '', gain: 0.72 },
  { id: 'pad-8', label: 'Metal FX 08', keyTrigger: 'R', group: 'fx', sampleName: '', sampleFile: '', sampleUrl: '', sourceType: 'uploaded', durationLabel: '', gain: 0.65 },
  { id: 'pad-9', label: 'Tom 09', keyTrigger: 'A', group: 'melodic', sampleName: '', sampleFile: '', sampleUrl: '', sourceType: 'uploaded', durationLabel: '', gain: 0.86 },
  { id: 'pad-10', label: 'Mid Tom 10', keyTrigger: 'S', group: 'melodic', sampleName: '', sampleFile: '', sampleUrl: '', sourceType: 'uploaded', durationLabel: '', gain: 0.82 },
  { id: 'pad-11', label: 'Rim 11', keyTrigger: 'D', group: 'melodic', sampleName: '', sampleFile: '', sampleUrl: '', sourceType: 'uploaded', durationLabel: '', gain: 0.7 },
  { id: 'pad-12', label: 'Ride 12', keyTrigger: 'F', group: 'melodic', sampleName: '', sampleFile: '', sampleUrl: '', sourceType: 'uploaded', durationLabel: '', gain: 0.74 },
  { id: 'pad-13', label: 'Crash 13', keyTrigger: 'Z', group: 'fx', sampleName: '', sampleFile: '', sampleUrl: '', sourceType: 'uploaded', durationLabel: '', gain: 0.7 },
  { id: 'pad-14', label: 'Blip 14', keyTrigger: 'X', group: 'fx', sampleName: '', sampleFile: '', sampleUrl: '', sourceType: 'uploaded', durationLabel: '', gain: 0.68 },
  { id: 'pad-15', label: 'Shaker 15', keyTrigger: 'C', group: 'fx', sampleName: '', sampleFile: '', sampleUrl: '', sourceType: 'uploaded', durationLabel: '', gain: 0.72 },
  { id: 'pad-16', label: 'Ride FX 16', keyTrigger: 'V', group: 'fx', sampleName: '', sampleFile: '', sampleUrl: '', sourceType: 'uploaded', durationLabel: '', gain: 0.64 },
]
const allPadIds = allTemplatePads.map((pad) => pad.id) as [string, ...string[]]

// --- Schemas ---

const sequencePadContextSchema = z.object({
  padId: z.string(),
  label: z.string(),
  sampleName: z.string(),
  group: z.string(),
})

export const requestSchema = z.object({
  prompt: z.string().min(1),
  bankId: z.enum(['A', 'B', 'C', 'D']).optional(),
  mode: z.enum(['kit', 'pad', 'loop', 'sequence', 'random-sequence']).default('kit'),
  selectedPadId: z.string().optional(),
  sequenceLength: z.number().int().min(8).max(32).optional(),
  sequencePads: z.array(sequencePadContextSchema).length(16).optional(),
})

export const transformSampleSchema = z.object({
  prompt: z.string().min(20).max(320),
  sampleName: z.string().min(1).max(64),
  sampleFile: z.string().min(1).max(160),
  editorSource: z.enum(['pad', 'loop']),
  audioBase64: z.string().min(1).max(4_000_000),
  mimeType: z.string().min(1).max(120).optional(),
})

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

const sequenceLaneSchema = z.object({
  padId: z.string(),
  activeSteps: z.array(z.number().int().min(1).max(32)).max(32),
})

const sequencePlanSchema = z.object({
  summary: z.string(),
  lanes: z.array(sequenceLaneSchema).length(16),
})

// --- Helpers ---

export const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32) || 'sample'

async function mapWithConcurrency<T, R>(items: T[], limit: number, mapper: (item: T) => Promise<R>) {
  const results: R[] = []

  for (let index = 0; index < items.length; index += limit) {
    const batch = items.slice(index, index + limit)
    const batchResults = await Promise.all(batch.map((item) => mapper(item)))
    results.push(...batchResults)
  }

  return results
}

// --- Prompt builders ---

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

const buildSequencePlannerPrompt = (userPrompt: string, sequenceLength: number, pads: Array<{ padId: string; label: string; sampleName: string; group: string }>) =>
  [
    'User prompt: ' + userPrompt,
    'Create a playable step sequence for this MPC-style bank.',
    'Sequence length: ' + sequenceLength + ' steps.',
    'Use the pad labels and sample names as the musical context. Respect what each sound seems to be.',
    pads.map((pad) => '- ' + pad.padId + ' | ' + pad.label + ' | sample: ' + pad.sampleName + ' | group: ' + pad.group).join('\n'),
    'Return active step numbers using 1-based indexing.',
    'Favor musical patterns with space, repetition, and variation. Do not fill every lane.',
    'Usually keep kick, snare, hats, perc, melodic, and fx roles sensible to their names.',
  ].join('\n\n')

const buildRandomSequencePlannerPrompt = (userPrompt: string, sequenceLength: number, pads: Array<{ padId: string; label: string; sampleName: string; group: string }>) =>
  [
    'Optional vibe hint from user: ' + userPrompt,
    'Create a genuinely surprising but still playable step sequence for this MPC-style bank.',
    'Sequence length: ' + sequenceLength + ' steps.',
    'Use the pad labels and sample names as loose musical context, but do not fall back to the same stock groove every time.',
    pads.map((pad) => '- ' + pad.padId + ' | ' + pad.label + ' | sample: ' + pad.sampleName + ' | group: ' + pad.group).join('\n'),
    'Return active step numbers using 1-based indexing.',
    'Prioritize novelty, asymmetry, syncopation, dropouts, and unexpected combinations that still suit the sounds.',
    'Treat the user hint as optional inspiration rather than a strict recipe.',
    'Leave plenty of space where appropriate. Random should feel fresh, not overcrowded.',
  ].join('\n\n')

// --- ElevenLabs API ---

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

const createPromptDesignedVoice = async (
  apiKey: string,
  prompt: string,
  sampleName: string,
  referenceAudioBase64: string,
) => {
  const designResponse = await fetch('https://api.elevenlabs.io/v1/text-to-voice/design', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'xi-api-key': apiKey,
    },
    body: JSON.stringify({
      voice_description: prompt,
      model_id: 'eleven_ttv_v3',
      auto_generate_text: true,
      reference_audio_base64: referenceAudioBase64,
      prompt_strength: 0.82,
    }),
  })

  if (!designResponse.ok) {
    const errorText = await designResponse.text()
    throw new Error('ElevenLabs voice design failed: ' + errorText)
  }

  const designPayload = await designResponse.json() as {
    previews?: Array<{
      generated_voice_id?: string
    }>
  }
  const generatedVoiceId = designPayload.previews?.[0]?.generated_voice_id

  if (!generatedVoiceId) {
    throw new Error('ElevenLabs voice design did not return a generated voice.')
  }

  const createResponse = await fetch('https://api.elevenlabs.io/v1/text-to-voice', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'xi-api-key': apiKey,
    },
    body: JSON.stringify({
      voice_name: `Sampler ${slugify(sampleName)} ${Date.now()}`,
      voice_description: prompt,
      generated_voice_id: generatedVoiceId,
    }),
  })

  if (!createResponse.ok) {
    const errorText = await createResponse.text()
    throw new Error('ElevenLabs voice creation failed: ' + errorText)
  }

  const createPayload = await createResponse.json() as { voice_id?: string }

  if (!createPayload.voice_id) {
    throw new Error('ElevenLabs voice creation did not return a voice id.')
  }

  return createPayload.voice_id
}

const deleteDesignedVoice = async (apiKey: string, voiceId: string) => {
  try {
    await fetch(`https://api.elevenlabs.io/v1/voices/${voiceId}`, {
      method: 'DELETE',
      headers: {
        'xi-api-key': apiKey,
      },
    })
  } catch {}
}

const transformEditorSample = async (
  apiKey: string,
  options: {
    prompt: string
    sampleName: string
    sampleFile: string
    audioBase64: string
    mimeType?: string
  },
) => {
  const voiceId = await createPromptDesignedVoice(apiKey, options.prompt, options.sampleName, options.audioBase64)

  try {
    const sampleBuffer = Buffer.from(options.audioBase64, 'base64')
    const formData = new FormData()

    formData.set('audio', new Blob([sampleBuffer], { type: options.mimeType || 'audio/wav' }), options.sampleFile)
    formData.set('model_id', 'eleven_english_sts_v2')
    formData.set('remove_background_noise', 'true')

    const response = await fetch(`https://api.elevenlabs.io/v1/speech-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        Accept: 'audio/mpeg',
      },
      body: formData,
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error('ElevenLabs speech transformation failed: ' + errorText)
    }

    return Buffer.from(await response.arrayBuffer())
  } finally {
    await deleteDesignedVoice(apiKey, voiceId)
  }
}

// --- Result types ---

export type GeneratedPadResult = Omit<Pad, 'sampleUrl'> & { audioBase64: string }

export type GeneratedLoopResult = {
  sampleName: string
  sampleFile: string
  durationLabel: string
  durationSeconds: number
  bpm: number
  sourceType: 'generated'
  audioBase64: string
}

export type GeneratedSequenceResult = {
  summary: string
  lanes: Array<{ padId: string; activeSteps: number[] }>
}

export type TransformSampleResult = {
  summary: string
  sampleName: string
  sampleFile: string
  sourceType: 'resampled'
  audioBase64: string
}

export type GenerateKitResult =
  | { type: 'kit'; bankId?: string; summary: string; generatedPads: GeneratedPadResult[] }
  | { type: 'loop'; bankId?: string; summary: string; generatedLoop: GeneratedLoopResult }
  | { type: 'sequence'; bankId?: string; summary: string; generatedSequence: GeneratedSequenceResult }

// --- Orchestrators ---

export async function executeGenerateKit(
  anthropicApiKey: string,
  elevenLabsApiKey: string,
  parsedRequest: z.infer<typeof requestSchema>,
): Promise<GenerateKitResult> {
  const anthropic = createAnthropic({ apiKey: anthropicApiKey })

  // --- Sequence modes (no audio) ---

  if (parsedRequest.mode === 'sequence' || parsedRequest.mode === 'random-sequence') {
    const sequenceLength = parsedRequest.sequenceLength
    const sequencePads = parsedRequest.sequencePads
    const isRandomSequence = parsedRequest.mode === 'random-sequence'

    if (!sequenceLength || !sequencePads) {
      throw new Error('Sequence generation needs the current bank pads and sequence length.')
    }

    const sequenceResult = await generateText({
      model: anthropic('claude-sonnet-4-5'),
      temperature: isRandomSequence ? 1 : 0.8,
      toolChoice: { type: 'tool', toolName: 'submitSequencePlan' },
      system: [
        isRandomSequence
          ? 'You are designing a musically useful but genuinely surprising step pattern for an MPC-inspired sampler.'
          : 'You are designing a musically useful step pattern for an MPC-inspired sampler.',
        isRandomSequence
          ? 'Use the provided pad names and sample names as loose musical anchors, but avoid defaulting to the same obvious groove.'
          : 'Use the provided pad names and sample names to infer roles and build a coherent sequence.',
        'Return one lane for every pad, but leave many lanes empty when appropriate.',
        isRandomSequence
          ? 'Favor asymmetry, syncopation, surprise, and variation while keeping the result playable.'
          : 'Favor musical patterns with space, repetition, and sensible roles.',
        'You must call submitSequencePlan exactly once.',
      ].join(' '),
      prompt: isRandomSequence
        ? buildRandomSequencePlannerPrompt(parsedRequest.prompt, sequenceLength, sequencePads)
        : buildSequencePlannerPrompt(parsedRequest.prompt, sequenceLength, sequencePads),
      tools: {
        submitSequencePlan: tool({
          description: 'Submit a step sequence plan for the current bank.',
          inputSchema: sequencePlanSchema,
          execute: async (input) => input,
        }),
      },
    })

    const toolResult = sequenceResult.toolResults.find((entry) => entry.toolName === 'submitSequencePlan')
    if (!toolResult || toolResult.type !== 'tool-result') {
      throw new Error('Sequence planner did not return a valid pattern.')
    }

    const output = sequencePlanSchema.parse(toolResult.output)
    return {
      type: 'sequence',
      bankId: parsedRequest.bankId,
      summary: output.summary,
      generatedSequence: output,
    }
  }

  // --- Loop mode ---

  if (parsedRequest.mode === 'loop') {
    if (!elevenLabsApiKey) {
      throw new Error('Missing ELEVENLABS_API_KEY. Add it to your environment before generating real samples.')
    }

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
      throw new Error('Loop planner did not return a valid generation plan.')
    }

    const output = loopPlanSchema.parse(toolResult.output)
    const audioBuffer = await generateElevenLabsSample(elevenLabsApiKey, {
      prompt: output.loop.prompt,
      durationSeconds: output.loop.durationSeconds,
      promptInfluence: output.loop.promptInfluence,
      loop: true,
    })
    const fileName = Date.now() + '-loop-' + slugify(output.loop.sampleName) + '.mp3'

    return {
      type: 'loop',
      bankId: parsedRequest.bankId,
      summary: output.summary,
      generatedLoop: {
        sampleName: output.loop.sampleName,
        sampleFile: fileName,
        durationLabel: output.loop.durationSeconds.toFixed(1) + 's loop',
        durationSeconds: output.loop.durationSeconds,
        bpm: output.loop.bpm,
        sourceType: 'generated',
        audioBase64: audioBuffer.toString('base64'),
      },
    }
  }

  // --- Single pad mode ---

  if (parsedRequest.mode === 'pad') {
    if (!elevenLabsApiKey) {
      throw new Error('Missing ELEVENLABS_API_KEY. Add it to your environment before generating real samples.')
    }

    const templatePad = allTemplatePads.find((pad) => pad.id === parsedRequest.selectedPadId)
    if (!templatePad) {
      throw new Error('Select a pad before generating a single sample.')
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
      throw new Error('Pad planner did not return a valid generation plan.')
    }

    const output = singlePadPlanSchema.parse(toolResult.output)
    const audioBuffer = await generateElevenLabsSample(elevenLabsApiKey, output.sample)
    const fileName = Date.now() + '-' + templatePad.id + '-' + slugify(output.sample.sampleName) + '.mp3'

    return {
      type: 'kit',
      bankId: parsedRequest.bankId,
      summary: output.summary,
      generatedPads: [{
        ...templatePad,
        sampleName: output.sample.sampleName,
        sampleFile: fileName,
        sourceType: 'generated',
        durationLabel: output.sample.durationSeconds.toFixed(1) + 's generated',
        audioBase64: audioBuffer.toString('base64'),
      }],
    }
  }

  // --- Full kit mode (default) ---

  if (!elevenLabsApiKey) {
    throw new Error('Missing ELEVENLABS_API_KEY. Add it to your environment before generating real samples.')
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
    throw new Error('Kit planner did not return a valid generation plan.')
  }

  const output = kitPlanSchema.parse(toolResult.output)
  const generatedPads = await mapWithConcurrency(output.samples, 4, async (samplePlan) => {
    const templatePad = allTemplatePads.find((pad) => pad.id === samplePlan.padId)
    if (!templatePad) {
      throw new Error('Missing pad template for ' + samplePlan.padId)
    }

    const audioBuffer = await generateElevenLabsSample(elevenLabsApiKey, samplePlan)
    const fileName = Date.now() + '-' + templatePad.id + '-' + slugify(samplePlan.sampleName) + '.mp3'

    return {
      ...templatePad,
      sampleName: samplePlan.sampleName,
      sampleFile: fileName,
      sourceType: 'generated' as const,
      durationLabel: samplePlan.durationSeconds.toFixed(1) + 's generated',
      audioBase64: audioBuffer.toString('base64'),
    } satisfies GeneratedPadResult
  })

  return {
    type: 'kit',
    bankId: parsedRequest.bankId,
    summary: output.summary,
    generatedPads,
  }
}

export async function executeTransformSample(
  elevenLabsApiKey: string,
  parsedRequest: z.infer<typeof transformSampleSchema>,
): Promise<TransformSampleResult> {
  if (!elevenLabsApiKey) {
    throw new Error('Missing ELEVENLABS_API_KEY. Add it to your environment before transforming samples.')
  }

  const audioBuffer = await transformEditorSample(elevenLabsApiKey, {
    prompt: parsedRequest.prompt,
    sampleName: parsedRequest.sampleName,
    sampleFile: parsedRequest.sampleFile,
    audioBase64: parsedRequest.audioBase64,
    mimeType: parsedRequest.mimeType,
  })

  const fileName = `${Date.now()}-${slugify(parsedRequest.sampleName)}-elevenlabs.mp3`

  return {
    summary: `Loaded an ElevenLabs-transformed ${parsedRequest.editorSource === 'loop' ? 'loop' : 'sample'} from your prompt.`,
    sampleName: `${parsedRequest.sampleName} EL`,
    sampleFile: fileName,
    sourceType: 'resampled',
    audioBase64: audioBuffer.toString('base64'),
  }
}

// --- Chat assistant system prompt ---

export const CHAT_SYSTEM_PROMPT = `You are the MCP-2000 assistant — a friendly, concise helper built into a browser-based drum machine / sampler inspired by classic hardware.

Keep answers short and practical. Use plain language. Never use emojis. You can reference specific UI elements by name.

Here is what the user can do in MCP-2000:

**Pads & Banks**
- 16 velocity-sensitive pads arranged in a 4×4 grid, triggered by clicking or keyboard shortcuts (1-4, Q-R, A-F, Z-C).
- 4 banks (A/B/C/D), each holding a full 16-pad kit. Switch banks with the buttons above the pads.
- Each pad has a label, sample name, and belongs to a group (drums, textures, melodic, fx, chop).

**AI Kit Generation**
- Type a text description (e.g. "dusty boom-bap with vinyl crackle" or "8-bit arcade coins") and the AI generates a full 16-pad kit.
- Can also generate a single pad, a loop, or a step-sequencer pattern from a prompt.
- Preset suggestion chips are available below the prompt input for quick inspiration.

**Sample Editor**
- Select a pad to open the waveform editor.
- Adjust pitch (semitones), gain, pan, and playback start/end points.
- Reverse samples, chop loops into slices.
- Transform samples with AI-powered resynthesis (describe how you want the sound changed).

**Step Sequencer**
- 16- or 32-step grid sequencer with per-pad lanes.
- Toggle steps to build patterns, adjust per-step velocity.
- AI can generate sequences from a text prompt.

**Mixer**
- Per-pad gain and pan faders.
- Per-bank master gain.
- Visual level meters.

**Effects**
- Per-bank effects chain with slots for: reverb, delay, distortion, bitcrusher, filter, compressor, chorus, phaser, tremolo.
- Global effects: master compressor, limiter.
- Each effect has adjustable parameters.

**Transport**
- Play, stop, and record buttons.
- Adjustable BPM (40-220) via scroll knob.
- Record live pad performances as takes, then play them back.
- Performance recording: the disc icon button in the transport bar records everything you hear (master output including all effects) as a WAV file. Tap it to start recording, tap again to stop — the WAV downloads automatically. Great for capturing a live jam session, a sequence playback with effects, or any combination of pads and loops. Maximum recording length is 10 minutes.

**Sharing**
- "Share Project" button creates a shareable link.
- Recipients get their own copy to remix.

**Other**
- Dark mode toggle (Beige / Blue themes).
- MIDI input support for external controllers.
- Export samples and kits as WAV/ZIP.
- Arpeggiator with multiple modes and divisions.

**About**
- MCP-2000 was built by Bruce Blay. His portfolio is at coolbrb.com and his GitHub is github.com/bruceblay.
- If someone asks who made this, who built this, or who the creator is, share that info warmly.

Be enthusiastic about music-making. If the user asks something outside the scope of MCP-2000, gently redirect them. You don't have access to the user's current session state — you can't see which pads are loaded or what BPM is set, but you can explain how to use any feature.`
