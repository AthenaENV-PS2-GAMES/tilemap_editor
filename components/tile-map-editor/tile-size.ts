import type { AtlasFrame, EntityDefinition, TextureAtlas } from "./types"
import { GRID_SIZE } from "./types"
import { OBJECTS, ENEMIES, PLAYER_SPAWN } from "./default-elements"
import { createAssetResolver } from "./asset-resolver"

const resolveEntity = createAssetResolver<EntityDefinition>(
  Object.fromEntries([...OBJECTS, ...ENEMIES, ...PLAYER_SPAWN].map((entity) => [entity.id, entity]))
)
const atlasResolvers = new WeakMap<TextureAtlas, (id: string) => AtlasFrame | undefined>()

export function getTileSize(tileId: string, atlas: TextureAtlas | null) {
  const entity = resolveEntity(tileId)
  if (entity) return { width: entity.frameWidth ?? entity.width, height: entity.height }
  let resolveFrame = atlas ? atlasResolvers.get(atlas) : undefined
  if (atlas && !resolveFrame) {
    resolveFrame = createAssetResolver(atlas.frames)
    atlasResolvers.set(atlas, resolveFrame)
  }
  const frame = resolveFrame?.(tileId)?.frame
  return { width: frame?.w ?? GRID_SIZE, height: frame?.h ?? GRID_SIZE }
}
