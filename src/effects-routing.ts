import type { GlobalEffectRoutingOptions, GlobalEffectRoutingResult } from './types'
import {
  clamp,
  buildDistortionCurve,
  buildImpulseResponse,
  buildNoiseBuffer,
  buildTapeSaturationCurve,
  createBitcrusherNode,
  createLoopChopNode,
  createSidechainPumpNode,
  createTapeStopNode,
  getAutoFilterSweep,
  getChorusModulationDepth,
  getLfoWaveform,
  getPitchShiftSettings,
  getSubdivisionSeconds,
} from './audio-utils'

export const createGlobalEffectRouting = ({
  context,
  effectInput,
  masterGain,
  effectId,
  effectEnabled,
  isEffectSupported,
  effectParams,
}: GlobalEffectRoutingOptions): GlobalEffectRoutingResult => {
  try {
    effectInput.disconnect()
  } catch {}

  if (!effectEnabled || !isEffectSupported) {
    effectInput.connect(masterGain)
    return {
      cleanup: () => {
        try {
          effectInput.disconnect()
        } catch {}
      },
      runtime: null,
    }
  }

  const dryGain = context.createGain()
  const wetGain = context.createGain()
  const wet = clamp(effectParams.wet ?? 0.5, 0, 1)
  const mixLaw = effectId === 'taptempodelay' || effectId === 'loopchop' ? 'equalPower' : 'linear'
  dryGain.gain.value = mixLaw === 'equalPower' ? Math.sqrt(1 - wet) : 1 - wet
  wetGain.gain.value = mixLaw === 'equalPower' ? Math.sqrt(wet) : wet

  effectInput.connect(dryGain)
  dryGain.connect(masterGain)

  const cleanupNodes: AudioNode[] = [effectInput, dryGain, wetGain]
  const cleanupSources: AudioScheduledSourceNode[] = []
  const runtimeRefs: Record<string, unknown> = { dryGain, wetGain, mixLaw }

  const startSource = (source: AudioScheduledSourceNode) => {
    source.start()
    cleanupSources.push(source)
  }

  const finishWetChain = (node: AudioNode) => {
    node.connect(wetGain)
    wetGain.connect(masterGain)
  }

  if (effectId === 'simplefilter') {
    const filter = context.createBiquadFilter()
    const filterType = ['lowpass', 'highpass', 'bandpass'][Math.max(0, Math.min(2, Math.round(effectParams.filterType ?? 0)))] as BiquadFilterType

    filter.type = filterType
    filter.frequency.value = clamp(effectParams.cutoffFreq ?? 2000, 20, 20000)
    filter.Q.value = clamp(effectParams.resonance ?? 15, 0.0001, 30)

    effectInput.connect(filter)
    finishWetChain(filter)
    cleanupNodes.push(filter)
    runtimeRefs.filter = filter
  } else if (effectId === 'autofilter') {
    const filter = context.createBiquadFilter()
    const lfo = context.createOscillator()
    const lfoGain = context.createGain()
    const { centerFrequency, modulationDepth } = getAutoFilterSweep(
      effectParams.baseFreq ?? 990,
      effectParams.octaves ?? 1,
      effectParams.depth ?? 0.8,
    )

    filter.type = 'lowpass'
    filter.Q.value = 2
    filter.frequency.value = centerFrequency
    lfo.type = 'sine'
    lfo.frequency.value = clamp(effectParams.rate ?? 5, 0.1, 10)
    lfoGain.gain.value = modulationDepth

    effectInput.connect(filter)
    finishWetChain(filter)
    lfo.connect(lfoGain)
    lfoGain.connect(filter.frequency)
    startSource(lfo)
    cleanupNodes.push(filter, lfoGain, lfo)
    runtimeRefs.filter = filter
    runtimeRefs.lfo = lfo
    runtimeRefs.lfoGain = lfoGain
  } else if (effectId === 'autopanner') {
    const panner = typeof context.createStereoPanner === 'function' ? context.createStereoPanner() : null
    const lfo = context.createOscillator()
    const lfoGain = context.createGain()

    if (panner) {
      lfo.type = getLfoWaveform(effectParams.type ?? 0)
      lfo.frequency.value = clamp(effectParams.rate ?? 2, 0.1, 10)
      lfoGain.gain.value = clamp(effectParams.depth ?? 0.8, 0, 1)
      effectInput.connect(panner)
      finishWetChain(panner)
      lfo.connect(lfoGain)
      lfoGain.connect(panner.pan)
      startSource(lfo)
      cleanupNodes.push(panner, lfoGain, lfo)
      runtimeRefs.panner = panner
      runtimeRefs.lfo = lfo
      runtimeRefs.lfoGain = lfoGain
    } else {
      effectInput.connect(wetGain)
      wetGain.connect(masterGain)
    }
  } else if (effectId === 'delay') {
    const delay = context.createDelay(2)
    const feedbackGain = context.createGain()

    delay.delayTime.value = clamp(effectParams.delayTime ?? 0.25, 0.01, 2)
    feedbackGain.gain.value = clamp(effectParams.feedback ?? 0.3, 0, 0.95)

    effectInput.connect(delay)
    delay.connect(feedbackGain)
    feedbackGain.connect(delay)
    finishWetChain(delay)
    cleanupNodes.push(delay, feedbackGain)
    runtimeRefs.delay = delay
    runtimeRefs.feedbackGain = feedbackGain
  } else if (effectId === 'taptempodelay') {
    const delay = context.createDelay(2)
    const feedbackGain = context.createGain()
    const delaySeconds = getSubdivisionSeconds(effectParams.tapTempo ?? 120, effectParams.subdivision ?? 1)

    delay.delayTime.value = clamp(delaySeconds, 0.01, 2)
    feedbackGain.gain.value = clamp(effectParams.feedback ?? 0.4, 0, 0.95)

    effectInput.connect(delay)
    delay.connect(feedbackGain)
    feedbackGain.connect(delay)
    finishWetChain(delay)
    cleanupNodes.push(delay, feedbackGain)
    runtimeRefs.delay = delay
    runtimeRefs.feedbackGain = feedbackGain
  } else if (effectId === 'distortion') {
    const shaper = context.createWaveShaper()
    const toneFilter = context.createBiquadFilter()
    const amount = clamp(effectParams.amount ?? 0.5, 0, 1)
    const tone = clamp(effectParams.tone ?? 0.5, 0, 1)

    shaper.curve = buildDistortionCurve(amount)
    shaper.oversample = '4x'
    toneFilter.type = 'lowpass'
    toneFilter.frequency.value = 2000 + tone * 8000

    effectInput.connect(shaper)
    shaper.connect(toneFilter)
    finishWetChain(toneFilter)
    cleanupNodes.push(shaper, toneFilter)
    runtimeRefs.shaper = shaper
    runtimeRefs.toneFilter = toneFilter
  } else if (effectId === 'bitcrusher') {
    const crusher = createBitcrusherNode(context, effectParams.bits ?? 8, effectParams.normalRange ?? 0.4)

    effectInput.connect(crusher)
    finishWetChain(crusher)
    cleanupNodes.push(crusher)
    runtimeRefs.crusher = crusher
  } else if (effectId === 'reverb') {
    const convolver = context.createConvolver()
    convolver.buffer = buildImpulseResponse(context, clamp(effectParams.roomSize ?? 0.7, 0, 1), clamp(effectParams.decay ?? 2, 0.2, 10))

    effectInput.connect(convolver)
    finishWetChain(convolver)
    cleanupNodes.push(convolver)
    runtimeRefs.convolver = convolver
  } else if (effectId === 'hallreverb') {
    const preDelay = context.createDelay(1)
    const convolver = context.createConvolver()
    const damping = context.createBiquadFilter()

    preDelay.delayTime.value = clamp(effectParams.preDelay ?? 0.03, 0, 1)
    convolver.buffer = buildImpulseResponse(context, clamp(effectParams.roomSize ?? 0.8, 0, 1), clamp(effectParams.decay ?? 4, 0.2, 10), 'hall')
    damping.type = 'lowpass'
    damping.frequency.value = clamp(effectParams.damping ?? 6000, 500, 12000)

    effectInput.connect(preDelay)
    preDelay.connect(convolver)
    convolver.connect(damping)
    finishWetChain(damping)
    cleanupNodes.push(preDelay, convolver, damping)
    runtimeRefs.preDelay = preDelay
    runtimeRefs.convolver = convolver
    runtimeRefs.damping = damping
  } else if (effectId === 'compressor') {
    const compressor = context.createDynamicsCompressor()
    compressor.threshold.value = clamp(effectParams.threshold ?? -24, -60, 0)
    compressor.ratio.value = clamp(effectParams.ratio ?? 4, 1, 20)
    compressor.attack.value = clamp(effectParams.attack ?? 0.003, 0, 1)
    compressor.knee.value = 24
    compressor.release.value = 0.2

    effectInput.connect(compressor)
    finishWetChain(compressor)
    cleanupNodes.push(compressor)
    runtimeRefs.compressor = compressor
  } else if (effectId === 'djeq') {
    const low = context.createBiquadFilter()
    const mid = context.createBiquadFilter()
    const high = context.createBiquadFilter()

    low.type = 'lowshelf'
    low.frequency.value = 100
    low.gain.value = clamp(effectParams.lowGain ?? 0, -15, 15)
    mid.type = 'peaking'
    mid.frequency.value = 1000
    mid.Q.value = 1
    mid.gain.value = clamp(effectParams.midGain ?? 0, -15, 15)
    high.type = 'highshelf'
    high.frequency.value = 10000
    high.gain.value = clamp(effectParams.highGain ?? 0, -15, 15)

    effectInput.connect(low)
    low.connect(mid)
    mid.connect(high)
    finishWetChain(high)
    cleanupNodes.push(low, mid, high)
    runtimeRefs.low = low
    runtimeRefs.mid = mid
    runtimeRefs.high = high
  } else if (effectId === 'chorus') {
    const delay1 = context.createDelay(0.1)
    const delay2 = context.createDelay(0.1)
    const panner1 = context.createStereoPanner()
    const panner2 = context.createStereoPanner()
    const lfo1 = context.createOscillator()
    const lfo2 = context.createOscillator()
    const lfoGain1 = context.createGain()
    const lfoGain2 = context.createGain()
    const delayMs = clamp(effectParams.delay ?? 14, 2, 30)
    const depth = clamp(effectParams.depth ?? 0.35, 0, 1)

    delay1.delayTime.value = delayMs / 1000
    delay2.delayTime.value = (delayMs * 1.5) / 1000
    panner1.pan.value = -0.6
    panner2.pan.value = 0.6
    lfo1.type = 'sine'
    lfo2.type = 'sine'
    lfo1.frequency.value = clamp(effectParams.rate ?? 1, 0.1, 10)
    lfo2.frequency.value = lfo1.frequency.value * 1.23
    lfoGain1.gain.value = getChorusModulationDepth(delayMs, depth)
    lfoGain2.gain.value = getChorusModulationDepth(delayMs * 1.5, depth) * 0.8

    effectInput.connect(delay1)
    effectInput.connect(delay2)
    delay1.connect(panner1)
    delay2.connect(panner2)
    panner1.connect(wetGain)
    panner2.connect(wetGain)
    wetGain.connect(masterGain)
    lfo1.connect(lfoGain1)
    lfo2.connect(lfoGain2)
    lfoGain1.connect(delay1.delayTime)
    lfoGain2.connect(delay2.delayTime)
    startSource(lfo1)
    startSource(lfo2)
    cleanupNodes.push(delay1, delay2, panner1, panner2, lfo1, lfo2, lfoGain1, lfoGain2)
    runtimeRefs.delay1 = delay1
    runtimeRefs.delay2 = delay2
    runtimeRefs.lfo1 = lfo1
    runtimeRefs.lfo2 = lfo2
    runtimeRefs.lfoGain1 = lfoGain1
    runtimeRefs.lfoGain2 = lfoGain2
  } else if (effectId === 'vibrato') {
    const delay = context.createDelay(0.1)
    const lfo = context.createOscillator()
    const lfoGain = context.createGain()

    delay.delayTime.value = 0.01
    lfo.type = getLfoWaveform(effectParams.type ?? 0)
    lfo.frequency.value = clamp(effectParams.rate ?? 5, 0.1, 20)
    lfoGain.gain.value = clamp(effectParams.depth ?? 0.3, 0, 1) * 0.01

    effectInput.connect(delay)
    finishWetChain(delay)
    lfo.connect(lfoGain)
    lfoGain.connect(delay.delayTime)
    startSource(lfo)
    cleanupNodes.push(delay, lfoGain, lfo)
    runtimeRefs.delay = delay
    runtimeRefs.lfo = lfo
    runtimeRefs.lfoGain = lfoGain
  } else if (effectId === 'pitchshifter') {
    const delay1 = context.createDelay(0.5)
    const delay2 = context.createDelay(0.5)
    const fade1 = context.createGain()
    const fade2 = context.createGain()
    const ramp1 = context.createOscillator()
    const ramp2 = context.createOscillator()
    const rampDepth1 = context.createGain()
    const rampDepth2 = context.createGain()
    const windowOscillator = context.createOscillator()
    const windowDown = context.createGain()
    const windowUp = context.createGain()
    const harmonicCount = 512
    const makeSawWave = (shifted: boolean) => {
      const real = new Float32Array(harmonicCount)
      const imaginary = new Float32Array(harmonicCount)
      for (let harmonic = 1; harmonic < harmonicCount; harmonic += 1) {
        imaginary[harmonic] = ((2 / Math.PI) / harmonic) * (shifted && harmonic % 2 === 1 ? -1 : 1)
      }
      return context.createPeriodicWave(real, imaginary, { disableNormalization: true })
    }
    const cosineReal = new Float32Array(2)
    cosineReal[1] = 1
    const cosineWave = context.createPeriodicWave(cosineReal, new Float32Array(2), { disableNormalization: true })
    const settings = getPitchShiftSettings(effectParams.pitch ?? 2, effectParams.windowSize ?? 0.05)

    ramp1.setPeriodicWave(makeSawWave(false))
    ramp2.setPeriodicWave(makeSawWave(true))
    windowOscillator.setPeriodicWave(cosineWave)
    delay1.delayTime.value = settings.window
    delay2.delayTime.value = settings.window
    ramp1.frequency.value = settings.rate
    ramp2.frequency.value = settings.rate
    windowOscillator.frequency.value = settings.rate
    rampDepth1.gain.value = settings.sweep
    rampDepth2.gain.value = settings.sweep
    fade1.gain.value = 0.5
    fade2.gain.value = 0.5
    windowDown.gain.value = -0.5
    windowUp.gain.value = 0.5

    ramp1.connect(rampDepth1)
    rampDepth1.connect(delay1.delayTime)
    ramp2.connect(rampDepth2)
    rampDepth2.connect(delay2.delayTime)
    windowOscillator.connect(windowDown)
    windowDown.connect(fade1.gain)
    windowOscillator.connect(windowUp)
    windowUp.connect(fade2.gain)
    effectInput.connect(delay1)
    effectInput.connect(delay2)
    delay1.connect(fade1)
    delay2.connect(fade2)
    fade1.connect(wetGain)
    fade2.connect(wetGain)
    wetGain.connect(masterGain)

    const startAt = context.currentTime
    ramp1.start(startAt)
    ramp2.start(startAt)
    windowOscillator.start(startAt)
    cleanupSources.push(ramp1, ramp2, windowOscillator)
    cleanupNodes.push(delay1, delay2, fade1, fade2, ramp1, ramp2, rampDepth1, rampDepth2, windowOscillator, windowDown, windowUp)
    runtimeRefs.delay1 = delay1
    runtimeRefs.delay2 = delay2
    runtimeRefs.ramp1 = ramp1
    runtimeRefs.ramp2 = ramp2
    runtimeRefs.rampDepth1 = rampDepth1
    runtimeRefs.rampDepth2 = rampDepth2
    runtimeRefs.windowOscillator = windowOscillator
  } else if (effectId === 'flanger') {
    const delay = context.createDelay(0.03)
    const feedbackGain = context.createGain()
    const lfo = context.createOscillator()
    const lfoGain = context.createGain()

    delay.delayTime.value = 0.005
    feedbackGain.gain.value = clamp(effectParams.feedback ?? 0.3, 0, 0.95)
    lfo.type = 'sine'
    lfo.frequency.value = clamp(effectParams.rate ?? 0.5, 0.1, 5)
    lfoGain.gain.value = clamp((effectParams.depth ?? 50) / 100, 0, 1) * 0.0045

    effectInput.connect(delay)
    delay.connect(feedbackGain)
    feedbackGain.connect(delay)
    delay.connect(wetGain)
    wetGain.connect(masterGain)
    lfo.connect(lfoGain)
    lfoGain.connect(delay.delayTime)
    startSource(lfo)
    cleanupNodes.push(delay, feedbackGain, lfoGain, lfo)
    runtimeRefs.delay = delay
    runtimeRefs.feedbackGain = feedbackGain
    runtimeRefs.lfo = lfo
    runtimeRefs.lfoGain = lfoGain
  } else if (effectId === 'phaser') {
    const stages = Array.from({ length: 4 }, () => context.createBiquadFilter())
    const lfo = context.createOscillator()
    const lfoGain = context.createGain()
    const feedbackGain = context.createGain()

    const baseFrequencies = [500, 1000, 1500, 2000]
    for (const [index, stage] of stages.entries()) {
      stage.type = 'allpass'
      stage.Q.value = 1
      stage.frequency.value = baseFrequencies[index] ?? 1000
    }

    lfo.type = 'sine'
    lfo.frequency.value = clamp(effectParams.rate ?? 1, 0.1, 5)
    lfoGain.gain.value = 500 * clamp(effectParams.depth ?? 0.7, 0, 1)
    feedbackGain.gain.value = clamp(effectParams.feedback ?? 0.3, 0, 0.9)

    effectInput.connect(stages[0])
    stages[0].connect(stages[1])
    stages[1].connect(stages[2])
    stages[2].connect(stages[3])
    stages[3].connect(feedbackGain)
    feedbackGain.connect(stages[0])
    finishWetChain(stages[3])
    lfo.connect(lfoGain)
    for (const stage of stages) {
      lfoGain.connect(stage.frequency)
    }
    startSource(lfo)
    cleanupNodes.push(...stages, feedbackGain, lfoGain, lfo)
    runtimeRefs.stages = stages
    runtimeRefs.feedbackGain = feedbackGain
    runtimeRefs.lfo = lfo
    runtimeRefs.lfoGain = lfoGain
  } else if (effectId === 'combfilter') {
    const delay = context.createDelay(0.1)
    const feedbackGain = context.createGain()
    const feedforwardGain = context.createGain()
    delay.delayTime.value = clamp(effectParams.delayTime ?? 0.01, 0.001, 0.05)
    feedbackGain.gain.value = clamp(effectParams.feedback ?? 0.7, 0, 0.98)
    feedforwardGain.gain.value = clamp(effectParams.feedforward ?? 0.5, 0, 1)

    effectInput.connect(delay)
    delay.connect(feedbackGain)
    feedbackGain.connect(delay)
    effectInput.connect(wetGain)
    delay.connect(feedforwardGain)
    feedforwardGain.connect(wetGain)
    wetGain.connect(masterGain)
    cleanupNodes.push(delay, feedbackGain, feedforwardGain)
    runtimeRefs.delay = delay
    runtimeRefs.feedbackGain = feedbackGain
    runtimeRefs.feedforwardGain = feedforwardGain
  } else if (effectId === 'ringmodulator') {
    const carrier = context.createOscillator()
    const carrierGain = context.createGain()
    const ringGain = context.createGain()
    const directMixGain = context.createGain()
    const ringMixGain = context.createGain()
    const internalMix = clamp((effectParams.mix ?? 50) / 100, 0, 1)

    carrier.type = getLfoWaveform(effectParams.waveform ?? 0)
    carrier.frequency.value = clamp(effectParams.carrierFreq ?? 200, 10, 2000)
    carrierGain.gain.value = 1
    ringGain.gain.value = 0
    directMixGain.gain.value = Math.sqrt(1 - internalMix)
    // A sine carrier has half the input power, so sqrt(2) is the neutral-RMS
    // gain at the fully modulated end of the internal mix.
    ringMixGain.gain.value = Math.sqrt(2 * internalMix)

    effectInput.connect(ringGain)
    effectInput.connect(directMixGain)
    ringGain.connect(ringMixGain)
    directMixGain.connect(wetGain)
    ringMixGain.connect(wetGain)
    wetGain.connect(masterGain)
    carrier.connect(carrierGain)
    carrierGain.connect(ringGain.gain)
    startSource(carrier)
    cleanupNodes.push(ringGain, carrierGain, carrier, directMixGain, ringMixGain)
    runtimeRefs.carrier = carrier
    runtimeRefs.ringGain = ringGain
    runtimeRefs.directMixGain = directMixGain
    runtimeRefs.ringMixGain = ringMixGain
  } else if (effectId === 'loopchop') {
    const processor = createLoopChopNode(
      context,
      effectParams.loopSize ?? 2,
      effectParams.stutterRate ?? 4,
      effectParams.tempo ?? 120,
    )

    effectInput.connect(processor)
    finishWetChain(processor)
    cleanupNodes.push(processor)
    runtimeRefs.processor = processor
  } else if (effectId === 'tremolo') {
    const stereoInput = context.createGain()
    const splitter = context.createChannelSplitter(2)
    const merger = context.createChannelMerger(2)
    const ampLeft = context.createGain()
    const ampRight = context.createGain()
    const lfo = context.createOscillator()
    const lfoGain = context.createGain()
    const depth = clamp(effectParams.depth ?? 0.7, 0, 1)
    const rate = clamp(effectParams.rate ?? 6, 0.1, 20)
    const spreadDelay = context.createDelay(10)

    stereoInput.channelCount = 2
    stereoInput.channelCountMode = 'explicit'
    ampLeft.gain.value = 1 - depth / 2
    ampRight.gain.value = 1 - depth / 2
    lfo.type = 'sine'
    lfo.frequency.value = rate
    lfoGain.gain.value = depth / 2
    spreadDelay.delayTime.value = (clamp(effectParams.spread ?? 40, 0, 180) / 360) / rate

    effectInput.connect(stereoInput)
    stereoInput.connect(splitter)
    splitter.connect(ampLeft, 0)
    splitter.connect(ampRight, 1)
    ampLeft.connect(merger, 0, 0)
    ampRight.connect(merger, 0, 1)
    merger.connect(wetGain)
    wetGain.connect(masterGain)
    lfo.connect(lfoGain)
    lfoGain.connect(ampLeft.gain)
    lfoGain.connect(spreadDelay)
    spreadDelay.connect(ampRight.gain)
    startSource(lfo)
    cleanupNodes.push(stereoInput, splitter, merger, ampLeft, ampRight, spreadDelay, lfoGain, lfo)
    runtimeRefs.ampLeft = ampLeft
    runtimeRefs.ampRight = ampRight
    runtimeRefs.spreadDelay = spreadDelay
    runtimeRefs.lfo = lfo
    runtimeRefs.lfoGain = lfoGain
  } else if (effectId === 'sidechainpump') {
    const processor = createSidechainPumpNode(
      context,
      effectParams.filterFreq ?? 100,
      effectParams.sensitivity ?? 0.1,
      effectParams.depth ?? 0.8,
      effectParams.attack ?? 0.005,
      effectParams.release ?? 0.25,
    )

    effectInput.connect(processor)
    finishWetChain(processor)
    cleanupNodes.push(processor)
    runtimeRefs.processor = processor
  } else if (effectId === 'tapestop') {
    const processor = createTapeStopNode(context, effectParams.stopTime ?? 1, effectParams.restartTime ?? 0.5, effectParams.mode ?? 2)

    effectInput.connect(processor)
    finishWetChain(processor)
    cleanupNodes.push(processor)
    runtimeRefs.processor = processor
  } else if (effectId === 'lofitape') {
    const shaper = context.createWaveShaper()
    const tone = context.createBiquadFilter()
    const wobble = context.createDelay(0.05)
    const wowLfo = context.createOscillator()
    const flutterLfo = context.createOscillator()
    const wowGain = context.createGain()
    const flutterGain = context.createGain()
    const noiseSource = context.createBufferSource()
    const noiseHighpass = context.createBiquadFilter()
    const noiseGain = context.createGain()

    shaper.curve = buildTapeSaturationCurve(effectParams.saturation ?? 0.4)
    shaper.oversample = '2x'
    tone.type = 'lowpass'
    tone.frequency.value = clamp(effectParams.toneRolloff ?? 6000, 500, 12000)
    tone.Q.value = 0.7
    wobble.delayTime.value = 0.01
    wowLfo.type = 'sine'
    wowLfo.frequency.value = 0.4
    wowGain.gain.value = clamp(effectParams.wowDepth ?? 0.3, 0, 1) * 0.008
    flutterLfo.type = 'sine'
    flutterLfo.frequency.value = clamp(effectParams.flutterRate ?? 6, 0.1, 20)
    flutterGain.gain.value = 0.0003
    noiseSource.buffer = buildNoiseBuffer(context)
    noiseSource.loop = true
    noiseHighpass.type = 'highpass'
    noiseHighpass.frequency.value = 2000
    noiseHighpass.Q.value = 0.5
    noiseGain.gain.value = clamp(effectParams.noise ?? 0.1, 0, 1) * 0.05

    effectInput.connect(wobble)
    wobble.connect(shaper)
    shaper.connect(tone)
    tone.connect(wetGain)
    noiseSource.connect(noiseHighpass)
    noiseHighpass.connect(noiseGain)
    noiseGain.connect(wetGain)
    wetGain.connect(masterGain)
    wowLfo.connect(wowGain)
    wowGain.connect(wobble.delayTime)
    flutterLfo.connect(flutterGain)
    flutterGain.connect(wobble.delayTime)
    startSource(wowLfo)
    startSource(flutterLfo)
    startSource(noiseSource)
    cleanupNodes.push(shaper, tone, wobble, wowGain, flutterGain, wowLfo, flutterLfo, noiseSource, noiseHighpass, noiseGain)
    runtimeRefs.shaper = shaper
    runtimeRefs.tone = tone
    runtimeRefs.wobble = wobble
    runtimeRefs.wowLfo = wowLfo
    runtimeRefs.flutterLfo = flutterLfo
    runtimeRefs.wowGain = wowGain
    runtimeRefs.flutterGain = flutterGain
    runtimeRefs.noiseGain = noiseGain
  } else {
    effectInput.connect(wetGain)
    wetGain.connect(masterGain)
  }

  return {
    runtime: { effectId, refs: runtimeRefs },
    cleanup: () => {
      for (const source of cleanupSources) {
        try {
          source.stop()
        } catch {}
      }

      for (const node of cleanupNodes) {
        try {
          node.disconnect()
        } catch {}
      }
    },
  }
}
