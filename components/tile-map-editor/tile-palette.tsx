"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import type { CatalogEntry } from "./project"
import { atlasCrops, gridCrops, newId, referenceKey } from "./project"
import { loadImage, readDataUrl } from "./project-files"
import type { Crop, ElementResource, GridConfig, ImageResource, ProjectDocument, Tileset } from "./types"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { ElementImportDialog } from "./element-import-dialog"

const inputClass = "w-full rounded border border-[#2a2a4a] bg-[#1a1a2e] p-1.5 text-xs text-[#e0e0e0]"
const buttonClass = "rounded bg-[#2a2a4a] px-2 py-1.5 text-xs text-[#e0e0e0] hover:bg-[#3a3a5a] disabled:opacity-50"

interface TilePaletteProps {
  project: ProjectDocument
  catalog: Map<string, CatalogEntry>
  images: Map<string, HTMLImageElement>
  selectedTileId: string | null
  onSelectTile: (key: string) => void
  onAddTileset: (image: ImageResource, tileset: Tileset, decoded: HTMLImageElement) => void
  onAddElement: (definition: ElementResource, image?: ImageResource, decoded?: HTMLImageElement) => void
}

export function TilePalette({ project, catalog, images, selectedTileId, onSelectTile, onAddTileset, onAddElement }: TilePaletteProps) {
  const [tab, setTab] = useState<"tiles" | "elements">("tiles")
  const [setId, setSetId] = useState(project.tilesets[0]?.id ?? "")
  const [query, setQuery] = useState("")
  const [importOpen, setImportOpen] = useState(false)
  const [elementOpen, setElementOpen] = useState(false)
  const selected = selectedTileId ? catalog.get(selectedTileId) : undefined
  const selectedSet = selected?.resource.kind === "tile" ? selected.resource.tilesetId : undefined
  const activeSetId = selectedSet ?? (project.tilesets.some((set) => set.id === setId) ? setId : project.tilesets[0]?.id)
  const tileset = project.tilesets.find((set) => set.id === activeSetId)
  const entries = [...catalog.values()].filter((entry) => {
    const matchesTab = tab === "elements" ? entry.resource.kind === "element" : entry.resource.kind === "tile" && entry.resource.tilesetId === activeSetId
    const term = query.trim().toLowerCase()
    return matchesTab && (!term || `${entry.name} ${entry.tileId} ${entry.category}`.toLowerCase().includes(term))
  })
  const image = tileset ? images.get(tileset.imageId) : undefined

  return (
    <aside aria-label="Catálogo de recursos" className="flex min-h-0 w-60 shrink-0 flex-col border-r border-[#2a2a4a] bg-[#16213e]">
      <div className="flex gap-1 border-b border-[#2a2a4a] p-2">
        <button aria-pressed={tab === "tiles"} className={`${buttonClass} ${tab === "tiles" ? "bg-[#4a90d9]/30" : ""}`} onClick={() => setTab("tiles")}>Mosaico / TileMap</button>
        <button aria-pressed={tab === "elements"} className={`${buttonClass} ${tab === "elements" ? "bg-[#4a90d9]/30" : ""}`} onClick={() => setTab("elements")}>Elementos</button>
      </div>
      <div className="space-y-2 border-b border-[#2a2a4a] p-2">
        {tab === "tiles" && <>
          <label className="block text-xs text-[#8888aa]">Tileset
            <select aria-label="Tileset ativo" className={inputClass} value={activeSetId ?? ""} onChange={(e) => {
              const next = project.tilesets.find((set) => set.id === e.target.value)
              setSetId(e.target.value)
              if (next?.crops[0]) onSelectTile(referenceKey({ kind: "tile", tilesetId: next.id, cropId: next.crops[0].id }))
            }}>
              {project.tilesets.map((set) => <option key={set.id} value={set.id}>{set.name}</option>)}
            </select>
          </label>
          <button className={`${buttonClass} w-full`} onClick={() => setImportOpen(true)}>Importar tileset…</button>
        </>}
        {tab === "elements" && <button className={`${buttonClass} w-full`} onClick={() => setElementOpen(true)}>Criar elemento…</button>}
        <input aria-label="Pesquisar recursos" placeholder="Pesquisar…" className={inputClass} value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === "tiles" && tileset && image && <div className="space-y-2 p-2">
          <SheetPreview image={image} crops={tileset.crops} selectedCropId={selected?.crop.id} onSelect={(crop) => onSelectTile(referenceKey({ kind: "tile", tilesetId: tileset.id, cropId: crop.id }))} />
          <p className="text-[10px] text-[#8888aa]">Clique em um recorte para pintar. O tamanho visual é preservado; a grade do cenário é de 16 × 16.</p>
          <select aria-label="Recorte selecionado" className={inputClass} value={selected?.resource.kind === "tile" ? selected.key : ""} onChange={(e) => onSelectTile(e.target.value)}>
            <option value="" disabled>Selecionar recorte</option>
            {entries.map((entry) => <option key={entry.key} value={entry.key}>{entry.name} ({entry.crop.width} × {entry.crop.height})</option>)}
          </select>
        </div>}
        {!entries.length && <p className="p-3 text-xs text-[#8888aa]">Nenhum resultado</p>}
        {(entries.length <= 256 || tab === "elements") && entries.map((entry) => <button
          key={entry.key}
          onClick={() => onSelectTile(entry.key)}
          aria-pressed={selectedTileId === entry.key}
          className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs ${selectedTileId === entry.key ? "bg-[#4a90d9]/20 text-[#4a90d9]" : "text-[#aaaacc] hover:bg-[#2a2a4a]"}`}
        >
          <CropPreview entry={entry} image={images.get(entry.imageId)} />
          <span className="min-w-0"><span className="block truncate">{entry.name}</span>{tab === "elements" && <span className="text-[10px] text-[#8888aa]">{entry.category}</span>}</span>
        </button>)}
      </div>
      <ImportTilesetDialog open={importOpen} onOpenChange={setImportOpen} onAddTileset={onAddTileset} />
      <ElementImportDialog open={elementOpen} onOpenChange={setElementOpen} project={project} images={images} onCreate={onAddElement} />
    </aside>
  )
}

function CropPreview({ entry, image }: { entry: CatalogEntry; image?: HTMLImageElement }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const ctx = ref.current?.getContext("2d")
    if (!ctx || !image) return
    const crop = entry.crop
    const scale = Math.min(32 / crop.width, 32 / crop.height)
    ctx.clearRect(0, 0, 32, 32)
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(image, crop.x, crop.y, crop.width, crop.height, (32 - crop.width * scale) / 2, (32 - crop.height * scale) / 2, crop.width * scale, crop.height * scale)
  }, [entry, image])
  return <canvas ref={ref} width={32} height={32} className="h-8 w-8 shrink-0" style={{ imageRendering: "pixelated" }} />
}

function SheetPreview({ image, crops, selectedCropId, onSelect }: { image: HTMLImageElement; crops: Crop[]; selectedCropId?: string; onSelect?: (crop: Crop) => void }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const scale = Math.min(216 / image.naturalWidth, 1)
  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext("2d")
    if (!canvas || !ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
    for (const crop of crops) {
      ctx.strokeStyle = crop.id === selectedCropId ? "#60a5fa" : "rgba(255,255,255,0.4)"
      ctx.lineWidth = crop.id === selectedCropId ? 2 : 1
      ctx.strokeRect(crop.x * scale, crop.y * scale, crop.width * scale, crop.height * scale)
    }
  }, [image, crops, selectedCropId, scale])
  return <div className="max-h-72 overflow-auto rounded bg-[#1a1a2e] p-1">
    <canvas aria-label="Prévia dos recortes do tileset" ref={ref} width={Math.round(image.naturalWidth * scale)} height={Math.round(image.naturalHeight * scale)} style={{ imageRendering: "pixelated", cursor: onSelect ? "pointer" : "default" }} onPointerDown={(event) => {
      const rect = event.currentTarget.getBoundingClientRect()
      const x = (event.clientX - rect.left) / rect.width * image.naturalWidth
      const y = (event.clientY - rect.top) / rect.height * image.naturalHeight
      const crop = crops.find((crop) => x >= crop.x && x < crop.x + crop.width && y >= crop.y && y < crop.y + crop.height)
      if (crop) onSelect?.(crop)
    }} />
  </div>
}

function ImportTilesetDialog({ open, onOpenChange, onAddTileset }: Pick<TilePaletteProps, "onAddTileset"> & { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [image, setImage] = useState<ImageResource | null>(null)
  const [decoded, setDecoded] = useState<HTMLImageElement | null>(null)
  const [name, setName] = useState("")
  const [mode, setMode] = useState<"grid" | "atlas">("grid")
  const [grid, setGrid] = useState<GridConfig>({ width: 16, height: 16, margin: 0, spacing: 0 })
  const [atlas, setAtlas] = useState<unknown>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const requestRef = useRef(0)
  const preview = useMemo(() => {
    if (!image) return { crops: [] as Crop[], error: "Selecione uma imagem." }
    try { return { crops: mode === "grid" ? gridCrops(image, grid) : atlasCrops(atlas, image), error: null } }
    catch (err) { return { crops: [] as Crop[], error: err instanceof Error ? err.message : "Recortes inválidos." } }
  }, [image, grid, mode, atlas])

  useEffect(() => {
    if (!open) {
      requestRef.current++
      setImage(null); setDecoded(null); setName(""); setAtlas(null); setError(null); setLoading(false)
    }
  }, [open])

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[90vh] overflow-y-auto border-[#2a2a4a] bg-[#16213e] text-[#e0e0e0]">
      <DialogTitle>Importar tileset</DialogTitle>
      <DialogDescription>Carregue uma spritesheet e configure seus recortes. A imagem será incorporada ao salvar o projeto.</DialogDescription>
      <label className="space-y-1 text-xs">Imagem (PNG, JPEG, WebP ou GIF)
        <input aria-label="Imagem do tileset" type="file" accept="image/png,image/jpeg,image/webp,image/gif" className={inputClass} onChange={async (event) => {
          const file = event.target.files?.[0]
          if (!file) return
          const request = ++requestRef.current
          setImage(null); setDecoded(null); setError(null); setLoading(true)
          try {
            if (!["image/png", "image/jpeg", "image/webp", "image/gif"].includes(file.type)) throw new Error("Formato de imagem não suportado.")
            const src = await readDataUrl(file)
            const img = await loadImage(src)
            if (request !== requestRef.current) return
            setImage({ id: newId("image"), name: file.name, src, width: img.naturalWidth, height: img.naturalHeight })
            setDecoded(img); setName(file.name.replace(/\.[^.]+$/, ""))
          } catch (err) { if (request === requestRef.current) setError(err instanceof Error ? err.message : "Erro ao carregar imagem.") }
          finally { if (request === requestRef.current) setLoading(false) }
        }} />
      </label>
      <label className="space-y-1 text-xs">Nome do tileset<input aria-label="Nome do tileset" className={inputClass} value={name} onChange={(e) => setName(e.target.value)} /></label>
      <label className="space-y-1 text-xs">Modo de recorte<select aria-label="Modo de recorte" className={inputClass} value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}><option value="grid">Grade regular</option><option value="atlas">Atlas JSON (frames em objeto)</option></select></label>
      {mode === "grid" ? <div className="grid grid-cols-2 gap-2">
        {([["width", "Largura do tile"], ["height", "Altura do tile"], ["margin", "Margem"], ["spacing", "Espaçamento"]] as const).map(([key, label]) => <label key={key} className="text-xs">{label}<input aria-label={label} type="number" min={key === "width" || key === "height" ? 1 : 0} step={1} className={inputClass} value={Number.isNaN(grid[key]) ? "" : grid[key]} onChange={(e) => setGrid({ ...grid, [key]: e.target.value === "" ? NaN : Number(e.target.value) })} /></label>)}
      </div> : <label className="space-y-1 text-xs">Atlas JSON<input aria-label="Arquivo do atlas" type="file" accept=".json,application/json" className={inputClass} onChange={async (e) => {
        const file = e.target.files?.[0]
        if (!file) return
        setAtlas(null); setError(null)
        try { setAtlas(JSON.parse(await file.text())) }
        catch { setError("JSON do atlas inválido.") }
      }} /></label>}
      {image && <p className="text-xs text-[#aaaacc]">{image.width} × {image.height} px · {preview.crops.length} recortes completos</p>}
      {decoded && <SheetPreview image={decoded} crops={preview.crops} />}
      {(error || preview.error) && <p role="alert" className="text-xs text-amber-300">{error ?? preview.error}</p>}
      <button className={buttonClass} disabled={loading || !image || !decoded || !name.trim() || !!preview.error || !!error} onClick={() => {
        if (!image || !decoded || preview.error) return
        onAddTileset(image, { id: newId("tileset"), name: name.trim(), imageId: image.id, mode, ...(mode === "grid" ? { grid } : {}), crops: preview.crops }, decoded)
        onOpenChange(false)
      }}>{loading ? "Carregando…" : "Adicionar tileset"}</button>
    </DialogContent>
  </Dialog>
}

// Kept for integrations using the original built-in definitions.
export { OBJECTS, ENEMIES, PLAYER_SPAWN } from "./default-elements"
