import type { VercelRequest, VercelResponse } from '@vercel/node'

// ---------------------------------------------------------------------------
// Client IP extraction
// ---------------------------------------------------------------------------

export const getClientIp = (req: VercelRequest) =>
  (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ?? req.socket?.remoteAddress ?? 'unknown'

// ---------------------------------------------------------------------------
// In-memory sliding-window rate limiter
//
// Each warm Vercel function instance maintains its own store. This won't
// survive cold starts or sync across instances, but it catches sustained
// abuse from a single client and is zero-latency (no external calls).
// ---------------------------------------------------------------------------

const store = new Map<string, number[]>()

const CLEANUP_INTERVAL_MS = 5 * 60 * 1000
let lastCleanup = Date.now()

const cleanup = (windowMs: number) => {
  const now = Date.now()
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return
  lastCleanup = now

  const cutoff = now - windowMs
  for (const [key, timestamps] of store) {
    const filtered = timestamps.filter((t) => t > cutoff)
    if (filtered.length === 0) store.delete(key)
    else store.set(key, filtered)
  }
}

export type RateLimitConfig = {
  /** Max requests allowed in the window */
  max: number
  /** Window size in milliseconds */
  windowMs: number
}

/**
 * Check if a request is within the rate limit.
 * Returns true if the request should be allowed, false if it should be rejected.
 */
const checkRateLimit = (key: string, config: RateLimitConfig): boolean => {
  cleanup(config.windowMs)

  const now = Date.now()
  const cutoff = now - config.windowMs
  const timestamps = store.get(key)

  if (!timestamps) {
    store.set(key, [now])
    return true
  }

  const recent = timestamps.filter((t) => t > cutoff)

  if (recent.length >= config.max) {
    store.set(key, recent)
    return false
  }

  recent.push(now)
  store.set(key, recent)
  return true
}

/**
 * Apply rate limiting to a Vercel request. Returns true if the request was
 * rejected (response already sent). Returns false if the request is allowed.
 */
export const applyRateLimit = (
  req: VercelRequest,
  res: VercelResponse,
  endpoint: string,
  config: RateLimitConfig,
): boolean => {
  const ip = getClientIp(req)
  const key = `${endpoint}:${ip}`

  if (!checkRateLimit(key, config)) {
    res.status(429).json({ error: 'Too many requests. Try again later.' })
    return true
  }

  return false
}
