"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type {
  Tool,
  PlacedTile,
  Collider,
  ColliderType,
  Marker,
  Camera,
  CanvasSize,
  Tilemap,
  ObjectAlignment,
} from "./types"
import {
  GRID_SIZE,
  MIN_ZOOM,
  MAX_ZOOM,
  COLLIDER_COLORS,
  COLLIDER_BORDER_COLORS,
} from "./types"
import { snapToTilemap } from "./project"
import { compareDisplayOrder, resolveInstance } from "./project"
import type { CatalogEntry } from "./project"

interface EditorCanvasProps {
  tilemap: Tilemap
  tilemaps: Tilemap[]
  annotationAlignment: ObjectAlignment
  catalog: Map<string, CatalogEntry>
  images: Map<string, HTMLImageElement>
  tiles: PlacedTile[]
  colliders: Collider[]
  markers: Marker[]
  showMarkers: boolean
  selectedMarkers: Marker[]
  selectedTiles: PlacedTile[]
  showColliders: boolean
  hiddenLayers: number[]
  activeTool: Tool
  camera: Camera
  selectedTileId: string | null
  selectedColliders: Collider[]
  backgroundColor: string
  canvasSize: CanvasSize
  onCameraChange: (camera: Camera) => void
  onPlaceTile: (worldX: number, worldY: number) => void
  onEraseTile: (worldX: number, worldY: number) => void
  onSelectTile: (worldX: number, worldY: number) => PlacedTile | null
  onMoveElements: (origins: { id: string; x: number; y: number }[], dx: number, dy: number) => void
  onSelectCollider: (worldX: number, worldY: number) => void
  onAddCollider: (collider: Collider) => void
  onDeleteCollider: (collider: Collider) => void
  onPlaceMarker: (worldX: number, worldY: number) => void
  onSelectMarker: (marker: Marker) => void
  onDeleteMarker: (marker: Marker) => void
  onStartBatch?: () => void
  onEndBatch?: () => void
}

