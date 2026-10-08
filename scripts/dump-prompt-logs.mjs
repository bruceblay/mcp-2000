/**
 * Dumps the full `prompt_logs` collection and prints a breakdown of what
 * people have been asking the generator for.
 *
 * Unlike GET /api/shares/prompts this has no row cap and needs no CRON_SECRET.
 *
 * Usage:
 *   node scripts/dump-prompt-logs.mjs [out.json]
 *
 * Needs application default credentials:
 *   gcloud auth application-default login
 */
import { Firestore } from '@google-cloud/firestore'
import { writeFileSync } from 'fs'

const PROJECT_ID = 'mcp-2000'
const outPath = process.argv[2] ?? 'prompt-logs.json'

const db = new Firestore({ projectId: PROJECT_ID })

console.log('Reading prompt_logs...')
const snap = await db.collection('prompt_logs').orderBy('createdAt', 'asc').get()
console.log(`  ${snap.size} prompts\n`)

if (snap.empty) process.exit(0)

const rows = snap.docs.map((doc) => {
  const d = doc.data()
  return {
    id: doc.id,
    source: d.source ?? 'unknown',
    mode: d.mode ?? null,
    bankId: d.bankId ?? null,
    prompt: d.prompt ?? '',
    createdAt: d.createdAt?.toMillis?.() ?? 0,
  }
})

writeFileSync(outPath, JSON.stringify(rows, null, 2))

const tally = (key) => {
  const m = new Map()
  for (const r of rows) m.set(r[key], (m.get(r[key]) ?? 0) + 1)
  return [...m].sort((a, b) => b[1] - a[1])
}

const pad = (s, n) => String(s).padEnd(n)

console.log('By source')
for (const [k, n] of tally('source')) console.log(`  ${pad(k, 20)} ${n}`)

const byDay = new Map()
for (const r of rows) {
  const day = new Date(r.createdAt).toISOString().slice(0, 7)
  byDay.set(day, (byDay.get(day) ?? 0) + 1)
}
console.log('\nBy month')
for (const [k, n] of [...byDay].sort()) console.log(`  ${pad(k, 20)} ${n}`)

// Crude topic signal: most common non-trivial words across all prompts.
const STOP = new Set(('a an the and or of for with to in on at is it that this my me you i ' +
  'make create generate give sound sounds sample samples kit some really very just like ' +
  'more please can want need').split(' '))
const words = new Map()
for (const r of rows) {
  for (const w of r.prompt.toLowerCase().match(/[a-z][a-z'-]{2,}/g) ?? []) {
    if (STOP.has(w)) continue
    words.set(w, (words.get(w) ?? 0) + 1)
  }
}
console.log('\nTop 40 words')
const top = [...words].sort((a, b) => b[1] - a[1]).slice(0, 40)
for (let i = 0; i < top.length; i += 4) {
  console.log('  ' + top.slice(i, i + 4).map(([w, n]) => pad(`${w} ${n}`, 22)).join(''))
}

const lens = rows.map((r) => r.prompt.length).sort((a, b) => a - b)
const pct = (p) => lens[Math.floor(lens.length * p)]
console.log(`\nPrompt length  median ${pct(0.5)}  p90 ${pct(0.9)}  max ${lens.at(-1)} chars`)

console.log('\nMost recent 15')
for (const r of rows.slice(-15).reverse()) {
  const when = new Date(r.createdAt).toISOString().slice(0, 16).replace('T', ' ')
  console.log(`  ${when}  ${pad(r.source, 18)} ${JSON.stringify(r.prompt.slice(0, 90))}`)
}

console.log(`\nFull dump written to ${outPath}`)
