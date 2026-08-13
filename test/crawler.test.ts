import { describe, expect, test } from 'bun:test'
import type { RSSEntryConfig } from '../src/config'
import {
  buildEntryFeed,
  FeedParseError,
  fetchEntryFeed,
  UpstreamFetchError,
} from '../src/crawler'

const fixturesDirectory = new URL('./fixtures/', import.meta.url)

async function fixture(name: string): Promise<string> {
  return Bun.file(new URL(name, fixturesDirectory)).text()
}

const ricohConfig: RSSEntryConfig = {
  id: 'ricoh',
  title: 'Ricoh Firmware',
  url: 'https://example.com/ricoh/',
  selectors: {
    item: '.news dt, .news dd',
    itemGroupSize: 2,
    itemDate: 'dt',
    itemTitle: 'dd',
    itemId: 'dd',
  },
  format: { itemDate: 'YYYY.MM.DD' },
}

describe('buildEntryFeed', () => {
  test('groups Ricoh dt/dd records', async () => {
    const rss = buildEntryFeed(ricohConfig, await fixture('ricoh.html'))
    expect(rss).toContain('GR III firmware version 2.10')
    expect(rss).toContain('GR III firmware version 2.00')
    expect(rss).toContain('rss_it_guid=GR+III+firmware+version+2.10')
  })

  test('returns the newest item date as feed metadata', async () => {
    const { buildEntryFeedResult } = await import('../src/crawler')
    const result = buildEntryFeedResult(
      ricohConfig,
      await fixture('ricoh.html'),
    )
    expect(new Date(result.contentUpdatedAt).toISOString().slice(0, 10)).toBe(
      '2025-10-23',
    )
  })

  test('groups Viltrox title and date containers', async () => {
    const config: RSSEntryConfig = {
      id: 'viltrox',
      title: 'Viltrox Firmware',
      url: 'https://example.com/viltrox/',
      selectors: {
        item: '.download-list-items:first-child,.download-list-items2:nth-child(2)',
        itemGroupSize: 2,
        itemDate: '.version-notes-date',
        itemTitle: '.download-list-item-title',
        itemId: '.download-list-item-title',
      },
      format: { itemDate: 'YYYY-M-DD' },
    }
    const rss = buildEntryFeed(config, await fixture('viltrox.html'))
    expect(rss).toContain('AF 16mm F1.8 Z V1.0.5')
    expect(rss).toContain('Tue, 31 Mar 2026')
  })

  test('creates distinct Sirui items with descriptions', async () => {
    const config: RSSEntryConfig = {
      id: 'sirui',
      title: 'Sirui Firmware',
      url: 'https://example.com/sirui/',
      selectors: {
        item: '.anno-content-list-box',
        itemDate: '.anno-content-list-box-date',
        itemTitle: '.anno-content-list-box-title',
        itemId: '.anno-content-list-box-title',
        itemDescription: '.anno-content-list-box-txt',
      },
      format: { itemDate: 'YYYY.MM.DD' },
    }
    const rss = buildEntryFeed(config, await fixture('sirui.html'))
    expect(rss).toContain('Aurora 35mm Z V1.0.6')
    expect(rss).toContain('Aurora 85mm E V1.0.9')
    expect(rss).toContain('Improves aperture display.')
  })

  test('rejects items with invalid dates instead of using the current time', () => {
    expect(() =>
      buildEntryFeed(
        ricohConfig,
        '<dl class="news"><dt>not-a-date</dt><dd>Firmware</dd></dl>',
      ),
    ).toThrow(FeedParseError)
  })

  test('rejects incomplete grouped records', () => {
    expect(() =>
      buildEntryFeed(
        ricohConfig,
        '<dl class="news"><dt>2025.10.23</dt><dd>Firmware</dd><dt>2025.07.15</dt></dl>',
      ),
    ).toThrow('cannot be grouped by 2')
  })
})

describe('fetchEntryFeed', () => {
  test('rejects non-success HTTP responses', async () => {
    const fetchImpl = () =>
      Promise.resolve(new Response('failed', { status: 503 }))
    await expect(
      fetchEntryFeed(ricohConfig, { fetchImpl }),
    ).rejects.toBeInstanceOf(UpstreamFetchError)
  })

  test('rejects responses over the configured body limit', async () => {
    const fetchImpl = () => Promise.resolve(new Response('x'.repeat(128)))
    await expect(
      fetchEntryFeed(ricohConfig, { fetchImpl, maxResponseBytes: 32 }),
    ).rejects.toBeInstanceOf(UpstreamFetchError)
  })
})
