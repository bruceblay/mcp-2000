/**
 * Maps the content-hashed mp3s in gs://mcp-2000-samples/samples/ back to the
 * pad names they had inside shared projects, then writes a labelled copy of a
 * local sample dump.
 *
 * Reads Firestore `shared_projects`, walks every snapshot's pads, and keys on
 * the hash embedded in each pad's sampleUrl.
 *
 * Usage:
 *   node scripts/label-shared-samples.mjs <dump-dir> [out-dir]
 *
 * Needs application default credentials:
 *   gcloud auth application-default login
 */
import { Firestore } from '@google-cloud/firestore'
import { readdirSync, mkdirSync, copyFileSync, writeFileSync, existsSync } from 'fs'
import { join, resolve } from 'path'

const PROJECT_ID = 'mcp-2000'
const HASH_RE = /\/samples\/([a-f0-9]{64})\.mp3/

const dumpDir = resolve(process.argv[2] ?? '')
const outDir = resolve(process.argv[3] ?? join(dumpDir, '..', 'mcp2000-labelled'))

if (!dumpDir || !existsSync(dumpDir)) {
  console.error('Pass the directory holding the downloaded .mp3 files.')
  process.exit(1)
}

const slug = (s) =>
  String(s ?? '')
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .toLowerCase()
    .slice(0, 60) || 'untitled'

const db = new Firestore({ projectId: PROJECT_ID })

console.log('Reading shared_projects...')
const snap = await db.collection('shared_projects').get()
console.log(`  ${snap.size} shared projects`)

/** hash -> { name, group, sourceType, shareIds:Set, firstSeen } */
const byHash = new Map()

for (const doc of snap.docs) {
  const data = doc.data()
  const createdAt = data.createdAt?.toMillis?.() ?? 0

  let parsed
  try {
    parsed = JSON.parse(data.snapshot)
  } catch {
    continue
  }

  for (const bankId of ['A', 'B', 'C', 'D']) {
    for (const pad of parsed.bankStates?.[bankId]?.pads ?? []) {
      const m = HASH_RE.exec(pad.sampleUrl ?? '')
      if (!m) continue
      const hash = m[1]

      const existing = byHash.get(hash)
      if (existing) {
        existing.shareIds.add(doc.id)
        if (createdAt && createdAt < existing.firstSeen) existing.firstSeen = createdAt
        continue
      }

      byHash.set(hash, {
        name: pad.sampleName || pad.label || pad.sampleFile,
        group: pad.group ?? null,
        sourceType: pad.sourceType ?? 'unknown',
        shareIds: new Set([doc.id]),
        firstSeen: createdAt,
      })
    }
  }
}

console.log(`  ${byHash.size} hashes resolved to a pad name`)

const files = readdirSync(dumpDir).filter((f) => f.endsWith('.mp3'))
console.log(`\n${files.length} local files in ${dumpDir}`)

const counts = { generated: 0, uploaded: 0, unknown: 0, unmatched: 0 }
const manifest = []
const usedNames = new Set()

for (const file of files) {
  const hash = file.replace(/\.mp3$/, '')
  const meta = byHash.get(hash)

  const bucket = meta ? meta.sourceType : 'unmatched'
  if (bucket === 'unmatched') counts.unmatched++
  else counts[bucket] = (counts[bucket] ?? 0) + 1

  const destDir = join(outDir, bucket)
  mkdirSync(destDir, { recursive: true })

  let base = meta ? slug(meta.name) : hash.slice(0, 12)
  let name = `${base}.mp3`
  let n = 2
  while (usedNames.has(join(bucket, name))) name = `${base}-${n++}.mp3`
  usedNames.add(join(bucket, name))

  copyFileSync(join(dumpDir, file), join(destDir, name))

  manifest.push({
    file: join(bucket, name),
    hash,
    name: meta?.name ?? null,
    group: meta?.group ?? null,
    sourceType: meta?.sourceType ?? null,
    shareCount: meta ? meta.shareIds.size : 0,
    firstSeen: meta?.firstSeen ? new Date(meta.firstSeen).toISOString() : null,
  })
}

manifest.sort((a, b) => (b.shareCount - a.shareCount) || a.file.localeCompare(b.file))
writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2))

console.log(`\nWrote ${outDir}`)
console.log(`  generated/  ${counts.generated}`)
console.log(`  uploaded/   ${counts.uploaded}`)
if (counts.unknown) console.log(`  unknown/    ${counts.unknown}`)
console.log(`  unmatched/  ${counts.unmatched}  (in the bucket, not in any live share)`)
console.log(`  manifest.json — sorted by how many shares reused the sample`)
