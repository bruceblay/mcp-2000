import { startTransition, useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight, Circle, Disc, Download, Metronome, Piano, Play, Square } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import JSZip from 'jszip'
import { type Pad } from './mock-kit'
import { SampleWaveform } from './components/sample-waveform'
import { ScrollPicker } from './components/ScrollPicker'
import { getEffectDefaults, getEffectsList } from './effects'
import {
  loopChopCount, midiStorageKey, midiSelectedInputStorageKey,
  groupLabels, chromaticBaseOctave, chromaticMinOctave, chromaticMaxOctave,
  chromaticKeyLayout, chromaticKeyboardMap, sequenceLookaheadMs,
  sequenceScheduleAheadSeconds, supportedGlobalEffectIds, arpDivisionOptions, arpModeOptions,
  performanceRecordingMaxSeconds,
} from './constants'
import {
  bankIds,
  type BankId, type EngineStatus, type GenerationStatus, type GenerationMode, type SequenceGenerationAction,
  type MicCaptureState, type WorkView, type EditorSource, type PlaybackMode, type RecordedTake, type GeneratedLoop,
  type EditorTransformResponse, type ChopRegion, type BitcrusherProcessorNode, type ActiveEffectRuntime,
  type ActivePadAudio, type ActiveChromaticNoteAudio, type ActiveLoopPlayback, type MidiPadNoteMappings,
  type NavigatorWithMidi, type PadPlaybackSetting, type BankState, type Sequence,
  type ArpMode, type ArpDivision, type EffectChainState, type EffectChainSlotId, effectChainSlotIds,
  type BankSnapshot,
} from './types'
import {
  clamp, buildDistortionCurve, buildImpulseResponse, createReversedBuffer,
  getPadPlaybackWindow, encodeWavBlob, sanitizeDownloadName, triggerBlobDownload,
  getSubdivisionSeconds, getLoopChopRate, getEffectTailPaddingSeconds,
  getLoopDurationSeconds, buildChopRegions, normalizeChopRegions,
  loadAudioDurationFromUrl, base64ToBlob, blobToBase64, getLfoWaveform,
  getPreferredRecordingMimeType, getRecordingFileExtension,
} from './audio-utils'
import { formatClockDuration, formatChopRegionLabel, formatMidiNoteLabel } from './format-utils'
import { getChromaticRelativeSemitone, getChromaticNoteLabel, buildChromaticNoteId } from './chromatic-utils'
import {
  createInitialBankMixerGains, createInitialBankToggleState, getEffectiveBankGain,
  createInitialBanksState, createInitialBankState, createInitialSequence, getActiveSequence,
  createInitialEffectChain, createInitialBankEffects,
  readStoredMidiPadMappings, readStoredMidiInputId,
} from './state-init'
import { createGlobalEffectRouting } from './effects-routing'
import { type DeserializedProject } from './project-snapshot'
import { useShare } from './use-share'
import { ChatPanel } from './components/ChatPanel'
import { EffectsWorkspace } from './components/EffectsWorkspace'
import { MixerWorkspace } from './components/MixerWorkspace'
import { SequenceWorkspace } from './components/SequenceWorkspace'
import { GenerationPanel } from './components/GenerationPanel'
import { Knob } from './components/Knob'
import { Tooltip, TooltipProvider } from './components/Tooltip'

