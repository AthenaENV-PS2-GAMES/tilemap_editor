"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Search, X } from "lucide-react"
import type { TextureAtlas, EntityDefinition } from "./types"

// Define objects and enemies with their images
const OBJECTS: EntityDefinition[] = [
  { id: "bgCloud", name: "Cloud", imageSrc: "/objects/bgCloud.png", width: 48, height: 16 },
  { id: "bgGreyCloud", name: "Grey Cloud", imageSrc: "/objects/bgGreyCloud.png", width: 48, height: 16 },
  { id: "bgPyramid", name: "Pyramid", imageSrc: "/objects/bgPyramid.png", width: 256, height: 256 },
  { id: "lwSphinx", name: "Sphinx", imageSrc: "/objects/Sphinx.png", width: 128, height: 128 },
  { id: "obLifeChest", name: "Life Chest", imageSrc: "/objects/obLifeChest.png", width: 16, height: 16 },
  { id: "obMagicChest", name: "Magic Chest", imageSrc: "/objects/obMagicChest.png", width: 16, height: 16 },
  { id: "spriteTorch", name: "Torch", imageSrc: "/objects/spriteTorch.png", width: 96, height: 16, frameCount: 6, frameWidth: 16 }
]

const ENEMIES: EntityDefinition[] = [
  { id: "enMinotaur", name: "Minotaur", imageSrc: "/enemies/enMinotaur.png", width: 16, height: 16 },
  { id: "enUndead", name: "Undead", imageSrc: "/enemies/enUndead.png", width: 16, height: 16 },
  { id: "enHarpie", name: "Harpie", imageSrc: "/enemies/enHarpie.png", width: 16, height: 16 },
  { id: "enSkelbow", name: "Skelbow", imageSrc: "/enemies/enSkelbow.png", width: 16, height: 16 },
  { id: "enSkelbowL", name: "SkelbowL", imageSrc: "/enemies/enSkelbow.png", width: 16, height: 16 },
  { id: "enSkelbowR", name: "SkelbowR", imageSrc: "/enemies/enSkelbow.png", width: 16, height: 16 },
  { id: "enAnubisWarrior", name: "Anubis Warrior", imageSrc: "/enemies/enAnubisWarrior.png", width: 16, height: 16 },
  { id: "enDragon", name: "Dragon", imageSrc: "/enemies/enDragon.png", width: 16, height: 16 },
  { id: "enMummy", name: "Mummy", imageSrc: "/enemies/enMummy.png", width: 16, height: 16 },
  { id: "enScarab", name: "Scarab", imageSrc: "/enemies/enScarab.png", width: 16, height: 16 },
  { id: "enScorpion", name: "Scorpion", imageSrc: "/enemies/enScorpion.png", width: 16, height: 16 },
  { id: "enSpearman", name: "Spearman", imageSrc: "/enemies/enSpearman.png", width: 16, height: 16 },
  { id: "enVbow", name: "Vbow", imageSrc: "/enemies/enVbow.png", width: 16, height: 16 },
  { id: "enVsoldier", name: "Vsoldier", imageSrc: "/enemies/enVsoldier.png", width: 16, height: 16 },
  { id: "bossZeus", name: "Zeus", imageSrc: "/enemies/zeus.png", width: 16, height: 16 },
  { id: "standingBastet", name: "Bastet", imageSrc: "/enemies/bastet.png", width: 16, height: 16 },
  { id: "bossThor", name: "Thor", imageSrc: "/enemies/thor.png", width: 16, height: 16 }
]

const PLAYER_SPAWN: EntityDefinition[] = [
  { id: "spriteKratos", name: "Player Spawn", imageSrc: "/player/spriteKratos.png", width: 16, height: 16 },
]

interface TilePaletteProps {
  atlas: TextureAtlas | null
  spritesheet: HTMLImageElement | null
  selectedTileId: string | null
  onSelectTile: (tileId: string) => void
}

