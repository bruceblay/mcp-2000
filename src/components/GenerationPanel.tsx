import { Circle, Square } from 'lucide-react'
import { SampleWaveform } from './sample-waveform'
import { promptPresets } from '../constants'
import type { MicCaptureState, RecordedTake, GenerationStatus, GenerationMode } from '../types'
import type { Pad } from '../mock-kit'

type GenerationPanelProps = {
  promptText: string
  generationStatus: GenerationStatus
  generationMode: GenerationMode
  generationMessage: string
  micCaptureState: MicCaptureState
  micCaptureMessage: string
  micCaptureClockLabel: string
  micRecordingSupported: boolean
  recordedTake: RecordedTake | null
  selectedPad: Pad
  onPromptChange: (value: string) => void
  onGenerateAudio: (mode: 'kit' | 'loop') => void
  onStartRecording: () => void
  onStopRecording: () => void
  onAssignToPad: () => void
  onOpenInEditor: () => void
  onClearTake: () => void
}

export function GenerationPanel({
  promptText,
  generationStatus,
  generationMode,
  generationMessage,
  micCaptureState,
  micCaptureMessage,
  micCaptureClockLabel,
  micRecordingSupported,
  recordedTake,
  selectedPad,
  onPromptChange,
  onGenerateAudio,
  onStartRecording,
  onStopRecording,
  onAssignToPad,
  onOpenInEditor,
  onClearTake,
}: GenerationPanelProps) {
  return (
    <section className="prompt-panel panel">
      <div className="panel-heading">
        <p className="panel-kicker">Generate</p>
      </div>

      <label className="prompt-field">
        <span>Describe a drum kit or loop</span>
        <textarea
          placeholder="Try: gritty Memphis kit with blown-out snares and a short sub kick"
          rows={5}
          value={promptText}
          onChange={(event) => onPromptChange(event.target.value)}
        />
      </label>

      <div className="prompt-actions">
        <button
          type="button"
          className="primary-button"
          onClick={() => onGenerateAudio('kit')}
          disabled={generationStatus === 'generating'}
        >
          {generationStatus === 'generating' && generationMode === 'kit' ? 'Generating...' : 'Generate Kit'}
        </button>
        <button
          type="button"
          className="secondary-button"
          onClick={() => onGenerateAudio('loop')}
          disabled={generationStatus === 'generating'}
        >
          {generationStatus === 'generating' && generationMode === 'loop' ? 'Generating...' : 'Generate Loop'}
        </button>
      </div>

      <div className="preset-list" aria-label="Prompt examples">
        {promptPresets.map((preset) => (
          <button key={preset} type="button" className="preset-chip" onClick={() => onPromptChange(preset)}>
            {preset}
          </button>
        ))}
      </div>

      <div className="generation-status" aria-live="polite">
        <span>{generationMessage}</span>
      </div>

      <section className="mic-capture-panel" aria-label="Sample from microphone">
        <div className="mic-capture-heading">
          <div className="mic-capture-title">
            <p className="transport-label">Sample from mic</p>
            <strong>Capture a raw take for the sampler</strong>
          </div>
          <span className={micCaptureState === 'recording' ? 'mic-capture-timer is-live' : 'mic-capture-timer'}>
            {micCaptureClockLabel}
          </span>
        </div>

        <p className="mic-capture-status" aria-live="polite">
          {micRecordingSupported ? micCaptureMessage : 'This browser does not expose microphone recording through MediaRecorder yet.'}
        </p>

        <div className="mic-capture-controls">
          <button
            type="button"
            className="primary-button mic-capture-control"
            onClick={onStartRecording}
            disabled={!micRecordingSupported || micCaptureState === 'requesting' || micCaptureState === 'recording' || micCaptureState === 'processing'}
          >
            <Circle size={15} strokeWidth={2.1} aria-hidden="true" />
            <span>
              {micCaptureState === 'requesting'
                ? 'Allow Mic...'
                : micCaptureState === 'recording'
                  ? 'Recording...'
                  : 'Record Take'}
            </span>
          </button>
          <button
            type="button"
            className="secondary-button mic-capture-control"
            onClick={onStopRecording}
            disabled={micCaptureState !== 'recording'}
          >
            <Square size={15} strokeWidth={2.1} aria-hidden="true" />
            <span>{micCaptureState === 'processing' ? 'Finishing...' : 'Stop'}</span>
          </button>
        </div>

        {recordedTake ? (
          <>
            <div className="mic-capture-waveform">
              <SampleWaveform
                audioUrl={recordedTake.previewUrl}
                durationSeconds={recordedTake.durationSeconds}
              />
            </div>
            <audio className="mic-capture-player" controls src={recordedTake.previewUrl} />
            <div className="mic-capture-actions">
              <button type="button" className="primary-button" onClick={onAssignToPad}>
                Assign to {selectedPad.label}
              </button>
              <button type="button" className="secondary-button" onClick={onOpenInEditor}>
                Chop in Editor
              </button>
              <button type="button" className="secondary-button" onClick={onClearTake}>
                Discard
              </button>
            </div>
          </>
        ) : null}
      </section>
    </section>
  )
}
