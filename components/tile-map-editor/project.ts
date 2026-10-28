import type { CanvasSize, ColliderTypeDefinition, Crop, ElementResource, FileInstance, GridConfig, ImageResource, ObjectAlignment, PlacedTile, ProjectDocument, ProjectFile, ProjectInstance, ResourceReference, Tilemap, Tileset } from "./types"
import { DEFAULT_COLLIDER_TYPES, GRID_SIZE } from "./types"

export const DEFAULT_TILEMAP_ID = "tilemap:default"
export const DEFAULT_OBJECT_ALIGNMENT: ObjectAlignment = { enabled: true, cellWidth: GRID_SIZE, cellHeight: GRID_SIZE, origin: { x: 0, y: 0 } }
export const DEFAULT_CANVAS_SIZE: CanvasSize = { width: 1024, height: 768 }
export const MAX_CANVAS_SIZE = 16384

export function newId(prefix: string) {
  return `${prefix}:${crypto.randomUUID()}`
}

export function emptyProject(): ProjectDocument {
  return {
    format: "tilemap-editor", version: 2, images: [], tilesets: [], elementDefinitions: [],
    tilemaps: [{ id: DEFAULT_TILEMAP_ID, name: "TileMap", visible: true, layer: 0, cellWidth: GRID_SIZE, cellHeight: GRID_SIZE, origin: { x: 0, y: 0 }, tiles: [] }],
    elements: [], colliders: [], colliderTypes: [], markers: [], scene: { backgroundColor: "#1a1a2e", canvasSize: { ...DEFAULT_CANVAS_SIZE }, objectAlignment: DEFAULT_OBJECT_ALIGNMENT, annotationAlignment: { ...DEFAULT_OBJECT_ALIGNMENT, origin: { ...DEFAULT_OBJECT_ALIGNMENT.origin } } },
  }
}

function positiveInteger(n: unknown): n is number {
  return typeof n === "number" && Number.isSafeInteger(n) && n > 0
}

export function validateCanvasSize(size: CanvasSize) {
  if (!positiveInteger(size.width) || !positiveInteger(size.height) ||
      size.width > MAX_CANVAS_SIZE || size.height > MAX_CANVAS_SIZE) {
    throw new Error(`A largura e a altura do canvas devem ser inteiros entre 1 e ${MAX_CANVAS_SIZE} pixels.`)
  }
}

export function updateCanvasSize(project: ProjectDocument, size: CanvasSize): ProjectDocument {
  validateCanvasSize(size)
  return { ...project, scene: { ...project.scene, canvasSize: { ...size } } }
}

function nonnegativeInteger(n: unknown): n is number {
  return typeof n === "number" && Number.isSafeInteger(n) && n >= 0
}

export function validateCrop(crop: Crop, image: Pick<ImageResource, "width" | "height">) {
  if (!nonnegativeInteger(crop.x) || !nonnegativeInteger(crop.y) ||
      !positiveInteger(crop.width) || !positiveInteger(crop.height) ||
      crop.x + crop.width > image.width || crop.y + crop.height > image.height) {
    throw new Error(`Recorte "${crop.name}" fora dos limites da imagem ou com dimensões inválidas.`)
  }
}

export function gridCrops(image: Pick<ImageResource, "width" | "height">, grid: GridConfig): Crop[] {
  if (!positiveInteger(grid.width) || !positiveInteger(grid.height) ||
      !nonnegativeInteger(grid.margin) || !nonnegativeInteger(grid.spacing)) {
    throw new Error("Use dimensões inteiras positivas e margem/espaçamento inteiros não negativos.")
  }
  const columns = Math.floor((image.width - 2 * grid.margin + grid.spacing) / (grid.width + grid.spacing))
  const rows = Math.floor((image.height - 2 * grid.margin + grid.spacing) / (grid.height + grid.spacing))
  if (columns < 1 || rows < 1) throw new Error("Nenhuma célula completa cabe nessa imagem.")
  if (columns * rows > 10000) throw new Error("O tileset pode ter até 10.000 recortes. Aumente o tamanho das células.")
  const crops: Crop[] = []
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {
      crops.push({ id: `${col},${row}`, name: `${col},${row}`, x: grid.margin + col * (grid.width + grid.spacing), y: grid.margin + row * (grid.height + grid.spacing), width: grid.width, height: grid.height })
    }
  }
  return crops
}

