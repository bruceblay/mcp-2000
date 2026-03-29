import { bankIds, type BankId, type EffectChainState, type EffectChainSlotId } from '../types'
import { getEffectConfig } from '../effects'
import { formatEffectParamValue } from '../format-utils'
import { Knob } from './Knob'

type EffectsWorkspaceProps = {
  bankEffects: Record<BankId, EffectChainState>
  masterEffect: EffectChainState
  effectsList: Array<{ id: string; name: string }>
  onSlotEffectSelect: (slotId: EffectChainSlotId, effectId: string) => void
  onSlotParamChange: (slotId: EffectChainSlotId, key: string, value: number) => void
  onSlotToggleEnabled: (slotId: EffectChainSlotId) => void
}

function EffectChainColumn({
  slotId,
  label,
  chainState,
  effectsList,
  onEffectSelect,
  onParamChange,
  onToggleEnabled,
}: {
  slotId: EffectChainSlotId
  label: string
  chainState: EffectChainState
  effectsList: Array<{ id: string; name: string }>
  onEffectSelect: (slotId: EffectChainSlotId, effectId: string) => void
  onParamChange: (slotId: EffectChainSlotId, key: string, value: number) => void
  onToggleEnabled: (slotId: EffectChainSlotId) => void
}) {
  const config = getEffectConfig(chainState.effectId)

  return (
    <div className="effect-chain-column">
      <span className="effect-chain-label">{label}</span>
      <div className="effect-chain-header">
        <select
          value={chainState.effectId}
          onChange={(e) => {
            onEffectSelect(slotId, e.target.value)
            e.currentTarget.blur()
          }}
        >
          {effectsList.map((fx) => (
            <option key={fx.id} value={fx.id}>{fx.name}</option>
          ))}
        </select>
        <button
          type="button"
          className={chainState.enabled ? 'work-tab is-current' : 'work-tab'}
          onClick={() => onToggleEnabled(slotId)}
        >
          {chainState.enabled ? 'On' : 'Off'}
        </button>
      </div>
      {config ? (
        <>
          <p className="effect-chain-description">{config.description}</p>
          <div className="effect-knob-cluster">
            {config.parameters.map((param) => (
              <Knob
                key={param.key}
                value={chainState.params[param.key] ?? param.default}
                min={param.min}
                max={param.max}
                step={param.step}
                label={param.label}
                formatValue={(v) => formatEffectParamValue(param, v)}
                onChange={(v) => onParamChange(slotId, param.key, v)}
              />
            ))}
          </div>
        </>
      ) : null}
    </div>
  )
}

export function EffectsWorkspace({
  bankEffects,
  masterEffect,
  effectsList,
  onSlotEffectSelect,
  onSlotParamChange,
  onSlotToggleEnabled,
}: EffectsWorkspaceProps) {
  return (
    <div className="work-surface effects-surface" aria-label="Effects workspace">
      <div className="effects-chain-grid">
        {bankIds.map((bankId) => (
          <EffectChainColumn
            key={bankId}
            slotId={bankId}
            label={`Bank ${bankId}`}
            chainState={bankEffects[bankId]}
            effectsList={effectsList}
            onEffectSelect={onSlotEffectSelect}
            onParamChange={onSlotParamChange}
            onToggleEnabled={onSlotToggleEnabled}
          />
        ))}
        <EffectChainColumn
          slotId="master"
          label="Master"
          chainState={masterEffect}
          effectsList={effectsList}
          onEffectSelect={onSlotEffectSelect}
          onParamChange={onSlotParamChange}
          onToggleEnabled={onSlotToggleEnabled}
        />
      </div>
    </div>
  )
}
