import { starterBankPads } from './kit-generation'
import type { ChromaticKeyDefinition } from './types'

export const loopChopCount = 16
export const midiStorageKey = 'mcp-2000-midi-pad-notes'
export const midiSelectedInputStorageKey = 'mcp-2000-midi-input-id'
export const defaultMidiBaseNote = 36

export const promptPresets = [
  'Percussion kit made from cracking ice, dripping water, and frozen lake resonance',
  'Zen flute melody with windchimes and flowing water — 85 BPM loop',
  'Deep forest floor kit with fallen branches, wet moss thuds, and bird call stabs',
  'Utopian, otherworldly bird songs - 78bpm loop',
]

export const groupLabels: Record<string, string> = {
  drums: 'Drums',
  textures: 'Textures',
  melodic: 'Melodic',
  fx: 'FX',
  chop: 'Chop',
}

export const padSlotIds = starterBankPads.A.map((pad) => pad.id)

export const chromaticBaseOctave = 3
export const chromaticMinOctave = 1
export const chromaticMaxOctave = 6
export const chromaticNoteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const

export const chromaticKeyLayout: ChromaticKeyDefinition[] = [
  { id: 'c', keyboardKey: 'A', semitoneOffset: 0, kind: 'white' },
  { id: 'c-sharp', keyboardKey: 'W', semitoneOffset: 1, kind: 'black', blackCenterPercent: 12.5 },
  { id: 'd', keyboardKey: 'S', semitoneOffset: 2, kind: 'white' },
  { id: 'd-sharp', keyboardKey: 'E', semitoneOffset: 3, kind: 'black', blackCenterPercent: 25 },
  { id: 'e', keyboardKey: 'D', semitoneOffset: 4, kind: 'white' },
  { id: 'f', keyboardKey: 'F', semitoneOffset: 5, kind: 'white' },
  { id: 'f-sharp', keyboardKey: 'T', semitoneOffset: 6, kind: 'black', blackCenterPercent: 50 },
  { id: 'g', keyboardKey: 'G', semitoneOffset: 7, kind: 'white' },
  { id: 'g-sharp', keyboardKey: 'Y', semitoneOffset: 8, kind: 'black', blackCenterPercent: 62.5 },
  { id: 'a', keyboardKey: 'H', semitoneOffset: 9, kind: 'white' },
  { id: 'a-sharp', keyboardKey: 'U', semitoneOffset: 10, kind: 'black', blackCenterPercent: 75 },
  { id: 'b', keyboardKey: 'J', semitoneOffset: 11, kind: 'white' },
  { id: 'high-c', keyboardKey: 'K', semitoneOffset: 12, kind: 'white' },
]

export const chromaticKeyboardMap = new Map(chromaticKeyLayout.map((key) => [key.keyboardKey, key]))

export const sequenceLengthOptions = [8, 16, 24, 32] as const
export const sequenceLookaheadMs = 25
export const sequenceScheduleAheadSeconds = 0.12

export const supportedGlobalEffectIds = new Set(['simplefilter', 'delay', 'distortion', 'bitcrusher', 'reverb', 'compressor', 'autofilter', 'autopanner', 'chorus', 'combfilter', 'djeq', 'flanger', 'hallreverb', 'loopchop', 'phaser', 'pitchshifter', 'ringmodulator', 'sidechainpump', 'tapestop', 'taptempodelay', 'tremolo', 'vibrato', 'lofitape'])

export const lfoWaveforms: OscillatorType[] = ['sine', 'square', 'sawtooth', 'triangle']

export const arpDivisionOptions: { value: import('./types').ArpDivision; label: string; beatFraction: number }[] = [
  { value: '1/4', label: '1/4', beatFraction: 1 },
  { value: '1/8', label: '1/8', beatFraction: 0.5 },
  { value: '1/16', label: '1/16', beatFraction: 0.25 },
  { value: '1/32', label: '1/32', beatFraction: 0.125 },
  { value: '1/4T', label: '1/4T', beatFraction: 1 / 3 },
  { value: '1/8T', label: '1/8T', beatFraction: 1 / 6 },
]

export const arpModeOptions: { value: import('./types').ArpMode; label: string }[] = [
  { value: 'up', label: 'Up' },
  { value: 'down', label: 'Down' },
  { value: 'up-down', label: 'Up-Down' },
  { value: 'random', label: 'Random' },
  { value: 'order', label: 'Order' },
]

export const preferredRecordingMimeTypes = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus',
] as const
