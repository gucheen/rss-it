import { parse, type HTMLElement } from 'node-html-parser'
import { Feed } from 'feed'
import type { Item } from 'feed'
import dayjs from 'dayjs'
import customParseFormat from 'dayjs/plugin/customParseFormat'
import { htmlElementGroupToFragment } from './utils'

const appConfigFile = Bun.file('config.json')

if (!(await appConfigFile.exists())) {
  console.error('please create config.json!')
  process.exit(1)
}

const appConfig = await appConfigFile.json()

dayjs.extend(customParseFormat)

type SelectorPattern = string | string[]

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

function getTextBySelectorPatternFromParent(
  selectorPattern: SelectorPattern,
  parent: HTMLElement,
): string {
  if (Array.isArray(selectorPattern)) {
    return selectorPattern
      .map((selector) => parent.querySelectorAll(selector))
      .flat()
      .map((item) => item?.textContent || '')
      .filter((text) => text.trim().length > 0)
      .join(' | ')
  } else if (typeof selectorPattern === 'string') {
    return parent
      .querySelectorAll(selectorPattern)
      .map((item) => item?.textContent || '')
      .filter((text) => text)
      .join(' | ')
  }
  return ''
}

function genFeedItemOptionsFromElements(
  elements: HTMLElement[],
  config: RSSEntryConfig,
): Item[] {
  const allItems = elements
    .map((element) => {
      const href =
        (
          element.querySelector(
            config.selectors.itemLink ?? 'a',
          ) as unknown as HTMLAnchorElement
        )?.getAttribute('href') || ''
      let link = ''
      if (href) {
        link = href.startsWith('http')
          ? href
          : new URL(href, config.url).toString()
      }
      const dateStr = element.querySelector(
        config.selectors.itemDate,
      )?.textContent
      let date
      if (typeof dateStr === 'string' && dateStr.length > 0) {
        date = dayjs(dateStr, config.format?.itemDate).toDate()
      } else {
        date = new Date()
      }
      const itemOption: Item = {
        title: getTextBySelectorPatternFromParent(
          config.selectors.itemTitle,
          element,
        ),
        link,
        date,
      }
      if (config.selectors.itemId) {
        const id = encodeURIComponent(
          getTextBySelectorPatternFromParent(config.selectors.itemId, element),
        )
        const linkURL = new URL(href, config.url)
        linkURL.searchParams.append('rss_it_guid', id)
        itemOption.id = linkURL.toString()
      }
      if (config.selectors.itemDescription) {
        itemOption.description = getTextBySelectorPatternFromParent(
          config.selectors.itemDescription,
          element,
        )
      }
      return itemOption
    })
    .filter((item) => item.title)
    .toSorted((a, b) => b.date.getTime() - a.date.getTime())

  return allItems
}

export async function getEntryFeed(id: string) {
  const config = appConfig.entris.find(
    (entry) => entry.id === id,
  ) as unknown as RSSEntryConfig
  if (config) {
    const response = await fetch(config.url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
      },
    })

    const html = await response.text()

    const page = parse(html)

    let title = ''
    if (config.title) {
      title = config.title
    } else if (config.selectors.title) {
      title = getTextBySelectorPatternFromParent(config.selectors.title, page)
    }
    let copyright = ''
    if (config.selectors.copyright) {
      copyright = getTextBySelectorPatternFromParent(
        config.selectors.copyright,
        page,
      )
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

    const allNewsEls = page.querySelectorAll(config.selectors.item)

    let allItems

    if (config.selectors.item.includes(',')) {
      const selectorGroupSize = config.selectors.item.split(',').length
      allItems = genFeedItemOptionsFromElements(
        htmlElementGroupToFragment(allNewsEls, selectorGroupSize),
        config,
      )
    } else {
      allItems = genFeedItemOptionsFromElements(allNewsEls, config)
    }

    if (allItems.length > 0) {
      allItems.forEach((itemOption) => {
        feed.addItem(itemOption)
      })

      feed.options.updated = allItems[0].date
    }

    console.log(
      dayjs().format('YYYY-MM-DD HH:mm:ss:'),
      `Update ${id}'s feed content`,
    )

    return feed.rss2()
  }
  return ''
}
