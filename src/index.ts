import { getEntryFeed } from './crawler'

const server = Bun.serve({
  async fetch(req) {
    const reqURL = new URL(req.url)
    const id = reqURL.searchParams.get('id')
    if (id) {
      const feed = await getEntryFeed(id)
      if (feed) {
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
    return new Response('Please provide RSS entry\'s id', {
      status: 400,
    })
  },
})

console.log('Bun server up, listened on :' + server.port)
