import dayjs from 'dayjs'

export class CacheHub {
  state = new Map<string, { lastUpdate: number }>()
  hub = new Map<string, string>()

  addCache(id: string, content: string): void {
    this.hub.set(id, content)
    this.state.set(id, { lastUpdate: Date.now() })
  }
  
  getCache(id: string): string|null {
    const cacheState = this.state.get(id)
    if (cacheState && cacheState.lastUpdate) {
      const cacheInToday = dayjs(cacheState.lastUpdate).isSame(dayjs(), 'day')
      if (cacheInToday && this.hub.has(id)) {
        return this.hub.get(id) ?? null
      }
    }
    return null
  }
}
