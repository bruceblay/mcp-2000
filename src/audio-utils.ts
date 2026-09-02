import type { WebAudioContext, BitcrusherProcessorNode, LoopChopProcessorNode, TapeStopProcessorNode, SidechainPumpProcessorNode, PadPlaybackSetting, ChopRegion, GeneratedLoop } from './types'

export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

export const buildDistortionCurve = (amount: number) => {
  const samples = 8192
  const curve = new Float32Array(samples)
  const drive = Math.pow(24, clamp(amount, 0, 1))
  const normalization = Math.tanh(drive)
  const referenceAmplitude = 0.28
  const probes = 2048
  let inputEnergy = 0
  let outputEnergy = 0

  for (let index = 0; index < probes; index += 1) {
    const input = referenceAmplitude * Math.sin((2 * Math.PI * index) / probes)
    const output = Math.tanh(input * drive) / normalization
    inputEnergy += input * input
    outputEnergy += output * output
  }

  const outputTrim = outputEnergy > 0 ? Math.sqrt(inputEnergy / outputEnergy) : 1

  for (let index = 0; index < samples; index += 1) {
    const x = (index * 2) / samples - 1
    curve[index] = (Math.tanh(x * drive) / normalization) * outputTrim
  }

  return curve
}

export const buildTapeSaturationCurve = (amount: number) => {
  const samples = 8192
  const curve = new Float32Array(samples)
  const saturation = clamp(amount, 0, 1)
  const drive = 1 + saturation * 4
  const normalization = Math.tanh(drive)

  for (let index = 0; index < samples; index += 1) {
    const x = (index * 2) / samples - 1
    curve[index] = (1 - saturation) * x + saturation * (Math.tanh(x * drive) / normalization)
  }

  return curve
}

const createSeededNoise = (seedValue: number) => {
  let seed = seedValue >>> 0 || 0x9e3779b9
  return () => {
    seed ^= seed << 13
    seed ^= seed >>> 17
    seed ^= seed << 5
    return (seed >>> 0) / 0xffffffff
  }
}

export const buildImpulseResponse = (
  context: WebAudioContext,
  roomSize: number,
  decaySeconds: number,
  profile: 'room' | 'hall' = 'room',
) => {
  const duration = Math.max(0.2, decaySeconds)
  const length = Math.max(1, Math.floor(context.sampleRate * duration))
  const impulse = context.createBuffer(2, length, context.sampleRate)
  const normalizedRoomSize = clamp(roomSize, 0, 1)
  const decayExponent = Math.max(1.5 - normalizedRoomSize, 0.3)

  for (let channel = 0; channel < impulse.numberOfChannels; channel += 1) {
    const channelData = impulse.getChannelData(channel)
    const random = createSeededNoise(
      Math.round(context.sampleRate + duration * 997 + normalizedRoomSize * 7919 + channel * 104729 + (profile === 'hall' ? 65537 : 0)),
    )

    for (let index = 0; index < length; index += 1) {
      const remaining = 1 - index / length
      const lateReflection = (random() * 2 - 1) * Math.pow(remaining, decayExponent)

      if (profile === 'hall') {
        const earlyReflection = (random() * 2 - 1) * 0.3 * Math.pow(remaining, 0.5)
        channelData[index] = (earlyReflection + lateReflection * 0.7) * 0.5
      } else {
        channelData[index] = lateReflection
      }
    }
  }

  return impulse
}

export const buildNoiseBuffer = (context: WebAudioContext, durationSeconds = 2) => {
  const length = Math.max(1, Math.floor(context.sampleRate * durationSeconds))
  const buffer = context.createBuffer(2, length, context.sampleRate)

  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const data = buffer.getChannelData(channel)
    const random = createSeededNoise(0x51f15e + channel * 104729 + context.sampleRate)
    for (let index = 0; index < data.length; index += 1) {
      data[index] = random() * 2 - 1
    }
  }

  return buffer
}

export const getChorusModulationDepth = (delayMs: number, depth: number) =>
  Math.min(clamp(depth, 0, 1) * 0.002, clamp(delayMs, 2, 30) / 1000 * 0.8)

export const getAutoFilterSweep = (baseFrequency: number, octaves: number, depth = 1) => {
  const base = clamp(baseFrequency, 20, 12000)
  const ceiling = Math.min(base * Math.pow(2, clamp(octaves, 1, 6)), 15000)
  const halfRange = ((ceiling - base) / 2) * clamp(depth, 0, 1)
  return { centerFrequency: base + (ceiling - base) / 2, modulationDepth: halfRange }
}

