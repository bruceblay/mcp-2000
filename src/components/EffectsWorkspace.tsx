import * as Slider from '@radix-ui/react-slider'
import type { EffectConfig } from '../effects'
import { formatEffectParamValue } from '../format-utils'

type EffectsWorkspaceProps = {
  selectedEffectId: string
  effectEnabled: boolean
  effectParams: Record<string, number>
  effectsList: Array<{ id: string; name: string }>
  currentEffectConfig: EffectConfig | null
  onEffectSelect: (effectId: string) => void
  onParamChange: (key: string, value: number) => void
  onToggleEnabled: () => void
}

export function EffectsWorkspace({
  selectedEffectId,
  effectEnabled,
  effectParams,
  effectsList,
  currentEffectConfig,
  onEffectSelect,
  onParamChange,
  onToggleEnabled,
}: EffectsWorkspaceProps) {
  return (
    <div className="work-surface effects-surface" aria-label="Effects workspace">
      <div className="effects-toolbar">
        <label className="effects-select-field">
          <span className="transport-label">Effect</span>
          <select
            value={selectedEffectId}
            onChange={(event) => {
              onEffectSelect(event.target.value)
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
          onClick={onToggleEnabled}
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
                    onValueChange={([nextValue]) => onParamChange(parameter.key, nextValue)}
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
  )
}
