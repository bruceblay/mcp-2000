import { Fragment } from 'react'
import { Dices } from 'lucide-react'
import { bankIds, type BankId, type GenerationStatus, type SequenceGenerationAction } from '../types'
import type { Pad } from '../mock-kit'
import { sequenceLengthOptions } from '../constants'
import { formatSemitoneOffsetLabel } from '../format-utils'

type SequenceWorkspaceProps = {
  sequencePromptText: string
  sequenceGenerationStatus: GenerationStatus
  sequenceGenerationAction: SequenceGenerationAction | null
  currentBankId: BankId
  currentBankPads: Pad[]
  currentSequenceLength: number
  currentStepPattern: Record<string, boolean[]>
  currentStepSemitoneOffsets: Record<string, number[]>
  currentSequenceMuted: Record<string, boolean>
  sequencePlayheadStep: number | null
  selectedPad: Pad
  sequenceCount: number
  activeSequenceIndex: number
  onPromptChange: (value: string) => void
  onGenerateSequence: () => void
  onRandomizeSequence: () => void
  onClearSequence: () => void
  onUpdateSequenceLength: (length: number) => void
  onSwitchBank: (bankId: BankId) => void
  onSelectPad: (padId: string) => void
  onTriggerPad: (padId: string) => void
  onReleasePad: (padId: string) => void
  onToggleStep: (padId: string, stepIndex: number) => void
  onTogglePadMute: (padId: string) => void
  onSwitchSequence: (index: number) => void
  onAddSequence: () => void
}