export const getPitchShiftSettings = (pitch: number, windowSize: number) => {
  const window = clamp(windowSize, 0.01, 0.1)
  return {
    window,
    rate: 1 / (window * 2),
    sweep: (Math.pow(2, clamp(pitch, -12, 12) / 12) - 1) * window,
  }
}

export const createBitcrusherNode = (context: WebAudioContext, bits: number, normalRange: number) => {
  const processor = context.createScriptProcessor(1024, 2, 2) as BitcrusherProcessorNode
  let step = Math.pow(2, clamp(Math.round(bits), 1, 16) - 1)
  let sampleRateReduction = Math.floor(clamp(normalRange, 0, 1) * 32) + 1
  let sampleCounter = 0
  let lastLeft = 0
  let lastRight = 0

  processor.onaudioprocess = (event) => {
    const inputLeft = event.inputBuffer.getChannelData(0)
    const inputRight = event.inputBuffer.numberOfChannels > 1 ? event.inputBuffer.getChannelData(1) : inputLeft
    const outputLeft = event.outputBuffer.getChannelData(0)
    const outputRight = event.outputBuffer.numberOfChannels > 1 ? event.outputBuffer.getChannelData(1) : outputLeft

    for (let index = 0; index < inputLeft.length; index += 1) {
      if (sampleCounter % sampleRateReduction === 0) {
        lastLeft = inputLeft[index]
        lastRight = inputRight[index]
      }
      sampleCounter += 1

      outputLeft[index] = Math.round(lastLeft * step) / step
      outputRight[index] = Math.round(lastRight * step) / step
    }
  }

  processor._updateSettings = (nextBits, nextNormalRange) => {
    step = Math.pow(2, clamp(Math.round(nextBits), 1, 16) - 1)
    sampleRateReduction = Math.floor(clamp(nextNormalRange, 0, 1) * 32) + 1
  }

  return processor
}

export const createLoopChopNode = (context: WebAudioContext, loopSize: number, stutterRate: number, tempo: number) => {
  const processor = context.createScriptProcessor(1024, 2, 2) as LoopChopProcessorNode

  const loopSizes = [0.125, 0.25, 0.5, 1.0, 2.0]

  let loopSizeIndex = Math.max(0, Math.min(4, Math.round(loopSize)))
  let currentTempo = clamp(tempo, 60, 180)
  let bufferSize = Math.max(1, Math.floor((60 / currentTempo) * (loopSizes[loopSizeIndex] ?? 0.5) * context.sampleRate))
  let maxStutters = clamp(Math.floor(stutterRate), 1, 16)

  let captureBufferL = new Float32Array(bufferSize)
  let captureBufferR = new Float32Array(bufferSize)
  let playbackBufferL = new Float32Array(bufferSize)
  let playbackBufferR = new Float32Array(bufferSize)
  let captureIndex = 0
  let playbackIndex = 0
  let isCapturing = true
  let captureComplete = false
  let stutterCount = 0

  processor.onaudioprocess = (event) => {
    const inputLeft = event.inputBuffer.getChannelData(0)
    const inputRight = event.inputBuffer.numberOfChannels > 1 ? event.inputBuffer.getChannelData(1) : inputLeft
    const outputLeft = event.outputBuffer.getChannelData(0)
    const outputRight = event.outputBuffer.numberOfChannels > 1 ? event.outputBuffer.getChannelData(1) : outputLeft

    for (let index = 0; index < inputLeft.length; index += 1) {
      if (isCapturing && !captureComplete) {
        captureBufferL[captureIndex] = inputLeft[index]
        captureBufferR[captureIndex] = inputRight[index]
        captureIndex += 1

        if (captureIndex >= bufferSize) {
          playbackBufferL = new Float32Array(captureBufferL)
          playbackBufferR = new Float32Array(captureBufferR)
          captureComplete = true
          isCapturing = false
          playbackIndex = 0
          stutterCount = 0
        }

        outputLeft[index] = inputLeft[index]
        outputRight[index] = inputRight[index]
      } else if (captureComplete) {
        outputLeft[index] = playbackBufferL[playbackIndex]
        outputRight[index] = playbackBufferR[playbackIndex]
        playbackIndex += 1

        if (playbackIndex >= bufferSize) {
          stutterCount += 1
          playbackIndex = 0

          if (stutterCount >= maxStutters) {
            isCapturing = true
            captureComplete = false
            captureIndex = 0
            stutterCount = 0
          }
        }
      } else {
        outputLeft[index] = inputLeft[index]
        outputRight[index] = inputRight[index]
      }
    }
  }

  processor._updateSettings = (nextLoopSize, nextStutterRate, nextTempo) => {
    const nextIndex = Math.max(0, Math.min(4, Math.round(nextLoopSize)))
    currentTempo = clamp(nextTempo, 60, 180)
    const nextBufferSize = Math.max(1, Math.floor((60 / currentTempo) * (loopSizes[nextIndex] ?? 0.5) * context.sampleRate))
    maxStutters = clamp(Math.floor(nextStutterRate), 1, 16)

    if (nextBufferSize !== bufferSize) {
      bufferSize = nextBufferSize
      loopSizeIndex = nextIndex
      captureBufferL = new Float32Array(bufferSize)
      captureBufferR = new Float32Array(bufferSize)
      playbackBufferL = new Float32Array(bufferSize)
      playbackBufferR = new Float32Array(bufferSize)
      isCapturing = true
      captureComplete = false
      captureIndex = 0
      playbackIndex = 0
      stutterCount = 0
    }
  }

  return processor
}

