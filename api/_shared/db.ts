import { Firestore, FieldValue, Timestamp } from '@google-cloud/firestore'

let _db: Firestore | null = null

const parseCredentials = () => {
  const json = process.env.GCP_SERVICE_ACCOUNT_KEY
  if (!json) return undefined
  return JSON.parse(json) as { client_email: string; private_key: string }
}

const getDb = (): Firestore => {
  if (!_db) {
    const creds = parseCredentials()
    _db = new Firestore({
      projectId: process.env.GCP_PROJECT_ID,
      ...(creds && { credentials: creds }),
    })
  }
  return _db
}

const projects = () => getDb().collection('shared_projects')
const samples = () => getDb().collection('shared_samples')
const promptLogs = () => getDb().collection('prompt_logs')

// ---------------------------------------------------------------------------
// Prompt logging (fire-and-forget)
// ---------------------------------------------------------------------------

export type PromptLogSource = 'generate-kit' | 'generate-loop' | 'generate-pad' | 'generate-sequence' | 'transform-sample'

export const logPrompt = (source: PromptLogSource, prompt: string, metadata?: Record<string, unknown>) => {
  promptLogs().add({
    source,
    prompt,
    ...metadata,
    createdAt: Timestamp.now(),
  }).catch(() => {}) // fire-and-forget, never block the request
}

// ---------------------------------------------------------------------------
// Project CRUD
// ---------------------------------------------------------------------------

const DEFAULT_TTL_SECONDS = 30 * 24 * 60 * 60 // 30 days

export const insertProject = async (
  id: string,
  snapshotJson: string,
  sampleHashes: string[],
  creatorIp?: string,
) => {
  const now = Timestamp.now()
  const expiresAt = Timestamp.fromMillis(Date.now() + DEFAULT_TTL_SECONDS * 1000)

  await projects().doc(id).set({
    snapshot: snapshotJson,
    sampleHashes,
    createdAt: now,
    expiresAt,
    creatorIp: creatorIp ?? null,
  })

  // Bump ref counts on all linked samples
  const batch = getDb().batch()
  for (const hash of sampleHashes) {
    batch.update(samples().doc(hash), { refCount: FieldValue.increment(1) })
  }
  if (sampleHashes.length > 0) {
    await batch.commit()
  }
}

export const getProject = async (id: string): Promise<string | null> => {
  const doc = await projects().doc(id).get()
  if (!doc.exists) return null

  const data = doc.data()!
  // Check expiry (Firestore TTL may not have cleaned it up yet)
  const expiresAt = data.expiresAt as Timestamp
  if (expiresAt.toMillis() < Date.now()) return null

  return data.snapshot as string
}

// ---------------------------------------------------------------------------
// Sample dedup
// ---------------------------------------------------------------------------

export const findExistingSample = async (hash: string): Promise<string | null> => {
  const doc = await samples().doc(hash).get()
  if (!doc.exists) return null
  return doc.data()!.gcsUrl as string
}

export const insertSample = async (hash: string, gcsPath: string, gcsUrl: string, sizeBytes: number) => {
  // Use create() so it fails if the doc already exists (race-safe dedup)
  try {
    await samples().doc(hash).create({
      gcsPath,
      gcsUrl,
      sizeBytes,
      refCount: 0, // incremented when linked to a project
      createdAt: Timestamp.now(),
    })
  } catch (error: unknown) {
    // 6 = ALREADY_EXISTS — another request uploaded the same sample
    if (error && typeof error === 'object' && 'code' in error && (error as { code: number }).code === 6) return
    throw error
  }
}

// ---------------------------------------------------------------------------
// Cleanup (called by cron — handles samples only; Firestore TTL handles projects)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Prompt log listing
// ---------------------------------------------------------------------------

export type PromptLogEntry = {
  source: PromptLogSource
  prompt: string
  createdAt: number
  metadata: Record<string, unknown>
}

export const listRecentPrompts = async (limit = 100): Promise<PromptLogEntry[]> => {
  const snapshot = await promptLogs()
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get()

  return snapshot.docs.map((doc) => {
    const data = doc.data()
    const { source, prompt, createdAt, ...metadata } = data
    return {
      source: source as PromptLogSource,
      prompt: prompt as string,
      createdAt: (createdAt as Timestamp).toMillis(),
      metadata,
    }
  })
}

// ---------------------------------------------------------------------------
// Recent shares listing
// ---------------------------------------------------------------------------

export type ShareSummary = {
  id: string
  createdAt: number
  expiresAt: number
  tempo: number
  bankSummaries: Record<string, string[]>
}

export const listRecentShares = async (limit = 50): Promise<ShareSummary[]> => {
  const snapshot = await projects()
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get()

  return snapshot.docs.map((doc) => {
    const data = doc.data()
    const createdAt = (data.createdAt as Timestamp).toMillis()
    const expiresAt = (data.expiresAt as Timestamp).toMillis()

    let tempo = 94
    const bankSummaries: Record<string, string[]> = {}

    try {
      const parsed = JSON.parse(data.snapshot as string)
      tempo = parsed.sequenceTempo ?? 94

      for (const bankId of ['A', 'B', 'C', 'D']) {
        const bank = parsed.bankStates?.[bankId]
        if (bank?.pads) {
          bankSummaries[bankId] = bank.pads.map((p: { sampleName: string }) => p.sampleName)
        }
      }
    } catch {}

    return { id: doc.id, createdAt, expiresAt, tempo, bankSummaries }
  })
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

export const getOrphanedSamples = async (): Promise<Array<{ hash: string; gcsPath: string }>> => {
  const snapshot = await samples().where('refCount', '<=', 0).get()
  return snapshot.docs.map((doc) => ({
    hash: doc.id,
    gcsPath: doc.data().gcsPath as string,
  }))
}

export const deleteSampleDocs = async (hashes: string[]) => {
  const batch = getDb().batch()
  for (const hash of hashes) {
    batch.delete(samples().doc(hash))
  }
  if (hashes.length > 0) {
    await batch.commit()
  }
}

/** Decrement ref counts for samples linked to a project (used before project deletion). */
export const decrementSampleRefs = async (sampleHashes: string[]) => {
  const batch = getDb().batch()
  for (const hash of sampleHashes) {
    batch.update(samples().doc(hash), { refCount: FieldValue.increment(-1) })
  }
  if (sampleHashes.length > 0) {
    await batch.commit()
  }
}

// ---------------------------------------------------------------------------
// Rate limiting (simple IP-based)
// ---------------------------------------------------------------------------

export const countRecentSharesByIp = async (ip: string, windowSeconds: number): Promise<number> => {
  const since = Timestamp.fromMillis(Date.now() - windowSeconds * 1000)
  const snapshot = await projects()
    .where('creatorIp', '==', ip)
    .where('createdAt', '>', since)
    .count()
    .get()

  return snapshot.data().count
}
