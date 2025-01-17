import { parse, type HTMLElement } from 'node-html-parser'

export function htmlElementGroupToFragment(array: HTMLElement[], chunkSize: number): HTMLElement[] {
  const R = []
  for (let i = 0, len = array.length; i < len; i += chunkSize) {
    const chunkFragment = parse('<div></div>')
    chunkFragment.append(...array.slice(i, i + chunkSize))
    R.push(chunkFragment)
  }
  return R
}