function App() {
  const [isDarkMode, setIsDarkMode] = useState(false)
  const [isChatOpen, setIsChatOpen] = useState(false)
  const [currentBankId, setCurrentBankId] = useState<BankId>('A')
  const [bankStates, setBankStates] = useState<Record<BankId, BankState>>(() => createInitialBanksState())
  const [bankMixerGains, setBankMixerGains] = useState<Record<BankId, number>>(() => createInitialBankMixerGains())
  const [bankMixerMuted, setBankMixerMuted] = useState<Record<BankId, boolean>>(() => createInitialBankToggleState())
  const [bankMixerSoloed, setBankMixerSoloed] = useState<Record<BankId, boolean>>(() => createInitialBankToggleState())
  const [masterOutputGain, setMasterOutputGain] = useState(0.9)
  const [activePadIds, setActivePadIds] = useState<string[]>([])
  const [engineStatus, setEngineStatus] = useState<EngineStatus>('idle')
  const [, setLoadedPadCount] = useState(0)
  const [promptText, setPromptText] = useState('')
  const [generationStatus, setGenerationStatus] = useState<GenerationStatus>('idle')
  const [generationMode, setGenerationMode] = useState<GenerationMode>('kit')
  const [_generationMessage, setGenerationMessage] = useState('Generate a full 16-pad bank or a loop for chopping.')
  const [micCaptureState, setMicCaptureState] = useState<MicCaptureState>('idle')
  const [micCaptureMessage, setMicCaptureMessage] = useState('Capture a raw take from your microphone, then load it into a pad or the editor.')
  const [recordedTake, setRecordedTake] = useState<RecordedTake | null>(null)
  const [recordingElapsedMs, setRecordingElapsedMs] = useState(0)
  const [sequencePromptText, setSequencePromptText] = useState('')
  const [sequenceGenerationStatus, setSequenceGenerationStatus] = useState<GenerationStatus>('idle')
  const [sequenceGenerationAction, setSequenceGenerationAction] = useState<SequenceGenerationAction | null>(null)
  const [, setSequenceGenerationMessage] = useState('Describe the groove you want and the app will build a pattern for the current bank.')
  const [workView, setWorkView] = useState<WorkView | null>('editor')
  const [editorSource, setEditorSource] = useState<EditorSource>('pad')
  const [generatedLoop, setGeneratedLoop] = useState<GeneratedLoop | null>(null)
  const [loopTargetBankId, setLoopTargetBankId] = useState<BankId>('A')
  const [loopChopRegions, setLoopChopRegions] = useState<ChopRegion[]>([])
  const [selectedChopId, setSelectedChopId] = useState<string | null>(null)
  const [editorPlayheadFraction, setEditorPlayheadFraction] = useState<number | null>(null)
  const [editorTransformPrompt, setEditorTransformPrompt] = useState('')
  const [isExportingSample, setIsExportingSample] = useState(false)
  const [isExportingSequence, setIsExportingSequence] = useState(false)
  const [sequenceExportMessage, setSequenceExportMessage] = useState('Render all audible banks as a WAV clip with the current FX chain.')
  const [isPerformanceRecording, setIsPerformanceRecording] = useState(false)
  const [performanceRecordingElapsed, setPerformanceRecordingElapsed] = useState(0)
  const [isTransformingEditorAudio, setIsTransformingEditorAudio] = useState(false)
  const [isLoopPlaying, setIsLoopPlaying] = useState(false)
  const [isNormalizingLoop, setIsNormalizingLoop] = useState(false)
  const [, setLoopDecodeStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [, setSelectedPadDecodeStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [sequenceTempo, setSequenceTempo] = useState(94)
  const [isMetronomeEnabled, setIsMetronomeEnabled] = useState(false)
  const [isChromaticModeActive, setIsChromaticModeActive] = useState(false)
  const [chromaticOctave, setChromaticOctave] = useState(chromaticBaseOctave)
  const [activeChromaticNoteIds, setActiveChromaticNoteIds] = useState<string[]>([])
  const [isArpEnabled, setIsArpEnabled] = useState(false)
  const [isArpLatched, setIsArpLatched] = useState(false)
  const [arpDivision, setArpDivision] = useState<ArpDivision>('1/8')
  const [arpMode, setArpMode] = useState<ArpMode>('up')
  const [isRecordArmed, setIsRecordArmed] = useState(false)
  const [isSequencePlaying, setIsSequencePlaying] = useState(false)
  const [sequencePlayheadStep, setSequencePlayheadStep] = useState<number | null>(null)
  const [bankEffects, setBankEffects] = useState<Record<BankId, EffectChainState>>(() => createInitialBankEffects())
  const [masterEffect, setMasterEffect] = useState<EffectChainState>(() => createInitialEffectChain())
  const [midiAccessState, setMidiAccessState] = useState<'idle' | 'connecting' | 'ready' | 'error'>('idle')
  const [_midiStatusMessage, setMidiStatusMessage] = useState('Enable MIDI to map controller notes to the pad grid.')
  const [availableMidiInputs, setAvailableMidiInputs] = useState<Array<{ id: string; name: string }>>([])
  const [selectedMidiInputId, setSelectedMidiInputId] = useState<string | null>(() => readStoredMidiInputId())
  const [midiLearnPadId, setMidiLearnPadId] = useState<string | null>(null)
  const [midiPadNoteMappings, setMidiPadNoteMappings] = useState<MidiPadNoteMappings>(() => readStoredMidiPadMappings())
  const [isMidiPanelOpen, setIsMidiPanelOpen] = useState(false)
  const [bankSnapshots, setBankSnapshots] = useState<BankSnapshot[]>([])
  const [openBankPopover, setOpenBankPopover] = useState<BankId | null>(null)
  const isDebugMode = new URLSearchParams(window.location.search).has('debug')
  const [audioDebug, setAudioDebug] = useState<string[]>([])
  const audioDebugRef = useRef<string[]>([])
  const pushDebug = (msg: string) => {
    if (!isDebugMode) return
    const line = `[${new Date().toLocaleTimeString()}] ${msg}`
    audioDebugRef.current = [...audioDebugRef.current.slice(-8), line]
    setAudioDebug(audioDebugRef.current)
  }

  const bankPopoverRef = useRef<HTMLDivElement>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const masterGainRef = useRef<GainNode | null>(null)
  const bankGainNodesRef = useRef<Partial<Record<BankId, GainNode>>>({})
  const bankEffectInputsRef = useRef<Partial<Record<BankId, GainNode>>>({})
  const bankEffectOutputsRef = useRef<Partial<Record<BankId, GainNode>>>({})
  const masterEffectInputRef = useRef<GainNode | null>(null)
  const effectCleanupsRef = useRef<Partial<Record<EffectChainSlotId, () => void>>>({})
  const effectRuntimesRef = useRef<Partial<Record<EffectChainSlotId, ActiveEffectRuntime | null>>>({})
  const previousEffectParamsRef = useRef<Partial<Record<EffectChainSlotId, Record<string, number>>>>({})
  const bufferMapRef = useRef<Map<string, AudioBuffer>>(new Map())
  const reversedBufferMapRef = useRef<Map<string, AudioBuffer>>(new Map())
  const loadPromiseRef = useRef<Promise<void> | null>(null)
  const activePadSourcesRef = useRef<Map<string, ActivePadAudio>>(new Map())
  const activeChromaticNotesRef = useRef<Map<string, ActiveChromaticNoteAudio>>(new Map())
  const pressedChromaticKeysRef = useRef<Map<string, string>>(new Map())
  const arpIntervalRef = useRef<number | null>(null)
  const arpHeldSemitonesRef = useRef<number[]>([])
  const arpPhysicalHeldCountRef = useRef(0)
  const arpStepIndexRef = useRef(0)
  const arpDirectionRef = useRef<1 | -1>(1)
  const arpActiveNoteIdRef = useRef<string | null>(null)
  const activeLoopPlaybackRef = useRef<ActiveLoopPlayback | null>(null)
  const loopPlaybackIdRef = useRef(0)
  const playheadFrameRef = useRef<number | null>(null)
  const activePadPlayheadIdRef = useRef<string | null>(null)
  const preservedLoopChopRegionsRef = useRef<ChopRegion[] | null>(null)
  const preservedSelectedChopIdRef = useRef<string | null>(null)
  const micTakeAudioRef = useRef<HTMLAudioElement | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const micStreamRef = useRef<MediaStream | null>(null)
  const recordedChunksRef = useRef<Blob[]>([])
  const recordingTimerRef = useRef<number | null>(null)
  const recordingStartedAtRef = useRef<number | null>(null)
  const outputLimiterRef = useRef<DynamicsCompressorNode | null>(null)
  const performanceRecorderRef = useRef<MediaRecorder | null>(null)
  const performanceChunksRef = useRef<Blob[]>([])
  const performanceTimerRef = useRef<number | null>(null)
  const performanceStreamNodeRef = useRef<MediaStreamAudioDestinationNode | null>(null)
  const ephemeralAudioUrlsRef = useRef<Set<string>>(new Set())
  const scheduledMetronomeSourcesRef = useRef<Set<OscillatorNode>>(new Set())
  const sequenceSchedulerRef = useRef<number | null>(null)
  const sequenceStartTimeRef = useRef(0)
  const sequenceNextStepTimeRef = useRef(0)
  const sequenceStepIndexRef = useRef(0)
  const sequenceUiTimeoutsRef = useRef<number[]>([])
  const bankStatesRef = useRef(bankStates)
  const currentBankIdRef = useRef(currentBankId)
  const sequenceTempoRef = useRef(sequenceTempo)
  const midiAccessRef = useRef<MIDIAccess | null>(null)
  const selectedMidiInputIdRef = useRef<string | null>(selectedMidiInputId)
  const midiLearnPadIdRef = useRef<string | null>(midiLearnPadId)
  const midiPadNoteMappingsRef = useRef<MidiPadNoteMappings>(midiPadNoteMappings)
  const activeMidiNotesRef = useRef<Map<string, { padId: string; bankId: BankId }>>(new Map())

  const allPads = useMemo(() => Object.values(bankStates).flatMap((bank) => bank.pads), [bankStates])

  const currentBankState = bankStates[currentBankId]
  const currentBankPads = currentBankState.pads
  const currentSequence = getActiveSequence(currentBankState)
  const currentSequenceLength = currentSequence.sequenceLength
  const currentStepPattern = currentSequence.stepPattern
  const currentStepSemitoneOffsets = currentSequence.stepSemitoneOffsets
  const currentSequenceMuted = currentSequence.sequenceMuted
  const selectedPad = useMemo(
    () => currentBankPads.find((pad) => pad.id === currentBankState.selectedPadId) ?? currentBankPads[0],
    [currentBankPads, currentBankState.selectedPadId],
  )

  const selectedPadSettings = currentBankState.playbackSettings[selectedPad.id]
  const semitoneOffset = selectedPadSettings.semitoneOffset
  const padGain = selectedPadSettings.gain
  const padPan = selectedPadSettings.pan
  const playbackMode = selectedPadSettings.playbackMode
  const isPadReversed = selectedPadSettings.reversed
  const currentEditorAudioUrl = editorSource === 'loop' && generatedLoop ? generatedLoop.sampleUrl : selectedPad.sampleUrl
  const currentEditorAudioDuration = editorSource === 'loop' && generatedLoop ? getLoopDurationSeconds(generatedLoop) : null
  const currentEditorSampleName = editorSource === 'loop' && generatedLoop ? generatedLoop.sampleName : selectedPad.sampleName
  const isLoopEditorActive = editorSource === 'loop' && Boolean(generatedLoop)
  const editorExportLabel = isLoopEditorActive ? 'Export Loop' : 'Export Sample'
  const selectedChop = selectedChopId ? loopChopRegions.find((region) => region.id === selectedChopId) ?? null : null
  const selectedChopDurationSeconds = selectedChop ? Math.max(0.01, selectedChop.end - selectedChop.start) : null
  const activeChromaticNoteSet = useMemo(() => new Set(activeChromaticNoteIds), [activeChromaticNoteIds])
  const chromaticRangeLabel = `${getChromaticNoteLabel(chromaticOctave, 0)}-${getChromaticNoteLabel(chromaticOctave, 12)}`
  const effectsList = useMemo(() => getEffectsList(), [])
  const micRecordingSupported = typeof MediaRecorder !== 'undefined' && typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia)
  const midiSupported = typeof navigator !== 'undefined' && typeof (navigator as NavigatorWithMidi).requestMIDIAccess === 'function'
  const isMidiEnabled = midiAccessState === 'ready'
  const micCaptureClockLabel = micCaptureState === 'recording'
    ? formatClockDuration(recordingElapsedMs / 1000)
    : recordedTake
      ? formatClockDuration(recordedTake.durationSeconds)
      : '0:00'

  const createEphemeralAudioUrl = (blob: Blob) => {
    const nextUrl = URL.createObjectURL(blob)
    ephemeralAudioUrlsRef.current.add(nextUrl)
    return nextUrl
  }

  const stopMicStream = () => {
    if (!micStreamRef.current) {
      return
    }

    micStreamRef.current.getTracks().forEach((track) => track.stop())
    micStreamRef.current = null
  }

  const clearRecordingTimer = () => {
    if (recordingTimerRef.current) {
      window.clearInterval(recordingTimerRef.current)
      recordingTimerRef.current = null
    }
  }

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDarkMode ? 'dark' : 'light')
  }, [isDarkMode])

  useEffect(() => {
    if (openBankPopover === null) return
    const handleClickOutside = (e: MouseEvent) => {
      if (bankPopoverRef.current && !bankPopoverRef.current.contains(e.target as Node)) {
        setOpenBankPopover(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [openBankPopover])

  useEffect(() => {
    const blurSelect = (e: Event) => {
      if (e.target instanceof HTMLSelectElement) {
        requestAnimationFrame(() => (e.target as HTMLElement).blur())
      }
    }
    const blurButton = (e: Event) => {
      if (e.target instanceof HTMLButtonElement) {
        requestAnimationFrame(() => (e.target as HTMLElement).blur())
      }
    }
    document.addEventListener('change', blurSelect)
    document.addEventListener('mouseup', blurButton)
    return () => {
      document.removeEventListener('change', blurSelect)
      document.removeEventListener('mouseup', blurButton)
    }
  }, [])

  useEffect(() => {
    bankStatesRef.current = bankStates
  }, [bankStates])

  useEffect(() => {
    const referencedUrls = new Set(allPads.map((pad) => pad.sampleUrl))

    if (generatedLoop?.sampleUrl) {
      referencedUrls.add(generatedLoop.sampleUrl)
    }

    if (recordedTake?.previewUrl) {
      referencedUrls.add(recordedTake.previewUrl)
    }

    for (const snapshot of bankSnapshots) {
      for (const pad of snapshot.bankState.pads) {
        referencedUrls.add(pad.sampleUrl)
      }
    }

    for (const url of Array.from(ephemeralAudioUrlsRef.current)) {
      if (!referencedUrls.has(url)) {
        URL.revokeObjectURL(url)
        ephemeralAudioUrlsRef.current.delete(url)
      }
    }

    for (const url of bufferMapRef.current.keys()) {
      if (!referencedUrls.has(url)) {
        bufferMapRef.current.delete(url)
        reversedBufferMapRef.current.delete(url)
      }
    }
    setLoadedPadCount(bufferMapRef.current.size)
  }, [allPads, generatedLoop?.sampleUrl, recordedTake?.previewUrl, bankSnapshots])

  useEffect(() => {
    for (const bankId of bankIds) {
      const bankNode = bankGainNodesRef.current[bankId]
      if (bankNode) {
        bankNode.gain.value = getEffectiveBankGain(bankId, bankMixerGains, bankMixerMuted, bankMixerSoloed)
      }
    }
  }, [bankMixerGains, bankMixerMuted, bankMixerSoloed])

  useEffect(() => {
    if (masterGainRef.current) {
      masterGainRef.current.gain.value = masterOutputGain
    }
  }, [masterOutputGain])

  useEffect(() => {
    currentBankIdRef.current = currentBankId
  }, [currentBankId])

  useEffect(() => {
    sequenceTempoRef.current = sequenceTempo
  }, [sequenceTempo])

  useEffect(() => {
    selectedMidiInputIdRef.current = selectedMidiInputId
  }, [selectedMidiInputId])

  useEffect(() => {
    midiLearnPadIdRef.current = midiLearnPadId
  }, [midiLearnPadId])

  useEffect(() => {
    midiPadNoteMappingsRef.current = midiPadNoteMappings
  }, [midiPadNoteMappings])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    try {
      window.localStorage.setItem(midiStorageKey, JSON.stringify(midiPadNoteMappings))
    } catch {}
  }, [midiPadNoteMappings])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    try {
      if (selectedMidiInputId) {
        window.localStorage.setItem(midiSelectedInputStorageKey, selectedMidiInputId)
      } else {
        window.localStorage.removeItem(midiSelectedInputStorageKey)
      }
    } catch {}
  }, [selectedMidiInputId])

  useEffect(() => {
    const access = midiAccessRef.current
    if (!access || !selectedMidiInputId) {
      return
    }

    if (!Array.from(access.inputs.values()).some((input) => input.id === selectedMidiInputId)) {
      return
    }

    const listener = (event: MIDIMessageEvent) => {
      handleMidiMessage(event)
    }

    for (const input of access.inputs.values()) {
      input.onmidimessage = input.id === selectedMidiInputId ? listener : null
    }

    return () => {
      for (const input of access.inputs.values()) {
        if (input.onmidimessage === listener) {
          input.onmidimessage = null
        }
      }
    }
  }, [availableMidiInputs, selectedMidiInputId])

  useEffect(() => {
    releaseAllMappedMidiNotes()
  }, [selectedMidiInputId])

  useEffect(() => {
    return () => {
      for (const slotId of effectChainSlotIds) {
        effectCleanupsRef.current[slotId]?.()
      }

      if (sequenceSchedulerRef.current) {
        window.clearInterval(sequenceSchedulerRef.current)
      }

      sequenceUiTimeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId))
      sequenceUiTimeoutsRef.current = []

      if (audioContextRef.current) {
        void audioContextRef.current.close()
      }

      if (playheadFrameRef.current) {
        window.cancelAnimationFrame(playheadFrameRef.current)
      }

      clearRecordingTimer()
      if (mediaRecorderRef.current) {
        mediaRecorderRef.current.ondataavailable = null
        mediaRecorderRef.current.onstop = null
        mediaRecorderRef.current.onerror = null

        if (mediaRecorderRef.current.state !== 'inactive') {
          try {
            mediaRecorderRef.current.stop()
          } catch {}
        }
      }
      stopMicStream()

      for (const source of scheduledMetronomeSourcesRef.current) {
        try {
          source.stop()
        } catch {}
      }
      scheduledMetronomeSourcesRef.current.clear()

      for (const url of ephemeralAudioUrlsRef.current) {
        URL.revokeObjectURL(url)
      }
      ephemeralAudioUrlsRef.current.clear()

      if (midiAccessRef.current) {
        midiAccessRef.current.onstatechange = null
        for (const input of midiAccessRef.current.inputs.values()) {
          input.onmidimessage = null
        }
      }
      activeMidiNotesRef.current.clear()

      for (const activePad of activePadSourcesRef.current.values()) {
        try {
          activePad.source.stop()
        } catch {}
      }
      activePadSourcesRef.current.clear()

      for (const activeNote of activeChromaticNotesRef.current.values()) {
        try {
          activeNote.source.stop()
        } catch {}
      }
      activeChromaticNotesRef.current.clear()
      pressedChromaticKeysRef.current.clear()
      arpHeldSemitonesRef.current = []
      if (arpIntervalRef.current !== null) {
        window.clearInterval(arpIntervalRef.current)
      }

      const activeLoopPlayback = activeLoopPlaybackRef.current
      if (activeLoopPlayback) {
        activeLoopPlayback.source.onended = null
        try {
          activeLoopPlayback.source.stop()
        } catch {}
        try {
          activeLoopPlayback.source.disconnect()
        } catch {}
        try {
          activeLoopPlayback.gainNode.disconnect()
        } catch {}
        activeLoopPlaybackRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    let mediaChannelActivated = false
    let contextUnlocked = false
    // Tiny silent MP3 data URI — forces iOS WebKit to activate the media audio
    // channel instead of the ringer channel. Without this, Web Audio API output
    // is routed through the ringer channel which can be muted on iOS.
    const SILENT_MP3 = 'data:audio/mpeg;base64,SUQzBAAAAAABEVRYWFgAAAAtAAADY29tbWVudABCaWdTb3VuZEJhbmsuY29tIC8gTGFTb25vdGhlcXVlLm9yZwBURU5DAAAAHQAAA1N3aXRjaCBQbHVzIMKpIE5DSCBTb2Z0d2FyZQBUSVQyAAAABgAAAzIyMzUAVFNTRQAAAA8AAANMYXZmNTcuODMuMTAwAAAAAAAAAAAAAAD/80DEAAAAA0gAAAAATEFNRTMuMTAwVVVVVVVVVVVVVUxBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/zQsRbAAADSAAAAABVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/zQMSkAAADSAAAAABVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVQ=='

    const isContextBlocked = (ctx: AudioContext) =>
      ctx.state === 'suspended' || (ctx.state as string) === 'interrupted'

    const unlockAudio = () => {
      if (mediaChannelActivated && contextUnlocked) return

      if (!mediaChannelActivated) {
        const audio = new Audio(SILENT_MP3)
        audio.loop = true
        audio.volume = 0.01
        audio.setAttribute('playsinline', '')
        audio.play().then(() => pushDebug('unlock: HTML audio playing')).catch((e) => pushDebug('unlock: HTML audio FAILED: ' + e.message))
        mediaChannelActivated = true
      }

      const ctx = audioContextRef.current
      if (!ctx) {
        pushDebug('unlock: no AudioContext yet')
        return
      }
      pushDebug('unlock: ctx.state=' + ctx.state)
      if (isContextBlocked(ctx)) {
        ctx.resume().then(() => pushDebug('unlock: resume OK, state=' + ctx.state)).catch((e) => pushDebug('unlock: resume FAILED: ' + e.message))

        const silent = ctx.createBuffer(1, 1, ctx.sampleRate)
        const src = ctx.createBufferSource()
        src.buffer = silent
        src.connect(ctx.destination)
        src.start()
      }
      contextUnlocked = true
    }
    document.addEventListener('touchstart', unlockAudio)
    document.addEventListener('touchend', unlockAudio)
    document.addEventListener('click', unlockAudio)
    return () => {
      document.removeEventListener('touchstart', unlockAudio)
      document.removeEventListener('touchend', unlockAudio)
      document.removeEventListener('click', unlockAudio)
    }
  }, [])

  useEffect(() => {
    if (!generatedLoop && editorSource === 'loop') {
      setEditorSource('pad')
    }
  }, [editorSource, generatedLoop])

  useEffect(() => {
    setLoopTargetBankId(currentBankId)
  }, [currentBankId])

  useEffect(() => {
    if (!generatedLoop) {
      preservedLoopChopRegionsRef.current = null
      preservedSelectedChopIdRef.current = null
      setLoopChopRegions([])
      setSelectedChopId(null)
      return
    }

    const loopDuration = getLoopDurationSeconds(generatedLoop)
    const preservedRegions = preservedLoopChopRegionsRef.current
    const preservedSelectedChopId = preservedSelectedChopIdRef.current

    if (preservedRegions?.length) {
      const normalizedRegions = normalizeChopRegions(preservedRegions, loopDuration)
      preservedLoopChopRegionsRef.current = null
      preservedSelectedChopIdRef.current = null
      setLoopChopRegions(normalizedRegions)
      setSelectedChopId(normalizedRegions.find((region) => region.id === preservedSelectedChopId)?.id ?? normalizedRegions[0]?.id ?? null)
      return
    }

    const nextRegions = buildChopRegions(loopDuration, loopChopCount)
    setLoopChopRegions(nextRegions)
    setSelectedChopId(nextRegions[0]?.id ?? null)
  }, [generatedLoop?.sampleUrl, generatedLoop?.durationSeconds, generatedLoop?.durationLabel])

  useEffect(() => {
    setLoopDecodeStatus('idle')
    setEditorPlayheadFraction(null)
  }, [generatedLoop?.sampleUrl])

  useEffect(() => {
    if (!generatedLoop) {
      return
    }

    let cancelled = false

    const primeLoopBuffer = async () => {
      try {
        const buffer = await loadAudioBuffer(generatedLoop.sampleUrl, generatedLoop.sampleFile)
        if (cancelled) {
          return
        }

        const actualDuration = Number(buffer.duration.toFixed(4))
        if (Math.abs(actualDuration - getLoopDurationSeconds(generatedLoop)) <= 0.02) {
          return
        }

        preservedLoopChopRegionsRef.current = loopChopRegions.length > 0 ? loopChopRegions : preservedLoopChopRegionsRef.current
        preservedSelectedChopIdRef.current = selectedChopId
        setGeneratedLoop((current) => {
          if (!current || current.sampleUrl !== generatedLoop.sampleUrl) {
            return current
          }

          return {
            ...current,
            durationSeconds: actualDuration,
          }
        })
      } catch (error) {
        console.warn('Failed to prime loop buffer.', error)
      }
    }

    void primeLoopBuffer()

    return () => {
      cancelled = true
    }
  }, [generatedLoop?.sampleUrl, generatedLoop?.sampleFile, loopChopRegions, selectedChopId])

  useEffect(() => {
    setSelectedPadDecodeStatus('idle')
  }, [selectedPad.sampleUrl])

  const smoothEffectParam = (
    param: AudioParam | null | undefined,
    targetValue: number,
    rampTime = 0.02,
    type: 'linear' | 'exponential' = 'exponential',
  ) => {
    const context = audioContextRef.current
    if (!context || !param) {
      return
    }

    const now = context.currentTime
    param.cancelScheduledValues(now)
    param.setValueAtTime(param.value, now)

    if (type === 'exponential' && targetValue > 0.0001) {
      param.exponentialRampToValueAtTime(targetValue, now + rampTime)
      return
    }

    param.linearRampToValueAtTime(targetValue, now + rampTime)
  }

  const updateWetDryMix = (refs: Record<string, unknown>, wetValue: number) => {
    const wetGain = refs.wetGain as GainNode | undefined
    const dryGain = refs.dryGain as GainNode | undefined

    if (!wetGain || !dryGain) {
      return
    }

    smoothEffectParam(wetGain.gain, wetValue, 0.015, 'linear')
    smoothEffectParam(dryGain.gain, 1 - wetValue, 0.015, 'linear')
  }

  const syncActivePadMix = (padId: string, nextValues: Partial<Pick<PadPlaybackSetting, 'gain' | 'pan'>>) => {
    const activePad = activePadSourcesRef.current.get(padId)
    if (!activePad) {
      return
    }

    if (typeof nextValues.gain === 'number') {
      smoothEffectParam(activePad.gainNode.gain, nextValues.gain, 0.015, 'linear')
    }

    if (typeof nextValues.pan === 'number' && activePad.pannerNode) {
      smoothEffectParam(activePad.pannerNode.pan, nextValues.pan, 0.02, 'linear')
    }
  }

  const syncActivePadLoopWindow = (padId: string, nextSettings: PadPlaybackSetting) => {
    const activePad = activePadSourcesRef.current.get(padId)
    const activeBuffer = activePad?.source.buffer

    if (!activePad || !activeBuffer || !activePad.source.loop) {
      return
    }

    const forwardStartTime = activeBuffer.duration * nextSettings.startFraction
    const forwardEndTime = activeBuffer.duration * nextSettings.endFraction
    const startTime = nextSettings.reversed ? activeBuffer.duration - forwardEndTime : forwardStartTime
    const endTime = nextSettings.reversed ? activeBuffer.duration - forwardStartTime : forwardEndTime
    const playbackDuration = Math.max(0.01, endTime - startTime)

    activePad.source.loopStart = startTime
    activePad.source.loopEnd = endTime

    startPlayheadAnimation(
      padId,
      nextSettings.reversed ? nextSettings.endFraction : nextSettings.startFraction,
      nextSettings.reversed ? nextSettings.startFraction : nextSettings.endFraction,
      (playbackDuration / activePad.source.playbackRate.value) * 1000,
      { loop: true },
    )
  }

  const syncActivePadPitch = (padId: string, nextSettings: PadPlaybackSetting) => {
    const activePad = activePadSourcesRef.current.get(padId)
    const activeBuffer = activePad?.source.buffer

    if (!activePad || !activeBuffer) {
      return
    }

    const nextPlaybackRate = Math.pow(2, nextSettings.semitoneOffset / 12)
    smoothEffectParam(activePad.source.playbackRate, nextPlaybackRate, 0.02, 'exponential')

    if (activePad.source.loop) {
      startPlayheadAnimation(
        padId,
        nextSettings.reversed ? nextSettings.endFraction : nextSettings.startFraction,
        nextSettings.reversed ? nextSettings.startFraction : nextSettings.endFraction,
        ((Math.max(0.01, Math.abs(nextSettings.endFraction - nextSettings.startFraction)) * activeBuffer.duration) / nextPlaybackRate) * 1000,
        { loop: true },
      )
    }
  }

  const applyEffectRouting = (slotId: EffectChainSlotId) => {
    const context = audioContextRef.current
    if (!context) return

    let effectInput: GainNode | null
    let output: GainNode | null
    let chainState: EffectChainState

    if (slotId === 'master') {
      effectInput = masterEffectInputRef.current
      output = masterGainRef.current
      chainState = masterEffect
    } else {
      effectInput = bankEffectInputsRef.current[slotId] ?? null
      output = bankEffectOutputsRef.current[slotId] ?? null
      chainState = bankEffects[slotId]
    }

    if (!effectInput || !output) return

    effectCleanupsRef.current[slotId]?.()
    effectCleanupsRef.current[slotId] = undefined
    effectRuntimesRef.current[slotId] = null

    try {
      const routing = createGlobalEffectRouting({
        context,
        effectInput,
        masterGain: output,
        effectId: chainState.effectId,
        effectEnabled: chainState.enabled,
        isEffectSupported: supportedGlobalEffectIds.has(chainState.effectId),
        effectParams: chainState.params,
      })
      effectCleanupsRef.current[slotId] = routing.cleanup
      effectRuntimesRef.current[slotId] = routing.runtime
    } catch (error) {
      console.error(`Failed to rebuild effect chain for ${slotId}.`, error)
      try { effectInput.disconnect() } catch {}
      effectInput.connect(output)
    }
  }

  const applyAllEffectRouting = () => {
    for (const slotId of effectChainSlotIds) {
      applyEffectRouting(slotId)
    }
  }

  useEffect(() => {
    applyAllEffectRouting()
  }, [
    bankEffects.A.effectId, bankEffects.A.enabled,
    bankEffects.B.effectId, bankEffects.B.enabled,
    bankEffects.C.effectId, bankEffects.C.enabled,
    bankEffects.D.effectId, bankEffects.D.enabled,
    masterEffect.effectId, masterEffect.enabled,
  ])

  useEffect(() => {
    const allSlots: Array<{ slotId: EffectChainSlotId; state: EffectChainState }> = [
      ...bankIds.map((bankId) => ({ slotId: bankId as EffectChainSlotId, state: bankEffects[bankId] })),
      { slotId: 'master' as EffectChainSlotId, state: masterEffect },
    ]

    for (const { slotId, state } of allSlots) {
      const runtime = effectRuntimesRef.current[slotId]
      const prev = previousEffectParamsRef.current[slotId] ?? {}
      previousEffectParamsRef.current[slotId] = state.params

      if (!runtime || !state.enabled || runtime.effectId !== state.effectId) continue

      const context = audioContextRef.current
      if (!context) continue

      const refs = runtime.refs
      const didChange = (key: string, fallback = 0) => (prev[key] ?? fallback) !== (state.params[key] ?? fallback)

      if (didChange('wet', 0.5)) {
        updateWetDryMix(refs, clamp(state.params.wet ?? 0.5, 0, 1))
      }

      if (state.effectId === 'simplefilter') {
        const filter = refs.filter as BiquadFilterNode | undefined
        if (!filter) {
          continue
        }

        if (didChange('filterType', 0)) {
          filter.type = ['lowpass', 'highpass', 'bandpass'][Math.max(0, Math.min(2, Math.round(state.params.filterType ?? 0)))] as BiquadFilterType
        }
        if (didChange('cutoffFreq', 2000)) {
          smoothEffectParam(filter.frequency, clamp(state.params.cutoffFreq ?? 2000, 20, 20000), 0.03)
        }
        if (didChange('resonance', 5)) {
          smoothEffectParam(filter.Q, clamp(state.params.resonance ?? 5, 0.0001, 30), 0.02, 'linear')
        }
        continue
      }

      if (state.effectId === 'autofilter') {
        const filter = refs.filter as BiquadFilterNode | undefined
        const lfo = refs.lfo as OscillatorNode | undefined
        const lfoGain = refs.lfoGain as GainNode | undefined
        if (!filter || !lfo || !lfoGain) {
          continue
        }

        if (didChange('rate', 5)) {
          smoothEffectParam(lfo.frequency, clamp(state.params.rate ?? 5, 0.1, 10), 0.02)
        }
        if (didChange('baseFreq', 990) || didChange('depth', 0.8) || didChange('octaves', 1)) {
          const baseFreq = clamp(state.params.baseFreq ?? 990, 20, 12000)
          const depth = clamp(state.params.depth ?? 0.8, 0, 1)
          const octaves = clamp(state.params.octaves ?? 1, 1, 6)
          smoothEffectParam(filter.frequency, baseFreq, 0.03)
          smoothEffectParam(lfoGain.gain, baseFreq * (Math.pow(2, octaves) - 1) * depth, 0.03, 'linear')
        }
        continue
      }

      if (state.effectId === 'autopanner') {
        const lfo = refs.lfo as OscillatorNode | undefined
        const lfoGain = refs.lfoGain as GainNode | undefined
        if (!lfo || !lfoGain) {
          continue
        }

        if (didChange('type', 0)) {
          lfo.type = getLfoWaveform(state.params.type ?? 0)
        }
        if (didChange('rate', 2)) {
          smoothEffectParam(lfo.frequency, clamp(state.params.rate ?? 2, 0.1, 10), 0.02)
        }
        if (didChange('depth', 0.8)) {
          smoothEffectParam(lfoGain.gain, clamp(state.params.depth ?? 0.8, 0, 1), 0.02, 'linear')
        }
        continue
      }

      if (state.effectId === 'delay') {
        const delay = refs.delay as DelayNode | undefined
        const feedbackGain = refs.feedbackGain as GainNode | undefined
        if (delay && didChange('delayTime', 0.2)) {
          smoothEffectParam(delay.delayTime, clamp(state.params.delayTime ?? 0.2, 0.01, 2), 0.05, 'linear')
        }
        if (feedbackGain && didChange('feedback', 0.5)) {
          smoothEffectParam(feedbackGain.gain, clamp(state.params.feedback ?? 0.5, 0, 0.95), 0.015, 'linear')
        }
        continue
      }

      if (state.effectId === 'taptempodelay') {
        const delay = refs.delay as DelayNode | undefined
        const feedbackGain = refs.feedbackGain as GainNode | undefined
        if (delay && (didChange('tapTempo', 120) || didChange('subdivision', 1))) {
          smoothEffectParam(delay.delayTime, clamp(getSubdivisionSeconds(state.params.tapTempo ?? 120, state.params.subdivision ?? 1), 0.01, 2), 0.05, 'linear')
        }
        if (feedbackGain && didChange('feedback', 0.4)) {
          smoothEffectParam(feedbackGain.gain, clamp(state.params.feedback ?? 0.4, 0, 0.95), 0.015, 'linear')
        }
        continue
      }

      if (state.effectId === 'distortion') {
        const shaper = refs.shaper as WaveShaperNode | undefined
        const toneFilter = refs.toneFilter as BiquadFilterNode | undefined
        if (shaper && didChange('amount', 0.5)) {
          shaper.curve = buildDistortionCurve(clamp(state.params.amount ?? 0.5, 0, 1))
        }
        if (toneFilter && didChange('tone', 0.5)) {
          smoothEffectParam(toneFilter.frequency, 700 + clamp(state.params.tone ?? 0.5, 0, 1) * 7300, 0.025)
        }
        continue
      }

      if (state.effectId === 'bitcrusher') {
        const crusher = refs.crusher as BitcrusherProcessorNode | undefined
        if (crusher?._updateSettings && (didChange('bits', 8) || didChange('normalRange', 0.4))) {
          crusher._updateSettings(state.params.bits ?? 8, state.params.normalRange ?? 0.4)
        }
        continue
      }

      if (state.effectId === 'reverb') {
        const convolver = refs.convolver as ConvolverNode | undefined
        if (convolver && (didChange('roomSize', 0.7) || didChange('decay', 2))) {
          convolver.buffer = buildImpulseResponse(context, clamp(state.params.roomSize ?? 0.7, 0, 1), clamp(state.params.decay ?? 2, 0.2, 10))
        }
        continue
      }

      if (state.effectId === 'hallreverb') {
        const preDelay = refs.preDelay as DelayNode | undefined
        const convolver = refs.convolver as ConvolverNode | undefined
        const damping = refs.damping as BiquadFilterNode | undefined
        if (preDelay && didChange('preDelay', 0.03)) {
          smoothEffectParam(preDelay.delayTime, clamp(state.params.preDelay ?? 0.03, 0, 1), 0.03, 'linear')
        }
        if (convolver && (didChange('roomSize', 0.8) || didChange('decay', 4))) {
          convolver.buffer = buildImpulseResponse(context, clamp(state.params.roomSize ?? 0.8, 0, 1), clamp(state.params.decay ?? 4, 0.2, 10))
        }
        if (damping && didChange('damping', 6000)) {
          smoothEffectParam(damping.frequency, clamp(state.params.damping ?? 6000, 500, 12000), 0.03)
        }
        continue
      }

      if (state.effectId === 'compressor') {
        const compressor = refs.compressor as DynamicsCompressorNode | undefined
        if (!compressor) {
          continue
        }

        if (didChange('threshold', -24)) {
          smoothEffectParam(compressor.threshold, clamp(state.params.threshold ?? -24, -60, 0), 0.02, 'linear')
        }
        if (didChange('ratio', 4)) {
          smoothEffectParam(compressor.ratio, clamp(state.params.ratio ?? 4, 1, 20), 0.02, 'linear')
        }
        if (didChange('attack', 0.003)) {
          smoothEffectParam(compressor.attack, clamp(state.params.attack ?? 0.003, 0, 1), 0.02, 'linear')
        }
        continue
      }

      if (state.effectId === 'djeq') {
        const low = refs.low as BiquadFilterNode | undefined
        const mid = refs.mid as BiquadFilterNode | undefined
        const high = refs.high as BiquadFilterNode | undefined
        if (low && didChange('lowGain', 0)) {
          smoothEffectParam(low.gain, clamp(state.params.lowGain ?? 0, -15, 15), 0.02, 'linear')
        }
        if (mid && didChange('midGain', 0)) {
          smoothEffectParam(mid.gain, clamp(state.params.midGain ?? 0, -15, 15), 0.02, 'linear')
        }
        if (high && didChange('highGain', 0)) {
          smoothEffectParam(high.gain, clamp(state.params.highGain ?? 0, -15, 15), 0.02, 'linear')
        }
        continue
      }

      if (state.effectId === 'chorus' || state.effectId === 'vibrato' || state.effectId === 'pitchshifter') {
        const delay = refs.delay as DelayNode | undefined
        const lfo = refs.lfo as OscillatorNode | undefined
        const lfoGain = refs.lfoGain as GainNode | undefined
        if (!delay || !lfo || !lfoGain) {
          continue
        }

        if (didChange('type', 0)) {
          lfo.type = getLfoWaveform(state.params.type ?? 0)
        }
        if (didChange('rate', 1.2)) {
          smoothEffectParam(lfo.frequency, clamp(state.params.rate ?? 1.2, 0.1, 20), 0.02)
        }
        if (
          didChange('delay', 5) ||
          didChange('depth', 0.4) ||
          didChange('pitch', 0)
        ) {
          const baseDelay = state.effectId === 'pitchshifter'
            ? 0.02 + clamp(Math.abs(state.params.pitch ?? 0), 0, 12) * 0.0012
            : state.effectId === 'vibrato'
              ? 0.008
              : clamp((state.params.delay ?? 5) / 1000, 0.002, 0.03)
          const depth = state.effectId === 'pitchshifter'
            ? 0.001 + clamp(Math.abs(state.params.pitch ?? 0), 0, 12) * 0.0005
            : clamp(state.params.depth ?? 0.4, 0, 1) * 0.004
          smoothEffectParam(delay.delayTime, baseDelay, 0.03, 'linear')
          smoothEffectParam(lfoGain.gain, depth, 0.02, 'linear')
        }
        continue
      }

      if (state.effectId === 'flanger') {
        const lfo = refs.lfo as OscillatorNode | undefined
        const lfoGain = refs.lfoGain as GainNode | undefined
        const feedbackGain = refs.feedbackGain as GainNode | undefined
        if (lfo && didChange('rate', 0.5)) {
          smoothEffectParam(lfo.frequency, clamp(state.params.rate ?? 0.5, 0.1, 5), 0.02)
        }
        if (lfoGain && didChange('depth', 50)) {
          smoothEffectParam(lfoGain.gain, clamp((state.params.depth ?? 50) / 100, 0, 1) * 0.0045, 0.02, 'linear')
        }
        if (feedbackGain && didChange('feedback', 0.3)) {
          smoothEffectParam(feedbackGain.gain, clamp(state.params.feedback ?? 0.3, 0, 0.95), 0.015, 'linear')
        }
        continue
      }

      if (state.effectId === 'phaser') {
        const lfo = refs.lfo as OscillatorNode | undefined
        const lfoGain = refs.lfoGain as GainNode | undefined
        const feedbackGain = refs.feedbackGain as GainNode | undefined
        if (lfo && didChange('rate', 1)) {
          smoothEffectParam(lfo.frequency, clamp(state.params.rate ?? 1, 0.1, 5), 0.02)
        }
        if (lfoGain && didChange('depth', 0.4)) {
          smoothEffectParam(lfoGain.gain, 1200 * clamp(state.params.depth ?? 0.4, 0, 1), 0.02, 'linear')
        }
        if (feedbackGain && didChange('feedback', 0.7)) {
          smoothEffectParam(feedbackGain.gain, clamp(state.params.feedback ?? 0.7, 0, 0.9), 0.015, 'linear')
        }
        continue
      }

      if (state.effectId === 'combfilter') {
        const delay = refs.delay as DelayNode | undefined
        const feedbackGain = refs.feedbackGain as GainNode | undefined
        const feedforwardGain = refs.feedforwardGain as GainNode | undefined
        if (delay && didChange('delayTime', 0.01)) {
          smoothEffectParam(delay.delayTime, clamp(state.params.delayTime ?? 0.01, 0.001, 0.05), 0.03, 'linear')
        }
        if (feedbackGain && didChange('feedback', 0.95)) {
          smoothEffectParam(feedbackGain.gain, clamp(state.params.feedback ?? 0.95, 0, 0.98), 0.015, 'linear')
        }
        if (feedforwardGain && didChange('feedforward', 0.5)) {
          smoothEffectParam(feedforwardGain.gain, clamp(state.params.feedforward ?? 0.5, 0, 1), 0.015, 'linear')
        }
        continue
      }

      if (state.effectId === 'ringmodulator') {
        const carrier = refs.carrier as OscillatorNode | undefined
        const carrierGain = refs.carrierGain as GainNode | undefined
        if (carrier && didChange('waveform', 0)) {
          carrier.type = getLfoWaveform(state.params.waveform ?? 0)
        }
        if (carrier && didChange('carrierFreq', 200)) {
          smoothEffectParam(carrier.frequency, clamp(state.params.carrierFreq ?? 200, 10, 2000), 0.02)
        }
        if (carrierGain && didChange('mix', 50)) {
          smoothEffectParam(carrierGain.gain, clamp((state.params.mix ?? 50) / 100, 0, 1), 0.015, 'linear')
        }
        continue
      }

      if (state.effectId === 'tremolo' || state.effectId === 'sidechainpump' || state.effectId === 'loopchop') {
        const lfo = refs.lfo as OscillatorNode | undefined
        const lfoGain = refs.lfoGain as GainNode | undefined
        const offset = refs.offset as ConstantSourceNode | undefined
        if (!lfo || !lfoGain || !offset) {
          continue
        }

        const depth = state.effectId === 'loopchop'
          ? clamp(state.params.wet ?? 0.8, 0, 1)
          : clamp(state.params.depth ?? 0.8, 0, 1)
        const rate = state.effectId === 'tremolo'
          ? clamp(state.params.rate ?? 6, 0.1, 20)
          : state.effectId === 'sidechainpump'
            ? clamp(0.75 + (state.params.sensitivity ?? 0.1) * 12, 0.5, 8)
            : getLoopChopRate(state.params.loopSize ?? 2, state.params.stutterRate ?? 4)

        if (
          didChange('rate', 6) ||
          didChange('sensitivity', 0.1) ||
          didChange('loopSize', 2) ||
          didChange('stutterRate', 4)
        ) {
          smoothEffectParam(lfo.frequency, rate, 0.02)
        }
        if (state.effectId === 'loopchop' ? didChange('wet', 0.8) : didChange('depth', 0.8)) {
          smoothEffectParam(lfoGain.gain, depth / 2, 0.02, 'linear')
          smoothEffectParam(offset.offset, 1 - depth / 2, 0.02, 'linear')
        }
        continue
      }

      if (state.effectId === 'tapestop') {
        const delay = refs.delay as DelayNode | undefined
        const lowpass = refs.lowpass as BiquadFilterNode | undefined
        const lfo = refs.lfo as OscillatorNode | undefined
        if (delay && didChange('stopTime', 1)) {
          smoothEffectParam(delay.delayTime, 0.02 + clamp(state.params.stopTime ?? 1, 0.1, 3) * 0.015, 0.04, 'linear')
        }
        if (lowpass && didChange('restartTime', 0.5)) {
          smoothEffectParam(lowpass.frequency, 1800 + clamp(state.params.restartTime ?? 0.5, 0.1, 3) * 1800, 0.04)
        }
        if (lfo && didChange('mode', 2)) {
          const modeRate = [0.12, 0.2, 0.35][Math.max(0, Math.min(2, Math.round(state.params.mode ?? 2)))] ?? 0.35
          smoothEffectParam(lfo.frequency, modeRate, 0.04)
        }
        continue
      }

      if (state.effectId === 'lofitape') {
        const shaper = refs.shaper as WaveShaperNode | undefined
        const tone = refs.tone as BiquadFilterNode | undefined
        const lfo = refs.lfo as OscillatorNode | undefined
        const lfoGain = refs.lfoGain as GainNode | undefined
        const noiseGain = refs.noiseGain as GainNode | undefined
        if (shaper && didChange('saturation', 0.4)) {
          shaper.curve = buildDistortionCurve(clamp(state.params.saturation ?? 0.4, 0, 1))
        }
        if (tone && didChange('toneRolloff', 6000)) {
          smoothEffectParam(tone.frequency, clamp(state.params.toneRolloff ?? 6000, 500, 12000), 0.03)
        }
        if (lfo && didChange('flutterRate', 6)) {
          smoothEffectParam(lfo.frequency, clamp(state.params.flutterRate ?? 6, 0.1, 20), 0.02)
        }
        if (lfoGain && didChange('wowDepth', 0.3)) {
          smoothEffectParam(lfoGain.gain, clamp(state.params.wowDepth ?? 0.3, 0, 1) * 0.008, 0.02, 'linear')
        }
        if (noiseGain && didChange('noise', 0.1)) {
          smoothEffectParam(noiseGain.gain, clamp(state.params.noise ?? 0.1, 0, 1) * 0.05, 0.02, 'linear')
        }
      }
    }
  }, [bankEffects, masterEffect])

  const getAudioContext = () => {
    if (!audioContextRef.current) {
      pushDebug('getAudioContext: creating new AudioContext')
      const context = new window.AudioContext({ sampleRate: 44100 })
      const masterGain = context.createGain()
      const outputLimiter = context.createDynamicsCompressor()
      masterGain.gain.value = masterOutputGain
      outputLimiter.threshold.value = -1.5
      outputLimiter.knee.value = 4
      outputLimiter.ratio.value = 20
      outputLimiter.attack.value = 0.003
      outputLimiter.release.value = 0.12

      const masterEffectInput = context.createGain()
      masterEffectInput.gain.value = 1.0

      for (const bankId of bankIds) {
        const bankGain = context.createGain()
        bankGain.gain.value = getEffectiveBankGain(bankId, bankMixerGains, bankMixerMuted, bankMixerSoloed)

        const bankEffectInput = context.createGain()
        bankEffectInput.gain.value = 0.78

        const bankEffectOutput = context.createGain()
        bankEffectOutput.gain.value = 1.0

        bankGain.connect(bankEffectInput)
        bankEffectInput.connect(bankEffectOutput)
        bankEffectOutput.connect(masterEffectInput)

        bankGainNodesRef.current[bankId] = bankGain
        bankEffectInputsRef.current[bankId] = bankEffectInput
        bankEffectOutputsRef.current[bankId] = bankEffectOutput
      }

      masterEffectInput.connect(masterGain)
      masterGain.connect(outputLimiter)
      outputLimiter.connect(context.destination)

      audioContextRef.current = context
      masterEffectInputRef.current = masterEffectInput
      masterGainRef.current = masterGain
      outputLimiterRef.current = outputLimiter
      pushDebug('getAudioContext: created, state=' + context.state)
    }

    if (audioContextRef.current.state === 'suspended' || (audioContextRef.current.state as string) === 'interrupted') {
      pushDebug('getAudioContext: resuming from ' + audioContextRef.current.state)
      void audioContextRef.current.resume()
    }

    return audioContextRef.current
  }

  const loadAudioBuffer = async (audioUrl: string, fileLabel: string) => {
    const cachedBuffer = bufferMapRef.current.get(audioUrl)
    if (cachedBuffer) {
      return cachedBuffer
    }

    const context = getAudioContext()
    if (context.state === 'suspended' || (context.state as string) === 'interrupted') {
      context.resume().catch(() => {})
    }

    const response = await fetch(audioUrl)
    if (!response.ok) {
      throw new Error('Failed to fetch audio source: ' + fileLabel)
    }

    const audioData = await response.arrayBuffer()
    const buffer = await context.decodeAudioData(audioData.slice(0))
    bufferMapRef.current.set(audioUrl, buffer)
    setLoadedPadCount(bufferMapRef.current.size)
    return buffer
  }

  const loadPadBuffer = async (pad: Pad) => {
    return loadAudioBuffer(pad.sampleUrl, pad.sampleFile)
  }

  const ensureAudioEngine = async () => {
    pushDebug('ensureEngine: status=' + engineStatus)
    if (engineStatus === 'ready') {
      const context = getAudioContext()
      // Fire-and-forget: never await resume() — it can hang on iOS
      if (context.state === 'suspended' || (context.state as string) === 'interrupted') {
        pushDebug('ensureEngine: resuming (ready path), state=' + context.state)
        context.resume().catch(() => {})
      }
      return
    }

    if (loadPromiseRef.current) {
      pushDebug('ensureEngine: awaiting existing load')
      await loadPromiseRef.current
      const context = audioContextRef.current
      if (context && (context.state === 'suspended' || (context.state as string) === 'interrupted')) {
        context.resume().catch(() => {})
      }
      return
    }

    const loadTask = (async () => {
      try {
        setEngineStatus('loading')
        setLoadedPadCount(bufferMapRef.current.size)

        const context = getAudioContext()
        pushDebug('ensureEngine: ctx.state=' + context.state)
        // Fire-and-forget: decodeAudioData doesn't need a running context,
        // and await resume() hangs on iOS Chrome when the gesture context is lost.
        if (context.state === 'suspended' || (context.state as string) === 'interrupted') {
          pushDebug('ensureEngine: firing resume (no await)')
          context.resume().catch(() => {})
        }

        // Load current bank first so the user can start playing immediately
        pushDebug('ensureEngine: loading ' + currentBankPads.length + ' pads...')
        await Promise.all(currentBankPads.map((pad) => loadPadBuffer(pad)))
        pushDebug('ensureEngine: loaded, setting ready')
        setEngineStatus('ready')

        // Load remaining banks in the background
        const remainingPads = bankIds
          .filter((id) => id !== currentBankId)
          .flatMap((id) => bankStates[id].pads)
          .filter((pad) => !bufferMapRef.current.has(pad.sampleUrl))
        for (const pad of remainingPads) {
          loadPadBuffer(pad).catch(() => {})
        }
      } catch (error) {
        pushDebug('ensureEngine: ERROR: ' + (error instanceof Error ? error.message : String(error)))
        console.error(error)
        bufferMapRef.current.clear()
        reversedBufferMapRef.current.clear()
        setLoadedPadCount(0)
        setEngineStatus('error')
      } finally {
        loadPromiseRef.current = null
      }
    })()

    loadPromiseRef.current = loadTask
    await loadTask
  }

  const getPlaybackBuffer = async (pad: Pad, reversed: boolean) => {
    const sourceBuffer = await loadPadBuffer(pad)

    if (!reversed) {
      return sourceBuffer
    }

    const cachedReversedBuffer = reversedBufferMapRef.current.get(pad.sampleUrl)
    if (cachedReversedBuffer) {
      return cachedReversedBuffer
    }

    const context = getAudioContext()
    const reversedBuffer = createReversedBuffer(context, sourceBuffer)
    reversedBufferMapRef.current.set(pad.sampleUrl, reversedBuffer)
    return reversedBuffer
  }

  const renderCurrentEditorAudioAsset = async () => {
    if (editorSource === 'loop' && generatedLoop) {
      const response = await fetch(generatedLoop.sampleUrl)
      if (!response.ok) {
        throw new Error('Loop export failed.')
      }

      return {
        blob: await response.blob(),
        fileName: generatedLoop.sampleFile,
        durationSeconds: getLoopDurationSeconds(generatedLoop),
      }
    }

    await ensureAudioEngine()

    const sampleBuffer = await getPlaybackBuffer(selectedPad, selectedPadSettings.reversed)
    const { startTime, playbackDuration, playbackRate } = getPadPlaybackWindow(sampleBuffer, selectedPadSettings)
    const renderedDurationSeconds = Math.max(0.01, playbackDuration / playbackRate)
    const outputChannels = Math.min(2, Math.max(sampleBuffer.numberOfChannels, Math.abs(selectedPadSettings.pan) > 0.001 ? 2 : 1))
    const frameCount = Math.max(1, Math.ceil(renderedDurationSeconds * sampleBuffer.sampleRate) + Math.ceil(sampleBuffer.sampleRate * 0.02))
    const offlineContext = new OfflineAudioContext(outputChannels, frameCount, sampleBuffer.sampleRate)
    const source = offlineContext.createBufferSource()
    const gainNode = offlineContext.createGain()
    const pannerNode = typeof offlineContext.createStereoPanner === 'function' ? offlineContext.createStereoPanner() : null

    source.buffer = sampleBuffer
    source.playbackRate.value = playbackRate
    gainNode.gain.value = selectedPadSettings.gain

    source.connect(gainNode)

    if (pannerNode) {
      pannerNode.pan.value = selectedPadSettings.pan
      gainNode.connect(pannerNode)
      pannerNode.connect(offlineContext.destination)
    } else {
      gainNode.connect(offlineContext.destination)
    }

    source.start(0, startTime, playbackDuration)

    const renderedBuffer = await offlineContext.startRendering()
    return {
      blob: encodeWavBlob(renderedBuffer),
      fileName: [
        'bank-' + currentBankId.toLowerCase(),
        sanitizeDownloadName(selectedPad.label),
        sanitizeDownloadName(selectedPad.sampleName),
      ].join('-') + '.wav',
      durationSeconds: renderedBuffer.duration,
    }
  }

  const exportCurrentEditorAudio = async () => {
    setIsExportingSample(true)

    try {
      const renderedAsset = await renderCurrentEditorAudioAsset()
      triggerBlobDownload(renderedAsset.blob, renderedAsset.fileName)
    } catch (error) {
      console.error('Editor export failed.', error)
    } finally {
      setIsExportingSample(false)
    }
  }

  const renderSequenceClipAsset = async () => {
    const audibleBanks = bankIds.flatMap((bankId) => {
      const bankState = bankStates[bankId]
      const bankGain = getEffectiveBankGain(bankId, bankMixerGains, bankMixerMuted, bankMixerSoloed)

      if (!bankState || bankGain <= 0.0001) {
        return []
      }

      return [{ bankId, bankState, bankGain }]
    })

    if (audibleBanks.length === 0) {
      throw new Error('Unmute at least one bank before exporting the sequence.')
    }

    const scheduledPads = audibleBanks.flatMap(({ bankId, bankState, bankGain }) => {
      const seq = getActiveSequence(bankState)
      return bankState.pads.flatMap((pad) => {
        const steps = seq.stepPattern[pad.id] ?? []
        const stepSemitoneOffsets = seq.stepSemitoneOffsets[pad.id] ?? []
        const playbackSettings = bankState.playbackSettings[pad.id]

        if (!playbackSettings || seq.sequenceMuted[pad.id] || !steps.some(Boolean)) {
          return []
        }

        return [{
          bankId,
          bankGain,
          pad,
          playbackSettings,
          steps,
          stepSemitoneOffsets,
          sequenceLength: seq.sequenceLength,
        }]
      })
    })

    if (scheduledPads.length === 0) {
      throw new Error('Program at least one audible step before exporting the sequence.')
    }

    await ensureAudioEngine()

    const playbackBuffers = new Map<string, AudioBuffer>()

    await Promise.all(scheduledPads.map(async ({ bankId, pad, playbackSettings }) => {
      const bufferKey = `${bankId}:${pad.id}`
      playbackBuffers.set(bufferKey, await getPlaybackBuffer(pad, playbackSettings.reversed))
    }))

    const stepDurationSeconds = 60 / Math.max(40, sequenceTempo) / 4
    const exportStepCount = scheduledPads.reduce((max, scheduledPad) => Math.max(max, scheduledPad.sequenceLength), 0)
    const scheduledBankIds = Array.from(new Set(scheduledPads.map(({ bankId }) => bankId))) as BankId[]
    const scheduledHits: Array<{
      bankId: BankId
      buffer: AudioBuffer
      when: number
      startTime: number
      playbackDuration: number
      playbackRate: number
      gain: number
      pan: number
    }> = []
    let latestSourceEnd = 0

    for (let stepIndex = 0; stepIndex < exportStepCount; stepIndex += 1) {
      const when = stepIndex * stepDurationSeconds

      for (const scheduledPad of scheduledPads) {
        const bankStepIndex = stepIndex % scheduledPad.sequenceLength

        if (!scheduledPad.steps[bankStepIndex]) {
          continue
        }

        const sampleBuffer = playbackBuffers.get(`${scheduledPad.bankId}:${scheduledPad.pad.id}`)
        if (!sampleBuffer) {
          continue
        }

        const stepSemitoneOffset = scheduledPad.stepSemitoneOffsets[bankStepIndex] ?? 0
        const { startTime, playbackDuration, playbackRate } = getPadPlaybackWindow(
          sampleBuffer,
          scheduledPad.playbackSettings,
          scheduledPad.playbackSettings.semitoneOffset + stepSemitoneOffset,
        )

        scheduledHits.push({
          bankId: scheduledPad.bankId,
          buffer: sampleBuffer,
          when,
          startTime,
          playbackDuration,
          playbackRate,
          gain: scheduledPad.playbackSettings.gain,
          pan: scheduledPad.playbackSettings.pan,
        })

        latestSourceEnd = Math.max(latestSourceEnd, when + playbackDuration / playbackRate)
      }
    }

    if (scheduledHits.length === 0) {
      throw new Error('Program at least one audible step before exporting the sequence.')
    }

    const firstLoadedBuffer = playbackBuffers.values().next().value as AudioBuffer | undefined
    const sampleRate = audioContextRef.current?.sampleRate ?? firstLoadedBuffer?.sampleRate ?? 44100
    const bankTails = bankIds.map((bankId) => {
      const chain = bankEffects[bankId]
      return getEffectTailPaddingSeconds(chain.effectId, chain.params, chain.enabled, supportedGlobalEffectIds.has(chain.effectId))
    })
    const masterTail = getEffectTailPaddingSeconds(masterEffect.effectId, masterEffect.params, masterEffect.enabled, supportedGlobalEffectIds.has(masterEffect.effectId))
    const effectTailPaddingSeconds = Math.max(...bankTails, 0) + masterTail
    const renderedDurationSeconds = Math.max(exportStepCount * stepDurationSeconds, latestSourceEnd) + effectTailPaddingSeconds
    const frameCount = Math.max(1, Math.ceil(renderedDurationSeconds * sampleRate) + Math.ceil(sampleRate * 0.02))
    const offlineContext = new OfflineAudioContext(2, frameCount, sampleRate)
    const masterGain = offlineContext.createGain()
    const outputLimiter = offlineContext.createDynamicsCompressor()

    masterGain.gain.value = masterOutputGain
    outputLimiter.threshold.value = -1.5
    outputLimiter.knee.value = 4
    outputLimiter.ratio.value = 20
    outputLimiter.attack.value = 0.003
    outputLimiter.release.value = 0.12

    const offlineMasterEffectInput = offlineContext.createGain()
    offlineMasterEffectInput.gain.value = 1.0

    const offlineBankGainNodes = {} as Partial<Record<BankId, GainNode>>
    const offlineBankEffectInputs = {} as Partial<Record<BankId, GainNode>>
    const offlineBankEffectOutputs = {} as Partial<Record<BankId, GainNode>>

    for (const { bankId, bankGain } of audibleBanks) {
      const bankGainNode = offlineContext.createGain()
      bankGainNode.gain.value = bankGain

      const bankEffectInput = offlineContext.createGain()
      bankEffectInput.gain.value = 0.78

      const bankEffectOutput = offlineContext.createGain()
      bankEffectOutput.gain.value = 1.0

      bankGainNode.connect(bankEffectInput)
      bankEffectInput.connect(bankEffectOutput)
      bankEffectOutput.connect(offlineMasterEffectInput)

      offlineBankGainNodes[bankId] = bankGainNode
      offlineBankEffectInputs[bankId] = bankEffectInput
      offlineBankEffectOutputs[bankId] = bankEffectOutput
    }

    offlineMasterEffectInput.connect(masterGain)
    masterGain.connect(outputLimiter)
    outputLimiter.connect(offlineContext.destination)

    const effectCleanups: Array<() => void> = []
    let effectUsed = false
    let effectFallback = false

    try {
      // Apply per-bank effect chains
      for (const { bankId } of audibleBanks) {
        const bankChain = bankEffects[bankId]
        const bankInput = offlineBankEffectInputs[bankId]!
        const bankOutput = offlineBankEffectOutputs[bankId]!
        const isBankEffectSupported = supportedGlobalEffectIds.has(bankChain.effectId)

        try {
          const routing = createGlobalEffectRouting({
            context: offlineContext,
            effectInput: bankInput,
            masterGain: bankOutput,
            effectId: bankChain.effectId,
            effectEnabled: bankChain.enabled,
            isEffectSupported: isBankEffectSupported,
            effectParams: bankChain.params,
          })
          effectCleanups.push(routing.cleanup)
          if (bankChain.enabled && isBankEffectSupported) effectUsed = true
        } catch (error) {
          console.error(`Offline bank ${bankId} effect render failed. Exporting that bank dry.`, error)
          if (bankChain.enabled && isBankEffectSupported) effectFallback = true
          try { bankInput.disconnect() } catch {}
          bankInput.connect(bankOutput)
        }
      }

      // Apply master effect chain
      const isMasterEffectSupported = supportedGlobalEffectIds.has(masterEffect.effectId)
      try {
        const routing = createGlobalEffectRouting({
          context: offlineContext,
          effectInput: offlineMasterEffectInput,
          masterGain,
          effectId: masterEffect.effectId,
          effectEnabled: masterEffect.enabled,
          isEffectSupported: isMasterEffectSupported,
          effectParams: masterEffect.params,
        })
        effectCleanups.push(routing.cleanup)
        if (masterEffect.enabled && isMasterEffectSupported) effectUsed = true
      } catch (error) {
        console.error('Offline master effect render failed. Exporting master dry.', error)
        if (masterEffect.enabled && isMasterEffectSupported) effectFallback = true
        try { offlineMasterEffectInput.disconnect() } catch {}
        offlineMasterEffectInput.connect(masterGain)
      }

      for (const scheduledHit of scheduledHits) {
        const bankGainNode = offlineBankGainNodes[scheduledHit.bankId]

        if (!bankGainNode) {
          continue
        }

        const source = offlineContext.createBufferSource()
        const gainNode = offlineContext.createGain()
        const pannerNode = typeof offlineContext.createStereoPanner === 'function' ? offlineContext.createStereoPanner() : null

        source.buffer = scheduledHit.buffer
        source.playbackRate.value = scheduledHit.playbackRate
        gainNode.gain.value = scheduledHit.gain
        source.connect(gainNode)

        if (pannerNode) {
          pannerNode.pan.value = scheduledHit.pan
          gainNode.connect(pannerNode)
          pannerNode.connect(bankGainNode)
        } else {
          gainNode.connect(bankGainNode)
        }

        source.start(scheduledHit.when, scheduledHit.startTime, scheduledHit.playbackDuration)
      }

      const renderedBuffer = await offlineContext.startRendering()

      return {
        blob: encodeWavBlob(renderedBuffer),
        fileName: `sequence-clip-${Math.round(sequenceTempo)}bpm-${exportStepCount}steps.wav`,
        durationSeconds: renderedBuffer.duration,
        stepCount: exportStepCount,
        bankCount: scheduledBankIds.length,
        effectUsed,
        effectFallback,
      }
    } finally {
      for (const cleanup of effectCleanups) {
        cleanup()
      }
    }
  }

  // -----------------------------------------------------------------------
  // Project snapshot — serialize / restore
  // -----------------------------------------------------------------------

  const applySnapshot = (project: DeserializedProject) => {
    setCurrentBankId(project.activeBankId)
    setBankStates(project.bankStates)
    setBankMixerGains(project.bankMixerGains)
    setBankMixerMuted(project.bankMixerMuted)
    setBankMixerSoloed(project.bankMixerSoloed)
    setMasterOutputGain(project.masterOutputGain)
    setBankEffects(project.bankEffects)
    setMasterEffect(project.masterEffect)
    setSequenceTempo(project.sequenceTempo)
    setIsChromaticModeActive(project.isChromaticModeActive)
    setChromaticOctave(project.chromaticOctave)
    setIsArpEnabled(project.isArpEnabled)
    setIsArpLatched(project.isArpLatched)
    setArpDivision(project.arpDivision)
    setArpMode(project.arpMode)
    setIsDarkMode(project.isDarkMode)
  }

  const getSerializeInput = useCallback(() => ({
    activeBankId: currentBankId,
    bankStates,
    bankMixerGains,
    bankMixerMuted,
    bankMixerSoloed,
    masterOutputGain,
    bankEffects,
    masterEffect,
    sequenceTempo,
    isChromaticModeActive,
    chromaticOctave,
    isArpEnabled,
    isArpLatched,
    arpDivision,
    arpMode,
    isDarkMode,
  }), [
    currentBankId, bankStates, bankMixerGains, bankMixerMuted, bankMixerSoloed,
    masterOutputGain, bankEffects, masterEffect, sequenceTempo,
    isChromaticModeActive, chromaticOctave, isArpEnabled, isArpLatched,
    arpDivision, arpMode, isDarkMode,
  ])

  const {
    shareStatus, shareUrl: _shareUrl, shareError: _shareError,
    isLoadingShare, loadedFromShare: _loadedFromShare,
    startShare, dismissShare,
  } = useShare(getSerializeInput, applySnapshot)

  const [isExportingKit, setIsExportingKit] = useState(false)

  const exportKit = async () => {
    if (isExportingKit) return

    try {
      setIsExportingKit(true)
      await ensureAudioEngine()

      const context = getAudioContext()
      const zip = new JSZip()
      const bankLabel = `Bank-${currentBankId}`

      for (const pad of currentBankPads) {
        try {
          const response = await fetch(pad.sampleUrl)
          if (!response.ok) continue

          const arrayBuffer = await response.arrayBuffer()
          const decoded = await context.decodeAudioData(arrayBuffer.slice(0))
          const settings = currentBankState.playbackSettings[pad.id]
          const startFraction = settings?.startFraction ?? 0
          const endFraction = settings?.endFraction ?? 1

          let exportBuffer = decoded
          if (startFraction > 0 || endFraction < 1) {
            const startSample = Math.floor(startFraction * decoded.length)
            const endSample = Math.floor(endFraction * decoded.length)
            const sliceLength = Math.max(1, endSample - startSample)
            const sliced = context.createBuffer(decoded.numberOfChannels, sliceLength, decoded.sampleRate)
            for (let ch = 0; ch < decoded.numberOfChannels; ch++) {
              sliced.getChannelData(ch).set(decoded.getChannelData(ch).subarray(startSample, endSample))
            }
            exportBuffer = sliced
          }

          const wavBlob = encodeWavBlob(exportBuffer)
          const fileName = `${pad.label.replace(/\s+/g, '-')}_${sanitizeDownloadName(pad.sampleName)}.wav`
          zip.file(fileName, wavBlob)
        } catch {
          // skip pads that fail to decode
        }
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' })
      triggerBlobDownload(zipBlob, `${bankLabel}-Kit.zip`)
    } catch {
      // export failed silently
    } finally {
      setIsExportingKit(false)
    }
  }

  const exportSequenceClip = async () => {
    setIsExportingSequence(true)
    setSequenceExportMessage('Rendering the full sequence to a WAV clip...')

    try {
      const renderedAsset = await renderSequenceClipAsset()
      const bankLabel = `${renderedAsset.bankCount} bank${renderedAsset.bankCount === 1 ? '' : 's'}`

      triggerBlobDownload(renderedAsset.blob, renderedAsset.fileName)

      if (renderedAsset.effectFallback) {
        setSequenceExportMessage(`Exported a ${renderedAsset.stepCount}-step clip from ${bankLabel}. FX fell back to a dry render this time.`)
      } else if (renderedAsset.effectUsed) {
        setSequenceExportMessage(`Exported a ${renderedAsset.stepCount}-step clip from ${bankLabel} with the current FX chain.`)
      } else {
        setSequenceExportMessage(`Exported a ${renderedAsset.stepCount}-step clip from ${bankLabel}.`)
      }
    } catch (error) {
      console.error('Sequence export failed.', error)
      setSequenceExportMessage(error instanceof Error ? error.message : 'Sequence export failed.')
    } finally {
      setIsExportingSequence(false)
    }
  }

  const transformCurrentEditorAudio = async () => {
    const nextPrompt = editorTransformPrompt.trim()

    if (!currentEditorAudioUrl || !nextPrompt) {
      return
    }

    if (nextPrompt.length < 20) {
      setGenerationMessage('Give ElevenLabs a more descriptive transform prompt with at least 20 characters.')
      return
    }

    try {
      setIsTransformingEditorAudio(true)

      const renderedAsset = await renderCurrentEditorAudioAsset()
      const audioBase64 = await blobToBase64(renderedAsset.blob)
      const response = await fetch('/api/transform-sample', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: nextPrompt,
          sampleName: currentEditorSampleName,
          sampleFile: renderedAsset.fileName,
          editorSource,
          audioBase64,
          mimeType: renderedAsset.blob.type || 'audio/wav',
        }),
      })

      const payload = (await response.json()) as {
        error?: string
        summary?: string
        transformedSample?: EditorTransformResponse['transformedSample'] & { audioBase64?: string }
      }

      if (!response.ok || !payload.transformedSample) {
        throw new Error(payload.error || 'ElevenLabs transformation failed.')
      }

      const transformedSample = payload.transformedSample

      if (transformedSample.audioBase64) {
        transformedSample.sampleUrl = createEphemeralAudioUrl(base64ToBlob(transformedSample.audioBase64))
        transformedSample.audioBase64 = undefined
      }

      if (editorSource === 'loop' && generatedLoop) {
        const durationSeconds = Math.max(0.01, await loadAudioDurationFromUrl(transformedSample.sampleUrl))
        preservedLoopChopRegionsRef.current = loopChopRegions
        preservedSelectedChopIdRef.current = selectedChopId

        stopLoopPlayback()
        setGeneratedLoop({
          sampleName: transformedSample.sampleName,
          sampleFile: transformedSample.sampleFile,
          sampleUrl: transformedSample.sampleUrl,
          durationLabel: `${durationSeconds.toFixed(2)}s transformed`,
          durationSeconds,
          bpm: generatedLoop.bpm,
          sourceType: transformedSample.sourceType,
        })
      } else {
        stopAllPadSources()
        setActivePadIds([])
        setEditorPlayheadFraction(null)

        updateCurrentBank((bank) => ({
          ...bank,
          pads: bank.pads.map((pad) => (
            pad.id === selectedPad.id
              ? {
                  ...pad,
                  sampleName: transformedSample.sampleName,
                  sampleFile: transformedSample.sampleFile,
                  sampleUrl: transformedSample.sampleUrl,
                  sourceType: transformedSample.sourceType,
                  durationLabel: 'ElevenLabs transformed',
                }
              : pad
          )),
          playbackSettings: {
            ...bank.playbackSettings,
            [selectedPad.id]: {
              ...bank.playbackSettings[selectedPad.id],
              startFraction: 0,
              endFraction: 1,
              reversed: false,
            },
          },
        }))
      }

      setEditorTransformPrompt('')
      setGenerationMessage(payload.summary || `Loaded a transformed version of ${currentEditorSampleName} into the editor.`)
    } catch (error) {
      console.error('Editor transform failed.', error)
      setGenerationMessage(error instanceof Error ? error.message : 'Editor transform failed.')
    } finally {
      setIsTransformingEditorAudio(false)
    }
  }

  const startMicRecording = async () => {
    if (!micRecordingSupported || micCaptureState === 'recording' || micCaptureState === 'requesting' || micCaptureState === 'processing') {
      return
    }

    let stream: MediaStream | null = null

    try {
      setMicCaptureState('requesting')
      setMicCaptureMessage('Requesting microphone access from the browser.')

      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const preferredMimeType = getPreferredRecordingMimeType()
      const recorder = preferredMimeType ? new MediaRecorder(stream, { mimeType: preferredMimeType }) : new MediaRecorder(stream)

      stopMicStream()
      micStreamRef.current = stream
      mediaRecorderRef.current = recorder
      recordedChunksRef.current = []

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordedChunksRef.current.push(event.data)
        }
      }

      recorder.onstop = () => {
        const capturedChunks = recordedChunksRef.current.slice()
        const captureMimeType = recorder.mimeType || recordedChunksRef.current[0]?.type || 'audio/webm'

        recordedChunksRef.current = []
        mediaRecorderRef.current = null
        clearRecordingTimer()
        recordingStartedAtRef.current = null
        stopMicStream()

        if (capturedChunks.length === 0) {
          setMicCaptureState('error')
          setMicCaptureMessage('No audio was captured. Try another take.')
          return
        }

        void (async () => {
          const blob = new Blob(capturedChunks, { type: captureMimeType })
          const previewUrl = createEphemeralAudioUrl(blob)
          const durationSeconds = Math.max(0.01, await loadAudioDurationFromUrl(previewUrl))
          const createdAt = Date.now()
          const sampleFile = `${createdAt}-mic-take.${getRecordingFileExtension(captureMimeType)}`
          const sampleName = `Mic Take ${new Date(createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })}`

          setRecordedTake({
            blob,
            previewUrl,
            sampleName,
            sampleFile,
            durationSeconds,
            createdAt,
          })
          setMicCaptureState('ready')
          setMicCaptureMessage('Captured a raw take. Assign it to the selected pad or open it in the editor for chopping.')
          setRecordingElapsedMs(0)
        })()
      }

      recorder.onerror = () => {
        clearRecordingTimer()
        recordingStartedAtRef.current = null
        mediaRecorderRef.current = null
        stopMicStream()
        setMicCaptureState('error')
        setMicCaptureMessage('Recording failed. Try another take.')
      }

      recorder.start()
      recordingStartedAtRef.current = performance.now()
      setRecordingElapsedMs(0)
      clearRecordingTimer()
      recordingTimerRef.current = window.setInterval(() => {
        if (recordingStartedAtRef.current !== null) {
          setRecordingElapsedMs(performance.now() - recordingStartedAtRef.current)
        }
      }, 120)
      setMicCaptureState('recording')
      setMicCaptureMessage('Recording from the default microphone. Stop when the take feels right.')
    } catch (error) {
      clearRecordingTimer()
      recordingStartedAtRef.current = null
      mediaRecorderRef.current = null
      stream?.getTracks().forEach((track) => track.stop())
      stopMicStream()
      setMicCaptureState('error')
      setMicCaptureMessage(
        error instanceof Error && /denied|permission/i.test(error.message)
          ? 'Microphone access was denied. Allow it in the browser and try again.'
          : 'Microphone capture failed. Check your browser permissions and input device.',
      )
    }
  }

  const stopMicRecording = () => {
    const recorder = mediaRecorderRef.current
    if (!recorder || recorder.state === 'inactive') {
      return
    }

    setMicCaptureState('processing')
    setMicCaptureMessage('Finalizing the take...')
    recorder.stop()
  }

  const toggleMicTakePreview = () => {
    const audio = micTakeAudioRef.current
    if (!audio) return
    if (audio.paused) {
      void audio.play()
    } else {
      audio.pause()
      audio.currentTime = 0
    }
  }

  const [isNormalizingTake, setIsNormalizingTake] = useState(false)

  const normalizeRecordedTake = async () => {
    if (!recordedTake || isNormalizingTake) return

    try {
      setIsNormalizingTake(true)
      const context = getAudioContext()
      const arrayBuffer = await recordedTake.blob.arrayBuffer()
      const decoded = await context.decodeAudioData(arrayBuffer.slice(0))

      let peak = 0
      for (let ch = 0; ch < decoded.numberOfChannels; ch++) {
        const data = decoded.getChannelData(ch)
        for (let i = 0; i < data.length; i++) {
          peak = Math.max(peak, Math.abs(data[i]))
        }
      }

      if (peak <= 0.0001) {
        setIsNormalizingTake(false)
        return
      }

      const gain = 0.98 / peak
      const normalized = context.createBuffer(decoded.numberOfChannels, decoded.length, decoded.sampleRate)
      for (let ch = 0; ch < decoded.numberOfChannels; ch++) {
        const src = decoded.getChannelData(ch)
        const dst = normalized.getChannelData(ch)
        for (let i = 0; i < src.length; i++) {
          dst[i] = Math.max(-1, Math.min(1, src[i] * gain))
        }
      }

      const blob = encodeWavBlob(normalized)
      const previewUrl = createEphemeralAudioUrl(blob)

      setRecordedTake({
        ...recordedTake,
        blob,
        previewUrl,
      })
      setMicCaptureMessage('Normalized the recorded take.')
    } catch {
      setMicCaptureMessage('Failed to normalize the take.')
    } finally {
      setIsNormalizingTake(false)
    }
  }

  const clearRecordedTake = () => {
    if (micCaptureState === 'recording' || micCaptureState === 'processing') {
      return
    }

    setRecordedTake(null)
    setMicCaptureState('idle')
    setMicCaptureMessage('Capture a raw take from your microphone, then load it into a pad or the editor.')
  }

  const assignRecordedTakeToSelectedPad = () => {
    if (!recordedTake) {
      return
    }

    const assignedUrl = createEphemeralAudioUrl(recordedTake.blob)

    stopAllPadSources()
    setActivePadIds([])
    setEditorPlayheadFraction(null)

    updateCurrentBank((bank) => ({
      ...bank,
      pads: bank.pads.map((pad) => (
        pad.id === selectedPad.id
          ? {
              ...pad,
              sampleName: recordedTake.sampleName,
              sampleFile: recordedTake.sampleFile,
              sampleUrl: assignedUrl,
              sourceType: 'uploaded',
              durationLabel: `${recordedTake.durationSeconds.toFixed(2)}s recorded`,
              gain: 1,
            }
          : pad
      )),
      playbackSettings: {
        ...bank.playbackSettings,
        [selectedPad.id]: {
          startFraction: 0,
          endFraction: 1,
          semitoneOffset: 0,
          gain: 1,
          pan: 0,
          playbackMode: 'one-shot',
          reversed: false,
        },
      },
      selectedPadId: selectedPad.id,
    }))

    workViewDirectionRef.current = 'expand'
    setWorkView('editor')
    setEditorSource('pad')
    setMicCaptureMessage(`Loaded the take into ${selectedPad.label}. You can trim or play it from the pad now.`)
  }

  const openRecordedTakeInEditor = () => {
    if (!recordedTake) {
      return
    }

    const loopUrl = createEphemeralAudioUrl(recordedTake.blob)

    stopLoopPlayback()
    setGeneratedLoop({
      sampleName: recordedTake.sampleName,
      sampleFile: recordedTake.sampleFile,
      sampleUrl: loopUrl,
      durationLabel: `${recordedTake.durationSeconds.toFixed(2)}s recorded`,
      durationSeconds: recordedTake.durationSeconds,
      bpm: sequenceTempo,
      sourceType: 'uploaded',
    })
    workViewDirectionRef.current = 'expand'
    setWorkView('editor')
    setEditorSource('loop')
    setIsLoopPlaying(false)
    setMicCaptureMessage('Loaded the take into the editor. You can audition and chop it from there.')
  }

  const clearMetronomeSources = () => {
    for (const source of scheduledMetronomeSourcesRef.current) {
      source.onended = null

      try {
        source.stop()
      } catch {}

      try {
        source.disconnect()
      } catch {}
    }

    scheduledMetronomeSourcesRef.current.clear()
  }

  const playMetronomeClick = useEffectEvent((when: number, isDownbeat: boolean) => {
    const context = audioContextRef.current
    const masterGain = masterGainRef.current
    if (!context || !masterGain) {
      return
    }

    const source = context.createOscillator()
    const toneFilter = context.createBiquadFilter()
    const gainNode = context.createGain()

    source.type = isDownbeat ? 'square' : 'triangle'
    source.frequency.setValueAtTime(isDownbeat ? 1760 : 1320, when)
    toneFilter.type = 'highpass'
    toneFilter.frequency.setValueAtTime(isDownbeat ? 1400 : 1050, when)
    gainNode.gain.setValueAtTime(0.0001, when)
    gainNode.gain.exponentialRampToValueAtTime(isDownbeat ? 0.15 : 0.09, when + 0.002)
    gainNode.gain.exponentialRampToValueAtTime(0.0001, when + 0.05)

    source.connect(toneFilter)
    toneFilter.connect(gainNode)
    gainNode.connect(masterGain)

    scheduledMetronomeSourcesRef.current.add(source)
    source.onended = () => {
      scheduledMetronomeSourcesRef.current.delete(source)

      try {
        source.disconnect()
      } catch {}

      try {
        toneFilter.disconnect()
      } catch {}

      try {
        gainNode.disconnect()
      } catch {}
    }

    source.start(when)
    source.stop(when + 0.06)
  })

  const playPadAudio = useEffectEvent(async (padId: string, options?: { when?: number; fromSequence?: boolean; bankId?: BankId; sequenceSemitoneOffset?: number; sequenceGateDuration?: number }) => {
    pushDebug('playPad: ' + padId)
    await ensureAudioEngine()
    pushDebug('playPad: engine ready')

    const context = audioContextRef.current
    const scheduledWhen = options?.when
    const fromSequence = options?.fromSequence ?? false
    const targetBankId = options?.bankId ?? currentBankIdRef.current
    const sequenceSemitoneOffset = options?.sequenceSemitoneOffset ?? 0
    const targetBankState = bankStatesRef.current[targetBankId]
    const currentPad = targetBankState?.pads.find((pad) => pad.id === padId)
    const playbackSettings = targetBankState?.playbackSettings[padId]
    const sampleBuffer = currentPad && playbackSettings ? await getPlaybackBuffer(currentPad, playbackSettings.reversed) : undefined

    const bankGainNode = bankGainNodesRef.current[targetBankId]

    if (!context || !sampleBuffer || !playbackSettings || !currentPad || !bankGainNode) {
      pushDebug('playPad: BAIL ctx=' + !!context + ' buf=' + !!sampleBuffer + ' settings=' + !!playbackSettings + ' pad=' + !!currentPad + ' gain=' + !!bankGainNode)
      return
    }

    const appliedSemitoneOffset = playbackSettings.semitoneOffset + sequenceSemitoneOffset
    const { startTime, endTime, playbackDuration, playbackRate } = getPadPlaybackWindow(sampleBuffer, playbackSettings, appliedSemitoneOffset)
    const playbackMode = playbackSettings.playbackMode ?? 'one-shot'
    const isLoopingMode = playbackMode === 'loop' || playbackMode === 'gate-loop'
    const isGateMode = playbackMode === 'gate' || playbackMode === 'gate-loop'

    // Manual loop toggle: tap to start, tap again to stop
    if (!fromSequence && playbackMode === 'loop' && activePadSourcesRef.current.has(padId)) {
      stopPadSource(padId)
      return
    }

    // Retrigger: stop any existing source for this pad
    if (activePadSourcesRef.current.has(padId)) {
      stopPadSource(padId)
    }

    const source = context.createBufferSource()
    const gainNode = context.createGain()
    const pannerNode = typeof context.createStereoPanner === 'function' ? context.createStereoPanner() : null

    source.buffer = sampleBuffer
    source.playbackRate.value = playbackRate
    source.loop = isLoopingMode
    gainNode.gain.value = playbackSettings.gain
    if (pannerNode) {
      pannerNode.pan.value = playbackSettings.pan
    }

    const renderedDurationMs = (playbackDuration / playbackRate) * 1000

    source.connect(gainNode)
    if (pannerNode) {
      gainNode.connect(pannerNode)
      pannerNode.connect(bankGainNode)
    } else {
      gainNode.connect(bankGainNode)
    }

    if (isLoopingMode) {
      source.loopStart = startTime
      source.loopEnd = endTime
    }

    // Track source for retrigger and cleanup
    activePadSourcesRef.current.set(padId, { source, gainNode, pannerNode })
    if (isLoopingMode && !fromSequence) {
      setActivePadIds((current) => (current.includes(padId) ? current : current.concat(padId)))
    }

    source.onended = () => {
      activePadSourcesRef.current.delete(padId)
      if (!fromSequence) {
        setActivePadIds((current) => current.filter((currentPadId) => currentPadId !== padId))
        clearPadPlayhead(padId)
      }
    }

    if (isLoopingMode) {
      source.start(scheduledWhen ?? 0, startTime)
    } else {
      source.start(scheduledWhen ?? 0, startTime, playbackDuration)
    }
    pushDebug('playPad: STARTED ctx.state=' + context.state + ' gain=' + gainNode.gain.value.toFixed(2) + ' rate=' + source.playbackRate.value.toFixed(2))

    // For sequence gate modes, schedule stop after one step duration
    if (fromSequence && isGateMode && options?.sequenceGateDuration) {
      source.stop((scheduledWhen ?? context.currentTime) + options.sequenceGateDuration)
    }

    if (!fromSequence) {
      startPlayheadAnimation(
        padId,
        playbackSettings.reversed ? playbackSettings.endFraction : playbackSettings.startFraction,
        playbackSettings.reversed ? playbackSettings.startFraction : playbackSettings.endFraction,
        renderedDurationMs,
        { loop: isLoopingMode },
      )
    }

    if (playbackMode === 'gate') {
      activePadSourcesRef.current.set(padId, { source, gainNode, pannerNode })
    }
  })

  const clearChromaticPlayheadIfIdle = (padId: string, releasedNoteId?: string) => {
    const hasActiveChromaticNote = Array.from(activeChromaticNotesRef.current.entries()).some(([noteId, activeNote]) => (
      noteId !== releasedNoteId && activeNote.padId === padId
    ))

    if (hasActiveChromaticNote || activePadSourcesRef.current.has(padId)) {
      return
    }

    clearPadPlayhead(padId)
  }

  const stopChromaticNote = (noteId: string, keepActiveVisual = false) => {
    const activeNote = activeChromaticNotesRef.current.get(noteId)
    if (!activeNote) {
      return
    }

    activeNote.source.onended = null

    try {
      activeNote.source.stop()
    } catch {}

    try {
      activeNote.source.disconnect()
    } catch {}

    try {
      activeNote.gainNode.disconnect()
    } catch {}

    if (activeNote.pannerNode) {
      try {
        activeNote.pannerNode.disconnect()
      } catch {}
    }

    activeChromaticNotesRef.current.delete(noteId)
    setActiveChromaticNoteIds((current) => current.filter((currentNoteId) => currentNoteId !== noteId))

    if (!keepActiveVisual) {
      clearChromaticPlayheadIfIdle(activeNote.padId, noteId)
    }
  }

  const stopAllChromaticNotes = () => {
    pressedChromaticKeysRef.current.clear()
    arpHeldSemitonesRef.current = []
    arpPhysicalHeldCountRef.current = 0
    stopArp()

    for (const noteId of Array.from(activeChromaticNotesRef.current.keys())) {
      stopChromaticNote(noteId)
    }
  }

  const releaseChromaticNote = (noteId: string) => {
    const activeNote = activeChromaticNotesRef.current.get(noteId)
    if (!activeNote) {
      return
    }

    if (activeNote.playbackMode === 'gate' || activeNote.playbackMode === 'gate-loop') {
      stopChromaticNote(noteId)
    }
  }

  const playChromaticPadNote = useEffectEvent(async (
    padId: string,
    relativeSemitone: number,
    options?: { bankId?: BankId; noteId?: string },
  ) => {
    await ensureAudioEngine()

    const context = audioContextRef.current
    const targetBankId = options?.bankId ?? currentBankIdRef.current
    const targetBankState = bankStatesRef.current[targetBankId]
    const currentPad = targetBankState?.pads.find((pad) => pad.id === padId)
    const playbackSettings = targetBankState?.playbackSettings[padId]
    const bankGainNode = bankGainNodesRef.current[targetBankId]

    if (!context || !currentPad || !playbackSettings || !bankGainNode) {
      return
    }

    const playbackMode = playbackSettings.playbackMode ?? 'one-shot'
    const noteId = options?.noteId ?? buildChromaticNoteId(targetBankId, padId, relativeSemitone)
    const isLoopingMode = playbackMode === 'loop' || playbackMode === 'gate-loop'

    if (activeChromaticNotesRef.current.has(noteId)) {
      stopChromaticNote(noteId, true)
      if (playbackMode === 'loop') {
        return
      }
    }

    const sampleBuffer = await getPlaybackBuffer(currentPad, playbackSettings.reversed)
    const { startTime, endTime, playbackDuration, playbackRate } = getPadPlaybackWindow(
      sampleBuffer,
      playbackSettings,
      playbackSettings.semitoneOffset + relativeSemitone,
    )
    const source = context.createBufferSource()
    const gainNode = context.createGain()
    const pannerNode = typeof context.createStereoPanner === 'function' ? context.createStereoPanner() : null
    const renderedDurationMs = (playbackDuration / playbackRate) * 1000

    source.buffer = sampleBuffer
    source.playbackRate.value = playbackRate
    source.loop = isLoopingMode
    gainNode.gain.value = playbackSettings.gain

    if (pannerNode) {
      pannerNode.pan.value = playbackSettings.pan
    }

    source.connect(gainNode)
    if (pannerNode) {
      gainNode.connect(pannerNode)
      pannerNode.connect(bankGainNode)
    } else {
      gainNode.connect(bankGainNode)
    }

    if (isLoopingMode) {
      source.loopStart = startTime
      source.loopEnd = endTime
    }

    activeChromaticNotesRef.current.set(noteId, { source, gainNode, pannerNode, padId, playbackMode })
    setActiveChromaticNoteIds((current) => (current.includes(noteId) ? current : current.concat(noteId)))

    source.onended = () => {
      activeChromaticNotesRef.current.delete(noteId)
      setActiveChromaticNoteIds((current) => current.filter((currentNoteId) => currentNoteId !== noteId))
      clearChromaticPlayheadIfIdle(padId, noteId)

      try {
        source.disconnect()
      } catch {}

      try {
        gainNode.disconnect()
      } catch {}

      if (pannerNode) {
        try {
          pannerNode.disconnect()
        } catch {}
      }
    }

    if (isLoopingMode) {
      source.start(0, startTime)
    } else {
      source.start(0, startTime, playbackDuration)
    }

    startPlayheadAnimation(
      padId,
      playbackSettings.reversed ? playbackSettings.endFraction : playbackSettings.startFraction,
      playbackSettings.reversed ? playbackSettings.startFraction : playbackSettings.endFraction,
      isLoopingMode ? (Math.max(0.01, endTime - startTime) / playbackRate) * 1000 : renderedDurationMs,
      { loop: isLoopingMode },
    )
  })

  const clearSequenceUiTimeouts = () => {
    sequenceUiTimeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId))
    sequenceUiTimeoutsRef.current = []
  }

  const queueSequenceUiTimeout = (callback: () => void, delayMs: number) => {
    const timeoutId = window.setTimeout(callback, Math.max(0, delayMs))
    sequenceUiTimeoutsRef.current.push(timeoutId)
  }

  const stopSequencer = () => {
    if (sequenceSchedulerRef.current) {
      window.clearInterval(sequenceSchedulerRef.current)
      sequenceSchedulerRef.current = null
    }

    clearMetronomeSources()
    clearSequenceUiTimeouts()
    setSequencePlayheadStep(null)
    setIsSequencePlaying(false)
    sequenceStartTimeRef.current = 0
    sequenceNextStepTimeRef.current = 0
    sequenceStepIndexRef.current = 0
  }

  const stopTransport = () => {
    stopSequencer()
    stopLoopPlayback()
    stopAllPadSources()
    stopAllChromaticNotes()
    releaseAllMappedMidiNotes()
    setActivePadIds([])
    setIsLoopPlaying(false)
    setEditorPlayheadFraction(null)
  }

  const stopPerformanceRecording = () => {
    const recorder = performanceRecorderRef.current
    if (!recorder || recorder.state === 'inactive') {
      return
    }

    recorder.stop()

    if (performanceTimerRef.current !== null) {
      clearInterval(performanceTimerRef.current)
      performanceTimerRef.current = null
    }

    setIsPerformanceRecording(false)
    setPerformanceRecordingElapsed(0)
  }

  const startPerformanceRecording = () => {
    const context = getAudioContext()
    if (context.state === 'suspended' || (context.state as string) === 'interrupted') {
      void context.resume()
    }

    const limiter = outputLimiterRef.current
    if (!limiter) {
      return
    }

    const streamNode = context.createMediaStreamDestination()
    limiter.connect(streamNode)
    performanceStreamNodeRef.current = streamNode

    const mimeType = getPreferredRecordingMimeType()
    const recorder = new MediaRecorder(streamNode.stream, mimeType ? { mimeType } : undefined)
    performanceRecorderRef.current = recorder
    performanceChunksRef.current = []

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        performanceChunksRef.current.push(event.data)
      }
    }

    recorder.onstop = async () => {
      const chunks = performanceChunksRef.current
      performanceChunksRef.current = []

      if (performanceStreamNodeRef.current && limiter) {
        try { limiter.disconnect(performanceStreamNodeRef.current) } catch { /* already disconnected */ }
        performanceStreamNodeRef.current = null
      }

      if (chunks.length === 0) {
        return
      }

      const blob = new Blob(chunks, { type: recorder.mimeType })

      try {
        const arrayBuffer = await blob.arrayBuffer()
        const audioBuffer = await context.decodeAudioData(arrayBuffer)
        const wavBlob = encodeWavBlob(audioBuffer)
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
        triggerBlobDownload(wavBlob, `performance-${timestamp}.wav`)
      } catch {
        // If decoding fails (e.g. Safari mp4), download the raw recording
        const ext = recorder.mimeType.includes('mp4') ? 'mp4' : 'webm'
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
        triggerBlobDownload(blob, `performance-${timestamp}.${ext}`)
      }
    }

    recorder.start(1000)
    setIsPerformanceRecording(true)
    setPerformanceRecordingElapsed(0)

    const startTime = Date.now()
    performanceTimerRef.current = window.setInterval(() => {
      const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000)
      setPerformanceRecordingElapsed(elapsedSeconds)

      if (elapsedSeconds >= performanceRecordingMaxSeconds) {
        stopPerformanceRecording()
      }
    }, 1000)
  }

  const togglePerformanceRecording = () => {
    if (isPerformanceRecording) {
      stopPerformanceRecording()
    } else {
      startPerformanceRecording()
    }
  }

  const scheduleSequenceStep = useEffectEvent((stepIndex: number, when: number) => {
    const context = audioContextRef.current
    if (!context) {
      return
    }

    const stepDurationSeconds = 60 / Math.max(40, sequenceTempoRef.current) / 4
    const stepDurationMs = stepDurationSeconds * 1000
    const visualDelayMs = (when - context.currentTime) * 1000

    queueSequenceUiTimeout(() => {
      const visibleBank = bankStatesRef.current[currentBankIdRef.current]
      if (!visibleBank) {
        return
      }

      setSequencePlayheadStep(stepIndex % getActiveSequence(visibleBank).sequenceLength)
    }, visualDelayMs)

    if (isMetronomeEnabled && stepIndex % 4 === 0) {
      playMetronomeClick(when, stepIndex % 16 === 0)
    }

    bankIds.forEach((bankId) => {
      const bankState = bankStatesRef.current[bankId]
      if (!bankState) {
        return
      }

      const seq = getActiveSequence(bankState)
      if (seq.sequenceLength <= 0) {
        return
      }

      const bankStepIndex = stepIndex % seq.sequenceLength

      bankState.pads.forEach((pad) => {
        if (seq.sequenceMuted[pad.id]) {
          return
        }

        const isStepActive = seq.stepPattern[pad.id]?.[bankStepIndex]
        if (!isStepActive) {
          return
        }

        const stepSemitoneOffset = seq.stepSemitoneOffsets[pad.id]?.[bankStepIndex] ?? 0
        void playPadAudio(pad.id, { when, fromSequence: true, bankId, sequenceSemitoneOffset: stepSemitoneOffset, sequenceGateDuration: stepDurationSeconds })

        if (bankId !== currentBankIdRef.current) {
          return
        }

        queueSequenceUiTimeout(() => {
          setActivePadIds((current) => (current.includes(pad.id) ? current : current.concat(pad.id)))
          queueSequenceUiTimeout(() => {
            setActivePadIds((current) => current.filter((currentPadId) => currentPadId !== pad.id))
          }, Math.min(180, Math.max(80, stepDurationMs * 0.8)))
        }, visualDelayMs)
      })
    })
  })

  const runSequenceScheduler = useEffectEvent(() => {
    const context = audioContextRef.current
    if (!context) {
      return
    }

    const stepDurationSeconds = 60 / Math.max(40, sequenceTempoRef.current) / 4

    while (sequenceNextStepTimeRef.current < context.currentTime + sequenceScheduleAheadSeconds) {
      const stepIndex = sequenceStepIndexRef.current
      scheduleSequenceStep(stepIndex, sequenceNextStepTimeRef.current)
      sequenceNextStepTimeRef.current += stepDurationSeconds
      sequenceStepIndexRef.current = stepIndex + 1
    }
  })

  const recordPadPressToSequence = useEffectEvent((padId: string, bankId = currentBankIdRef.current, stepSemitoneOffset = 0) => {
    const context = audioContextRef.current
    const bankState = bankStatesRef.current[bankId]

    if (!isRecordArmed || !isSequencePlaying || !context || !bankState) {
      return
    }

    const seq = getActiveSequence(bankState)
    if (seq.sequenceLength <= 0) {
      return
    }

    const currentStep = Math.max(0, sequenceStepIndexRef.current - 1)
    const targetStepIndex = ((currentStep % seq.sequenceLength) + seq.sequenceLength) % seq.sequenceLength

    setBankStates((current) => {
      const bank = current[bankId]
      if (!bank) {
        return current
      }

      const activeSeq = getActiveSequence(bank)
      const existingSteps = [...(activeSeq.stepPattern[padId] ?? Array.from({ length: activeSeq.sequenceLength }, () => false))]
      const existingOffsets = [...(activeSeq.stepSemitoneOffsets[padId] ?? Array.from({ length: activeSeq.sequenceLength }, () => 0))]
      while (existingSteps.length < activeSeq.sequenceLength) {
        existingSteps.push(false)
      }
      while (existingOffsets.length < activeSeq.sequenceLength) {
        existingOffsets.push(0)
      }

      if (existingSteps[targetStepIndex] && existingOffsets[targetStepIndex] === stepSemitoneOffset) {
        return current
      }

      existingSteps[targetStepIndex] = true
      existingOffsets[targetStepIndex] = stepSemitoneOffset

      const updatedSeq = {
        ...activeSeq,
        stepPattern: { ...activeSeq.stepPattern, [padId]: existingSteps },
        stepSemitoneOffsets: { ...activeSeq.stepSemitoneOffsets, [padId]: existingOffsets },
      }
      const updatedSequences = [...bank.sequences]
      updatedSequences[bank.activeSequenceIndex] = updatedSeq

      return {
        ...current,
        [bankId]: { ...bank, sequences: updatedSequences },
      }
    })
  })

  const toggleSequencePlayback = async () => {
    if (isSequencePlaying) {
      stopSequencer()
      return
    }

    getAudioContext()
    await ensureAudioEngine()

    const context = getAudioContext()
    if (context.state === 'suspended' || (context.state as string) === 'interrupted') {
      context.resume().catch(() => {})
    }

    stopAllPadSources()
    clearSequenceUiTimeouts()
    setActivePadIds([])
    setSequencePlayheadStep(null)
    sequenceStepIndexRef.current = 0
    sequenceNextStepTimeRef.current = context.currentTime + 0.05
    sequenceStartTimeRef.current = sequenceNextStepTimeRef.current
    setIsSequencePlaying(true)
    runSequenceScheduler()
    sequenceSchedulerRef.current = window.setInterval(() => {
      runSequenceScheduler()
    }, sequenceLookaheadMs)
  }

  useEffect(() => {
    if (workView === 'editor' && editorSource === 'pad' && isChromaticModeActive) {
      return
    }

    // Let a latched arp keep running across view switches
    if (isArpEnabled && isArpLatched && arpIntervalRef.current !== null) {
      pressedChromaticKeysRef.current.clear()
      arpPhysicalHeldCountRef.current = 0
      return
    }

    pressedChromaticKeysRef.current.clear()
    stopAllChromaticNotes()
  }, [editorSource, isChromaticModeActive, selectedPad.id, workView, currentBankId])

  useEffect(() => {
    if (!isChromaticModeActive || workView !== 'editor' || editorSource !== 'pad') {
      return
    }

    const isTypingTarget = (target: EventTarget | null) => (
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement ||
      (target instanceof HTMLInputElement && target.type !== 'range')
    )

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || isTypingTarget(event.target)) {
        return
      }

      const key = event.key.toUpperCase()

      if (key === 'Z' || key === 'X') {
        event.preventDefault()

        if (event.repeat) {
          return
        }

        setChromaticOctave((current) => clamp(current + (key === 'X' ? 1 : -1), chromaticMinOctave, chromaticMaxOctave))
        return
      }

      const chromaticKey = chromaticKeyboardMap.get(key)
      if (!chromaticKey) {
        return
      }

      event.preventDefault()

      if (event.repeat || pressedChromaticKeysRef.current.has(key)) {
        return
      }

      pressedChromaticKeysRef.current.set(key, chromaticKey.semitoneOffset.toString())
      triggerChromaticKey(chromaticKey.semitoneOffset)
    }

    const handleKeyUp = (event: KeyboardEvent) => {
      const key = event.key.toUpperCase()
      const stored = pressedChromaticKeysRef.current.get(key)

      if (stored == null) {
        return
      }

      pressedChromaticKeysRef.current.delete(key)
      releaseChromaticKey(Number(stored))
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [chromaticOctave, editorSource, isChromaticModeActive, playChromaticPadNote, selectedPad.id, workView])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isChromaticModeActive && workView === 'editor' && editorSource === 'pad') {
        return
      }

      if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) {
        return
      }

      const key = event.key.toUpperCase()
      const matchedPad = currentBankPads.find((pad) => pad.keyTrigger === key)

      if (!matchedPad) {
        return
      }

      const target = event.target
      if (
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLInputElement && target.type !== 'range')
      ) {
        return
      }

      event.preventDefault()
      triggerPadInBank(matchedPad.id, currentBankId)
    }

    const handleKeyUp = (event: KeyboardEvent) => {
      if (isChromaticModeActive && workView === 'editor' && editorSource === 'pad') {
        return
      }

      const key = event.key.toUpperCase()
      const matchedPad = currentBankPads.find((pad) => pad.keyTrigger === key)

      if (!matchedPad) {
        return
      }

      releasePadInBank(matchedPad.id, currentBankId)
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [currentBankId, currentBankPads, editorSource, isChromaticModeActive, playPadAudio, workView])

  const updateCurrentBank = (updater: (bank: BankState) => BankState) => {
    setBankStates((current) => ({
      ...current,
      [currentBankId]: updater(current[currentBankId]),
    }))
  }

  const updateActiveSequence = (updater: (seq: Sequence) => Sequence) => {
    updateCurrentBank((bank) => {
      const updatedSeq = updater(getActiveSequence(bank))
      const updatedSequences = [...bank.sequences]
      updatedSequences[bank.activeSequenceIndex] = updatedSeq
      return { ...bank, sequences: updatedSequences }
    })
  }

  const triggerPadInBank = (padId: string, bankId: BankId) => {
    getAudioContext()
    setBankStates((current) => ({
      ...current,
      [bankId]: {
        ...current[bankId],
        selectedPadId: padId,
      },
    }))
    setActivePadIds((current) => (current.includes(padId) ? current : current.concat(padId)))
    recordPadPressToSequence(padId, bankId)
    void playPadAudio(padId, { bankId })
  }

  const releasePadInBank = (padId: string, bankId: BankId) => {
    const bankState = bankStatesRef.current[bankId]
    const mode = bankState?.playbackSettings[padId]?.playbackMode ?? 'one-shot'

    if (mode === 'gate' || mode === 'gate-loop') {
      stopPadSource(padId)
      setEditorPlayheadFraction(null)
      return
    }

    if (mode === 'one-shot') {
      setActivePadIds((current) => current.filter((currentPadId) => currentPadId !== padId))
    }
  }

  const triggerPad = (padId: string) => {
    triggerPadInBank(padId, currentBankIdRef.current)
  }

  const releasePad = (padId: string) => {
    releasePadInBank(padId, currentBankIdRef.current)
  }

  const releaseAllMappedMidiNotes = () => {
    for (const activeNote of activeMidiNotesRef.current.values()) {
      releasePadInBank(activeNote.padId, activeNote.bankId)
    }

    activeMidiNotesRef.current.clear()
  }

  const updateMidiInputs = useEffectEvent((access: MIDIAccess) => {
    const nextInputs = Array.from(access.inputs.values())
      .filter((input) => input.state !== 'disconnected')
      .map((input) => ({
        id: input.id,
        name: input.name?.trim() || `MIDI Input ${input.id.slice(-4)}`,
      }))

    setAvailableMidiInputs(nextInputs)

    const storedSelectedInputId = selectedMidiInputIdRef.current
    const nextSelectedInputId = storedSelectedInputId && nextInputs.some((input) => input.id === storedSelectedInputId)
      ? storedSelectedInputId
      : nextInputs[0]?.id ?? null

    if (storedSelectedInputId !== nextSelectedInputId) {
      releaseAllMappedMidiNotes()
      setSelectedMidiInputId(nextSelectedInputId)
    }

    setMidiAccessState('ready')
    setMidiStatusMessage(
      nextSelectedInputId
        ? `Listening for notes from ${nextInputs.find((input) => input.id === nextSelectedInputId)?.name ?? 'your controller'}.`
        : 'MIDI is enabled, but no input devices are currently connected.',
    )
  })

  const assignMidiNoteToPad = (padId: string, noteNumber: number) => {
    setMidiPadNoteMappings((current) => {
      const nextMappings = { ...current }

      for (const [mappedPadId, mappedNoteNumber] of Object.entries(nextMappings)) {
        if (mappedPadId !== padId && mappedNoteNumber === noteNumber) {
          nextMappings[mappedPadId] = null
        }
      }

      nextMappings[padId] = noteNumber
      midiPadNoteMappingsRef.current = nextMappings
      return nextMappings
    })

    midiLearnPadIdRef.current = null
    setMidiLearnPadId(null)
    setMidiStatusMessage(`Mapped ${formatMidiNoteLabel(noteNumber)} to ${currentBankPads.find((pad) => pad.id === padId)?.label ?? padId}.`)
  }

  const getMidiListeningMessage = (inputId: string | null) => {
    const selectedInputName = availableMidiInputs.find((input) => input.id === inputId)?.name
    if (selectedInputName) {
      return `Listening for notes from ${selectedInputName}.`
    }

    if (midiAccessRef.current) {
      return 'MIDI is enabled, but no input devices are currently connected.'
    }

    return 'Enable MIDI to map controller notes to the pad grid.'
  }

  const handleMidiInputSelection = (nextInputId: string | null) => {
    releaseAllMappedMidiNotes()
    selectedMidiInputIdRef.current = nextInputId
    setSelectedMidiInputId(nextInputId)

    if (!midiLearnPadIdRef.current) {
      setMidiStatusMessage(getMidiListeningMessage(nextInputId))
    }
  }

  const handleMidiMessage = useEffectEvent((event: MIDIMessageEvent) => {
    const [statusByte = 0, noteNumber = 0, velocity = 0] = event.data ?? []
    const messageType = statusByte & 0xf0
    const channel = (statusByte & 0x0f) + 1
    const noteKey = `${channel}:${noteNumber}`

    if (messageType !== 0x90 && messageType !== 0x80) {
      return
    }

    if (messageType === 0x90 && velocity > 0) {
      const learningPadId = midiLearnPadIdRef.current
      if (learningPadId) {
        assignMidiNoteToPad(learningPadId, noteNumber)
        return
      }

      const mappedPadId = midiPadNoteMappingsRef.current
        ? Object.entries(midiPadNoteMappingsRef.current).find(([, mappedNoteNumber]) => mappedNoteNumber === noteNumber)?.[0] ?? null
        : null

      if (!mappedPadId) {
        return
      }

      const bankId = currentBankIdRef.current
      activeMidiNotesRef.current.set(noteKey, { padId: mappedPadId, bankId })
      triggerPadInBank(mappedPadId, bankId)
      return
    }

    const activeNote = activeMidiNotesRef.current.get(noteKey)
    if (!activeNote) {
      return
    }

    activeMidiNotesRef.current.delete(noteKey)
    releasePadInBank(activeNote.padId, activeNote.bankId)
  })

  const enableMidiInput = async () => {
    if (!midiSupported) {
      setMidiAccessState('error')
      setMidiStatusMessage('This browser does not expose Web MIDI. Try Chrome or another Chromium-based browser on localhost/https.')
      return
    }

    try {
      setMidiAccessState('connecting')
      setMidiStatusMessage('Requesting MIDI access...')
      const midiAccess = await (navigator as NavigatorWithMidi).requestMIDIAccess?.({ sysex: false })
      if (!midiAccess) {
        throw new Error('Web MIDI access was unavailable.')
      }

      midiAccessRef.current = midiAccess
      midiAccess.onstatechange = () => {
        updateMidiInputs(midiAccess)
      }
      updateMidiInputs(midiAccess)
    } catch (error) {
      console.error('Failed to enable MIDI.', error)
      setMidiAccessState('error')
      setMidiStatusMessage(error instanceof Error ? error.message : 'Failed to enable MIDI input.')
    }
  }

  const disableMidiInput = () => {
    if (midiAccessRef.current) {
      midiAccessRef.current.onstatechange = null
      for (const input of midiAccessRef.current.inputs.values()) {
        input.onmidimessage = null
      }
      midiAccessRef.current = null
    }
    releaseAllMappedMidiNotes()
    activeMidiNotesRef.current.clear()
    setAvailableMidiInputs([])
    setSelectedMidiInputId(null)
    selectedMidiInputIdRef.current = null
    setMidiLearnPadId(null)
    midiLearnPadIdRef.current = null
    setMidiAccessState('idle')
    setMidiStatusMessage('Enable MIDI to map controller notes to the pad grid.')
  }

  const toggleMidiLearnForPad = (pad: Pad) => {
    const nextLearnPadId = midiLearnPadIdRef.current === pad.id ? null : pad.id
    midiLearnPadIdRef.current = nextLearnPadId
    setMidiLearnPadId(nextLearnPadId)

    if (nextLearnPadId) {
      setIsMidiPanelOpen(true)
      setMidiStatusMessage(`Press a MIDI note to map ${pad.label}.`)
      return
    }

    setMidiStatusMessage(getMidiListeningMessage(selectedMidiInputIdRef.current))
  }

  const cancelMidiLearn = () => {
    midiLearnPadIdRef.current = null
    setMidiLearnPadId(null)
    setMidiStatusMessage(getMidiListeningMessage(selectedMidiInputIdRef.current))
  }

  const toggleMidiPanel = () => {
    const nextIsOpen = !isMidiPanelOpen
    if (!nextIsOpen && midiLearnPadIdRef.current) {
      cancelMidiLearn()
    }
    setIsMidiPanelOpen(nextIsOpen)
  }

  const getArpStepMs = () => {
    const division = arpDivisionOptions.find((d) => d.value === arpDivision) ?? arpDivisionOptions[1]
    return (60_000 / Math.max(40, sequenceTempo)) * division.beatFraction
  }

  const getNextArpSemitone = useEffectEvent(() => {
    const held = arpHeldSemitonesRef.current
    if (held.length === 0) return null
    if (held.length === 1) return held[0]

    const sorted = [...held].sort((a, b) => a - b)
    const mode = arpMode

    if (mode === 'random') {
      return sorted[Math.floor(Math.random() * sorted.length)]
    }

    if (mode === 'order') {
      const index = arpStepIndexRef.current % held.length
      arpStepIndexRef.current = index + 1
      return held[index]
    }

    if (mode === 'up') {
      const index = arpStepIndexRef.current % sorted.length
      arpStepIndexRef.current = index + 1
      return sorted[index]
    }

    if (mode === 'down') {
      const reversed = [...sorted].reverse()
      const index = arpStepIndexRef.current % reversed.length
      arpStepIndexRef.current = index + 1
      return reversed[index]
    }

    // up-down
    const seq = sorted.length > 2
      ? [...sorted, ...sorted.slice(1, -1).reverse()]
      : [...sorted, ...sorted.slice(0, -1).reverse()]
    const index = arpStepIndexRef.current % Math.max(1, seq.length)
    arpStepIndexRef.current = index + 1
    return seq[index]
  })

  const arpTick = useEffectEvent(() => {
    if (arpHeldSemitonesRef.current.length === 0) return

    if (arpActiveNoteIdRef.current) {
      stopChromaticNote(arpActiveNoteIdRef.current)
      arpActiveNoteIdRef.current = null
    }

    const semitone = getNextArpSemitone()
    if (semitone == null) return

    const noteId = buildChromaticNoteId(currentBankId, selectedPad.id, semitone) + ':arp'
    arpActiveNoteIdRef.current = noteId
    recordPadPressToSequence(selectedPad.id, currentBankId, semitone)
    void playChromaticPadNote(selectedPad.id, semitone, { bankId: currentBankId, noteId })
  })

  const startArp = () => {
    stopArp()
    arpStepIndexRef.current = 0
    arpDirectionRef.current = 1
    arpTick()
    arpIntervalRef.current = window.setInterval(arpTick, getArpStepMs())
  }

  const stopArp = () => {
    if (arpIntervalRef.current !== null) {
      window.clearInterval(arpIntervalRef.current)
      arpIntervalRef.current = null
    }
    if (arpActiveNoteIdRef.current) {
      stopChromaticNote(arpActiveNoteIdRef.current)
      arpActiveNoteIdRef.current = null
    }
  }

  useEffect(() => {
    if (!isArpEnabled || arpIntervalRef.current === null) return
    // Restart the interval at the new rate without stopping the current note
    window.clearInterval(arpIntervalRef.current)
    arpIntervalRef.current = window.setInterval(arpTick, getArpStepMs())
    return () => {
      if (arpIntervalRef.current !== null) {
        window.clearInterval(arpIntervalRef.current)
        arpIntervalRef.current = null
      }
    }
  }, [arpDivision, sequenceTempo, arpMode])

  useEffect(() => {
    if (!isArpEnabled) {
      stopArp()
      arpHeldSemitonesRef.current = []
    }
  }, [isArpEnabled])

  const triggerChromaticKey = (semitoneOffset: number) => {
    getAudioContext()
    const relativeSemitone = getChromaticRelativeSemitone(chromaticOctave, semitoneOffset)

    if (isArpEnabled) {
      // If latched arp is running and user presses a new key after releasing all, reset the pattern
      if (isArpLatched && arpPhysicalHeldCountRef.current === 0 && arpIntervalRef.current !== null) {
        arpHeldSemitonesRef.current = []
        arpStepIndexRef.current = 0
      }
      arpPhysicalHeldCountRef.current += 1
      if (!arpHeldSemitonesRef.current.includes(relativeSemitone)) {
        arpHeldSemitonesRef.current = [...arpHeldSemitonesRef.current, relativeSemitone]
      }
      if (arpIntervalRef.current === null) {
        startArp()
      }
      return
    }

    const noteId = buildChromaticNoteId(currentBankId, selectedPad.id, relativeSemitone)
    recordPadPressToSequence(selectedPad.id, currentBankId, relativeSemitone)
    void playChromaticPadNote(selectedPad.id, relativeSemitone, { bankId: currentBankId, noteId })
  }

  const releaseChromaticKey = (semitoneOffset: number) => {
    const relativeSemitone = getChromaticRelativeSemitone(chromaticOctave, semitoneOffset)

    if (isArpEnabled) {
      arpPhysicalHeldCountRef.current = Math.max(0, arpPhysicalHeldCountRef.current - 1)
      if (!isArpLatched) {
        arpHeldSemitonesRef.current = arpHeldSemitonesRef.current.filter((s) => s !== relativeSemitone)
        if (arpHeldSemitonesRef.current.length === 0) {
          stopArp()
        }
      }
      return
    }

    releaseChromaticNote(buildChromaticNoteId(currentBankId, selectedPad.id, relativeSemitone))
  }

  const switchBank = (bankId: BankId) => {
    if (bankId === currentBankId) {
      return
    }

    stopAllPadSources()
    stopAllChromaticNotes()
    setEditorPlayheadFraction(null)
    setActivePadIds([])
    startTransition(() => {
      setCurrentBankId(bankId)
    })
  }

  const snapshotBank = (label: string, state: BankState) => {
    const snapshot: BankSnapshot = {
      id: `snap-${Date.now()}`,
      label,
      bankState: structuredClone(state),
      createdAt: Date.now(),
    }
    setBankSnapshots((prev) => [...prev.slice(-19), snapshot])
  }

  const loadDefaultBank = (targetSlot: BankId, sourceBank: BankId) => {
    stopAllPadSources()
    stopAllChromaticNotes()
    setEditorPlayheadFraction(null)
    setActivePadIds([])
    setBankStates((current) => ({
      ...current,
      [targetSlot]: createInitialBankState(sourceBank),
    }))
    setOpenBankPopover(null)
  }

  const loadBankFromSnapshot = (targetSlot: BankId, snapshot: BankSnapshot) => {
    stopAllPadSources()
    stopAllChromaticNotes()
    setEditorPlayheadFraction(null)
    setActivePadIds([])
    setBankStates((current) => ({
      ...current,
      [targetSlot]: structuredClone(snapshot.bankState),
    }))
    setOpenBankPopover(null)
  }

  const updateTrim = (
    padId: string,
    field: 'startFraction' | 'endFraction',
    nextPercent: number,
  ) => {
    const existing = currentBankState.playbackSettings[padId] ?? { startFraction: 0, endFraction: 1, semitoneOffset: 0, gain: 1, pan: 0, playbackMode: 'one-shot', reversed: false }
    const nextValue = nextPercent / 100
    const nextSettings = field === 'startFraction'
      ? {
          ...existing,
          startFraction: Math.min(nextValue, existing.endFraction - 0.01),
        }
      : {
          ...existing,
          endFraction: Math.max(nextValue, existing.startFraction + 0.01),
        }

    updateCurrentBank((bank) => ({
      ...bank,
      playbackSettings: {
        ...bank.playbackSettings,
        [padId]: nextSettings,
      },
    }))

    if (nextSettings.playbackMode === 'loop' || nextSettings.playbackMode === 'gate-loop') {
      syncActivePadLoopWindow(padId, nextSettings)
    }
  }

  const updateSemitoneOffset = (padId: string, nextValue: number) => {
    const existing = currentBankState.playbackSettings[padId] ?? { startFraction: 0, endFraction: 1, semitoneOffset: 0, gain: 1, pan: 0, playbackMode: 'one-shot', reversed: false }
    const nextSettings = {
      ...existing,
      semitoneOffset: nextValue,
    }

    updateCurrentBank((bank) => ({
      ...bank,
      playbackSettings: {
        ...bank.playbackSettings,
        [padId]: nextSettings,
      },
    }))

    syncActivePadPitch(padId, nextSettings)
  }

  const updatePadGain = (padId: string, nextValue: number) => {
    syncActivePadMix(padId, { gain: nextValue })
    updateCurrentBank((bank) => {
      const existing = bank.playbackSettings[padId] ?? { startFraction: 0, endFraction: 1, semitoneOffset: 0, gain: 1, pan: 0, playbackMode: 'one-shot', reversed: false }
      return {
        ...bank,
        playbackSettings: {
          ...bank.playbackSettings,
          [padId]: {
            ...existing,
            gain: nextValue,
          },
        },
      }
    })
  }

  const updatePadPan = (padId: string, nextValue: number) => {
    syncActivePadMix(padId, { pan: nextValue })
    updateCurrentBank((bank) => {
      const existing = bank.playbackSettings[padId] ?? { startFraction: 0, endFraction: 1, semitoneOffset: 0, gain: 1, pan: 0, playbackMode: 'one-shot', reversed: false }
      return {
        ...bank,
        playbackSettings: {
          ...bank.playbackSettings,
          [padId]: {
            ...existing,
            pan: nextValue,
          },
        },
      }
    })
  }

  const updateBankMixerGain = (bankId: BankId, nextValue: number) => {
    setBankMixerGains((current) => ({
      ...current,
      [bankId]: nextValue,
    }))
  }

  const toggleBankMute = (bankId: BankId) => {
    setBankMixerMuted((current) => ({
      ...current,
      [bankId]: !current[bankId],
    }))
  }

  const toggleBankSolo = (bankId: BankId) => {
    setBankMixerSoloed((current) => ({
      ...current,
      [bankId]: !current[bankId],
    }))
  }


  const stopPadSource = (padId: string, keepActiveVisual = false) => {
    const activePad = activePadSourcesRef.current.get(padId)
    if (activePad) {
      activePad.source.onended = null
      try {
        activePad.source.stop()
      } catch {}
      activePadSourcesRef.current.delete(padId)
    }

    clearPadPlayhead(padId)

    if (!keepActiveVisual) {
      setActivePadIds((current) => current.filter((currentPadId) => currentPadId !== padId))
    }
  }

  const stopAllPadSources = () => {
    for (const padId of activePadSourcesRef.current.keys()) {
      stopPadSource(padId)
    }
  }

  const updatePlaybackMode = (padId: string, nextMode: PlaybackMode) => {
    stopPadSource(padId)
    updateCurrentBank((bank) => {
      const existing = bank.playbackSettings[padId] ?? { startFraction: 0, endFraction: 1, semitoneOffset: 0, gain: 1, pan: 0, playbackMode: 'one-shot', reversed: false }
      return {
        ...bank,
        playbackSettings: {
          ...bank.playbackSettings,
          [padId]: {
            ...existing,
            playbackMode: nextMode,
          },
        },
      }
    })
  }

  const togglePadReverse = (padId: string) => {
    stopPadSource(padId)
    updateCurrentBank((bank) => {
      const existing = bank.playbackSettings[padId] ?? { startFraction: 0, endFraction: 1, semitoneOffset: 0, gain: 1, pan: 0, playbackMode: 'one-shot', reversed: false }
      return {
        ...bank,
        playbackSettings: {
          ...bank.playbackSettings,
          [padId]: {
            ...existing,
            reversed: !existing.reversed,
          },
        },
      }
    })
  }

  const toggleSequenceStep = (padId: string, stepIndex: number) => {
    updateCurrentBank((bank) => {
      const seq = getActiveSequence(bank)
      const existingSteps = [...(seq.stepPattern[padId] ?? Array.from({ length: seq.sequenceLength }, () => false))]
      const existingOffsets = [...(seq.stepSemitoneOffsets[padId] ?? Array.from({ length: seq.sequenceLength }, () => 0))]
      while (existingSteps.length < seq.sequenceLength) {
        existingSteps.push(false)
      }
      while (existingOffsets.length < seq.sequenceLength) {
        existingOffsets.push(0)
      }
      const nextIsActive = !existingSteps[stepIndex]
      existingSteps[stepIndex] = nextIsActive
      existingOffsets[stepIndex] = 0

      const updatedSeq = {
        ...seq,
        stepPattern: { ...seq.stepPattern, [padId]: existingSteps },
        stepSemitoneOffsets: { ...seq.stepSemitoneOffsets, [padId]: existingOffsets },
      }
      const updatedSequences = [...bank.sequences]
      updatedSequences[bank.activeSequenceIndex] = updatedSeq

      return { ...bank, selectedPadId: padId, sequences: updatedSequences }
    })
  }

  const toggleSequencePadMute = (padId: string) => {
    updateActiveSequence((seq) => ({
      ...seq,
      sequenceMuted: { ...seq.sequenceMuted, [padId]: !(seq.sequenceMuted[padId] ?? false) },
    }))
  }

  const updateSequenceLength = (nextLength: number) => {
    updateCurrentBank((bank) => {
      const seq = getActiveSequence(bank)
      const sourceLength = Math.max(1, seq.sequenceLength)
      const nextPattern = Object.fromEntries(
        bank.pads.map((pad) => {
          const existingSteps = seq.stepPattern[pad.id] ?? []
          const baseSteps = Array.from({ length: sourceLength }, (_, index) => existingSteps[index] ?? false)
          const resized = Array.from({ length: nextLength }, (_, index) => baseSteps[index % sourceLength] ?? false)
          return [pad.id, resized]
        }),
      ) as Record<string, boolean[]>
      const nextStepSemitoneOffsets = Object.fromEntries(
        bank.pads.map((pad) => {
          const existingSteps = seq.stepPattern[pad.id] ?? []
          const existingOffsets = seq.stepSemitoneOffsets[pad.id] ?? []
          const baseSteps = Array.from({ length: sourceLength }, (_, index) => existingSteps[index] ?? false)
          const baseOffsets = Array.from({ length: sourceLength }, (_, index) => baseSteps[index] ? (existingOffsets[index] ?? 0) : 0)
          const resized = Array.from({ length: nextLength }, (_, index) => (
            baseSteps[index % sourceLength] ? baseOffsets[index % sourceLength] ?? 0 : 0
          ))
          return [pad.id, resized]
        }),
      ) as Record<string, number[]>

      const updatedSeq = { ...seq, sequenceLength: nextLength, stepPattern: nextPattern, stepSemitoneOffsets: nextStepSemitoneOffsets }
      const updatedSequences = [...bank.sequences]
      updatedSequences[bank.activeSequenceIndex] = updatedSeq

      return { ...bank, sequences: updatedSequences }
    })
  }

  const handleSlotEffectSelect = (slotId: EffectChainSlotId, effectId: string) => {
    const defaults = getEffectDefaults(effectId)
    if (slotId === 'master') {
      setMasterEffect((prev) => ({ ...prev, effectId, params: defaults }))
    } else {
      setBankEffects((prev) => ({ ...prev, [slotId]: { ...prev[slotId], effectId, params: defaults } }))
    }
  }

  const handleSlotParamChange = (slotId: EffectChainSlotId, key: string, value: number) => {
    if (slotId === 'master') {
      setMasterEffect((prev) => ({ ...prev, params: { ...prev.params, [key]: value } }))
    } else {
      setBankEffects((prev) => ({ ...prev, [slotId]: { ...prev[slotId], params: { ...prev[slotId].params, [key]: value } } }))
    }
  }

  const handleSlotToggleEnabled = (slotId: EffectChainSlotId) => {
    if (slotId === 'master') {
      setMasterEffect((prev) => ({ ...prev, enabled: !prev.enabled }))
    } else {
      setBankEffects((prev) => ({ ...prev, [slotId]: { ...prev[slotId], enabled: !prev[slotId].enabled } }))
    }
  }

  const requestSequencePlan = async (options: {
    mode: 'sequence' | 'random-sequence'
    action: SequenceGenerationAction
    prompt: string
    pendingMessage: string
    fallbackSummary: string
    fallbackError: string
    requirePrompt?: boolean
  }) => {
    const nextPrompt = options.prompt.trim()

    if (options.requirePrompt && !nextPrompt) {
      setSequenceGenerationStatus('error')
      setSequenceGenerationMessage('Enter a prompt before generating a sequence.')
      setSequenceGenerationAction(null)
      return
    }

    try {
      setSequenceGenerationStatus('generating')
      setSequenceGenerationAction(options.action)
      setSequenceGenerationMessage(options.pendingMessage)

      const response = await fetch('/api/generate-kit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: nextPrompt || 'Surprise me with a musically interesting sequence for this bank.',
          bankId: currentBankId,
          mode: options.mode,
          sequenceLength: currentSequenceLength,
          sequencePads: currentBankPads.map((pad) => ({
            padId: pad.id,
            label: pad.label,
            sampleName: pad.sampleName,
            group: pad.group,
          })),
        }),
      })

      const payload = (await response.json()) as {
        error?: string
        summary?: string
        generatedSequence?: {
          lanes: Array<{ padId: string; activeSteps: number[] }>
        }
      }

      if (!response.ok || !payload.generatedSequence) {
        throw new Error(payload.error || options.fallbackError)
      }

      const nextPattern = Object.fromEntries(
        currentBankPads.map((pad) => {
          const lane = payload.generatedSequence?.lanes.find((entry) => entry.padId === pad.id)
          const activeStepSet = new Set((lane?.activeSteps ?? []).map((step) => step - 1).filter((step) => step >= 0 && step < currentSequenceLength))
          return [pad.id, Array.from({ length: currentSequenceLength }, (_, index) => activeStepSet.has(index))]
        }),
      ) as Record<string, boolean[]>
      const nextStepSemitoneOffsets = Object.fromEntries(
        currentBankPads.map((pad) => [pad.id, Array.from({ length: currentSequenceLength }, () => 0)]),
      ) as Record<string, number[]>

      updateActiveSequence((seq) => ({
        ...seq,
        stepPattern: nextPattern,
        stepSemitoneOffsets: nextStepSemitoneOffsets,
      }))

      setSequenceGenerationStatus('idle')
      setSequenceGenerationAction(null)
      setSequenceGenerationMessage(payload.summary || options.fallbackSummary)
    } catch (error) {
      setSequenceGenerationStatus('error')
      setSequenceGenerationAction(null)
      setSequenceGenerationMessage(error instanceof Error ? error.message : options.fallbackError)
    }
  }

  const generateSequence = async () => {
    await requestSequencePlan({
      mode: 'sequence',
      action: 'generate',
      prompt: sequencePromptText,
      pendingMessage: 'Building a sequence for Bank ' + currentBankId + ' from the current pad names.',
      fallbackSummary: 'Loaded a generated sequence into the current bank.',
      fallbackError: 'Sequence generation failed.',
      requirePrompt: true,
    })
  }

  const randomizeSequence = async () => {
    await requestSequencePlan({
      mode: 'random-sequence',
      action: 'randomize',
      prompt: sequencePromptText,
      pendingMessage: 'Asking Anthropic for a fresh surprise pattern for Bank ' + currentBankId + '.',
      fallbackSummary: 'Loaded a randomized sequence into the current bank.',
      fallbackError: 'Random sequence generation failed.',
    })
  }

  const clearSequence = () => {
    updateCurrentBank((bank) => {
      const seq = getActiveSequence(bank)
      const clearedSeq: Sequence = {
        ...seq,
        stepPattern: Object.fromEntries(
          bank.pads.map((pad) => [pad.id, Array.from({ length: seq.sequenceLength }, () => false)]),
        ) as Record<string, boolean[]>,
        stepSemitoneOffsets: Object.fromEntries(
          bank.pads.map((pad) => [pad.id, Array.from({ length: seq.sequenceLength }, () => 0)]),
        ) as Record<string, number[]>,
      }
      const updatedSequences = [...bank.sequences]
      updatedSequences[bank.activeSequenceIndex] = clearedSeq
      return { ...bank, sequences: updatedSequences }
    })
    setSequenceGenerationStatus('idle')
    setSequenceGenerationAction(null)
    setSequenceGenerationMessage('Cleared the current sequence for Bank ' + currentBankId + '.')
  }

  const switchSequence = (index: number) => {
    updateCurrentBank((bank) => ({
      ...bank,
      activeSequenceIndex: Math.min(index, bank.sequences.length - 1),
    }))
  }

  const addSequence = () => {
    updateCurrentBank((bank) => {
      if (bank.sequences.length >= 8) return bank
      return { ...bank, sequences: [...bank.sequences, createInitialSequence(bank.pads)] }
    })
  }

  const generateAudio = async (mode: GenerationMode) => {
    const nextPrompt = promptText.trim()

    if (!nextPrompt) {
      setGenerationStatus('error')
      setGenerationMessage('Enter a prompt before generating audio.')
      return
    }

    try {
      setGenerationStatus('generating')
      setGenerationMode(mode)
      setGenerationMessage(
        mode === 'kit'
          ? 'Generating a full 16-pad bank for Bank ' + currentBankId + '.'
          : mode === 'pad'
            ? 'Generating a fresh sample for ' + selectedPad.label + '.'
            : 'Generating a loop for the work area.'
      )

      const response = await fetch('/api/generate-kit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: nextPrompt,
          bankId: currentBankId,
          mode,
          selectedPadId: selectedPad.id,
        }),
      })

      const payload = (await response.json()) as {
        error?: string
        summary?: string
        generatedPads?: (Pad & { audioBase64?: string })[]
        generatedLoop?: GeneratedLoop & { audioBase64?: string }
      }

      if (!response.ok) {
        throw new Error(payload.error || 'Generation failed.')
      }

      if (payload.generatedPads) {
        for (const pad of payload.generatedPads) {
          if (pad.audioBase64) {
            pad.sampleUrl = createEphemeralAudioUrl(base64ToBlob(pad.audioBase64))
            pad.audioBase64 = undefined
          }
        }
      }

      if (payload.generatedLoop) {
        if (payload.generatedLoop.audioBase64) {
          payload.generatedLoop.sampleUrl = createEphemeralAudioUrl(base64ToBlob(payload.generatedLoop.audioBase64))
          payload.generatedLoop.audioBase64 = undefined
        }
        stopLoopPlayback()
        setGeneratedLoop(payload.generatedLoop)
        setEditorSource('loop')
        setIsLoopPlaying(false)
        workViewDirectionRef.current = 'expand'
        setWorkView('editor')
        setGenerationStatus('idle')
        setGenerationMessage(payload.summary || 'Loaded a fresh loop into the work area.')
        return
      }

      if (!payload.generatedPads?.length) {
        throw new Error(payload.error || 'Generation failed.')
      }

      setBankStates((current) => {
        const currentBank = current[currentBankId]
        const generatedPadMap = new Map(payload.generatedPads?.map((pad) => [pad.id, pad]))
        const nextPads = currentBank.pads.map((pad) => generatedPadMap.get(pad.id) ?? pad)
        const nextPlaybackSettings = { ...currentBank.playbackSettings }

        for (const pad of payload.generatedPads ?? []) {
          nextPlaybackSettings[pad.id] = { startFraction: 0, endFraction: 1, semitoneOffset: 0, gain: pad.gain, pan: 0, playbackMode: 'one-shot', reversed: false }
        }

        return {
          ...current,
          [currentBankId]: {
            ...currentBank,
            pads: nextPads,
            selectedPadId: payload.generatedPads?.[0]?.id ?? currentBank.selectedPadId,
            playbackSettings: nextPlaybackSettings,
          },
        }
      })

      const trimmedPrompt = nextPrompt.length > 40 ? nextPrompt.slice(0, 37) + '…' : nextPrompt
      snapshotBank(trimmedPrompt, {
        ...bankStates[currentBankId],
        pads: bankStates[currentBankId].pads.map((pad) => {
          const gen = payload.generatedPads?.find((g) => g.id === pad.id)
          return gen ?? pad
        }),
        selectedPadId: payload.generatedPads?.[0]?.id ?? bankStates[currentBankId].selectedPadId,
        playbackSettings: {
          ...bankStates[currentBankId].playbackSettings,
          ...Object.fromEntries(
            (payload.generatedPads ?? []).map((pad) => [pad.id, { startFraction: 0, endFraction: 1, semitoneOffset: 0, gain: pad.gain, pan: 0, playbackMode: 'one-shot' as const, reversed: false }]),
          ),
        },
      })

      setActivePadIds([])
      setGenerationStatus('idle')
      setGenerationMessage(
        payload.summary ||
          (mode === 'pad'
            ? 'Loaded a freshly generated sample into ' + selectedPad.label + '.'
            : 'Loaded a freshly generated 16-pad bank into Bank ' + currentBankId + '.')
      )
    } catch (error) {
      setGenerationStatus('error')
      setGenerationMessage(error instanceof Error ? error.message : 'Generation failed.')
    }
  }

  const clearPadPlayhead = (padId?: string) => {
    if (padId && activePadPlayheadIdRef.current !== padId) {
      return
    }

    if (playheadFrameRef.current) {
      window.cancelAnimationFrame(playheadFrameRef.current)
      playheadFrameRef.current = null
    }

    activePadPlayheadIdRef.current = null
    setEditorPlayheadFraction(null)
  }

  const startPlayheadAnimation = (
    padId: string,
    startFraction: number,
    endFraction: number,
    durationMs: number,
    options?: { loop?: boolean },
  ) => {
    if (playheadFrameRef.current) {
      window.cancelAnimationFrame(playheadFrameRef.current)
      playheadFrameRef.current = null
    }

    activePadPlayheadIdRef.current = padId
    const startedAt = performance.now()
    const safeDurationMs = Math.max(16, durationMs)
    const shouldLoop = options?.loop ?? false

    const tick = (now: number) => {
      const elapsed = now - startedAt
      const progress = shouldLoop ? (elapsed % safeDurationMs) / safeDurationMs : Math.min(1, elapsed / safeDurationMs)
      const nextFraction = startFraction + (endFraction - startFraction) * progress
      setEditorPlayheadFraction(nextFraction)

      if (shouldLoop || progress < 1) {
        playheadFrameRef.current = window.requestAnimationFrame(tick)
        return
      }

      playheadFrameRef.current = null
    }

    setEditorPlayheadFraction(startFraction)
    playheadFrameRef.current = window.requestAnimationFrame(tick)
  }

  const startLoopPlayheadMonitor = (durationSeconds: number, startSeconds = 0) => {
    if (playheadFrameRef.current) {
      window.cancelAnimationFrame(playheadFrameRef.current)
      playheadFrameRef.current = null
    }

    activePadPlayheadIdRef.current = null
    const playbackId = activeLoopPlaybackRef.current?.id
    const tick = () => {
      const activeLoopPlayback = activeLoopPlaybackRef.current
      const context = audioContextRef.current
      if (!activeLoopPlayback || activeLoopPlayback.id !== playbackId || !context) {
        playheadFrameRef.current = null
        return
      }

      const elapsed = Math.max(0, context.currentTime - activeLoopPlayback.startedAtContextTime)
      const playheadSeconds = activeLoopPlayback.loop
        ? activeLoopPlayback.playbackStartSeconds + (elapsed % activeLoopPlayback.playbackSpanSeconds)
        : Math.min(activeLoopPlayback.playbackStartSeconds + elapsed, activeLoopPlayback.playbackStartSeconds + activeLoopPlayback.playbackSpanSeconds)
      const fraction = Math.min(1, Math.max(0, playheadSeconds / durationSeconds))
      setEditorPlayheadFraction(fraction)

      if (activeLoopPlayback.loop || elapsed < activeLoopPlayback.playbackSpanSeconds) {
        playheadFrameRef.current = window.requestAnimationFrame(tick)
        return
      }

      playheadFrameRef.current = null
    }

    setEditorPlayheadFraction(Math.min(1, Math.max(0, startSeconds / durationSeconds)))
    playheadFrameRef.current = window.requestAnimationFrame(tick)
  }

  const releaseLoopPlayback = (nextPlayheadFraction: number | null = null, playbackOverride: ActiveLoopPlayback | null = null) => {
    if (playheadFrameRef.current) {
      window.cancelAnimationFrame(playheadFrameRef.current)
      playheadFrameRef.current = null
    }

    activePadPlayheadIdRef.current = null

    const activeLoopPlayback = playbackOverride ?? activeLoopPlaybackRef.current
    if (playbackOverride || activeLoopPlaybackRef.current?.id === activeLoopPlayback?.id) {
      activeLoopPlaybackRef.current = null
    }

    if (activeLoopPlayback) {
      activeLoopPlayback.source.onended = null
      try {
        activeLoopPlayback.source.stop()
      } catch {}
      try {
        activeLoopPlayback.source.disconnect()
      } catch {}
      try {
        activeLoopPlayback.gainNode.disconnect()
      } catch {}
    }

    setEditorPlayheadFraction(nextPlayheadFraction)
    setIsLoopPlaying(false)
  }

  const stopLoopPlayback = (nextPlayheadFraction: number | null = null) => {
    releaseLoopPlayback(nextPlayheadFraction)
  }

  const startLoopPlayback = async (options?: {
    startSeconds?: number
    endSeconds?: number
    loop?: boolean
    idlePlayheadFraction?: number | null
  }) => {
    if (!generatedLoop) {
      return
    }

    const context = getAudioContext()
    if (context.state === 'suspended' || (context.state as string) === 'interrupted') {
      context.resume().catch(() => {})
    }

    const buffer = await loadAudioBuffer(generatedLoop.sampleUrl, generatedLoop.sampleFile)
    const timelineDuration = Math.max(0.01, buffer.duration || getLoopDurationSeconds(generatedLoop))
    const startSeconds = Math.min(Math.max(0, options?.startSeconds ?? 0), Math.max(0, timelineDuration - 0.01))
    const endSeconds = Math.min(Math.max(startSeconds + 0.01, options?.endSeconds ?? timelineDuration), timelineDuration)
    const playbackSpanSeconds = Math.max(0.01, endSeconds - startSeconds)

    stopLoopPlayback(options?.idlePlayheadFraction ?? null)

    const gainNode = context.createGain()
    gainNode.gain.value = 1
    gainNode.connect(context.destination)

    const source = context.createBufferSource()
    source.buffer = buffer
    source.connect(gainNode)

    if (options?.loop) {
      source.loop = true
      source.loopStart = startSeconds
      source.loopEnd = endSeconds
      source.start(0, startSeconds)
    } else {
      source.start(0, startSeconds, playbackSpanSeconds)
    }

    const playback: ActiveLoopPlayback = {
      id: loopPlaybackIdRef.current + 1,
      source,
      gainNode,
      timelineDurationSeconds: timelineDuration,
      playbackStartSeconds: startSeconds,
      playbackSpanSeconds,
      startedAtContextTime: context.currentTime,
      loop: Boolean(options?.loop),
    }

    loopPlaybackIdRef.current = playback.id
    activeLoopPlaybackRef.current = playback
    source.onended = () => {
      if (activeLoopPlaybackRef.current?.id !== playback.id) {
        return
      }

      releaseLoopPlayback(options?.idlePlayheadFraction ?? null, playback)
    }

    startLoopPlayheadMonitor(playback.timelineDurationSeconds, playback.playbackStartSeconds)
    setIsLoopPlaying(true)
  }

  const toggleLoopPreview = async () => {
    if (!generatedLoop) {
      return
    }

    if (activeLoopPlaybackRef.current?.loop) {
      stopLoopPlayback()
      return
    }

    try {
      await startLoopPlayback({ loop: true })
    } catch (error) {
      console.error(error)
      setIsLoopPlaying(false)
    }
  }

  const normalizeLoopSource = async () => {
    if (!generatedLoop || isNormalizingLoop) {
      return
    }

    try {
      setIsNormalizingLoop(true)
      stopLoopPlayback()

      const response = await fetch(generatedLoop.sampleUrl)
      if (!response.ok) {
        throw new Error('Failed to load the current loop source for normalization.')
      }

      const audioData = await response.arrayBuffer()
      const context = getAudioContext()
      const decodedBuffer = await context.decodeAudioData(audioData.slice(0))
      let peak = 0

      for (let channelIndex = 0; channelIndex < decodedBuffer.numberOfChannels; channelIndex += 1) {
        const channelData = decodedBuffer.getChannelData(channelIndex)

        for (let sampleIndex = 0; sampleIndex < channelData.length; sampleIndex += 1) {
          peak = Math.max(peak, Math.abs(channelData[sampleIndex] ?? 0))
        }
      }

      if (!Number.isFinite(peak) || peak <= 0.0001) {
        throw new Error('The loop source is effectively silent, so there is nothing to normalize.')
      }

      const targetPeak = 0.98
      const normalizeGain = targetPeak / peak
      const normalizedBuffer = context.createBuffer(decodedBuffer.numberOfChannels, decodedBuffer.length, decodedBuffer.sampleRate)

      for (let channelIndex = 0; channelIndex < decodedBuffer.numberOfChannels; channelIndex += 1) {
        const sourceData = decodedBuffer.getChannelData(channelIndex)
        const targetData = normalizedBuffer.getChannelData(channelIndex)

        for (let sampleIndex = 0; sampleIndex < sourceData.length; sampleIndex += 1) {
          targetData[sampleIndex] = clamp((sourceData[sampleIndex] ?? 0) * normalizeGain, -1, 1)
        }
      }

      preservedLoopChopRegionsRef.current = loopChopRegions
      preservedSelectedChopIdRef.current = selectedChopId

      setGeneratedLoop({
        ...generatedLoop,
        sampleFile: `${sanitizeDownloadName(generatedLoop.sampleName)}-normalized.wav`,
        sampleUrl: createEphemeralAudioUrl(encodeWavBlob(normalizedBuffer)),
        durationSeconds: decodedBuffer.duration,
      })
      setGenerationMessage(`Normalized the loop source to a ${targetPeak.toFixed(2)} peak and kept the existing chops.`)
    } catch (error) {
      console.error('Loop normalization failed.', error)
      setGenerationMessage(error instanceof Error ? error.message : 'Loop normalization failed.')
    } finally {
      setIsNormalizingLoop(false)
    }
  }

  const auditionLoopChop = async (region: ChopRegion) => {
    if (!generatedLoop) {
      return
    }

    try {
      const loopDuration = Math.max(0.01, getLoopDurationSeconds(generatedLoop))
      const safeStart = Math.min(Math.max(0, region.start), loopDuration)
      const safeEnd = Math.min(Math.max(region.end, safeStart + 0.01), loopDuration)

      await startLoopPlayback({
        startSeconds: safeStart,
        endSeconds: safeEnd,
        loop: false,
        idlePlayheadFraction: safeStart / loopDuration,
      })
    } catch (error) {
      console.error(error)
      setIsLoopPlaying(false)
    }
  }

  const handleLoopRegionSelect = (region: ChopRegion) => {
    setSelectedChopId(region.id)
    void auditionLoopChop(region)
  }

  const handleLoopRegionsChange = (regions: ChopRegion[]) => {
    if (!generatedLoop) {
      return
    }

    const normalized = normalizeChopRegions(regions, getLoopDurationSeconds(generatedLoop))
    setLoopChopRegions(normalized)

    if (!selectedChopId && normalized[0]) {
      setSelectedChopId(normalized[0].id)
    }
  }

  const resetLoopChops = () => {
    if (!generatedLoop) {
      return
    }

    const nextRegions = buildChopRegions(getLoopDurationSeconds(generatedLoop), loopChopCount)
    setLoopChopRegions(nextRegions)
    setSelectedChopId((current) => nextRegions.find((region) => region.id === current)?.id ?? nextRegions[0]?.id ?? null)
    setGenerationMessage('Reset the loop chops back to the even 16-slice grid.')
  }

  const loadLoopToBank = (targetBankId: BankId) => {
    if (!generatedLoop || loopChopRegions.length === 0) {
      return
    }

    stopLoopPlayback()
    stopAllPadSources()
    setActivePadIds([])

    setBankStates((current) => {
      const targetBank = current[targetBankId]
      const nextPads = targetBank.pads.map((pad, index) => {
        const region = loopChopRegions[index]
        const chopNumber = index + 1

        if (!region) {
          return pad
        }

        return {
          ...pad,
          label: `Chop ${String(chopNumber).padStart(2, '0')}`,
          sampleName: `${generatedLoop.sampleName} Chop ${chopNumber}`,
          sampleFile: generatedLoop.sampleFile,
          sampleUrl: generatedLoop.sampleUrl,
          sourceType: generatedLoop.sourceType,
          durationLabel: `${Math.max(0.01, region.end - region.start).toFixed(2)}s chop`,
          group: 'chop',
          gain: 1,
        }
      })

      const loopDuration = Math.max(0.01, getLoopDurationSeconds(generatedLoop))
      const nextPlaybackSettings = Object.fromEntries(
        nextPads.map((pad, index) => {
          const region = loopChopRegions[index]
          const existing = targetBank.playbackSettings[pad.id]

          return [
            pad.id,
            {
              startFraction: region ? region.start / loopDuration : existing?.startFraction ?? 0,
              endFraction: region ? region.end / loopDuration : existing?.endFraction ?? 1,
              semitoneOffset: 0,
              gain: 1,
              pan: 0,
              playbackMode: 'one-shot' as const,
              reversed: false,
            },
          ]
        }),
      ) as Record<string, PadPlaybackSetting>

      return {
        ...current,
        [targetBankId]: {
          ...targetBank,
          pads: nextPads,
          selectedPadId: nextPads[0]?.id ?? targetBank.selectedPadId,
          playbackSettings: nextPlaybackSettings,
        },
      }
    })

    const chopLabel = generatedLoop.sampleName || 'Loop chops'
    snapshotBank(chopLabel, {
      ...bankStates[targetBankId],
      pads: bankStates[targetBankId].pads.map((pad, index) => {
        const region = loopChopRegions[index]
        if (!region) return pad
        return {
          ...pad,
          label: `Chop ${String(index + 1).padStart(2, '0')}`,
          sampleName: `${generatedLoop.sampleName} Chop ${index + 1}`,
          sampleFile: generatedLoop.sampleFile,
          sampleUrl: generatedLoop.sampleUrl,
          sourceType: generatedLoop.sourceType,
          durationLabel: `${Math.max(0.01, region.end - region.start).toFixed(2)}s chop`,
          group: 'chop',
          gain: 1,
        }
      }),
    })

    setGenerationMessage(`Loaded ${loopChopRegions.length} chops from the loop into Bank ${targetBankId}.`)
    setCurrentBankId(targetBankId)
    setEditorSource('pad')
  }

  const workViewOrder: WorkView[] = ['editor', 'sequence', 'mixer', 'effects']
  const workViewDirectionRef = useRef<'up' | 'down' | 'collapse' | 'expand'>('expand')

  const toggleWorkView = (nextView: WorkView) => {
    setWorkView((current) => {
      if (current === nextView) {
        workViewDirectionRef.current = 'collapse'
        return null
      }
      if (current === null) {
        workViewDirectionRef.current = 'expand'
      } else {
        workViewDirectionRef.current = workViewOrder.indexOf(nextView) > workViewOrder.indexOf(current) ? 'down' : 'up'
      }
      return nextView
    })
  }

  const workSurfaceVariants = {
    initial: (direction: 'up' | 'down' | 'collapse' | 'expand') => {
      if (direction === 'expand' || direction === 'collapse') {
        return { height: 0, opacity: 0 }
      }
      return { y: direction === 'down' ? 30 : -30, opacity: 0, height: 'auto' }
    },
    animate: { height: 'auto', opacity: 1, y: 0 },
    exit: (direction: 'up' | 'down' | 'collapse' | 'expand') => {
      if (direction === 'collapse' || direction === 'expand') {
        return { height: 0, opacity: 0 }
      }
      return { y: direction === 'down' ? -30 : 30, opacity: 0, height: 'auto' }
    },
  }

  const workSurfaceTransition = {
    duration: 0.2,
    ease: [0.25, 0.1, 0.25, 1] as [number, number, number, number],
  }

  const workViewTitle =
    workView === 'editor'
      ? 'Sample Editor'
      : workView === 'sequence'
        ? 'Sequencer'
        : workView === 'mixer'
          ? 'Mixer'
          : workView === 'effects'
            ? 'Effects'
            : 'Workspace'

  return (
    <TooltipProvider>
    <main className="app-shell">
      {isDebugMode && audioDebug.length > 0 && (
        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 99999, background: 'rgba(0,0,0,0.85)', color: '#0f0', fontSize: '10px', fontFamily: 'monospace', padding: '6px 8px', maxHeight: '30vh', overflow: 'auto', pointerEvents: 'auto' }}>
          <button type="button" onClick={() => { audioDebugRef.current = []; setAudioDebug([]) }} style={{ float: 'right', color: '#f00', background: 'none', border: 'none', fontSize: '10px', fontFamily: 'monospace' }}>clear</button>
          {audioDebug.map((line, i) => <div key={i}>{line}</div>)}
        </div>
      )}
      {isLoadingShare && (
        <div className="share-loading-overlay">
          <div className="share-loading-lcd">
            <p className="share-loading-eyebrow">MCP 2000</p>
            <p className="share-loading-label">Loading shared project…</p>
          </div>
        </div>
      )}
      <header className="work-area" aria-label="Sampler work area">
        <div className="work-area-toolbar">
          <div className="work-area-title">
            <div className="work-area-title-row">
              <p className="eyebrow">MCP 2000</p>
              <div className="title-row-actions">
                <button
                  type="button"
                  className="theme-toggle"
                  onClick={() => setIsDarkMode((c) => !c)}
                  aria-label={isDarkMode ? 'Switch to beige' : 'Switch to blue'}
                  title={isDarkMode ? 'Beige' : 'Blue'}
                >
                  {isDarkMode ? 'Beige' : 'Blue'}
                </button>
                <button
                  type="button"
                  className={shareStatus === 'done' ? 'share-button is-done' : 'share-button'}
                  onClick={shareStatus === 'done' ? dismissShare : startShare}
                  disabled={shareStatus === 'uploading' || shareStatus === 'creating'}
                  aria-label={shareStatus === 'done' ? 'Share link copied' : 'Share project'}
                  title={shareStatus === 'done' ? 'Link copied!' : 'Share'}
                >
                  {shareStatus === 'idle' && 'Share Project'}
                  {shareStatus === 'uploading' && 'Uploading…'}
                  {shareStatus === 'creating' && 'Creating…'}
                  {shareStatus === 'done' && 'Link Copied!'}
                  {shareStatus === 'error' && 'Failed'}
                </button>
                <button
                  type="button"
                  className="tour-button"
                  onClick={() => setIsChatOpen(c => !c)}
                  aria-label="Open assistant"
                  title="Help"
                >
                  ?
                </button>
              </div>
            </div>
            <strong>{workViewTitle}</strong>
          </div>
          <div className="work-area-transport" aria-label="Transport controls">
            <ScrollPicker
              min={40}
              max={220}
              value={sequenceTempo}
              onChange={setSequenceTempo}
              label="Tempo"
            />
            <button
              type="button"
              className={isMetronomeEnabled ? 'primary-button transport-button is-active' : 'secondary-button transport-button'}
              aria-pressed={isMetronomeEnabled}
              onClick={() => {
                const nextEnabled = !isMetronomeEnabled

                if (nextEnabled) {
                  const context = getAudioContext()
                  if (context.state === 'suspended' || (context.state as string) === 'interrupted') {
                    void context.resume()
                  }
                } else {
                  clearMetronomeSources()
                }

                setIsMetronomeEnabled(nextEnabled)
              }}
              aria-label={isMetronomeEnabled ? 'Disable metronome' : 'Enable metronome'}
              title={isMetronomeEnabled ? 'Disable metronome' : 'Enable metronome'}
            >
              <Metronome size={18} strokeWidth={2.1} aria-hidden="true" />
            </button>
            <button
              type="button"
              className={isSequencePlaying ? 'primary-button transport-button is-active' : 'secondary-button transport-button'}
              onClick={() => { void toggleSequencePlayback() }}
              aria-label={isSequencePlaying ? 'Stop' : 'Play'}
              title={isSequencePlaying ? 'Stop' : 'Play'}
            >
              <Play size={21} strokeWidth={2.1} aria-hidden="true" />
            </button>
            <button
              type="button"
              className={isRecordArmed ? 'primary-button transport-button' : 'secondary-button transport-button'}
              aria-pressed={isRecordArmed}
              onClick={() => setIsRecordArmed((current) => !current)}
              aria-label="Record"
              title="Record"
            >
              <Circle size={21} strokeWidth={2.1} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="secondary-button transport-button"
              onClick={stopTransport}
              aria-label="Stop"
              title="Stop"
            >
              <Square size={21} strokeWidth={2.1} aria-hidden="true" />
            </button>
            <Tooltip label={isPerformanceRecording ? 'Stop and save recording' : 'Record everything you hear as a WAV file'} side="bottom">
              <button
                type="button"
                className={isPerformanceRecording ? 'primary-button transport-button is-active performance-recording' : 'secondary-button transport-button'}
                onClick={togglePerformanceRecording}
                aria-label={isPerformanceRecording ? 'Stop recording performance' : 'Record performance'}
              >
                <Disc size={18} strokeWidth={2.1} aria-hidden="true" />
              </button>
            </Tooltip>
            {isPerformanceRecording && (
              <span className="performance-recording-timer">
                {formatClockDuration(performanceRecordingElapsed)}
              </span>
            )}
          </div>
          <div className="work-area-tabs" role="tablist" aria-label="Work views">
            <button type="button" className={workView === 'editor' ? 'work-tab is-current' : 'work-tab'} onClick={() => toggleWorkView('editor')}>
              Sample
            </button>
            <button type="button" className={workView === 'sequence' ? 'work-tab is-current' : 'work-tab'} onClick={() => toggleWorkView('sequence')}>
              Sequence
            </button>
            <button type="button" className={workView === 'mixer' ? 'work-tab is-current' : 'work-tab'} onClick={() => toggleWorkView('mixer')}>
              Mixer
            </button>
            <button type="button" className={workView === 'effects' ? 'work-tab is-current' : 'work-tab'} onClick={() => toggleWorkView('effects')}>
              Effects
            </button>
          </div>
        </div>

        <AnimatePresence mode="popLayout" initial={false} custom={workViewDirectionRef.current}>
          {workView === null ? null : workView === 'editor' ? (
          <motion.div key="editor" variants={workSurfaceVariants} initial="initial" animate="animate" exit="exit" custom={workViewDirectionRef.current} transition={workSurfaceTransition} style={{ overflow: 'hidden' }}>
            <div className="work-surface" aria-label="Sample editor workspace">
              <div className="editor-toolbar">
                <div className="editor-source-tabs" role="tablist" aria-label="Editor sources">
                  <button type="button" className={editorSource === 'pad' ? 'work-tab is-current' : 'work-tab'} onClick={() => setEditorSource('pad')}>
                    Selected Pad
                  </button>
                  {generatedLoop ? (
                    <button type="button" className={editorSource === 'loop' ? 'work-tab is-current' : 'work-tab'} onClick={() => setEditorSource('loop')}>
                      Loop Source
                    </button>
                  ) : null}
                  <button type="button" className={editorSource === 'mic' ? 'work-tab is-current' : 'work-tab'} onClick={() => setEditorSource('mic')}>
                    Mic Record
                  </button>
                </div>
                <label className="editor-transform-bar" hidden={editorSource === 'mic'}>
                  <input
                    type="text"
                    value={editorTransformPrompt}
                    onChange={(event) => setEditorTransformPrompt(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter') {
                        return
                      }

                      event.preventDefault()
                      void transformCurrentEditorAudio()
                    }}
                    maxLength={240}
                    placeholder={editorSource === 'loop'
                      ? 'Transform this loop into something new'
                      : 'Describe how to transform this sample'}
                    aria-label="Describe how ElevenLabs should transform this sound"
                  />
                  <button
                    type="button"
                    className="work-tab editor-transform-button"
                    onClick={() => {
                      void transformCurrentEditorAudio()
                    }}
                    disabled={isTransformingEditorAudio || editorTransformPrompt.trim().length < 20}
                  >
                    {isTransformingEditorAudio ? 'Sending...' : 'Generate'}
                  </button>
                </label>
                <div className="work-surface-actions editor-toolbar-actions" hidden={editorSource === 'mic'}>
                  <button
                    type="button"
                    className="work-tab editor-export-button"
                    onClick={() => {
                      void exportCurrentEditorAudio()
                    }}
                    disabled={isExportingSample}
                    aria-label={editorExportLabel}
                  >
                    <Download size={15} strokeWidth={2.1} aria-hidden="true" />
                    <span>{isExportingSample ? 'Exporting...' : editorExportLabel}</span>
                  </button>
                </div>
              </div>
              {editorSource === 'mic' ? (
                <div className="editor-mic-capture">
                  <div className="mic-capture-heading">
                    <div className="mic-capture-title">
                      <span className="transport-label">Microphone</span>
                      <strong>Record a take for the sampler</strong>
                    </div>
                    <span className={micCaptureState === 'recording' ? 'mic-capture-timer is-live' : 'mic-capture-timer'}>
                      {micCaptureClockLabel}
                    </span>
                  </div>

                  <p className="mic-capture-status" aria-live="polite">
                    {micRecordingSupported ? micCaptureMessage : 'This browser does not support microphone recording.'}
                  </p>

                  <div className="mic-capture-controls">
                    <button
                      type="button"
                      className="work-tab mic-capture-control"
                      onClick={() => { void startMicRecording() }}
                      disabled={!micRecordingSupported || micCaptureState === 'requesting' || micCaptureState === 'recording' || micCaptureState === 'processing'}
                    >
                      <Circle size={13} strokeWidth={2.1} aria-hidden="true" />
                      <span>
                        {micCaptureState === 'requesting'
                          ? 'Allow Mic...'
                          : micCaptureState === 'recording'
                            ? 'Recording...'
                            : 'Record'}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="work-tab mic-capture-control"
                      onClick={stopMicRecording}
                      disabled={micCaptureState !== 'recording'}
                    >
                      <Square size={13} strokeWidth={2.1} aria-hidden="true" />
                      <span>{micCaptureState === 'processing' ? 'Finishing...' : 'Stop'}</span>
                    </button>
                  </div>

                  {recordedTake ? (
                    <>
                      <audio ref={micTakeAudioRef} src={recordedTake.previewUrl} hidden />
                      <div className="waveform-panel" style={{ cursor: 'pointer' }}>
                        <SampleWaveform
                          audioUrl={recordedTake.previewUrl}
                          durationSeconds={recordedTake.durationSeconds}
                          onWaveformPointerDown={toggleMicTakePreview}
                        />
                      </div>
                      <div className="mic-capture-controls">
                        <button type="button" className="work-tab is-current" onClick={assignRecordedTakeToSelectedPad}>
                          Assign to {selectedPad.label}
                        </button>
                        <button type="button" className="work-tab" onClick={openRecordedTakeInEditor}>
                          Chop
                        </button>
                        <button type="button" className="work-tab" onClick={clearRecordedTake}>
                          Discard
                        </button>
                        <button
                          type="button"
                          className="work-tab"
                          onClick={() => { void normalizeRecordedTake() }}
                          disabled={isNormalizingTake}
                        >
                          {isNormalizingTake ? 'Normalizing...' : 'Normalize'}
                        </button>
                      </div>
                    </>
                  ) : null}
                </div>
              ) : null}
              {editorSource !== 'mic' ? (
              <div className="waveform-panel">
                <SampleWaveform
                  audioUrl={currentEditorAudioUrl}
                  durationSeconds={currentEditorAudioDuration}
                  regions={editorSource === 'loop' && generatedLoop ? loopChopRegions : []}
                  selectedRegionId={editorSource === 'loop' ? selectedChopId : null}
                  playheadFraction={editorPlayheadFraction}
                  markerStartFraction={editorSource === 'pad' ? selectedPadSettings.startFraction : null}
                  markerEndFraction={editorSource === 'pad' ? selectedPadSettings.endFraction : null}
                  reversed={editorSource === 'pad' ? isPadReversed : false}
                  onStatusChange={editorSource === 'loop' && generatedLoop ? setLoopDecodeStatus : setSelectedPadDecodeStatus}
                  onRegionSelect={editorSource === 'loop' && generatedLoop ? handleLoopRegionSelect : undefined}
                  onRegionsChange={editorSource === 'loop' && generatedLoop ? handleLoopRegionsChange : undefined}
                  onMarkerChange={editorSource === 'pad' ? (field, nextFraction) => updateTrim(selectedPad.id, field === 'start' ? 'startFraction' : 'endFraction', nextFraction * 100) : undefined}
                  onWaveformPointerDown={editorSource === 'pad' ? () => triggerPad(selectedPad.id) : undefined}
                  onWaveformPointerUp={editorSource === 'pad' ? () => releasePad(selectedPad.id) : undefined}
                  onWaveformPointerLeave={editorSource === 'pad' ? () => releasePad(selectedPad.id) : undefined}
                />
              </div>
              ) : null}
              {editorSource === 'pad' ? (
                <div className="editor-pad-footer">
                  <div className={isChromaticModeActive ? 'editor-pad-controls is-chromatic-active' : 'editor-pad-controls'}>
                    <div className="playback-mode-group editor-playback-mode-group">
                      <div className="editor-playback-mode-radios" role="radiogroup" aria-label="Playback mode">
                        {(['one-shot', 'gate-loop', 'gate', 'loop'] as const).map((mode) => (
                          <button
                            key={mode}
                            type="button"
                            role="radio"
                            aria-checked={playbackMode === mode}
                            className={playbackMode === mode ? 'playback-mode-button is-current' : 'playback-mode-button'}
                            onClick={() => updatePlaybackMode(selectedPad.id, mode)}
                          >
                            {mode}
                          </button>
                        ))}
                      </div>
                      <button
                        type="button"
                        aria-pressed={isPadReversed}
                        className={isPadReversed ? 'playback-mode-button is-current' : 'playback-mode-button'}
                        onClick={() => togglePadReverse(selectedPad.id)}
                      >
                        Reverse
                      </button>
                      <button
                        type="button"
                        aria-pressed={isChromaticModeActive}
                        className={isChromaticModeActive ? 'playback-mode-button is-current chromatic-mode-button' : 'playback-mode-button chromatic-mode-button'}
                        onClick={() => setIsChromaticModeActive((current) => !current)}
                        title="Chromatic keyboard mode"
                      >
                        <Piano size={14} strokeWidth={2.1} aria-hidden="true" />
                        <span>Keys</span>
                      </button>
                    </div>

                    <div className="editor-info-knobs">
                      <div className="editor-pad-meta">
                        <article>
                          <span className="transport-label">Pad</span>
                          <strong>{selectedPad.label}</strong>
                        </article>
                        <article>
                          <span className="transport-label">File</span>
                          <strong title={selectedPad.sampleFile}>{selectedPad.sampleFile}</strong>
                        </article>
                      </div>
                      <Knob
                        compact
                        value={semitoneOffset}
                        min={-12}
                        max={12}
                        step={1}
                        label="Pitch"
                        formatValue={(v) => `${v > 0 ? '+' : ''}${v} st`}
                        onChange={(v) => updateSemitoneOffset(selectedPad.id, v)}
                      />
                      <Knob
                        compact
                        value={padGain}
                        min={0}
                        max={1.5}
                        step={0.01}
                        label="Gain"
                        formatValue={(v) => v.toFixed(2)}
                        onChange={(v) => updatePadGain(selectedPad.id, v)}
                      />
                      <Knob
                        compact
                        bipolar
                        value={padPan}
                        min={-1}
                        max={1}
                        step={0.01}
                        label="Pan"
                        formatValue={(v) => v === 0 ? 'C' : v < 0 ? `L ${Math.round(Math.abs(v) * 100)}` : `R ${Math.round(v * 100)}`}
                        onChange={(v) => updatePadPan(selectedPad.id, v)}
                      />
                    </div>

                    {isChromaticModeActive ? (
                      <div className="editor-chromatic-panel">
                        <div className="editor-chromatic-toolbar">
                          <div className="editor-chromatic-heading">
                            <strong>Chromatic Keyboard</strong>
                            <span>{selectedPad.label} mapped across {chromaticRangeLabel}</span>
                          </div>
                          <div className="editor-chromatic-octave">
                            <button
                              type="button"
                              className="playback-mode-button chromatic-octave-button"
                              onClick={() => setChromaticOctave((current) => clamp(current - 1, chromaticMinOctave, chromaticMaxOctave))}
                              disabled={chromaticOctave <= chromaticMinOctave}
                              aria-label="Lower chromatic octave"
                            >
                              <ChevronLeft size={14} strokeWidth={2.1} aria-hidden="true" />
                            </button>
                            <div className="editor-chromatic-octave-readout">
                              <span>Octave</span>
                              <strong>{chromaticRangeLabel}</strong>
                            </div>
                            <button
                              type="button"
                              className="playback-mode-button chromatic-octave-button"
                              onClick={() => setChromaticOctave((current) => clamp(current + 1, chromaticMinOctave, chromaticMaxOctave))}
                              disabled={chromaticOctave >= chromaticMaxOctave}
                              aria-label="Raise chromatic octave"
                            >
                              <ChevronRight size={14} strokeWidth={2.1} aria-hidden="true" />
                            </button>
                          </div>
                          <div className="editor-arp-controls">
                            <button
                              type="button"
                              className={isArpEnabled ? 'playback-mode-button is-current' : 'playback-mode-button'}
                              aria-pressed={isArpEnabled}
                              onClick={() => setIsArpEnabled((c) => !c)}
                            >
                              Arp
                            </button>
                            <select
                              className="arp-select"
                              value={arpDivision}
                              onChange={(e) => setArpDivision(e.target.value as ArpDivision)}
                              disabled={!isArpEnabled}
                              aria-label="Arp time division"
                            >
                              {arpDivisionOptions.map((opt) => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                              ))}
                            </select>
                            <select
                              className="arp-select"
                              value={arpMode}
                              onChange={(e) => setArpMode(e.target.value as ArpMode)}
                              disabled={!isArpEnabled}
                              aria-label="Arp mode"
                            >
                              {arpModeOptions.map((opt) => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                              ))}
                            </select>
                            <button
                              type="button"
                              className={isArpLatched ? 'playback-mode-button is-current' : 'playback-mode-button'}
                              aria-pressed={isArpLatched}
                              onClick={() => {
                                setIsArpLatched((c) => {
                                  if (c) {
                                    // Turning latch off — stop arp if no keys are physically held
                                    if (arpPhysicalHeldCountRef.current === 0) {
                                      arpHeldSemitonesRef.current = []
                                      stopArp()
                                    }
                                  }
                                  return !c
                                })
                              }}
                              title="Latch — hold the arpeggio after releasing keys"
                            >
                              Latch
                            </button>
                          </div>
                        </div>

                        <div className="editor-chromatic-keyboard" role="group" aria-label="Chromatic keyboard">
                          <div className="editor-chromatic-white-keys">
                            {chromaticKeyLayout.filter((key) => key.kind === 'white').map((key) => {
                              const relativeSemitone = getChromaticRelativeSemitone(chromaticOctave, key.semitoneOffset)
                              const noteId = buildChromaticNoteId(currentBankId, selectedPad.id, relativeSemitone)
                              const isActive = activeChromaticNoteSet.has(noteId) || activeChromaticNoteSet.has(noteId + ':arp')

                              return (
                                <button
                                  key={key.id}
                                  type="button"
                                  className={isActive ? 'editor-chromatic-key white-key is-active' : 'editor-chromatic-key white-key'}
                                  onPointerDown={() => triggerChromaticKey(key.semitoneOffset)}
                                  onPointerUp={() => releaseChromaticKey(key.semitoneOffset)}
                                  onPointerLeave={() => releaseChromaticKey(key.semitoneOffset)}
                                  onBlur={() => releaseChromaticKey(key.semitoneOffset)}
                                >
                                  <span className="editor-chromatic-note-label">{getChromaticNoteLabel(chromaticOctave, key.semitoneOffset)}</span>
                                  <span className="editor-chromatic-keyboard-label">{key.keyboardKey}</span>
                                </button>
                              )
                            })}
                          </div>
                          <div className="editor-chromatic-black-keys">
                            {chromaticKeyLayout.filter((key) => key.kind === 'black').map((key) => {
                              const relativeSemitone = getChromaticRelativeSemitone(chromaticOctave, key.semitoneOffset)
                              const noteId = buildChromaticNoteId(currentBankId, selectedPad.id, relativeSemitone)
                              const isActive = activeChromaticNoteSet.has(noteId) || activeChromaticNoteSet.has(noteId + ':arp')

                              return (
                                <button
                                  key={key.id}
                                  type="button"
                                  className={isActive ? 'editor-chromatic-key black-key is-active' : 'editor-chromatic-key black-key'}
                                  style={{ left: `${key.blackCenterPercent ?? 0}%` }}
                                  onPointerDown={() => triggerChromaticKey(key.semitoneOffset)}
                                  onPointerUp={() => releaseChromaticKey(key.semitoneOffset)}
                                  onPointerLeave={() => releaseChromaticKey(key.semitoneOffset)}
                                  onBlur={() => releaseChromaticKey(key.semitoneOffset)}
                                >
                                  <span className="editor-chromatic-note-label">{getChromaticNoteLabel(chromaticOctave, key.semitoneOffset)}</span>
                                  <span className="editor-chromatic-keyboard-label">{key.keyboardKey}</span>
                                </button>
                              )
                            })}
                          </div>
                        </div>

                        <p className="editor-chromatic-note">
                          Use <strong>A W S E D F T G Y H U J K</strong> for notes and <strong>Z / X</strong> to shift octaves.
                        </p>
                      </div>
                    ) : null}
                  </div>

                </div>
              ) : null}
              {editorSource === 'loop' && generatedLoop ? (
                <div className="editor-loop-footer">
                  <div className="work-surface-actions editor-loop-actions">
                    <button type="button" className="work-tab is-current" onClick={() => { void toggleLoopPreview() }}>
                      {isLoopPlaying ? 'Stop Loop' : 'Play Loop'}
                    </button>
                    <button
                      type="button"
                      className="work-tab"
                      onClick={() => {
                        void normalizeLoopSource()
                      }}
                      disabled={isNormalizingLoop}
                    >
                      {isNormalizingLoop ? 'Normalizing...' : 'Normalize'}
                    </button>
                    <button
                      type="button"
                      className="work-tab"
                      onClick={() => {
                        if (selectedChop) {
                          void auditionLoopChop(selectedChop)
                        }
                      }}
                      disabled={!selectedChop}
                    >
                      {selectedChop ? `Audition ${formatChopRegionLabel(selectedChop.id)}` : 'Select a Chop'}
                    </button>
                    <button
                      type="button"
                      className="work-tab"
                      onClick={resetLoopChops}
                      disabled={loopChopRegions.length === 0}
                    >
                      Reset Chops
                    </button>
                    <label className="bank-load-field">
                      <select value={loopTargetBankId} onChange={(event) => setLoopTargetBankId(event.target.value as BankId)}>
                        {bankIds.map((bankId) => (
                          <option key={bankId} value={bankId}>
                            Bank {bankId}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      className="work-tab is-current"
                      onClick={() => loadLoopToBank(loopTargetBankId)}
                      disabled={loopChopRegions.length === 0}
                    >
                      Add to Bank
                    </button>
                  </div>

                  <div className="editor-loop-meta">
                    <div className="editor-loop-focus">
                      <span className="transport-label">Selected Chop</span>
                      <strong>{selectedChop ? formatChopRegionLabel(selectedChop.id) : 'None'}</strong>
                      <span>
                        {selectedChop && selectedChopDurationSeconds !== null
                          ? `${selectedChop.start.toFixed(2)}s-${selectedChop.end.toFixed(2)}s · ${selectedChopDurationSeconds.toFixed(2)}s`
                          : 'Click a slice to audition it.'}
                      </span>
                    </div>
                    <p className="editor-loop-tip">
                      Drag the divider lines in the waveform to resize slices before you load the loop into a bank.
                    </p>
                  </div>
                </div>
              ) : null}
            </div>
          </motion.div>
        ) : workView === 'mixer' ? (
          <motion.div key="mixer" variants={workSurfaceVariants} initial="initial" animate="animate" exit="exit" custom={workViewDirectionRef.current} transition={workSurfaceTransition} style={{ overflow: 'hidden' }}>
          <MixerWorkspace
            bankMixerGains={bankMixerGains}
            bankMixerMuted={bankMixerMuted}
            bankMixerSoloed={bankMixerSoloed}
            masterOutputGain={masterOutputGain}
            currentBankId={currentBankId}
            currentBankPads={currentBankPads}
            currentBankState={currentBankState}
            isExportingSequence={isExportingSequence}
            sequenceExportMessage={sequenceExportMessage}
            onBankGainChange={updateBankMixerGain}
            onToggleMute={toggleBankMute}
            onToggleSolo={toggleBankSolo}
            onMasterGainChange={setMasterOutputGain}
            onExportSequence={() => { void exportSequenceClip() }}
            onSwitchBank={switchBank}
            onPadGainChange={updatePadGain}
            onPadPanChange={updatePadPan}
          />
          </motion.div>
        ) : workView === 'effects' ? (
          <motion.div key="effects" variants={workSurfaceVariants} initial="initial" animate="animate" exit="exit" custom={workViewDirectionRef.current} transition={workSurfaceTransition} style={{ overflow: 'hidden' }}>
          <EffectsWorkspace
            bankEffects={bankEffects}
            masterEffect={masterEffect}
            effectsList={effectsList}
            onSlotEffectSelect={handleSlotEffectSelect}
            onSlotParamChange={handleSlotParamChange}
            onSlotToggleEnabled={handleSlotToggleEnabled}
          />
          </motion.div>
        ) : (
          <motion.div key="sequence" variants={workSurfaceVariants} initial="initial" animate="animate" exit="exit" custom={workViewDirectionRef.current} transition={workSurfaceTransition} style={{ overflow: 'hidden' }}>
          <SequenceWorkspace
            sequencePromptText={sequencePromptText}
            sequenceGenerationStatus={sequenceGenerationStatus}
            sequenceGenerationAction={sequenceGenerationAction}
            currentBankId={currentBankId}
            currentBankPads={currentBankPads}
            currentSequenceLength={currentSequenceLength}
            currentStepPattern={currentStepPattern}
            currentStepSemitoneOffsets={currentStepSemitoneOffsets}
            currentSequenceMuted={currentSequenceMuted}
            sequencePlayheadStep={sequencePlayheadStep}
            selectedPad={selectedPad}
            sequenceCount={currentBankState.sequences.length}
            activeSequenceIndex={currentBankState.activeSequenceIndex}
            onPromptChange={setSequencePromptText}
            onGenerateSequence={() => { void generateSequence() }}
            onRandomizeSequence={() => { void randomizeSequence() }}
            onClearSequence={clearSequence}
            onUpdateSequenceLength={updateSequenceLength}
            onSwitchBank={switchBank}
            onSelectPad={(padId) => updateCurrentBank((bank) => ({ ...bank, selectedPadId: padId }))}
            onTriggerPad={triggerPad}
            onReleasePad={releasePad}
            onToggleStep={toggleSequenceStep}
            onTogglePadMute={toggleSequencePadMute}
            onSwitchSequence={switchSequence}
            onAddSequence={addSequence}
          />
          </motion.div>
        )}
        </AnimatePresence>
      </header>

      <section className="workspace">
        <section className="pads panel">
          <div className="panel-heading pads-panel-heading">
            <p className="panel-kicker">Pads</p>
            <div className="pads-panel-actions">
              <button
                type="button"
                className="secondary-button midi-toggle-button"
                onClick={() => { void exportKit() }}
                disabled={isExportingKit}
              >
                <span>{isExportingKit ? 'Exporting...' : 'Export Kit'}</span>
              </button>
            <button
              type="button"
              className={
                'secondary-button midi-toggle-button' +
                (isMidiPanelOpen ? ' is-open' : '') +
                (selectedMidiInputId ? ' is-live' : '')
              }
              aria-expanded={isMidiPanelOpen}
              aria-controls="pads-midi-panel"
              onClick={toggleMidiPanel}
            >
              <span className={selectedMidiInputId ? 'midi-toggle-indicator is-live' : 'midi-toggle-indicator'} aria-hidden="true" />
              <span>MIDI</span>
            </button>
            </div>
          </div>

          <div className="bank-switcher" aria-label="Pad banks">
            <div className="bank-buttons" role="tablist" aria-label="Pad banks">
              {bankIds.map((bankId) => (
                <div
                  key={bankId}
                  className="bank-button-group"
                  ref={openBankPopover === bankId ? bankPopoverRef : undefined}
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={currentBankId === bankId}
                    className={currentBankId === bankId ? 'bank-button is-current' : 'bank-button'}
                    onClick={() => switchBank(bankId)}
                  >
                    <span>Bank {bankId}</span>
                    <span
                      role="button"
                      aria-label={`Select bank content for slot ${bankId}`}
                      className="bank-chevron"
                      onClick={(e) => { e.stopPropagation(); setOpenBankPopover(openBankPopover === bankId ? null : bankId) }}
                    >
                      <ChevronDown size={10} />
                    </span>
                  </button>
                  {openBankPopover === bankId && (
                    <div className="bank-popover">
                      <div className="bank-popover-section-label">Defaults</div>
                      {bankIds.map((defaultId) => (
                        <button
                          key={`default-${defaultId}`}
                          type="button"
                          className="bank-popover-item"
                          onClick={() => loadDefaultBank(bankId, defaultId)}
                        >
                          {{ A: 'Drums A', B: 'Kraftpunk B', C: 'Ice Drums C', D: 'Red Guitar D' }[defaultId]}
                        </button>
                      ))}
                      {bankSnapshots.length > 0 && (
                        <>
                          <div className="bank-popover-section-label">Generated</div>
                          {bankSnapshots.map((snapshot) => (
                            <button
                              key={snapshot.id}
                              type="button"
                              className="bank-popover-item"
                              onClick={() => loadBankFromSnapshot(bankId, snapshot)}
                            >
                              {snapshot.label}
                            </button>
                          ))}
                        </>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {isMidiPanelOpen ? (
            <div className="midi-panel" id="pads-midi-panel">
              {midiAccessState === 'ready' ? (
                <>
                  <button type="button" className="midi-toggle-button midi-connect-button" onClick={disableMidiInput}>
                    Disable
                  </button>
                  <button type="button" className="midi-toggle-button midi-connect-button" onClick={() => { void enableMidiInput() }}>
                    Rescan
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="midi-toggle-button midi-connect-button"
                  onClick={() => { void enableMidiInput() }}
                  disabled={midiAccessState === 'connecting'}
                >
                  {midiAccessState === 'connecting' ? 'Connecting...' : 'Enable'}
                </button>
              )}
              <select
                className="midi-device-select"
                value={selectedMidiInputId ?? ''}
                onChange={(event) => handleMidiInputSelection(event.target.value || null)}
                disabled={!midiSupported || availableMidiInputs.length === 0}
              >
                {availableMidiInputs.length === 0 ? (
                  <option value="">No MIDI inputs</option>
                ) : (
                  availableMidiInputs.map((input) => (
                    <option key={input.id} value={input.id}>
                      {input.name}
                    </option>
                  ))
                )}
              </select>
              {midiLearnPadId ? (
                <button
                  type="button"
                  className="midi-toggle-button midi-learn-cancel"
                  onClick={cancelMidiLearn}
                >
                  Cancel Learn
                </button>
              ) : null}
            </div>
          ) : null}

          <div className="pad-grid" aria-label="Sample pad grid">
            {currentBankPads.map((pad) => {
              const isMidiLearningPad = midiLearnPadId === pad.id
              const midiNoteNumber = midiPadNoteMappings[pad.id]

              return (
                <div key={pad.id} className={isMidiLearningPad ? 'pad-tile is-midi-learning' : 'pad-tile'}>
                  <button
                    type="button"
                    className={
                      'pad pad-' +
                      pad.group +
                      (selectedPad.id === pad.id ? ' is-selected' : '') +
                      (activePadIds.includes(pad.id) ? ' is-active' : '') +
                      (isMidiLearningPad ? ' is-midi-learning' : '')
                    }
                    aria-pressed={selectedPad.id === pad.id}
                    onPointerDown={() => triggerPad(pad.id)}
                    onPointerUp={() => releasePad(pad.id)}
                    onPointerLeave={() => releasePad(pad.id)}
                    onBlur={() => releasePad(pad.id)}
                  >
                    <span className="pad-key">{pad.keyTrigger}</span>
                    <span className="pad-group">{groupLabels[pad.group]}</span>
                    <strong>{pad.label}</strong>
                    {isMidiEnabled ? (
                      <span
                        className={isMidiLearningPad ? 'pad-midi-inline is-learning' : 'pad-midi-inline'}
                        onClick={(e) => { e.stopPropagation(); toggleMidiLearnForPad(pad) }}
                        title={isMidiLearningPad
                          ? `Press a MIDI note to map ${pad.label}.`
                          : `Map a MIDI note to ${pad.label}. Current note: ${formatMidiNoteLabel(midiNoteNumber)}.`}
                      >
                        {isMidiLearningPad ? 'MIDI: Learn...' : `MIDI: ${formatMidiNoteLabel(midiNoteNumber)}`}
                      </span>
                    ) : null}
                    <span className="pad-sample">{pad.sampleName}</span>
                  </button>
                </div>
              )
            })}
          </div>
        </section>


        <GenerationPanel
          promptText={promptText}
          generationStatus={generationStatus}
          generationMode={generationMode}
          onPromptChange={setPromptText}
          onGenerateAudio={(mode) => { void generateAudio(mode) }}
        />

      </section>

      <ChatPanel isOpen={isChatOpen} onClose={() => setIsChatOpen(false)} />

      <footer className="app-footer">
        Built by <a href="https://coolbrb.com" target="_blank" rel="noopener noreferrer">Bruce Blay</a> · <a href="https://github.com/bruceblay" target="_blank" rel="noopener noreferrer">GitHub</a> · <a href="https://meltingseason.bandcamp.com/album/curl" target="_blank" rel="noopener noreferrer">Bandcamp</a>
      </footer>
    </main>
    </TooltipProvider>
  )
}

export default App
