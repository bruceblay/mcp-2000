import type { Pad } from './mock-kit'
import type {
  BankId,
  BankState,
  EffectChainState,
  PadPlaybackSetting,
  Sequence,
  ArpMode,
  ArpDivision,
} from './types'
import { bankIds } from './types'

// ---------------------------------------------------------------------------
// Snapshot format — version 1
// ---------------------------------------------------------------------------

export const SNAPSHOT_VERSION = 1

/**
 * Lightweight pad representation for snapshots.
 * Strips runtime-only fields and classifies the sample source for sharing.
 */
export type SnapshotPad = {
  id: string
  label: string
  keyTrigger: string
  group: Pad['group']
  sampleName: string
  sampleFile: string
  sampleUrl: string
  sourceType: Pad['sourceType']
  durationLabel: string
  gain: number
  /** true when sampleUrl is a blob:/data: URL that must be uploaded for sharing */
  needsUpload: boolean
}

export type SnapshotBankState = {
  pads: SnapshotPad[]
  selectedPadId: string
  playbackSettings: Record<string, PadPlaybackSetting>
  sequences: Sequence[]
  activeSequenceIndex: number
}

export type ProjectSnapshot = {
  version: typeof SNAPSHOT_VERSION
  createdAt: number

  activeBankId: BankId
  bankStates: Record<BankId, SnapshotBankState>

  // Mixer
  bankMixerGains: Record<BankId, number>
  bankMixerMuted: Record<BankId, boolean>
  bankMixerSoloed: Record<BankId, boolean>
  masterOutputGain: number

  // Effects
  bankEffects: Record<BankId, EffectChainState>
  masterEffect: EffectChainState

  // Sequencer
  sequenceTempo: number

  // Chromatic mode
  isChromaticModeActive: boolean
  chromaticOctave: number

  // Arpeggiator
  isArpEnabled: boolean
  isArpLatched: boolean
  arpDivision: ArpDivision
  arpMode: ArpMode

  // UI
  isDarkMode: boolean
}

// ---------------------------------------------------------------------------
// Fixture URL detection
// ---------------------------------------------------------------------------

const FIXTURE_PATH_PREFIXES = [
  '/mock-samples/',
  '/kraftwerk-kit/',
  '/ice-kit/',
  '/acoustic-guitar/',
  '/generated/',
]

/** Returns true if the URL points to a bundled fixture sample (public asset). */
export const isFixtureSampleUrl = (url: string): boolean =>
  FIXTURE_PATH_PREFIXES.some((prefix) => url.startsWith(prefix))

/** Returns true if the URL is an ephemeral blob/data URL that needs uploading. */
const needsUploadForSharing = (url: string): boolean =>
  url.startsWith('blob:') || url.startsWith('data:')

// ---------------------------------------------------------------------------
// Serialize
// ---------------------------------------------------------------------------

export type SerializeProjectInput = {
  activeBankId: BankId
  bankStates: Record<BankId, BankState>
  bankMixerGains: Record<BankId, number>
  bankMixerMuted: Record<BankId, boolean>
  bankMixerSoloed: Record<BankId, boolean>
  masterOutputGain: number
  bankEffects: Record<BankId, EffectChainState>
  masterEffect: EffectChainState
  sequenceTempo: number
  isChromaticModeActive: boolean
  chromaticOctave: number
  isArpEnabled: boolean
  isArpLatched: boolean
  arpDivision: ArpDivision
  arpMode: ArpMode
  isDarkMode: boolean
}

const snapshotPad = (pad: Pad): SnapshotPad => ({
  id: pad.id,
  label: pad.label,
  keyTrigger: pad.keyTrigger,
  group: pad.group,
  sampleName: pad.sampleName,
  sampleFile: pad.sampleFile,
  sampleUrl: pad.sampleUrl,
  sourceType: pad.sourceType,
  durationLabel: pad.durationLabel,
  gain: pad.gain,
  needsUpload: needsUploadForSharing(pad.sampleUrl),
})

const snapshotBank = (bank: BankState): SnapshotBankState => ({
  pads: bank.pads.map(snapshotPad),
  selectedPadId: bank.selectedPadId,
  playbackSettings: { ...bank.playbackSettings },
  sequences: bank.sequences.map((seq) => ({
    sequenceLength: seq.sequenceLength,
    stepPattern: { ...seq.stepPattern },
    stepSemitoneOffsets: { ...seq.stepSemitoneOffsets },
    sequenceMuted: { ...seq.sequenceMuted },
  })),
  activeSequenceIndex: bank.activeSequenceIndex,
})

