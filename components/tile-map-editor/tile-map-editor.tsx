"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type {
  Tool,
  PlacedTile,
  Collider,
  Marker,
  TextureAtlas,
  ProjectDocument,
  ObjectAlignment,
  ElementResource,
  ImageResource,
  Tileset,
  Camera,
  CanvasSize,
} from "./types"
import { GRID_SIZE, LAYER_COUNT } from "./types"
import { MenuBar } from "./menu-bar"
import { ToolsSidebar } from "./tools-sidebar"
import { LayersPanel } from "./layers-panel"
import { TilemapsPanel } from "./tilemaps-panel"
import { ObjectAlignmentPanel } from "./object-alignment-panel"
import { TilePalette } from "./tile-palette"
import { EditorCanvas } from "./editor-canvas"
import { PropertiesPanel } from "./properties-panel"
import type { EditorState } from "./use-history"
import { useHistory } from "./use-history"
import { normalizeBackgroundColor } from "@/lib/utils"
import { selectMatchingElements, updateSelectedElements } from "./selection"
import { createSpatialIndex } from "./selection-index"
import { addElementDefinition, addTileset, createCatalog, createTilemap, deleteTilemap, DEFAULT_CANVAS_SIZE, DEFAULT_OBJECT_ALIGNMENT, defaultProject, editorContent, emptyProject, exportLegacy, importLegacy, moveElements, newId, paintTile, eraseTile, parseProject, referenceKey, renameTilemap, replaceEditorContent, resolveInstance, setTilemapLayer, setTilemapVisibility, snapToTilemap, updateAnnotationAlignment, updateCanvasSize, updateObjectAlignment, updateTilemapGrid, type GridChangePolicy, type TilemapGrid } from "./project"
import { loadImage, loadProjectImages, pickJsonFile, portableProject, saveJson } from "./project-files"
import { loadAutosave, saveAutosave } from "./autosave"

// Default atlas and spritesheet paths
const DEFAULT_ATLAS_URL = "/atlas/texture.json"
const DEFAULT_SPRITESHEET_URL = "/atlas/texture.png"

