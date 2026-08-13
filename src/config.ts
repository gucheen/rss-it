export type SelectorPattern = string | string[]

export interface RSSEntryConfig {
  id: string
  url: string
  title?: string
  image?: string
  ruleUpdatedAt?: string
  selectors: {
    title?: SelectorPattern
    copyright?: SelectorPattern
    item: string
    itemGroupSize?: number
    itemLink?: string
    itemDate: string
    itemTitle: SelectorPattern
    itemDescription?: SelectorPattern
    itemId?: SelectorPattern
  }
  format?: {
    itemDate?: string
  }
}

export interface AppConfig {
  entries: RSSEntryConfig[]
  cacheTtlSeconds: number
  fetchTimeoutMs: number
  maxResponseBytes: number
}

const DEFAULT_CACHE_TTL_SECONDS = 60 * 60
const DEFAULT_FETCH_TIMEOUT_MS = 10_000
const DEFAULT_MAX_RESPONSE_BYTES = 2 * 1024 * 1024

export class ConfigValidationError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Invalid config.json:\n- ${issues.join('\n- ')}`)
    this.name = 'ConfigValidationError'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function reportUnknownKeys(
  source: Record<string, unknown>,
  allowedKeys: string[],
  path: string,
  issues: string[],
): void {
  for (const key of Object.keys(source)) {
    if (!allowedKeys.includes(key))
      issues.push(`${path}.${key} is not supported`)
  }
}

function readRequiredString(
  source: Record<string, unknown>,
  key: string,
  path: string,
  issues: string[],
): string {
  const value = source[key]
  if (typeof value !== 'string' || value.trim().length === 0) {
    issues.push(`${path}.${key} must be a non-empty string`)
    return ''
  }
  return value.trim()
}

function readOptionalString(
  source: Record<string, unknown>,
  key: string,
  path: string,
  issues: string[],
): string | undefined {
  const value = source[key]
  if (value === undefined) return undefined
  if (typeof value !== 'string' || value.trim().length === 0) {
    issues.push(`${path}.${key} must be a non-empty string when provided`)
    return undefined
  }
  return value.trim()
}

function readSelectorPattern(
  source: Record<string, unknown>,
  key: string,
  path: string,
  issues: string[],
  required = false,
): SelectorPattern | undefined {
  const value = source[key]
  if (value === undefined && !required) return undefined
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim()
  }
  if (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((item) => typeof item === 'string' && item.trim().length > 0)
  ) {
    return value.map((item) => item.trim())
  }
  issues.push(`${path}.${key} must be a non-empty string or string array`)
  return undefined
}

function readPositiveInteger(
  source: Record<string, unknown>,
  key: string,
  fallback: number,
  path: string,
  issues: string[],
): number {
  const value = source[key]
  if (value === undefined) return fallback
  if (!Number.isInteger(value) || (value as number) <= 0) {
    issues.push(`${path}.${key} must be a positive integer`)
    return fallback
  }
  return value as number
}

function parseEntry(
  value: unknown,
  index: number,
  issues: string[],
): RSSEntryConfig | null {
  const path = `entries[${index}]`
  if (!isRecord(value)) {
    issues.push(`${path} must be an object`)
    return null
  }

  reportUnknownKeys(
    value,
    ['id', 'url', 'title', 'image', 'ruleUpdatedAt', 'selectors', 'format'],
    path,
    issues,
  )

  const id = readRequiredString(value, 'id', path, issues)
  const url = readRequiredString(value, 'url', path, issues)
  if (url) {
    try {
      const parsedURL = new URL(url)
      if (!['http:', 'https:'].includes(parsedURL.protocol)) {
        issues.push(`${path}.url must use http or https`)
      }
    } catch {
      issues.push(`${path}.url must be a valid URL`)
    }
  }
  const image = readOptionalString(value, 'image', path, issues)
  if (image) {
    try {
      const imageURL = new URL(image)
      if (!['http:', 'https:'].includes(imageURL.protocol)) {
        issues.push(`${path}.image must use http or https`)
      }
    } catch {
      issues.push(`${path}.image must be a valid URL`)
    }
  }
  const ruleUpdatedAt = readOptionalString(value, 'ruleUpdatedAt', path, issues)
  if (ruleUpdatedAt && !/^\d{4}-\d{2}-\d{2}$/.test(ruleUpdatedAt)) {
    issues.push(`${path}.ruleUpdatedAt must use YYYY-MM-DD format`)
  } else if (ruleUpdatedAt) {
    const parsedRuleDate = new Date(`${ruleUpdatedAt}T00:00:00Z`)
    if (
      Number.isNaN(parsedRuleDate.getTime()) ||
      parsedRuleDate.toISOString().slice(0, 10) !== ruleUpdatedAt
    ) {
      issues.push(`${path}.ruleUpdatedAt must be a valid calendar date`)
    }
  }

  const rawSelectors = value.selectors
  if (!isRecord(rawSelectors)) {
    issues.push(`${path}.selectors must be an object`)
    return null
  }
  reportUnknownKeys(
    rawSelectors,
    [
      'title',
      'copyright',
      'item',
      'itemGroupSize',
      'itemLink',
      'itemDate',
      'itemTitle',
      'itemDescription',
      'itemId',
    ],
    `${path}.selectors`,
    issues,
  )

  const itemTitle = readSelectorPattern(
    rawSelectors,
    'itemTitle',
    `${path}.selectors`,
    issues,
    true,
  )
  const selectors: RSSEntryConfig['selectors'] = {
    item: readRequiredString(rawSelectors, 'item', `${path}.selectors`, issues),
    itemDate: readRequiredString(
      rawSelectors,
      'itemDate',
      `${path}.selectors`,
      issues,
    ),
    itemTitle: itemTitle ?? '',
  }

  selectors.title = readSelectorPattern(
    rawSelectors,
    'title',
    `${path}.selectors`,
    issues,
  )
  selectors.copyright = readSelectorPattern(
    rawSelectors,
    'copyright',
    `${path}.selectors`,
    issues,
  )
  selectors.itemId = readSelectorPattern(
    rawSelectors,
    'itemId',
    `${path}.selectors`,
    issues,
  )
  selectors.itemDescription = readSelectorPattern(
    rawSelectors,
    'itemDescription',
    `${path}.selectors`,
    issues,
  )
  selectors.itemLink = readOptionalString(
    rawSelectors,
    'itemLink',
    `${path}.selectors`,
    issues,
  )
  if (rawSelectors.itemGroupSize !== undefined) {
    selectors.itemGroupSize = readPositiveInteger(
      rawSelectors,
      'itemGroupSize',
      1,
      `${path}.selectors`,
      issues,
    )
  }

  let format: RSSEntryConfig['format']
  if (value.format !== undefined) {
    if (!isRecord(value.format)) {
      issues.push(`${path}.format must be an object`)
    } else {
      reportUnknownKeys(value.format, ['itemDate'], `${path}.format`, issues)
      format = {
        itemDate: readOptionalString(
          value.format,
          'itemDate',
          `${path}.format`,
          issues,
        ),
      }
    }
  }

  return {
    id,
    url,
    title: readOptionalString(value, 'title', path, issues),
    image,
    ruleUpdatedAt,
    selectors,
    format,
  }
}

export function parseAppConfig(value: unknown): AppConfig {
  const issues: string[] = []
  if (!isRecord(value)) {
    throw new ConfigValidationError(['config root must be an object'])
  }
  reportUnknownKeys(
    value,
    [
      'entries',
      'entris',
      'cacheTtlSeconds',
      'fetchTimeoutMs',
      'maxResponseBytes',
    ],
    'config',
    issues,
  )
  if (value.entries !== undefined && value.entris !== undefined) {
    issues.push('config must not define both entries and legacy entris')
  }

  const rawEntries = value.entries ?? value.entris
  if (!Array.isArray(rawEntries) || rawEntries.length === 0) {
    issues.push('entries must be a non-empty array')
  }

  const entries = Array.isArray(rawEntries)
    ? rawEntries
        .map((entry, index) => parseEntry(entry, index, issues))
        .filter((entry): entry is RSSEntryConfig => entry !== null)
    : []

  const duplicateIDs = entries
    .map((entry) => entry.id)
    .filter((id, index, ids) => id && ids.indexOf(id) !== index)
  for (const id of new Set(duplicateIDs)) {
    issues.push(`entry id "${id}" is duplicated`)
  }

  const config: AppConfig = {
    entries,
    cacheTtlSeconds: readPositiveInteger(
      value,
      'cacheTtlSeconds',
      DEFAULT_CACHE_TTL_SECONDS,
      'config',
      issues,
    ),
    fetchTimeoutMs: readPositiveInteger(
      value,
      'fetchTimeoutMs',
      DEFAULT_FETCH_TIMEOUT_MS,
      'config',
      issues,
    ),
    maxResponseBytes: readPositiveInteger(
      value,
      'maxResponseBytes',
      DEFAULT_MAX_RESPONSE_BYTES,
      'config',
      issues,
    ),
  }

  if (issues.length > 0) throw new ConfigValidationError(issues)
  return config
}

export async function loadAppConfig(path = 'config.json'): Promise<AppConfig> {
  const configFile = Bun.file(path)
  if (!(await configFile.exists())) {
    throw new ConfigValidationError([`${path} does not exist`])
  }

  let rawConfig: unknown
  try {
    rawConfig = await configFile.json()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new ConfigValidationError([`${path} is not valid JSON: ${message}`])
  }

  if (isRecord(rawConfig) && rawConfig.entris !== undefined) {
    console.warn('config.json field "entris" is deprecated; use "entries"')
  }
  return parseAppConfig(rawConfig)
}
