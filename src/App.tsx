import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react'
import { mockKitPads, type Pad, type PadSourceType } from './mock-kit'

const pads = mockKitPads
const totalPads = pads.length

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

type EngineStatus = 'idle' | 'loading' | 'ready' | 'error'

type PadPlaybackSetting = {
  startFraction: number
  endFraction: number
}

const createInitialPlaybackSettings = () =>
  Object.fromEntries(
    pads.map((pad) => [pad.id, { startFraction: 0, endFraction: 1 }]),
  ) as Record<string, PadPlaybackSetting>

function App() {
  const [selectedPadId, setSelectedPadId] = useState(pads[0].id)
  const [activePadIds, setActivePadIds] = useState<string[]>([])
  const [engineStatus, setEngineStatus] = useState<EngineStatus>('idle')
  const [loadedPadCount, setLoadedPadCount] = useState(0)
  const [padPlaybackSettings, setPadPlaybackSettings] = useState<Record<string, PadPlaybackSetting>>(
    () => createInitialPlaybackSettings(),
  )

  const audioContextRef = useRef<AudioContext | null>(null)
  const masterGainRef = useRef<GainNode | null>(null)
  const bufferMapRef = useRef<Map<string, AudioBuffer>>(new Map())
  const loadPromiseRef = useRef<Promise<void> | null>(null)

  const selectedPad = useMemo(
    () => pads.find((pad) => pad.id === selectedPadId) ?? pads[0],
    [selectedPadId],
  )

  const selectedPadSettings = padPlaybackSettings[selectedPad.id]
  const trimStartPercent = Math.round(selectedPadSettings.startFraction * 100)
  const trimEndPercent = Math.round(selectedPadSettings.endFraction * 100)

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

    const loadTask = (async () => {
      try {
        setEngineStatus('loading')
        setLoadedPadCount(0)

        const context = getAudioContext()
        if (context.state === 'suspended') {
          await context.resume()
        }

        const decodedBuffers = await Promise.all(
          pads.map(async (pad, index) => {
            const response = await fetch(pad.sampleUrl)
            if (!response.ok) {
              throw new Error('Failed to fetch sample: ' + pad.sampleFile)
            }

            const audioData = await response.arrayBuffer()
            const buffer = await context.decodeAudioData(audioData.slice(0))
            setLoadedPadCount(index + 1)
            return [pad.id, buffer] as const
          }),
        )

        bufferMapRef.current = new Map(decodedBuffers)
        setEngineStatus('ready')
      } catch (error) {
        console.error(error)
        bufferMapRef.current.clear()
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
    const sampleBuffer = bufferMapRef.current.get(padId)
    const pad = pads.find((item) => item.id === padId)
    const playbackSettings = padPlaybackSettings[padId]

    if (!context || !masterGain || !sampleBuffer || !pad || !playbackSettings) {
      return
    }

    const startTime = sampleBuffer.duration * playbackSettings.startFraction
    const endTime = sampleBuffer.duration * playbackSettings.endFraction
    const playbackDuration = Math.max(0.01, endTime - startTime)

    const source = context.createBufferSource()
    const gainNode = context.createGain()

    source.buffer = sampleBuffer
    gainNode.gain.value = pad.gain

    source.connect(gainNode)
    gainNode.connect(masterGain)
    source.start(0, startTime, playbackDuration)
  })

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) {
        return
      }

      const key = event.key.toUpperCase()
      const matchedPad = pads.find((pad) => pad.keyTrigger === key)

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
      setSelectedPadId(matchedPad.id)
      setActivePadIds((current) => (current.includes(matchedPad.id) ? current : current.concat(matchedPad.id)))
      void playPadAudio(matchedPad.id)
    }

    const handleKeyUp = (event: KeyboardEvent) => {
      const key = event.key.toUpperCase()
      const matchedPad = pads.find((pad) => pad.keyTrigger === key)

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
  }, [playPadAudio])

  const triggerPad = (padId: string) => {
    setSelectedPadId(padId)
    setActivePadIds((current) => (current.includes(padId) ? current : current.concat(padId)))
    void playPadAudio(padId)
  }

  const releasePad = (padId: string) => {
    setActivePadIds((current) => current.filter((currentPadId) => currentPadId !== padId))
  }

  const updateTrim = (
    padId: string,
    field: 'startFraction' | 'endFraction',
    nextPercent: number,
  ) => {
    setPadPlaybackSettings((current) => {
      const existing = current[padId] ?? { startFraction: 0, endFraction: 1 }
      const nextValue = nextPercent / 100

      if (field === 'startFraction') {
        const startFraction = Math.min(nextValue, existing.endFraction - 0.01)
        return {
          ...current,
          [padId]: {
            ...existing,
            startFraction,
          },
        }
      }

      const endFraction = Math.max(nextValue, existing.startFraction + 0.01)
      return {
        ...current,
        [padId]: {
          ...existing,
          endFraction,
        },
      }
    })
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
            <span className="transport-label">Pads Loaded</span>
            <strong>{loadedPadCount} / {totalPads}</strong>
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
              defaultValue={promptPresets[0]}
            />
          </label>

          <div className="prompt-actions">
            <button type="button" className="primary-button">Generate Kit</button>
            <button type="button" className="secondary-button">Generate Loop</button>
          </div>

          <div className="preset-list" aria-label="Prompt examples">
            {promptPresets.map((preset) => (
              <button key={preset} type="button" className="preset-chip">
                {preset}
              </button>
            ))}
          </div>
        </section>

        <section className="grid-panel panel">
          <div className="panel-heading">
            <p className="panel-kicker">Pads</p>
            <h2>4x4 performance surface</h2>
          </div>

          <div className="grid-status" aria-label="Pad interaction status">
            <span>Selected: {selectedPad.label}</span>
            <span>{engineStatus === 'ready' ? 'Low-latency buffer playback active' : 'First trigger will initialize the engine'}</span>
          </div>

          <div className="pad-grid" aria-label="Sample pad grid">
            {pads.map((pad) => (
              <button
                key={pad.id}
                type="button"
                className={'pad pad-' + pad.group + (selectedPad.id === pad.id ? ' is-selected' : '') + (activePadIds.includes(pad.id) ? ' is-active' : '')}
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
            <h2>Selected pad details</h2>
          </div>

          <div className="inspector-card">
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
              <span className="transport-label">Trim</span>
              <strong>{trimStartPercent}% to {trimEndPercent}%</strong>
            </div>
            <div>
              <span className="transport-label">Gain</span>
              <strong>{selectedPad.gain.toFixed(2)}</strong>
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
          </div>

          <div className="parameter-list">
            <article>
              <span>Trim</span>
              <strong>{trimStartPercent}% to {trimEndPercent}%</strong>
            </article>
            <article>
              <span>Pitch</span>
              <strong>+0 semitones</strong>
            </article>
            <article>
              <span>Gain</span>
              <strong>{selectedPad.gain.toFixed(2)}</strong>
            </article>
            <article>
              <span>FX Send</span>
              <strong>Room verb 18%</strong>
            </article>
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
