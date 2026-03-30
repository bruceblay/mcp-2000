import { Storage } from '@google-cloud/storage'

let _storage: Storage | null = null

const parseCredentials = () => {
  const json = process.env.GCP_SERVICE_ACCOUNT_KEY
  if (!json) return undefined
  return JSON.parse(json) as { client_email: string; private_key: string }
}

const getStorage = (): Storage => {
  if (!_storage) {
    const creds = parseCredentials()
    _storage = new Storage({
      projectId: process.env.GCP_PROJECT_ID,
      ...(creds && { credentials: creds }),
    })
  }
  return _storage
}

const getBucket = () => {
  const name = process.env.GCS_BUCKET_NAME
  if (!name) throw new Error('Missing GCS_BUCKET_NAME')
  return getStorage().bucket(name)
}

const getPublicUrl = (gcsPath: string) => {
  const bucketName = process.env.GCS_BUCKET_NAME!
  return `https://storage.googleapis.com/${bucketName}/${gcsPath}`
}

// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------

/** Upload an audio file to GCS. Returns the public URL. */
export const uploadSample = async (
  hash: string,
  body: Buffer,
  contentType = 'audio/mpeg',
): Promise<{ gcsPath: string; gcsUrl: string }> => {
  const gcsPath = `samples/${hash}.mp3`
  const file = getBucket().file(gcsPath)

  await file.save(body, {
    contentType,
    metadata: {
      cacheControl: 'public, max-age=31536000, immutable',
    },
    resumable: false,
  })

  return { gcsPath, gcsUrl: getPublicUrl(gcsPath) }
}

/** Check if a sample already exists in GCS. */
export const sampleExistsInGcs = async (hash: string): Promise<boolean> => {
  const gcsPath = `samples/${hash}.mp3`
  const [exists] = await getBucket().file(gcsPath).exists()
  return exists
}

/** Delete a sample from GCS. */
export const deleteSample = async (gcsPath: string): Promise<void> => {
  try {
    await getBucket().file(gcsPath).delete()
  } catch (error: unknown) {
    // Ignore 404 — already deleted
    if (error && typeof error === 'object' && 'code' in error && (error as { code: number }).code === 404) return
    throw error
  }
}

/** Delete multiple samples from GCS. */
export const deleteSamples = async (gcsPaths: string[]): Promise<void> => {
  await Promise.all(gcsPaths.map((path) => deleteSample(path)))
}
