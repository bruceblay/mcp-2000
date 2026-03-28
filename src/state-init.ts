import type { Pad } from './mock-kit'
import type { BankKitId } from './mock-kit'
import { starterBankPads } from './kit-generation'
import { padSlotIds, defaultMidiBaseNote, midiStorageKey, midiSelectedInputStorageKey } from './constants'
import { bankIds, type BankId, type BankState, type Sequence, type PadPlaybackSetting, type MidiPadNoteMappings } from './types'

export const createInitialBankMixerGains = () =>
  Object.fromEntries(bankIds.map((bankId) => [bankId, 1])) as Record<BankId, number>

export const createInitialBankToggleState = () =>
  Object.fromEntries(bankIds.map((bankId) => [bankId, false])) as Record<BankId, boolean>

export const getEffectiveBankGain = (
  bankId: BankId,
  gains: Record<BankId, number>,
  muted: Record<BankId, boolean>,
  soloed: Record<BankId, boolean>,
) => {
  const hasSolo = bankIds.some((id) => soloed[id])
  if (muted[bankId]) {
    return 0
  }
  if (hasSolo && !soloed[bankId]) {
    return 0
  }
  return gains[bankId] ?? 1
}

export const createInitialStepPattern = (pads: Pad[], stepCount = 16) =>
  Object.fromEntries(pads.map((pad) => [pad.id, Array.from({ length: stepCount }, () => false)])) as Record<string, boolean[]>

export const createInitialStepSemitoneOffsets = (pads: Pad[], stepCount = 16) =>
  Object.fromEntries(pads.map((pad) => [pad.id, Array.from({ length: stepCount }, () => 0)])) as Record<string, number[]>

export const createInitialSequenceMutedState = (pads: Pad[]) =>
  Object.fromEntries(pads.map((pad) => [pad.id, false])) as Record<string, boolean>

export const createInitialPlaybackSettings = (pads: Pad[]) =>
  Object.fromEntries(
    pads.map((pad) => [pad.id, { startFraction: 0, endFraction: 1, semitoneOffset: 0, gain: pad.gain, pan: 0, playbackMode: 'one-shot', reversed: false }]),
  ) as Record<string, PadPlaybackSetting>

export const createInitialSequence = (pads: Pad[], stepCount = 16): Sequence => ({
  sequenceLength: stepCount,
  stepPattern: createInitialStepPattern(pads, stepCount),
  stepSemitoneOffsets: createInitialStepSemitoneOffsets(pads, stepCount),
  sequenceMuted: createInitialSequenceMutedState(pads),
})

export const getActiveSequence = (bank: BankState): Sequence =>
  bank.sequences[bank.activeSequenceIndex] ?? bank.sequences[0]

export const createInitialBankState = (bankId: BankKitId): BankState => ({
  pads: starterBankPads[bankId].map((pad) => ({ ...pad })),
  selectedPadId: starterBankPads[bankId][0].id,
  playbackSettings: createInitialPlaybackSettings(starterBankPads[bankId]),
  sequences: [createInitialSequence(starterBankPads[bankId])],
  activeSequenceIndex: 0,
})

export const createInitialBanksState = () =>
  Object.fromEntries(bankIds.map((bankId) => [bankId, createInitialBankState(bankId)])) as Record<BankId, BankState>

export const createDefaultMidiPadMappings = (): MidiPadNoteMappings =>
  Object.fromEntries(padSlotIds.map((padId, index) => [padId, defaultMidiBaseNote + index])) as MidiPadNoteMappings

export const readStoredMidiPadMappings = (): MidiPadNoteMappings => {
  const fallback = createDefaultMidiPadMappings()
  if (typeof window === 'undefined') {
    return fallback
  }

  try {
    const stored = window.localStorage.getItem(midiStorageKey)
    if (!stored) {
      return fallback
    }

    const parsed = JSON.parse(stored) as Record<string, unknown>
    return padSlotIds.reduce<MidiPadNoteMappings>((result, padId) => {
      const value = parsed[padId]
      result[padId] = value === null
        ? null
        : typeof value === 'number' && Number.isFinite(value)
          ? Math.max(0, Math.min(127, Math.round(value)))
          : fallback[padId]
      return result
    }, { ...fallback })
  } catch {
    return fallback
  }
}

export const readStoredMidiInputId = () => {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    return window.localStorage.getItem(midiSelectedInputStorageKey)
  } catch {
    return null
  }
}
