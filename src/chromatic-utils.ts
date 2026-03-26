import { chromaticBaseOctave, chromaticNoteNames } from './constants'
import type { BankId } from './types'

export const getChromaticRelativeSemitone = (octave: number, semitoneOffset: number) =>
  ((octave - chromaticBaseOctave) * 12) + semitoneOffset

export const getChromaticNoteLabel = (octave: number, semitoneOffset: number) => {
  const absoluteSemitone = octave * 12 + semitoneOffset
  const noteIndex = ((absoluteSemitone % chromaticNoteNames.length) + chromaticNoteNames.length) % chromaticNoteNames.length
  const noteOctave = Math.floor(absoluteSemitone / chromaticNoteNames.length)
  return `${chromaticNoteNames[noteIndex]}${noteOctave}`
}

export const buildChromaticNoteId = (bankId: BankId, padId: string, relativeSemitone: number) =>
  `${bankId}:${padId}:${relativeSemitone}`
