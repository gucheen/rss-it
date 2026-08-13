import homepageTemplateFile from '../public/index.html' with { type: 'file' }
import { createRequestHandler } from './app'
import { loadAppConfig } from './config'

try {
  const config = await loadAppConfig()
  // Bun embeds the HTML asset as a file path when compiling, while its current
  // type declarations expose HTML imports as HTMLBundle.
  const homepageTemplate = await Bun.file(
    homepageTemplateFile as unknown as string,
  ).text()
  const server = Bun.serve({
    fetch: createRequestHandler(config, { homepageTemplate }),
  })
  console.log(`rss-it is up, listened on ${server.url}`)
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
