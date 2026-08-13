import { describe, expect, test } from 'bun:test'
import { ConfigValidationError, parseAppConfig } from '../src/config'

const validEntry = {
  id: 'example',
  url: 'https://example.com/',
  ruleUpdatedAt: '2026-08-13',
  selectors: {
    item: 'article',
    itemDate: 'time',
    itemTitle: 'h2',
  },
}

describe('parseAppConfig', () => {
  test('applies defaults and accepts entries', () => {
    const config = parseAppConfig({ entries: [validEntry] })
    expect(config.entries).toHaveLength(1)
    expect(config.cacheTtlSeconds).toBe(3600)
    expect(config.fetchTimeoutMs).toBe(10_000)
  })

  test('temporarily accepts the legacy entris field', () => {
    const config = parseAppConfig({ entris: [validEntry] })
    expect(config.entries[0].id).toBe('example')
  })

  test('reports duplicate ids and invalid URLs', () => {
    expect(() =>
      parseAppConfig({
        entries: [validEntry, { ...validEntry, url: 'file:///tmp/feed' }],
      }),
    ).toThrow(ConfigValidationError)
  })

  test('rejects unknown fields instead of ignoring typos', () => {
    expect(() =>
      parseAppConfig({ entries: [validEntry], cacheTTLSeconds: 30 }),
    ).toThrow('config.cacheTTLSeconds is not supported')
  })

  test('validates rule update dates', () => {
    expect(() =>
      parseAppConfig({
        entries: [{ ...validEntry, ruleUpdatedAt: '2026-02-30' }],
      }),
    ).toThrow('ruleUpdatedAt must be a valid calendar date')
  })

  test('validates the committed example config', async () => {
    const rawConfig = await Bun.file('config.example.json').json()
    expect(parseAppConfig(rawConfig).entries).toHaveLength(6)
  })
})