export function atlasCrops(data: unknown, image: Pick<ImageResource, "width" | "height">): Crop[] {
  const json = record(data, "Atlas")
  const frames = record(json.frames, "frames do atlas (formato de objeto)")
  const crops = Object.entries(frames).map(([name, value]) => {
    const entry = record(value, name)
    if ((entry.rotated !== undefined && entry.rotated !== false) || (entry.trimmed !== undefined && entry.trimmed !== false)) {
      throw new Error(`Frame "${name}": recortes rotacionados ou aparados (trimmed) ainda não são suportados.`)
    }
    const frame = record(entry.frame, `frame ${name}`)
    const crop: Crop = { id: name, name: name.replace(/\.png$/, ""), x: frame.x as number, y: frame.y as number, width: frame.w as number, height: frame.h as number }
    validateCrop(crop, image)
    return crop
  })
  if (!crops.length || crops.length > 10000) throw new Error("O atlas deve ter entre 1 e 10.000 recortes.")
  return crops
}

export function referenceKey(resource: ResourceReference): string {
  if (resource.kind === "tile") return `tile:${JSON.stringify([resource.tilesetId, resource.index])}`
  return `element:${JSON.stringify(resource.definitionId)}`
}

export interface CatalogEntry {
  key: string
  name: string
  tileId: string
  category: string
  imageId: string
  crop: Crop
  resource: ResourceReference
}

export function createCatalog(project: ProjectDocument) {
  const catalog = new Map<string, CatalogEntry>()
  for (const tileset of project.tilesets) {
    for (const [index, crop] of tileset.crops.entries()) {
      const resource: ResourceReference = { kind: "tile", tilesetId: tileset.id, index }
      const key = referenceKey(resource)
      catalog.set(key, { key, name: crop.name, tileId: key, category: tileset.name, imageId: tileset.imageId, crop, resource })
    }
  }
  for (const definition of project.elementDefinitions) {
    const resource: ResourceReference = { kind: "element", definitionId: definition.id }
    const key = referenceKey(resource)
    catalog.set(key, { key, name: definition.name, tileId: key, category: definition.category, imageId: definition.imageId, crop: definition.crop, resource })
  }
  return catalog
}

export function resolveInstance(tile: PlacedTile, catalog: Map<string, CatalogEntry>) {
  return tile.resource ? catalog.get(referenceKey(tile.resource)) : undefined
}

// Flatten only for the current editing tools; the history stores the full document.
export function editorContent(project: ProjectDocument) {
  return { tiles: [...project.tilemaps.flatMap((map) => map.tiles), ...project.elements].sort((a, b) => a.order - b.order), colliders: project.colliders, markers: project.markers }
}

export type GridChangePolicy = "keep-world" | "keep-cells"
export type TilemapGrid = Pick<Tilemap, "cellWidth" | "cellHeight" | "origin">

export function snapToTilemap(x: number, y: number, grid: TilemapGrid) {
  return {
    x: grid.origin.x + Math.floor((x - grid.origin.x) / grid.cellWidth) * grid.cellWidth,
    y: grid.origin.y + Math.floor((y - grid.origin.y) / grid.cellHeight) * grid.cellHeight,
  }
}

export function validateTilemapGrid(grid: TilemapGrid) {
  if (!positiveInteger(grid.cellWidth) || !positiveInteger(grid.cellHeight) ||
      !grid.origin || !Number.isSafeInteger(grid.origin.x) || !Number.isSafeInteger(grid.origin.y)) {
    throw new Error("A célula precisa ter dimensões inteiras positivas e a origem deve usar coordenadas inteiras.")
  }
}

export function validateObjectAlignment(alignment: ObjectAlignment) {
  if (typeof alignment.enabled !== "boolean") throw new Error("Alinhamento de objetos inválido.")
  validateTilemapGrid(alignment)
}

export function updateObjectAlignment(project: ProjectDocument, alignment: ObjectAlignment): ProjectDocument {
  validateObjectAlignment(alignment)
  return { ...project, scene: { ...project.scene, objectAlignment: alignment } }
}

export function updateAnnotationAlignment(project: ProjectDocument, alignment: ObjectAlignment): ProjectDocument {
  validateObjectAlignment(alignment)
  return { ...project, scene: { ...project.scene, annotationAlignment: alignment } }
}

export function createTilemap(project: ProjectDocument, name: string, id = newId("tilemap")): ProjectDocument {
  const normalizedName = name.trim()
  if (!normalizedName || project.tilemaps.some((map) => map.id === id)) throw new Error("Nome ou ID de tilemap inválido.")
  const map: Tilemap = { id, name: normalizedName, visible: true, layer: 0, cellWidth: GRID_SIZE, cellHeight: GRID_SIZE, origin: { x: 0, y: 0 }, tiles: [] }
  return { ...project, tilemaps: [...project.tilemaps, map] }
}

