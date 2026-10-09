"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type {
  Tool,
  PlacedTile,
  Collider,
  ColliderType,
  Marker,
  TextureAtlas,
  Camera,
} from "./types"
import {
  GRID_SIZE,
  MIN_ZOOM,
  MAX_ZOOM,
  COLLIDER_COLORS,
  COLLIDER_BORDER_COLORS,
} from "./types"
import { OBJECTS, ENEMIES, PLAYER_SPAWN } from "./tile-palette"
import type { EntityDefinition } from "./types"
import { createAssetResolver } from "./asset-resolver"
import { getTileSize } from "./tile-size"

// Build maps of entity id -> entity definition and image src for quick lookup
const ENTITY_MAP: Record<string, EntityDefinition> = {}
const ENTITY_IMAGE_MAP: Record<string, string> = {}

for (const obj of OBJECTS) {
  ENTITY_MAP[obj.id] = obj
  ENTITY_IMAGE_MAP[obj.id] = obj.imageSrc
}
for (const enemy of ENEMIES) {
  ENTITY_MAP[enemy.id] = enemy
  ENTITY_IMAGE_MAP[enemy.id] = enemy.imageSrc
}
for (const player of PLAYER_SPAWN) {
  ENTITY_MAP[player.id] = player
  ENTITY_IMAGE_MAP[player.id] = player.imageSrc
}

const resolveEntity = createAssetResolver(ENTITY_MAP)

