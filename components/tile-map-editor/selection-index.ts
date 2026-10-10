// A small spatial hash for hit testing visual bounds. Preserve source order for overlapping sprites.
export function createSpatialIndex<T>(items: T[], boundsOf: (item: T) => { x: number; y: number; width: number; height: number }) {
  const buckets = new Map<string, { item: T; index: number; bounds: ReturnType<typeof boundsOf> }[]>()
  const oversized: { item: T; index: number; bounds: ReturnType<typeof boundsOf> }[] = []
  const bucketSize = 128
  items.forEach((item, index) => {
    const bounds = boundsOf(item)
    const firstX = Math.floor(bounds.x / bucketSize)
    const firstY = Math.floor(bounds.y / bucketSize)
    const lastX = Math.ceil((bounds.x + bounds.width) / bucketSize) - 1
    const lastY = Math.ceil((bounds.y + bounds.height) / bucketSize) - 1
    const entry = { item, index, bounds }
    if ((lastX - firstX + 1) * (lastY - firstY + 1) > 4096) {
      oversized.push(entry)
      return
    }
    for (let y = firstY; y <= lastY; y++) {
      for (let x = firstX; x <= lastX; x++) {
        const key = `${x},${y}`
        const bucket = buckets.get(key)
        if (bucket) bucket.push(entry)
        else buckets.set(key, [entry])
      }
    }
  })

  return (x: number, y: number): T[] => {
    const candidates = [...(buckets.get(`${Math.floor(x / bucketSize)},${Math.floor(y / bucketSize)}`) ?? []), ...oversized]
    return candidates
      .filter(({ bounds }) => x >= bounds.x && x < bounds.x + bounds.width && y >= bounds.y && y < bounds.y + bounds.height)
      .sort((a, b) => a.index - b.index)
      .map(({ item }) => item)
  }
}
