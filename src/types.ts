import type { PadSourceType } from './mock-kit'
import type { WaveformRegion } from './components/sample-waveform'

export const bankIds = ['A', 'B', 'C', 'D'] as const
export type BankId = (typeof bankIds)[number]

export type EngineStatus = 'idle' | 'loading' | 'ready' | 'error'
export type GenerationStatus = 'idle' | 'generating' | 'error'
export type GenerationMode = 'kit' | 'pad' | 'loop'
export type SequenceGenerationAction = 'generate' | 'randomize'
export type MicCaptureState = 'idle' | 'requesting' | 'recording' | 'processing' | 'ready' | 'error'
export type WorkView = 'editor' | 'sequence' | 'mixer' | 'effects'
export type EditorSource = 'pad' | 'loop'
export type PlaybackMode = 'one-shot' | 'loop' | 'gate' | 'gate-loop'

export type RecordedTake = {
  blob: Blob
  previewUrl: string
  sampleName: string
  sampleFile: string
  durationSeconds: number
  createdAt: number
}

export type GeneratedLoop = {
  sampleName: string
  sampleFile: string
  sampleUrl: string
  durationLabel: string
  durationSeconds?: number
  bpm: number
  sourceType: PadSourceType
}

export type EditorTransformResponse = {
  summary?: string
  transformedSample: {
    sampleName: string
    sampleFile: string
    sampleUrl: string
    sourceType: PadSourceType
  }
}

export type ChopRegion = WaveformRegion

export type BitcrusherProcessorNode = ScriptProcessorNode & {
  _updateSettings?: (bits: number, normalRange: number) => void
}

export type ActiveEffectRuntime = {
  effectId: string
  refs: Record<string, unknown>
}

export type ActivePadAudio = {
  source: AudioBufferSourceNode
  gainNode: GainNode
  pannerNode: StereoPannerNode | null
}

export type ActiveChromaticNoteAudio = ActivePadAudio & {
  padId: string
  playbackMode: PlaybackMode
}

export type ActiveLoopPlayback = {
  id: number
  source: AudioBufferSourceNode
  gainNode: GainNode
  timelineDurationSeconds: number
  playbackStartSeconds: number
  playbackSpanSeconds: number
  startedAtContextTime: number
  loop: boolean
}

export type MidiPadNoteMappings = Record<string, number | null>

export type NavigatorWithMidi = Navigator & {
  requestMIDIAccess?: (options?: { sysex?: boolean }) => Promise<MIDIAccess>
}

export type WebAudioContext = AudioContext | OfflineAudioContext

export type GlobalEffectRoutingOptions = {
  context: WebAudioContext
  effectInput: GainNode
  masterGain: GainNode
  effectId: string
  effectEnabled: boolean
  isEffectSupported: boolean
  effectParams: Record<string, number>
}

export type GlobalEffectRoutingResult = {
  cleanup: () => void
  runtime: ActiveEffectRuntime | null
}

export type PadPlaybackSetting = {
  startFraction: number
  endFraction: number
  semitoneOffset: number
  gain: number
  pan: number
  playbackMode: PlaybackMode
  reversed: boolean
}

export type BankState = {
  pads: import('./mock-kit').Pad[]
  selectedPadId: string
  playbackSettings: Record<string, PadPlaybackSetting>
  sequenceLength: number
  stepPattern: Record<string, boolean[]>
  stepSemitoneOffsets: Record<string, number[]>
  sequenceMuted: Record<string, boolean>
}

export type ChromaticKeyDefinition = {
  id: string
  keyboardKey: string
  semitoneOffset: number
  kind: 'white' | 'black'
  blackCenterPercent?: number
}
