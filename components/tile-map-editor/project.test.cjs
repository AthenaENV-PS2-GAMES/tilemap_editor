const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const Module = require("node:module")
const ts = require("typescript")

function load(file) {
  const compiled = new Module(file, module)
  compiled.require = (specifier) => {
    if (!specifier.startsWith(".")) return require(specifier)
    const resolved = path.resolve(path.dirname(file), specifier)
    const dependency = [resolved + ".ts", resolved + ".tsx"].find(fs.existsSync)
    return dependency ? load(dependency) : require(resolved)
  }
  compiled._compile(ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, file)
  return compiled.exports
}
const api = load(path.join(__dirname, "project.ts"))
const { createSpatialIndex } = load(path.join(__dirname, "selection-index.ts"))
const PNG = "data:image/png;base64,AA=="
const imageOf = (id, width, height) => ({ id, name: `${id}.png`, src: PNG, width, height })
const atlas = { frames: {
  "tileCrate.png": { frame: { x: 0, y: 0, w: 32, h: 32 } },
  "bgGold.png": { frame: { x: 0, y: 32, w: 16, h: 16 } },
  "tileGrass.png": { frame: { x: 32, y: 0, w: 16, h: 16 } },
} }
// One grid tileset (8 crops), one atlas tileset (3 crops) and two elements.
const defaults = () => {
  let project = api.emptyProject()
  const sheet = imageOf("image:sheet", 64, 32)
  const grid = { width: 16, height: 16, margin: 0, spacing: 0 }
  project = api.addTileset(project, sheet, { id: "set:grid", name: "Grid", imageId: sheet.id, mode: "grid", grid, crops: api.gridCrops(sheet, grid), cropCount: 8 })
  const packed = imageOf("image:atlas", 64, 64)
  project = api.addTileset(project, packed, { id: "set:atlas", name: "Atlas", imageId: packed.id, mode: "atlas", crops: api.atlasCrops(atlas, packed), cropCount: 3 })
  project = api.addElementDefinition(project, { id: "element:cloud", name: "Cloud", category: "Objetos", imageId: sheet.id, crop: { id: "c", name: "Cloud", x: 0, y: 0, width: 48, height: 16 } })
  const own = imageOf("image:own", 20, 10)
  return api.addElementDefinition(project, { id: "element:own", name: "Own", category: "Decoração", imageId: own.id, crop: { id: "full", name: "Own", x: 0, y: 0, width: 20, height: 10 } }, own)
}
const portable = (project) => structuredClone(project)
const entryOf = (project, predicate) => [...api.createCatalog(project).values()].find(predicate)
const firstTile = (project) => entryOf(project, (e) => e.resource.kind === "tile")
const firstElement = (project) => entryOf(project, (e) => e.resource.kind === "element")
const roundTrip = (project) => api.parseProject(JSON.parse(JSON.stringify(api.serializeProject(project))))
// Instance ids are regenerated on open; compare everything else.
const strip = (project) => JSON.parse(JSON.stringify(project, (key, value) => key === "id" && typeof value === "string" && value.startsWith("instance:") ? undefined : value))
const attachAll = (opened, original) => {
  let result = opened
  for (const image of original.images) {
    const needsAtlas = original.tilesets.some((set) => set.imageId === image.id && set.mode === "atlas")
    result = api.attachImage(result, image.id, { src: image.src, width: image.width, height: image.height }, needsAtlas ? atlas : undefined)
  }
  return result
}

test("canvas size is validated, saved and remains optional in project files", () => {
  const original = portable(defaults())
  assert.deepEqual(original.scene.canvasSize, { width: 1024, height: 768 })
  const resized = api.updateCanvasSize(original, { width: 320, height: 240 })
  assert.deepEqual(resized.scene.canvasSize, { width: 320, height: 240 })
  assert.deepEqual(roundTrip(resized).scene.canvasSize, { width: 320, height: 240 })
  for (const size of [{ width: 0, height: 10 }, { width: 3.5, height: 10 }, { width: 10, height: 16385 }]) {
    assert.throws(() => api.updateCanvasSize(original, size))
    assert.throws(() => api.validateDocument({ ...original, scene: { ...original.scene, canvasSize: size } }))
  }
  const older = { ...original, scene: { ...original.scene } }
  delete older.scene.canvasSize
  assert.deepEqual(api.validateDocument(older), older)
})

