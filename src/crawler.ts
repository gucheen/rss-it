import { parse } from 'node-html-parser'
import type { HTMLElement } from 'node-html-parser'
import { Feed } from 'feed'
import type { Item } from 'feed'
import dayjs from 'dayjs'
import customParseFormat from 'dayjs/plugin/customParseFormat'
import appConfig from '../config.json'
import { CacheHub } from './cache'

dayjs.extend(customParseFormat)

type SelectorPattern = string|string[]

interface RSSEntryConfig {
  id: string
  url: string
  title?: string
  image?: string
  selectors: {
    title?: string
    copyright?: string
    item: string
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

const cacheHub = new CacheHub()

function getContentFromSelectorPattern(selectorPattern: SelectorPattern, parent: HTMLElement): string {
  if (Array.isArray(selectorPattern)) {
    return selectorPattern.map(selector => parent.querySelector(selector)?.textContent || '').filter(text => text.trim().length > 0).join(' | ')
  } else if (typeof selectorPattern === 'string') {
    return parent.querySelector(selectorPattern)?.textContent || ''
  }
  return ''
}

export async function getEntryFeed(id: string) {
  const config = appConfig.entris.find(entry => entry.id === id) as unknown as RSSEntryConfig
  if (config) {
    const cacheContent = cacheHub.getCache(id)
    if (cacheContent) {
      return cacheContent
    }
    
    const response = await fetch(config.url)

    const html = await response.text()

    const page = parse(html)

    const allNewsEls = page.querySelectorAll(config.selectors.item)

    let title = ''
    if (config.title) {
      title = config.title
    } else if (config.selectors.title) {
      title = page.querySelector(config.selectors.title)?.textContent || ''
    }
    let copyright = ''
    if (config.selectors.copyright) {
      copyright = page.querySelector(config.selectors.copyright)?.textContent || ''
    }

    const feed = new Feed({
      title,
      description: '',
      id: config.url,
      link: config.url,
      language: 'en',
      favicon: new URL('/favicon.ico', config.url).toString(),
      copyright,
    })

    if (config.image) {
      feed.options.image = config.image
    }

    const allItems = allNewsEls.map((newsEl) => {
      const href = (newsEl.querySelector('a') as unknown as HTMLAnchorElement)?.getAttribute('href') || ''
      let link = ''
      if (href) {
        link = href.startsWith('http') ? href : new URL(href, config.url).toString()
      }
      const dateStr = newsEl.querySelector(config.selectors.itemDate)?.textContent
      let date
      if (typeof dateStr === 'string' && dateStr.length > 0) {
        date = dayjs(dateStr, config.format?.itemDate).toDate()
      } else {
        date = new Date()
      }
      const itemOption: Item = {
        title: getContentFromSelectorPattern(config.selectors.itemTitle, newsEl),
        id: config.selectors.itemId ? getContentFromSelectorPattern(config.selectors.itemId, newsEl) : link,
        link: link,
        date,
      }
      if (config.selectors.itemDescription) {
        itemOption.description = getContentFromSelectorPattern(config.selectors.itemDescription, newsEl)
      }
      return itemOption
    })
    .filter(item => item.id)
    .toSorted((a, b) => b.date.getTime() - a.date.getTime())

    allItems.forEach((itemOption, index) => {
      feed.addItem(itemOption)
      if (index === 0) {
        feed.options.updated = itemOption.date
      }
    })

    const rss2Content = feed.rss2()

    console.log(dayjs().format('YYYY-MM-DD HH:mm:ss:'), `Update ${id}'s feed content`)

    cacheHub.addCache(config.id, rss2Content)

    return rss2Content
  }
  return ''
}