export const createTapeStopNode = (context: WebAudioContext, stopTime: number, restartTime: number, mode: number) => {
  const processor = context.createScriptProcessor(1024, 2, 2) as TapeStopProcessorNode

  const bufferLength = Math.floor(context.sampleRate * 4)
  const bufferL = new Float32Array(bufferLength)
  const bufferR = new Float32Array(bufferLength)
  let writeIndex = 0
  // Stay one sample behind the writer so normal-speed playback begins with
  // live audio instead of reading several seconds of an empty circular buffer.
  let readPosition = bufferLength - 1
  let playbackRate = 1.0
  let phase: 'stopping' | 'stopped' | 'restarting' | 'playing' = 'stopping'
  let phaseTimer = 0
  let phaseDuration = 0

  let currentStopTime = Math.max(0.1, stopTime)
  let currentRestartTime = Math.max(0.1, restartTime)
  let currentMode = Math.max(0, Math.min(2, Math.round(mode)))

  const startStop = () => {
    phase = 'stopping'
    phaseTimer = 0
    phaseDuration = Math.floor(currentStopTime * context.sampleRate)
    playbackRate = 1.0
  }

  const startRestart = () => {
    phase = 'restarting'
    phaseTimer = 0
    phaseDuration = Math.floor(currentRestartTime * context.sampleRate)
    playbackRate = 0.0
  }

  const startPlaying = () => {
    phase = 'playing'
    phaseTimer = 0
    phaseDuration = Math.floor(0.5 * context.sampleRate)
    playbackRate = 1.0
  }

  startStop()

  processor.onaudioprocess = (event) => {
    const inputLeft = event.inputBuffer.getChannelData(0)
    const inputRight = event.inputBuffer.numberOfChannels > 1 ? event.inputBuffer.getChannelData(1) : inputLeft
    const outputLeft = event.outputBuffer.getChannelData(0)
    const outputRight = event.outputBuffer.numberOfChannels > 1 ? event.outputBuffer.getChannelData(1) : outputLeft

    const stopSamples = Math.floor(currentStopTime * context.sampleRate)
    const restartSamples = Math.floor(currentRestartTime * context.sampleRate)

    for (let index = 0; index < inputLeft.length; index += 1) {
      bufferL[writeIndex] = inputLeft[index]
      bufferR[writeIndex] = inputRight[index]
      writeIndex = (writeIndex + 1) % bufferLength

      phaseTimer += 1

      if (phase === 'stopping') {
        const progress = Math.min(phaseTimer / stopSamples, 1.0)
        playbackRate = Math.max(0, 1.0 - Math.pow(progress, 1.5))

        if (progress >= 1.0) {
          playbackRate = 0.0
          if (currentMode === 0) {
            phase = 'stopped'
          } else {
            startRestart()
          }
        }
      } else if (phase === 'restarting') {
        const progress = Math.min(phaseTimer / restartSamples, 1.0)
        playbackRate = Math.pow(progress, 1.5)

        if (progress >= 1.0) {
          playbackRate = 1.0
          if (currentMode === 2) {
            startPlaying()
          } else {
            phase = 'playing'
            phaseDuration = Infinity
          }
        }
      } else if (phase === 'playing' && currentMode === 2) {
        if (phaseTimer >= phaseDuration) {
          startStop()
        }
      }

      if (playbackRate > 0.001) {
        readPosition = (readPosition + playbackRate) % bufferLength
        const idx = Math.floor(readPosition)
        const frac = readPosition - idx
        const nextIdx = (idx + 1) % bufferLength

        outputLeft[index] = bufferL[idx] * (1 - frac) + bufferL[nextIdx] * frac
        outputRight[index] = bufferR[idx] * (1 - frac) + bufferR[nextIdx] * frac
      } else {
        outputLeft[index] = 0
        outputRight[index] = 0
      }
    }
  }

  processor._updateSettings = (nextStopTime, nextRestartTime, nextMode) => {
    currentStopTime = Math.max(0.1, nextStopTime)
    currentRestartTime = Math.max(0.1, nextRestartTime)
    currentMode = Math.max(0, Math.min(2, Math.round(nextMode)))
  }

  return processor
}

