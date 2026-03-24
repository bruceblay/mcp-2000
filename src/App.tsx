import { startTransition, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react'
import * as Slider from '@radix-ui/react-slider'
import { type BankKitId, type Pad, type PadSourceType } from './mock-kit'
import { starterBankPads } from './kit-generation'
import { SampleWaveform, type WaveformRegion } from './components/sample-waveform'
import { getEffectConfig, getEffectDefaults, getEffectsList, type EffectConfig } from './effects'

const bankIds = ['A', 'B', 'C', 'D'] as const
const loopChopCount = 16

const promptPresets = [
  'Boom bap drum kit with dusty hats and a warm vinyl kick',
  '4-bar Detroit techno loop at 132 BPM',
  'Minimal percussion kit made from kitchen sounds',
]

const groupLabels: Record<Pad['group'], string> = {
  drums: 'Drums',
  textures: 'Textures',
  melodic: 'Melodic',
  fx: 'FX',
}

const sourceLabels: Record<PadSourceType, string> = {
  generated: 'Generated',
  uploaded: 'Uploaded',
  resampled: 'Resampled',
}

type BankId = (typeof bankIds)[number]
type EngineStatus = 'idle' | 'loading' | 'ready' | 'error'
type GenerationStatus = 'idle' | 'generating' | 'error'
type GenerationMode = 'kit' | 'pad' | 'loop'
type WorkView = 'editor' | 'sequence' | 'effects'
type EditorSource = 'pad' | 'loop'
type PlaybackMode = 'one-shot' | 'loop' | 'gate' | 'gate-loop'

type GeneratedLoop = {
  sampleName: string
  sampleFile: string
  sampleUrl: string
  durationLabel: string
  durationSeconds?: number
  bpm: number
  sourceType: PadSourceType
}

type ChopRegion = WaveformRegion

type PadPlaybackSetting = {
  startFraction: number
  endFraction: number
  semitoneOffset: number
  gain: number
  pan: number
  playbackMode: PlaybackMode
  reversed: boolean
}

type BankState = {
  pads: Pad[]
  selectedPadId: string
  playbackSettings: Record<string, PadPlaybackSetting>
}

const createInitialPlaybackSettings = (pads: Pad[]) =>
  Object.fromEntries(
    pads.map((pad) => [pad.id, { startFraction: 0, endFraction: 1, semitoneOffset: 0, gain: pad.gain, pan: 0, playbackMode: 'one-shot', reversed: false }]),
  ) as Record<string, PadPlaybackSetting>

const createInitialBankState = (bankId: BankKitId): BankState => ({
  pads: starterBankPads[bankId].map((pad) => ({ ...pad })),
  selectedPadId: starterBankPads[bankId][0].id,
  playbackSettings: createInitialPlaybackSettings(starterBankPads[bankId]),
})

const createInitialBanksState = () =>
  Object.fromEntries(bankIds.map((bankId) => [bankId, createInitialBankState(bankId)])) as Record<BankId, BankState>


const buildChopRegions = (durationSeconds: number, chopCount: number): ChopRegion[] => {
  const safeDuration = Math.max(durationSeconds, chopCount * 0.01)
  const chopDuration = safeDuration / chopCount

  return Array.from({ length: chopCount }, (_, index) => ({
    id: `chop-${index + 1}`,
    start: Number((chopDuration * index).toFixed(4)),
    end: Number((chopDuration * (index + 1)).toFixed(4)),
  }))
}

const getLoopDurationSeconds = (loop: GeneratedLoop) => {
  if (typeof loop.durationSeconds === 'number' && Number.isFinite(loop.durationSeconds)) {
    return loop.durationSeconds
  }

  const parsedDuration = Number.parseFloat(loop.durationLabel)
  return Number.isFinite(parsedDuration) ? parsedDuration : 8
}

const formatEffectParamValue = (parameter: EffectConfig['parameters'][number], value: number) => {
  if (parameter.key === 'filterType') {
    return ['Low Pass', 'High Pass', 'Band Pass'][Math.max(0, Math.min(2, Math.round(value)))] ?? 'Low Pass'
  }

  if (parameter.key === 'type' || parameter.key === 'waveform') {
    return ['Sine', 'Square', 'Saw', 'Triangle'][Math.max(0, Math.min(3, Math.round(value)))] ?? 'Sine'
  }

  if (parameter.key === 'subdivision') {
    return ['1/4', '1/8', '1/16', 'Dotted', 'Triplet'][Math.max(0, Math.min(4, Math.round(value)))] ?? '1/8'
  }

  if (parameter.key === 'loopSize') {
    return ['1/32', '1/16', '1/8', '1/4', '1/2'][Math.max(0, Math.min(4, Math.round(value)))] ?? '1/8'
  }

  if (parameter.key === 'triggerMode') {
    return ['Continuous', 'Triggered'][Math.max(0, Math.min(1, Math.round(value)))] ?? 'Continuous'
  }

  if (parameter.key === 'mode') {
    return ['Stop', 'Stop/Restart', 'Continuous'][Math.max(0, Math.min(2, Math.round(value)))] ?? 'Continuous'
  }

  if (parameter.unit === '%') {
    return `${Math.round(value * 100)}%`
  }

  if (parameter.unit === 's') {
    return `${value.toFixed(2)}s`
  }

  if (parameter.unit === 'ms') {
    return `${value.toFixed(1)} ms`
  }

  if (parameter.unit === 'bits') {
    return `${Math.round(value)} bits`
  }

  if (parameter.unit === 'Hz') {
    return `${Math.round(value)} Hz`
  }

  if (parameter.unit === 'bpm') {
    return `${Math.round(value)} BPM`
  }

  if (parameter.unit === 'semitones') {
    return `${value > 0 ? '+' : ''}${value.toFixed(1)} st`
  }

  if (parameter.unit === 'x') {
    return `${Math.round(value)}x`
  }

  if (parameter.unit === '°') {
    return `${Math.round(value)}°`
  }

  if (parameter.unit === 'dB') {
    return `${value.toFixed(1)} dB`
  }

  if (parameter.unit === ':1') {
    return `${value.toFixed(1)}:1`
  }

  return Number.isInteger(value) ? String(value) : value.toFixed(2)
}

const supportedGlobalEffectIds = new Set(['simplefilter', 'delay', 'distortion', 'bitcrusher', 'reverb', 'compressor', 'autofilter', 'autopanner', 'chorus', 'combfilter', 'djeq', 'flanger', 'hallreverb', 'loopchop', 'phaser', 'pitchshifter', 'ringmodulator', 'sidechainpump', 'tapestop', 'taptempodelay', 'tremolo', 'vibrato', 'lofitape'])

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const buildDistortionCurve = (amount: number) => {
  const samples = 44100
  const curve = new Float32Array(samples)
  const drive = 5 + amount * 395

  for (let index = 0; index < samples; index += 1) {
    const x = (index * 2) / samples - 1
    curve[index] = ((3 + drive) * x * 20 * (Math.PI / 180)) / (Math.PI + drive * Math.abs(x))
  }

  return curve
}

const buildImpulseResponse = (context: AudioContext, roomSize: number, decaySeconds: number) => {
  const duration = Math.max(0.2, decaySeconds)
  const length = Math.max(1, Math.floor(context.sampleRate * duration))
  const impulse = context.createBuffer(2, length, context.sampleRate)

  for (let channel = 0; channel < impulse.numberOfChannels; channel += 1) {
    const channelData = impulse.getChannelData(channel)

    for (let index = 0; index < length; index += 1) {
      const t = index / length
      const envelope = Math.pow(1 - t, Math.max(1, roomSize * 6 + 1))
      channelData[index] = (Math.random() * 2 - 1) * envelope
    }
  }

  return impulse
}

const createBitcrusherNode = (context: AudioContext, bits: number, normalRange: number) => {
  const processor = context.createScriptProcessor(4096, 2, 2)
  const bitDepth = Math.max(1, Math.round(bits))
  const step = Math.pow(0.5, bitDepth)
  const sampleHold = Math.max(0.01, normalRange)
  let phase = 0
  let lastLeft = 0
  let lastRight = 0

  processor.onaudioprocess = (event) => {
    const inputLeft = event.inputBuffer.getChannelData(0)
    const inputRight = event.inputBuffer.numberOfChannels > 1 ? event.inputBuffer.getChannelData(1) : inputLeft
    const outputLeft = event.outputBuffer.getChannelData(0)
    const outputRight = event.outputBuffer.numberOfChannels > 1 ? event.outputBuffer.getChannelData(1) : outputLeft

    for (let index = 0; index < inputLeft.length; index += 1) {
      phase += sampleHold
      if (phase >= 1) {
        phase -= 1
        lastLeft = step * Math.floor(inputLeft[index] / step + 0.5)
        lastRight = step * Math.floor(inputRight[index] / step + 0.5)
      }

      outputLeft[index] = lastLeft
      outputRight[index] = lastRight
    }
  }

  return processor
}

const lfoWaveforms: OscillatorType[] = ['sine', 'square', 'sawtooth', 'triangle']

const getLfoWaveform = (value: number): OscillatorType => lfoWaveforms[Math.max(0, Math.min(lfoWaveforms.length - 1, Math.round(value)))] ?? 'sine'

const getSubdivisionSeconds = (bpm: number, subdivision: number) => {
  const beatSeconds = 60 / Math.max(1, bpm)
  const ratios = [1, 0.5, 0.25, 0.75, 1 / 3]
  return beatSeconds * (ratios[Math.max(0, Math.min(ratios.length - 1, Math.round(subdivision)))] ?? 0.5)
}

const getLoopChopRate = (loopSize: number, stutterRate: number) => {
  const divisors = [0.25, 0.5, 1, 2, 4]
  const divisor = divisors[Math.max(0, Math.min(divisors.length - 1, Math.round(loopSize)))] ?? 1
  return clamp(stutterRate / divisor, 1, 32)
}

const createReversedBuffer = (context: AudioContext, buffer: AudioBuffer) => {
  const reversedBuffer = context.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate)

  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const source = buffer.getChannelData(channel)
    const target = reversedBuffer.getChannelData(channel)

    for (let index = 0; index < buffer.length; index += 1) {
      target[index] = source[buffer.length - 1 - index]
    }
  }

  return reversedBuffer
}

