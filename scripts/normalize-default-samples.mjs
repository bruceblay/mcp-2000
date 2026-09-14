#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { readFile, mkdir, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import ts from 'typescript'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(scriptDirectory, '..')
const publicDirectory = path.join(projectRoot, 'public')
const normalizedDirectory = path.join(publicDirectory, 'normalized-samples')
const reportPath = path.join(projectRoot, 'docs', 'default-sample-normalization.json')

const targetPeakDb = -1
const analyzeOnly = process.argv.includes('--analyze-only')

const sourceDirectories = {
  A: 'mock-samples',
  B: 'kraftwerk-kit',
  C: 'ice-kit',
  D: 'acoustic-guitar',
}

const run = (command, args) => {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  })

  if (result.error) {
    throw result.error
  }

  if (result.status !== 0) {
    throw new Error(
      `${command} failed with exit code ${result.status}\n${result.stdout}${result.stderr}`,
    )
  }

  return `${result.stdout}${result.stderr}`
}

const requireTool = (command) => {
  const result = spawnSync(command, ['-version'], { encoding: 'utf8' })
  if (result.error || result.status !== 0) {
    throw new Error(`${command} is required. Install FFmpeg before running this script.`)
  }
}

const loadBankKits = async () => {
  const mockKitPath = path.join(projectRoot, 'src', 'mock-kit.ts')
  const source = await readFile(mockKitPath, 'utf8')
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: mockKitPath,
  }).outputText
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`
  return (await import(moduleUrl)).bankKits
}

const ensureInside = (parent, candidate) => {
  const relativePath = path.relative(parent, candidate)
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new Error(`Refusing to access a path outside ${parent}: ${candidate}`)
  }
}

const parseFiniteNumber = (value, label) => {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    throw new Error(`Could not measure ${label}: ${value}`)
  }
  return parsed
}

const getLastMeasurement = (output, label) => {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const matches = [...output.matchAll(new RegExp(`${escapedLabel}:\\s*(-?\\d+(?:\\.\\d+)?)`, 'g'))]
  const value = matches.at(-1)?.[1]
  return parseFiniteNumber(value, label)
}

const probeAudio = (filePath) => {
  const output = run('ffprobe', [
    '-v', 'error',
    '-select_streams', 'a:0',
    '-show_entries', 'stream=codec_name,sample_fmt,sample_rate,channels,duration:format=duration,size',
    '-of', 'json',
    filePath,
  ])
  const data = JSON.parse(output)
  const stream = data.streams?.[0]

  if (!stream) {
    throw new Error(`No audio stream found in ${filePath}`)
  }

  return {
    codec: stream.codec_name,
    sampleFormat: stream.sample_fmt,
    sampleRate: parseFiniteNumber(stream.sample_rate, 'sample rate'),
    channels: parseFiniteNumber(stream.channels, 'channel count'),
    durationSeconds: parseFiniteNumber(stream.duration ?? data.format?.duration, 'duration'),
    sizeBytes: parseFiniteNumber(data.format?.size, 'file size'),
  }
}

const measureAudio = (filePath) => {
  const stats = run('ffmpeg', [
    '-nostdin',
    '-hide_banner',
    '-i', filePath,
    '-map', '0:a:0',
    '-af', 'aformat=sample_fmts=flt,astats=metadata=0:reset=0',
    '-f', 'null',
    '-',
  ])
  const loudness = run('ffmpeg', [
    '-nostdin',
    '-hide_banner',
    '-i', filePath,
    '-map', '0:a:0',
    '-af', 'loudnorm=I=-16:TP=-1:LRA=11:print_format=json',
    '-f', 'null',
    '-',
  ])
  const loudnessBlocks = [...loudness.matchAll(/\{\s*"input_i"[\s\S]*?\}/g)]
  const loudnessJson = loudnessBlocks.at(-1)?.[0]

  if (!loudnessJson) {
    throw new Error(`Could not measure true peak for ${filePath}`)
  }

  const loudnessData = JSON.parse(loudnessJson)
  return {
    samplePeakDbfs: getLastMeasurement(stats, 'Peak level dB'),
    truePeakDbtp: parseFiniteNumber(loudnessData.input_tp, 'true peak'),
    rmsDbfs: getLastMeasurement(stats, 'RMS level dB'),
    dcOffset: getLastMeasurement(stats, 'DC offset'),
  }
}

const sha256 = async (filePath) =>
  createHash('sha256').update(await readFile(filePath)).digest('hex')

const round = (value, digits = 4) => Number(value.toFixed(digits))

const buildInventory = async () => {
  const bankKits = await loadBankKits()
  return Object.entries(bankKits).flatMap(([bank, pads]) =>
    pads.map((pad) => {
      const sourceFile = path.join(publicDirectory, sourceDirectories[bank], pad.sampleFile)
      const outputName = pad.sampleFile.replace(/\.[^.]+$/, '.wav')
      const outputFile = path.join(normalizedDirectory, bank, outputName)
      ensureInside(publicDirectory, sourceFile)
      ensureInside(normalizedDirectory, outputFile)
      return {
        bank,
        padId: pad.id,
        label: pad.label,
        sourceFile,
        sourcePath: path.relative(projectRoot, sourceFile),
        outputFile,
        outputPath: path.relative(projectRoot, outputFile),
        outputUrl: `/normalized-samples/${bank}/${encodeURIComponent(outputName)}`,
      }
    }),
  )
}

const normalize = async (sourceFile, outputFile, gainDb) => {
  await mkdir(path.dirname(outputFile), { recursive: true })
  const temporaryFile = path.join(
    path.dirname(outputFile),
    `.${path.basename(outputFile)}.${process.pid}.tmp.wav`,
  )

  try {
    run('ffmpeg', [
      '-nostdin',
      '-hide_banner',
      '-y',
      '-i', sourceFile,
      '-map', '0:a:0',
      '-map_metadata', '-1',
      '-vn',
      '-af', `volume=${gainDb.toFixed(8)}dB`,
      '-c:a', 'pcm_s24le',
      '-fflags', '+bitexact',
      '-flags:a', '+bitexact',
      temporaryFile,
    ])
    await rename(temporaryFile, outputFile)
  } catch (error) {
    await rm(temporaryFile, { force: true })
    throw error
  }
}

const validateOutput = (source, normalized, sourceLevels, normalizedLevels) => {
  const durationTolerance = source.codec === 'mp3' ? 0.05 : Math.max(0.001, 2 / source.sampleRate)
  const durationDelta = Math.abs(source.durationSeconds - normalized.durationSeconds)
  const ceiling = Math.max(normalizedLevels.samplePeakDbfs, normalizedLevels.truePeakDbtp)
  const reachesTarget = Math.abs(ceiling - targetPeakDb) <= 0.08

  return {
    passed:
      source.sampleRate === normalized.sampleRate
      && source.channels === normalized.channels
      && durationDelta <= durationTolerance
      && ceiling <= targetPeakDb + 0.02
      && reachesTarget,
    durationDeltaSeconds: round(durationDelta, 6),
    targetDeltaDb: round(ceiling - targetPeakDb, 4),
    sampleRatePreserved: source.sampleRate === normalized.sampleRate,
    channelsPreserved: source.channels === normalized.channels,
  }
}

requireTool('ffmpeg')
requireTool('ffprobe')

const inventory = await buildInventory()
if (inventory.length !== 64 || new Set(inventory.map(({ sourceFile }) => sourceFile)).size !== 64) {
  throw new Error(`Expected 64 unique default samples; found ${inventory.length}.`)
}

const results = []
for (const [index, item] of inventory.entries()) {
  const source = probeAudio(item.sourceFile)
  const sourceLevels = measureAudio(item.sourceFile)
  const gainDb = Math.min(
    targetPeakDb - sourceLevels.samplePeakDbfs,
    targetPeakDb - sourceLevels.truePeakDbtp,
  )

  const progress = `[${String(index + 1).padStart(2, '0')}/64] Bank ${item.bank} ${item.padId}`
  if (analyzeOnly) {
    console.log(
      `${progress}: peak ${sourceLevels.samplePeakDbfs.toFixed(2)} dBFS, `
      + `true peak ${sourceLevels.truePeakDbtp.toFixed(2)} dBTP, `
      + `gain ${gainDb >= 0 ? '+' : ''}${gainDb.toFixed(2)} dB`,
    )
    results.push({ ...item, source, sourceLevels, gainDb: round(gainDb) })
    continue
  }

  await normalize(item.sourceFile, item.outputFile, gainDb)
  const normalized = probeAudio(item.outputFile)
  const normalizedLevels = measureAudio(item.outputFile)
  const validation = validateOutput(source, normalized, sourceLevels, normalizedLevels)

  if (!validation.passed) {
    throw new Error(`${progress} failed validation: ${JSON.stringify(validation)}`)
  }

  console.log(
    `${progress}: ${gainDb >= 0 ? '+' : ''}${gainDb.toFixed(2)} dB -> `
    + `${Math.max(normalizedLevels.samplePeakDbfs, normalizedLevels.truePeakDbtp).toFixed(2)} dB ceiling`,
  )
  results.push({
    bank: item.bank,
    padId: item.padId,
    label: item.label,
    sourcePath: item.sourcePath,
    outputPath: item.outputPath,
    outputUrl: item.outputUrl,
    gainDb: round(gainDb),
    sourceSha256: await sha256(item.sourceFile),
    outputSha256: await sha256(item.outputFile),
    source,
    sourceLevels: Object.fromEntries(
      Object.entries(sourceLevels).map(([key, value]) => [key, round(value, 6)]),
    ),
    normalized,
    normalizedLevels: Object.fromEntries(
      Object.entries(normalizedLevels).map(([key, value]) => [key, round(value, 6)]),
    ),
    validation,
  })
}

const gains = results.map(({ gainDb }) => gainDb)
const summary = {
  sampleCount: results.length,
  banks: Object.fromEntries(
    Object.keys(sourceDirectories).map((bank) => [bank, results.filter((item) => item.bank === bank).length]),
  ),
  minimumGainDb: round(Math.min(...gains)),
  maximumGainDb: round(Math.max(...gains)),
  averageGainDb: round(gains.reduce((total, gain) => total + gain, 0) / gains.length),
}

if (analyzeOnly) {
  console.log(`\nAnalysis complete: ${JSON.stringify(summary, null, 2)}`)
} else {
  const report = {
    schemaVersion: 1,
    method: {
      description: 'Constant-gain peak normalization with sample-peak and true-peak ceilings',
      targetSamplePeakDbfs: targetPeakDb,
      targetTruePeakDbtp: targetPeakDb,
      outputCodec: '24-bit PCM WAV',
      originalsModified: false,
    },
    summary,
    samples: results,
  }
  await mkdir(path.dirname(reportPath), { recursive: true })
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`)
  console.log(`\nNormalized ${results.length} samples and wrote ${path.relative(projectRoot, reportPath)}.`)
}