test("custom collider types keep their label, color and references in project files", () => {
  const base = portable(defaults())
  const withType = api.addColliderType(base, "Lava", "#ff6600", "collider-type:lava")
  const project = { ...withType, colliders: [...withType.colliders, { x: 0, y: 0, width: 16, height: 16, type: "collider-type:lava" }] }
  assert.equal(api.colliderTypeDefinitions(project).length, 6)
  assert.deepEqual(api.colliderTypeDefinitions(project)[5], { id: "collider-type:lava", label: "Lava", color: "#ff6600" })
  assert.deepEqual(strip(attachAll(roundTrip(project), project)), strip(project))
  assert.throws(() => api.addColliderType(project, "lava", "#123456", "collider-type:other"), /duplicado/)
  assert.throws(() => api.addColliderType(base, "ground", "#123456", "collider-type:other"), /duplicado/)
  assert.throws(() => api.addColliderType(base, "Lava", "red", "collider-type:other"), /inválido/)
  const missingType = JSON.parse(JSON.stringify(project))
  missingType.colliderTypes = []
  assert.throws(() => api.validateDocument(missingType), /tipo não definido/)
  const old = JSON.parse(JSON.stringify(base))
  delete old.colliderTypes
  assert.deepEqual(api.validateDocument(old), old)
})

test("calculates regular crops with margins, spacing and incomplete edge cells", () => {
  const crops = api.gridCrops({ width: 38, height: 39 }, { width: 16, height: 16, margin: 2, spacing: 2 })
  assert.deepEqual(crops.map(({ x, y, width, height }) => ({ x, y, width, height })), [
    { x: 2, y: 2, width: 16, height: 16 }, { x: 20, y: 2, width: 16, height: 16 },
    { x: 2, y: 20, width: 16, height: 16 }, { x: 20, y: 20, width: 16, height: 16 },
  ])
})

test("rejects empty, fractional, negative, excessive and out-of-bounds grids", () => {
  const base = { width: 16, height: 16, margin: 0, spacing: 0 }
  for (const grid of [{ ...base, width: 0 }, { ...base, width: NaN }, { ...base, height: 1.5 }, { ...base, margin: -1 }, { ...base, spacing: -1 }, { ...base, margin: 100 }, { ...base, width: 100 }]) {
    assert.throws(() => api.gridCrops({ width: 32, height: 32 }, grid))
  }
  assert.throws(() => api.gridCrops({ width: 1000, height: 1000 }, { ...base, width: 1, height: 1 }), /10.000/)
})

test("atlas import produces the same crop shape and rejects unsupported frames", () => {
  const source = { frames: { "grass.png": { frame: { x: 1, y: 2, w: 16, h: 8 } } } }
  assert.deepEqual(api.atlasCrops(source, { width: 32, height: 32 })[0], { id: "grass.png", name: "grass", x: 1, y: 2, width: 16, height: 8 })
  for (const flag of ["rotated", "trimmed"]) {
    assert.throws(() => api.atlasCrops({ frames: { grass: { ...source.frames["grass.png"], [flag]: true } } }, { width: 32, height: 32 }), /não são suportados/)
  }
  assert.throws(() => api.atlasCrops({ frames: { grass: { frame: { x: 25, y: 0, w: 16, h: 16 } } } }, { width: 32, height: 32 }), /limites/)
  assert.throws(() => api.atlasCrops({ frames: [] }, { width: 32, height: 32 }), /formato de objeto/)
})

