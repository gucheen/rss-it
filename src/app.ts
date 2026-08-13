import { CacheHub, type CacheStatus, type FeedContent } from './cache'
import type { AppConfig, RSSEntryConfig } from './config'
import { fetchEntryFeedResult } from './crawler'
import { renderHomepage } from './homepage'

interface AppOptions {
  homepageTemplate: string
  cache?: CacheHub
  loadFeed?: (entry: RSSEntryConfig) => Promise<FeedContent>
}

function createETag(content: string): string {
  let hash = 2166136261
  for (let index = 0; index < content.length; index += 1) {
    hash ^= content.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `W/"${content.length}-${(hash >>> 0).toString(16)}"`
}

function logError(event: string, id: string, error: unknown): void {
  console.error(
    JSON.stringify({
      level: 'error',
      event,
      id,
      error: error instanceof Error ? error.message : String(error),
    }),
  )
}

function feedResponse(
  request: Request,
  content: string,
  cacheStatus: Exclude<CacheStatus, 'missing'> | 'refreshed',
  ttlSeconds: number,
): Response {
  const etag = createETag(content)
  const clientMaxAge = Math.min(60, ttlSeconds)
  const headers = new Headers({
    'Cache-Control': `public, max-age=${clientMaxAge}, stale-while-revalidate=${ttlSeconds}`,
    'Content-Type': 'application/rss+xml; charset=UTF-8',
    ETag: etag,
    'X-RSS-It-Cache': cacheStatus,
  })
  if (request.headers.get('if-none-match') === etag) {
    return new Response(null, { status: 304, headers })
  }
  return new Response(request.method === 'HEAD' ? null : content, { headers })
}

export function createRequestHandler(
  config: AppConfig,
  options: AppOptions,
): (request: Request) => Promise<Response> {
  const cache = options.cache ?? new CacheHub(config.cacheTtlSeconds * 1000)
  const entryByID = new Map(config.entries.map((entry) => [entry.id, entry]))
  const loadFeed =
    options.loadFeed ??
    ((entry: RSSEntryConfig) =>
      fetchEntryFeedResult(entry, {
        timeoutMs: config.fetchTimeoutMs,
        maxResponseBytes: config.maxResponseBytes,
      }))

  return async (request: Request): Promise<Response> => {
    if (!['GET', 'HEAD'].includes(request.method)) {
      return new Response('Method not allowed', {
        status: 405,
        headers: { Allow: 'GET, HEAD' },
      })
    }

    const requestURL = new URL(request.url)
    if (requestURL.pathname === '/healthz') {
      return new Response(request.method === 'HEAD' ? null : 'ok', {
        headers: { 'Content-Type': 'text/plain; charset=UTF-8' },
      })
    }
    if (requestURL.pathname !== '/') {
      return new Response('Not found', { status: 404 })
    }

    const id = requestURL.searchParams.get('id')
    if (!id) {
      for (const entry of config.entries) {
        if (cache.get(entry.id).status !== 'fresh') {
          void cache
            .refresh(entry.id, () => loadFeed(entry))
            .catch((error) => {
              logError('homepage_refresh_failed', entry.id, error)
            })
        }
      }
      const homepage = renderHomepage(
        options.homepageTemplate,
        config.entries,
        cache,
        requestURL.origin,
      )
      return new Response(request.method === 'HEAD' ? null : homepage, {
        headers: { 'Content-Type': 'text/html; charset=UTF-8' },
      })
    }

    const entry = entryByID.get(id)
    if (!entry) return new Response('Unknown RSS entry', { status: 404 })

    const cached = cache.get(id)
    if (cached.status === 'fresh' && cached.entry) {
      return feedResponse(
        request,
        cached.entry.content,
        'fresh',
        config.cacheTtlSeconds,
      )
    }
    if (cached.status === 'stale' && cached.entry) {
      void cache
        .refresh(id, () => loadFeed(entry))
        .catch((error) => {
          logError('background_refresh_failed', id, error)
        })
      return feedResponse(
        request,
        cached.entry.content,
        'stale',
        config.cacheTtlSeconds,
      )
    }

    try {
      const refreshed = await cache.refresh(id, () => loadFeed(entry))
      return feedResponse(
        request,
        refreshed.content,
        'refreshed',
        config.cacheTtlSeconds,
      )
    } catch (error) {
      logError('feed_refresh_failed', id, error)
      return new Response('Failed to fetch RSS entry', { status: 502 })
    }
  }
}
