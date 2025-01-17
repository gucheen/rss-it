import { expect, test } from 'bun:test'
import { parse } from 'node-html-parser'
import config from '../config.json'
import '../src'

test('server up and listen to port :3000', async () => {
  const response = await fetch('http://127.0.0.1:3000')
  expect(response.ok).toBeTrue()
})

test('able to fetch RSS content and output as RSS2.0', async () => {
  const randomID =
    config.entris[Math.floor(Math.random() * config.entris.length)].id
  console.log('test rss validation with', randomID)
  const response = await fetch(`http://127.0.0.1:3000/?id=${randomID}`)
  expect(response.ok).toBeTrue()
  const rss = await response.text()
  const body = new URLSearchParams()
  body.append('rawdata', rss)
  body.append('output', 'soap12')
  body.append('manual', '1')
  const validateResponse = await fetch(
    'https://validator.w3.org/feed/check.cgi',
    {
      headers: {
        accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'content-type': 'application/x-www-form-urlencoded',
        'user-agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
      },
      referrer: 'https://validator.w3.org/feed/',
      method: 'POST',
      body,
    },
  )
  const resultSOAP = await validateResponse.text()
  console.log(resultSOAP)
  const result = parse(resultSOAP)
  const validity = result.querySelector('m\\:validity')?.textContent
  expect(validity).toBe('true')
})
