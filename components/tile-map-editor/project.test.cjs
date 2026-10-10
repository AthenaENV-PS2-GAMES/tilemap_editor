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
const atlas = JSON.parse(fs.readFileSync(path.join(__dirname, "../../public/atlas/texture.json"), "utf8"))
const defaults = () => api.defaultProject(atlas, 256, 96)
const portable = (project) => ({ ...project, images: project.images.map((image) => {
  const buffer = fs.readFileSync(path.join(__dirname, "../../public", image.src))
  return { ...image, src: `data:image/png;base64,${buffer.toString("base64")}`, width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) }
}) })
const legacy = {
  backgroundColor: "#123456",
  tiles: {
    bgCloud: [{ x: -17, y: 3, layer: 0, locked: true, creationCode: "cloud.init()" }],
    tileCrate: [{ x: -32, y: 16, layer: 4, locked: false }],
    standingBastet: [{ x: 21, y: 9, layer: 2, creationCode: "boss.init()" }],
    customUnknown: [{ x: 48, y: -16, locked: true, layer: 3, creationCode: null }],
  },
  colliders: [{ x: -10, y: 3, width: 48, height: 32, type: "ladder" }],
  markers: [{ name: "spawn", x: -17, y: 3 }, { name: "spawn", x: 0, y: 0 }],
}

test("canvas size is validated, saved and remains optional in older project files", () => {
  const original = portable(defaults())
  assert.deepEqual(original.scene.canvasSize, { width: 1024, height: 768 })
  const resized = api.updateCanvasSize(original, { width: 320, height: 240 })
  assert.deepEqual(resized.scene.canvasSize, { width: 320, height: 240 })
  assert.deepEqual(api.parseProject(JSON.parse(JSON.stringify(resized))).scene.canvasSize, { width: 320, height: 240 })
  for (const size of [{ width: 0, height: 10 }, { width: 3.5, height: 10 }, { width: 10, height: 16385 }]) {
    assert.throws(() => api.updateCanvasSize(original, size))
    assert.throws(() => api.parseProject({ ...original, scene: { ...original.scene, canvasSize: size } }))
  }
  const older = { ...original, scene: { ...original.scene } }
  delete older.scene.canvasSize
  assert.deepEqual(api.parseProject(older), older)
})

test("migrates old maps without losing aliases, positions, overlap order, layers, locks or creationCode", () => {
  const project = api.importLegacy(legacy, defaults())
  const content = api.editorContent(project)
  assert.equal(content.tiles.length, 4)
  assert.deepEqual(content.tiles.map((tile) => tile.tileId), Object.keys(legacy.tiles))
  assert.equal(content.tiles[0].resource.kind, "element")
  assert.equal(content.tiles[1].resource.kind, "tile")
  assert.equal(content.tiles[2].resource.definitionId, "element:bossBastet")
  assert.deepEqual(content.tiles[3].resource, { kind: "missing", legacyId: "customUnknown" })
  for (const tile of content.tiles) {
    const source = legacy.tiles[tile.tileId][0]
    assert.equal(tile.x, source.x); assert.equal(tile.y, source.y)
    assert.equal(tile.layer, source.layer); assert.equal(tile.locked, source.locked ?? false)
    assert.equal(tile.creationCode, source.creationCode ?? null)
  }
  assert.deepEqual(project.colliders, legacy.colliders)
  assert.deepEqual(project.markers, legacy.markers)
  assert.equal(project.scene.backgroundColor, legacy.backgroundColor)
  const catalog = api.createCatalog(project)
  assert.equal(api.resolveInstance(content.tiles[0], catalog).crop.width, 48)
  assert.equal(api.resolveInstance(content.tiles[1], catalog).crop.width, 32)
})

