import { useState, useEffect, useCallback } from 'react'
import {
  serializeProject, deserializeProject, snapshotToJson, jsonToSnapshot,
  getPadsNeedingUpload,
  type DeserializedProject, type SerializeProjectInput,
} from './project-snapshot'
import { blobToBase64 } from './audio-utils'

export type ShareStatus = 'idle' | 'uploading' | 'creating' | 'done' | 'error'

const SHARE_QUERY_PARAM = 's'

/** Extract a share ID from the current URL (e.g. ?s=abc123). */
export const getShareIdFromUrl = (): string | null => {
  const params = new URLSearchParams(window.location.search)
  return params.get(SHARE_QUERY_PARAM)
}

/** Build a share URL from a share ID. */
const buildShareUrl = (shareId: string): string => {
  const url = new URL(window.location.href)
  url.search = ''
  url.hash = ''
  url.searchParams.set(SHARE_QUERY_PARAM, shareId)
  return url.toString()
}

/** Remove the share param from the URL without reloading. */
const clearShareParam = () => {
  const url = new URL(window.location.href)
  url.searchParams.delete(SHARE_QUERY_PARAM)
  window.history.replaceState(null, '', url.toString())
}

// ---------------------------------------------------------------------------
// Load a shared project
// ---------------------------------------------------------------------------

export const loadSharedProject = async (shareId: string): Promise<DeserializedProject> => {
  const response = await fetch(`/api/share?id=${encodeURIComponent(shareId)}`)
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: 'Failed to load share.' }))
    throw new Error(body.error ?? `Share load failed (${response.status})`)
  }

  const { snapshot: snapshotJson } = await response.json() as { snapshot: string }
  const snapshot = jsonToSnapshot(snapshotJson)
  return deserializeProject(snapshot)
}

// ---------------------------------------------------------------------------
// Create a share
// ---------------------------------------------------------------------------

const fetchBlobAsBase64 = async (blobUrl: string): Promise<string> => {
  const response = await fetch(blobUrl)
  const blob = await response.blob()
  return blobToBase64(blob)
}

export const createShare = async (
  input: SerializeProjectInput,
  onStatus?: (status: ShareStatus) => void,
): Promise<string> => {
  onStatus?.('uploading')

  const snapshot = serializeProject(input)
  const padsNeedingUpload = getPadsNeedingUpload(snapshot)

  // Fetch audio data for ephemeral blob: URLs
  const samples = await Promise.all(
    padsNeedingUpload.map(async ({ pad }) => {
      const audioBase64 = await fetchBlobAsBase64(pad.sampleUrl)
      return {
        originalUrl: pad.sampleUrl,
        audioBase64,
      }
    }),
  )

  onStatus?.('creating')

  const response = await fetch('/api/share', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      snapshot: snapshotToJson(snapshot),
      samples,
    }),
  })

  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: 'Share creation failed.' }))
    throw new Error(body.error ?? `Share creation failed (${response.status})`)
  }

  const { id: shareId } = await response.json() as { id: string }
  onStatus?.('done')
  return buildShareUrl(shareId)
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export const useShare = (
  getSerializeInput: () => SerializeProjectInput,
  applySnapshot: (project: DeserializedProject) => void,
) => {
  const [shareStatus, setShareStatus] = useState<ShareStatus>('idle')
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [shareError, setShareError] = useState<string | null>(null)
  const [isLoadingShare, setIsLoadingShare] = useState(false)
  const [loadedFromShare, setLoadedFromShare] = useState(false)

  // On mount, check for a share ID in the URL and load it
  useEffect(() => {
    const shareId = getShareIdFromUrl()
    if (!shareId) return

    setIsLoadingShare(true)
    loadSharedProject(shareId)
      .then((project) => {
        applySnapshot(project)
        setLoadedFromShare(true)
      })
      .catch((error) => {
        console.error('Failed to load shared project:', error)
        // Only clear the param on failure so the user can retry
        clearShareParam()
      })
      .finally(() => setIsLoadingShare(false))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps -- run once on mount

  const startShare = useCallback(async () => {
    if (shareStatus === 'uploading' || shareStatus === 'creating') return

    setShareStatus('idle')
    setShareUrl(null)
    setShareError(null)

    try {
      const url = await createShare(getSerializeInput(), setShareStatus)
      setShareUrl(url)
      await navigator.clipboard.writeText(url)
    } catch (error) {
      setShareStatus('error')
      setShareError(error instanceof Error ? error.message : 'Share failed.')
    }
  }, [getSerializeInput, shareStatus])

  const dismissShare = useCallback(() => {
    setShareStatus('idle')
    setShareUrl(null)
    setShareError(null)
  }, [])

  return {
    shareStatus,
    shareUrl,
    shareError,
    isLoadingShare,
    loadedFromShare,
    startShare,
    dismissShare,
  }
}