export const createSidechainPumpNode = (
  context: WebAudioContext,
  filterFreq: number,
  sensitivity: number,
  depth: number,
  attack: number,
  release: number,
) => {
  const processor = context.createScriptProcessor(1024, 2, 2) as SidechainPumpProcessorNode
  let currentFilterFreq = clamp(filterFreq, 40, 200)
  let currentSensitivity = clamp(sensitivity, 0.01, 0.5)
  let currentDepth = clamp(depth, 0, 1)
  let currentAttack = clamp(attack, 0.001, 0.05)
  let currentRelease = clamp(release, 0.05, 0.8)
  let filterStage1 = 0
  let filterStage2 = 0
  let envelope = 0
  let duckGain = 1

  processor.onaudioprocess = (event) => {
    const inputLeft = event.inputBuffer.getChannelData(0)
    const inputRight = event.inputBuffer.numberOfChannels > 1 ? event.inputBuffer.getChannelData(1) : inputLeft
    const outputLeft = event.outputBuffer.getChannelData(0)
    const outputRight = event.outputBuffer.numberOfChannels > 1 ? event.outputBuffer.getChannelData(1) : outputLeft
    const sampleRate = context.sampleRate
    const filterCoefficient = Math.exp((-2 * Math.PI * currentFilterFreq) / sampleRate)
    const envelopeAttack = Math.exp(-1 / (currentAttack * sampleRate))
    const envelopeRelease = Math.exp(-1 / (currentRelease * sampleRate))
    const gainAttack = Math.exp(-1 / (0.001 * sampleRate))
    const gainRelease = Math.exp(-1 / (currentRelease * sampleRate))

    for (let index = 0; index < inputLeft.length; index += 1) {
      const monoInput = (inputLeft[index] + inputRight[index]) * 0.5
      filterStage1 = filterStage1 * filterCoefficient + monoInput * (1 - filterCoefficient)
      filterStage2 = filterStage2 * filterCoefficient + filterStage1 * (1 - filterCoefficient)
      const rectified = Math.abs(filterStage2)
      const envelopeCoefficient = rectified > envelope ? envelopeAttack : envelopeRelease
      envelope = envelopeCoefficient * envelope + (1 - envelopeCoefficient) * rectified

      const overThreshold = envelope > currentSensitivity
        ? Math.min((envelope - currentSensitivity) / currentSensitivity, 1)
        : 0
      const targetGain = 1 - currentDepth * overThreshold
      const gainCoefficient = targetGain < duckGain ? gainAttack : gainRelease
      duckGain = gainCoefficient * duckGain + (1 - gainCoefficient) * targetGain

      outputLeft[index] = inputLeft[index] * duckGain
      outputRight[index] = inputRight[index] * duckGain
    }
  }

  processor._updateSettings = (nextFilterFreq, nextSensitivity, nextDepth, nextAttack, nextRelease) => {
    currentFilterFreq = clamp(nextFilterFreq, 40, 200)
    currentSensitivity = clamp(nextSensitivity, 0.01, 0.5)
    currentDepth = clamp(nextDepth, 0, 1)
    currentAttack = clamp(nextAttack, 0.001, 0.05)
    currentRelease = clamp(nextRelease, 0.05, 0.8)
  }

  return processor
}

export const createReversedBuffer = (context: WebAudioContext, buffer: AudioBuffer) => {
  const reversedBuffer = context.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate)

  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const source = buffer.getChannelData(channel)
    const target = reversedBuffer.getChannelData(channel)

    for (let index = 0; index < buffer.length; index += 1) {
      target[index] = source[buffer.length - 1 - index]
    }
  }

  return reversedBuffer
}

