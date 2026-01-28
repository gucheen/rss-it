import { file } from 'bun'
import index from '../public/index.html' with { type: 'file' }
import { CacheHub } from './cache'
import { getEntryFeed } from './crawler'

const cacheHub = new CacheHub()

const server = Bun.serve({
  async fetch(req) {
    const reqURL = new URL(req.url)
    const id = reqURL.searchParams.get('id')
    if (id) {
      const cacheContent = cacheHub.getCache(id)
      if (cacheContent) {
        return new Response(cacheContent, {
          headers: {
            'Content-type': 'text/xml;charset=UTF-8',
          },
        })
      }
      const feed = await getEntryFeed(id)
      if (feed) {
        cacheHub.addCache(id, feed)
        return new Response(feed, {
          headers: {
            'Content-type': 'text/xml;charset=UTF-8',
          },
        })
      }
      return new Response('RSS entry error', {
        status: 500,
      })
    }
    return new Response(file(index), {
      headers: {
        'Content-type': 'text/html;charset=UTF-8',
      },
    })
  },
})

console.log(`rss-it is up, listened on ${server.url}`)
