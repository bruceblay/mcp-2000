import { useEffect, useState } from 'react'

type Pad = {
  id: string
  label: string
  keyTrigger: string
  group: 'drums' | 'textures' | 'melodic' | 'fx'
  sampleName: string
  sourceType: 'generated' | 'uploaded' | 'resampled'
  durationLabel: string
}

const pads: Pad[] = [
  { id: 'pad-1', label: 'Kick 01', keyTrigger: '1', group: 'drums', sampleName: 'Dust Kick', sourceType: 'generated', durationLabel: '0.82 sec' },
  { id: 'pad-2', label: 'Snare 02', keyTrigger: '2', group: 'drums', sampleName: 'Tape Snare', sourceType: 'generated', durationLabel: '0.61 sec' },
  { id: 'pad-3', label: 'Hat 03', keyTrigger: '3', group: 'drums', sampleName: 'Soft Hat', sourceType: 'generated', durationLabel: '0.18 sec' },
  { id: 'pad-4', label: 'Perc 04', keyTrigger: '4', group: 'drums', sampleName: 'Clack Rim', sourceType: 'uploaded', durationLabel: '0.27 sec' },
  { id: 'pad-5', label: 'Chord 05', keyTrigger: 'Q', group: 'textures', sampleName: 'Soul Wash', sourceType: 'generated', durationLabel: '2.40 sec' },
  { id: 'pad-6', label: 'Vox 06', keyTrigger: 'W', group: 'textures', sampleName: 'Air Phrase', sourceType: 'generated', durationLabel: '1.73 sec' },
  { id: 'pad-7', label: 'Dust 07', keyTrigger: 'E', group: 'textures', sampleName: 'Room Hiss', sourceType: 'uploaded', durationLabel: '4.00 sec' },
  { id: 'pad-8', label: 'Rise 08', keyTrigger: 'R', group: 'fx', sampleName: 'Filtered Rise', sourceType: 'generated', durationLabel: '1.95 sec' },
  { id: 'pad-9', label: 'Bass 09', keyTrigger: 'A', group: 'melodic', sampleName: 'Mono Bass', sourceType: 'generated', durationLabel: '0.93 sec' },
  { id: 'pad-10', label: 'Stab 10', keyTrigger: 'S', group: 'melodic', sampleName: 'Neo Chord', sourceType: 'generated', durationLabel: '1.12 sec' },
  { id: 'pad-11', label: 'Lead 11', keyTrigger: 'D', group: 'melodic', sampleName: 'Glass Lead', sourceType: 'resampled', durationLabel: '0.74 sec' },
  { id: 'pad-12', label: 'Loop 12', keyTrigger: 'F', group: 'melodic', sampleName: '88 BPM Loop', sourceType: 'generated', durationLabel: '4.00 sec' },
  { id: 'pad-13', label: 'Crash 13', keyTrigger: 'Z', group: 'fx', sampleName: 'Tape Crash', sourceType: 'uploaded', durationLabel: '1.38 sec' },
  { id: 'pad-14', label: 'FX 14', keyTrigger: 'X', group: 'fx', sampleName: 'Reverse Hit', sourceType: 'generated', durationLabel: '0.89 sec' },
  { id: 'pad-15', label: 'Fill 15', keyTrigger: 'C', group: 'fx', sampleName: 'Vinyl Fill', sourceType: 'resampled', durationLabel: '1.20 sec' },
  { id: 'pad-16', label: 'Scene 16', keyTrigger: 'V', group: 'fx', sampleName: 'Transition Bed', sourceType: 'generated', durationLabel: '3.80 sec' },
]

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

const sourceLabels: Record<Pad['sourceType'], string> = {
  generated: 'Generated',
  uploaded: 'Uploaded',
  resampled: 'Resampled',
}

function App() {
  const [selectedPadId, setSelectedPadId] = useState(pads[0].id)
  const [activePadIds, setActivePadIds] = useState<string[]>([])

  const selectedPad = pads.find((pad) => pad.id === selectedPadId) ?? pads[0]

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
        target instanceof HTMLInputElement ||
        target instanceof HTMLSelectElement
      ) {
        return
      }

      event.preventDefault()
      setSelectedPadId(matchedPad.id)
      setActivePadIds((current) => (current.includes(matchedPad.id) ? current : [...current, matchedPad.id]))
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
  }, [])

  const triggerPad = (padId: string) => {
    setSelectedPadId(padId)
    setActivePadIds((current) => (current.includes(padId) ? current : [...current, padId]))
  }

  const releasePad = (padId: string) => {
    setActivePadIds((current) => current.filter((currentPadId) => currentPadId !== padId))
  }

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
            <span className="transport-label">Pads Ready</span>
            <strong>16 / 16</strong>
          </div>
          <div>
            <span className="transport-label">Engine</span>
            <strong>UI Shell</strong>
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
            <span>Trigger keys: 1 2 3 4 / Q W E R / A S D F / Z X C V</span>
          </div>

          <div className="pad-grid" aria-label="Sample pad grid">
            {pads.map((pad) => (
              <button
                key={pad.id}
                type="button"
                className={`pad pad-${pad.group}${selectedPad.id === pad.id ? ' is-selected' : ''}${activePadIds.includes(pad.id) ? ' is-active' : ''}`}
                aria-pressed={selectedPad.id === pad.id}
                onClick={() => triggerPad(pad.id)}
                onMouseDown={() => triggerPad(pad.id)}
                onMouseUp={() => releasePad(pad.id)}
                onMouseLeave={() => releasePad(pad.id)}
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
          </div>

          <div className="parameter-list">
            <article>
              <span>Trim</span>
              <strong>Start 0% · End 100%</strong>
            </article>
            <article>
              <span>Pitch</span>
              <strong>+0 semitones</strong>
            </article>
            <article>
              <span>Envelope</span>
              <strong>Short attack · Tight release</strong>
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
