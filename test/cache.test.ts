import { describe, expect, test } from 'bun:test'
import { CacheHub } from '../src/cache'

describe('CacheHub', () => {
  test('uses an explicit TTL', () => {
    let now = 1_000
    const cache = new CacheHub(500, () => now)
    cache.set('feed', { content: 'content', contentUpdatedAt: 900 })
    expect(cache.get('feed').status).toBe('fresh')
    now = 1_500
    expect(cache.get('feed').status).toBe('stale')
  })

  test('deduplicates concurrent refreshes', async () => {
    const cache = new CacheHub(500)
    let calls = 0
    const loader = async () => {
      calls += 1
      await Promise.resolve()
      return { content: 'content', contentUpdatedAt: 900 }
    }
    const [first, second] = await Promise.all([
      cache.refresh('feed', loader),
      cache.refresh('feed', loader),
    ])
    expect(first.content).toBe('content')
    expect(second.content).toBe('content')
    expect(calls).toBe(1)
  })

  test('keeps stale content when a refresh fails', async () => {
    let now = 1_000
    const cache = new CacheHub(100, () => now)
    cache.set('feed', {
      content: 'last-known-good',
      contentUpdatedAt: 900,
    })
    now = 1_101
    await expect(
      cache.refresh('feed', () => Promise.reject(new Error('upstream failed'))),
    ).rejects.toThrow('upstream failed')
    expect(cache.get('feed').entry?.content).toBe('last-known-good')
  })
})