export function TileMapEditor() {
  const [ready, setReady] = useState(false)
  const [images, setImages] = useState<Map<string, HTMLImageElement>>(new Map())
  const defaultsRef = useRef<ProjectDocument | null>(null)
  const [fileBusy, setFileBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [activeTool, setActiveTool] = useState<Tool>("place")
  const [selectedTileId, setSelectedTileId] = useState<string | null>(null)
  const [tileSelection, setTileSelection] = useState<PlacedTile[]>([])
  const [colliderSelection, setColliderSelection] = useState<Collider[]>([])
  const [markerSelection, setMarkerSelection] = useState<Marker[]>([])
  const [camera, setCamera] = useState<Camera>({ x: 0, y: 0, zoom: 1 })
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showColliders, setShowColliders] = useState(true)
  const [showMarkers, setShowMarkers] = useState(true)
  const [activeLayer, setActiveLayer] = useState(0)
  const [activeTilemapId, setActiveTilemapId] = useState("tilemap:default")
  const [hiddenLayers, setHiddenLayers] = useState<number[]>([])
  const containerRef = useRef<HTMLDivElement>(null)

  const mapFileNameRef = useRef("map.json")

  // History management
  const {
    state: project,
    pushState: pushProject,
    startBatch,
    endBatch,
    undo,
    redo,
    canUndo,
    canRedo,
    reset: resetHistory,
  } = useHistory(emptyProject())
  const historyState = useMemo(() => editorContent(project), [project])
  const activeTilemap = project.tilemaps.find((map) => map.id === activeTilemapId) ?? project.tilemaps[0]
  const catalog = useMemo(() => createCatalog(project), [project.images, project.tilesets, project.elementDefinitions])
  const backgroundColor = project.scene.backgroundColor
  const canvasSize = project.scene.canvasSize ?? DEFAULT_CANVAS_SIZE
  const pushState = useCallback((content: EditorState) => {
    pushProject(replaceEditorContent(project, content))
  }, [project, pushProject])
  const setBackgroundColor = useCallback((color: string) => {
    pushProject({ ...project, scene: { ...project.scene, backgroundColor: normalizeBackgroundColor(color) } })
  }, [project, pushProject])

  // Derive tiles and colliders from history state
  const tiles = historyState.tiles
  const visibleTiles = useMemo(() => {
    const visibleMaps = new Set(project.tilemaps.filter((map) => map.visible).map((map) => map.id))
    return tiles.filter((tile) => tile.resource.kind === "element" || (tile.tilemapId !== undefined && visibleMaps.has(tile.tilemapId)))
  }, [tiles, project.tilemaps])
  const selectableTiles = useMemo(() => visibleTiles.filter((tile) =>
    tile.resource.kind === "element" || tile.tilemapId === activeTilemap.id
  ), [visibleTiles, activeTilemap.id])
  const hitTestTiles = useMemo(() => createSpatialIndex(selectableTiles, (tile) => {
    const crop = resolveInstance(tile, catalog)?.crop
    return { x: tile.x, y: tile.y, width: crop?.width ?? GRID_SIZE, height: crop?.height ?? GRID_SIZE }
  }), [selectableTiles, catalog])
  const colliders = historyState.colliders
  const markers = historyState.markers
  // Only use references still present in the current history state.
  const selectedTiles = useMemo<PlacedTile[]>(() => {
    const current = new Map<string, PlacedTile>(tiles.map((tile) => [tile.id, tile]))
    return tileSelection.map((tile) => tile.id ? current.get(tile.id) : undefined).filter((tile): tile is PlacedTile => !!tile)
  }, [tiles, tileSelection])
  const selectedColliders = useMemo(() => {
    const current = new Set(colliders)
    return colliderSelection.filter((collider) => current.has(collider))
  }, [colliders, colliderSelection])
  const selectedMarkers = useMemo(() => {
    const current = new Set(markers)
    return markerSelection.filter((marker) => current.has(marker))
  }, [markers, markerSelection])
  const selectedPlacedTile = selectedTiles[0] ?? null
  const selectedCollider = selectedColliders[0] ?? null
  const selectedMarker = selectedMarkers[0] ?? null

  const clearSelection = useCallback(() => {
    setTileSelection([])
    setColliderSelection([])
    setMarkerSelection([])
  }, [])

  const handleCanvasSizeChange = useCallback((size: CanvasSize) => {
    pushProject((current) => updateCanvasSize(current, size))
    clearSelection()
  }, [pushProject, clearSelection])

  const handleUndo = useCallback(() => {
    clearSelection()
    undo()
  }, [clearSelection, undo])

  const handleRedo = useCallback(() => {
    clearSelection()
    redo()
  }, [clearSelection, redo])

  const handleSelectMatching = useCallback(() => {
    setActiveTool("select")
    if (selectedPlacedTile) {
      setTileSelection(selectMatchingElements(selectableTiles, selectedPlacedTile, "tileId"))
    } else if (selectedCollider) {
      setColliderSelection(selectMatchingElements(colliders, selectedCollider, "type"))
    } else if (selectedMarker) {
      setMarkerSelection(selectMatchingElements(markers, selectedMarker, "name"))
    }
  }, [selectableTiles, colliders, markers, selectedPlacedTile, selectedCollider, selectedMarker])

  const handleDeleteSelection = useCallback(() => {
    if (!selectedTiles.length && !selectedColliders.length && !selectedMarkers.length) return
    const tileSet = new Set(selectedTiles)
    const colliderSet = new Set(selectedColliders)
    const markerSet = new Set(selectedMarkers)
    pushState({
      tiles: tiles.filter((tile) => !tileSet.has(tile)),
      colliders: colliders.filter((collider) => !colliderSet.has(collider)),
      markers: markers.filter((marker) => !markerSet.has(marker)),
    })
    clearSelection()
  }, [tiles, colliders, markers, selectedTiles, selectedColliders, selectedMarkers, pushState, clearSelection])

  // Load the default atlas and spritesheet, then start with a blank map
  useEffect(() => {
    let cancelled = false

    async function loadDefaults() {
      try {
        const atlasRes = await fetch(DEFAULT_ATLAS_URL)
        if (!atlasRes.ok) throw new Error("Failed to load atlas")
        const loadedAtlas: TextureAtlas = await atlasRes.json()

        const img = await loadImage(DEFAULT_SPRITESHEET_URL)
        const defaults = defaultProject(loadedAtlas, img.naturalWidth, img.naturalHeight)
        const defaultsCache = await loadProjectImages(defaults.images)
        for (const resource of defaults.images) {
          const decoded = defaultsCache.get(resource.id)!
          resource.width = decoded.naturalWidth
          resource.height = decoded.naturalHeight
        }
        let initial = defaults
        let cache = defaultsCache
        try {
          const recovered = await loadAutosave()
          if (recovered) {
            const recoveredImages = await loadProjectImages(recovered.images)
            if (recovered.images.some((resource) => {
              const decoded = recoveredImages.get(resource.id)!
              return resource.width !== decoded.naturalWidth || resource.height !== decoded.naturalHeight
            })) throw new Error("Dimensões de imagem inválidas no salvamento automático.")
            initial = recovered
            cache = recoveredImages
            setMessage("Projeto recuperado do salvamento automático.")
          }
        } catch (error) {
          console.error("Erro ao recuperar salvamento automático:", error)
          setMessage("Não foi possível recuperar o salvamento automático; o editor abriu um projeto vazio.")
        }
        if (cancelled) return
        defaultsRef.current = defaults
        setImages(cache)
        resetHistory(initial)
        setActiveTilemapId(initial.tilemaps[0].id)
        setSelectedTileId(createCatalog(initial).keys().next().value ?? null)
        setReady(true)
      } catch (err) {
        if (cancelled) return
        console.error("Error loading defaults:", err)
        setLoadError("Erro ao carregar atlas/spritesheet padrao")
      }
    }

    loadDefaults()
    return () => {
      cancelled = true
    }
  }, [resetHistory])

  useEffect(() => {
    if (!ready) return
    let cancelled = false
    const timer = window.setTimeout(async () => {
      try {
        const portable = await portableProject(project)
        if (!cancelled) await saveAutosave(portable)
      } catch (error) {
        if (!cancelled) {
          console.error("Erro no salvamento automático:", error)
          setMessage("Salvamento automático indisponível. Use “Salvar projeto” para guardar as alterações.")
        }
      }
    }, 1500)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [project, ready])

  const handlePlaceTile = useCallback((worldX: number, worldY: number) => {
    if (worldX < 0 || worldY < 0 || worldX >= canvasSize.width || worldY >= canvasSize.height) return
    const entry = selectedTileId ? catalog.get(selectedTileId) : undefined
    if (!entry) return
    const alignment = project.scene.objectAlignment ?? DEFAULT_OBJECT_ALIGNMENT
    const position = entry.resource.kind === "element"
      ? alignment.enabled ? snapToTilemap(worldX, worldY, alignment) : { x: Math.round(worldX), y: Math.round(worldY) }
      : snapToTilemap(worldX, worldY, activeTilemap)
    if (position.x < 0 || position.y < 0 || position.x + entry.crop.width > canvasSize.width || position.y + entry.crop.height > canvasSize.height) return
    pushProject((current) => paintTile(current, entry, worldX, worldY, activeLayer, activeTilemap.id))
  }, [selectedTileId, catalog, activeLayer, activeTilemap, pushProject, canvasSize, project.scene.objectAlignment])

  const handleEraseTile = useCallback((worldX: number, worldY: number) => {
    pushProject((current) => eraseTile(current, worldX, worldY, activeLayer, activeTilemap.id))
  }, [activeLayer, activeTilemap.id, pushProject])

  const handleMoveLayerElements = useCallback(
    (sourceLayer: number, targetLayer: number) => {
      if (
        sourceLayer === targetLayer ||
        !Number.isInteger(sourceLayer) ||
        !Number.isInteger(targetLayer) ||
        sourceLayer < 0 || sourceLayer >= LAYER_COUNT ||
        targetLayer < 0 || targetLayer >= LAYER_COUNT ||
        !tiles.some((tile) => (tile.resource.kind === "element" || tile.tilemapId === activeTilemap.id) && (tile.layer ?? 0) === sourceLayer)
      ) return

      const newTiles = tiles.map((tile) =>
        (tile.resource.kind === "element" || tile.tilemapId === activeTilemap.id) && (tile.layer ?? 0) === sourceLayer ? { ...tile, layer: targetLayer } : tile
      )
      pushState({ tiles: newTiles, colliders, markers })
      // Clear the moved selection so undo cannot leave stale tile properties.
      clearSelection()
      setActiveLayer(targetLayer)
      setHiddenLayers((current) => current.filter((layer) => layer !== targetLayer))
    },
    [tiles, colliders, markers, activeTilemap.id, pushState, clearSelection]
  )

  const handleSelectTile = useCallback(
    (worldX: number, worldY: number) => {
      const candidates = hitTestTiles(worldX, worldY).filter((tile) => !hiddenLayers.includes(tile.layer ?? 0))
      const found =
        [...candidates].reverse().find((t) => (t.layer ?? 0) === activeLayer) ??
        candidates.reduce<PlacedTile | undefined>(
          (top, t) => (!top || (t.layer ?? 0) >= (top.layer ?? 0) ? t : top),
          undefined
        )
      if (!found || !selectedTiles.includes(found)) setTileSelection(found ? [found] : [])
      setColliderSelection([])
      setMarkerSelection([])
      return found ?? null
    },
    [hitTestTiles, activeLayer, hiddenLayers, selectedTiles]
  )

  const handleMoveElements = useCallback((origins: { id: string; x: number; y: number }[], dx: number, dy: number) => {
    if (origins.some((origin) => {
      const tile = project.elements.find((element) => element.id === origin.id)
      const crop = tile && resolveInstance(tile, catalog)?.crop
      return origin.x + dx < 0 || origin.y + dy < 0 || origin.x + dx + (crop?.width ?? GRID_SIZE) > canvasSize.width || origin.y + dy + (crop?.height ?? GRID_SIZE) > canvasSize.height
    })) return
    pushProject((current) => moveElements(current, origins, dx, dy))
  }, [pushProject, project.elements, catalog, canvasSize])

  const handleSelectCollider = useCallback(
    (worldX: number, worldY: number) => {
      const found = colliders.find(
        (c) =>
          worldX >= c.x &&
          worldX < c.x + c.width &&
          worldY >= c.y &&
          worldY < c.y + c.height
      )
      if (found) {
        setColliderSelection([found])
        setTileSelection([])
        setMarkerSelection([])
      }
    },
    [colliders]
  )

  const handleAddCollider = useCallback(
    (collider: Collider) => {
      if (collider.x < 0 || collider.y < 0 || collider.x + collider.width > canvasSize.width || collider.y + collider.height > canvasSize.height) return
      pushState({ tiles, colliders: [...colliders, collider], markers })
    },
    [tiles, colliders, markers, pushState, canvasSize]
  )

  const handleDeleteCollider = useCallback(
    (collider: Collider) => {
      pushState({
        tiles,
        colliders: colliders.filter((c) => c !== collider),
        markers,
      })
      setColliderSelection((current) => current.filter((item) => item !== collider))
    },
    [tiles, colliders, markers, pushState]
  )

  const handleUpdateCollider = useCallback(
    (changes: Partial<Collider>) => {
      if (!selectedCollider) return
      const result = updateSelectedElements(colliders, selectedColliders, selectedCollider, changes)
      pushState({ tiles, colliders: result.elements, markers })
      setColliderSelection(result.selection)
    },
    [tiles, colliders, markers, selectedCollider, selectedColliders, pushState]
  )

  const handlePlaceMarker = useCallback(
    (worldX: number, worldY: number) => {
      const alignment = project.scene.annotationAlignment ?? DEFAULT_OBJECT_ALIGNMENT
      const { x, y } = alignment.enabled
        ? snapToTilemap(worldX, worldY, alignment)
        : { x: Math.round(worldX), y: Math.round(worldY) }
      if (x < 0 || y < 0 || x >= canvasSize.width || y >= canvasSize.height) return
      let n = markers.length + 1
      while (markers.some((m) => m.name === `marker${n}`)) n++
      const marker: Marker = { name: `marker${n}`, x, y }
      pushState({ tiles, colliders, markers: [...markers, marker] })
      setMarkerSelection([marker])
      setTileSelection([])
      setColliderSelection([])
    },
    [project.scene.annotationAlignment, tiles, colliders, markers, pushState, canvasSize]
  )

  const handleSelectMarker = useCallback((marker: Marker) => {
    setMarkerSelection([marker])
    setTileSelection([])
    setColliderSelection([])
  }, [])

  const handleUpdateMarker = useCallback(
    (changes: Partial<Marker>) => {
      if (!selectedMarker) return
      const result = updateSelectedElements(markers, selectedMarkers, selectedMarker, changes)
      pushState({ tiles, colliders, markers: result.elements })
      setMarkerSelection(result.selection)
    },
    [tiles, colliders, markers, selectedMarker, selectedMarkers, pushState]
  )

  const handleDeleteMarker = useCallback(
    (marker: Marker) => {
      pushState({ tiles, colliders, markers: markers.filter((m) => m !== marker) })
      setMarkerSelection((current) => current.filter((item) => item !== marker))
    },
    [tiles, colliders, markers, pushState]
  )

  const handleResetView = useCallback(() => {
    setCamera({ x: 0, y: 0, zoom: 1 })
  }, [])

  const handleClearAll = useCallback(() => {
    if (window.confirm("Tem certeza que deseja limpar tudo? Esta acao nao pode ser desfeita.")) {
      resetHistory({ ...project, tilemaps: project.tilemaps.map((map) => ({ ...map, tiles: [] })), elements: [], colliders: [], markers: [] })
      clearSelection()
    }
  }, [project, resetHistory, clearSelection])

  const handleImportMap = useCallback(async () => {
    setFileBusy(true)
    setMessage(null)
    try {
      const file = await pickJsonFile()
      if (file && defaultsRef.current) {
        const json = JSON.parse(await file.text())
        const next = json.format !== undefined || json.version !== undefined
          ? parseProject(json)
          : importLegacy(json, defaultsRef.current)
        const cache = await loadProjectImages(next.images)
        for (const resource of next.images) {
          const decoded = cache.get(resource.id)!
          if (resource.width !== decoded.naturalWidth || resource.height !== decoded.naturalHeight) throw new Error(`Dimensões incorretas na imagem ${resource.name}.`)
        }
        resetHistory(next)
        setImages(cache)
        clearSelection()
        setHiddenLayers([])
        setActiveLayer(0)
        setActiveTilemapId(next.tilemaps[0].id)
        setCamera({ x: 0, y: 0, zoom: 1 })
        setSelectedTileId(createCatalog(next).keys().next().value ?? null)
        mapFileNameRef.current = file.name
        const missing = editorContent(next).tiles.filter((tile) => tile.resource.kind === "missing").length
        setMessage(missing ? `${missing} instância(s) sem imagem conhecida foram preservadas e aparecem com contorno amarelo.` : "Projeto aberto.")
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Erro ao importar o arquivo JSON.")
    } finally {
      setFileBusy(false)
    }
  }, [resetHistory, clearSelection])

  const handleAddTileset = useCallback((image: ImageResource, set: Tileset, decoded: HTMLImageElement) => {
    pushProject(addTileset(project, image, set))
    setImages((cache) => new Map(cache).set(image.id, decoded))
    setSelectedTileId(referenceKey({ kind: "tile", tilesetId: set.id, cropId: set.crops[0].id }))
    clearSelection()
    setActiveTool("place")
    setActiveLayer(0)
  }, [project, pushProject, clearSelection])

  const handleAddElement = useCallback((definition: ElementResource, image?: ImageResource, decoded?: HTMLImageElement) => {
    pushProject((current) => addElementDefinition(current, definition, image))
    if (image && decoded) setImages((cache) => new Map(cache).set(image.id, decoded))
    setSelectedTileId(referenceKey({ kind: "element", definitionId: definition.id }))
    setActiveLayer(1)
    setActiveTool("place")
    clearSelection()
  }, [pushProject, clearSelection])

  const handleCreateTilemap = useCallback(() => {
    const id = newId("tilemap")
    pushProject((current) => createTilemap(current, `TileMap ${current.tilemaps.length + 1}`, id))
    setActiveTilemapId(id)
    clearSelection()
  }, [pushProject, clearSelection])

  const handleDeleteTilemap = useCallback((id: string) => {
    if (project.tilemaps.length <= 1 || !project.tilemaps.some((map) => map.id === id)) return
    const remaining = project.tilemaps.filter((map) => map.id !== id)
    pushProject((current) => deleteTilemap(current, id))
    if (activeTilemap.id === id) setActiveTilemapId((remaining.find((map) => map.visible) ?? remaining[0]).id)
    clearSelection()
  }, [project.tilemaps, activeTilemap.id, pushProject, clearSelection])

  const handleSelectTilemap = useCallback((id: string) => {
    setActiveTilemapId(id)
    clearSelection()
  }, [clearSelection])

  const handleRenameTilemap = useCallback((id: string, name: string) => {
    pushProject((current) => renameTilemap(current, id, name))
  }, [pushProject])

  const handleTilemapVisibility = useCallback((id: string, visible: boolean) => {
    pushProject((current) => setTilemapVisibility(current, id, visible))
    if (visible) setActiveTilemapId(id)
    else if (activeTilemap.id === id) {
      setActiveTilemapId(project.tilemaps.find((map) => map.id !== id && map.visible)?.id ?? id)
    }
    clearSelection()
  }, [pushProject, activeTilemap.id, project.tilemaps, clearSelection])

  const handleConfigureTilemap = useCallback((id: string, grid: TilemapGrid, policy: GridChangePolicy) => {
    pushProject((current) => updateTilemapGrid(current, id, grid, policy))
    clearSelection()
  }, [pushProject, clearSelection])

  const handleTilemapLayer = useCallback((id: string, layer: number) => {
    pushProject((current) => setTilemapLayer(current, id, layer))
  }, [pushProject])

  const handleObjectAlignment = useCallback((alignment: ObjectAlignment) => {
    pushProject((current) => updateObjectAlignment(current, alignment))
  }, [pushProject])

  const handleAnnotationAlignment = useCallback((alignment: ObjectAlignment) => {
    pushProject((current) => updateAnnotationAlignment(current, alignment))
  }, [pushProject])

  const handleSaveProject = useCallback(async () => {
    setFileBusy(true)
    setMessage(null)
    try {
      const portable = await portableProject(project)
      const saved = await saveJson(portable, mapFileNameRef.current.replace(/(?:\.project)?\.json$/i, "") + ".project.json")
      if (saved) setMessage("Projeto salvo com imagens incorporadas.")
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Erro ao salvar projeto.")
    } finally {
      setFileBusy(false)
    }
  }, [project])

  const handleToggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen()
    } else {
      document.exitFullscreen()
    }
  }, [])

  // Listen for fullscreen change
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
    }
    document.addEventListener("fullscreenchange", handleFullscreenChange)
    return () =>
      document.removeEventListener("fullscreenchange", handleFullscreenChange)
  }, [])

  const handleExport = useCallback(async () => {
    setFileBusy(true)
    try {
      const saved = await saveJson(exportLegacy(project), mapFileNameRef.current.replace(/\.project\.json$/i, ".json"))
      if (saved) setMessage("Mapa exportado no formato antigo.")
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Erro ao exportar mapa.")
    } finally {
      setFileBusy(false)
    }
  }, [project])

  const handleUpdateSelectedTile = useCallback(
    (changes: Partial<PlacedTile>) => {
      if (!selectedPlacedTile) return
      const result = updateSelectedElements(tiles, selectedTiles, selectedPlacedTile, changes)
      pushState({ tiles: result.elements, colliders, markers })
      setTileSelection(result.selection)
      if (changes.layer !== undefined) {
        const targetLayer = changes.layer
        setActiveLayer(targetLayer)
        setHiddenLayers((current) => current.filter((layer) => layer !== targetLayer))
      }
    },
    [selectedPlacedTile, selectedTiles, tiles, colliders, markers, pushState]
  )

  // Handle batch operations for continuous painting/erasing
  const handleStartBatch = useCallback(() => {
    startBatch()
  }, [startBatch])

  const handleEndBatch = useCallback(() => {
    endBatch()
  }, [endBatch])

  // Keyboard shortcuts - must be before conditional return
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLSelectElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target instanceof HTMLElement && e.target.isContentEditable)
      )
        return

      // Undo/Redo shortcuts
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault()
        handleUndo()
        return
      }
      if (
        (e.ctrlKey || e.metaKey) &&
        (e.key === "y" || (e.key === "z" && e.shiftKey))
      ) {
        e.preventDefault()
        handleRedo()
        return
      }

      const key = e.key.toLowerCase()
      if (key === "escape") {
        clearSelection()
        return
      }
      if (key === "delete" || key === "backspace") {
        e.preventDefault()
        handleDeleteSelection()
        return
      }
      if (key === "d") setActiveTool("drag")
      else if (key === "p") setActiveTool("place")
      else if (key === "e") setActiveTool("erase")
      else if (key === "s") setActiveTool("select")
      else if (key === "c") setActiveTool("collider")
      else if (key === "m") setActiveTool("marker")
      else if (key === "f") handleToggleFullscreen()
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [handleToggleFullscreen, handleUndo, handleRedo, clearSelection, handleDeleteSelection])

  if (!ready) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[#1a1a2e] text-sm text-[#8888aa]">
        {loadError ? (
          <span className="text-red-400">{loadError}</span>
        ) : (
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#4a90d9] border-t-transparent" />
            Carregando...
          </div>
        )}
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="flex h-screen w-screen flex-col overflow-hidden bg-[#1a1a2e] text-[#e0e0e0]"
    >
      <MenuBar
        camera={camera}
        isFullscreen={isFullscreen}
        canUndo={canUndo}
        canRedo={canRedo}
        showColliders={showColliders}
        onShowCollidersChange={setShowColliders}
        showMarkers={showMarkers}
        onShowMarkersChange={setShowMarkers}
        backgroundColor={backgroundColor}
        onBackgroundColorChange={setBackgroundColor}
        canvasSize={canvasSize}
        onCanvasSizeChange={handleCanvasSizeChange}
        fileBusy={fileBusy}
        onSaveProject={handleSaveProject}
        onImportMap={handleImportMap}
        onExport={handleExport}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onClearAll={handleClearAll}
        onResetView={handleResetView}
        onToggleFullscreen={handleToggleFullscreen}
      />
      {(message || fileBusy) && (
        <div role="status" className="flex items-center justify-between border-b border-[#2a2a4a] bg-[#16213e] px-3 py-2 text-xs text-[#e0e0e0]">
          <span>{fileBusy ? "Processando arquivo…" : message}</span>
          {!fileBusy && <button aria-label="Fechar aviso" onClick={() => setMessage(null)}>×</button>}
        </div>
      )}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <ToolsSidebar activeTool={activeTool} onToolChange={setActiveTool} />
        <TilePalette
          project={project}
          catalog={catalog}
          images={images}
          onAddTileset={handleAddTileset}
          onAddElement={handleAddElement}
          selectedTileId={selectedTileId}
          onSelectTile={(id) => {
            clearSelection()
            setSelectedTileId(id)
            setActiveLayer(catalog.get(id)?.resource.kind === "element" ? 1 : 0)
            setActiveTool("place")
          }}
        />
        <EditorCanvas
          tilemap={activeTilemap}
          tilemaps={project.tilemaps}
          annotationAlignment={project.scene.annotationAlignment ?? DEFAULT_OBJECT_ALIGNMENT}
          catalog={catalog}
          images={images}
          tiles={visibleTiles}
          colliders={colliders}
          markers={markers}
          showMarkers={showMarkers}
          selectedMarkers={selectedMarkers}
          selectedTiles={selectedTiles.filter((tile) => visibleTiles.includes(tile as typeof tiles[number]))}
          onPlaceMarker={handlePlaceMarker}
          onSelectMarker={handleSelectMarker}
          onDeleteMarker={handleDeleteMarker}
          showColliders={showColliders}
          hiddenLayers={hiddenLayers}
          activeTool={activeTool}
          camera={camera}
          selectedTileId={selectedTileId}
          selectedColliders={selectedColliders}
          backgroundColor={backgroundColor}
          canvasSize={canvasSize}
          onCameraChange={setCamera}
          onPlaceTile={handlePlaceTile}
          onEraseTile={handleEraseTile}
          onSelectTile={handleSelectTile}
          onMoveElements={handleMoveElements}
          onSelectCollider={handleSelectCollider}
          onAddCollider={handleAddCollider}
          onDeleteCollider={handleDeleteCollider}
          onStartBatch={handleStartBatch}
          onEndBatch={handleEndBatch}
        />
        <div className="flex w-56 shrink-0 flex-col overflow-y-auto [&>*:last-child]:flex-1">
          <TilemapsPanel
            tilemaps={project.tilemaps}
            activeId={activeTilemap.id}
            onCreate={handleCreateTilemap}
            onDelete={handleDeleteTilemap}
            onSelect={handleSelectTilemap}
            onRename={handleRenameTilemap}
            onVisibility={handleTilemapVisibility}
            onConfigure={handleConfigureTilemap}
            onLayerChange={handleTilemapLayer}
          />
          <ObjectAlignmentPanel alignment={project.scene.objectAlignment ?? DEFAULT_OBJECT_ALIGNMENT} onChange={handleObjectAlignment} />
          <ObjectAlignmentPanel alignment={project.scene.annotationAlignment ?? DEFAULT_OBJECT_ALIGNMENT} onChange={handleAnnotationAlignment} title="Marcadores e colliders" buttonLabel="Grade de marcações…" description="Define a grade para novos marcadores e colliders. Os já existentes mantêm suas posições e tamanhos." />
          <LayersPanel
            activeLayer={activeLayer}
            hiddenLayers={hiddenLayers}
            activeLayerElementCount={tiles.filter((tile) => (tile.resource.kind === "element" || tile.tilemapId === activeTilemap.id) && (tile.layer ?? 0) === activeLayer).length}
            onActiveLayerChange={setActiveLayer}
            onMoveLayerElements={handleMoveLayerElements}
            onToggleLayerVisibility={(layer) =>
              setHiddenLayers((prev) =>
                prev.includes(layer) ? prev.filter((l) => l !== layer) : [...prev, layer]
              )
            }
          />
          <PropertiesPanel
            selectedTiles={selectedTiles}
            selectedColliders={selectedColliders}
            selectedMarkers={selectedMarkers}
            onSelectMatching={handleSelectMatching}
            onClearSelection={clearSelection}
            onDeleteSelection={handleDeleteSelection}
            onUpdateMarker={handleUpdateMarker}
            onUpdateTile={handleUpdateSelectedTile}
            onUpdateCollider={handleUpdateCollider}
          />
        </div>
      </div>
    </div>
  )
}
