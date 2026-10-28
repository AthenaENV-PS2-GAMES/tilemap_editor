export type Tool = "place" | "erase" | "select" | "collider" | "marker" | "drag"

export type ColliderType = string

export interface ColliderTypeDefinition {
  id: string
  label: string
  color: string
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
  | { kind: "tile"; tilesetId: string; index: number }
  | { kind: "element"; definitionId: string }

export interface ImageResource {
  id: string
  name: string
  // Absent while the file is waiting for the user to attach the image.
  src?: string
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
  // Atlas crops stay empty until the atlas is attached; cropCount is what the saved indexes refer to.
  crops: Crop[]
  cropCount: number
}

export interface ElementResource {
  id: string
  name: string
  category: "Objetos" | "Inimigos" | "Player" | "Decoração"
  imageId: string
  crop: Crop
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
  version: 2
  images: ImageResource[]
  tilesets: Tileset[]
  elementDefinitions: ElementResource[]
  tilemaps: Tilemap[]
  elements: ProjectInstance[]
  colliders: Collider[]
  colliderTypes?: ColliderTypeDefinition[]
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

export interface Camera {
  x: number
  y: number
  zoom: number
}

export const GRID_SIZE = 16
export const LAYER_COUNT = 5

export const MIN_ZOOM = 0.25
export const MAX_ZOOM = 4

export const DEFAULT_COLLIDER_TYPES: ColliderTypeDefinition[] = [
  { id: "ground", label: "ground", color: "#3b82f6" },
  { id: "chest", label: "chest", color: "#eab308" },
  { id: "ladder", label: "ladder", color: "#22c55e" },
  { id: "door", label: "door", color: "#a855f7" },
  { id: "kill", label: "kill", color: "#ef4444" },
]

export function colliderColor(color: string, opacity: number): string {
  const rgb = [1, 3, 5].map((index) => parseInt(color.slice(index, index + 2), 16))
  return `rgba(${rgb.join(", ")}, ${opacity})`
}

// On-disk shape (version 2): no image data, no crops. Tiles are tileset index + position.
export interface FileInstance {
  tileset?: string
  index?: number
  element?: string
  x: number
  y: number
  order: number
  layer?: number
  locked?: boolean
  creationCode?: string | null
}

export interface ProjectFile {
  format: "tilemap-editor"
  version: 2
  scene: ProjectDocument["scene"]
  colliderTypes?: ColliderTypeDefinition[]
  colliders: Collider[]
  markers: Marker[]
  images: Pick<ImageResource, "id" | "name" | "width" | "height">[]
  tilesets: (Pick<Tileset, "id" | "name" | "imageId" | "mode" | "grid" | "cropCount">)[]
  elementDefinitions: ElementResource[]
  tilemaps: (Omit<Tilemap, "tiles"> & { tiles: FileInstance[] })[]
  elements: FileInstance[]
}