function addCustom(project, id, width = 16, height = 16) {
  const image = { id: `image:${id}`, name: "same.png", src: PNG, width: 32, height: 32 }
  return api.addTileset(project, image, { id, name: "Same name", imageId: image.id, mode: "grid", grid: { width, height, margin: 0, spacing: 0 }, crops: api.gridCrops(image, { width, height, margin: 0, spacing: 0 }), cropCount: api.gridCrops(image, { width, height, margin: 0, spacing: 0 }).length })
}

test("two images with identical names and crop coordinates paint independently and survive the file round-trip", () => {
  let project = addCustom(addCustom(portable(defaults()), "set:A"), "set:B", 32, 16)
  const catalog = api.createCatalog(project)
  const first = [...catalog.values()].find((entry) => entry.resource.tilesetId === "set:A")
  const second = [...catalog.values()].find((entry) => entry.resource.tilesetId === "set:B")
  assert.notEqual(first.key, second.key)
  project = api.paintTile(project, first, -1, 0, 0)
  project = api.paintTile(project, second, 16, 0, 0)
  const restored = attachAll(roundTrip(project), project)
  assert.deepEqual(strip(restored), strip(project))
  const content = api.editorContent(restored)
  assert.equal(content.tiles.length, 2)
  assert.equal(content.tiles[0].x, -16)
  assert.equal(api.resolveInstance(content.tiles[1], api.createCatalog(restored)).crop.width, 32)
})
test("painting another tileset replaces only the chosen cell and layer; locked cells stay intact", () => {
  let project = addCustom(addCustom(defaults(), "set:A"), "set:B")
  const entries = [...api.createCatalog(project).values()]
  const a = entries.find((entry) => entry.resource.tilesetId === "set:A")
  const b = entries.find((entry) => entry.resource.tilesetId === "set:B")
  project = api.paintTile(project, a, 0, 0, 0)
  assert.equal(api.paintTile(project, a, 0, 0, 0), project)
  project = api.paintTile(project, b, 0, 0, 1)
  project = api.paintTile(project, b, 0, 0, 0)
  assert.equal(api.editorContent(project).tiles.length, 2)
  project.tilemaps[0].tiles[0].locked = true
  const locked = project.tilemaps[0].tiles[0]
  project = api.paintTile(project, a, 0, 0, locked.layer)
  assert.equal(project.tilemaps[0].tiles.includes(locked), true)
  project = api.eraseTile(project, 0, 0, locked.layer)
  assert.equal(project.tilemaps[0].tiles.includes(locked), true)
})

test("flattening and editing preserve instance identity, order and unrelated tilemaps", () => {
  let project = api.createTilemap(defaults(), "Other", "map:other")
  project = api.paintTile(project, firstTile(project), 0, 0, 0, project.tilemaps[0].id)
  project = api.paintTile(project, firstTile(project), 32, 0, 0, "map:other")
  project = api.paintTile(project, firstElement(project), 8, 8, 1)
  const content = api.editorContent(project)
  const edited = api.replaceEditorContent(project, { ...content, tiles: content.tiles.map((tile) => tile.resource.kind === "element" ? { ...tile, x: 100 } : tile) })
  assert.deepEqual(api.editorContent(edited).tiles.map((tile) => tile.id), content.tiles.map((tile) => tile.id))
  assert.equal(edited.elements[0].x, 100)
  assert.deepEqual(edited.tilemaps[1].tiles, project.tilemaps[1].tiles)
})
test("saved files hold only tileset indexes and positions, no image data or crops", () => {
  let project = defaults()
  project = api.paintTile(project, entryOf(project, (e) => e.resource.tilesetId === "set:grid" && e.resource.index === 5), 20, 35, 2)
  project = api.paintTile(project, entryOf(project, (e) => e.resource.tilesetId === "set:atlas" && e.resource.index === 1), 0, 0, 0)
  project = api.paintTile(project, firstElement(project), 48, 16, 1)
  const file = api.serializeProject(project)
  const text = JSON.stringify(file)
  assert.equal(file.version, 2)
  assert.equal(text.includes("data:image"), false)
  assert.equal(text.includes('"src"'), false)
  assert.equal(text.includes('"crops"'), false)
  assert.equal(file.tilesets.find((set) => set.id === "set:atlas").cropCount, 3)
  assert.deepEqual(file.tilemaps[0].tiles.map(({ tileset, index, x, y }) => ({ tileset, index, x, y })), [
    { tileset: "set:grid", index: 5, x: 16, y: 32 }, { tileset: "set:atlas", index: 1, x: 0, y: 0 },
  ])
  assert.equal(file.tilemaps[0].tiles[0].layer, 2)
  assert.deepEqual(file.elements.map(({ element, x, y }) => ({ element, x, y })), [{ element: "element:cloud", x: 48, y: 16 }])
})

