export type Tool = "place" | "erase" | "select" | "collider" | "marker" | "drag"

export type ColliderType = "ground" | "chest" | "ladder" | "door" | "kill"

export interface EntityDefinition {
  id: string
  name: string
  imageSrc: string
  width: number
  height: number
  // For spritesheets: number of frames and frame width (defaults to width if not set)
  frameCount?: number
  frameWidth?: number
}

export interface PlacedTile {
  id?: string
  resource?: ResourceReference
  tilemapId?: string
  order?: number
  tileId: string
  x: number
  y: number
  locked?: boolean
  layer?: number
  creationCode?: string | null
}

export type ResourceReference =
  | { kind: "tile"; tilesetId: string; cropId: string }
  | { kind: "element"; definitionId: string }
  | { kind: "missing"; legacyId: string }

export interface ImageResource {
  id: string
  name: string
  src: string
  width: number
  height: number
}

export interface Crop {
  id: string
  name: string
  x: number
  y: number
  width: number
  height: number
}

export interface GridConfig {
  width: number
  height: number
  margin: number
  spacing: number
}

export interface Tileset {
  id: string
  name: string
  imageId: string
  mode: "grid" | "atlas"
  grid?: GridConfig
  crops: Crop[]
  legacy?: boolean
}

export interface ElementResource {
  id: string
  name: string
  category: "Objetos" | "Inimigos" | "Player" | "Decoração"
  imageId: string
  crop: Crop
  legacyId?: string
}

export interface ProjectInstance extends PlacedTile {
  id: string
  resource: ResourceReference
  order: number
}

export interface Tilemap {
  id: string
  name: string
  visible: boolean
  layer?: number
  cellWidth: number
  cellHeight: number
  origin: { x: number; y: number }
  tiles: ProjectInstance[]
}

export interface ObjectAlignment {
  enabled: boolean
  cellWidth: number
  cellHeight: number
  origin: { x: number; y: number }
}

export interface CanvasSize {
  width: number
  height: number
}

export interface ProjectDocument {
  format: "tilemap-editor"
  version: 1
  images: ImageResource[]
  tilesets: Tileset[]
  elementDefinitions: ElementResource[]
  tilemaps: Tilemap[]
  elements: ProjectInstance[]
  colliders: Collider[]
  markers: Marker[]
  scene: { backgroundColor: string; canvasSize?: CanvasSize; objectAlignment?: ObjectAlignment; annotationAlignment?: ObjectAlignment }
}

export interface Marker {
  name: string
  x: number
  y: number
}

export interface Collider {
  x: number
  y: number
  width: number
  height: number
  type: ColliderType
}

export interface AtlasFrame {
  frame: { x: number; y: number; w: number; h: number }
  spriteSourceSize: { x: number; y: number; w: number; h: number }
  sourceSize: { w: number; h: number }
  rotated?: boolean
  trimmed?: boolean
  pivot?: { x: number; y: number }
}

export interface TextureAtlas {
  frames: Record<string, AtlasFrame>
  meta?: {
    image?: string
    size?: { w: number; h: number }
    scale?: number
  }
}

export interface MapData {
  [key: string]: PlacedTile[] | Collider[]
  colliders: Collider[]
}

export interface Camera {
  x: number
  y: number
  zoom: number
}

export const GRID_SIZE = 16
export const LAYER_COUNT = 5

export function normalizeTileId(tileId: string): string {
  switch (tileId) {
    case "bgSphinx":
    case "enSphinx":
    case "bossSphynx":
    case "standingSphynx":
      return "lwSphinx"
    case "standingBastet":
      return "bossBastet"
    default:
      return tileId
  }
}

// Objects, enemies and the player spawn (not atlas tiles)
export function isEntityId(tileId: string): boolean {
  return (
    normalizeTileId(tileId) === "lwSphinx" ||
    normalizeTileId(tileId) === "bossBastet" ||
    tileId === "bgCloud" ||
    tileId === "bgGreyCloud" ||
    tileId === "bgPyramid" ||
    tileId.startsWith("ob") ||
    tileId.startsWith("en") ||
    tileId.startsWith("boss") ||
    tileId.startsWith("sprite")
  )
}

// Tiles default to layer 1 (index 0), other objects to layer 2 (index 1)
export function defaultLayerFor(tileId: string): number {
  return isEntityId(tileId) ? 1 : 0
}

export function normalizeLayer(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value)
    ? Math.min(Math.max(value, 0), LAYER_COUNT - 1)
    : 0
}
export const MIN_ZOOM = 0.25
export const MAX_ZOOM = 4

export const COLLIDER_COLORS: Record<ColliderType, string> = {
  ground: "rgba(59, 130, 246, 0.35)",
  chest: "rgba(234, 179, 8, 0.35)",
  ladder: "rgba(34, 197, 94, 0.35)",
  door: "rgba(168, 85, 247, 0.35)",
  kill: "rgba(239, 68, 68, 0.35)",
}

export const COLLIDER_BORDER_COLORS: Record<ColliderType, string> = {
  ground: "rgba(59, 130, 246, 0.8)",
  chest: "rgba(234, 179, 8, 0.8)",
  ladder: "rgba(34, 197, 94, 0.8)",
  door: "rgba(168, 85, 247, 0.8)",
  kill: "rgba(239, 68, 68, 0.8)",
}