export function EditorCanvas({
  tilemap,
  tilemaps,
  annotationAlignment,
  catalog,
  images,
  tiles,
  colliders: allColliders,
  markers: allMarkers,
  showMarkers,
  selectedMarkers,
  selectedTiles,
  showColliders,
  hiddenLayers,
  activeTool,
  camera,
  selectedTileId,
  selectedColliders,
  backgroundColor,
  canvasSize,
  onCameraChange,
  onPlaceTile,
  onEraseTile,
  onSelectTile,
  onMoveElements,
  onSelectCollider,
  onAddCollider,
  onDeleteCollider,
  onPlaceMarker,
  onSelectMarker,
  onDeleteMarker,
  onStartBatch,
  onEndBatch,
}: EditorCanvasProps) {
  // Hidden markers and colliders are neither drawn nor hit-tested
  const markers = useMemo(
    () => (showMarkers ? allMarkers : []),
    [showMarkers, allMarkers]
  )
  const colliders = useMemo(
    () => (showColliders ? allColliders : []),
    [showColliders, allColliders]
  )
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const isPanningRef = useRef(false)
  const isDrawingRef = useRef(false)
  const elementDragRef = useRef<{ start: { x: number; y: number }; origins: { id: string; x: number; y: number }[] } | null>(null)
  const lastMouseRef = useRef({ x: 0, y: 0 })
  const spaceHeldRef = useRef(false)
  const animRef = useRef<number>(0)
  // Keep camera in a ref for event handlers
  const cameraRef = useRef(camera)
  cameraRef.current = camera

  // Collider drawing state
  const [colliderStart, setColliderStart] = useState<{
    x: number
    y: number
  } | null>(null)
  const [colliderEnd, setColliderEnd] = useState<{
    x: number
    y: number
  } | null>(null)
  const [showColliderPopup, setShowColliderPopup] = useState(false)
  const [pendingCollider, setPendingCollider] = useState<{
    x: number
    y: number
    width: number
    height: number
  } | null>(null)
  const [colliderType, setColliderType] = useState<ColliderType>("ground")

  const screenToWorld = useCallback(
    (sx: number, sy: number) => {
      return {
        x: (sx - camera.x) / camera.zoom,
        y: (sy - camera.y) / camera.zoom,
      }
    },
    [camera]
  )

  const insideCanvas = useCallback((x: number, y: number) =>
    x >= 0 && y >= 0 && x < canvasSize.width && y < canvasSize.height,
  [canvasSize])

  // Draw function
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const rect = canvas.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1

    if (
      canvas.width !== Math.round(rect.width * dpr) ||
      canvas.height !== Math.round(rect.height * dpr)
    ) {
      canvas.width = Math.round(rect.width * dpr)
      canvas.height = Math.round(rect.height * dpr)
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    
    // The editor viewport extends beyond the project's drawing area.
    ctx.fillStyle = "#11111d"
    ctx.fillRect(0, 0, rect.width, rect.height)

    ctx.save()
    ctx.translate(camera.x, camera.y)
    ctx.scale(camera.zoom, camera.zoom)
    ctx.fillStyle = backgroundColor
    ctx.fillRect(0, 0, canvasSize.width, canvasSize.height)
    ctx.save()
    ctx.beginPath()
    ctx.rect(0, 0, canvasSize.width, canvasSize.height)
    ctx.clip()

    const viewLeft = -camera.x / camera.zoom
    const viewTop = -camera.y / camera.zoom
    const viewRight = viewLeft + rect.width / camera.zoom
    const viewBottom = viewTop + rect.height / camera.zoom

    // Grid
    const startX = tilemap.origin.x +
      Math.floor((-camera.x / camera.zoom - tilemap.origin.x) / tilemap.cellWidth) * tilemap.cellWidth
    const startY = tilemap.origin.y +
      Math.floor((-camera.y / camera.zoom - tilemap.origin.y) / tilemap.cellHeight) * tilemap.cellHeight
    const endX =
      startX +
      Math.ceil(rect.width / camera.zoom / tilemap.cellWidth + 2) * tilemap.cellWidth
    const endY =
      startY +
      Math.ceil(rect.height / camera.zoom / tilemap.cellHeight + 2) * tilemap.cellHeight

    ctx.strokeStyle = "rgba(255,255,255,0.06)"
    ctx.lineWidth = 1 / camera.zoom
    ctx.beginPath()
    for (let x = startX; x <= endX; x += tilemap.cellWidth) {
      ctx.moveTo(x, startY)
      ctx.lineTo(x, endY)
    }
    for (let y = startY; y <= endY; y += tilemap.cellHeight) {
      ctx.moveTo(startX, y)
      ctx.lineTo(endX, y)
    }
    ctx.stroke()

    // Origin
    ctx.strokeStyle = "rgba(255,255,255,0.15)"
    ctx.lineWidth = 2 / camera.zoom
    ctx.beginPath()
    ctx.moveTo(tilemap.origin.x, startY)
    ctx.lineTo(tilemap.origin.x, endY)
    ctx.moveTo(startX, tilemap.origin.y)
    ctx.lineTo(endX, tilemap.origin.y)
    ctx.stroke()

    // Tiles, Objects, and Enemies
    ctx.imageSmoothingEnabled = false
    
    // Draw in layer order (stable sort keeps insertion order within a layer)
    const mapLayers = new Map(tilemaps.map((map) => [map.id, map.layer ?? 0]))
    const orderedTiles = tiles
      .filter((tile) => {
        if (hiddenLayers.includes(tile.layer ?? 0)) return false
        const crop = resolveInstance(tile, catalog)?.crop
        return tile.x < viewRight && tile.x + (crop?.width ?? GRID_SIZE) > viewLeft &&
          tile.y < viewBottom && tile.y + (crop?.height ?? GRID_SIZE) > viewTop
      })
      .sort((a, b) => compareDisplayOrder(a, b, mapLayers))

    for (const tile of orderedTiles) {
      const entry = resolveInstance(tile, catalog)
      const image = entry && images.get(entry.imageId)
      if (!entry || !image) {
        // Unknown legacy assets stay editable and visible as placeholders.
        ctx.strokeStyle = "#f59e0b"
        ctx.strokeRect(tile.x, tile.y, GRID_SIZE, GRID_SIZE)
        continue
      }
      const crop = entry.crop
      ctx.drawImage(image, crop.x, crop.y, crop.width, crop.height, tile.x, tile.y, crop.width, crop.height)
    }

    // Highlight each visible selected sprite at its actual size.
    ctx.strokeStyle = "#4a90d9"
    ctx.fillStyle = "rgba(74, 144, 217, 0.15)"
    ctx.lineWidth = 2 / camera.zoom
    for (const tile of selectedTiles) {
      if (hiddenLayers.includes(tile.layer ?? 0)) continue
      const crop = resolveInstance(tile, catalog)?.crop
      const width = crop?.width ?? GRID_SIZE
      const height = crop?.height ?? GRID_SIZE
      if (tile.x >= viewRight || tile.x + width <= viewLeft || tile.y >= viewBottom || tile.y + height <= viewTop) continue
      ctx.fillRect(tile.x, tile.y, width, height)
      ctx.strokeRect(tile.x, tile.y, width, height)
    }

    const selectedColliderSet = new Set(selectedColliders)
    const selectedMarkerSet = new Set(selectedMarkers)

    // Colliders
    for (const collider of colliders) {
      if (collider.x >= viewRight || collider.x + collider.width <= viewLeft || collider.y >= viewBottom || collider.y + collider.height <= viewTop) continue
      const color = COLLIDER_COLORS[collider.type] || COLLIDER_COLORS.ground
      const borderColor =
        COLLIDER_BORDER_COLORS[collider.type] ||
        COLLIDER_BORDER_COLORS.ground

      ctx.fillStyle = color
      ctx.fillRect(collider.x, collider.y, collider.width, collider.height)

      ctx.strokeStyle = borderColor
      ctx.lineWidth = 2 / camera.zoom
      if (selectedColliderSet.has(collider)) {
        ctx.setLineDash([4 / camera.zoom, 4 / camera.zoom])
      }
      ctx.strokeRect(
        collider.x,
        collider.y,
        collider.width,
        collider.height
      )
      ctx.setLineDash([])

      const fontSize = Math.max(10, 12 / camera.zoom)
      ctx.font = `bold ${fontSize}px sans-serif`
      ctx.fillStyle = borderColor
      ctx.textBaseline = "top"
      ctx.fillText(
        collider.type,
        collider.x + 3 / camera.zoom,
        collider.y + 3 / camera.zoom
      )

      if (selectedColliderSet.has(collider)) {
        const hs = 6 / camera.zoom
        ctx.fillStyle = borderColor
        const corners = [
          { x: collider.x, y: collider.y },
          { x: collider.x + collider.width, y: collider.y },
          { x: collider.x, y: collider.y + collider.height },
          {
            x: collider.x + collider.width,
            y: collider.y + collider.height,
          },
        ]
        for (const corner of corners) {
          ctx.fillRect(corner.x - hs / 2, corner.y - hs / 2, hs, hs)
        }
      }
    }

    // Markers (drawn without the atlas)
    for (const marker of markers) {
      if (marker.x >= viewRight + 32 || marker.x + GRID_SIZE <= viewLeft - 32 || marker.y >= viewBottom + 32 || marker.y + GRID_SIZE <= viewTop - 32) continue
      const cx = marker.x + GRID_SIZE / 2
      const cy = marker.y + GRID_SIZE / 2
      const r = GRID_SIZE / 2
      const isSelected = selectedMarkerSet.has(marker)

      ctx.beginPath()
      ctx.moveTo(cx, cy - r)
      ctx.lineTo(cx + r, cy)
      ctx.lineTo(cx, cy + r)
      ctx.lineTo(cx - r, cy)
      ctx.closePath()
      ctx.fillStyle = "rgba(236, 72, 153, 0.55)"
      ctx.fill()
      ctx.strokeStyle = isSelected ? "#ffffff" : "rgba(236, 72, 153, 1)"
      ctx.lineWidth = (isSelected ? 2 : 1.5) / camera.zoom
      ctx.stroke()

      const fontSize = Math.max(10, 12 / camera.zoom)
      ctx.font = `bold ${fontSize}px sans-serif`
      ctx.fillStyle = "rgba(236, 72, 153, 1)"
      ctx.textAlign = "center"
      ctx.textBaseline = "bottom"
      ctx.fillText(marker.name, cx, marker.y - 2 / camera.zoom)
      ctx.textAlign = "start"
    }

    // Collider being drawn
    if (colliderStart && colliderEnd) {
      const sx = Math.min(colliderStart.x, colliderEnd.x)
      const sy = Math.min(colliderStart.y, colliderEnd.y)
      const sw = Math.abs(colliderEnd.x - colliderStart.x)
      const sh = Math.abs(colliderEnd.y - colliderStart.y)

      ctx.fillStyle = COLLIDER_COLORS[colliderType]
      ctx.fillRect(sx, sy, sw, sh)
      ctx.strokeStyle = COLLIDER_BORDER_COLORS[colliderType]
      ctx.lineWidth = 2 / camera.zoom
      ctx.strokeRect(sx, sy, sw, sh)
    }

    ctx.restore()
    ctx.strokeStyle = "#72b6ff"
    ctx.lineWidth = 2 / camera.zoom
    ctx.strokeRect(0, 0, canvasSize.width, canvasSize.height)
    ctx.restore()
  }, [
    camera,
    tilemap,
    tilemaps,
    catalog,
    images,
    tiles,
    colliders,
    markers,
    selectedMarkers,
    selectedTiles,
    hiddenLayers,
    selectedColliders,
    colliderStart,
    colliderEnd,
    colliderType,
    backgroundColor,
    canvasSize,
  ])

  // The editor content is static between state changes; avoid redrawing a large map while idle.
  useEffect(() => {
    animRef.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(animRef.current)
  }, [draw])

  // Resize observer
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const obs = new ResizeObserver(() => draw())
    obs.observe(container)
    return () => obs.disconnect()
  }, [draw])

  // Keyboard (space for pan)
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target instanceof HTMLElement && (e.target.isContentEditable || e.target.closest("button")))) return
      if (e.code === "Space") {
        e.preventDefault()
        spaceHeldRef.current = true
      }
    }
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        spaceHeldRef.current = false
      }
    }
    window.addEventListener("keydown", down)
    window.addEventListener("keyup", up)
    return () => {
      window.removeEventListener("keydown", down)
      window.removeEventListener("keyup", up)
    }
  }, [])

  // Non-passive wheel event for zoom
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = canvas.getBoundingClientRect()
      const sx = e.clientX - rect.left
      const sy = e.clientY - rect.top

      const cam = cameraRef.current
      const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1
      const newZoom = Math.max(
        MIN_ZOOM,
        Math.min(MAX_ZOOM, cam.zoom * zoomFactor)
      )

      const wx = (sx - cam.x) / cam.zoom
      const wy = (sy - cam.y) / cam.zoom
      const newX = sx - wx * newZoom
      const newY = sy - wy * newZoom

      onCameraChange({ x: newX, y: newY, zoom: newZoom })
    }

    canvas.addEventListener("wheel", handleWheel, { passive: false })
    return () => canvas.removeEventListener("wheel", handleWheel)
  }, [onCameraChange])

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      const sx = e.clientX - rect.left
      const sy = e.clientY - rect.top
      const world = screenToWorld(sx, sy)

      lastMouseRef.current = { x: e.clientX, y: e.clientY }

      if (e.button === 0 || e.button === 1) {
        if (e.nativeEvent.isTrusted) e.currentTarget.setPointerCapture(e.pointerId)
      }

      if (e.button === 1 || (e.button === 0 && spaceHeldRef.current) || (e.button === 0 && activeTool === "drag")) {
        isPanningRef.current = true
        e.preventDefault()
        return
      }

      if (!insideCanvas(world.x, world.y)) return

      const markerAt = () =>
        markers.find(
          (m) =>
            world.x >= m.x &&
            world.x < m.x + GRID_SIZE &&
            world.y >= m.y &&
            world.y < m.y + GRID_SIZE
        )

      if (e.button === 2) {
        const foundMarker = markerAt()
        if (foundMarker) {
          onDeleteMarker(foundMarker)
          return
        }
        const found = colliders.find(
          (c) =>
            world.x >= c.x &&
            world.x < c.x + c.width &&
            world.y >= c.y &&
            world.y < c.y + c.height
        )
        if (found) onDeleteCollider(found)
        return
      }

      if (e.button !== 0) return

      if (activeTool === "place") {
        isDrawingRef.current = true
        onStartBatch?.()
        onPlaceTile(world.x, world.y)
      } else if (activeTool === "erase") {
        isDrawingRef.current = true
        onStartBatch?.()
        onEraseTile(world.x, world.y)
      } else if (activeTool === "marker") {
        const existing = markerAt()
        if (existing) onSelectMarker(existing)
        else onPlaceMarker(world.x, world.y)
      } else if (activeTool === "select") {
        const foundMarker = markerAt()
        if (foundMarker) {
          onSelectMarker(foundMarker)
          return
        }
        const foundCollider = colliders.find(
          (c) =>
            world.x >= c.x &&
            world.x < c.x + c.width &&
            world.y >= c.y &&
            world.y < c.y + c.height
        )
        if (foundCollider) {
          onSelectCollider(world.x, world.y)
        } else {
          const found = onSelectTile(world.x, world.y)
          if (found?.resource?.kind === "element") {
            const group = selectedTiles.includes(found)
              ? selectedTiles.filter((tile) => tile.resource?.kind === "element")
              : [found]
            if (group.length && group.every((tile) => !tile.locked && tile.id)) {
              elementDragRef.current = { start: world, origins: group.map((tile) => ({ id: tile.id!, x: tile.x, y: tile.y })) }
              onStartBatch?.()
            }
          }
        }
      } else if (activeTool === "collider") {
        if (showColliderPopup) return
        const snapped = annotationAlignment.enabled ? snapToTilemap(world.x, world.y, annotationAlignment) : { x: Math.round(world.x), y: Math.round(world.y) }
        setColliderStart(snapped)
        setColliderEnd(snapped)
        isDrawingRef.current = true
      }
    },
    [
      activeTool,
      screenToWorld,
      onPlaceTile,
      onEraseTile,
      onSelectTile,
      onSelectCollider,
      onDeleteCollider,
      onPlaceMarker,
      onSelectMarker,
      onDeleteMarker,
      markers,
      colliders,
      showColliderPopup,
      onStartBatch,
      selectedTiles,
      annotationAlignment,
      insideCanvas,
    ]
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      const sx = e.clientX - rect.left
      const sy = e.clientY - rect.top

      if (isPanningRef.current) {
        const dx = e.clientX - lastMouseRef.current.x
        const dy = e.clientY - lastMouseRef.current.y
        onCameraChange({
          ...camera,
          x: camera.x + dx,
          y: camera.y + dy,
        })
        lastMouseRef.current = { x: e.clientX, y: e.clientY }
        return
      }

      if (elementDragRef.current) {
        const world = screenToWorld(sx, sy)
        if (!insideCanvas(world.x, world.y)) return
        onMoveElements(elementDragRef.current.origins, world.x - elementDragRef.current.start.x, world.y - elementDragRef.current.start.y)
        return
      }

      if (!isDrawingRef.current) return

      const world = screenToWorld(sx, sy)
      if (!insideCanvas(world.x, world.y)) return

      if (activeTool === "place") {
        onPlaceTile(world.x, world.y)
      } else if (activeTool === "erase") {
        onEraseTile(world.x, world.y)
      } else if (activeTool === "collider" && colliderStart) {
        const snapped = annotationAlignment.enabled ? {
          x: annotationAlignment.origin.x + Math.round((world.x - annotationAlignment.origin.x) / annotationAlignment.cellWidth) * annotationAlignment.cellWidth,
          y: annotationAlignment.origin.y + Math.round((world.y - annotationAlignment.origin.y) / annotationAlignment.cellHeight) * annotationAlignment.cellHeight,
        } : { x: Math.round(world.x), y: Math.round(world.y) }
        setColliderEnd(snapped)
      }
    },
    [
      camera,
      activeTool,
      screenToWorld,
      onCameraChange,
      onPlaceTile,
      onEraseTile,
      onMoveElements,
      colliderStart,
      annotationAlignment,
      insideCanvas,
    ]
  )

  const handlePointerUp = useCallback(() => {
    isPanningRef.current = false

    if (elementDragRef.current) {
      elementDragRef.current = null
      onEndBatch?.()
    }

    // End batch for place/erase operations
    if (isDrawingRef.current && (activeTool === "place" || activeTool === "erase")) {
      onEndBatch?.()
    }

    if (
      isDrawingRef.current &&
      activeTool === "collider" &&
      colliderStart &&
      colliderEnd
    ) {
      const x = Math.min(colliderStart.x, colliderEnd.x)
      const y = Math.min(colliderStart.y, colliderEnd.y)
      const width = Math.abs(colliderEnd.x - colliderStart.x)
      const height = Math.abs(colliderEnd.y - colliderStart.y)

      if (width >= (annotationAlignment.enabled ? annotationAlignment.cellWidth : 1) && height >= (annotationAlignment.enabled ? annotationAlignment.cellHeight : 1)) {
        setPendingCollider({ x, y, width, height })
        setShowColliderPopup(true)
      }

      setColliderStart(null)
      setColliderEnd(null)
    }

    isDrawingRef.current = false
  }, [activeTool, colliderStart, colliderEnd, annotationAlignment, onEndBatch])

  const confirmCollider = useCallback(() => {
    if (pendingCollider) {
      onAddCollider({ ...pendingCollider, type: colliderType })
    }
    setPendingCollider(null)
    setShowColliderPopup(false)
  }, [pendingCollider, colliderType, onAddCollider])

  const cancelCollider = useCallback(() => {
    setPendingCollider(null)
    setShowColliderPopup(false)
  }, [])

  const getCursor = () => {
    if (isPanningRef.current) return "grabbing"
    if (spaceHeldRef.current || activeTool === "drag") return "grab"
    if (elementDragRef.current) return "grabbing"
    if (activeTool === "select") return "default"
    return "crosshair"
  }

  return (
    <div ref={containerRef} className="relative flex-1 overflow-hidden">
      <canvas
        ref={canvasRef}
        className="h-full w-full"
        style={{ cursor: getCursor(), touchAction: "none" }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onLostPointerCapture={handlePointerUp}
        onContextMenu={(e) => e.preventDefault()}
      />

      {showColliderPopup && pendingCollider && (
        <div
          className="absolute rounded-lg border border-[#2a2a4a] bg-[#16213e] p-3 shadow-xl"
          style={{
            left: Math.max(
              8,
              pendingCollider.x * camera.zoom + camera.x
            ),
            top: Math.max(
              8,
              pendingCollider.y * camera.zoom + camera.y - 100
            ),
          }}
        >
          <p className="mb-2 text-xs text-[#8888aa]">Tipo do Collider:</p>
          <div className="mb-2 flex gap-1">
            {(["ground", "chest", "ladder", "door", "kill"] as ColliderType[]).map((t) => (
              <button
                key={t}
                onClick={() => setColliderType(t)}
                className={`rounded px-2 py-1 text-xs capitalize ${
                  colliderType === t
                    ? "bg-[#4a90d9] text-[#ffffff]"
                    : "bg-[#2a2a4a] text-[#8888aa]"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="flex gap-1">
            <button
              onClick={confirmCollider}
              className="rounded bg-[#2d6a4f] px-2 py-1 text-xs text-[#e0e0e0]"
            >
              OK
            </button>
            <button
              onClick={cancelCollider}
              className="rounded bg-[#2a2a4a] px-2 py-1 text-xs text-[#8888aa]"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
