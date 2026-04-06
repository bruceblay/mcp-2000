import type { VercelRequest, VercelResponse } from '@vercel/node'
import { timingSafeEqual } from 'crypto'
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
  const authHeader = req.headers.authorization ?? ''
  const expected = `Bearer ${process.env.CRON_SECRET?.trim() ?? ''}`
  const a = Buffer.from(authHeader)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
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
    console.error('cleanup-shares error:', error)
    res.status(500).json({ error: 'Cleanup failed.' })
  }
}
