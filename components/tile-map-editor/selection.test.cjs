const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const Module = require("node:module")
const ts = require("typescript")

// Run the actual TypeScript helpers with the project's existing compiler.
function loadTypeScriptModule(file) {
  const compiled = new Module(file, module)
  compiled.require = (specifier) => {
    if (!specifier.startsWith(".")) return require(specifier)
    const resolved = path.resolve(path.dirname(file), specifier)
    const dependency = [resolved + ".ts", resolved + ".tsx"].find(fs.existsSync)
    return dependency ? loadTypeScriptModule(dependency) : require(resolved)
  }
  compiled._compile(ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText, file)
  return compiled.exports
}
const { selectMatchingElements, updateSelectedElements } = loadTypeScriptModule(path.join(__dirname, "selection.ts"))

test("selects exact IDs across layers, including overlapping copies", () => {
  for (const tileId of ["tileSand", "bgCloud", "enMinotaur", "spriteKratos"]) {
    const first = { tileId, x: 0, y: 0, layer: 0 }
    const overlapping = { ...first, layer: 4 }
    const duplicate = { ...first }
    const variant = { ...first, tileId: `${tileId}Variant` }
    const other = { ...first, tileId: "other" }
    const elements = [first, overlapping, variant, duplicate, other]
    assert.deepEqual(selectMatchingElements(elements, first, "tileId"), [first, overlapping, duplicate])
  }
})

test("moves all selected copies to a layer without replacing destination elements", () => {
  const first = { tileId: "bgCloud", x: 0, y: 0, layer: 1, locked: true, creationCode: "init()" }
  const second = { ...first, x: 48, y: 32, layer: 4, locked: false, creationCode: null }
  const destination = { tileId: "tileSand", x: 48, y: 32, layer: 1 }
  const elements = [first, second, destination]
  // Choosing the reference element's existing layer must still move the others.
  const result = updateSelectedElements(elements, [first, second], first, { layer: 1 })
  assert.deepEqual(result.elements, [first, { ...second, layer: 1 }, destination])
  assert.equal(result.elements[2], destination)
  assert.deepEqual(elements, [first, second, destination])
  assert.equal(second.layer, 4)
  assert.equal(result.selection[0], result.elements[0])
  assert.equal(result.selection[1], result.elements[1])
})

test("moving a group preserves distances and properties across successive edits", () => {
  const first = { tileId: "bgPyramid", x: 32, y: 16, layer: 0 }
  const second = { ...first, x: 320, y: -16, layer: 2 }
  const other = { tileId: "bgCloud", x: 0, y: 0, layer: 0 }
  const moved = updateSelectedElements([first, second, other], [first, second], first, { x: -16 })
  assert.deepEqual(moved.elements, [{ ...first, x: -16 }, { ...second, x: 272 }, other])
  const next = updateSelectedElements(moved.elements, moved.selection, moved.selection[0], { y: 64 })
  assert.deepEqual(next.elements, [{ ...first, x: -16, y: 64 }, { ...second, x: 272, y: 32 }, other])
  assert.equal(next.elements[2], other)
})

test("applies a shared property even when the reference already has that value", () => {
  const first = { tileId: "obLifeChest", x: 0, y: 0, locked: false, layer: 1 }
  const second = { ...first, x: 16, locked: true, layer: 3 }
  const result = updateSelectedElements([first, second], [first, second], first, { locked: false })
  assert.deepEqual(result.elements, [first, { ...second, locked: false }])
  assert.equal(result.elements[1].layer, 3)
})

test("collider changes preserve individual dimensions and do not expand selection", () => {
  const first = { type: "ground", x: 0, y: 0, width: 16, height: 32 }
  const second = { ...first, x: 32, width: 128 }
  const other = { ...first, type: "door", y: 64 }
  const elements = [first, second, other]
  const selected = selectMatchingElements(elements, first, "type")
  const result = updateSelectedElements(elements, selected, first, { type: "door" })
  assert.deepEqual(result.elements, [{ ...first, type: "door" }, { ...second, type: "door" }, other])
  assert.equal(result.selection.length, 2)
  assert.equal(result.elements[2], other)
  const resized = updateSelectedElements(result.elements, result.selection, result.selection[0], { width: 64 })
  assert.deepEqual(resized.elements.map((element) => element.width), [64, 64, 16])
})

test("selects markers by name and renames only the original selection", () => {
  const first = { name: "spawn", x: 0, y: 0 }
  const second = { name: "spawn", x: 64, y: 32 }
  const other = { name: "exit", x: 128, y: 0 }
  const elements = [first, second, other]
  const selected = selectMatchingElements(elements, first, "name")
  assert.deepEqual(selected, [first, second])
  const result = updateSelectedElements(elements, selected, first, { name: "exit" })
  assert.deepEqual(result.elements, [{ ...first, name: "exit" }, { ...second, name: "exit" }, other])
  assert.equal(result.selection.length, 2)
})

test("single-element editing stays isolated; stale selections cannot modify a restored map", () => {
  const first = { tileId: "bgCloud", x: 0, y: 0, layer: 0 }
  const second = { ...first, x: 48 }
  const result = updateSelectedElements([first, second], [first], first, { layer: 3 })
  assert.equal(result.elements[1], second)
  const restored = updateSelectedElements([first, second], result.selection, result.selection[0], { layer: 4 })
  assert.deepEqual(restored.elements, [first, second])
  assert.deepEqual(restored.selection, [])
})

test("the properties panel reports mixed layers and edits only the chosen property", () => {
  const { PropertiesPanel } = loadTypeScriptModule(path.join(__dirname, "properties-panel.tsx"))
  const { renderToStaticMarkup } = require("react-dom/server")
  const first = { tileId: "bgCloud", x: 0, y: 0, layer: 0, locked: false }
  const second = { ...first, x: 48, layer: 4, locked: true }
  let changes
  let selectMatchingCalls = 0
  const tree = PropertiesPanel({
    selectedTiles: [first, second], selectedColliders: [], selectedMarkers: [],
    onSelectMatching: () => selectMatchingCalls++,
    onClearSelection: () => {}, onDeleteSelection: () => {},
    onUpdateTile: (value) => { changes = value },
    onUpdateCollider: () => {}, onUpdateMarker: () => {},
  })
  const markup = renderToStaticMarkup(tree)
  assert.match(markup, /2 elementos selecionados/)
  assert.match(markup, /Várias camadas/)
  assert.match(markup, /Vários valores/)
  const nodes = []
  function visit(node) {
    if (!node || typeof node !== "object") return
    if (Array.isArray(node)) return node.forEach(visit)
    nodes.push(node)
    visit(node.props?.children)
  }
  visit(tree)
  nodes.find((node) => node.props?.["aria-label"] === "Camada da seleção").props.onChange({ target: { value: "0" } })
  assert.deepEqual(changes, { layer: 0 })
  nodes.find((node) => node.props?.onClick && node.props.children?.includes?.("Selecionar todos os iguais")).props.onClick()
  assert.equal(selectMatchingCalls, 1)
})
