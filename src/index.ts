import { parse } from 'node-html-parser'
import { Feed } from 'feed'
import dayjs from 'dayjs'
import customParseFormat from 'dayjs/plugin/customParseFormat'
import appConfig from '../config.json'
import { CacheHub } from './cache'

dayjs.extend(customParseFormat)

interface RSSEntryConfig {
  id: string
  url: string
  title?: string
  image?: string
  selectors: {
    title?: string
    copyright?: string
    item: string
    itemLink: string
    itemDate: string
    itemTitle: string
  }
  format?: {
    itemDate?: string
  }
}


const cacheHub = new CacheHub()

async function getEntryFeed(id: string) {
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

    allNewsEls.forEach((el, index) => {
      const href = (el.querySelector('a') as unknown as HTMLAnchorElement)?.getAttribute('href') || ''
      const link = new URL(href, config.url).toString()
      const dateStr = el.querySelector(config.selectors.itemDate)?.textContent
      let date
      if (typeof dateStr === 'string' && dateStr.length > 0) {
        date = dayjs(dateStr, config.format?.itemDate).toDate()
      } else {
        date = new Date()
      }
      feed.addItem({
        title: el.querySelector(config.selectors.itemTitle)?.textContent || '',
        id: link,
        link: link,
        date,
      })
      if (index === 0) {
        feed.options.updated = date
      }
    })

    const rss2Content = feed.rss2()

    cacheHub.addCache(config.id, rss2Content)

    return rss2Content
  }
  return ''
}

Bun.serve({
  async fetch(req) {
    const reqURL = new URL(req.url)
    const id = reqURL.searchParams.get('id')
    if (id) {
      const feed = await getEntryFeed(id)
      if (feed) {
        return new Response(feed)
      }
      return new Response('RSS entry error', {
        status: 500,
      })
    }
    return new Response('Please provide RSS entry\'s id', {
      status: 400,
    })
  },
})