export function SequenceWorkspace({
  sequencePromptText,
  sequenceGenerationStatus,
  sequenceGenerationAction,
  currentBankId,
  currentBankPads,
  currentSequenceLength,
  currentStepPattern,
  currentStepSemitoneOffsets,
  currentSequenceMuted,
  sequencePlayheadStep,
  selectedPad,
  sequenceCount,
  activeSequenceIndex,
  onPromptChange,
  onGenerateSequence,
  onRandomizeSequence,
  onClearSequence,
  onUpdateSequenceLength,
  onSwitchBank,
  onSelectPad,
  onTriggerPad,
  onReleasePad,
  onToggleStep,
  onTogglePadMute,
  onSwitchSequence,
  onAddSequence,
}: SequenceWorkspaceProps) {
  return (
    <div className="work-surface sequencer-surface" aria-label="Sequence workspace">
      <div className="sequencer-toolbar">
        <div className="sequencer-generate-bar">
          <div className="sequencer-prompt-inline">
            <input
              type="text"
              value={sequencePromptText}
              onChange={(event) => onPromptChange(event.target.value)}
              placeholder="Describe the groove you want for this bank"
              aria-label="Generate sequence prompt"
            />
          </div>
          <button
            type="button"
            className="work-tab sequencer-generate-button"
            onClick={onGenerateSequence}
            disabled={sequenceGenerationStatus === 'generating'}
          >
            {sequenceGenerationStatus === 'generating' && sequenceGenerationAction === 'generate' ? 'Generating...' : 'Generate Sequence'}
          </button>
          <button
            type="button"
            className="work-tab sequencer-randomize-button"
            onClick={onRandomizeSequence}
            disabled={sequenceGenerationStatus === 'generating'}
          >
            {sequenceGenerationStatus === 'generating' && sequenceGenerationAction === 'randomize' ? (
              <span>Randomizing...</span>
            ) : (
              <>
                <Dices size={14} strokeWidth={2.2} aria-hidden="true" />
                <span>Randomize</span>
              </>
            )}
          </button>
          <button
            type="button"
            className="work-tab sequencer-clear-button"
            onClick={onClearSequence}
            disabled={sequenceGenerationStatus === 'generating'}
          >
            Clear
          </button>
        </div>
        <div className="sequencer-transport">
          <label className="sequencer-field">
            <span className="transport-label">Length</span>
            <select value={currentSequenceLength} onChange={(event) => onUpdateSequenceLength(Number(event.target.value))}>
              {sequenceLengthOptions.map((length) => (
                <option key={length} value={length}>
                  {length} steps
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="bank-switcher sequencer-bank-switcher" aria-label="Sequence banks">
        <div className="bank-buttons" role="tablist" aria-label="Sequence banks">
          {bankIds.map((bankId) => (
            <button
              key={`sequencer-bank-${bankId}`}
              type="button"
              role="tab"
              aria-selected={currentBankId === bankId}
              className={currentBankId === bankId ? 'bank-button is-current' : 'bank-button'}
              onClick={() => onSwitchBank(bankId)}
            >
              Bank {bankId}
            </button>
          ))}
        </div>
      </div>

      <div className="sequence-selector" aria-label="Sequence selector">
        <span className="transport-label">Sequence</span>
        <div className="sequence-selector-buttons">
          {Array.from({ length: sequenceCount }, (_, index) => (
            <button
              key={`seq-${index}`}
              type="button"
              className={activeSequenceIndex === index ? 'sequence-index-button is-active' : 'sequence-index-button'}
              onClick={() => onSwitchSequence(index)}
            >
              {index + 1}
            </button>
          ))}
          {sequenceCount < 8 && (
            <button
              type="button"
              className="sequence-add-button"
              onClick={onAddSequence}
              title="Add a new blank sequence"
            >
              +
            </button>
          )}
        </div>
      </div>

      <div className="sequencer-grid-shell">
        <div className="sequencer-grid-scroll">
          <div
            className="sequencer-grid"
            style={{ gridTemplateColumns: `12.75rem repeat(${currentSequenceLength}, minmax(2.35rem, 2.35rem))` }}
          >
            <div className="sequencer-corner">Pads</div>
            {Array.from({ length: currentSequenceLength }, (_, stepIndex) => (
              <div
                key={`step-label-${stepIndex}`}
                className={sequencePlayheadStep === stepIndex ? 'sequencer-step-label is-current' : stepIndex % 4 === 0 ? 'sequencer-step-label is-accent' : 'sequencer-step-label'}
              >
                {stepIndex + 1}
              </div>
            ))}

            {currentBankPads.map((pad) => {
              const isSelectedPad = selectedPad.id === pad.id
              const isSequencePadMuted = currentSequenceMuted[pad.id] ?? false

              return (
                <Fragment key={pad.id}>
                  <div className={isSelectedPad ? 'sequencer-lane-header is-selected' : 'sequencer-lane-header'}>
                    <button
                      type="button"
                      className="sequencer-lane-label"
                      aria-pressed={isSelectedPad}
                      onClick={() => onSelectPad(pad.id)}
                      onPointerDown={() => onTriggerPad(pad.id)}
                      onPointerUp={() => onReleasePad(pad.id)}
                      onPointerLeave={() => onReleasePad(pad.id)}
                      onBlur={() => onReleasePad(pad.id)}
                      onKeyDown={(event) => {
                        if (event.repeat || (event.key !== 'Enter' && event.key !== ' ')) {
                          return
                        }

                        event.preventDefault()
                        onTriggerPad(pad.id)
                      }}
                      onKeyUp={(event) => {
                        if (event.key !== 'Enter' && event.key !== ' ') {
                          return
                        }

                        event.preventDefault()
                        onReleasePad(pad.id)
                      }}
                    >
                      <strong>{pad.label}</strong>
                      <span>{pad.sampleName}</span>
                    </button>
                    <button
                      type="button"
                      className={isSequencePadMuted ? 'sequencer-pad-mute-button is-muted' : 'sequencer-pad-mute-button'}
                      aria-pressed={isSequencePadMuted}
                      aria-label={`${isSequencePadMuted ? 'Unmute' : 'Mute'} ${pad.label} in sequence`}
                      title={`${isSequencePadMuted ? 'Unmute' : 'Mute'} ${pad.label} in sequence`}
                      onClick={() => onTogglePadMute(pad.id)}
                    >
                      M
                    </button>
                  </div>
                  {Array.from({ length: currentSequenceLength }, (_, stepIndex) => {
                    const isActive = currentStepPattern[pad.id]?.[stepIndex] ?? false
                    const stepSemitoneOffset = currentStepSemitoneOffsets[pad.id]?.[stepIndex] ?? 0
                    const isCurrentStep = sequencePlayheadStep === stepIndex
                    const isQuarter = stepIndex % 4 === 0
                    const className = isActive
                      ? isCurrentStep
                        ? 'sequencer-step-button is-active is-current'
                        : isQuarter
                          ? 'sequencer-step-button is-active is-accent'
                          : 'sequencer-step-button is-active'
                      : isCurrentStep
                        ? 'sequencer-step-button is-current'
                        : isQuarter
                          ? 'sequencer-step-button is-accent'
                          : 'sequencer-step-button'

                    return (
                      <button
                        key={`${pad.id}-${stepIndex}`}
                        type="button"
                        aria-pressed={isActive}
                        className={className}
                        title={isActive
                          ? `${pad.label} step ${stepIndex + 1}${stepSemitoneOffset === 0 ? ' (root)' : ` (${formatSemitoneOffsetLabel(stepSemitoneOffset)})`}`
                          : `Toggle step ${stepIndex + 1} for ${pad.label}`}
                        onClick={() => onToggleStep(pad.id, stepIndex)}
                      >
                        {isActive && stepSemitoneOffset !== 0 ? (
                          <span className="sequencer-step-note">{stepSemitoneOffset > 0 ? `+${stepSemitoneOffset}` : String(stepSemitoneOffset)}</span>
                        ) : null}
                      </button>
                    )
                  })}
                </Fragment>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
