// Selection uses object identity so overlapping copies remain separate elements.
export function updateSelectedElements<T extends { x: number; y: number }>(
  elements: T[],
  selection: T[],
  anchor: T,
  changes: Partial<T>
): { elements: T[]; selection: T[] } {
  const selected = new Set(selection)
  const keys = Object.keys(changes) as (keyof T)[]
  const nextSelection: T[] = []
  const nextElements = elements.map((element) => {
    if (!selected.has(element)) return element
    const next = { ...element }
    for (const key of keys) {
      // Move a group relative to the reference element, preserving its layout.
      if (key === "x" || key === "y") {
        const axis = key as "x" | "y"
        next[axis] = element[axis] + (changes[axis] ?? anchor[axis]) - anchor[axis]
      } else {
        next[key] = changes[key] as T[typeof key]
      }
    }
    nextSelection.push(next)
    return next
  })
  return { elements: nextElements, selection: nextSelection }
}

export function selectMatchingElements<T, K extends keyof T>(
  elements: T[],
  anchor: T,
  key: K
): T[] {
  return elements.filter((element) => element[key] === anchor[key])
}
