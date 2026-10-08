/**
 * Dumps the `chat_logs` collection, grouped back into threads.
 *
 * Only user turns are stored, so a thread reads as the sequence of things
 * one person asked the assistant in a single session.
 *
 * Usage:
 *   node scripts/dump-chat-logs.mjs [out.json]
 *
 * Needs application default credentials:
 *   gcloud auth application-default login
 */
import { Firestore } from '@google-cloud/firestore'
import { writeFileSync } from 'fs'

const PROJECT_ID = 'mcp-2000'
const outPath = process.argv[2] ?? 'chat-logs.json'

const db = new Firestore({ projectId: PROJECT_ID })

console.log('Reading chat_logs...')
const snap = await db.collection('chat_logs').orderBy('createdAt', 'asc').get()
console.log(`  ${snap.size} user turns\n`)

if (snap.empty) {
  console.log('Nothing logged yet. Deploy the chat logging change first.')
  process.exit(0)
}

const threads = new Map()
for (const doc of snap.docs) {
  const d = doc.data()
  const id = d.conversationId ?? 'unknown'
  if (!threads.has(id)) threads.set(id, { conversationId: id, startedAt: 0, turns: [] })
  const t = threads.get(id)
  const at = d.createdAt?.toMillis?.() ?? 0
  if (!t.startedAt) t.startedAt = at
  t.turns.push({ at, turnIndex: d.turnIndex ?? t.turns.length, message: d.message ?? '' })
}

const list = [...threads.values()].sort((a, b) => a.startedAt - b.startedAt)
writeFileSync(outPath, JSON.stringify(list, null, 2))

const lengths = list.map((t) => t.turns.length).sort((a, b) => a - b)
const median = lengths[Math.floor(lengths.length / 2)]
const oneShot = lengths.filter((n) => n === 1).length

console.log(`threads            ${list.length}`)
console.log(`median turns       ${median}`)
console.log(`single-turn        ${oneShot} (${Math.round(oneShot / list.length * 100)}%)`)
console.log(`longest thread     ${lengths.at(-1)} turns`)

console.log('\nMost recent 10 threads')
for (const t of list.slice(-10).reverse()) {
  console.log(`\n  ${new Date(t.startedAt).toISOString().slice(0, 16).replace('T', ' ')}  (${t.turns.length} turns)`)
  for (const turn of t.turns.slice(0, 6)) {
    console.log(`    > ${turn.message.slice(0, 100)}`)
  }
  if (t.turns.length > 6) console.log(`    ... ${t.turns.length - 6} more`)
}

console.log(`\nFull dump written to ${outPath}`)
