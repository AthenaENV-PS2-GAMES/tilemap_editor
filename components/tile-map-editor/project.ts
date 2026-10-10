import type { CanvasSize, Crop, ElementResource, GridConfig, ImageResource, ObjectAlignment, PlacedTile, ProjectDocument, ProjectInstance, ResourceReference, TextureAtlas, Tilemap, Tileset } from "./types"
import { GRID_SIZE, defaultLayerFor, normalizeLayer, normalizeTileId } from "./types"
import { OBJECTS, ENEMIES, PLAYER_SPAWN } from "./default-elements"
import { createAssetResolver } from "./asset-resolver"

export const DEFAULT_TILEMAP_ID = "tilemap:default"
export const DEFAULT_TILESET_ID = "tileset:default"
export const DEFAULT_OBJECT_ALIGNMENT: ObjectAlignment = { enabled: true, cellWidth: GRID_SIZE, cellHeight: GRID_SIZE, origin: { x: 0, y: 0 } }
export const DEFAULT_CANVAS_SIZE: CanvasSize = { width: 1024, height: 768 }
export const MAX_CANVAS_SIZE = 16384

export function newId(prefix: string) {
  return `${prefix}:${crypto.randomUUID()}`
}

export function emptyProject(): ProjectDocument {
  return {
    format: "tilemap-editor", version: 1, images: [], tilesets: [], elementDefinitions: [],
    tilemaps: [{ id: DEFAULT_TILEMAP_ID, name: "TileMap", visible: true, layer: 0, cellWidth: GRID_SIZE, cellHeight: GRID_SIZE, origin: { x: 0, y: 0 }, tiles: [] }],
    elements: [], colliders: [], markers: [], scene: { backgroundColor: "#1a1a2e", canvasSize: { ...DEFAULT_CANVAS_SIZE }, objectAlignment: DEFAULT_OBJECT_ALIGNMENT, annotationAlignment: { ...DEFAULT_OBJECT_ALIGNMENT, origin: { ...DEFAULT_OBJECT_ALIGNMENT.origin } } },
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

export function defaultProject(atlas: TextureAtlas, width: number, height: number): ProjectDocument {
  const project = emptyProject()
  project.images.push({ id: "image:default", name: "texture.png", src: "/atlas/texture.png", width, height })
  project.tilesets.push({ id: DEFAULT_TILESET_ID, name: "Atlas padrão", imageId: "image:default", mode: "atlas", crops: atlasCrops(atlas, { width, height }), legacy: true })
  for (const [category, entities] of [["Objetos", OBJECTS], ["Inimigos", ENEMIES], ["Player", PLAYER_SPAWN]] as const) {
    for (const entity of entities) {
      const id = normalizeTileId(entity.id)
      const imageId = `image:element:${id}`
      project.images.push({ id: imageId, name: entity.name, src: entity.imageSrc, width: entity.width, height: entity.height })
      project.elementDefinitions.push({ id: `element:${id}`, name: entity.name, category, legacyId: id, imageId, crop: { id: "first", name: entity.name, x: 0, y: 0, width: entity.frameWidth ?? entity.width, height: entity.height } })
    }
  }
  return project
}

export function referenceKey(resource: ResourceReference): string {
  if (resource.kind === "tile") return `tile:${JSON.stringify([resource.tilesetId, resource.cropId])}`
  if (resource.kind === "element") return `element:${JSON.stringify(resource.definitionId)}`
  return `missing:${JSON.stringify(resource.legacyId)}`
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
    for (const crop of tileset.crops) {
      const resource: ResourceReference = { kind: "tile", tilesetId: tileset.id, cropId: crop.id }
      const key = referenceKey(resource)
      catalog.set(key, { key, name: crop.name, tileId: tileset.legacy ? crop.name : key, category: tileset.name, imageId: tileset.imageId, crop, resource })
    }
  }
  for (const definition of project.elementDefinitions) {
    const resource: ResourceReference = { kind: "element", definitionId: definition.id }
    const key = referenceKey(resource)
    catalog.set(key, { key, name: definition.name, tileId: definition.legacyId ?? key, category: definition.category, imageId: definition.imageId, crop: definition.crop, resource })
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

export function importLegacy(data: unknown, defaults: ProjectDocument): ProjectDocument {
  const json = record(data, "Mapa")
  if (!json.tiles || typeof json.tiles !== "object" || Array.isArray(json.tiles)) throw new Error("O mapa antigo deve conter um objeto tiles.")
  const project: ProjectDocument = { ...defaults, tilemaps: defaults.tilemaps.map((map) => ({ ...map, tiles: [] })), elements: [], colliders: [], markers: [], scene: { ...defaults.scene, backgroundColor: typeof json.backgroundColor === "string" && /^#[0-9a-f]{6}$/i.test(json.backgroundColor.trim()) ? json.backgroundColor.trim() : "#1a1a2e" } }
  const catalog = createCatalog(defaults)
  const entries = [...catalog.values()]
  const resolveElement = createAssetResolver(Object.fromEntries(entries.filter((e) => e.resource.kind === "element").map((e) => [e.tileId, e])))
  const resolveTile = createAssetResolver(Object.fromEntries(entries.filter((e) => e.resource.kind === "tile").map((e) => [e.tileId, e])))
  let index = 0
  for (const [tileId, values] of Object.entries(json.tiles)) {
    if (!Array.isArray(values)) throw new Error(`Lista de tiles inválida: ${tileId}.`)
    const resource = (resolveElement(tileId) ?? resolveTile(tileId))?.resource ?? { kind: "missing" as const, legacyId: tileId }
    for (const value of values) {
      const t = record(value, tileId)
      position(t, tileId)
      if (t.creationCode !== undefined && t.creationCode !== null && typeof t.creationCode !== "string") throw new Error(`creationCode inválido: ${tileId}.`)
      const tile: ProjectInstance = { id: `instance:legacy:${index}`, order: index++, tileId, resource, x: t.x as number, y: t.y as number, locked: t.locked === true, layer: t.layer === undefined ? defaultLayerFor(tileId) : normalizeLayer(t.layer), creationCode: t.creationCode as string | null ?? null }
      if (resource.kind === "element") project.elements.push(tile)
      else project.tilemaps[0].tiles.push({ ...tile, tilemapId: project.tilemaps[0].id })
    }
  }
  if (json.colliders !== undefined) {
    if (!Array.isArray(json.colliders)) throw new Error("Lista de colliders inválida.")
    project.colliders = json.colliders.map((value) => {
      const c = record(value, "Collider"); position(c, "collider")
      if (!finite(c.width) || c.width <= 0 || !finite(c.height) || c.height <= 0) throw new Error("Dimensões inválidas no collider.")
      const type = c.type ?? "ground"
      if (!["ground", "chest", "ladder", "door", "kill"].includes(type as string)) throw new Error("Tipo de collider não suportado.")
      return { x: c.x as number, y: c.y as number, width: c.width, height: c.height, type: type as ProjectDocument["colliders"][number]["type"] }
    })
  }
  if (json.markers !== undefined) {
    if (!Array.isArray(json.markers)) throw new Error("Lista de marcadores inválida.")
    project.markers = json.markers.map((value, i) => {
      const m = record(value, "Marcador"); position(m, "marcador")
      return { name: typeof m.name === "string" ? m.name : `marker${i + 1}`, x: m.x as number, y: m.y as number }
    })
  }
  return project
}

export function legacyExportIssues(project: ProjectDocument): string[] {
  const issues: string[] = []
  if (project.tilemaps.length !== 1) issues.push("O formato antigo suporta apenas um tilemap.")
  if (project.tilemaps.some((map) => map.cellWidth !== GRID_SIZE || map.cellHeight !== GRID_SIZE || map.origin.x !== 0 || map.origin.y !== 0 || !map.visible || (map.layer ?? 0) !== 0)) issues.push("O formato antigo não preserva grades, camadas ou visibilidade de tilemaps.")
  const alignment = project.scene.objectAlignment ?? DEFAULT_OBJECT_ALIGNMENT
  if (!alignment.enabled || alignment.cellWidth !== GRID_SIZE || alignment.cellHeight !== GRID_SIZE || alignment.origin.x !== 0 || alignment.origin.y !== 0) issues.push("O formato antigo não preserva o alinhamento de objetos.")
  const annotations = project.scene.annotationAlignment ?? DEFAULT_OBJECT_ALIGNMENT
  if (!annotations.enabled || annotations.cellWidth !== GRID_SIZE || annotations.cellHeight !== GRID_SIZE || annotations.origin.x !== 0 || annotations.origin.y !== 0) issues.push("O formato antigo não preserva o alinhamento de marcadores e colliders.")
  const legacySets = new Set(project.tilesets.filter((set) => set.legacy).map((set) => set.id))
  const legacyElements = new Set(project.elementDefinitions.filter((def) => def.legacyId).map((def) => def.id))
  if (editorContent(project).tiles.some((tile) => tile.resource.kind === "tile" ? !legacySets.has(tile.resource.tilesetId) : tile.resource.kind === "element" && !legacyElements.has(tile.resource.definitionId))) issues.push("Há recursos personalizados que o formato antigo não consegue representar. Use Salvar projeto.")
  return issues
}

export function exportLegacy(project: ProjectDocument) {
  const issues = legacyExportIssues(project)
  if (issues.length) throw new Error(issues.join("\n"))
  const tiles: Record<string, unknown[]> = Object.create(null)
  for (const tile of editorContent(project).tiles) {
    const id = normalizeTileId(tile.tileId)
    ;(tiles[id] ??= []).push({ x: tile.x, y: tile.y, locked: tile.locked ?? false, layer: tile.layer ?? 0, ...(tile.creationCode !== undefined ? { creationCode: tile.creationCode } : {}) })
  }
  return { backgroundColor: project.scene.backgroundColor, tiles, colliders: project.colliders, markers: project.markers }
}

// Treat files as untrusted documents: check the schema and every reference before replacing a map.
export function parseProject(data: unknown): ProjectDocument {
  const json = record(data, "Projeto")
  if (json.format !== "tilemap-editor" || json.version !== 1) throw new Error("Formato ou versão de projeto não suportado.")
  for (const key of ["images", "tilesets", "elementDefinitions", "tilemaps", "elements", "colliders", "markers"]) {
    if (!Array.isArray(json[key])) throw new Error(`Lista inválida: ${key}.`)
  }
  const project = json as unknown as ProjectDocument
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
  uniqueIds(project.tilesets, "tilesets"); uniqueIds(project.elementDefinitions, "elementos")
  const mapIds = uniqueIds(project.tilemaps, "tilemaps")
  if (!mapIds.size) throw new Error("O projeto precisa de um tilemap.")
  for (const image of project.images) {
    if (typeof image.name !== "string" || !positiveInteger(image.width) || !positiveInteger(image.height) ||
        typeof image.src !== "string" || !/^data:image\/(png|jpeg|webp|gif);base64,/.test(image.src)) throw new Error("Imagem inválida: use imagens incorporadas PNG, JPEG, WebP ou GIF.")
  }
  const imageFor = (imageId: string) => {
    if (!imageIds.has(imageId)) throw new Error("Referência de imagem ausente.")
    return project.images.find((image) => image.id === imageId)!
  }
  for (const set of project.tilesets) {
    if (typeof set.name !== "string" || !["grid", "atlas"].includes(set.mode) || !Array.isArray(set.crops) || !set.crops.length || set.crops.length > 10000) throw new Error("Tileset inválido.")
    const image = imageFor(set.imageId)
    uniqueIds(set.crops, "recortes")
    for (const crop of set.crops) { if (typeof crop.name !== "string") throw new Error("Nome do recorte inválido."); validateCrop(crop, image) }
    if (set.mode === "grid") {
      if (!set.grid) throw new Error("Configuração de grade ausente.")
      gridCrops(image, set.grid)
    }
    // A file cannot declare arbitrary resources as compatible with the old atlas.
    if (set.legacy && set.id !== DEFAULT_TILESET_ID) throw new Error("Identidade do atlas antigo inválida.")
  }
  for (const definition of project.elementDefinitions) {
    if (typeof definition.name !== "string" || !["Objetos", "Inimigos", "Player", "Decoração"].includes(definition.category)) throw new Error("Definição de elemento inválida.")
    validateCrop(record(definition.crop, "Recorte de elemento") as unknown as Crop, imageFor(definition.imageId))
    if (definition.legacyId !== undefined && typeof definition.legacyId !== "string") throw new Error("ID antigo inválido.")
  }
  for (const map of project.tilemaps) {
    if (typeof map.name !== "string" || typeof map.visible !== "boolean" || !Array.isArray(map.tiles) ||
        (map.layer !== undefined && (!nonnegativeInteger(map.layer) || map.layer >= 5))) throw new Error("Tilemap inválido.")
    validateTilemapGrid(map)
  }
  const instances = editorContent(project).tiles
  uniqueIds(instances, "instâncias")
  const catalog = createCatalog(project)
  for (const tile of instances) {
    position(record(tile, "Instância"), "instância")
    if (typeof tile.tileId !== "string" || !nonnegativeInteger(tile.order) || (tile.locked !== undefined && typeof tile.locked !== "boolean") ||
        (tile.layer !== undefined && (!nonnegativeInteger(tile.layer) || tile.layer > 4)) ||
        (tile.creationCode !== undefined && tile.creationCode !== null && typeof tile.creationCode !== "string")) throw new Error("Propriedades de instância inválidas.")
    const resource = record(tile.resource, "Referência de recurso")
    if (resource.kind === "missing") { if (typeof resource.legacyId !== "string") throw new Error("Recurso antigo inválido.") }
    else if (!["tile", "element"].includes(resource.kind as string) || !resolveInstance(tile, catalog)) throw new Error("Referência de recurso ausente.")
  }
  for (const map of project.tilemaps) {
    if (map.tiles.some((tile) => tile.resource.kind === "element" || tile.tilemapId !== map.id)) throw new Error("Instância associada ao tilemap errado.")
  }
  if (project.elements.some((tile) => tile.resource.kind !== "element")) throw new Error("Referência de elemento inválida.")
  // Reuse the legacy structural checks for colliders and markers.
  importLegacy({ tiles: {}, colliders: project.colliders, markers: project.markers }, emptyProject())
  return project
}

export function addTileset(project: ProjectDocument, image: ImageResource, tileset: Tileset): ProjectDocument {
  if (project.images.some((item) => item.id === image.id) || project.tilesets.some((item) => item.id === tileset.id) || tileset.imageId !== image.id) throw new Error("Identidade de recurso duplicada ou inválida.")
  for (const crop of tileset.crops) validateCrop(crop, image)
  return { ...project, images: [...project.images, image], tilesets: [...project.tilesets, tileset] }
}