test("opening a saved file leaves images pending until they are attached, then restores the exact document", () => {
  let project = defaults()
  project = api.paintTile(project, entryOf(project, (e) => e.resource.tilesetId === "set:atlas" && e.resource.index === 2), 16, 16, 0)
  project = api.paintTile(project, firstElement(project), 8, 8, 1)
  const opened = roundTrip(project)
  assert.equal(api.pendingImages(opened).length, 3)
  assert.equal(opened.images.every((image) => image.src === undefined), true)
  assert.equal(opened.tilesets.find((set) => set.id === "set:atlas").crops.length, 0)
  assert.equal(opened.tilesets.find((set) => set.id === "set:grid").crops.length, 8)
  const original = api.editorContent(project).tiles
  assert.deepEqual(api.editorContent(opened).tiles.map(({ x, y, order, layer, resource }) => ({ x, y, order, layer, resource })), original.map(({ x, y, order, layer, resource }) => ({ x, y, order, layer, resource })))
  const attached = attachAll(opened, project)
  assert.equal(api.pendingImages(attached).length, 0)
  assert.deepEqual(strip(attached), strip(project))
  assert.equal(api.resolveInstance(api.editorContent(attached).tiles[0], api.createCatalog(attached)).crop.name, "tileGrass")
})

test("attaching validates image dimensions, atlas presence and atlas crop count", () => {
  const original = defaults()
  const opened = roundTrip(original)
  const sheet = { src: PNG, width: 64, height: 32 }
  assert.throws(() => api.attachImage(opened, "image:sheet", { ...sheet, width: 32 }), /espera 64 × 32/)
  assert.throws(() => api.attachImage(opened, "image:atlas", { src: PNG, width: 64, height: 64 }), /atlas JSON/)
  assert.throws(() => api.attachImage(opened, "image:atlas", { src: PNG, width: 64, height: 64 }, { frames: { a: { frame: { x: 0, y: 0, w: 16, h: 16 } } } }), /1 recortes.*3/)
  assert.throws(() => api.attachImage(opened, "image:atlas", { src: "https://x/y.png", width: 64, height: 64 }, atlas), /não suportado/)
  assert.throws(() => api.attachImage(opened, "image:missing", sheet), /não encontrada/)
  assert.equal(api.attachImage(opened, "image:sheet", sheet).images.find((image) => image.id === "image:sheet").src, PNG)
})

