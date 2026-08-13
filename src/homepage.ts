import type { CacheHub } from './cache'
import type { RSSEntryConfig } from './config'

function escapeHTML(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;',
      })[character] ?? character,
  )
}

function formatContentDate(timestamp: number | undefined): string {
  if (!timestamp) return 'Awaiting first fetch'
  return new Date(timestamp).toISOString().slice(0, 10)
}

export function renderHomepage(
  template: string,
  entries: RSSEntryConfig[],
  cache: CacheHub,
  origin: string,
): string {
  const rows = entries
    .map((entry) => {
      const feedURL = new URL('/', origin)
      feedURL.searchParams.set('id', entry.id)
      const contentUpdatedAt = cache.get(entry.id).entry?.contentUpdatedAt
      return `
            <tr>
              <th scope="row">${escapeHTML(entry.title ?? entry.id)}</th>
              <td><a href="${escapeHTML(entry.url)}">${escapeHTML(entry.url)}</a></td>
              <td><a href="${escapeHTML(feedURL.toString())}">${escapeHTML(feedURL.toString())}</a></td>
              <td>${escapeHTML(entry.ruleUpdatedAt ?? 'Not specified')}</td>
              <td>${escapeHTML(formatContentDate(contentUpdatedAt))}</td>
            </tr>`
    })
    .join('')
  return template.replace('<!-- RSS_IT_ENTRY_ROWS -->', rows)
}
