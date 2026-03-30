import { promptPresets } from '../constants'
import type { GenerationStatus, GenerationMode } from '../types'

type GenerationPanelProps = {
  promptText: string
  generationStatus: GenerationStatus
  generationMode: GenerationMode
  onPromptChange: (value: string) => void
  onGenerateAudio: (mode: 'kit' | 'loop') => void
}

export function GenerationPanel({
  promptText,
  generationStatus,
  generationMode,
  onPromptChange,
  onGenerateAudio,
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
          disabled={generationStatus === 'generating' || !promptText.trim()}
        >
          {generationStatus === 'generating' && generationMode === 'kit' ? 'Generating...' : 'Generate Kit'}
        </button>
        <button
          type="button"
          className="secondary-button"
          onClick={() => onGenerateAudio('loop')}
          disabled={generationStatus === 'generating' || !promptText.trim()}
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

    </section>
  )
}
