import { useEffect, useMemo, useRef, useState } from 'react'

type WaveformStatus = 'idle' | 'loading' | 'ready' | 'error'
type MarkerDragField = 'start' | 'end'

export type WaveformRegion = {
  id: string
  start: number
  end: number
}

type SampleWaveformProps = {
  audioUrl: string | null
  durationSeconds?: number | null
  regions?: WaveformRegion[]
  selectedRegionId?: string | null
  playheadFraction?: number | null
  markerStartFraction?: number | null
  markerEndFraction?: number | null
  reversed?: boolean
  onStatusChange?: (status: WaveformStatus) => void
  onRegionSelect?: (region: WaveformRegion) => void
  onRegionsChange?: (regions: WaveformRegion[]) => void
  onMarkerChange?: (field: MarkerDragField, nextFraction: number) => void
  onWaveformClick?: () => void
}

type DecodedWaveform = {
  duration: number
  channelData: Float32Array[]
}

const baseRegionClass = 'sample-waveform__region'
const selectedRegionClass = 'sample-waveform__region is-selected'

const buildSamplePeaks = (channelData: Float32Array[], sampleCount = 960) => {
  const primary = channelData[0]
  if (!primary || primary.length === 0) {
    return []
  }

  const blockSize = Math.max(1, Math.floor(primary.length / sampleCount))
  const peaks: number[] = []

  for (let index = 0; index < sampleCount; index += 1) {
    const start = index * blockSize
    const end = Math.min(primary.length, start + blockSize)
    let peak = 0

    for (let frame = start; frame < end; frame += 1) {
      peak = Math.max(peak, Math.abs(primary[frame] ?? 0))
    }

    peaks.push(peak)
  }

  return peaks
}

const buildBytePeaks = (audioBytes: Uint8Array, sampleCount = 960) => {
  if (audioBytes.length === 0) {
    return []
  }

  const blockSize = Math.max(1, Math.floor(audioBytes.length / sampleCount))
  const peaks: number[] = []

  for (let index = 0; index < sampleCount; index += 1) {
    const start = index * blockSize
    const end = Math.min(audioBytes.length, start + blockSize)
    let total = 0

    for (let offset = start; offset < end; offset += 1) {
      total += Math.abs((audioBytes[offset] ?? 128) - 128) / 128
    }

    const average = end > start ? total / (end - start) : 0
    peaks.push(Math.min(1, Math.max(0.05, average)))
  }

  return peaks
}

const getAudioContextConstructor = () => {
  return window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext ?? null
}

const decodeWithAudioContext = async (audioData: ArrayBuffer): Promise<DecodedWaveform> => {
  const AudioContextCtor = getAudioContextConstructor()
  if (!AudioContextCtor) {
    throw new Error('AudioContext unavailable for waveform decode')
  }

  const audioContext = new AudioContextCtor()

  try {
    const decodedBuffer = await audioContext.decodeAudioData(audioData.slice(0))
    const channelData = Array.from({ length: decodedBuffer.numberOfChannels }, (_, index) => decodedBuffer.getChannelData(index))

    return {
      duration: decodedBuffer.duration,
      channelData,
    }
  } finally {
    void audioContext.close().catch(() => undefined)
  }
}

const decodeWithOfflineContext = async (audioData: ArrayBuffer): Promise<DecodedWaveform> => {
  const offlineContext = new OfflineAudioContext(1, 1, 44100)
  const decodedBuffer = await offlineContext.decodeAudioData(audioData.slice(0))
  const channelData = Array.from({ length: decodedBuffer.numberOfChannels }, (_, index) => decodedBuffer.getChannelData(index))

  return {
    duration: decodedBuffer.duration,
    channelData,
  }
}

const decodeAudioPeaks = async (audioData: ArrayBuffer): Promise<DecodedWaveform> => {
  try {
    return await decodeWithAudioContext(audioData)
  } catch (primaryError) {
    console.warn('Waveform decode via AudioContext failed, retrying with OfflineAudioContext.', primaryError)
    return decodeWithOfflineContext(audioData)
  }
}