export function deleteTilemap(project: ProjectDocument, id: string): ProjectDocument {
  if (!project.tilemaps.some((map) => map.id === id)) throw new Error("Tilemap não encontrado.")
  if (project.tilemaps.length === 1) throw new Error("O projeto precisa de pelo menos um tilemap.")
  return { ...project, tilemaps: project.tilemaps.filter((map) => map.id !== id) }
}

export function colliderTypeDefinitions(project: ProjectDocument): ColliderTypeDefinition[] {
  return [...DEFAULT_COLLIDER_TYPES, ...(project.colliderTypes ?? [])]
}

function validateCustomColliderTypes(definitions: unknown): asserts definitions is ColliderTypeDefinition[] {
  if (!Array.isArray(definitions) || definitions.length > 100) throw new Error("Lista de tipos de collider inválida.")
  const ids = new Set(DEFAULT_COLLIDER_TYPES.map((type) => type.id))
  const labels = new Set(DEFAULT_COLLIDER_TYPES.map((type) => type.label.toLocaleLowerCase()))
  for (const value of definitions) {
    const type = record(value, "Tipo de collider")
    if (typeof type.id !== "string" || !type.id.startsWith("collider-type:") || ids.has(type.id) ||
        typeof type.label !== "string" || !type.label.trim() || type.label !== type.label.trim() || type.label.length > 40 ||
        labels.has(type.label.toLocaleLowerCase()) || typeof type.color !== "string" || !/^#[0-9a-f]{6}$/i.test(type.color)) {
      throw new Error("Tipo de collider inválido ou duplicado.")
    }
    ids.add(type.id)
    labels.add(type.label.toLocaleLowerCase())
  }
}

export function addColliderType(project: ProjectDocument, label: string, color: string, id = newId("collider-type")): ProjectDocument {
  const definition = { id, label: label.trim(), color }
  const types = [...(project.colliderTypes ?? []), definition]
  validateCustomColliderTypes(types)
  return { ...project, colliderTypes: types }
}

export function renameTilemap(project: ProjectDocument, id: string, name: string): ProjectDocument {
  const normalizedName = name.trim()
  if (!normalizedName) throw new Error("O tilemap precisa de um nome.")
  const current = project.tilemaps.find((map) => map.id === id)
  if (!current) throw new Error("Tilemap não encontrado.")
  if (current.name === normalizedName) return project
  return { ...project, tilemaps: project.tilemaps.map((map) => map.id === id ? { ...map, name: normalizedName } : map) }
}

export function setTilemapVisibility(project: ProjectDocument, id: string, visible: boolean): ProjectDocument {
  const current = project.tilemaps.find((map) => map.id === id)
  if (!current) throw new Error("Tilemap não encontrado.")
  if (current.visible === visible) return project
  return { ...project, tilemaps: project.tilemaps.map((map) => map.id === id ? { ...map, visible } : map) }
}

export function setTilemapLayer(project: ProjectDocument, id: string, layer: number): ProjectDocument {
  if (!nonnegativeInteger(layer) || layer >= 5) throw new Error("Camada do tilemap inválida.")
  const current = project.tilemaps.find((map) => map.id === id)
  if (!current) throw new Error("Tilemap não encontrado.")
  if ((current.layer ?? 0) === layer) return project
  return { ...project, tilemaps: project.tilemaps.map((map) => map.id === id ? { ...map, layer } : map) }
}

export function compareDisplayOrder(a: PlacedTile, b: PlacedTile, mapLayers: Map<string, number>) {
  return (a.layer ?? 0) - (b.layer ?? 0) ||
    (mapLayers.get(a.tilemapId ?? "") ?? 0) - (mapLayers.get(b.tilemapId ?? "") ?? 0) ||
    (a.order ?? 0) - (b.order ?? 0)
}

export function previewTilemapGrid(map: Tilemap, next: TilemapGrid) {
  validateTilemapGrid(next)
  const samples = map.tiles.slice(0, 5).map((tile) => ({
    id: tile.id,
    before: { x: tile.x, y: tile.y },
    after: {
      x: next.origin.x + Math.round((tile.x - map.origin.x) / map.cellWidth) * next.cellWidth,
      y: next.origin.y + Math.round((tile.y - map.origin.y) / map.cellHeight) * next.cellHeight,
    },
  }))
  return { count: map.tiles.length, samples, moved: map.tiles.filter((tile) => {
    const x = next.origin.x + Math.round((tile.x - map.origin.x) / map.cellWidth) * next.cellWidth
    const y = next.origin.y + Math.round((tile.y - map.origin.y) / map.cellHeight) * next.cellHeight
    return x !== tile.x || y !== tile.y
  }).length }
}

