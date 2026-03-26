import type { EffectConfig } from './effects'
import { chromaticNoteNames } from './constants'

export const formatEffectParamValue = (parameter: EffectConfig['parameters'][number], value: number) => {
  if (parameter.key === 'filterType') {
    return ['Low Pass', 'High Pass', 'Band Pass'][Math.max(0, Math.min(2, Math.round(value)))] ?? 'Low Pass'
  }

  if (parameter.key === 'type' || parameter.key === 'waveform') {
    return ['Sine', 'Square', 'Saw', 'Triangle'][Math.max(0, Math.min(3, Math.round(value)))] ?? 'Sine'
  }

  if (parameter.key === 'subdivision') {
    return ['1/4', '1/8', '1/16', 'Dotted', 'Triplet'][Math.max(0, Math.min(4, Math.round(value)))] ?? '1/8'
  }

  if (parameter.key === 'loopSize') {
    return ['1/32', '1/16', '1/8', '1/4', '1/2'][Math.max(0, Math.min(4, Math.round(value)))] ?? '1/8'
  }

  if (parameter.key === 'triggerMode') {
    return ['Continuous', 'Triggered'][Math.max(0, Math.min(1, Math.round(value)))] ?? 'Continuous'
  }

  if (parameter.key === 'mode') {
    return ['Stop', 'Stop/Restart', 'Continuous'][Math.max(0, Math.min(2, Math.round(value)))] ?? 'Continuous'
  }

  if (parameter.unit === '%') {
    return `${Math.round(value * 100)}%`
  }

  if (parameter.unit === 's') {
    return `${value.toFixed(2)}s`
  }

  if (parameter.unit === 'ms') {
    return `${value.toFixed(1)} ms`
  }

  if (parameter.unit === 'bits') {
    return `${Math.round(value)} bits`
  }

  if (parameter.unit === 'Hz') {
    return `${Math.round(value)} Hz`
  }

  if (parameter.unit === 'bpm') {
    return `${Math.round(value)} BPM`
  }

  if (parameter.unit === 'semitones') {
    return `${value > 0 ? '+' : ''}${value.toFixed(1)} st`
  }

  if (parameter.unit === 'x') {
    return `${Math.round(value)}x`
  }

  if (parameter.unit === '°') {
    return `${Math.round(value)}°`
  }

  if (parameter.unit === 'dB') {
    return `${value.toFixed(1)} dB`
  }

  if (parameter.unit === ':1') {
    return `${value.toFixed(1)}:1`
  }

  return Number.isInteger(value) ? String(value) : value.toFixed(2)
}

export const formatClockDuration = (seconds: number) => {
  const wholeSeconds = Math.max(0, Math.round(seconds))
  const minutes = Math.floor(wholeSeconds / 60)
  const remainder = wholeSeconds % 60
  return `${minutes}:${String(remainder).padStart(2, '0')}`
}

export const formatChopRegionLabel = (regionId: string) => {
  const match = regionId.match(/(\d+)$/)
  if (!match) {
    return regionId
  }

  return `Chop ${match[1].padStart(2, '0')}`
}

export const formatSemitoneOffsetLabel = (value: number) => `${value > 0 ? '+' : ''}${value} st`

export const formatMidiNoteLabel = (noteNumber: number | null | undefined) => {
  if (typeof noteNumber !== 'number' || !Number.isFinite(noteNumber)) {
    return 'Unmapped'
  }

  const normalized = Math.max(0, Math.min(127, Math.round(noteNumber)))
  const octave = Math.floor(normalized / 12) - 1
  const noteName = chromaticNoteNames[normalized % chromaticNoteNames.length] ?? 'C'
  return `${noteName}${octave}`
}