export const serializeProject = (input: SerializeProjectInput): ProjectSnapshot => ({
  version: SNAPSHOT_VERSION,
  createdAt: Date.now(),

  activeBankId: input.activeBankId,
  bankStates: Object.fromEntries(
    bankIds.map((id) => [id, snapshotBank(input.bankStates[id])]),
  ) as Record<BankId, SnapshotBankState>,

  bankMixerGains: { ...input.bankMixerGains },
  bankMixerMuted: { ...input.bankMixerMuted },
  bankMixerSoloed: { ...input.bankMixerSoloed },
  masterOutputGain: input.masterOutputGain,

  bankEffects: Object.fromEntries(
    bankIds.map((id) => [id, { ...input.bankEffects[id] }]),
  ) as Record<BankId, EffectChainState>,
  masterEffect: { ...input.masterEffect },

  sequenceTempo: input.sequenceTempo,

  isChromaticModeActive: input.isChromaticModeActive,
  chromaticOctave: input.chromaticOctave,

  isArpEnabled: input.isArpEnabled,
  isArpLatched: input.isArpLatched,
  arpDivision: input.arpDivision,
  arpMode: input.arpMode,

  isDarkMode: input.isDarkMode,
})

// ---------------------------------------------------------------------------
// Deserialize
// ---------------------------------------------------------------------------

export type DeserializedProject = {
  activeBankId: BankId
  bankStates: Record<BankId, BankState>
  bankMixerGains: Record<BankId, number>
  bankMixerMuted: Record<BankId, boolean>
  bankMixerSoloed: Record<BankId, boolean>
  masterOutputGain: number
  bankEffects: Record<BankId, EffectChainState>
  masterEffect: EffectChainState
  sequenceTempo: number
  isChromaticModeActive: boolean
  chromaticOctave: number
  isArpEnabled: boolean
  isArpLatched: boolean
  arpDivision: ArpDivision
  arpMode: ArpMode
  isDarkMode: boolean
}

const restorePad = (snap: SnapshotPad): Pad => ({
  id: snap.id,
  label: snap.label,
  keyTrigger: snap.keyTrigger,
  group: snap.group,
  sampleName: snap.sampleName,
  sampleFile: snap.sampleFile,
  sampleUrl: snap.sampleUrl,
  sourceType: snap.sourceType,
  durationLabel: snap.durationLabel,
  gain: snap.gain,
})

const restoreBank = (snap: SnapshotBankState): BankState => ({
  pads: snap.pads.map(restorePad),
  selectedPadId: snap.selectedPadId,
  playbackSettings: snap.playbackSettings,
  sequences: snap.sequences,
  activeSequenceIndex: snap.activeSequenceIndex,
})

export const deserializeProject = (snapshot: ProjectSnapshot): DeserializedProject => ({
  activeBankId: snapshot.activeBankId,
  bankStates: Object.fromEntries(
    bankIds.map((id) => [id, restoreBank(snapshot.bankStates[id])]),
  ) as Record<BankId, BankState>,

  bankMixerGains: snapshot.bankMixerGains,
  bankMixerMuted: snapshot.bankMixerMuted,
  bankMixerSoloed: snapshot.bankMixerSoloed,
  masterOutputGain: snapshot.masterOutputGain,

  bankEffects: snapshot.bankEffects,
  masterEffect: snapshot.masterEffect,

  sequenceTempo: snapshot.sequenceTempo,

  isChromaticModeActive: snapshot.isChromaticModeActive,
  chromaticOctave: snapshot.chromaticOctave,

  isArpEnabled: snapshot.isArpEnabled,
  isArpLatched: snapshot.isArpLatched,
  arpDivision: snapshot.arpDivision,
  arpMode: snapshot.arpMode,

  isDarkMode: snapshot.isDarkMode,
})

// ---------------------------------------------------------------------------
// JSON helpers
// ---------------------------------------------------------------------------

export const snapshotToJson = (snapshot: ProjectSnapshot): string =>
  JSON.stringify(snapshot)

export const jsonToSnapshot = (json: string): ProjectSnapshot => {
  const parsed = JSON.parse(json) as ProjectSnapshot
  if (parsed.version !== SNAPSHOT_VERSION) {
    throw new Error(`Unsupported snapshot version: ${parsed.version} (expected ${SNAPSHOT_VERSION})`)
  }
  return parsed
}

// ---------------------------------------------------------------------------
// Utilities for sharing flow
// ---------------------------------------------------------------------------

/** Returns all pads across all banks that have ephemeral URLs needing upload. */
export const getPadsNeedingUpload = (snapshot: ProjectSnapshot): Array<{ bankId: BankId; pad: SnapshotPad }> =>
  bankIds.flatMap((bankId) =>
    snapshot.bankStates[bankId].pads
      .filter((pad) => pad.needsUpload)
      .map((pad) => ({ bankId, pad })),
  )

/** Rewrites pad URLs in a snapshot after upload. Returns a new snapshot. */
export const rewriteSampleUrls = (
  snapshot: ProjectSnapshot,
  urlMap: Map<string, string>,
): ProjectSnapshot => ({
  ...snapshot,
  bankStates: Object.fromEntries(
    bankIds.map((bankId) => {
      const bank = snapshot.bankStates[bankId]
      return [bankId, {
        ...bank,
        pads: bank.pads.map((pad) => {
          const newUrl = urlMap.get(pad.sampleUrl)
          if (!newUrl) return pad
          return { ...pad, sampleUrl: newUrl, needsUpload: false }
        }),
      }]
    }),
  ) as Record<BankId, SnapshotBankState>,
})
