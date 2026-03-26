import { Download } from 'lucide-react'
import * as Slider from '@radix-ui/react-slider'
import { bankIds, type BankId, type BankState } from '../types'
import type { Pad } from '../mock-kit'

type MixerWorkspaceProps = {
  bankMixerGains: Record<BankId, number>
  bankMixerMuted: Record<BankId, boolean>
  bankMixerSoloed: Record<BankId, boolean>
  masterOutputGain: number
  currentBankId: BankId
  currentBankPads: Pad[]
  currentBankState: BankState
  isExportingSequence: boolean
  sequenceExportMessage: string
  onBankGainChange: (bankId: BankId, value: number) => void
  onToggleMute: (bankId: BankId) => void
  onToggleSolo: (bankId: BankId) => void
  onMasterGainChange: (value: number) => void
  onExportSequence: () => void
  onSwitchBank: (bankId: BankId) => void
  onPadGainChange: (padId: string, value: number) => void
  onPadPanChange: (padId: string, value: number) => void
}

export function MixerWorkspace({
  bankMixerGains,
  bankMixerMuted,
  bankMixerSoloed,
  masterOutputGain,
  currentBankId,
  currentBankPads,
  currentBankState,
  isExportingSequence,
  sequenceExportMessage,
  onBankGainChange,
  onToggleMute,
  onToggleSolo,
  onMasterGainChange,
  onExportSequence,
  onSwitchBank,
  onPadGainChange,
  onPadPanChange,
}: MixerWorkspaceProps) {
  return (
    <div className="work-surface mixer-surface" aria-label="Mixer workspace">
      <div className="mixer-section">
        <div className="mixer-section-heading">
          <strong>Bank Levels</strong>
        </div>
        <div className="mixer-bank-grid">
          {bankIds.map((bankId) => (
            <div key={bankId} className="mixer-strip">
              <span className="transport-label">Bank {bankId}</span>
              <Slider.Root
                className="trim-slider-root vertical single-thumb"
                orientation="vertical"
                min={0}
                max={1.25}
                step={0.01}
                value={[bankMixerGains[bankId] ?? 1]}
                onValueChange={([value]) => onBankGainChange(bankId, value)}
              >
                <Slider.Track className="trim-slider-track">
                  <Slider.Range className="trim-slider-range" />
                </Slider.Track>
                <Slider.Thumb className="trim-slider-thumb" aria-label={`Bank ${bankId} gain`} />
              </Slider.Root>
              <div className="mixer-strip-actions">
                <button
                  type="button"
                  className={bankMixerMuted[bankId] ? 'playback-mode-button is-current mixer-action-button' : 'playback-mode-button mixer-action-button'}
                  onClick={() => onToggleMute(bankId)}
                >
                  M
                </button>
                <button
                  type="button"
                  className={bankMixerSoloed[bankId] ? 'playback-mode-button is-current mixer-action-button' : 'playback-mode-button mixer-action-button'}
                  onClick={() => onToggleSolo(bankId)}
                >
                  S
                </button>
              </div>
            </div>
          ))}
          <div className="mixer-strip mixer-master-strip">
            <span className="transport-label">Master</span>
            <Slider.Root
              className="trim-slider-root vertical single-thumb"
              orientation="vertical"
              min={0}
              max={1.2}
              step={0.01}
              value={[masterOutputGain]}
              onValueChange={([value]) => onMasterGainChange(value)}
            >
              <Slider.Track className="trim-slider-track">
                <Slider.Range className="trim-slider-range" />
              </Slider.Track>
              <Slider.Thumb className="trim-slider-thumb" aria-label="Master volume" />
            </Slider.Root>
          </div>
          <div className="mixer-strip mixer-export-strip">
            <span className="transport-label">Sequence</span>
            <div className="mixer-export-panel">
              <button
                type="button"
                className="secondary-button mixer-export-button"
                onClick={onExportSequence}
                disabled={isExportingSequence}
              >
                <Download size={15} strokeWidth={2.1} aria-hidden="true" />
                <span>{isExportingSequence ? 'Rendering...' : 'Export WAV'}</span>
              </button>
              <p className="mixer-export-note">{sequenceExportMessage}</p>
            </div>
            <span className="mixer-export-caption">All audible banks</span>
          </div>
        </div>
      </div>
      <div className="mixer-section">
        <div className="mixer-section-heading mixer-pad-section-heading">
          <strong>Pad Levels for</strong>
          <div className="bank-buttons mixer-bank-buttons" role="tablist" aria-label="Mixer banks">
            {bankIds.map((bankId) => (
              <button
                key={`mixer-bank-${bankId}`}
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
        <div className="mixer-pad-grid">
          {currentBankPads.map((pad) => {
            const padLevel = currentBankState.playbackSettings[pad.id]?.gain ?? pad.gain
            const padPanLevel = currentBankState.playbackSettings[pad.id]?.pan ?? 0
            return (
              <div key={pad.id} className="mixer-strip pad-strip">
                <span className="transport-label">{pad.label}</span>
                <Slider.Root
                  className="trim-slider-root vertical single-thumb"
                  orientation="vertical"
                  min={0}
                  max={1.5}
                  step={0.01}
                  value={[padLevel]}
                  onValueChange={([value]) => onPadGainChange(pad.id, value)}
                >
                  <Slider.Track className="trim-slider-track">
                    <Slider.Range className="trim-slider-range" />
                  </Slider.Track>
                  <Slider.Thumb className="trim-slider-thumb" aria-label={`${pad.label} gain`} />
                </Slider.Root>
                <span className="mixer-strip-name">{pad.sampleName}</span>
                <div className="trim-control mixer-pan-control">
                  <span>Pan</span>
                  <Slider.Root
                    className="trim-slider-root mixer-pan-slider single-thumb"
                    min={-1}
                    max={1}
                    step={0.01}
                    value={[padPanLevel]}
                    onValueChange={([value]) => onPadPanChange(pad.id, value)}
                  >
                    <Slider.Track className="trim-slider-track">
                      <Slider.Range className="trim-slider-range" />
                    </Slider.Track>
                    <Slider.Thumb className="trim-slider-thumb" aria-label={`${pad.label} pan`} />
                  </Slider.Root>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