export const getPadPlaybackWindow = (sampleBuffer: AudioBuffer, playbackSettings: PadPlaybackSetting, semitoneOffset = playbackSettings.semitoneOffset) => {
  const forwardStartTime = sampleBuffer.duration * playbackSettings.startFraction
  const forwardEndTime = sampleBuffer.duration * playbackSettings.endFraction
  const startTime = playbackSettings.reversed ? sampleBuffer.duration - forwardEndTime : forwardStartTime
  const endTime = playbackSettings.reversed ? sampleBuffer.duration - forwardStartTime : forwardEndTime
  const playbackDuration = Math.max(0.01, endTime - startTime)
  const playbackRate = Math.pow(2, semitoneOffset / 12)

  return {
    startTime,
    endTime,
    playbackDuration,
    playbackRate,
  }
}

const writeWavString = (view: DataView, offset: number, value: string) => {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index))
  }
}

export const encodeWavBlob = (buffer: AudioBuffer) => {
  const bytesPerSample = 2
  const channelCount = buffer.numberOfChannels
  const blockAlign = channelCount * bytesPerSample
  const dataByteLength = buffer.length * blockAlign
  const wavBuffer = new ArrayBuffer(44 + dataByteLength)
  const view = new DataView(wavBuffer)

  writeWavString(view, 0, 'RIFF')
  view.setUint32(4, 36 + dataByteLength, true)
  writeWavString(view, 8, 'WAVE')
  writeWavString(view, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, channelCount, true)
  view.setUint32(24, buffer.sampleRate, true)
  view.setUint32(28, buffer.sampleRate * blockAlign, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, 16, true)
  writeWavString(view, 36, 'data')
  view.setUint32(40, dataByteLength, true)

  let offset = 44

  for (let sampleIndex = 0; sampleIndex < buffer.length; sampleIndex += 1) {
    for (let channelIndex = 0; channelIndex < channelCount; channelIndex += 1) {
      const sampleValue = clamp(buffer.getChannelData(channelIndex)?.[sampleIndex] ?? 0, -1, 1)
      const intValue = sampleValue < 0 ? sampleValue * 0x8000 : sampleValue * 0x7fff
      view.setInt16(offset, Math.round(intValue), true)
      offset += bytesPerSample
    }
  }

  return new Blob([wavBuffer], { type: 'audio/wav' })
}

export const sanitizeDownloadName = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'sample'

export const triggerBlobDownload = (blob: Blob, fileName: string) => {
  const exportUrl = URL.createObjectURL(blob)
  const downloadLink = document.createElement('a')

  downloadLink.href = exportUrl
  downloadLink.download = fileName
  document.body.append(downloadLink)
  downloadLink.click()
  downloadLink.remove()
  window.setTimeout(() => URL.revokeObjectURL(exportUrl), 0)
}

export const getSubdivisionSeconds = (bpm: number, subdivision: number) => {
  const beatSeconds = 60 / Math.max(1, bpm)
  const ratios = [1, 0.5, 0.25, 0.75, 1 / 3]
  return beatSeconds * (ratios[Math.max(0, Math.min(ratios.length - 1, Math.round(subdivision)))] ?? 0.5)
}

export const getLoopChopRate = (loopSize: number, stutterRate: number) => {
  const divisors = [0.25, 0.5, 1, 2, 4]
  const divisor = divisors[Math.max(0, Math.min(divisors.length - 1, Math.round(loopSize)))] ?? 1
  return clamp(stutterRate / divisor, 1, 32)
}

export const getEffectTailPaddingSeconds = (
  effectId: string,
  effectParams: Record<string, number>,
  effectEnabled: boolean,
  isEffectSupported: boolean,
) => {
  if (!effectEnabled || !isEffectSupported) {
    return 0
  }

  if (effectId === 'delay') {
    return clamp((effectParams.delayTime ?? 0.25) * (4 + clamp(effectParams.feedback ?? 0.3, 0, 0.95) * 8), 1, 8)
  }

  if (effectId === 'taptempodelay') {
    const delaySeconds = getSubdivisionSeconds(effectParams.tapTempo ?? 120, effectParams.subdivision ?? 1)
    return clamp(delaySeconds * (4 + clamp(effectParams.feedback ?? 0.4, 0, 0.95) * 8), 1, 8)
  }

  if (effectId === 'reverb') {
    return clamp((effectParams.decay ?? 2) + 0.75, 1, 12)
  }

  if (effectId === 'hallreverb') {
    return clamp((effectParams.preDelay ?? 0.03) + (effectParams.decay ?? 4) + 1, 1.5, 12)
  }

  if (effectId === 'tapestop') {
    return clamp((effectParams.stopTime ?? 1) + (effectParams.restartTime ?? 0.5) + 0.75, 1, 6)
  }

  if (effectId === 'lofitape') {
    return 1.25
  }

  return 0.35
}