test("older and malformed project files are rejected", () => {
  const file = api.serializeProject(defaults())
  const variations = [
    (p) => { p.version = 1 },
    (p) => { p.version = 999 },
    (p) => { p.format = "other" },
    (p) => { p.images.push(p.images[0]) },
    (p) => { p.images[0].src = PNG },
    (p) => { p.tilesets[0].cropCount = 9 },
    (p) => { p.tilesets[0].imageId = "image:missing" },
    (p) => { p.tilemaps[0].tiles.push({ tileset: "set:grid", index: 8, x: 0, y: 0, order: 0 }) },
    (p) => { p.tilemaps[0].tiles.push({ tileset: "set:missing", index: 0, x: 0, y: 0, order: 0 }) },
    (p) => { p.tilemaps[0].tiles.push({ tileset: "set:grid", index: -1, x: 0, y: 0, order: 0 }) },
    (p) => { p.tilemaps[0].tiles.push({ tileset: "set:grid", index: 0, x: "0", y: 0, order: 0 }) },
    (p) => { p.elements.push({ element: "element:missing", x: 0, y: 0, order: 0 }) },
    (p) => { p.colliders.push({ x: 0, y: 0, width: 4, height: -1, type: "ground" }) },
    (p) => { p.markers.push({ name: "m", x: "1", y: 0 }) },
  ]
  for (const mutate of variations) {
    const bad = structuredClone(file); mutate(bad)
    assert.throws(() => api.parseProject(bad))
  }
  assert.throws(() => api.parseProject({ backgroundColor: "#123456", tiles: { tileCrate: [{ x: 0, y: 0 }] } }), /não reconhecido/)
  assert.deepEqual(strip(attachAll(api.parseProject(structuredClone(file)), defaults())), strip(defaults()))
})
test("attaching through history applies to every snapshot so undo cannot detach images", () => {
  // Mirrors useHistory.transformAll: the same pure change is applied to past, present and future.
  const original = defaults()
  const opened = roundTrip(original)
  const painted = api.paintTile(opened, entryOf(opened, (e) => e.resource.tilesetId === "set:grid"), 0, 0, 0)
  const snapshots = [opened, painted].map((state) => api.attachImage(state, "image:sheet", { src: PNG, width: 64, height: 32 }))
  assert.equal(snapshots.every((state) => state.images.find((image) => image.id === "image:sheet").src === PNG), true)
})
test("tilemaps use independent origins and cell sizes without resizing crops or erasing neighbors", () => {
  let project = api.createTilemap(defaults(), "Upper", "map:upper")
  const entry = entryOf(project, (item) => item.resource.tilesetId === "set:atlas" && item.resource.index === 0)
  project = api.updateTilemapGrid(project, "map:upper", { cellWidth: 32, cellHeight: 24, origin: { x: -8, y: 4 } }, "keep-world")
  project = api.paintTile(project, entry, 20, 35, 0, project.tilemaps[0].id)
  project = api.paintTile(project, entry, 20, 35, 0, "map:upper")
  assert.deepEqual(project.tilemaps[0].tiles.map(({ x, y }) => ({ x, y })), [{ x: 16, y: 32 }])
  assert.deepEqual(project.tilemaps[1].tiles.map(({ x, y }) => ({ x, y })), [{ x: -8, y: 28 }])
  assert.equal(api.resolveInstance(project.tilemaps[1].tiles[0], api.createCatalog(project)).crop.width, 32)
  project = api.eraseTile(project, 20, 35, 0, "map:upper")
  assert.equal(project.tilemaps[1].tiles.length, 0)
  assert.equal(project.tilemaps[0].tiles.length, 1)
})

test("deleting a tilemap removes its tiles, preserves other content and keeps one map", () => {
  let project = api.createTilemap(portable(defaults()), "Upper", "map:upper")
  const entry = [...api.createCatalog(project).values()].find((item) => item.resource.kind === "tile")
  project = api.paintTile(project, entry, 16, 16, 0, project.tilemaps[0].id)
  project = api.paintTile(project, entry, 32, 32, 0, "map:upper")
  const remaining = project.tilemaps[0]
  const result = api.deleteTilemap(project, "map:upper")
  assert.equal(result.tilemaps.length, 1)
  assert.equal(result.tilemaps[0], remaining)
  assert.equal(api.editorContent(result).tiles.length, 1)
  assert.deepEqual(strip(attachAll(roundTrip(result), result)), strip(result))
  assert.throws(() => api.deleteTilemap(result, remaining.id), /pelo menos um tilemap/)
  assert.throws(() => api.deleteTilemap(project, "missing"), /não encontrado/)
})