export function updateTilemapGrid(project: ProjectDocument, id: string, next: TilemapGrid, policy: GridChangePolicy): ProjectDocument {
  validateTilemapGrid(next)
  const current = project.tilemaps.find((map) => map.id === id)
  if (!current) throw new Error("Tilemap não encontrado.")
  if (policy !== "keep-world" && policy !== "keep-cells") throw new Error("Escolha como tratar os tiles existentes.")
  if (current.cellWidth === next.cellWidth && current.cellHeight === next.cellHeight &&
      current.origin.x === next.origin.x && current.origin.y === next.origin.y) return project
  const tiles = policy === "keep-world" ? current.tiles : current.tiles.map((tile) => ({
    ...tile,
    x: next.origin.x + Math.round((tile.x - current.origin.x) / current.cellWidth) * next.cellWidth,
    y: next.origin.y + Math.round((tile.y - current.origin.y) / current.cellHeight) * next.cellHeight,
  }))
  return { ...project, tilemaps: project.tilemaps.map((map) => map.id === id ? { ...map, ...next, tiles } : map) }
}

export function paintTile(project: ProjectDocument, entry: CatalogEntry, x: number, y: number, layer: number, tilemapId = project.tilemaps[0].id): ProjectDocument {
  const content = editorContent(project)
  const map = project.tilemaps.find((item) => item.id === tilemapId)
  if (!map || !map.visible) return project
  const objectAlignment = project.scene.objectAlignment ?? DEFAULT_OBJECT_ALIGNMENT
  const snapped = entry.resource.kind === "element"
    ? objectAlignment.enabled ? snapToTilemap(x, y, objectAlignment) : { x: Math.round(x), y: Math.round(y) }
    : snapToTilemap(x, y, map)
  const { x: snappedX, y: snappedY } = snapped
  const inCell = (tile: ProjectInstance) => tile.x === snappedX && tile.y === snappedY && (tile.layer ?? 0) === layer &&
    (entry.resource.kind === "element" ? tile.resource.kind === "element" : tile.tilemapId === tilemapId)
  if (entry.resource.kind === "tile" && content.tiles.some((tile) => inCell(tile) && tile.locked)) return project
  const existing = entry.resource.kind === "tile" ? content.tiles.filter(inCell) : []
  if (existing.length === 1 && referenceKey(existing[0].resource) === entry.key) return project
  const instance: ProjectInstance = {
    id: newId("instance"), order: content.tiles.reduce((max, tile) => Math.max(max, tile.order), -1) + 1,
    tileId: entry.tileId, resource: entry.resource, x: snappedX, y: snappedY, layer, locked: false,
    ...(entry.resource.kind === "tile" ? { tilemapId } : {}),
  }
  return replaceEditorContent(project, { ...content, tiles: [...content.tiles.filter((tile) => entry.resource.kind === "element" || !inCell(tile)), instance] })
}

export function moveElements(project: ProjectDocument, origins: Pick<ProjectInstance, "id" | "x" | "y">[], dx: number, dy: number): ProjectDocument {
  if (!origins.length || !Number.isFinite(dx) || !Number.isFinite(dy)) return project
  const selected = new Map(origins.map((origin) => [origin.id, origin]))
  if (project.elements.some((element) => selected.has(element.id) && element.locked)) return project
  const alignment = project.scene.objectAlignment ?? DEFAULT_OBJECT_ALIGNMENT
  const anchor = origins[0]
  const snappedStart = alignment.enabled ? snapToTilemap(anchor.x, anchor.y, alignment) : anchor
  const snappedEnd = alignment.enabled ? snapToTilemap(anchor.x + dx, anchor.y + dy, alignment) : { x: anchor.x + Math.round(dx), y: anchor.y + Math.round(dy) }
  const moveX = snappedEnd.x - snappedStart.x
  const moveY = snappedEnd.y - snappedStart.y
  const next = project.elements.map((element) => {
    const origin = selected.get(element.id)
    return origin && (element.x !== origin.x + moveX || element.y !== origin.y + moveY)
      ? { ...element, x: origin.x + moveX, y: origin.y + moveY }
      : element
  })
  return next.some((element, index) => element !== project.elements[index]) ? { ...project, elements: next } : project
}

export function eraseTile(project: ProjectDocument, x: number, y: number, layer: number, tilemapId = project.tilemaps[0].id): ProjectDocument {
  const content = editorContent(project)
  const map = project.tilemaps.find((item) => item.id === tilemapId)
  if (!map || !map.visible) return project
  const snapped = snapToTilemap(x, y, map)
  const activeTile = map.tiles.find((tile) => tile.x === snapped.x && tile.y === snapped.y && (tile.layer ?? 0) === layer && !tile.locked)
  if (activeTile) return replaceEditorContent(project, { ...content, tiles: content.tiles.filter((tile) => tile.id !== activeTile.id) })
  const catalog = createCatalog(project)
  const element = [...project.elements].reverse().find((tile) => {
    if ((tile.layer ?? 0) !== layer || tile.locked) return false
    const crop = resolveInstance(tile, catalog)?.crop
    return x >= tile.x && x < tile.x + (crop?.width ?? GRID_SIZE) && y >= tile.y && y < tile.y + (crop?.height ?? GRID_SIZE)
  })
  const tiles = element ? content.tiles.filter((tile) => tile.id !== element.id) : content.tiles
  return tiles.length === content.tiles.length ? project : replaceEditorContent(project, { ...content, tiles })
}

