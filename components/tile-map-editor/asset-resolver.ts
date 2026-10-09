import { normalizeTileId } from "./types"

// Resolve sprite aliases and variant prefixes/suffixes without changing map IDs.
export function createAssetResolver<T>(assets: Record<string, T>) {
  const byId = new Map(
    Object.entries(assets).map(([id, asset]) => [normalizeTileId(id.replace(/\.png$/, "")), asset])
  )
  // Prefer the most specific ID when several IDs occur in the same map key.
  const ids = [...byId.keys()].sort((a, b) => b.length - a.length)
  const cache = new Map<string, T | undefined>()

  return (tileId: string): T | undefined => {
    if (cache.has(tileId)) return cache.get(tileId)

    const normalizedId = normalizeTileId(tileId.replace(/\.png$/, ""))
    const matchedId = byId.has(normalizedId)
      ? normalizedId
      : ids.find((id) => normalizedId.includes(id))
    const asset = matchedId === undefined ? undefined : byId.get(matchedId)
    cache.set(tileId, asset)
    return asset
  }
}