const normalizeChopRegions = (regions: ChopRegion[], durationSeconds: number): ChopRegion[] => {
  if (regions.length === 0) {
    return []
  }

  const safeDuration = Math.max(durationSeconds, regions.length * 0.01)
  const sorted = [...regions].sort((left, right) => left.start - right.start)
  const normalized: ChopRegion[] = []

  for (let index = 0; index < sorted.length; index += 1) {
    const current = sorted[index]
    const previousEnd = index === 0 ? 0 : normalized[index - 1].end
    const nextRegion = sorted[index + 1]
    const maxEnd = nextRegion ? Math.max(previousEnd + 0.01, nextRegion.end - 0.01) : safeDuration
    const start = previousEnd
    const proposedEnd = Math.min(Math.max(current.end, start + 0.01), maxEnd)

    normalized.push({
      id: current.id,
      start: Number(start.toFixed(4)),
      end: Number((index === sorted.length - 1 ? safeDuration : proposedEnd).toFixed(4)),
    })
  }

  return normalized
}

function App() {
  const [currentBankId, setCurrentBankId] = useState<BankId>('A')
  const [bankStates, setBankStates] = useState<Record<BankId, BankState>>(() => createInitialBanksState())
  const [activePadIds, setActivePadIds] = useState<string[]>([])
  const [engineStatus, setEngineStatus] = useState<EngineStatus>('idle')
  const [loadedPadCount, setLoadedPadCount] = useState(0)
  const [promptText, setPromptText] = useState(promptPresets[0])
  const [generationStatus, setGenerationStatus] = useState<GenerationStatus>('idle')
  const [generationMode, setGenerationMode] = useState<GenerationMode>('kit')
  const [generationMessage, setGenerationMessage] = useState('Generate a full 16-pad bank, a single pad, or a loop for chopping.')
  const [workView, setWorkView] = useState<WorkView>('editor')
  const [editorSource, setEditorSource] = useState<EditorSource>('pad')
  const [generatedLoop, setGeneratedLoop] = useState<GeneratedLoop | null>(null)
  const [loopTargetBankId, setLoopTargetBankId] = useState<BankId>('A')
  const [loopChopRegions, setLoopChopRegions] = useState<ChopRegion[]>([])
  const [selectedChopId, setSelectedChopId] = useState<string | null>(null)
  const [editorPlayheadFraction, setEditorPlayheadFraction] = useState<number | null>(null)
  const [isLoopPlaying, setIsLoopPlaying] = useState(false)
  const [loopDecodeStatus, setLoopDecodeStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [selectedPadDecodeStatus, setSelectedPadDecodeStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [selectedEffectId, setSelectedEffectId] = useState('simplefilter')
  const [effectParams, setEffectParams] = useState<Record<string, number>>(() => getEffectDefaults('simplefilter'))
  const [effectEnabled, setEffectEnabled] = useState(false)

  const audioContextRef = useRef<AudioContext | null>(null)
  const effectInputRef = useRef<GainNode | null>(null)
  const masterGainRef = useRef<GainNode | null>(null)
  const effectCleanupRef = useRef<(() => void) | null>(null)
  const bufferMapRef = useRef<Map<string, AudioBuffer>>(new Map())
  const reversedBufferMapRef = useRef<Map<string, AudioBuffer>>(new Map())
  const loadPromiseRef = useRef<Promise<void> | null>(null)
  const activePadSourcesRef = useRef<Map<string, AudioBufferSourceNode>>(new Map())
  const loopAudioRef = useRef<HTMLAudioElement | null>(null)
  const loopStopTimeoutRef = useRef<number | null>(null)
  const playheadFrameRef = useRef<number | null>(null)

  const allPads = useMemo(() => Object.values(bankStates).flatMap((bank) => bank.pads), [bankStates])
  const totalSampleCount = useMemo(() => new Set(allPads.map((pad) => pad.sampleUrl)).size, [allPads])

  const currentBankState = bankStates[currentBankId]
  const currentBankPads = currentBankState.pads
  const selectedPad = useMemo(
    () => currentBankPads.find((pad) => pad.id === currentBankState.selectedPadId) ?? currentBankPads[0],
    [currentBankPads, currentBankState.selectedPadId],
  )

  const selectedPadSettings = currentBankState.playbackSettings[selectedPad.id]
  const semitoneOffset = selectedPadSettings.semitoneOffset
  const padGain = selectedPadSettings.gain
  const padPan = selectedPadSettings.pan
  const playbackMode = selectedPadSettings.playbackMode
  const isPadReversed = selectedPadSettings.reversed
  const currentEditorAudioUrl = editorSource === 'loop' && generatedLoop ? generatedLoop.sampleUrl : selectedPad.sampleUrl
  const activeWaveformStatus = editorSource === 'loop' && generatedLoop ? loopDecodeStatus : selectedPadDecodeStatus
  const selectedChop = selectedChopId ? loopChopRegions.find((region) => region.id === selectedChopId) ?? null : null
  const effectsList = useMemo(() => getEffectsList(), [])
  const currentEffectConfig = getEffectConfig(selectedEffectId)
  const isCurrentEffectSupported = supportedGlobalEffectIds.has(selectedEffectId)

  useEffect(() => {
    return () => {
      if (effectCleanupRef.current) {
        effectCleanupRef.current()
        effectCleanupRef.current = null
      }

      if (audioContextRef.current) {
        void audioContextRef.current.close()
      }

      if (loopStopTimeoutRef.current) {
        window.clearTimeout(loopStopTimeoutRef.current)
      }

      if (playheadFrameRef.current) {
        window.cancelAnimationFrame(playheadFrameRef.current)
      }

      for (const source of activePadSourcesRef.current.values()) {
        try {
          source.stop()
        } catch {}
      }
      activePadSourcesRef.current.clear()

      if (loopAudioRef.current) {
        loopAudioRef.current.pause()
        loopAudioRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (!generatedLoop && editorSource === 'loop') {
      setEditorSource('pad')
    }
  }, [editorSource, generatedLoop])

  useEffect(() => {
    setLoopTargetBankId(currentBankId)
  }, [currentBankId])

  useEffect(() => {
    if (!generatedLoop) {
      setLoopChopRegions([])
      setSelectedChopId(null)
      return
    }

    const nextRegions = buildChopRegions(getLoopDurationSeconds(generatedLoop), loopChopCount)
    setLoopChopRegions(nextRegions)
    setSelectedChopId(nextRegions[0]?.id ?? null)
  }, [generatedLoop?.sampleUrl, generatedLoop?.durationSeconds, generatedLoop?.durationLabel])

  useEffect(() => {
    setLoopDecodeStatus('idle')
    setEditorPlayheadFraction(null)
  }, [generatedLoop?.sampleUrl])

  useEffect(() => {
    setSelectedPadDecodeStatus('idle')
  }, [selectedPad.sampleUrl])

  const applyGlobalEffectRouting = () => {
    const context = audioContextRef.current
    const effectInput = effectInputRef.current
    const masterGain = masterGainRef.current

    if (!context || !effectInput || !masterGain) {
      return
    }

    if (effectCleanupRef.current) {
      effectCleanupRef.current()
      effectCleanupRef.current = null
    }

    try {
      effectInput.disconnect()
    } catch {}

    if (!effectEnabled || !isCurrentEffectSupported) {
      effectInput.connect(masterGain)
      effectCleanupRef.current = () => {
        try {
          effectInput.disconnect()
        } catch {}
      }
      return
    }

    const dryGain = context.createGain()
    const wetGain = context.createGain()
    const wet = clamp(effectParams.wet ?? 0.5, 0, 1)
    dryGain.gain.value = 1 - wet
    wetGain.gain.value = wet

    effectInput.connect(dryGain)
    dryGain.connect(masterGain)

    const cleanupNodes: AudioNode[] = [effectInput, dryGain, wetGain]
    const cleanupSources: AudioScheduledSourceNode[] = []

    const startSource = (source: AudioScheduledSourceNode) => {
      source.start()
      cleanupSources.push(source)
    }

    const finishWetChain = (node: AudioNode) => {
      node.connect(wetGain)
      wetGain.connect(masterGain)
    }

    if (selectedEffectId === 'simplefilter') {
      const filter = context.createBiquadFilter()
      const filterType = ['lowpass', 'highpass', 'bandpass'][Math.max(0, Math.min(2, Math.round(effectParams.filterType ?? 0)))] as BiquadFilterType

      filter.type = filterType
      filter.frequency.value = clamp(effectParams.cutoffFreq ?? 2000, 20, 20000)
      filter.Q.value = clamp(effectParams.resonance ?? 5, 0.0001, 30)

      effectInput.connect(filter)
      finishWetChain(filter)
      cleanupNodes.push(filter)
    } else if (selectedEffectId === 'autofilter') {
      const filter = context.createBiquadFilter()
      const lfo = context.createOscillator()
      const lfoGain = context.createGain()
      const baseFreq = clamp(effectParams.baseFreq ?? 990, 20, 12000)
      const depth = clamp(effectParams.depth ?? 0.8, 0, 1)
      const octaves = clamp(effectParams.octaves ?? 1, 1, 6)

      filter.type = 'lowpass'
      filter.Q.value = 6
      filter.frequency.value = baseFreq
      lfo.type = 'sine'
      lfo.frequency.value = clamp(effectParams.rate ?? 5, 0.1, 10)
      lfoGain.gain.value = baseFreq * (Math.pow(2, octaves) - 1) * depth

      effectInput.connect(filter)
      finishWetChain(filter)
      lfo.connect(lfoGain)
      lfoGain.connect(filter.frequency)
      startSource(lfo)
      cleanupNodes.push(filter, lfoGain, lfo)
    } else if (selectedEffectId === 'autopanner') {
      const panner = typeof context.createStereoPanner === 'function' ? context.createStereoPanner() : null
      const lfo = context.createOscillator()
      const lfoGain = context.createGain()

      if (panner) {
        lfo.type = getLfoWaveform(effectParams.type ?? 0)
        lfo.frequency.value = clamp(effectParams.rate ?? 2, 0.1, 10)
        lfoGain.gain.value = clamp(effectParams.depth ?? 0.8, 0, 1)
        effectInput.connect(panner)
        finishWetChain(panner)
        lfo.connect(lfoGain)
        lfoGain.connect(panner.pan)
        startSource(lfo)
        cleanupNodes.push(panner, lfoGain, lfo)
      } else {
        effectInput.connect(masterGain)
      }
    } else if (selectedEffectId === 'delay') {
      const delay = context.createDelay(2)
      const feedbackGain = context.createGain()

      delay.delayTime.value = clamp(effectParams.delayTime ?? 0.2, 0.01, 2)
      feedbackGain.gain.value = clamp(effectParams.feedback ?? 0.5, 0, 0.95)

      effectInput.connect(delay)
      delay.connect(feedbackGain)
      feedbackGain.connect(delay)
      finishWetChain(delay)
      cleanupNodes.push(delay, feedbackGain)
    } else if (selectedEffectId === 'taptempodelay') {
      const delay = context.createDelay(2)
      const feedbackGain = context.createGain()
      const delaySeconds = getSubdivisionSeconds(effectParams.tapTempo ?? 120, effectParams.subdivision ?? 1)

      delay.delayTime.value = clamp(delaySeconds, 0.01, 2)
      feedbackGain.gain.value = clamp(effectParams.feedback ?? 0.4, 0, 0.95)

      effectInput.connect(delay)
      delay.connect(feedbackGain)
      feedbackGain.connect(delay)
      finishWetChain(delay)
      cleanupNodes.push(delay, feedbackGain)
    } else if (selectedEffectId === 'distortion') {
      const shaper = context.createWaveShaper()
      const toneFilter = context.createBiquadFilter()
      const amount = clamp(effectParams.amount ?? 0.5, 0, 1)
      const tone = clamp(effectParams.tone ?? 0.5, 0, 1)

      shaper.curve = buildDistortionCurve(amount)
      shaper.oversample = '4x'
      toneFilter.type = 'lowpass'
      toneFilter.frequency.value = 700 + tone * 7300

      effectInput.connect(shaper)
      shaper.connect(toneFilter)
      finishWetChain(toneFilter)
      cleanupNodes.push(shaper, toneFilter)
    } else if (selectedEffectId === 'bitcrusher') {
      const crusher = createBitcrusherNode(context, effectParams.bits ?? 8, effectParams.normalRange ?? 0.4)

      effectInput.connect(crusher)
      finishWetChain(crusher)
      cleanupNodes.push(crusher)
    } else if (selectedEffectId === 'reverb') {
      const convolver = context.createConvolver()
      convolver.buffer = buildImpulseResponse(context, clamp(effectParams.roomSize ?? 0.7, 0, 1), clamp(effectParams.decay ?? 2, 0.2, 10))

      effectInput.connect(convolver)
      finishWetChain(convolver)
      cleanupNodes.push(convolver)
    } else if (selectedEffectId === 'hallreverb') {
      const preDelay = context.createDelay(1)
      const convolver = context.createConvolver()
      const damping = context.createBiquadFilter()

      preDelay.delayTime.value = clamp(effectParams.preDelay ?? 0.03, 0, 1)
      convolver.buffer = buildImpulseResponse(context, clamp(effectParams.roomSize ?? 0.8, 0, 1), clamp(effectParams.decay ?? 4, 0.2, 10))
      damping.type = 'lowpass'
      damping.frequency.value = clamp(effectParams.damping ?? 6000, 500, 12000)

      effectInput.connect(preDelay)
      preDelay.connect(convolver)
      convolver.connect(damping)
      finishWetChain(damping)
      cleanupNodes.push(preDelay, convolver, damping)
    } else if (selectedEffectId === 'compressor') {
      const compressor = context.createDynamicsCompressor()
      compressor.threshold.value = clamp(effectParams.threshold ?? -24, -60, 0)
      compressor.ratio.value = clamp(effectParams.ratio ?? 4, 1, 20)
      compressor.attack.value = clamp(effectParams.attack ?? 0.003, 0, 1)
      compressor.knee.value = 24
      compressor.release.value = 0.2

      effectInput.connect(compressor)
      finishWetChain(compressor)
      cleanupNodes.push(compressor)
    } else if (selectedEffectId === 'djeq') {
      const low = context.createBiquadFilter()
      const mid = context.createBiquadFilter()
      const high = context.createBiquadFilter()

      low.type = 'lowshelf'
      low.frequency.value = 120
      low.gain.value = clamp(effectParams.lowGain ?? 0, -15, 15)
      mid.type = 'peaking'
      mid.frequency.value = 1100
      mid.Q.value = 1
      mid.gain.value = clamp(effectParams.midGain ?? 0, -15, 15)
      high.type = 'highshelf'
      high.frequency.value = 4500
      high.gain.value = clamp(effectParams.highGain ?? 0, -15, 15)

      effectInput.connect(low)
      low.connect(mid)
      mid.connect(high)
      finishWetChain(high)
      cleanupNodes.push(low, mid, high)
    } else if (selectedEffectId === 'chorus' || selectedEffectId === 'vibrato' || selectedEffectId === 'pitchshifter') {
      const delay = context.createDelay(0.1)
      const lfo = context.createOscillator()
      const lfoGain = context.createGain()
      const baseDelay = selectedEffectId === 'pitchshifter'
        ? 0.02 + clamp(Math.abs(effectParams.pitch ?? 0), 0, 12) * 0.0012
        : selectedEffectId === 'vibrato'
          ? 0.008
          : clamp((effectParams.delay ?? 5) / 1000, 0.002, 0.03)
      const depth = selectedEffectId === 'pitchshifter'
        ? 0.001 + clamp(Math.abs(effectParams.pitch ?? 0), 0, 12) * 0.0005
        : clamp(effectParams.depth ?? 0.4, 0, 1) * 0.004

      delay.delayTime.value = baseDelay
      lfo.type = getLfoWaveform(effectParams.type ?? 0)
      lfo.frequency.value = clamp(effectParams.rate ?? 1.2, 0.1, 20)
      lfoGain.gain.value = depth

      effectInput.connect(delay)
      delay.connect(wetGain)
      wetGain.connect(masterGain)
      lfo.connect(lfoGain)
      lfoGain.connect(delay.delayTime)
      startSource(lfo)
      cleanupNodes.push(delay, lfoGain, lfo)
    } else if (selectedEffectId === 'flanger') {
      const delay = context.createDelay(0.03)
      const feedbackGain = context.createGain()
      const lfo = context.createOscillator()
      const lfoGain = context.createGain()

      delay.delayTime.value = 0.0025
      feedbackGain.gain.value = clamp(effectParams.feedback ?? 0.3, 0, 0.95)
      lfo.type = 'sine'
      lfo.frequency.value = clamp(effectParams.rate ?? 0.5, 0.1, 5)
      lfoGain.gain.value = clamp((effectParams.depth ?? 50) / 100, 0, 1) * 0.0045

      effectInput.connect(delay)
      delay.connect(feedbackGain)
      feedbackGain.connect(delay)
      delay.connect(wetGain)
      wetGain.connect(masterGain)
      lfo.connect(lfoGain)
      lfoGain.connect(delay.delayTime)
      startSource(lfo)
      cleanupNodes.push(delay, feedbackGain, lfoGain, lfo)
    } else if (selectedEffectId === 'phaser') {
      const stages = Array.from({ length: 4 }, () => context.createBiquadFilter())
      const lfo = context.createOscillator()
      const lfoGain = context.createGain()
      const feedbackGain = context.createGain()

      for (const stage of stages) {
        stage.type = 'allpass'
        stage.Q.value = 0.7
        stage.frequency.value = 800
      }

      lfo.type = 'sine'
      lfo.frequency.value = clamp(effectParams.rate ?? 1, 0.1, 5)
      lfoGain.gain.value = 1200 * clamp(effectParams.depth ?? 0.4, 0, 1)
      feedbackGain.gain.value = clamp(effectParams.feedback ?? 0.7, 0, 0.9)

      effectInput.connect(stages[0])
      stages[0].connect(stages[1])
      stages[1].connect(stages[2])
      stages[2].connect(stages[3])
      stages[3].connect(feedbackGain)
      feedbackGain.connect(stages[0])
      finishWetChain(stages[3])
      lfo.connect(lfoGain)
      for (const stage of stages) {
        lfoGain.connect(stage.frequency)
      }
      startSource(lfo)
      cleanupNodes.push(...stages, feedbackGain, lfoGain, lfo)
    } else if (selectedEffectId === 'combfilter') {
      const delay = context.createDelay(0.1)
      const feedbackGain = context.createGain()
      const feedforwardGain = context.createGain()
      delay.delayTime.value = clamp(effectParams.delayTime ?? 0.01, 0.001, 0.05)
      feedbackGain.gain.value = clamp(effectParams.feedback ?? 0.95, 0, 0.98)
      feedforwardGain.gain.value = clamp(effectParams.feedforward ?? 0.5, 0, 1)

      effectInput.connect(delay)
      delay.connect(feedbackGain)
      feedbackGain.connect(delay)
      effectInput.connect(feedforwardGain)
      feedforwardGain.connect(wetGain)
      delay.connect(wetGain)
      wetGain.connect(masterGain)
      cleanupNodes.push(delay, feedbackGain, feedforwardGain)
    } else if (selectedEffectId === 'ringmodulator') {
      const carrier = context.createOscillator()
      const carrierGain = context.createGain()
      const ringGain = context.createGain()

      carrier.type = getLfoWaveform(effectParams.waveform ?? 0)
      carrier.frequency.value = clamp(effectParams.carrierFreq ?? 200, 10, 2000)
      carrierGain.gain.value = clamp((effectParams.mix ?? 50) / 100, 0, 1)
      ringGain.gain.value = 0

      effectInput.connect(ringGain)
      ringGain.connect(wetGain)
      wetGain.connect(masterGain)
      carrier.connect(carrierGain)
      carrierGain.connect(ringGain.gain)
      startSource(carrier)
      cleanupNodes.push(ringGain, carrierGain, carrier)
    } else if (selectedEffectId === 'tremolo' || selectedEffectId === 'sidechainpump' || selectedEffectId === 'loopchop') {
      const modGain = context.createGain()
      const lfo = context.createOscillator()
      const lfoGain = context.createGain()
      const offset = context.createConstantSource()
      const depth = selectedEffectId === 'loopchop'
        ? clamp(effectParams.wet ?? 0.8, 0, 1)
        : clamp(effectParams.depth ?? 0.8, 0, 1)
      const rate = selectedEffectId === 'tremolo'
        ? clamp(effectParams.rate ?? 6, 0.1, 20)
        : selectedEffectId === 'sidechainpump'
          ? clamp(0.75 + (effectParams.sensitivity ?? 0.1) * 12, 0.5, 8)
          : getLoopChopRate(effectParams.loopSize ?? 2, effectParams.stutterRate ?? 4)

      modGain.gain.value = 1 - depth / 2
      lfo.type = selectedEffectId === 'loopchop' ? 'square' : selectedEffectId === 'sidechainpump' ? 'sawtooth' : 'sine'
      lfo.frequency.value = rate
      lfoGain.gain.value = depth / 2
      offset.offset.value = 1 - depth / 2

      effectInput.connect(modGain)
      modGain.connect(wetGain)
      wetGain.connect(masterGain)
      offset.connect(modGain.gain)
      lfo.connect(lfoGain)
      lfoGain.connect(modGain.gain)
      startSource(offset)
      startSource(lfo)
      cleanupNodes.push(modGain, lfoGain, offset, lfo)
    } else if (selectedEffectId === 'tapestop') {
      const delay = context.createDelay(0.2)
      const lowpass = context.createBiquadFilter()
      const lfo = context.createOscillator()
      const lfoGain = context.createGain()
      const modeRate = [0.12, 0.2, 0.35][Math.max(0, Math.min(2, Math.round(effectParams.mode ?? 2)))] ?? 0.35

      delay.delayTime.value = 0.02 + clamp(effectParams.stopTime ?? 1, 0.1, 3) * 0.015
      lowpass.type = 'lowpass'
      lowpass.frequency.value = 1800 + clamp(effectParams.restartTime ?? 0.5, 0.1, 3) * 1800
      lfo.type = 'sawtooth'
      lfo.frequency.value = modeRate
      lfoGain.gain.value = 0.03

      effectInput.connect(delay)
      delay.connect(lowpass)
      finishWetChain(lowpass)
      lfo.connect(lfoGain)
      lfoGain.connect(delay.delayTime)
      startSource(lfo)
      cleanupNodes.push(delay, lowpass, lfoGain, lfo)
    } else if (selectedEffectId === 'lofitape') {
      const shaper = context.createWaveShaper()
      const tone = context.createBiquadFilter()
      const wobble = context.createDelay(0.05)
      const lfo = context.createOscillator()
      const lfoGain = context.createGain()
      const noise = context.createScriptProcessor(2048, 1, 2)
      const noiseGain = context.createGain()

      shaper.curve = buildDistortionCurve(clamp(effectParams.saturation ?? 0.4, 0, 1))
      shaper.oversample = '2x'
      tone.type = 'lowpass'
      tone.frequency.value = clamp(effectParams.toneRolloff ?? 6000, 500, 12000)
      wobble.delayTime.value = 0.01
      lfo.type = 'sine'
      lfo.frequency.value = clamp(effectParams.flutterRate ?? 6, 0.1, 20)
      lfoGain.gain.value = clamp(effectParams.wowDepth ?? 0.3, 0, 1) * 0.008
      noiseGain.gain.value = clamp(effectParams.noise ?? 0.1, 0, 1) * 0.05
      noise.onaudioprocess = (event) => {
        for (let channel = 0; channel < event.outputBuffer.numberOfChannels; channel += 1) {
          const output = event.outputBuffer.getChannelData(channel)
          for (let index = 0; index < output.length; index += 1) {
            output[index] = (Math.random() * 2 - 1) * 0.5
          }
        }
      }

      effectInput.connect(shaper)
      shaper.connect(tone)
      tone.connect(wobble)
      wobble.connect(wetGain)
      noise.connect(noiseGain)
      noiseGain.connect(wetGain)
      wetGain.connect(masterGain)
      lfo.connect(lfoGain)
      lfoGain.connect(wobble.delayTime)
      startSource(lfo)
      cleanupNodes.push(shaper, tone, wobble, lfoGain, lfo, noise, noiseGain)
    } else {
      effectInput.connect(masterGain)
    }

    effectCleanupRef.current = () => {
      for (const source of cleanupSources) {
        try {
          source.stop()
        } catch {}
      }

      for (const node of cleanupNodes) {
        try {
          node.disconnect()
        } catch {}
      }
    }
  }

  useEffect(() => {
    applyGlobalEffectRouting()
  }, [selectedEffectId, effectParams, effectEnabled, isCurrentEffectSupported])

  const getAudioContext = () => {
    if (!audioContextRef.current) {
      const context = new window.AudioContext()
      const effectInput = context.createGain()
      const masterGain = context.createGain()
      effectInput.gain.value = 1
      masterGain.gain.value = 0.9
      effectInput.connect(masterGain)
      masterGain.connect(context.destination)
      audioContextRef.current = context
      effectInputRef.current = effectInput
      masterGainRef.current = masterGain
      applyGlobalEffectRouting()
    }

    return audioContextRef.current
  }

  const loadPadBuffer = async (pad: Pad) => {
    const cachedBuffer = bufferMapRef.current.get(pad.sampleUrl)
    if (cachedBuffer) {
      return cachedBuffer
    }

    const context = getAudioContext()
    if (context.state === 'suspended') {
      await context.resume()
    }

    const response = await fetch(pad.sampleUrl)
    if (!response.ok) {
      throw new Error('Failed to fetch sample: ' + pad.sampleFile)
    }

    const audioData = await response.arrayBuffer()
    const buffer = await context.decodeAudioData(audioData.slice(0))
    bufferMapRef.current.set(pad.sampleUrl, buffer)
    setLoadedPadCount(bufferMapRef.current.size)
    return buffer
  }

  const ensureAudioEngine = async () => {
    if (engineStatus === 'ready') {
      const context = getAudioContext()
      if (context.state === 'suspended') {
        await context.resume()
      }
      return
    }

    if (loadPromiseRef.current) {
      await loadPromiseRef.current
      return
    }

    const uniquePads = Array.from(new Map(allPads.map((pad) => [pad.sampleUrl, pad])).values())

    const loadTask = (async () => {
      try {
        setEngineStatus('loading')
        setLoadedPadCount(bufferMapRef.current.size)

        const context = getAudioContext()
        if (context.state === 'suspended') {
          await context.resume()
        }

        await Promise.all(uniquePads.map((pad) => loadPadBuffer(pad)))
        setEngineStatus('ready')
      } catch (error) {
        console.error(error)
        bufferMapRef.current.clear()
        reversedBufferMapRef.current.clear()
        setLoadedPadCount(0)
        setEngineStatus('error')
      } finally {
        loadPromiseRef.current = null
      }
    })()

    loadPromiseRef.current = loadTask
    await loadTask
  }

  const getPlaybackBuffer = async (pad: Pad, reversed: boolean) => {
    const sourceBuffer = await loadPadBuffer(pad)

    if (!reversed) {
      return sourceBuffer
    }

    const cachedReversedBuffer = reversedBufferMapRef.current.get(pad.sampleUrl)
    if (cachedReversedBuffer) {
      return cachedReversedBuffer
    }

    const context = getAudioContext()
    const reversedBuffer = createReversedBuffer(context, sourceBuffer)
    reversedBufferMapRef.current.set(pad.sampleUrl, reversedBuffer)
    return reversedBuffer
  }

  const playPadAudio = useEffectEvent(async (padId: string) => {
    await ensureAudioEngine()

    const context = audioContextRef.current
    const effectInput = effectInputRef.current
    const currentPad = bankStates[currentBankId].pads.find((pad) => pad.id === padId)
    const playbackSettings = bankStates[currentBankId].playbackSettings[padId]
    const sampleBuffer = currentPad && playbackSettings ? await getPlaybackBuffer(currentPad, playbackSettings.reversed) : undefined

    if (!context || !effectInput || !sampleBuffer || !playbackSettings || !currentPad) {
      return
    }

    const forwardStartTime = sampleBuffer.duration * playbackSettings.startFraction
    const forwardEndTime = sampleBuffer.duration * playbackSettings.endFraction
    const startTime = playbackSettings.reversed ? sampleBuffer.duration - forwardEndTime : forwardStartTime
    const endTime = playbackSettings.reversed ? sampleBuffer.duration - forwardStartTime : forwardEndTime
    const playbackDuration = Math.max(0.01, endTime - startTime)

    const playbackMode = playbackSettings.playbackMode ?? 'one-shot'

    if (playbackMode === 'loop' && activePadSourcesRef.current.has(padId)) {
      stopPadSource(padId)
      setEditorPlayheadFraction(null)
      return
    }

    if (activePadSourcesRef.current.has(padId)) {
      stopPadSource(padId)
    }

    const source = context.createBufferSource()
    const gainNode = context.createGain()
    const pannerNode = typeof context.createStereoPanner === 'function' ? context.createStereoPanner() : null

    source.buffer = sampleBuffer
    source.playbackRate.value = Math.pow(2, playbackSettings.semitoneOffset / 12)
    source.loop = playbackMode === 'loop' || playbackMode === 'gate-loop'
    gainNode.gain.value = playbackSettings.gain
    if (pannerNode) {
      pannerNode.pan.value = playbackSettings.pan
    }

    const renderedDurationMs = (playbackDuration / source.playbackRate.value) * 1000

    source.connect(gainNode)
    if (pannerNode) {
      gainNode.connect(pannerNode)
      pannerNode.connect(effectInput)
    } else {
      gainNode.connect(effectInput)
    }

    if (playbackMode === 'loop' || playbackMode === 'gate-loop') {
      source.loopStart = startTime
      source.loopEnd = endTime
      activePadSourcesRef.current.set(padId, source)
      setActivePadIds((current) => (current.includes(padId) ? current : current.concat(padId)))
    }

    if (playbackMode === 'one-shot' || playbackMode === 'gate') {
      source.onended = () => {
        activePadSourcesRef.current.delete(padId)
        setActivePadIds((current) => current.filter((currentPadId) => currentPadId !== padId))
        setEditorPlayheadFraction(null)
      }
    }

    source.start(0, startTime, playbackDuration)
    startPlayheadAnimation(
      playbackSettings.reversed ? playbackSettings.endFraction : playbackSettings.startFraction,
      playbackSettings.reversed ? playbackSettings.startFraction : playbackSettings.endFraction,
      renderedDurationMs,
    )

    if (playbackMode === 'gate') {
      activePadSourcesRef.current.set(padId, source)
    }
  })

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) {
        return
      }

      const key = event.key.toUpperCase()
      const matchedPad = currentBankPads.find((pad) => pad.keyTrigger === key)

      if (!matchedPad) {
        return
      }

      const target = event.target
      if (
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLInputElement && target.type !== 'range')
      ) {
        return
      }

      event.preventDefault()
      setBankStates((current) => ({
        ...current,
        [currentBankId]: {
          ...current[currentBankId],
          selectedPadId: matchedPad.id,
        },
      }))
      setActivePadIds((current) => (current.includes(matchedPad.id) ? current : current.concat(matchedPad.id)))
      void playPadAudio(matchedPad.id)
    }

    const handleKeyUp = (event: KeyboardEvent) => {
      const key = event.key.toUpperCase()
      const matchedPad = currentBankPads.find((pad) => pad.keyTrigger === key)

      if (!matchedPad) {
        return
      }

      releasePad(matchedPad.id)
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [currentBankId, currentBankPads, playPadAudio])

  const updateCurrentBank = (updater: (bank: BankState) => BankState) => {
    setBankStates((current) => ({
      ...current,
      [currentBankId]: updater(current[currentBankId]),
    }))
  }

  const triggerPad = (padId: string) => {
    updateCurrentBank((bank) => ({
      ...bank,
      selectedPadId: padId,
    }))
    setActivePadIds((current) => (current.includes(padId) ? current : current.concat(padId)))
    void playPadAudio(padId)
  }

  const releasePad = (padId: string) => {
    const mode = currentBankState.playbackSettings[padId]?.playbackMode ?? 'one-shot'

    if (mode === 'gate' || mode === 'gate-loop') {
      stopPadSource(padId)
      setEditorPlayheadFraction(null)
      return
    }

    if (mode === 'one-shot') {
      setActivePadIds((current) => current.filter((currentPadId) => currentPadId !== padId))
    }
  }

  const switchBank = (bankId: BankId) => {
    if (bankId === currentBankId) {
      return
    }

    stopAllPadSources()
    setEditorPlayheadFraction(null)
    setActivePadIds([])
    startTransition(() => {
      setCurrentBankId(bankId)
    })
  }

  const updateTrim = (
    padId: string,
    field: 'startFraction' | 'endFraction',
    nextPercent: number,
  ) => {
    updateCurrentBank((bank) => {
      const existing = bank.playbackSettings[padId] ?? { startFraction: 0, endFraction: 1, semitoneOffset: 0, gain: 1, pan: 0, playbackMode: 'one-shot', reversed: false }
      const nextValue = nextPercent / 100

      if (field === 'startFraction') {
        const startFraction = Math.min(nextValue, existing.endFraction - 0.01)
        return {
          ...bank,
          playbackSettings: {
            ...bank.playbackSettings,
            [padId]: {
              ...existing,
              startFraction,
            },
          },
        }
      }

      const endFraction = Math.max(nextValue, existing.startFraction + 0.01)
      return {
        ...bank,
        playbackSettings: {
          ...bank.playbackSettings,
          [padId]: {
            ...existing,
            endFraction,
          },
        },
      }
    })
  }

  const updateSemitoneOffset = (padId: string, nextValue: number) => {
    updateCurrentBank((bank) => {
      const existing = bank.playbackSettings[padId] ?? { startFraction: 0, endFraction: 1, semitoneOffset: 0, gain: 1, pan: 0, playbackMode: 'one-shot', reversed: false }
      return {
        ...bank,
        playbackSettings: {
          ...bank.playbackSettings,
          [padId]: {
            ...existing,
            semitoneOffset: nextValue,
          },
        },
      }
    })
  }

  const updatePadGain = (padId: string, nextValue: number) => {
    updateCurrentBank((bank) => {
      const existing = bank.playbackSettings[padId] ?? { startFraction: 0, endFraction: 1, semitoneOffset: 0, gain: 1, pan: 0, playbackMode: 'one-shot', reversed: false }
      return {
        ...bank,
        playbackSettings: {
          ...bank.playbackSettings,
          [padId]: {
            ...existing,
            gain: nextValue,
          },
        },
      }
    })
  }

  const updatePadPan = (padId: string, nextValue: number) => {
    updateCurrentBank((bank) => {
      const existing = bank.playbackSettings[padId] ?? { startFraction: 0, endFraction: 1, semitoneOffset: 0, gain: 1, pan: 0, playbackMode: 'one-shot', reversed: false }
      return {
        ...bank,
        playbackSettings: {
          ...bank.playbackSettings,
          [padId]: {
            ...existing,
            pan: nextValue,
          },
        },
      }
    })
  }


  const stopPadSource = (padId: string, keepActiveVisual = false) => {
    const activeSource = activePadSourcesRef.current.get(padId)
    if (activeSource) {
      activeSource.onended = null
      try {
        activeSource.stop()
      } catch {}
      activePadSourcesRef.current.delete(padId)
    }

    if (!keepActiveVisual) {
      setActivePadIds((current) => current.filter((currentPadId) => currentPadId !== padId))
    }
  }

  const stopAllPadSources = () => {
    for (const padId of activePadSourcesRef.current.keys()) {
      stopPadSource(padId)
    }
  }

  const updatePlaybackMode = (padId: string, nextMode: PlaybackMode) => {
    stopPadSource(padId)
    updateCurrentBank((bank) => {
      const existing = bank.playbackSettings[padId] ?? { startFraction: 0, endFraction: 1, semitoneOffset: 0, gain: 1, pan: 0, playbackMode: 'one-shot', reversed: false }
      return {
        ...bank,
        playbackSettings: {
          ...bank.playbackSettings,
          [padId]: {
            ...existing,
            playbackMode: nextMode,
          },
        },
      }
    })
  }

  const togglePadReverse = (padId: string) => {
    stopPadSource(padId)
    updateCurrentBank((bank) => {
      const existing = bank.playbackSettings[padId] ?? { startFraction: 0, endFraction: 1, semitoneOffset: 0, gain: 1, pan: 0, playbackMode: 'one-shot', reversed: false }
      return {
        ...bank,
        playbackSettings: {
          ...bank.playbackSettings,
          [padId]: {
            ...existing,
            reversed: !existing.reversed,
          },
        },
      }
    })
  }

  const handleEffectSelection = (effectId: string) => {
    setSelectedEffectId(effectId)
    setEffectParams(getEffectDefaults(effectId))
  }

  const updateEffectParam = (key: string, value: number) => {
    setEffectParams((current) => ({
      ...current,
      [key]: value,
    }))
  }

  const generateAudio = async (mode: GenerationMode) => {
    const nextPrompt = promptText.trim()

    if (!nextPrompt) {
      setGenerationStatus('error')
      setGenerationMessage('Enter a prompt before generating audio.')
      return
    }

    try {
      setGenerationStatus('generating')
      setGenerationMode(mode)
      setGenerationMessage(
        mode === 'kit'
          ? 'Anthropic is planning and generating a full 16-pad bank for Bank ' + currentBankId + '.'
          : mode === 'pad'
            ? 'Anthropic is generating a fresh sample for ' + selectedPad.label + '.'
            : 'Anthropic is generating a loop for the work area.'
      )

      const response = await fetch('/api/generate-kit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: nextPrompt,
          bankId: currentBankId,
          mode,
          selectedPadId: selectedPad.id,
        }),
      })

      const payload = (await response.json()) as {
        error?: string
        summary?: string
        generatedPads?: Pad[]
        generatedLoop?: GeneratedLoop
      }

      if (!response.ok) {
        throw new Error(payload.error || 'Generation failed.')
      }

      if (payload.generatedLoop) {
        if (loopStopTimeoutRef.current) {
          window.clearTimeout(loopStopTimeoutRef.current)
          loopStopTimeoutRef.current = null
        }

        if (loopAudioRef.current) {
          loopAudioRef.current.pause()
          loopAudioRef.current = null
        }

        setGeneratedLoop(payload.generatedLoop)
        setEditorSource('loop')
        setIsLoopPlaying(false)
        setWorkView('editor')
        setGenerationStatus('idle')
        setGenerationMessage(payload.summary || 'Loaded a fresh loop into the work area.')
        return
      }

      if (!payload.generatedPads?.length) {
        throw new Error(payload.error || 'Generation failed.')
      }

      setBankStates((current) => {
        const currentBank = current[currentBankId]
        const generatedPadMap = new Map(payload.generatedPads?.map((pad) => [pad.id, pad]))
        const nextPads = currentBank.pads.map((pad) => generatedPadMap.get(pad.id) ?? pad)
        const nextPlaybackSettings = { ...currentBank.playbackSettings }

        for (const pad of payload.generatedPads ?? []) {
          nextPlaybackSettings[pad.id] = { startFraction: 0, endFraction: 1, semitoneOffset: 0, gain: pad.gain, pan: 0, playbackMode: 'one-shot', reversed: false }
        }

        return {
          ...current,
          [currentBankId]: {
            pads: nextPads,
            selectedPadId: payload.generatedPads?.[0]?.id ?? currentBank.selectedPadId,
            playbackSettings: nextPlaybackSettings,
          },
        }
      })

      setActivePadIds([])
      setGenerationStatus('idle')
      setGenerationMessage(
        payload.summary ||
          (mode === 'pad'
            ? 'Loaded a freshly generated sample into ' + selectedPad.label + '.'
            : 'Loaded a freshly generated 16-pad bank into Bank ' + currentBankId + '.')
      )
    } catch (error) {
      setGenerationStatus('error')
      setGenerationMessage(error instanceof Error ? error.message : 'Generation failed.')
    }
  }

  const engineLabel =
    engineStatus === 'ready'
      ? 'Web Audio Ready'
      : engineStatus === 'loading'
        ? 'Loading Samples'
        : engineStatus === 'error'
          ? 'Engine Error'
          : 'Web Audio Idle'


  const startPlayheadAnimation = (startFraction: number, endFraction: number, durationMs: number) => {
    if (playheadFrameRef.current) {
      window.cancelAnimationFrame(playheadFrameRef.current)
      playheadFrameRef.current = null
    }

    const startedAt = performance.now()
    const safeDurationMs = Math.max(16, durationMs)

    const tick = (now: number) => {
      const elapsed = now - startedAt
      const progress = Math.min(1, elapsed / safeDurationMs)
      const nextFraction = startFraction + (endFraction - startFraction) * progress
      setEditorPlayheadFraction(nextFraction)

      if (progress < 1) {
        playheadFrameRef.current = window.requestAnimationFrame(tick)
        return
      }

      playheadFrameRef.current = null
    }

    setEditorPlayheadFraction(startFraction)
    playheadFrameRef.current = window.requestAnimationFrame(tick)
  }

  const startLoopPlayheadMonitor = (durationSeconds: number, startSeconds = 0) => {
    if (playheadFrameRef.current) {
      window.cancelAnimationFrame(playheadFrameRef.current)
      playheadFrameRef.current = null
    }

    const tick = () => {
      const audio = loopAudioRef.current
      if (!audio) {
        setEditorPlayheadFraction(null)
        return
      }

      const fraction = Math.min(1, Math.max(0, audio.currentTime / durationSeconds))
      setEditorPlayheadFraction(fraction)

      if (!audio.paused) {
        playheadFrameRef.current = window.requestAnimationFrame(tick)
      }
    }

    setEditorPlayheadFraction(Math.min(1, Math.max(0, startSeconds / durationSeconds)))
    playheadFrameRef.current = window.requestAnimationFrame(tick)
  }

  const stopLoopPlayback = () => {
    if (loopStopTimeoutRef.current) {
      window.clearTimeout(loopStopTimeoutRef.current)
      loopStopTimeoutRef.current = null
    }

    if (playheadFrameRef.current) {
      window.cancelAnimationFrame(playheadFrameRef.current)
      playheadFrameRef.current = null
    }

    if (loopAudioRef.current) {
      loopAudioRef.current.pause()
      loopAudioRef.current.currentTime = 0
    }

    setEditorPlayheadFraction(null)
    setIsLoopPlaying(false)
  }

  const ensureLoopAudio = () => {
    if (!generatedLoop) {
      return null
    }

    const expectedUrl = new URL(generatedLoop.sampleUrl, window.location.origin).toString()

    if (!loopAudioRef.current) {
      const audio = new Audio(expectedUrl)
      audio.addEventListener('ended', () => setIsLoopPlaying(false))
      loopAudioRef.current = audio
    }

    const audio = loopAudioRef.current
    if (audio.src !== expectedUrl) {
      audio.pause()
      audio.src = expectedUrl
      audio.currentTime = 0
    }

    return audio
  }

  const toggleLoopPreview = () => {
    if (!generatedLoop) {
      return
    }

    const audio = ensureLoopAudio()
    if (!audio) {
      return
    }

    if (!audio.paused && audio.loop) {
      stopLoopPlayback()
      return
    }

    if (loopStopTimeoutRef.current) {
      window.clearTimeout(loopStopTimeoutRef.current)
      loopStopTimeoutRef.current = null
    }

    audio.loop = true
    audio.currentTime = 0
    void audio.play()
    startLoopPlayheadMonitor(getLoopDurationSeconds(generatedLoop), 0)
    setIsLoopPlaying(true)
  }

  const auditionLoopChop = (region: ChopRegion) => {
    if (!generatedLoop) {
      return
    }

    const audio = ensureLoopAudio()
    if (!audio) {
      return
    }

    if (loopStopTimeoutRef.current) {
      window.clearTimeout(loopStopTimeoutRef.current)
    }

    audio.pause()
    audio.loop = false
    audio.currentTime = Math.max(0, region.start)
    void audio.play()
    startLoopPlayheadMonitor(getLoopDurationSeconds(generatedLoop), region.start)
    setIsLoopPlaying(true)

    loopStopTimeoutRef.current = window.setTimeout(() => {
      audio.pause()
      audio.currentTime = region.start
      if (playheadFrameRef.current) {
        window.cancelAnimationFrame(playheadFrameRef.current)
        playheadFrameRef.current = null
      }
      setEditorPlayheadFraction(region.start / getLoopDurationSeconds(generatedLoop))
      setIsLoopPlaying(false)
      loopStopTimeoutRef.current = null
    }, Math.max(20, (region.end - region.start) * 1000))
  }

  const handleLoopRegionSelect = (region: ChopRegion) => {
    setSelectedChopId(region.id)
    auditionLoopChop(region)
  }

  const handleLoopRegionsChange = (regions: ChopRegion[]) => {
    if (!generatedLoop) {
      return
    }

    const normalized = normalizeChopRegions(regions, getLoopDurationSeconds(generatedLoop))
    setLoopChopRegions(normalized)

    if (!selectedChopId && normalized[0]) {
      setSelectedChopId(normalized[0].id)
    }
  }

  const loadLoopToBank = (targetBankId: BankId) => {
    if (!generatedLoop || loopChopRegions.length === 0) {
      return
    }

    stopLoopPlayback()
    stopAllPadSources()
    setActivePadIds([])

    setBankStates((current) => {
      const targetBank = current[targetBankId]
      const nextPads = targetBank.pads.map((pad, index) => {
        const region = loopChopRegions[index]
        const chopNumber = index + 1

        if (!region) {
          return pad
        }

        return {
          ...pad,
          sampleName: `${generatedLoop.sampleName} Chop ${chopNumber}`,
          sampleFile: generatedLoop.sampleFile,
          sampleUrl: generatedLoop.sampleUrl,
          sourceType: generatedLoop.sourceType,
          durationLabel: `${Math.max(0.01, region.end - region.start).toFixed(2)}s chop`,
          gain: 1,
        }
      })

      const loopDuration = Math.max(0.01, getLoopDurationSeconds(generatedLoop))
      const nextPlaybackSettings = Object.fromEntries(
        nextPads.map((pad, index) => {
          const region = loopChopRegions[index]
          const existing = targetBank.playbackSettings[pad.id]

          return [
            pad.id,
            {
              startFraction: region ? region.start / loopDuration : existing?.startFraction ?? 0,
              endFraction: region ? region.end / loopDuration : existing?.endFraction ?? 1,
              semitoneOffset: 0,
              gain: 1,
              pan: 0,
              playbackMode: 'one-shot' as const,
              reversed: false,
            },
          ]
        }),
      ) as Record<string, PadPlaybackSetting>

      return {
        ...current,
        [targetBankId]: {
          ...targetBank,
          pads: nextPads,
          selectedPadId: nextPads[0]?.id ?? targetBank.selectedPadId,
          playbackSettings: nextPlaybackSettings,
        },
      }
    })

    setGenerationMessage(`Loaded ${loopChopRegions.length} chops from the loop into Bank ${targetBankId}.`)
    setCurrentBankId(targetBankId)
    setEditorSource('pad')
  }

  return (
    <main className="app-shell">
      <header className="work-area" aria-label="Sampler work area">
        <div className="work-area-toolbar">
          <div className="work-area-title">
            <p className="eyebrow">Browser Gen MPC</p>
            <strong>{workView === 'editor' ? 'Sample Editor' : workView === 'sequence' ? 'Sequence Work Area' : 'Effects Rack'}</strong>
          </div>
          <div className="work-area-tabs" role="tablist" aria-label="Work views">
            <button type="button" className={workView === 'editor' ? 'work-tab is-current' : 'work-tab'} onClick={() => setWorkView('editor')}>
              Editor
            </button>
            <button type="button" className={workView === 'sequence' ? 'work-tab is-current' : 'work-tab'} onClick={() => setWorkView('sequence')}>
              Sequence
            </button>
            <button type="button" className={workView === 'effects' ? 'work-tab is-current' : 'work-tab'} onClick={() => setWorkView('effects')}>
              Effects
            </button>
          </div>
        </div>

        {workView === 'editor' ? (
          <div className="work-surface" aria-label="Sample editor workspace">
            <>
              <div className="editor-source-tabs" role="tablist" aria-label="Editor sources">
                <button type="button" className={editorSource === 'pad' ? 'work-tab is-current' : 'work-tab'} onClick={() => setEditorSource('pad')}>
                  Selected Pad
                </button>
                {generatedLoop ? (
                  <button type="button" className={editorSource === 'loop' ? 'work-tab is-current' : 'work-tab'} onClick={() => setEditorSource('loop')}>
                    Loop Source
                  </button>
                ) : null}
              </div>
              <div className="waveform-panel">
                <SampleWaveform
                  audioUrl={currentEditorAudioUrl}
                  regions={editorSource === 'loop' && generatedLoop ? loopChopRegions : []}
                  selectedRegionId={editorSource === 'loop' ? selectedChopId : null}
                  playheadFraction={editorPlayheadFraction}
                  markerStartFraction={editorSource === 'pad' ? selectedPadSettings.startFraction : null}
                  markerEndFraction={editorSource === 'pad' ? selectedPadSettings.endFraction : null}
                  reversed={editorSource === 'pad' ? isPadReversed : false}
                  onStatusChange={editorSource === 'loop' && generatedLoop ? setLoopDecodeStatus : setSelectedPadDecodeStatus}
                  onRegionSelect={editorSource === 'loop' && generatedLoop ? handleLoopRegionSelect : undefined}
                  onRegionsChange={editorSource === 'loop' && generatedLoop ? handleLoopRegionsChange : undefined}
                  onMarkerChange={editorSource === 'pad' ? (field, nextFraction) => updateTrim(selectedPad.id, field === 'start' ? 'startFraction' : 'endFraction', nextFraction * 100) : undefined}
                  onWaveformClick={editorSource === 'pad' ? () => triggerPad(selectedPad.id) : undefined}
                />
              </div>
              {editorSource === 'pad' ? (
                <div className="editor-pad-controls">
                  <div className="editor-pad-meta">
                    <article>
                      <span className="transport-label">Bank</span>
                      <strong>{currentBankId}</strong>
                    </article>
                    <article>
                      <span className="transport-label">Pad</span>
                      <strong>{selectedPad.label}</strong>
                    </article>
                    <article>
                      <span className="transport-label">Sample</span>
                      <strong>{selectedPad.sampleName}</strong>
                    </article>
                    <article>
                      <span className="transport-label">Source</span>
                      <strong>{sourceLabels[selectedPad.sourceType]}</strong>
                    </article>
                    <article>
                      <span className="transport-label">File</span>
                      <strong>{selectedPad.sampleFile}</strong>
                    </article>
                    <article>
                      <span className="transport-label">Waveform</span>
                      <strong>{activeWaveformStatus === 'loading' ? 'Decoding' : activeWaveformStatus === 'ready' ? 'Ready' : activeWaveformStatus === 'error' ? 'Error' : 'Idle'}</strong>
                    </article>
                  </div>

                  <div className="playback-mode-group editor-playback-mode-group">
                    <div className="editor-playback-mode-radios" role="radiogroup" aria-label="Playback mode">
                      {(['one-shot', 'loop', 'gate', 'gate-loop'] as const).map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          role="radio"
                          aria-checked={playbackMode === mode}
                          className={playbackMode === mode ? 'playback-mode-button is-current' : 'playback-mode-button'}
                          onClick={() => updatePlaybackMode(selectedPad.id, mode)}
                        >
                          {mode}
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      aria-pressed={isPadReversed}
                      className={isPadReversed ? 'playback-mode-button is-current' : 'playback-mode-button'}
                      onClick={() => togglePadReverse(selectedPad.id)}
                    >
                      Reverse
                    </button>
                  </div>

                  <div className="trim-controls editor-trim-controls">
                    <div className="trim-control">
                      <span>Pitch</span>
                      <Slider.Root
                        className="trim-slider-root single-thumb"
                        min={-12}
                        max={12}
                        step={1}
                        value={[semitoneOffset]}
                        onValueChange={([value]) => updateSemitoneOffset(selectedPad.id, value)}
                      >
                        <Slider.Track className="trim-slider-track">
                          <Slider.Range className="trim-slider-range" />
                        </Slider.Track>
                        <Slider.Thumb className="trim-slider-thumb" aria-label="Pitch" />
                      </Slider.Root>
                      <div className="trim-readout single-value">
                        <strong>{semitoneOffset > 0 ? '+' : ''}{semitoneOffset} st</strong>
                      </div>
                    </div>

                    <div className="trim-control">
                      <span>Gain</span>
                      <Slider.Root
                        className="trim-slider-root single-thumb"
                        min={0}
                        max={1.5}
                        step={0.01}
                        value={[padGain]}
                        onValueChange={([value]) => updatePadGain(selectedPad.id, value)}
                      >
                        <Slider.Track className="trim-slider-track">
                          <Slider.Range className="trim-slider-range" />
                        </Slider.Track>
                        <Slider.Thumb className="trim-slider-thumb" aria-label="Gain" />
                      </Slider.Root>
                      <div className="trim-readout single-value">
                        <strong>{padGain.toFixed(2)}</strong>
                      </div>
                    </div>

                    <div className="trim-control">
                      <span>Pan</span>
                      <Slider.Root
                        className="trim-slider-root single-thumb"
                        min={-1}
                        max={1}
                        step={0.01}
                        value={[padPan]}
                        onValueChange={([value]) => updatePadPan(selectedPad.id, value)}
                      >
                        <Slider.Track className="trim-slider-track">
                          <Slider.Range className="trim-slider-range" />
                        </Slider.Track>
                        <Slider.Thumb className="trim-slider-thumb" aria-label="Pan" />
                      </Slider.Root>
                      <div className="trim-readout single-value">
                        <strong>{padPan === 0 ? 'C' : padPan < 0 ? `L ${Math.round(Math.abs(padPan) * 100)}` : `R ${Math.round(padPan * 100)}`}</strong>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
              <div className="work-surface-actions">
                {editorSource === 'loop' && generatedLoop ? (
                  <>
                    <button type="button" className="primary-button" onClick={toggleLoopPreview}>
                      {isLoopPlaying ? 'Stop Loop' : 'Play Loop'}
                    </button>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => selectedChop && auditionLoopChop(selectedChop)}
                      disabled={!selectedChop}
                    >
                      {selectedChop ? `Audition ${selectedChop.id.replace('chop-', 'Chop ')}` : 'Select a Chop'}
                    </button>
                    <label className="bank-load-field">
                      <span className="transport-label">Target Bank</span>
                      <select value={loopTargetBankId} onChange={(event) => setLoopTargetBankId(event.target.value as BankId)}>
                        {bankIds.map((bankId) => (
                          <option key={bankId} value={bankId}>
                            Bank {bankId}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      className="primary-button"
                      onClick={() => loadLoopToBank(loopTargetBankId)}
                      disabled={loopChopRegions.length === 0}
                    >
                      Add to Bank
                    </button>
                  </>
                ) : null}
              </div>
            </>
          </div>
        ) : workView === 'effects' ? (
          <div className="work-surface effects-surface" aria-label="Effects workspace">
            <div className="effects-toolbar">
              <label className="effects-select-field">
                <span className="transport-label">Effect</span>
                <select
                  value={selectedEffectId}
                  onChange={(event) => {
                    handleEffectSelection(event.target.value)
                    event.currentTarget.blur()
                  }}
                >
                  {effectsList.map((effect) => (
                    <option key={effect.id} value={effect.id}>
                      {effect.name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className={effectEnabled ? 'primary-button' : 'secondary-button'}
                onClick={() => setEffectEnabled((current) => !current)}
              >
                {effectEnabled ? 'Bypass Effect' : 'Engage Effect'}
              </button>
            </div>
            {currentEffectConfig ? (
              <>
                <p className="effects-description">{currentEffectConfig.description}</p>
                <div className="effects-grid">
                  {currentEffectConfig.parameters.map((parameter) => {
                    const value = effectParams[parameter.key] ?? parameter.default
                    return (
                      <div key={parameter.key} className="effect-control">
                        <span>{parameter.label}</span>
                        <Slider.Root
                          className="trim-slider-root single-thumb"
                          min={parameter.min}
                          max={parameter.max}
                          step={parameter.step}
                          value={[value]}
                          onValueChange={([nextValue]) => updateEffectParam(parameter.key, nextValue)}
                        >
                          <Slider.Track className="trim-slider-track">
                            <Slider.Range className="trim-slider-range" />
                          </Slider.Track>
                          <Slider.Thumb className="trim-slider-thumb" aria-label={parameter.label} />
                        </Slider.Root>
                        <div className="trim-readout single-value">
                          <strong>{formatEffectParamValue(parameter, value)}</strong>
                        </div>
                      </div>
                    )
                  })}
                </div>
                <p className="effects-note">All listed effects are live on sampler pad playback now. Loop preview is still dry in this pass, and some of the more complex processors are pragmatic Web Audio versions for now.</p>
              </>
            ) : null}
          </div>
        ) : (
          <div className="work-surface" aria-label="Sequence workspace">
            <div className="work-surface-meta compact">
              <div>
                <span className="transport-label">Bank</span>
                <strong>{currentBankId}</strong>
              </div>
              <div>
                <span className="transport-label">Samples Cached</span>
                <strong>{loadedPadCount} / {totalSampleCount}</strong>
              </div>
              <div>
                <span className="transport-label">Engine</span>
                <strong>{engineLabel}</strong>
              </div>
            </div>
            <div className="step-strip" aria-hidden="true">
              {Array.from({ length: 16 }, (_, index) => (
                <span
                  key={index}
                  className={index === 0 || index === 4 || index === 8 || index === 12 ? 'step active' : 'step'}
                />
              ))}
            </div>
          </div>
        )}
      </header>

      <section className="workspace">
        <section className="grid-panel panel">
          <div className="panel-heading">
            <p className="panel-kicker">Pads</p>
          </div>

          <div className="bank-switcher" aria-label="Pad banks">
            <div className="bank-buttons" role="tablist" aria-label="Pad banks">
              {bankIds.map((bankId) => (
                <button
                  key={bankId}
                  type="button"
                  role="tab"
                  aria-selected={currentBankId === bankId}
                  className={currentBankId === bankId ? 'bank-button is-current' : 'bank-button'}
                  onClick={() => switchBank(bankId)}
                >
                  Bank {bankId}
                </button>
              ))}
            </div>
          </div>

          <div className="pad-grid" aria-label="Sample pad grid">
            {currentBankPads.map((pad) => (
              <button
                key={pad.id}
                type="button"
                className={
                  'pad pad-' +
                  pad.group +
                  (selectedPad.id === pad.id ? ' is-selected' : '') +
                  (activePadIds.includes(pad.id) ? ' is-active' : '')
                }
                aria-pressed={selectedPad.id === pad.id}
                onPointerDown={() => triggerPad(pad.id)}
                onPointerUp={() => releasePad(pad.id)}
                onPointerLeave={() => releasePad(pad.id)}
                onBlur={() => releasePad(pad.id)}
              >
                <span className="pad-key">{pad.keyTrigger}</span>
                <span className="pad-group">{groupLabels[pad.group]}</span>
                <strong>{pad.label}</strong>
                <span className="pad-sample">{pad.sampleName}</span>
              </button>
            ))}
          </div>
        </section>


        <section className="prompt-panel panel">
          <div className="panel-heading">
            <p className="panel-kicker">Generate</p>
          </div>

          <label className="prompt-field">
            <span>Describe a drum kit, one-shot, or loop</span>
            <textarea
              placeholder="Try: gritty Memphis kit with blown-out snares and a short sub kick"
              rows={5}
              value={promptText}
              onChange={(event) => setPromptText(event.target.value)}
            />
          </label>

          <div className="prompt-actions">
            <button
              type="button"
              className="primary-button"
              onClick={() => void generateAudio('kit')}
              disabled={generationStatus === 'generating'}
            >
              {generationStatus === 'generating' && generationMode === 'kit' ? 'Generating...' : 'Generate Kit'}
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() => void generateAudio('loop')}
              disabled={generationStatus === 'generating'}
            >
              {generationStatus === 'generating' && generationMode === 'loop' ? 'Generating...' : 'Generate Loop'}
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() => void generateAudio('pad')}
              disabled={generationStatus === 'generating'}
            >
              {generationStatus === 'generating' && generationMode === 'pad' ? 'Generating...' : 'Generate Pad'}
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() => void generateAudio('pad')}
              disabled={generationStatus === 'generating'}
            >
              Regenerate Pad
            </button>
          </div>

          <div className="preset-list" aria-label="Prompt examples">
            {promptPresets.map((preset) => (
              <button key={preset} type="button" className="preset-chip" onClick={() => setPromptText(preset)}>
                {preset}
              </button>
            ))}
          </div>

          <div className="generation-status" aria-live="polite">
            <span>{generationMessage}</span>
          </div>
        </section>

      </section>
    </main>
  )
}

export default App
