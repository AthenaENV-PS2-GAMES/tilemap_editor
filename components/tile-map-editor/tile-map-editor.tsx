"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type {
  Tool,
  PlacedTile,
  Collider,
  Marker,
  TextureAtlas,
  Camera,
} from "./types"
import { GRID_SIZE, LAYER_COUNT, defaultLayerFor, isEntityId, normalizeLayer, normalizeTileId } from "./types"
import { MenuBar } from "./menu-bar"
import { ToolsSidebar } from "./tools-sidebar"
import { LayersPanel } from "./layers-panel"
import { TilePalette } from "./tile-palette"
import { EditorCanvas } from "./editor-canvas"
import { PropertiesPanel } from "./properties-panel"
import { useHistory } from "./use-history"
import { normalizeBackgroundColor } from "@/lib/utils"
import { selectMatchingElements, updateSelectedElements } from "./selection"
import { getTileSize } from "./tile-size"

// Default atlas and spritesheet paths
const DEFAULT_ATLAS_URL = "/atlas/texture.json"
const DEFAULT_SPRITESHEET_URL = "/atlas/texture.png"

export function TileMapEditor() {
  const [atlas, setAtlas] = useState<TextureAtlas | null>(null)
  const [spritesheet, setSpritesheet] = useState<HTMLImageElement | null>(null)
  const [activeTool, setActiveTool] = useState<Tool>("place")
  const [selectedTileId, setSelectedTileId] = useState<string | null>(null)
  const [tileSelection, setTileSelection] = useState<PlacedTile[]>([])
  const [colliderSelection, setColliderSelection] = useState<Collider[]>([])
  const [markerSelection, setMarkerSelection] = useState<Marker[]>([])
  const [camera, setCamera] = useState<Camera>({ x: 0, y: 0, zoom: 1 })
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [backgroundColor, setBackgroundColor] = useState("#1a1a2e")
  const [showColliders, setShowColliders] = useState(true)
  const [showMarkers, setShowMarkers] = useState(true)
  const [activeLayer, setActiveLayer] = useState(0)
  const [hiddenLayers, setHiddenLayers] = useState<number[]>([])
  const containerRef = useRef<HTMLDivElement>(null)

  const mapFileNameRef = useRef("map.json")

  // History management
  const {
    state: historyState,
    pushState,
    startBatch,
    endBatch,
    undo,
    redo,
    canUndo,
    canRedo,
    reset: resetHistory,
  } = useHistory({ tiles: [], colliders: [], markers: [] })

  // Derive tiles and colliders from history state
  const tiles = historyState.tiles
  const colliders = historyState.colliders
  const markers = historyState.markers
  // Only use references still present in the current history state.
  const selectedTiles = useMemo(() => {
    const current = new Set(tiles)
    return tileSelection.filter((tile) => current.has(tile))
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
      setTileSelection(selectMatchingElements(tiles, selectedPlacedTile, "tileId"))
    } else if (selectedCollider) {
      setColliderSelection(selectMatchingElements(colliders, selectedCollider, "type"))
    } else if (selectedMarker) {
      setMarkerSelection(selectMatchingElements(markers, selectedMarker, "name"))
    }
  }, [tiles, colliders, markers, selectedPlacedTile, selectedCollider, selectedMarker])

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

        const img = new window.Image()
        img.crossOrigin = "anonymous"
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve()
          img.onerror = () => reject(new Error("Failed to load spritesheet"))
          img.src = DEFAULT_SPRITESHEET_URL
        })

        if (cancelled) return
        setAtlas(loadedAtlas)
        setSpritesheet(img)
        const firstTile = Object.keys(loadedAtlas.frames)[0]
        if (firstTile) {
          setSelectedTileId((current) => current ?? firstTile.replace(/.png$/, ""))
        }
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
  }, [])

  const handlePlaceTile = useCallback(
    (worldX: number, worldY: number) => {
      if (!selectedTileId) return
      
      // Check if it's an entity (object, enemy, or player spawn) - these don't need to be in the atlas
      const isEntity = isEntityId(selectedTileId)
      
      // For regular tiles, check if frame exists in atlas
      if (!isEntity) {
        if (!atlas) return
        const frameName = selectedTileId + ".png"
        const frame = atlas.frames[frameName]
        if (!frame) return
      }

      const snappedX = Math.floor(worldX / GRID_SIZE) * GRID_SIZE
      const snappedY = Math.floor(worldY / GRID_SIZE) * GRID_SIZE

      const newTiles = tiles.filter(
        (t) =>
          !(t.x === snappedX && t.y === snappedY && (t.layer ?? 0) === activeLayer)
      )
      newTiles.push({
        tileId: selectedTileId,
        x: snappedX,
        y: snappedY,
        locked: false,
        layer: activeLayer,
      })
      pushState({ tiles: newTiles, colliders, markers })
    },
    [selectedTileId, atlas, tiles, colliders, markers, pushState, activeLayer]
  )

  const handleEraseTile = useCallback(
    (worldX: number, worldY: number) => {
      const snappedX = Math.floor(worldX / GRID_SIZE) * GRID_SIZE
      const snappedY = Math.floor(worldY / GRID_SIZE) * GRID_SIZE
      const newTiles = tiles.filter(
        (t) =>
          !(t.x === snappedX && t.y === snappedY && (t.layer ?? 0) === activeLayer)
      )
      if (newTiles.length !== tiles.length) {
        pushState({ tiles: newTiles, colliders, markers })
      }
    },
    [tiles, colliders, markers, pushState, activeLayer]
  )

  const handleMoveLayerElements = useCallback(
    (sourceLayer: number, targetLayer: number) => {
      if (
        sourceLayer === targetLayer ||
        !Number.isInteger(sourceLayer) ||
        !Number.isInteger(targetLayer) ||
        sourceLayer < 0 || sourceLayer >= LAYER_COUNT ||
        targetLayer < 0 || targetLayer >= LAYER_COUNT ||
        !tiles.some((tile) => (tile.layer ?? 0) === sourceLayer)
      ) return

      const newTiles = tiles.map((tile) =>
        (tile.layer ?? 0) === sourceLayer ? { ...tile, layer: targetLayer } : tile
      )
      pushState({ tiles: newTiles, colliders, markers })
      // Clear the moved selection so undo cannot leave stale tile properties.
      clearSelection()
      setActiveLayer(targetLayer)
      setHiddenLayers((current) => current.filter((layer) => layer !== targetLayer))
    },
    [tiles, colliders, markers, pushState, clearSelection]
  )

  const handleSelectTile = useCallback(
    (worldX: number, worldY: number) => {
      const candidates = tiles.filter(
        (t) => {
          const { width, height } = getTileSize(t.tileId, atlas)
          return worldX >= t.x && worldX < t.x + width &&
            worldY >= t.y && worldY < t.y + height &&
            !hiddenLayers.includes(t.layer ?? 0)
        }
      )
      const found =
        [...candidates].reverse().find((t) => (t.layer ?? 0) === activeLayer) ??
        candidates.reduce<PlacedTile | undefined>(
          (top, t) => (!top || (t.layer ?? 0) >= (top.layer ?? 0) ? t : top),
          undefined
        )
      setTileSelection(found ? [found] : [])
      setColliderSelection([])
      setMarkerSelection([])
    },
    [tiles, atlas, activeLayer, hiddenLayers]
  )

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
      pushState({ tiles, colliders: [...colliders, collider], markers })
    },
    [tiles, colliders, markers, pushState]
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
      const x = Math.floor(worldX / GRID_SIZE) * GRID_SIZE
      const y = Math.floor(worldY / GRID_SIZE) * GRID_SIZE
      let n = markers.length + 1
      while (markers.some((m) => m.name === `marker${n}`)) n++
      const marker: Marker = { name: `marker${n}`, x, y }
      pushState({ tiles, colliders, markers: [...markers, marker] })
      setMarkerSelection([marker])
      setTileSelection([])
      setColliderSelection([])
    },
    [tiles, colliders, markers, pushState]
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
      resetHistory({ tiles: [], colliders: [], markers: [] })
      clearSelection()
    }
  }, [resetHistory, clearSelection])

  const handleImportMap = useCallback(() => {
    const input = document.createElement("input")
    input.type = "file"
    input.accept = ".json"
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = (ev) => {
        try {
          const json = JSON.parse(ev.target?.result as string)
          const loadedTiles: PlacedTile[] = []
          const loadedColliders: Collider[] = []
          const loadedMarkers: Marker[] = []
          let loadedBackgroundColor = "#1a1a2e"

          if (typeof json.backgroundColor === "string") {
            loadedBackgroundColor = json.backgroundColor
          }

          if (Array.isArray(json.colliders)) {
            for (const c of json.colliders) {
              loadedColliders.push({
                x: c.x,
                y: c.y,
                width: c.width,
                height: c.height,
                type: c.type || "ground",
              })
            }
          }

          if (Array.isArray(json.markers)) {
            for (const m of json.markers) {
              loadedMarkers.push({
                name: typeof m.name === "string" ? m.name : `marker${loadedMarkers.length + 1}`,
                x: Number(m.x) || 0,
                y: Number(m.y) || 0,
              })
            }
          }

          const tilesObj = json.tiles as Record<string, unknown> | undefined
          if (tilesObj && typeof tilesObj === "object") {
            for (const [tileId, tileArray] of Object.entries(tilesObj)) {
              if (Array.isArray(tileArray)) {
                for (const t of tileArray) {
                  loadedTiles.push({
                    tileId,
                    x: t.x,
                    y: t.y,
                    locked: t.locked ?? false,
                    layer:
                      t.layer === undefined
                        ? defaultLayerFor(tileId)
                        : normalizeLayer(t.layer),
                    creationCode: t.creationCode ?? null,
                  })
                }
              }
            }
          }

          resetHistory({ tiles: loadedTiles, colliders: loadedColliders, markers: loadedMarkers })
          clearSelection()
          setBackgroundColor(normalizeBackgroundColor(loadedBackgroundColor))
          mapFileNameRef.current = file.name
        } catch {
          alert("Erro ao importar o arquivo JSON.")
        }
      }
      reader.readAsText(file)
    }
    input.click()
  }, [resetHistory, clearSelection])

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

  const handleExport = useCallback(() => {
    // Build tiles grouped by tileId
    const tilesData: Record<string, unknown[]> = {}
    for (const tile of tiles) {
      const tileId = normalizeTileId(tile.tileId)
      if (!tilesData[tileId]) {
        tilesData[tileId] = []
      }
      const entry: Record<string, unknown> = {
        x: tile.x,
        y: tile.y,
      }
      if (tile.creationCode !== undefined) {
        entry.creationCode = tile.creationCode
      }
      entry.locked = tile.locked ?? false
      entry.layer = tile.layer ?? 0
      ;(tilesData[tileId] as unknown[]).push(entry)
    }

    // Build final map data with new structure
    const mapData: Record<string, unknown> = {
      backgroundColor,
      tiles: tilesData,
      colliders: colliders.map((c) => ({
        x: c.x,
        y: c.y,
        width: c.width,
        height: c.height,
        type: c.type,
      })),
      markers: markers.map((m) => ({ name: m.name, x: m.x, y: m.y })),
    }

    const blob = new Blob([JSON.stringify(mapData, null, 2)], {
      type: "application/json",
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = mapFileNameRef.current
    a.click()
    URL.revokeObjectURL(url)
  }, [tiles, colliders, markers, backgroundColor])

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

  if (!atlas || !spritesheet) {
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
        onImportMap={handleImportMap}
        onExport={handleExport}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onClearAll={handleClearAll}
        onResetView={handleResetView}
        onToggleFullscreen={handleToggleFullscreen}
      />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <ToolsSidebar activeTool={activeTool} onToolChange={setActiveTool} />
        <TilePalette
          atlas={atlas}
          spritesheet={spritesheet}
          selectedTileId={selectedTileId}
          onSelectTile={(id) => {
            clearSelection()
            setSelectedTileId(id)
            setActiveLayer(defaultLayerFor(id))
            setActiveTool("place")
          }}
        />
        <EditorCanvas
          atlas={atlas}
          spritesheet={spritesheet}
          tiles={tiles}
          colliders={colliders}
          markers={markers}
          showMarkers={showMarkers}
          selectedMarkers={selectedMarkers}
          selectedTiles={selectedTiles}
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
          onCameraChange={setCamera}
          onPlaceTile={handlePlaceTile}
          onEraseTile={handleEraseTile}
          onSelectTile={handleSelectTile}
          onSelectCollider={handleSelectCollider}
          onAddCollider={handleAddCollider}
          onDeleteCollider={handleDeleteCollider}
          onStartBatch={handleStartBatch}
          onEndBatch={handleEndBatch}
        />
        <div className="flex w-56 shrink-0 flex-col overflow-y-auto [&>*:last-child]:flex-1">
          <LayersPanel
            activeLayer={activeLayer}
            hiddenLayers={hiddenLayers}
            activeLayerElementCount={tiles.filter((tile) => (tile.layer ?? 0) === activeLayer).length}
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