export const getLoopDurationSeconds = (loop: GeneratedLoop) => {
  if (typeof loop.durationSeconds === 'number' && Number.isFinite(loop.durationSeconds)) {
    return loop.durationSeconds
  }

  const parsedDuration = Number.parseFloat(loop.durationLabel)
  return Number.isFinite(parsedDuration) ? parsedDuration : 8
}

export const buildChopRegions = (durationSeconds: number, chopCount: number): ChopRegion[] => {
  const safeDuration = Math.max(durationSeconds, chopCount * 0.01)
  const chopDuration = safeDuration / chopCount

  return Array.from({ length: chopCount }, (_, index) => ({
    id: `chop-${index + 1}`,
    start: Number((chopDuration * index).toFixed(4)),
    end: Number((chopDuration * (index + 1)).toFixed(4)),
  }))
}

export const normalizeChopRegions = (regions: ChopRegion[], durationSeconds: number): ChopRegion[] => {
  if (regions.length === 0) {
    return []
  }

  const safeDuration = Math.max(durationSeconds, regions.length * 0.01)
  const sorted = [...regions].sort((left, right) => left.start - right.start)
  const normalized: ChopRegion[] = []

  for (let index = 0; index < sorted.length; index += 1) {
    const current = sorted[index]
    const previousEnd = index === 0 ? 0 : normalized[index - 1].end
    const nextRegion = sorted[index + 1]
    const maxEnd = nextRegion ? Math.max(previousEnd + 0.01, nextRegion.end - 0.01) : safeDuration
    const start = previousEnd
    const proposedEnd = Math.min(Math.max(current.end, start + 0.01), maxEnd)

    normalized.push({
      id: current.id,
      start: Number(start.toFixed(4)),
      end: Number((index === sorted.length - 1 ? safeDuration : proposedEnd).toFixed(4)),
    })
  }

  return normalized
}

export const loadAudioDurationFromUrl = async (audioUrl: string) =>
  new Promise<number>((resolve) => {
    const audio = new Audio()

    const cleanup = () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata)
      audio.removeEventListener('error', handleError)
    }

    const handleLoadedMetadata = () => {
      cleanup()
      resolve(Number.isFinite(audio.duration) ? audio.duration : 0)
    }

    const handleError = () => {
      cleanup()
      resolve(0)
    }

    audio.preload = 'metadata'
    audio.src = audioUrl
    audio.addEventListener('loadedmetadata', handleLoadedMetadata)
    audio.addEventListener('error', handleError)
  })

export const base64ToBlob = (base64: string, mimeType = 'audio/mpeg') => {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
  return new Blob([bytes], { type: mimeType })
}

export const blobToBase64 = async (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()

    reader.onloadend = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('Failed to encode audio for ElevenLabs.'))
        return
      }

      resolve(reader.result.split(',')[1] ?? '')
    }

    reader.onerror = () => {
      reject(new Error('Failed to encode audio for ElevenLabs.'))
    }

    reader.readAsDataURL(blob)
  })

export const getLfoWaveform = (value: number): OscillatorType => {
  const waveforms: OscillatorType[] = ['sine', 'square', 'sawtooth', 'triangle']
  return waveforms[Math.max(0, Math.min(waveforms.length - 1, Math.round(value)))] ?? 'sine'
}

export const getPreferredRecordingMimeType = () => {
  const preferredMimeTypes = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
  ] as const

  if (typeof MediaRecorder === 'undefined') {
    return ''
  }

  return preferredMimeTypes.find((mimeType) => (
    typeof MediaRecorder.isTypeSupported === 'function' ? MediaRecorder.isTypeSupported(mimeType) : true
  )) ?? ''
}

export const getRecordingFileExtension = (mimeType: string) => {
  if (mimeType.includes('ogg')) {
    return 'ogg'
  }

  if (mimeType.includes('mp4')) {
    return 'm4a'
  }

  return 'webm'
}