export function TilePalette({
  atlas,
  spritesheet,
  selectedTileId,
  onSelectTile,
}: TilePaletteProps) {
  const [query, setQuery] = useState("")

  if (!atlas || !spritesheet) return null

  // Tiles are the atlas frames that don't start with "ob" or "en"
  const tileNames = Object.keys(atlas.frames)
    .map((n) => n.replace(/.png$/, ""))
    .filter((name) => !name.startsWith("ob") && !name.startsWith("en"))

  const term = query.trim().toLowerCase()
  const matches = (text: string) => !term || text.toLowerCase().includes(term)
  const matchesEntity = (e: EntityDefinition) => matches(e.id) || matches(e.name)

  const filteredTiles = tileNames.filter(matches)
  const entitySections = [
    { label: "Objetos", items: OBJECTS.filter(matchesEntity) },
    { label: "Inimigos", items: ENEMIES.filter(matchesEntity) },
    { label: "Player", items: PLAYER_SPAWN.filter(matchesEntity) },
  ].filter((section) => section.items.length > 0)

  const hasResults = filteredTiles.length > 0 || entitySections.length > 0

  return (
    <div className="flex min-h-0 w-52 shrink-0 flex-col border-r border-[#2a2a4a] bg-[#16213e]">
      {/* Search */}
      <div className="shrink-0 border-b border-[#2a2a4a] p-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#555577]" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Pesquisar..."
            className="w-full rounded bg-[#1a1a2e] py-1.5 pl-7 pr-7 text-xs text-[#e0e0e0] outline-none placeholder:text-[#555577] focus:ring-1 focus:ring-[#4a90d9]"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              aria-label="Limpar pesquisa"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[#555577] hover:text-[#e0e0e0]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {!hasResults && (
          <p className="p-4 text-center text-xs text-[#555577]">Nenhum resultado</p>
        )}

        {filteredTiles.length > 0 && (
          <PaletteSection label="Tiles" count={filteredTiles.length}>
            {filteredTiles.map((name) => (
              <TilePaletteItem
                key={name}
                name={name}
                atlas={atlas}
                spritesheet={spritesheet}
                isSelected={selectedTileId === name}
                onClick={() => onSelectTile(name)}
              />
            ))}
          </PaletteSection>
        )}

        {entitySections.map((section) => (
          <PaletteSection key={section.label} label={section.label} count={section.items.length}>
            {section.items.map((entity) => (
              <EntityPaletteItem
                key={entity.id}
                entity={entity}
                isSelected={selectedTileId === entity.id}
                onClick={() => onSelectTile(entity.id)}
              />
            ))}
          </PaletteSection>
        ))}
      </div>
    </div>
  )
}

function PaletteSection({
  label,
  count,
  children,
}: {
  label: string
  count: number
  children: React.ReactNode
}) {
  return (
    <section>
      <h3 className="sticky top-0 z-10 border-b border-[#2a2a4a] bg-[#16213e] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#8888aa]">
        {label} <span className="opacity-60">({count})</span>
      </h3>
      {children}
    </section>
  )
}

function TilePaletteItem({
  name,
  atlas,
  spritesheet,
  isSelected,
  onClick,
}: {
  name: string
  atlas: TextureAtlas
  spritesheet: HTMLImageElement
  isSelected: boolean
  onClick: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const drawPreview = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const frameName = name + ".png"
    const frameData = atlas.frames[frameName]
    if (!frameData) return

    const { x, y, w, h } = frameData.frame
    const scale = Math.min(32 / w, 32 / h)
    const dw = w * scale
    const dh = h * scale

    canvas.width = 32
    canvas.height = 32
    ctx.imageSmoothingEnabled = false
    ctx.clearRect(0, 0, 32, 32)
    ctx.drawImage(
      spritesheet,
      x,
      y,
      w,
      h,
      (32 - dw) / 2,
      (32 - dh) / 2,
      dw,
      dh
    )
  }, [name, atlas, spritesheet])

  useEffect(() => {
    drawPreview()
  }, [drawPreview])

  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors ${isSelected
        ? "bg-[#4a90d9]/20 text-[#4a90d9]"
        : "text-[#8888aa] hover:bg-[#2a2a4a] hover:text-[#e0e0e0]"
        }`}
    >
      <canvas
        ref={canvasRef}
        width={32}
        height={32}
        className="h-8 w-8 shrink-0"
        style={{ imageRendering: "pixelated" }}
      />
      <span className="truncate">{name}</span>
    </button>
  )
}

function EntityPaletteItem({
  entity,
  isSelected,
  onClick,
}: {
  entity: EntityDefinition
  isSelected: boolean
  onClick: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [imageLoaded, setImageLoaded] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const img = new Image()
    img.crossOrigin = "anonymous"
    img.src = entity.imageSrc
    img.onload = () => {
      // For spritesheets, only draw the first frame
      const frameWidth = entity.frameWidth || entity.width
      const frameHeight = entity.height

      const scale = Math.min(32 / frameWidth, 32 / frameHeight)
      const dw = frameWidth * scale
      const dh = frameHeight * scale

      canvas.width = 32
      canvas.height = 32
      ctx.imageSmoothingEnabled = false
      ctx.clearRect(0, 0, 32, 32)
      ctx.drawImage(
        img,
        0, 0, frameWidth, frameHeight, // Source: first frame only
        (32 - dw) / 2, (32 - dh) / 2, dw, dh // Destination: centered
      )
      setImageLoaded(true)
    }
  }, [entity])

  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors ${isSelected
        ? "bg-[#4a90d9]/20 text-[#4a90d9]"
        : "text-[#8888aa] hover:bg-[#2a2a4a] hover:text-[#e0e0e0]"
        }`}
    >
      <canvas
        ref={canvasRef}
        width={32}
        height={32}
        className="h-8 w-8 shrink-0"
        style={{ imageRendering: "pixelated", opacity: imageLoaded ? 1 : 0 }}
      />
      <span className="truncate">{entity.id}</span>
    </button>
  )
}

// Export the definitions so they can be used by the canvas for rendering
export { OBJECTS, ENEMIES, PLAYER_SPAWN }