const loadAudioDuration = async (audioUrl: string): Promise<number> => {
  return new Promise((resolve, reject) => {
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
      reject(new Error(`Failed to load audio metadata: ${audioUrl}`))
    }

    audio.preload = 'metadata'
    audio.src = audioUrl
    audio.addEventListener('loadedmetadata', handleLoadedMetadata)
    audio.addEventListener('error', handleError)
  })
}

export function SampleWaveform({
  audioUrl,
  durationSeconds: knownDurationSeconds = null,
  regions = [],
  selectedRegionId = null,
  playheadFraction = null,
  markerStartFraction = null,
  markerEndFraction = null,
  reversed = false,
  onStatusChange,
  onRegionSelect,
  onRegionsChange,
  onMarkerChange,
  onWaveformClick,
}: SampleWaveformProps) {
  const [fallbackPeaks, setFallbackPeaks] = useState<number[]>([])
  const [durationSeconds, setDurationSeconds] = useState<number>(0)

  const fallbackCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const trimOverlayRef = useRef<HTMLDivElement | null>(null)
  const regionsOverlayRef = useRef<HTMLDivElement | null>(null)
  const markerChangeRef = useRef(onMarkerChange)
  const regionsChangeRef = useRef(onRegionsChange)

  markerChangeRef.current = onMarkerChange
  regionsChangeRef.current = onRegionsChange

  const emptyMessage = useMemo(() => {
    return audioUrl ? null : 'Generate or select audio to inspect it here.'
  }, [audioUrl])

  const displayPeaks = useMemo(() => (reversed ? [...fallbackPeaks].reverse() : fallbackPeaks), [fallbackPeaks, reversed])
  const regionDurationSeconds = knownDurationSeconds && knownDurationSeconds > 0 ? knownDurationSeconds : durationSeconds
  const visualMarkerStartFraction = reversed ? 1 - (markerEndFraction ?? 1) : markerStartFraction ?? 0
  const visualMarkerEndFraction = reversed ? 1 - (markerStartFraction ?? 0) : markerEndFraction ?? 1
  const visualPlayheadFraction = playheadFraction === null ? null : reversed ? 1 - playheadFraction : playheadFraction

  useEffect(() => {
    const canvas = fallbackCanvasRef.current
    if (!canvas) {
      return
    }

    const context = canvas.getContext('2d')
    if (!context) {
      return
    }

    const width = canvas.clientWidth || 960
    const height = canvas.clientHeight || 208
    const dpr = window.devicePixelRatio || 1

    canvas.width = width * dpr
    canvas.height = height * dpr
    context.setTransform(dpr, 0, 0, dpr, 0, 0)
    context.clearRect(0, 0, width, height)

    if (displayPeaks.length === 0) {
      context.strokeStyle = 'rgba(70, 78, 82, 0.35)'
      context.beginPath()
      context.moveTo(0, height / 2)
      context.lineTo(width, height / 2)
      context.stroke()
      return
    }

    const middle = height / 2
    const step = width / displayPeaks.length

    context.strokeStyle = '#7a6047'
    context.lineWidth = 1
    context.beginPath()

    displayPeaks.forEach((peak, index) => {
      const x = index * step
      const amplitude = Math.max(1, peak * (height * 0.46))
      context.moveTo(x, middle - amplitude / 2)
      context.lineTo(x, middle + amplitude / 2)
    })

    context.stroke()
  }, [displayPeaks])

  useEffect(() => {
    if (!audioUrl) {
      setFallbackPeaks([])
      setDurationSeconds(0)
      onStatusChange?.('idle')
      return
    }

    let cancelled = false
    onStatusChange?.('loading')

    const loadWaveform = async () => {
      try {
        const response = await fetch(audioUrl)
        if (!response.ok) {
          throw new Error(`Failed to fetch waveform audio: ${audioUrl}`)
        }

        const audioData = await response.arrayBuffer()

        try {
          const decoded = await decodeAudioPeaks(audioData)
          if (cancelled) {
            return
          }

          setDurationSeconds(decoded.duration)
          setFallbackPeaks(buildSamplePeaks(decoded.channelData))
          onStatusChange?.('ready')
          return
        } catch (decodeError) {
          console.warn('Waveform decode failed. Falling back to byte-derived peaks.', decodeError)
        }

        const metadataDuration = await loadAudioDuration(audioUrl).catch(() => 0)
        if (cancelled) {
          return
        }

        setDurationSeconds(metadataDuration)
        setFallbackPeaks(buildBytePeaks(new Uint8Array(audioData)))
        onStatusChange?.('ready')
      } catch (error) {
        console.error(error)
        if (!cancelled) {
          setFallbackPeaks([])
          setDurationSeconds(0)
          onStatusChange?.('error')
        }
      }
    }

    void loadWaveform()

    return () => {
      cancelled = true
    }
  }, [audioUrl, onStatusChange])

  useEffect(() => {
    const overlay = trimOverlayRef.current
    if (!overlay || !markerChangeRef.current) {
      return
    }

    const startFraction = markerStartFraction ?? 0
    const endFraction = markerEndFraction ?? 1

    const beginDrag = (field: MarkerDragField, pointerId: number) => {
      const updateFromPointer = (clientX: number) => {
        const bounds = overlay.getBoundingClientRect()
        const relative = Math.min(1, Math.max(0, (clientX - bounds.left) / bounds.width))
        const mappedRelative = reversed ? 1 - relative : relative
        if (field === 'start') {
          markerChangeRef.current?.('start', Math.min(mappedRelative, endFraction - 0.01))
          return
        }

        markerChangeRef.current?.('end', Math.max(mappedRelative, startFraction + 0.01))
      }

      const handlePointerMove = (event: PointerEvent) => {
        if (event.pointerId !== pointerId) {
          return
        }

        updateFromPointer(event.clientX)
      }

      const stopDrag = (event: PointerEvent) => {
        if (event.pointerId !== pointerId) {
          return
        }

        window.removeEventListener('pointermove', handlePointerMove)
        window.removeEventListener('pointerup', stopDrag)
      }

      window.addEventListener('pointermove', handlePointerMove)
      window.addEventListener('pointerup', stopDrag)
    }

    const startHandle = overlay.querySelector<HTMLElement>('[data-marker-handle="start"]')
    const endHandle = overlay.querySelector<HTMLElement>('[data-marker-handle="end"]')

    const handleStartPointerDown = (event: PointerEvent) => {
      event.preventDefault()
      beginDrag(reversed ? 'end' : 'start', event.pointerId)
    }

    const handleEndPointerDown = (event: PointerEvent) => {
      event.preventDefault()
      beginDrag(reversed ? 'start' : 'end', event.pointerId)
    }

    startHandle?.addEventListener('pointerdown', handleStartPointerDown)
    endHandle?.addEventListener('pointerdown', handleEndPointerDown)

    return () => {
      startHandle?.removeEventListener('pointerdown', handleStartPointerDown)
      endHandle?.removeEventListener('pointerdown', handleEndPointerDown)
    }
  }, [markerEndFraction, markerStartFraction, reversed])

  useEffect(() => {
    const overlay = regionsOverlayRef.current
    if (!overlay || !regionsChangeRef.current || regionDurationSeconds <= 0 || regions.length === 0) {
      return
    }

    const beginResize = (regionId: string, edge: 'start' | 'end', pointerId: number) => {
      const updateFromPointer = (clientX: number) => {
        const bounds = overlay.getBoundingClientRect()
        const relative = Math.min(1, Math.max(0, (clientX - bounds.left) / bounds.width))
        const nextTime = relative * regionDurationSeconds
        const index = regions.findIndex((region) => region.id === regionId)
        if (index < 0) {
          return
        }

        const nextRegions = regions.map((region) => ({ ...region }))
        const target = nextRegions[index]

        if (edge === 'start') {
          const minStart = index === 0 ? 0 : nextRegions[index - 1].start + 0.01
          const maxStart = target.end - 0.01
          const start = Math.min(Math.max(nextTime, minStart), maxStart)
          target.start = start
          if (index > 0) {
            nextRegions[index - 1].end = start
          }
        } else {
          const minEnd = target.start + 0.01
          const maxEnd = index === nextRegions.length - 1 ? regionDurationSeconds : nextRegions[index + 1].end - 0.01
          const end = Math.min(Math.max(nextTime, minEnd), maxEnd)
          target.end = end
          if (index < nextRegions.length - 1) {
            nextRegions[index + 1].start = end
          }
        }

        regionsChangeRef.current?.(nextRegions)
      }

      const handlePointerMove = (event: PointerEvent) => {
        if (event.pointerId !== pointerId) {
          return
        }

        updateFromPointer(event.clientX)
      }

      const stopDrag = (event: PointerEvent) => {
        if (event.pointerId !== pointerId) {
          return
        }

        window.removeEventListener('pointermove', handlePointerMove)
        window.removeEventListener('pointerup', stopDrag)
      }

      window.addEventListener('pointermove', handlePointerMove)
      window.addEventListener('pointerup', stopDrag)
    }

    const handles = overlay.querySelectorAll<HTMLElement>('[data-region-handle]')
    const listeners: Array<() => void> = []

    handles.forEach((handle) => {
      const regionId = handle.dataset.regionId
      const edge = handle.dataset.regionHandle as 'start' | 'end' | undefined
      if (!regionId || !edge) {
        return
      }

      const onPointerDown = (event: PointerEvent) => {
        event.preventDefault()
        event.stopPropagation()
        beginResize(regionId, edge, event.pointerId)
      }

      handle.addEventListener('pointerdown', onPointerDown)
      listeners.push(() => handle.removeEventListener('pointerdown', onPointerDown))
    })

    return () => {
      listeners.forEach((dispose) => dispose())
    }
  }, [regionDurationSeconds, regions])

  const hasTrimMarkers = markerStartFraction !== null && markerEndFraction !== null && onMarkerChange

  const handleWaveformPointerDown = () => {
    if (regions.length > 0 || !onWaveformClick) {
      return
    }

    onWaveformClick()
  }

  return (
    <div
      className={onWaveformClick && regions.length === 0 ? 'sample-waveform is-auditionable' : 'sample-waveform'}
      aria-label="Sample editor waveform"
      onPointerDown={handleWaveformPointerDown}
    >
      <canvas
        ref={fallbackCanvasRef}
        className={audioUrl ? 'sample-waveform__fallback' : 'sample-waveform__fallback is-empty'}
        aria-hidden="true"
      />
      {regions.length > 0 ? (
        <div ref={regionsOverlayRef} className="sample-waveform__regions" aria-hidden="true">
          {regions.map((region) => {
            const left = regionDurationSeconds > 0 ? (region.start / regionDurationSeconds) * 100 : 0
            const width = regionDurationSeconds > 0 ? ((region.end - region.start) / regionDurationSeconds) * 100 : 0
            return (
              <button
                key={region.id}
                type="button"
                className={region.id === selectedRegionId ? selectedRegionClass : baseRegionClass}
                style={{ left: `${left}%`, width: `${width}%` }}
                onClick={() => onRegionSelect?.(region)}
              >
                <span className="sample-waveform__region-handle sample-waveform__region-handle--start" data-region-handle="start" data-region-id={region.id} />
                <span className="sample-waveform__region-handle sample-waveform__region-handle--end" data-region-handle="end" data-region-id={region.id} />
              </button>
            )
          })}
        </div>
      ) : null}
      {hasTrimMarkers ? (
        <div ref={trimOverlayRef} className="sample-waveform__trim-overlay" aria-hidden="true">
          <div
            className="sample-waveform__trim-mask sample-waveform__trim-mask--start"
            style={{ width: `${Math.max(0, visualMarkerStartFraction) * 100}%` }}
          />
          <div
            className="sample-waveform__trim-mask sample-waveform__trim-mask--end"
            style={{ width: `${Math.max(0, 1 - visualMarkerEndFraction) * 100}%` }}
          />
          <div
            className="sample-waveform__trim-handle"
            data-marker-handle="start"
            style={{ left: `${visualMarkerStartFraction * 100}%` }}
          />
          <div
            className="sample-waveform__trim-handle"
            data-marker-handle="end"
            style={{ left: `${visualMarkerEndFraction * 100}%` }}
          />
        </div>
      ) : null}
      {visualPlayheadFraction !== null ? (
        <div className="sample-waveform__playhead" style={{ left: `${visualPlayheadFraction * 100}%` }} aria-hidden="true" />
      ) : null}
      {emptyMessage ? <div className="sample-waveform__empty">{emptyMessage}</div> : null}
    </div>
  )
}
