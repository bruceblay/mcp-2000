import type { WebAudioContext, BitcrusherProcessorNode, LoopChopProcessorNode, TapeStopProcessorNode, PadPlaybackSetting, ChopRegion, GeneratedLoop } from './types'

export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

export const buildDistortionCurve = (amount: number) => {
  const samples = 44100
  const curve = new Float32Array(samples)
  const drive = 5 + amount * 395

  for (let index = 0; index < samples; index += 1) {
    const x = (index * 2) / samples - 1
    curve[index] = ((3 + drive) * x * 20 * (Math.PI / 180)) / (Math.PI + drive * Math.abs(x))
  }

  return curve
}

export const buildImpulseResponse = (context: WebAudioContext, roomSize: number, decaySeconds: number) => {
  const duration = Math.max(0.2, decaySeconds)
  const length = Math.max(1, Math.floor(context.sampleRate * duration))
  const impulse = context.createBuffer(2, length, context.sampleRate)

  for (let channel = 0; channel < impulse.numberOfChannels; channel += 1) {
    const channelData = impulse.getChannelData(channel)

    for (let index = 0; index < length; index += 1) {
      const t = index / length
      const envelope = Math.pow(1 - t, Math.max(1, roomSize * 6 + 1))
      channelData[index] = (Math.random() * 2 - 1) * envelope
    }
  }

  return impulse
}

export const createBitcrusherNode = (context: WebAudioContext, bits: number, normalRange: number) => {
  const processor = context.createScriptProcessor(256, 2, 2) as BitcrusherProcessorNode
  let step = Math.pow(2, Math.max(1, Math.round(bits)) - 1)
  let sampleRateReduction = Math.floor(normalRange * 32) + 1
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
    step = Math.pow(2, Math.max(1, Math.round(nextBits)) - 1)
    sampleRateReduction = Math.floor(nextNormalRange * 32) + 1
  }

  return processor
}

export const createLoopChopNode = (context: WebAudioContext, loopSize: number, stutterRate: number) => {
  const processor = context.createScriptProcessor(256, 2, 2) as LoopChopProcessorNode

  const loopSizes = [0.125, 0.25, 0.5, 1.0, 2.0]
  const beatLength = 60 / 120

  let loopSizeIndex = Math.max(0, Math.min(4, Math.round(loopSize)))
  let bufferSize = Math.floor(beatLength * (loopSizes[loopSizeIndex] ?? 0.5) * context.sampleRate)
  let maxStutters = Math.max(1, Math.floor(stutterRate))

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

  processor._updateSettings = (nextLoopSize, nextStutterRate) => {
    const nextIndex = Math.max(0, Math.min(4, Math.round(nextLoopSize)))
    const nextBufferSize = Math.floor(beatLength * (loopSizes[nextIndex] ?? 0.5) * context.sampleRate)
    maxStutters = Math.max(1, Math.floor(nextStutterRate))

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
  const processor = context.createScriptProcessor(256, 2, 2) as TapeStopProcessorNode

  const bufferLength = context.sampleRate * 2
  const bufferL = new Float32Array(bufferLength)
  const bufferR = new Float32Array(bufferLength)
  let writeIndex = 0
  let readPosition = 0.0
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
    return clamp((effectParams.delayTime ?? 0.2) * (4 + clamp(effectParams.feedback ?? 0.5, 0, 0.95) * 8), 1, 8)
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
