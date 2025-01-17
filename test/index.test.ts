import { expect, test } from 'bun:test'
import { parse } from 'node-html-parser'
import config from '../config.json'
import '../src'

test('server up and listen to port :3000', async () => {
  const response = await fetch('http://127.0.0.1:3000')
  expect(response.ok).toBeTrue()
})

test('able to fetch RSS content and output as RSS2.0', async () => {
  const randomID = config.entris[Math.floor(Math.random() * config.entris.length)].id
  console.log('test rss validation with', randomID)
  const response = await fetch(`http://127.0.0.1:3000/?id=${randomID}`)
  expect(response.ok).toBeTrue()
  const rss = await response.text()
  const search = new URLSearchParams()
  search.append('output', 'soap12')
  search.append('rawdata', rss)
  const validateResponse = await fetch('https://validator.w3.org/feed/check.cgi?' + search.toString())
  const resultSOAP = await validateResponse.text()
  const result = parse(resultSOAP)
  const validity = result.querySelector('m\\:validity')?.textContent
  expect(validity).toBe('true')
})