interface EditorCanvasProps {
  atlas: TextureAtlas | null
  spritesheet: HTMLImageElement | null
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
  onCameraChange: (camera: Camera) => void
  onPlaceTile: (worldX: number, worldY: number) => void
  onEraseTile: (worldX: number, worldY: number) => void
  onSelectTile: (worldX: number, worldY: number) => void
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
  atlas,
  spritesheet,
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
  onCameraChange,
  onPlaceTile,
  onEraseTile,
  onSelectTile,
  onSelectCollider,
  onAddCollider,
  onDeleteCollider,
  onPlaceMarker,
  onSelectMarker,
  onDeleteMarker,
  onStartBatch,
  onEndBatch,
}: EditorCanvasProps) {
  const resolveAtlasFrame = useMemo(
    () => createAssetResolver(atlas?.frames ?? {}),
    [atlas]
  )
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
  const lastMouseRef = useRef({ x: 0, y: 0 })
  const spaceHeldRef = useRef(false)
  const animRef = useRef<number>(0)
  const entityImagesRef = useRef<Map<string, HTMLImageElement>>(new Map())
  const [entityImagesLoaded, setEntityImagesLoaded] = useState(0)

  // Keep camera in a ref for event handlers
  const cameraRef = useRef(camera)
  cameraRef.current = camera

  // Load entity images (objects and enemies)
  useEffect(() => {
    for (const [id, src] of Object.entries(ENTITY_IMAGE_MAP)) {
      if (!entityImagesRef.current.has(id)) {
        const img = new Image()
        img.crossOrigin = "anonymous"
        img.src = src
        img.onload = () => {

          entityImagesRef.current.set(id, img)
          // Force re-render when image loads
          setEntityImagesLoaded((prev) => prev + 1)
        }
        img.onerror = () => {
          entityImagesRef.current.delete(id)
        }
      }
    }
  }, [])

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
    
    // Fill with background color
    ctx.fillStyle = backgroundColor
    ctx.fillRect(0, 0, rect.width, rect.height)

    ctx.save()
    ctx.translate(camera.x, camera.y)
    ctx.scale(camera.zoom, camera.zoom)

    // Grid
    const startX =
      Math.floor(-camera.x / camera.zoom / GRID_SIZE) * GRID_SIZE
    const startY =
      Math.floor(-camera.y / camera.zoom / GRID_SIZE) * GRID_SIZE
    const endX =
      startX +
      Math.ceil(rect.width / camera.zoom / GRID_SIZE + 2) * GRID_SIZE
    const endY =
      startY +
      Math.ceil(rect.height / camera.zoom / GRID_SIZE + 2) * GRID_SIZE

    ctx.strokeStyle = "rgba(255,255,255,0.06)"
    ctx.lineWidth = 1 / camera.zoom
    ctx.beginPath()
    for (let x = startX; x <= endX; x += GRID_SIZE) {
      ctx.moveTo(x, startY)
      ctx.lineTo(x, endY)
    }
    for (let y = startY; y <= endY; y += GRID_SIZE) {
      ctx.moveTo(startX, y)
      ctx.lineTo(endX, y)
    }
    ctx.stroke()

    // Origin
    ctx.strokeStyle = "rgba(255,255,255,0.15)"
    ctx.lineWidth = 2 / camera.zoom
    ctx.beginPath()
    ctx.moveTo(0, startY)
    ctx.lineTo(0, endY)
    ctx.moveTo(startX, 0)
    ctx.lineTo(endX, 0)
    ctx.stroke()

    // Tiles, Objects, and Enemies
    ctx.imageSmoothingEnabled = false
    
    // Draw in layer order (stable sort keeps insertion order within a layer)
    const orderedTiles = tiles
      .filter((t) => !hiddenLayers.includes(t.layer ?? 0))
      .sort((a, b) => (a.layer ?? 0) - (b.layer ?? 0))

    for (const tile of orderedTiles) {
      // Check if it's an entity (object or enemy)
      const entityDef = resolveEntity(tile.tileId)
      if (entityDef) {
        const entityImg = entityImagesRef.current.get(entityDef.id)
        // Wait for the matched entity's image to load.
        if (!entityImg) continue
        // For spritesheets, only draw the first frame
        const frameWidth = entityDef.frameWidth || entityDef.width
        const frameHeight = entityDef.height
        ctx.drawImage(
          entityImg,
          0, 0, frameWidth, frameHeight, // Source: first frame only
          tile.x, tile.y, frameWidth, frameHeight // Destination
        )
        continue
      }
      
      // Otherwise try to get from atlas
      if (atlas && spritesheet) {
        const frameData = resolveAtlasFrame(tile.tileId)
        if (!frameData) continue
        const { x, y, w, h } = frameData.frame
        ctx.drawImage(spritesheet, x, y, w, h, tile.x, tile.y, w, h)
      }
    }

    // Highlight each visible selected sprite at its actual size.
    ctx.strokeStyle = "#4a90d9"
    ctx.fillStyle = "rgba(74, 144, 217, 0.15)"
    ctx.lineWidth = 2 / camera.zoom
    for (const tile of selectedTiles) {
      if (hiddenLayers.includes(tile.layer ?? 0)) continue
      const { width, height } = getTileSize(tile.tileId, atlas)
      ctx.fillRect(tile.x, tile.y, width, height)
      ctx.strokeRect(tile.x, tile.y, width, height)
    }

    const selectedColliderSet = new Set(selectedColliders)
    const selectedMarkerSet = new Set(selectedMarkers)

    // Colliders
    for (const collider of colliders) {
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
  }, [
    camera,
    atlas,
    resolveAtlasFrame,
    spritesheet,
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
    entityImagesLoaded,
  ])

  // Animation loop
  useEffect(() => {
    let running = true
    const loop = () => {
      if (!running) return
      draw()
      animRef.current = requestAnimationFrame(loop)
    }
    animRef.current = requestAnimationFrame(loop)
    return () => {
      running = false
      cancelAnimationFrame(animRef.current)
    }
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

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      const canvas = canvasRef.current
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      const sx = e.clientX - rect.left
      const sy = e.clientY - rect.top
      const world = screenToWorld(sx, sy)

      lastMouseRef.current = { x: e.clientX, y: e.clientY }

      if (e.button === 1 || (e.button === 0 && spaceHeldRef.current) || (e.button === 0 && activeTool === "drag")) {
        isPanningRef.current = true
        e.preventDefault()
        return
      }

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
          onSelectTile(world.x, world.y)
        }
      } else if (activeTool === "collider") {
        if (showColliderPopup) return
        const snappedX = Math.floor(world.x / GRID_SIZE) * GRID_SIZE
        const snappedY = Math.floor(world.y / GRID_SIZE) * GRID_SIZE
        setColliderStart({ x: snappedX, y: snappedY })
        setColliderEnd({ x: snappedX, y: snappedY })
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
    ]
  )

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
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

      if (!isDrawingRef.current) return

      const world = screenToWorld(sx, sy)

      if (activeTool === "place") {
        onPlaceTile(world.x, world.y)
      } else if (activeTool === "erase") {
        onEraseTile(world.x, world.y)
      } else if (activeTool === "collider" && colliderStart) {
        const snappedX = Math.round(world.x / GRID_SIZE) * GRID_SIZE
        const snappedY = Math.round(world.y / GRID_SIZE) * GRID_SIZE
        setColliderEnd({ x: snappedX, y: snappedY })
      }
    },
    [
      camera,
      activeTool,
      screenToWorld,
      onCameraChange,
      onPlaceTile,
      onEraseTile,
      colliderStart,
    ]
  )

  const handleMouseUp = useCallback(() => {
    isPanningRef.current = false

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

      if (width >= GRID_SIZE && height >= GRID_SIZE) {
        setPendingCollider({ x, y, width, height })
        setShowColliderPopup(true)
      }

      setColliderStart(null)
      setColliderEnd(null)
    }

    isDrawingRef.current = false
  }, [activeTool, colliderStart, colliderEnd, onEndBatch])

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
    if (activeTool === "select") return "default"
    return "crosshair"
  }

  return (
    <div ref={containerRef} className="relative flex-1 overflow-hidden">
      <canvas
        ref={canvasRef}
        className="h-full w-full"
        style={{ cursor: getCursor() }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
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