test("occupied grid changes preview movement and require an explicit position policy", () => {
  let project = defaults()
  const entry = [...api.createCatalog(project).values()].find((item) => item.resource.kind === "tile")
  project = api.paintTile(project, entry, 20, 35, 0)
  const original = project.tilemaps[0].tiles[0]
  const next = { cellWidth: 32, cellHeight: 24, origin: { x: -8, y: 4 } }
  assert.deepEqual(api.previewTilemapGrid(project.tilemaps[0], next), {
    count: 1, moved: 1, samples: [{ id: original.id, before: { x: 16, y: 32 }, after: { x: 24, y: 52 } }],
  })
  assert.throws(() => api.updateTilemapGrid(project, project.tilemaps[0].id, next, null), /Escolha/)
  const stayed = api.updateTilemapGrid(project, project.tilemaps[0].id, next, "keep-world")
  const moved = api.updateTilemapGrid(project, project.tilemaps[0].id, next, "keep-cells")
  assert.deepEqual({ x: stayed.tilemaps[0].tiles[0].x, y: stayed.tilemaps[0].tiles[0].y }, { x: 16, y: 32 })
  assert.deepEqual({ x: moved.tilemaps[0].tiles[0].x, y: moved.tilemaps[0].tiles[0].y }, { x: 24, y: 52 })
  assert.equal(moved.tilemaps[0].tiles[0].id, original.id)
  assert.equal(moved.tilemaps[0].tiles[0].resource, original.resource)
  assert.equal(moved.tilemaps[0].tiles[0].creationCode, original.creationCode)
})

test("renaming and hiding one tilemap survive project reload without changing others", () => {
  let project = api.createTilemap(portable(defaults()), "Upper", "map:upper")
  project = api.renameTilemap(project, "map:upper", "Foreground")
  project = api.setTilemapVisibility(project, "map:upper", false)
  const entry = [...api.createCatalog(project).values()].find((item) => item.resource.kind === "tile")
  assert.equal(api.paintTile(project, entry, 0, 0, 0, "map:upper"), project)
  assert.equal(project.tilemaps[0].visible, true)
  assert.equal(project.tilemaps[1].name, "Foreground")
  assert.equal(project.tilemaps[1].visible, false)
  assert.deepEqual(strip(attachAll(roundTrip(project), project)), strip(project))
})

test("object alignment is independent of tilemap grids and never moves existing instances", () => {
  let project = defaults()
  const entity = [...api.createCatalog(project).values()].find((item) => item.resource.kind === "element")
  project = api.paintTile(project, entity, 21.4, -7.8, 1)
  const original = project.elements[0]
  assert.deepEqual({ x: original.x, y: original.y }, { x: 16, y: -16 })
  project = api.updateObjectAlignment(project, { enabled: false, cellWidth: 16, cellHeight: 16, origin: { x: 0, y: 0 } })
  project = api.paintTile(project, entity, 21.4, -7.8, 1)
  assert.deepEqual(project.elements.map(({ x, y }) => ({ x, y })), [{ x: 16, y: -16 }, { x: 21, y: -8 }])
  project = api.updateObjectAlignment(project, { enabled: true, cellWidth: 10, cellHeight: 20, origin: { x: 3, y: -2 } })
  assert.equal(project.elements[0], original)
  assert.deepEqual(api.snapToTilemap(21.4, -7.8, project.scene.objectAlignment), { x: 13, y: -22 })
  assert.deepEqual(api.validateDocument(portable(project)), portable(project))
})

test("project parser rejects unsafe tilemap grids and accepts files without optional scene settings", () => {
  const original = portable(defaults())
  const older = structuredClone(original)
  delete older.scene.objectAlignment
  assert.deepEqual(api.validateDocument(older), older)
  for (const change of [
    (map) => { map.cellWidth = 0 },
    (map) => { map.cellHeight = 1.5 },
    (map) => { map.origin.x = 0.5 },
    (map) => { map.origin = null },
  ]) {
    const invalid = structuredClone(original)
    change(invalid.tilemaps[0])
    assert.throws(() => api.validateDocument(invalid))
  }
})

