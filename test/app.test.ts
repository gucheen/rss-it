import { describe, expect, test } from 'bun:test'
import { createRequestHandler } from '../src/app'
import { CacheHub } from '../src/cache'
import type { AppConfig } from '../src/config'

const config: AppConfig = {
  entries: [
    {
      id: 'example',
      title: 'Example Feed',
      url: 'https://example.com/',
      ruleUpdatedAt: '2026-08-13',
      selectors: {
        item: 'article',
        itemDate: 'time',
        itemTitle: 'h2',
      },
    },
  ],
  cacheTtlSeconds: 1,
  fetchTimeoutMs: 100,
  maxResponseBytes: 1024,
}

const homepageTemplate = '<table><!-- RSS_IT_ENTRY_ROWS --></table>'

describe('request handler', () => {
  test('returns health and 404 responses', async () => {
    const handler = createRequestHandler(config, {
      homepageTemplate,
      loadFeed: async () => ({
        content: '<rss />',
        contentUpdatedAt: Date.UTC(2026, 6, 15),
      }),
    })
    expect(
      (await handler(new Request('http://localhost/healthz'))).status,
    ).toBe(200)
    expect(
      (await handler(new Request('http://localhost/?id=unknown'))).status,
    ).toBe(404)
  })

  test('deduplicates cold requests and emits cache headers', async () => {
    let calls = 0
    const handler = createRequestHandler(config, {
      homepageTemplate,
      loadFeed: async () => {
        calls += 1
        await Promise.resolve()
        return {
          content: '<rss>fresh</rss>',
          contentUpdatedAt: Date.UTC(2026, 6, 15),
        }
      },
    })
    const [first, second] = await Promise.all([
      handler(new Request('http://localhost/?id=example')),
      handler(new Request('http://localhost/?id=example')),
    ])
    expect(calls).toBe(1)
    expect(first.headers.get('x-rss-it-cache')).toBe('refreshed')
    expect(await second.text()).toBe('<rss>fresh</rss>')
  })

  test('serves stale content while refreshing in the background', async () => {
    let now = 1_000
    const cache = new CacheHub(100, () => now)
    cache.set('example', {
      content: '<rss>last-known-good</rss>',
      contentUpdatedAt: Date.UTC(2026, 6, 15),
    })
    now = 1_101
    const handler = createRequestHandler(config, {
      homepageTemplate,
      cache,
      loadFeed: async () => {
        throw new Error('upstream failed')
      },
    })
    const response = await handler(new Request('http://localhost/?id=example'))
    expect(response.status).toBe(200)
    expect(response.headers.get('x-rss-it-cache')).toBe('stale')
    expect(await response.text()).toBe('<rss>last-known-good</rss>')
  })

  test('renders homepage entries from config', async () => {
    const handler = createRequestHandler(config, {
      homepageTemplate,
      loadFeed: async () => ({
        content: '<rss />',
        contentUpdatedAt: Date.UTC(2026, 6, 15),
      }),
    })
    const response = await handler(new Request('http://localhost/'))
    const html = await response.text()
    expect(html).toContain('Example Feed')
    expect(html).toContain('http://localhost/?id=example')
    expect(html).toContain('2026-08-13')
    expect(html).toContain('Awaiting first fetch')
  })

  test('shows the latest content date after a feed is fetched', async () => {
    const handler = createRequestHandler(config, {
      homepageTemplate,
      loadFeed: async () => ({
        content: '<rss />',
        contentUpdatedAt: Date.UTC(2026, 6, 15),
      }),
    })
    await handler(new Request('http://localhost/?id=example'))
    const html = await (await handler(new Request('http://localhost/'))).text()
    expect(html).toContain('2026-07-15')
  })
})
