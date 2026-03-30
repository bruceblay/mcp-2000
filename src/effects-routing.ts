import type { GlobalEffectRoutingOptions, GlobalEffectRoutingResult } from './types'
import { clamp, buildDistortionCurve, buildImpulseResponse, createBitcrusherNode, getSubdivisionSeconds, getLoopChopRate, getLfoWaveform } from './audio-utils'

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
  dryGain.gain.value = 1 - wet
  wetGain.gain.value = wet

  effectInput.connect(dryGain)
  dryGain.connect(masterGain)

  const cleanupNodes: AudioNode[] = [effectInput, dryGain, wetGain]
  const cleanupSources: AudioScheduledSourceNode[] = []
  const runtimeRefs: Record<string, unknown> = { dryGain, wetGain }

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
    filter.Q.value = clamp(effectParams.resonance ?? 5, 0.0001, 30)

    effectInput.connect(filter)
    finishWetChain(filter)
    cleanupNodes.push(filter)
    runtimeRefs.filter = filter
  } else if (effectId === 'autofilter') {
    const filter = context.createBiquadFilter()
    const lfo = context.createOscillator()
    const lfoGain = context.createGain()
    const baseFreq = clamp(effectParams.baseFreq ?? 990, 20, 12000)
    const depth = clamp(effectParams.depth ?? 0.8, 0, 1)
    const octaves = clamp(effectParams.octaves ?? 1, 1, 6)

    filter.type = 'lowpass'
    filter.Q.value = 6
    filter.frequency.value = baseFreq
    lfo.type = 'sine'
    lfo.frequency.value = clamp(effectParams.rate ?? 5, 0.1, 10)
    lfoGain.gain.value = baseFreq * (Math.pow(2, octaves) - 1) * depth

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
      effectInput.connect(masterGain)
    }
  } else if (effectId === 'delay') {
    const delay = context.createDelay(2)
    const feedbackGain = context.createGain()

    delay.delayTime.value = clamp(effectParams.delayTime ?? 0.2, 0.01, 2)
    feedbackGain.gain.value = clamp(effectParams.feedback ?? 0.5, 0, 0.95)

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
    toneFilter.frequency.value = 700 + tone * 7300

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
    convolver.buffer = buildImpulseResponse(context, clamp(effectParams.roomSize ?? 0.8, 0, 1), clamp(effectParams.decay ?? 4, 0.2, 10))
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
    low.frequency.value = 120
    low.gain.value = clamp(effectParams.lowGain ?? 0, -15, 15)
    mid.type = 'peaking'
    mid.frequency.value = 1100
    mid.Q.value = 1
    mid.gain.value = clamp(effectParams.midGain ?? 0, -15, 15)
    high.type = 'highshelf'
    high.frequency.value = 4500
    high.gain.value = clamp(effectParams.highGain ?? 0, -15, 15)

    effectInput.connect(low)
    low.connect(mid)
    mid.connect(high)
    finishWetChain(high)
    cleanupNodes.push(low, mid, high)
    runtimeRefs.low = low
    runtimeRefs.mid = mid
    runtimeRefs.high = high
  } else if (effectId === 'chorus' || effectId === 'vibrato' || effectId === 'pitchshifter') {
    const delay = context.createDelay(0.1)
    const lfo = context.createOscillator()
    const lfoGain = context.createGain()
    const baseDelay = effectId === 'pitchshifter'
      ? 0.02 + clamp(Math.abs(effectParams.pitch ?? 0), 0, 12) * 0.0012
      : effectId === 'vibrato'
        ? 0.008
        : clamp((effectParams.delay ?? 5) / 1000, 0.002, 0.03)
    const depth = effectId === 'pitchshifter'
      ? 0.001 + clamp(Math.abs(effectParams.pitch ?? 0), 0, 12) * 0.0005
      : clamp(effectParams.depth ?? 0.4, 0, 1) * 0.004

    delay.delayTime.value = baseDelay
    lfo.type = getLfoWaveform(effectParams.type ?? 0)
    lfo.frequency.value = clamp(effectParams.rate ?? 1.2, 0.1, 20)
    lfoGain.gain.value = depth

    effectInput.connect(delay)
    delay.connect(wetGain)
    wetGain.connect(masterGain)
    lfo.connect(lfoGain)
    lfoGain.connect(delay.delayTime)
    startSource(lfo)
    cleanupNodes.push(delay, lfoGain, lfo)
    runtimeRefs.delay = delay
    runtimeRefs.lfo = lfo
    runtimeRefs.lfoGain = lfoGain
  } else if (effectId === 'flanger') {
    const delay = context.createDelay(0.03)
    const feedbackGain = context.createGain()
    const lfo = context.createOscillator()
    const lfoGain = context.createGain()

    delay.delayTime.value = 0.0025
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

    for (const stage of stages) {
      stage.type = 'allpass'
      stage.Q.value = 0.7
      stage.frequency.value = 800
    }

    lfo.type = 'sine'
    lfo.frequency.value = clamp(effectParams.rate ?? 1, 0.1, 5)
    lfoGain.gain.value = 1200 * clamp(effectParams.depth ?? 0.4, 0, 1)
    feedbackGain.gain.value = clamp(effectParams.feedback ?? 0.7, 0, 0.9)

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
    feedbackGain.gain.value = clamp(effectParams.feedback ?? 0.95, 0, 0.98)
    feedforwardGain.gain.value = clamp(effectParams.feedforward ?? 0.5, 0, 1)

    effectInput.connect(delay)
    delay.connect(feedbackGain)
    feedbackGain.connect(delay)
    effectInput.connect(feedforwardGain)
    feedforwardGain.connect(wetGain)
    delay.connect(wetGain)
    wetGain.connect(masterGain)
    cleanupNodes.push(delay, feedbackGain, feedforwardGain)
    runtimeRefs.delay = delay
    runtimeRefs.feedbackGain = feedbackGain
    runtimeRefs.feedforwardGain = feedforwardGain
  } else if (effectId === 'ringmodulator') {
    const carrier = context.createOscillator()
    const carrierGain = context.createGain()
    const ringGain = context.createGain()

    carrier.type = getLfoWaveform(effectParams.waveform ?? 0)
    carrier.frequency.value = clamp(effectParams.carrierFreq ?? 200, 10, 2000)
    carrierGain.gain.value = clamp((effectParams.mix ?? 50) / 100, 0, 1)
    ringGain.gain.value = 0

    effectInput.connect(ringGain)
    ringGain.connect(wetGain)
    wetGain.connect(masterGain)
    carrier.connect(carrierGain)
    carrierGain.connect(ringGain.gain)
    startSource(carrier)
    cleanupNodes.push(ringGain, carrierGain, carrier)
    runtimeRefs.carrier = carrier
    runtimeRefs.carrierGain = carrierGain
    runtimeRefs.ringGain = ringGain
  } else if (effectId === 'tremolo' || effectId === 'sidechainpump' || effectId === 'loopchop') {
    const modGain = context.createGain()
    const lfo = context.createOscillator()
    const lfoGain = context.createGain()
    const offset = context.createConstantSource()
    const depth = effectId === 'loopchop'
      ? clamp(effectParams.wet ?? 0.8, 0, 1)
      : clamp(effectParams.depth ?? 0.8, 0, 1)
    const rate = effectId === 'tremolo'
      ? clamp(effectParams.rate ?? 6, 0.1, 20)
      : effectId === 'sidechainpump'
        ? clamp(0.75 + (effectParams.sensitivity ?? 0.1) * 12, 0.5, 8)
        : getLoopChopRate(effectParams.loopSize ?? 2, effectParams.stutterRate ?? 4)

    modGain.gain.value = 1 - depth / 2
    lfo.type = effectId === 'loopchop' ? 'square' : effectId === 'sidechainpump' ? 'sawtooth' : 'sine'
    lfo.frequency.value = rate
    lfoGain.gain.value = depth / 2
    offset.offset.value = 1 - depth / 2

    effectInput.connect(modGain)
    modGain.connect(wetGain)
    wetGain.connect(masterGain)
    offset.connect(modGain.gain)
    lfo.connect(lfoGain)
    lfoGain.connect(modGain.gain)
    startSource(offset)
    startSource(lfo)
    cleanupNodes.push(modGain, lfoGain, offset, lfo)
    runtimeRefs.modGain = modGain
    runtimeRefs.offset = offset
    runtimeRefs.lfo = lfo
    runtimeRefs.lfoGain = lfoGain
  } else if (effectId === 'tapestop') {
    const delay = context.createDelay(0.2)
    const lowpass = context.createBiquadFilter()
    const lfo = context.createOscillator()
    const lfoGain = context.createGain()
    const modeRate = [0.12, 0.2, 0.35][Math.max(0, Math.min(2, Math.round(effectParams.mode ?? 2)))] ?? 0.35

    delay.delayTime.value = 0.02 + clamp(effectParams.stopTime ?? 1, 0.1, 3) * 0.015
    lowpass.type = 'lowpass'
    lowpass.frequency.value = 1800 + clamp(effectParams.restartTime ?? 0.5, 0.1, 3) * 1800
    lfo.type = 'sawtooth'
    lfo.frequency.value = modeRate
    lfoGain.gain.value = 0.03

    effectInput.connect(delay)
    delay.connect(lowpass)
    finishWetChain(lowpass)
    lfo.connect(lfoGain)
    lfoGain.connect(delay.delayTime)
    startSource(lfo)
    cleanupNodes.push(delay, lowpass, lfoGain, lfo)
    runtimeRefs.delay = delay
    runtimeRefs.lowpass = lowpass
    runtimeRefs.lfo = lfo
    runtimeRefs.lfoGain = lfoGain
  } else if (effectId === 'lofitape') {
    const shaper = context.createWaveShaper()
    const tone = context.createBiquadFilter()
    const wobble = context.createDelay(0.05)
    const lfo = context.createOscillator()
    const lfoGain = context.createGain()
    const noise = context.createScriptProcessor(2048, 1, 2)
    const noiseGain = context.createGain()

    shaper.curve = buildDistortionCurve(clamp(effectParams.saturation ?? 0.4, 0, 1))
    shaper.oversample = '2x'
    tone.type = 'lowpass'
    tone.frequency.value = clamp(effectParams.toneRolloff ?? 6000, 500, 12000)
    wobble.delayTime.value = 0.01
    lfo.type = 'sine'
    lfo.frequency.value = clamp(effectParams.flutterRate ?? 6, 0.1, 20)
    lfoGain.gain.value = clamp(effectParams.wowDepth ?? 0.3, 0, 1) * 0.008
    noiseGain.gain.value = clamp(effectParams.noise ?? 0.1, 0, 1) * 0.05
    noise.onaudioprocess = (event) => {
      for (let channel = 0; channel < event.outputBuffer.numberOfChannels; channel += 1) {
        const output = event.outputBuffer.getChannelData(channel)
        for (let index = 0; index < output.length; index += 1) {
          output[index] = (Math.random() * 2 - 1) * 0.5
        }
      }
    }

    effectInput.connect(shaper)
    shaper.connect(tone)
    tone.connect(wobble)
    wobble.connect(wetGain)
    noise.connect(noiseGain)
    noiseGain.connect(wetGain)
    wetGain.connect(masterGain)
    lfo.connect(lfoGain)
    lfoGain.connect(wobble.delayTime)
    startSource(lfo)
    cleanupNodes.push(shaper, tone, wobble, lfoGain, lfo, noise, noiseGain)
    runtimeRefs.shaper = shaper
    runtimeRefs.tone = tone
    runtimeRefs.wobble = wobble
    runtimeRefs.lfo = lfo
    runtimeRefs.lfoGain = lfoGain
    runtimeRefs.noiseGain = noiseGain
  } else {
    effectInput.connect(masterGain)
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