test("element definitions from a standalone image and a tileset crop keep separate references", () => {
  let project = defaults()
  const catalogue = api.createCatalog(project)
  project = api.paintTile(project, catalogue.get(api.referenceKey({ kind: "element", definitionId: "element:own" })), 8, 8, 1)
  project = api.paintTile(project, catalogue.get(api.referenceKey({ kind: "element", definitionId: "element:cloud" })), 32, 8, 1)
  assert.equal(project.elements.length, 2)
  assert.equal(api.resolveInstance(project.elements[0], catalogue).crop.width, 20)
  assert.equal(api.resolveInstance(project.elements[1], catalogue).imageId, "image:sheet")
  const restored = attachAll(roundTrip(project), project)
  assert.deepEqual(strip(restored), strip(project))
  assert.deepEqual(api.pendingImages(roundTrip(project)).find((entry) => entry.image.id === "image:own").elements.map((item) => item.id), ["element:own"])
})
test("stacked element copies keep unique IDs and erasing removes one visual element at a time", () => {
  let project = defaults()
  const entity = [...api.createCatalog(project).values()].find((entry) => entry.resource.kind === "element")
  project = api.paintTile(project, entity, 16, 16, 1)
  project = api.paintTile(project, entity, 16, 16, 1)
  assert.equal(project.elements.length, 2)
  assert.notEqual(project.elements[0].id, project.elements[1].id)
  const first = project.elements[0]
  project = api.eraseTile(project, 17, 17, 1)
  assert.equal(project.elements.length, 1)
  assert.equal(project.elements[0], first)
})

test("moving a group preserves offsets, responds to absolute drag distance, and respects locked instances", () => {
  let project = defaults()
  const entity = [...api.createCatalog(project).values()].find((entry) => entry.resource.kind === "element")
  project = api.paintTile(project, entity, 0, 0, 1)
  project = api.paintTile(project, entity, 32, 16, 1)
  const origins = project.elements.map(({ id, x, y }) => ({ id, x, y }))
  project = api.moveElements(project, origins, 7, 7)
  assert.deepEqual(project.elements.map(({ x, y }) => ({ x, y })), [{ x: 0, y: 0 }, { x: 32, y: 16 }])
  project = api.moveElements(project, origins, 18, 33)
  assert.deepEqual(project.elements.map(({ x, y }) => ({ x, y })), [{ x: 16, y: 32 }, { x: 48, y: 48 }])
  project = api.moveElements(project, origins, 32, 16)
  assert.deepEqual(project.elements.map(({ x, y }) => ({ x, y })), [{ x: 32, y: 16 }, { x: 64, y: 32 }])
  project = api.updateObjectAlignment(project, { enabled: false, cellWidth: 16, cellHeight: 16, origin: { x: 0, y: 0 } })
  project = api.moveElements(project, origins, 5.7, -3.3)
  assert.deepEqual(project.elements.map(({ x, y }) => ({ x, y })), [{ x: 6, y: -3 }, { x: 38, y: 13 }])
  const locked = { ...project, elements: [{ ...project.elements[0], locked: true }, project.elements[1]] }
  assert.equal(api.moveElements(locked, origins, 64, 64), locked)
})

test("spatial hit testing finds negative positions, large sprites and overlapping copies in draw order", () => {
  const entries = [
    { id: "background", x: -256, y: -128, width: 256, height: 256 },
    { id: "first", x: -16, y: -16, width: 16, height: 16 },
    { id: "second", x: -16, y: -16, width: 16, height: 16 },
    { id: "right", x: 256, y: 0, width: 16, height: 16 },
  ]
  const query = createSpatialIndex(entries, (entry) => entry)
  assert.deepEqual(query(-1, -1).map(({ id }) => id), ["background", "first", "second"])
  assert.deepEqual(query(-200, 100).map(({ id }) => id), ["background"])
  assert.deepEqual(query(0, 0).map(({ id }) => id), [])
  assert.deepEqual(query(256, 0).map(({ id }) => id), ["right"])
})

