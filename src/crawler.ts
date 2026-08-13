import { parse, type HTMLElement } from 'node-html-parser'
import { Feed, type Item } from 'feed'
import dayjs from 'dayjs'
import customParseFormat from 'dayjs/plugin/customParseFormat'
import type { FeedContent } from './cache'
import type { RSSEntryConfig, SelectorPattern } from './config'
import { htmlElementGroupToFragment } from './utils'

dayjs.extend(customParseFormat)

const USER_AGENT =
  'Mozilla/5.0 (compatible; RSS-it/1.0; +https://github.com/gucheen/rss-it)'

export class UpstreamFetchError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'UpstreamFetchError'
  }
}

export class FeedParseError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'FeedParseError'
  }
}

export type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>

export interface FetchEntryFeedOptions {
  fetchImpl?: FetchLike
  timeoutMs?: number
  maxResponseBytes?: number
}

function getTextBySelectorPatternFromParent(
  selectorPattern: SelectorPattern,
  parent: HTMLElement,
): string {
  const selectors = Array.isArray(selectorPattern)
    ? selectorPattern
    : [selectorPattern]
  return selectors
    .flatMap((selector) => parent.querySelectorAll(selector))
    .map((item) => item.textContent.trim())
    .filter(Boolean)
    .join(' | ')
}

function parseItemDate(
  dateText: string,
  format: string | undefined,
): Date | null {
  const parsed = format
    ? dayjs(dateText.trim(), format, true)
    : dayjs(dateText.trim())
  return parsed.isValid() ? parsed.toDate() : null
}

function resolveURL(href: string | undefined, baseURL: string): string {
  if (!href) return baseURL
  return new URL(href, baseURL).toString()
}

function createStableID(
  element: HTMLElement,
  config: RSSEntryConfig,
  title: string,
  link: string,
): string {
  const configuredID = config.selectors.itemId
    ? getTextBySelectorPatternFromParent(config.selectors.itemId, element)
    : ''
  if (configuredID) {
    const idURL = new URL(link || config.url, config.url)
    idURL.searchParams.set('rss_it_guid', configuredID)
    return idURL.toString()
  }
  if (link && link !== config.url) return link
  return `${config.url}#rss_it_guid=${encodeURIComponent(title)}`
}

function genFeedItemOptionsFromElements(
  elements: HTMLElement[],
  config: RSSEntryConfig,
): Item[] {
  return elements
    .flatMap((element): Item[] => {
      const title = getTextBySelectorPatternFromParent(
        config.selectors.itemTitle,
        element,
      )
      if (!title) return []

      const dateText = element.querySelector(
        config.selectors.itemDate,
      )?.textContent
      if (!dateText) return []
      const date = parseItemDate(dateText, config.format?.itemDate)
      if (!date) return []

      const href = element
        .querySelector(config.selectors.itemLink ?? 'a')
        ?.getAttribute('href')
      const link = resolveURL(href, config.url)
      const item: Item = {
        title,
        link,
        id: createStableID(element, config, title, link),
        date,
      }

      if (config.selectors.itemDescription) {
        const description = getTextBySelectorPatternFromParent(
          config.selectors.itemDescription,
          element,
        )
        if (description) item.description = description
      }
      return [item]
    })
    .toSorted((a, b) => b.date.getTime() - a.date.getTime())
}

export function buildEntryFeedResult(
  config: RSSEntryConfig,
  html: string,
): FeedContent {
  try {
    const page = parse(html)
    const title =
      config.title ??
      (config.selectors.title
        ? getTextBySelectorPatternFromParent(config.selectors.title, page)
        : '') ??
      config.id
    const copyright = config.selectors.copyright
      ? getTextBySelectorPatternFromParent(config.selectors.copyright, page)
      : ''

    const feed = new Feed({
      title: title || config.id,
      description: '',
      id: config.url,
      link: config.url,
      language: 'en',
      favicon: new URL('/favicon.ico', config.url).toString(),
      copyright,
    })
    if (config.image) feed.options.image = config.image

    const elements = page.querySelectorAll(config.selectors.item)
    const groupSize =
      config.selectors.itemGroupSize ??
      (config.selectors.item.includes(',')
        ? config.selectors.item.split(',').length
        : 1)
    if (groupSize > 1 && elements.length % groupSize !== 0) {
      throw new FeedParseError(
        `Entry "${config.id}" matched ${elements.length} elements, which cannot be grouped by ${groupSize}`,
      )
    }
    const itemElements =
      groupSize > 1 ? htmlElementGroupToFragment(elements, groupSize) : elements
    const items = genFeedItemOptionsFromElements(itemElements, config)
    if (items.length === 0) {
      throw new FeedParseError(
        `No valid feed items matched entry "${config.id}"`,
      )
    }

    for (const item of items) feed.addItem(item)
    feed.options.updated = items[0].date
    return {
      content: feed.rss2(),
      contentUpdatedAt: items[0].date.getTime(),
    }
  } catch (error) {
    if (error instanceof FeedParseError) throw error
    throw new FeedParseError(`Failed to parse entry "${config.id}"`, {
      cause: error,
    })
  }
}

export function buildEntryFeed(config: RSSEntryConfig, html: string): string {
  return buildEntryFeedResult(config, html).content
}

async function readResponseText(
  response: Response,
  maxResponseBytes: number,
): Promise<string> {
  const contentLength = Number(response.headers.get('content-length'))
  if (Number.isFinite(contentLength) && contentLength > maxResponseBytes) {
    throw new UpstreamFetchError(
      `Upstream response exceeds ${maxResponseBytes} bytes`,
      response.status,
    )
  }
  if (!response.body) return ''

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let totalBytes = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    totalBytes += value.byteLength
    if (totalBytes > maxResponseBytes) {
      await reader.cancel()
      throw new UpstreamFetchError(
        `Upstream response exceeds ${maxResponseBytes} bytes`,
        response.status,
      )
    }
    chunks.push(value)
  }

  const body = new Uint8Array(totalBytes)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(body)
}

export async function fetchEntryFeed(
  config: RSSEntryConfig,
  options: FetchEntryFeedOptions = {},
): Promise<string> {
  return (await fetchEntryFeedResult(config, options)).content
}

export async function fetchEntryFeedResult(
  config: RSSEntryConfig,
  options: FetchEntryFeedOptions = {},
): Promise<FeedContent> {
  const fetchImpl = options.fetchImpl ?? fetch
  const timeoutMs = options.timeoutMs ?? 10_000
  const maxResponseBytes = options.maxResponseBytes ?? 2 * 1024 * 1024

  let response: Response
  try {
    response = await fetchImpl(config.url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (error) {
    throw new UpstreamFetchError(`Failed to fetch "${config.id}"`, undefined, {
      cause: error,
    })
  }
  if (!response.ok) {
    throw new UpstreamFetchError(
      `Upstream returned HTTP ${response.status} for "${config.id}"`,
      response.status,
    )
  }

  const html = await readResponseText(response, maxResponseBytes)
  return buildEntryFeedResult(config, html)
}