export interface WorldRect { x: number; y: number; width: number; height: number }

export function eraseArea(project: ProjectDocument, area: WorldRect, layer: number, tilemapId = project.tilemaps[0].id): ProjectDocument {
  const map = project.tilemaps.find((item) => item.id === tilemapId)
  if (!map || !map.visible) return project
  const content = editorContent(project)
  const catalog = createCatalog(project)
  const doomed = new Set<string>()
  for (const tile of content.tiles) {
    if (!tile.id || tile.locked || (tile.layer ?? 0) !== layer) continue
    const isElement = tile.resource.kind === "element"
    if (!isElement && (tile.tilemapId ?? DEFAULT_TILEMAP_ID) !== tilemapId) continue
    const crop = resolveInstance(tile, catalog)?.crop
    const width = crop?.width ?? GRID_SIZE
    const height = crop?.height ?? GRID_SIZE
    if (tile.x < area.x + area.width && tile.x + width > area.x && tile.y < area.y + area.height && tile.y + height > area.y) doomed.add(tile.id)
  }
  if (!doomed.size) return project
  return replaceEditorContent(project, { ...content, tiles: content.tiles.filter((tile) => !tile.id || !doomed.has(tile.id)) })
}

export function addElementDefinition(project: ProjectDocument, definition: ElementResource, image?: ImageResource): ProjectDocument {
  if (!definition.name.trim() || project.elementDefinitions.some((item) => item.id === definition.id)) throw new Error("Definição de elemento inválida ou duplicada.")
  if (image && project.images.some((item) => item.id === image.id)) throw new Error("ID de imagem duplicado.")
  const source = image ?? project.images.find((item) => item.id === definition.imageId)
  if (!source || definition.imageId !== source.id) throw new Error("Imagem do elemento não encontrada.")
  validateCrop(definition.crop, source)
  return { ...project, images: image ? [...project.images, image] : project.images, elementDefinitions: [...project.elementDefinitions, definition] }
}