test("legacy export retains map data and normalizes the known sprite aliases", () => {
  const result = api.exportLegacy(api.importLegacy(legacy, defaults()))
  assert.deepEqual(result.tiles.bgCloud, legacy.tiles.bgCloud)
  assert.deepEqual(result.tiles.bossBastet[0], { ...legacy.tiles.standingBastet[0], locked: false })
  assert.equal(result.tiles.customUnknown[0].locked, true)
  assert.deepEqual(result.colliders, legacy.colliders)
  assert.deepEqual(result.markers, legacy.markers)
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
  const image = { id: `image:${id}`, name: "same.png", src: "data:image/png;base64,AA==", width: 32, height: 32 }
  return api.addTileset(project, image, { id, name: "Same name", imageId: image.id, mode: "grid", grid: { width, height, margin: 0, spacing: 0 }, crops: api.gridCrops(image, { width, height, margin: 0, spacing: 0 }) })
}

test("two images with identical names and crop coordinates paint independently and survive JSON round-trip", () => {
  let project = addCustom(addCustom(portable(defaults()), "set:A"), "set:B", 32, 16)
  const catalog = api.createCatalog(project)
  const first = [...catalog.values()].find((entry) => entry.resource.tilesetId === "set:A")
  const second = [...catalog.values()].find((entry) => entry.resource.tilesetId === "set:B")
  assert.notEqual(first.key, second.key)
  project = api.paintTile(project, first, -1, 0, 0)
  project = api.paintTile(project, second, 16, 0, 0)
  const restored = api.parseProject(JSON.parse(JSON.stringify(project)))
  assert.deepEqual(restored, project)
  const content = api.editorContent(restored)
  assert.equal(content.tiles.length, 2)
  assert.equal(content.tiles[0].x, -16)
  assert.equal(api.resolveInstance(content.tiles[1], api.createCatalog(restored)).crop.width, 32)
  assert.throws(() => api.exportLegacy(restored), /recursos personalizados/)
  assert.equal(restored.images.every((image) => image.src.startsWith("data:image/")), true)
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
  let project = api.importLegacy(legacy, defaults())
  project.tilemaps.push({ ...project.tilemaps[0], id: "map:other", name: "Other", tiles: [{ ...project.tilemaps[0].tiles[0], id: "instance:other", tilemapId: "map:other", order: 10 }] })
  const content = api.editorContent(project)
  const edited = api.replaceEditorContent(project, { ...content, tiles: content.tiles.map((tile) => tile.tileId === "bgCloud" ? { ...tile, x: 100 } : tile) })
  assert.deepEqual(api.editorContent(edited).tiles.map((tile) => tile.id), content.tiles.map((tile) => tile.id))
  assert.equal(edited.elements[0].x, 100)
  assert.deepEqual(edited.tilemaps[1].tiles, project.tilemaps[1].tiles)
  assert.throws(() => api.exportLegacy(edited), /apenas um tilemap/)
})

test("project parser rejects future versions, duplicate IDs, missing references and invalid positions", () => {
  const base = portable(api.importLegacy(legacy, defaults()))
  assert.deepEqual(api.parseProject(base), base)
  const variations = [
    (p) => { p.version = 999 },
    (p) => { p.images.push(p.images[0]) },
    (p) => { p.tilemaps[0].tiles[0].resource.cropId = "missing" },
    (p) => { p.elements[0].x = "0" },
    (p) => { p.images[0].src = "https://other.example/image.png" },
    (p) => { p.tilesets[0].crops[0].width = 10000 },
    (p) => { p.tilemaps[0].tiles[0].tilemapId = "missing" },
    (p) => { p.tilemaps[0].tiles[0].id = p.elements[0].id },
    (p) => { p.colliders[0].height = -1 },
  ]
  for (const mutate of variations) {
    const bad = structuredClone(base); mutate(bad)
    assert.throws(() => api.parseProject(bad))
  }
})

test("portable save embeds and decodes the actual built-in images, then reopens without paths", async () => {
  const { portableProject } = load(path.join(__dirname, "project-files.ts"))
  const original = { Image: global.Image, FileReader: global.FileReader, fetch: global.fetch }
  global.Image = class {
    set src(value) {
      const data = Buffer.from(value.split(",")[1], "base64")
      this.naturalWidth = data.readUInt32BE(16); this.naturalHeight = data.readUInt32BE(20)
      queueMicrotask(() => this.onload())
    }
  }
  global.FileReader = class {
    async readAsDataURL(blob) {
      this.result = `data:${blob.type};base64,${Buffer.from(await blob.arrayBuffer()).toString("base64")}`
      this.onload()
    }
  }
  global.fetch = async (src) => new Response(fs.readFileSync(path.join(__dirname, "../../public", src)), { headers: { "Content-Type": "image/png" } })
  try {
    const project = api.importLegacy(legacy, defaults())
    const saved = await portableProject(project)
    assert.equal(saved.images.every((image) => image.src.startsWith("data:image/png;base64,")), true)
    assert.deepEqual(api.parseProject(JSON.parse(JSON.stringify(saved))), saved)
    assert.deepEqual(api.exportLegacy(saved), api.exportLegacy(project))
    assert.equal(project.images[0].src, "/atlas/texture.png")
  } finally { Object.assign(global, original) }
})

test("tilemaps use independent origins and cell sizes without resizing crops or erasing neighbors", () => {
  let project = api.createTilemap(defaults(), "Upper", "map:upper")
  const entry = [...api.createCatalog(project).values()].find((item) => item.resource.kind === "tile")
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
  assert.deepEqual(api.parseProject(JSON.parse(JSON.stringify(result))), result)
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
  assert.deepEqual(api.parseProject(JSON.parse(JSON.stringify(project))), project)
  assert.throws(() => api.exportLegacy(project), /apenas um tilemap/)
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
  assert.throws(() => api.exportLegacy(project), /alinhamento de objetos/)
  assert.deepEqual(api.parseProject(portable(project)), portable(project))
})

test("project parser rejects unsafe tilemap grids while accepting older version 1 files", () => {
  const original = portable(defaults())
  const older = structuredClone(original)
  delete older.scene.objectAlignment
  assert.deepEqual(api.parseProject(older), older)
  for (const change of [
    (map) => { map.cellWidth = 0 },
    (map) => { map.cellHeight = 1.5 },
    (map) => { map.origin.x = 0.5 },
    (map) => { map.origin = null },
  ]) {
    const invalid = structuredClone(original)
    change(invalid.tilemaps[0])
    assert.throws(() => api.parseProject(invalid))
  }
})

test("element definitions from a standalone image and a tileset crop keep separate references", () => {
  let project = portable(defaults())
  const png = fs.readFileSync(path.join(__dirname, "../../public/objects/bgCloud.png"))
  const image = { id: "image:custom", name: "cloud.png", src: `data:image/png;base64,${png.toString("base64")}`, width: png.readUInt32BE(16), height: png.readUInt32BE(20) }
  const custom = { id: "element:custom", name: "Custom cloud", category: "Decoração", imageId: image.id, crop: { id: "full", name: "Custom cloud", x: 0, y: 0, width: image.width, height: image.height } }
  project = api.addElementDefinition(project, custom, image)
  const set = project.tilesets[0]
  const extracted = { id: "element:atlas-crop", name: "Crate object", category: "Objetos", imageId: set.imageId, crop: set.crops[0] }
  project = api.addElementDefinition(project, extracted)
  const catalogue = api.createCatalog(project)
  project = api.paintTile(project, catalogue.get(api.referenceKey({ kind: "element", definitionId: custom.id })), 8, 8, 1)
  project = api.paintTile(project, catalogue.get(api.referenceKey({ kind: "element", definitionId: extracted.id })), 32, 8, 1)
  assert.equal(project.images.length, defaults().images.length + 1)
  assert.equal(project.elements.length, 2)
  assert.equal(api.resolveInstance(project.elements[0], catalogue).crop.width, image.width)
  assert.equal(api.resolveInstance(project.elements[1], catalogue).imageId, set.imageId)
  assert.deepEqual(api.parseProject(JSON.parse(JSON.stringify(project))), project)
  assert.throws(() => api.exportLegacy(project), /recursos personalizados/)
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
  const file = new File(["{}"], "legacy.json", { type: "application/json" })
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

test("tilemap layer controls display order and stays compatible with older project files", () => {
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
  assert.equal(api.parseProject(JSON.parse(JSON.stringify(project))).tilemaps[1].layer, 2)
  assert.throws(() => api.exportLegacy(project), /tilemaps múltiplos|camadas/)
  assert.throws(() => api.setTilemapLayer(project, foreground.id, 5), /inválida/)
  const previous = { ...portable(defaults()), tilemaps: portable(defaults()).tilemaps.map(({ layer, ...map }) => map) }
  assert.equal(api.parseProject(previous).tilemaps[0].layer, undefined)
})
