import { startTransition, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react'
import { type BankKitId, type Pad, type PadSourceType } from './mock-kit'
import { starterBankPads } from './kit-generation'

const bankIds = ['A', 'B', 'C', 'D'] as const

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

type PadPlaybackSetting = {
  startFraction: number
  endFraction: number
  semitoneOffset: number
  gain: number
}

type BankState = {
  pads: Pad[]
  selectedPadId: string
  playbackSettings: Record<string, PadPlaybackSetting>
}

const createInitialPlaybackSettings = (pads: Pad[]) =>
  Object.fromEntries(
    pads.map((pad) => [pad.id, { startFraction: 0, endFraction: 1, semitoneOffset: 0, gain: pad.gain }]),
  ) as Record<string, PadPlaybackSetting>

const createInitialBankState = (bankId: BankKitId): BankState => ({
  pads: starterBankPads[bankId].map((pad) => ({ ...pad })),
  selectedPadId: starterBankPads[bankId][0].id,
  playbackSettings: createInitialPlaybackSettings(starterBankPads[bankId]),
})

const createInitialBanksState = () =>
  Object.fromEntries(bankIds.map((bankId) => [bankId, createInitialBankState(bankId)])) as Record<BankId, BankState>

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

  const audioContextRef = useRef<AudioContext | null>(null)
  const masterGainRef = useRef<GainNode | null>(null)
  const bufferMapRef = useRef<Map<string, AudioBuffer>>(new Map())
  const loadPromiseRef = useRef<Promise<void> | null>(null)

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

  useEffect(() => {
    return () => {
      if (audioContextRef.current) {
        void audioContextRef.current.close()
      }
    }
  }, [])

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

    const source = context.createBufferSource()
    const gainNode = context.createGain()

    source.buffer = sampleBuffer
    source.playbackRate.value = Math.pow(2, playbackSettings.semitoneOffset / 12)
    gainNode.gain.value = playbackSettings.gain

    source.connect(gainNode)
    gainNode.connect(masterGain)
    source.start(0, startTime, playbackDuration)
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

      setActivePadIds((current) => current.filter((padId) => padId !== matchedPad.id))
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
    setActivePadIds((current) => current.filter((currentPadId) => currentPadId !== padId))
  }

  const switchBank = (bankId: BankId) => {
    if (bankId === currentBankId) {
      return
    }

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
      const existing = bank.playbackSettings[padId] ?? { startFraction: 0, endFraction: 1, semitoneOffset: 0, gain: 1 }
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
      const existing = bank.playbackSettings[padId] ?? { startFraction: 0, endFraction: 1, semitoneOffset: 0, gain: 1 }
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
      const existing = bank.playbackSettings[padId] ?? { startFraction: 0, endFraction: 1, semitoneOffset: 0, gain: 1 }
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

  const generateAudio = async (mode: GenerationMode) => {
    const nextPrompt = promptText.trim()

    if (!nextPrompt) {
      setGenerationStatus('error')
      setGenerationMessage('Enter a prompt before generating a kit.')
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
            : 'Loop generation is the next mode to implement.'
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
      }

      if (!response.ok || !payload.generatedPads?.length) {
        throw new Error(payload.error || 'Generation failed.')
      }

      setBankStates((current) => {
        const currentBank = current[currentBankId]
        const generatedPadMap = new Map(payload.generatedPads?.map((pad) => [pad.id, pad]))
        const nextPads = currentBank.pads.map((pad) => generatedPadMap.get(pad.id) ?? pad)
        const nextPlaybackSettings = { ...currentBank.playbackSettings }

        for (const pad of payload.generatedPads ?? []) {
          nextPlaybackSettings[pad.id] = { startFraction: 0, endFraction: 1, semitoneOffset: 0, gain: pad.gain }
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
            : 'Loaded freshly generated core samples into Bank ' + currentBankId + '.')
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

  return (
    <main className="app-shell">
      <header className="top-bar" aria-label="Project status">
        <div className="top-bar-title">
          <p className="eyebrow">Browser Gen MPC</p>
          <strong>Pad Sketch Prototype</strong>
        </div>
        <div className="transport-strip" aria-label="Transport overview">
          <div>
            <span className="transport-label">Session</span>
            <strong>Late Night Sketch</strong>
          </div>
          <div>
            <span className="transport-label">Tempo</span>
            <strong>92 BPM</strong>
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
      </header>

      <section className="workspace">
        <section className="prompt-panel panel">
          <div className="panel-heading">
            <p className="panel-kicker">Generate</p>
            <h2>Prompt your source material</h2>
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
            <button
              type="button"
              className="secondary-button"
              onClick={() => void generateAudio('loop')}
              disabled={generationStatus === 'generating'}
            >
              Generate Loop
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
            <h2>4x4 performance surface</h2>
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
            <label className="trim-control">
              <span>Start</span>
              <input
                type="range"
                min="0"
                max="95"
                value={trimStartPercent}
                onChange={(event) => updateTrim(selectedPad.id, 'startFraction', Number(event.target.value))}
              />
              <strong>{trimStartPercent}%</strong>
            </label>
            <label className="trim-control">
              <span>End</span>
              <input
                type="range"
                min="5"
                max="100"
                value={trimEndPercent}
                onChange={(event) => updateTrim(selectedPad.id, 'endFraction', Number(event.target.value))}
              />
              <strong>{trimEndPercent}%</strong>
            </label>
            <label className="trim-control">
              <span>Pitch</span>
              <input
                type="range"
                min="-12"
                max="12"
                step="1"
                value={semitoneOffset}
                onChange={(event) => updateSemitoneOffset(selectedPad.id, Number(event.target.value))}
              />
              <strong>{semitoneOffset > 0 ? '+' : ''}{semitoneOffset} st</strong>
            </label>
            <label className="trim-control">
              <span>Gain</span>
              <input
                type="range"
                min="0"
                max="1.5"
                step="0.01"
                value={padGain}
                onChange={(event) => updatePadGain(selectedPad.id, Number(event.target.value))}
              />
              <strong>{padGain.toFixed(2)}</strong>
            </label>
          </div>


          <div className="sequencer-preview">
            <div className="panel-heading compact">
              <p className="panel-kicker">Next</p>
              <h2>Sequencer landing zone</h2>
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
        </section>
      </section>
    </main>
  )
}

export default App
