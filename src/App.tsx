import { startTransition, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react'
import * as Slider from '@radix-ui/react-slider'
import { type BankKitId, type Pad, type PadSourceType } from './mock-kit'
import { starterBankPads } from './kit-generation'
import { SampleWaveform, type WaveformRegion } from './components/sample-waveform'

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
type WorkView = 'editor' | 'sequence'
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
  playbackMode: PlaybackMode
}

type BankState = {
  pads: Pad[]
  selectedPadId: string
  playbackSettings: Record<string, PadPlaybackSetting>
}

const createInitialPlaybackSettings = (pads: Pad[]) =>
  Object.fromEntries(
    pads.map((pad) => [pad.id, { startFraction: 0, endFraction: 1, semitoneOffset: 0, gain: pad.gain, playbackMode: 'one-shot' }]),
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
  const [loopChopRegions, setLoopChopRegions] = useState<ChopRegion[]>([])
  const [selectedChopId, setSelectedChopId] = useState<string | null>(null)
  const [editorPlayheadFraction, setEditorPlayheadFraction] = useState<number | null>(null)
  const [isLoopPlaying, setIsLoopPlaying] = useState(false)
  const [loopDecodeStatus, setLoopDecodeStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [selectedPadDecodeStatus, setSelectedPadDecodeStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')

  const audioContextRef = useRef<AudioContext | null>(null)
  const masterGainRef = useRef<GainNode | null>(null)
  const bufferMapRef = useRef<Map<string, AudioBuffer>>(new Map())
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
  const trimStartPercent = Math.round(selectedPadSettings.startFraction * 100)
  const trimEndPercent = Math.round(selectedPadSettings.endFraction * 100)
  const semitoneOffset = selectedPadSettings.semitoneOffset
  const padGain = selectedPadSettings.gain
  const playbackMode = selectedPadSettings.playbackMode
  const currentEditorAudioUrl = editorSource === 'loop' && generatedLoop ? generatedLoop.sampleUrl : selectedPad.sampleUrl
  const activeWaveformStatus = editorSource === 'loop' && generatedLoop ? loopDecodeStatus : selectedPadDecodeStatus
  const selectedChop = selectedChopId ? loopChopRegions.find((region) => region.id === selectedChopId) ?? null : null

  useEffect(() => {
    return () => {
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

  const getAudioContext = () => {
    if (!audioContextRef.current) {
      const context = new window.AudioContext()
      const masterGain = context.createGain()
      masterGain.gain.value = 0.9
      masterGain.connect(context.destination)
      audioContextRef.current = context
      masterGainRef.current = masterGain
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
        setLoadedPadCount(0)
        setEngineStatus('error')
      } finally {
        loadPromiseRef.current = null
      }
    })()

    loadPromiseRef.current = loadTask
    await loadTask
  }

  const playPadAudio = useEffectEvent(async (padId: string) => {
    await ensureAudioEngine()

    const context = audioContextRef.current
    const masterGain = masterGainRef.current
    const currentPad = bankStates[currentBankId].pads.find((pad) => pad.id === padId)
    const sampleBuffer = currentPad ? await loadPadBuffer(currentPad) : undefined
    const playbackSettings = bankStates[currentBankId].playbackSettings[padId]

    if (!context || !masterGain || !sampleBuffer || !playbackSettings || !currentPad) {
      return
    }

    const startTime = sampleBuffer.duration * playbackSettings.startFraction
    const endTime = sampleBuffer.duration * playbackSettings.endFraction
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

    source.buffer = sampleBuffer
    source.playbackRate.value = Math.pow(2, playbackSettings.semitoneOffset / 12)
    source.loop = playbackMode === 'loop' || playbackMode === 'gate-loop'
    gainNode.gain.value = playbackSettings.gain

    const renderedDurationMs = (playbackDuration / source.playbackRate.value) * 1000

    source.connect(gainNode)
    gainNode.connect(masterGain)

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
    startPlayheadAnimation(playbackSettings.startFraction, playbackSettings.endFraction, renderedDurationMs)

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
      const existing = bank.playbackSettings[padId] ?? { startFraction: 0, endFraction: 1, semitoneOffset: 0, gain: 1, playbackMode: 'one-shot' }
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
      const existing = bank.playbackSettings[padId] ?? { startFraction: 0, endFraction: 1, semitoneOffset: 0, gain: 1, playbackMode: 'one-shot' }
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
      const existing = bank.playbackSettings[padId] ?? { startFraction: 0, endFraction: 1, semitoneOffset: 0, gain: 1, playbackMode: 'one-shot' }
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
      const existing = bank.playbackSettings[padId] ?? { startFraction: 0, endFraction: 1, semitoneOffset: 0, gain: 1, playbackMode: 'one-shot' }
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
          nextPlaybackSettings[pad.id] = { startFraction: 0, endFraction: 1, semitoneOffset: 0, gain: pad.gain, playbackMode: 'one-shot' }
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

  const auditionSelectedPad = () => {
    triggerPad(selectedPad.id)
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

  return (
    <main className="app-shell">
      <header className="work-area" aria-label="Sampler work area">
        <div className="work-area-toolbar">
          <div className="work-area-title">
            <p className="eyebrow">Browser Gen MPC</p>
            <strong>{workView === 'editor' ? 'Sample Editor' : 'Sequence Work Area'}</strong>
          </div>
          <div className="work-area-tabs" role="tablist" aria-label="Work views">
            <button type="button" className={workView === 'editor' ? 'work-tab is-current' : 'work-tab'} onClick={() => setWorkView('editor')}>
              Editor
            </button>
            <button type="button" className={workView === 'sequence' ? 'work-tab is-current' : 'work-tab'} onClick={() => setWorkView('sequence')}>
              Sequence
            </button>
          </div>
        </div>

        {workView === 'editor' ? (
          <div className="work-surface" aria-label="Sample editor workspace">
            <>
              <div className="work-surface-meta">
                <div>
                  <span className="transport-label">Source</span>
                  <strong>{editorSource === 'loop' && generatedLoop ? 'Loop Source' : selectedPad.label}</strong>
                </div>
                <div>
                  <span className="transport-label">Type</span>
                  <strong>{editorSource === 'loop' && generatedLoop ? 'Chop View' : 'Pad View'}</strong>
                </div>
                <div>
                  <span className="transport-label">Playback</span>
                  <strong>{editorSource === 'loop' && generatedLoop ? 'Loop Source' : playbackMode}</strong>
                </div>
                <div>
                  <span className="transport-label">Selection</span>
                  <strong>{editorSource === 'loop' && selectedChop ? selectedChop.id.replace('chop-', 'Chop ') : selectedPad.sampleName}</strong>
                </div>
                <div>
                  <span className="transport-label">Waveform</span>
                  <strong>
                    {activeWaveformStatus === 'loading'
                      ? 'Decoding'
                      : activeWaveformStatus === 'ready'
                        ? 'Ready'
                        : activeWaveformStatus === 'error'
                          ? 'Error'
                          : 'Idle'}
                  </strong>
                </div>
              </div>
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
              {editorSource === 'pad' ? (
                <div className="playback-mode-group" role="radiogroup" aria-label="Playback mode">
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
              ) : null}
              <div className="waveform-panel">
                <SampleWaveform
                  audioUrl={currentEditorAudioUrl}
                  regions={editorSource === 'loop' && generatedLoop ? loopChopRegions : []}
                  selectedRegionId={editorSource === 'loop' ? selectedChopId : null}
                  playheadFraction={editorPlayheadFraction}
                  markerStartFraction={editorSource === 'pad' ? selectedPadSettings.startFraction : null}
                  markerEndFraction={editorSource === 'pad' ? selectedPadSettings.endFraction : null}
                  onStatusChange={editorSource === 'loop' && generatedLoop ? setLoopDecodeStatus : setSelectedPadDecodeStatus}
                  onRegionSelect={editorSource === 'loop' && generatedLoop ? handleLoopRegionSelect : undefined}
                  onRegionsChange={editorSource === 'loop' && generatedLoop ? handleLoopRegionsChange : undefined}
                  onMarkerChange={editorSource === 'pad' ? (field, nextFraction) => updateTrim(selectedPad.id, field === 'start' ? 'startFraction' : 'endFraction', nextFraction * 100) : undefined}
                />
              </div>
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
                  </>
                ) : (
                  <>
                    <button type="button" className="primary-button" onClick={auditionSelectedPad}>
                      Audition Pad
                    </button>
                    <button type="button" className="secondary-button" disabled>
                      Trim Tools Next
                    </button>
                  </>
                )}
              </div>
            </>
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

        <section className="inspector-panel panel">
          <div className="panel-heading">
            <p className="panel-kicker">Inspector</p>
          </div>

          <div className="inspector-card">
            <div>
              <span className="transport-label">Bank</span>
              <strong>{currentBankId}</strong>
            </div>
            <div>
              <span className="transport-label">Selected</span>
              <strong>{selectedPad.label}</strong>
            </div>
            <div>
              <span className="transport-label">Source</span>
              <strong>{sourceLabels[selectedPad.sourceType]}</strong>
            </div>
            <div>
              <span className="transport-label">Length</span>
              <strong>{selectedPad.durationLabel}</strong>
            </div>
            <div>
              <span className="transport-label">File</span>
              <strong>{selectedPad.sampleFile}</strong>
            </div>
          </div>


          <div className="trim-controls">
            <div className="trim-control">
              <span>Trim</span>
              <Slider.Root
                className="trim-slider-root"
                min={0}
                max={100}
                step={1}
                minStepsBetweenThumbs={5}
                value={[trimStartPercent, trimEndPercent]}
                onValueChange={([start, end]) => {
                  updateTrim(selectedPad.id, 'startFraction', start)
                  updateTrim(selectedPad.id, 'endFraction', end)
                }}
              >
                <Slider.Track className="trim-slider-track">
                  <Slider.Range className="trim-slider-range" />
                </Slider.Track>
                <Slider.Thumb className="trim-slider-thumb" aria-label="Trim start" />
                <Slider.Thumb className="trim-slider-thumb" aria-label="Trim end" />
              </Slider.Root>
              <div className="trim-readout">
                <strong>{trimStartPercent}%</strong>
                <strong>{trimEndPercent}%</strong>
              </div>
            </div>

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
          </div>

          <div className="parameter-list">
            <article>
              <span>Trim</span>
              <strong>{trimStartPercent}% to {trimEndPercent}%</strong>
            </article>
            <article>
              <span>Pitch</span>
              <strong>{semitoneOffset > 0 ? '+' : ''}{semitoneOffset} semitones</strong>
            </article>
            <article>
              <span>Gain</span>
              <strong>{padGain.toFixed(2)}</strong>
            </article>
            <article>
              <span>FX Send</span>
              <strong>Room verb 18%</strong>
            </article>
          </div>
        </section>
      </section>
    </main>
  )
}

export default App