test("native file pickers save and open JSON, and cancellation leaves the project intact", async () => {
  const { pickJsonFile, saveJson } = load(path.join(__dirname, "project-files.ts"))
  const originalWindow = global.window
  const writes = []
  const file = new File(["{}"], "project.json", { type: "application/json" })
  global.window = {
    showOpenFilePicker: async () => [{ getFile: async () => file }],
    showSaveFilePicker: async (options) => {
      assert.equal(options.suggestedName, "map.project.json")
      return { createWritable: async () => ({ write: async (blob) => writes.push(JSON.parse(await blob.text())), close: async () => {} }) }
    },
  }
  try {
    assert.equal(await pickJsonFile(), file)
    assert.equal(await saveJson({ version: 1 }, "map.project.json"), true)
    assert.deepEqual(writes, [{ version: 1 }])
    global.window.showSaveFilePicker = async () => { throw new DOMException("Cancelled", "AbortError") }
    assert.equal(await saveJson({ version: 2 }, "map.project.json"), false)
    assert.deepEqual(writes, [{ version: 1 }])
  } finally { global.window = originalWindow }
})

test("file input fallback opens a JSON file when native pickers are unavailable", async () => {
  const { pickJsonFile } = load(path.join(__dirname, "project-files.ts"))
  const originalWindow = global.window
  const originalDocument = global.document
  const file = new File(["{}"], "map.json", { type: "application/json" })
  const events = new Map()
  global.window = {}
  global.document = { createElement: () => ({
    files: [file],
    addEventListener: (type, callback) => events.set(type, callback),
    click: () => events.get("change")(),
  }) }
  try { assert.equal(await pickJsonFile(), file) }
  finally { global.window = originalWindow; global.document = originalDocument }
})

test("tilemap layer controls display order and layers stay optional", () => {
  let project = api.createTilemap(portable(defaults()), "Foreground", "tilemap:foreground")
  const first = project.tilemaps[0]
  const foreground = project.tilemaps[1]
  const tile = { id: "a", x: 0, y: 0, layer: 1, order: 0 }
  const other = { ...tile, id: "b", tilemapId: foreground.id, order: 1 }
  const base = { ...tile, tilemapId: first.id }
  assert.equal(api.compareDisplayOrder(base, other, new Map([[first.id, 0], [foreground.id, 0]])) < 0, true)
  project = api.setTilemapLayer(project, foreground.id, 2)
  const layers = new Map(project.tilemaps.map((map) => [map.id, map.layer]))
  assert.equal(api.compareDisplayOrder(base, other, layers) < 0, true)
  assert.equal(api.compareDisplayOrder(other, base, layers) > 0, true)
  assert.equal(roundTrip(project).tilemaps[1].layer, 2)
  assert.throws(() => api.setTilemapLayer(project, foreground.id, 5), /inválida/)
  const previous = { ...portable(defaults()), tilemaps: portable(defaults()).tilemaps.map(({ layer, ...map }) => map) }
  assert.equal(api.validateDocument(previous).tilemaps[0].layer, undefined)
})

test("colliders naming an undefined type get that type created instead of failing the load", () => {
  const file = JSON.parse(JSON.stringify(api.serializeProject(defaults())))
  file.colliders.push(
    { x: 0, y: 0, width: 16, height: 16, type: "lava" }, { x: 16, y: 0, width: 16, height: 16, type: "lava" },
    { x: 32, y: 0, width: 16, height: 16, type: "Ground" }, { x: 48, y: 0, width: 16, height: 16, type: "ladder" },
  )
  const project = api.parseProject(file)
  const lava = project.colliderTypes.filter((type) => type.label === "lava")
  assert.equal(lava.length, 1)
  assert.deepEqual(project.colliders.map((c) => c.type), [lava[0].id, lava[0].id, "ground", "ladder"])
  assert.equal(project.colliderTypes.length, 1)
  assert.equal(api.colliderTypeDefinitions(project).some((type) => type.id === lava[0].id), true)
  file.colliders.push({ x: 0, y: 0, width: 16, height: 16, type: 7 })
  assert.throws(() => api.parseProject(file), /Collider inválido/)
})
