export type CacheStatus = 'missing' | 'fresh' | 'stale'

export interface CacheEntry {
  content: string
  contentUpdatedAt: number
  refreshedAt: number
  expiresAt: number
}

export interface FeedContent {
  content: string
  contentUpdatedAt: number
}

export interface CacheLookup {
  status: CacheStatus
  entry?: CacheEntry
}

export class CacheHub {
  private readonly hub = new Map<string, CacheEntry>()
  private readonly inFlight = new Map<string, Promise<CacheEntry>>()

  constructor(
    private readonly ttlMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  get(id: string): CacheLookup {
    const entry = this.hub.get(id)
    if (!entry) return { status: 'missing' }
    return {
      status: entry.expiresAt > this.now() ? 'fresh' : 'stale',
      entry,
    }
  }

  set(id: string, feed: FeedContent): CacheEntry {
    const refreshedAt = this.now()
    const entry = {
      ...feed,
      refreshedAt,
      expiresAt: refreshedAt + this.ttlMs,
    }
    this.hub.set(id, entry)
    return entry
  }

  refresh(id: string, loader: () => Promise<FeedContent>): Promise<CacheEntry> {
    const existing = this.inFlight.get(id)
    if (existing) return existing

    const refreshPromise = loader()
      .then((feed) => {
        return this.set(id, feed)
      })
      .finally(() => {
        this.inFlight.delete(id)
      })
    this.inFlight.set(id, refreshPromise)
    return refreshPromise
  }
}
