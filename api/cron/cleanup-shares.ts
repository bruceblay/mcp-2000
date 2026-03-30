import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getOrphanedSamples, deleteSampleDocs } from '../_shared/db.js'
import { deleteSamples } from '../_shared/gcs.js'

export const config = { maxDuration: 60 }

/**
 * Daily cleanup cron.
 *
 * Firestore TTL auto-deletes expired project documents, but orphaned sample
 * files in Cloud Storage still need manual cleanup. This job finds samples
 * with refCount <= 0, deletes them from GCS, then removes the Firestore docs.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const authHeader = req.headers.authorization
  if (authHeader !== `Bearer ${process.env.CRON_SECRET?.trim()}`) {
    res.status(401).json({ error: 'Unauthorized.' })
    return
  }

  try {
    const orphaned = await getOrphanedSamples()

    if (orphaned.length > 0) {
      await deleteSamples(orphaned.map((s) => s.gcsPath))
      await deleteSampleDocs(orphaned.map((s) => s.hash))
    }

    res.status(200).json({ deletedSamples: orphaned.length })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Cleanup failed.'
    res.status(500).json({ error: message })
  }
}