export function replaceEditorContent(project: ProjectDocument, content: { tiles: PlacedTile[]; colliders: ProjectDocument["colliders"]; markers: ProjectDocument["markers"] }): ProjectDocument {
  const tiles = content.tiles as ProjectInstance[]
  return {
    ...project,
    tilemaps: project.tilemaps.map((map) => ({ ...map, tiles: tiles.filter((tile) => tile.resource.kind !== "element" && (tile.tilemapId ?? DEFAULT_TILEMAP_ID) === map.id) })),
    elements: tiles.filter((tile) => tile.resource.kind === "element"),
    colliders: content.colliders, markers: content.markers,
  }
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} inválido.`)
  return value as Record<string, unknown>
}

function finite(n: unknown): n is number { return typeof n === "number" && Number.isFinite(n) }
function position(value: Record<string, unknown>, label: string) {
  if (!finite(value.x) || !finite(value.y)) throw new Error(`Posição inválida em ${label}.`)
}

const IMAGE_DATA_URL = /^data:image\/(png|jpeg|webp|gif);base64,/

export function validateMarkers(markers: unknown) {
  if (!Array.isArray(markers)) throw new Error("Lista de marcadores inválida.")
  for (const value of markers) {
    const marker = record(value, "Marcador")
    position(marker, "marcador")
    if (typeof marker.name !== "string") throw new Error("Nome de marcador inválido.")
  }
}

// Validates the in-memory document (also used for the local autosave, which keeps image data).
export function validateDocument(data: unknown): ProjectDocument {
  const json = record(data, "Projeto")
  if (json.format !== "tilemap-editor" || json.version !== 2) throw new Error("Formato ou versão de projeto não suportado.")
  for (const key of ["images", "tilesets", "elementDefinitions", "tilemaps", "elements", "colliders", "markers"]) {
    if (!Array.isArray(json[key])) throw new Error(`Lista inválida: ${key}.`)
  }
  const project = json as unknown as ProjectDocument
  if (project.colliderTypes !== undefined) validateCustomColliderTypes(project.colliderTypes)
  const scene = record(project.scene, "Cenário")
  if (typeof scene.backgroundColor !== "string" || !/^#[0-9a-f]{6}$/i.test(scene.backgroundColor)) throw new Error("Cor de fundo inválida.")
  if (scene.canvasSize !== undefined) validateCanvasSize(record(scene.canvasSize, "Tamanho do canvas") as unknown as CanvasSize)
  if (scene.objectAlignment !== undefined) validateObjectAlignment(record(scene.objectAlignment, "Alinhamento de objetos") as unknown as ObjectAlignment)
  if (scene.annotationAlignment !== undefined) validateObjectAlignment(record(scene.annotationAlignment, "Alinhamento de marcadores") as unknown as ObjectAlignment)
  function uniqueIds(items: unknown[], label: string) {
    const ids = new Set<string>()
    for (const item of items) {
      const entry = record(item, label)
      if (typeof entry.id !== "string" || !entry.id || ids.has(entry.id)) throw new Error(`ID ausente ou duplicado em ${label}.`)
      ids.add(entry.id)
    }
    return ids
  }
  const imageIds = uniqueIds(project.images, "imagens")
  const tilesetIds = uniqueIds(project.tilesets, "tilesets")
  const definitionIds = uniqueIds(project.elementDefinitions, "elementos")
  const mapIds = uniqueIds(project.tilemaps, "tilemaps")
  if (!mapIds.size) throw new Error("O projeto precisa de um tilemap.")
  for (const image of project.images) {
    if (typeof image.name !== "string" || !positiveInteger(image.width) || !positiveInteger(image.height) ||
        (image.src !== undefined && (typeof image.src !== "string" || !IMAGE_DATA_URL.test(image.src)))) throw new Error("Imagem inválida: use imagens PNG, JPEG, WebP ou GIF.")
  }
  const imageFor = (imageId: string) => {
    if (!imageIds.has(imageId)) throw new Error("Referência de imagem ausente.")
    return project.images.find((image) => image.id === imageId)!
  }
  const tilesetSizes = new Map<string, number>()
  for (const set of project.tilesets) {
    if (typeof set.name !== "string" || !["grid", "atlas"].includes(set.mode) || !Array.isArray(set.crops) || !positiveInteger(set.cropCount) || set.cropCount > 10000) throw new Error("Tileset inválido.")
    const image = imageFor(set.imageId)
    uniqueIds(set.crops, "recortes")
    for (const crop of set.crops) { if (typeof crop.name !== "string") throw new Error("Nome do recorte inválido."); validateCrop(crop, image) }
    if (set.mode === "grid") {
      if (!set.grid) throw new Error("Configuração de grade ausente.")
      if (gridCrops(image, set.grid).length !== set.cropCount) throw new Error(`A grade do tileset "${set.name}" não corresponde ao número de recortes salvo.`)
    }
    // An atlas tileset has no crops until its atlas is attached.
    if (set.crops.length && set.crops.length !== set.cropCount) throw new Error("Número de recortes inconsistente.")
    tilesetSizes.set(set.id, set.cropCount)
  }
  for (const definition of project.elementDefinitions) {
    if (typeof definition.name !== "string" || !["Objetos", "Inimigos", "Player", "Decoração"].includes(definition.category)) throw new Error("Definição de elemento inválida.")
    validateCrop(record(definition.crop, "Recorte de elemento") as unknown as Crop, imageFor(definition.imageId))
  }
  for (const map of project.tilemaps) {
    if (typeof map.name !== "string" || typeof map.visible !== "boolean" || !Array.isArray(map.tiles) ||
        (map.layer !== undefined && (!nonnegativeInteger(map.layer) || map.layer >= 5))) throw new Error("Tilemap inválido.")
    validateTilemapGrid(map)
  }
  const instances = editorContent(project).tiles
  uniqueIds(instances, "instâncias")
  for (const tile of instances) {
    position(record(tile, "Instância"), "instância")
    if (typeof tile.tileId !== "string" || !nonnegativeInteger(tile.order) || (tile.locked !== undefined && typeof tile.locked !== "boolean") ||
        (tile.layer !== undefined && (!nonnegativeInteger(tile.layer) || tile.layer > 4)) ||
        (tile.creationCode !== undefined && tile.creationCode !== null && typeof tile.creationCode !== "string")) throw new Error("Propriedades de instância inválidas.")
    const resource = record(tile.resource, "Referência de recurso")
    if (resource.kind === "tile") {
      const size = tilesetSizes.get(resource.tilesetId as string)
      if (size === undefined || !nonnegativeInteger(resource.index) || resource.index >= size) throw new Error("Referência de recurso ausente.")
    } else if (resource.kind !== "element" || !definitionIds.has(resource.definitionId as string)) throw new Error("Referência de recurso ausente.")
  }
  for (const map of project.tilemaps) {
    if (map.tiles.some((tile) => tile.resource.kind === "element" || tile.tilemapId !== map.id)) throw new Error("Instância associada ao tilemap errado.")
  }
  if (project.elements.some((tile) => tile.resource.kind !== "element")) throw new Error("Referência de elemento inválida.")
  const validColliderTypes = new Set(colliderTypeDefinitions(project).map((type) => type.id))
  for (const value of project.colliders) {
    const collider = record(value, "Collider")
    position(collider, "collider")
    if (!finite(collider.width) || collider.width <= 0 || !finite(collider.height) || collider.height <= 0 ||
        typeof collider.type !== "string" || !validColliderTypes.has(collider.type)) throw new Error("Collider inválido ou tipo não definido.")
  }
  validateMarkers(project.markers)
  return project
}

function fileInstance(tile: ProjectInstance): FileInstance {
  return {
    ...(tile.resource.kind === "tile" ? { tileset: tile.resource.tilesetId, index: tile.resource.index } : { element: tile.resource.definitionId }),
    x: tile.x, y: tile.y, order: tile.order,
    ...(tile.layer ? { layer: tile.layer } : {}),
    ...(tile.locked ? { locked: true } : {}),
    ...(tile.creationCode != null ? { creationCode: tile.creationCode } : {}),
  }
}

// The saved file carries no image data and no crops: only tileset indexes and positions.
export function serializeProject(project: ProjectDocument): ProjectFile {
  return {
    format: "tilemap-editor", version: 2,
    scene: project.scene,
    ...(project.colliderTypes?.length ? { colliderTypes: project.colliderTypes } : {}),
    colliders: project.colliders, markers: project.markers,
    images: project.images.map(({ id, name, width, height }) => ({ id, name, width, height })),
    tilesets: project.tilesets.map(({ id, name, imageId, mode, grid, cropCount }) => ({ id, name, imageId, mode, ...(grid ? { grid } : {}), cropCount })),
    elementDefinitions: project.elementDefinitions,
    tilemaps: project.tilemaps.map((map) => ({ ...map, tiles: map.tiles.map(fileInstance) })),
    elements: project.elements.map(fileInstance),
  }
}

// Treat files as untrusted documents: check the schema and every reference before replacing a map.
export function parseProject(data: unknown): ProjectDocument {
  const json = record(data, "Projeto")
  if (json.format !== "tilemap-editor") throw new Error("Arquivo não reconhecido: não é um projeto do editor.")
  if (json.version !== 2) throw new Error("Versão de projeto não suportada. Só o formato atual (versão 2) pode ser aberto.")
  for (const key of ["images", "tilesets", "elementDefinitions", "tilemaps", "elements"]) {
    if (!Array.isArray(json[key])) throw new Error(`Lista inválida: ${key}.`)
  }
  const file = json as unknown as ProjectFile
  const images: ImageResource[] = file.images.map((image) => {
    const entry = record(image, "Imagem")
    if ("src" in entry) throw new Error("O arquivo de projeto não deve conter dados de imagem.")
    return { id: entry.id as string, name: entry.name as string, width: entry.width as number, height: entry.height as number }
  })
  const tilesets: Tileset[] = file.tilesets.map((set) => {
    const entry = record(set, "Tileset")
    const image = images.find((item) => item.id === entry.imageId)
    if (!image || (entry.mode !== "grid" && entry.mode !== "atlas")) throw new Error("Tileset inválido.")
    const grid = entry.grid as GridConfig | undefined
    return { id: entry.id as string, name: entry.name as string, imageId: image.id, mode: entry.mode, ...(grid ? { grid } : {}), cropCount: entry.cropCount as number, crops: entry.mode === "grid" && grid ? gridCrops(image, grid) : [] }
  })
  const inflate = (value: FileInstance, tilemapId?: string): ProjectInstance => {
    const entry = record(value, "Instância")
    position(entry, "instância")
    const resource: ResourceReference = typeof entry.element === "string"
      ? { kind: "element", definitionId: entry.element }
      : { kind: "tile", tilesetId: entry.tileset as string, index: entry.index as number }
    return {
      id: newId("instance"), order: entry.order as number, tileId: referenceKey(resource), resource,
      x: entry.x as number, y: entry.y as number, layer: (entry.layer as number | undefined) ?? 0, locked: entry.locked === true,
      ...(typeof entry.creationCode === "string" ? { creationCode: entry.creationCode } : {}),
      ...(tilemapId !== undefined ? { tilemapId } : {}),
    }
  }
  const { colliders, colliderTypes } = defineMissingColliderTypes(json.colliders, json.colliderTypes ?? [])
  const document = {
    format: "tilemap-editor", version: 2, images, tilesets,
    elementDefinitions: file.elementDefinitions,
    tilemaps: file.tilemaps.map((map) => {
      const entry = record(map, "Tilemap")
      if (!Array.isArray(entry.tiles)) throw new Error("Tilemap inválido.")
      return { ...(entry as unknown as Tilemap), tiles: (entry.tiles as FileInstance[]).map((tile) => inflate(tile, entry.id as string)) }
    }),
    elements: file.elements.map((element) => inflate(element)),
    colliders, colliderTypes, markers: json.markers, scene: json.scene,
  } as unknown as ProjectDocument
  return validateDocument(document)
}

const MISSING_TYPE_COLORS = ["#f97316", "#06b6d4", "#ec4899", "#84cc16", "#8b5cf6", "#14b8a6"]

// A collider may name a type the file does not define: create it instead of rejecting the map.
function defineMissingColliderTypes(colliders: unknown, declared: unknown): { colliders: unknown; colliderTypes: unknown } {
  if (!Array.isArray(colliders) || !Array.isArray(declared)) return { colliders, colliderTypes: declared }
  const known = new Set<string>([...DEFAULT_COLLIDER_TYPES.map((type) => type.id), ...declared.map((type) => (type as ColliderTypeDefinition | null)?.id)].filter((id): id is string => typeof id === "string"))
  const labels = new Set<string>([...DEFAULT_COLLIDER_TYPES, ...declared as ColliderTypeDefinition[]].map((type) => String(type?.label).toLocaleLowerCase()))
  const created = new Map<string, string>()
  const types = [...declared]
  const remapped = colliders.map((value) => {
    const collider = value as Record<string, unknown> | null
    const type = collider?.type
    if (typeof type !== "string" || known.has(type)) return value
    const label = type.trim().slice(0, 40)
    const byDefault = DEFAULT_COLLIDER_TYPES.find((item) => item.id === label.toLocaleLowerCase())
    let id = byDefault?.id ?? created.get(type)
    if (!id) {
      let unique = label || "collider"
      for (let n = 2; labels.has(unique.toLocaleLowerCase()); n++) unique = `${label.slice(0, 36) || "collider"} ${n}`
      id = newId("collider-type")
      created.set(type, id)
      labels.add(unique.toLocaleLowerCase())
      types.push({ id, label: unique, color: MISSING_TYPE_COLORS[(types.length) % MISSING_TYPE_COLORS.length] })
    }
    return { ...collider, type: id }
  })
  return { colliders: remapped, colliderTypes: types }
}

// Images the user still has to attach after opening a project file.
export function pendingImages(project: ProjectDocument) {
  return project.images.filter((image) => !image.src).map((image) => ({
    image,
    tilesets: project.tilesets.filter((set) => set.imageId === image.id),
    elements: project.elementDefinitions.filter((definition) => definition.imageId === image.id),
  }))
}

// Attaches an image (and the atlas of the tilesets that use it) to a project that was opened without them.
export function attachImage(project: ProjectDocument, imageId: string, source: { src: string; width: number; height: number }, atlas?: unknown): ProjectDocument {
  const image = project.images.find((item) => item.id === imageId)
  if (!image) throw new Error("Imagem não encontrada no projeto.")
  if (!IMAGE_DATA_URL.test(source.src)) throw new Error("Formato de imagem não suportado.")
  if (source.width !== image.width || source.height !== image.height) throw new Error(`A imagem tem ${source.width} × ${source.height} px, mas o projeto espera ${image.width} × ${image.height} px.`)
  const tilesets = project.tilesets.map((set) => {
    if (set.imageId !== imageId || set.mode !== "atlas") return set
    if (atlas === undefined) throw new Error(`Anexe também o atlas JSON do tileset "${set.name}".`)
    const crops = atlasCrops(atlas, image)
    if (crops.length !== set.cropCount) throw new Error(`O atlas tem ${crops.length} recortes, mas o tileset "${set.name}" foi salvo com ${set.cropCount}.`)
    return { ...set, crops }
  })
  return { ...project, images: project.images.map((item) => item === image ? { ...item, src: source.src } : item), tilesets }
}

export function addTileset(project: ProjectDocument, image: ImageResource, tileset: Tileset): ProjectDocument {
  if (project.images.some((item) => item.id === image.id) || project.tilesets.some((item) => item.id === tileset.id) || tileset.imageId !== image.id || tileset.cropCount !== tileset.crops.length) throw new Error("Identidade de recurso duplicada ou inválida.")
  for (const crop of tileset.crops) validateCrop(crop, image)
  return { ...project, images: [...project.images, image], tilesets: [...project.tilesets, tileset] }
}
