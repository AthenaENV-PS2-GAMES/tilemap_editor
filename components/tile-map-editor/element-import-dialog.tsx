"use client"

import { useEffect, useRef, useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import type { ElementResource, ImageResource, ProjectDocument } from "./types"
import { newId } from "./project"
import { loadImage, readDataUrl } from "./project-files"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  project: ProjectDocument
  images: Map<string, HTMLImageElement>
  onCreate: (definition: ElementResource, image?: ImageResource, decoded?: HTMLImageElement) => void
}

const inputClass = "w-full rounded border border-[#2a2a4a] bg-[#1a1a2e] p-1.5 text-xs text-[#e0e0e0]"

export function ElementImportDialog({ open, onOpenChange, project, images, onCreate }: Props) {
  const [sourceMode, setSourceMode] = useState<"image" | "crop">("image")
  const [image, setImage] = useState<ImageResource | null>(null)
  const [decoded, setDecoded] = useState<HTMLImageElement | null>(null)
  const [name, setName] = useState("")
  const [category, setCategory] = useState<ElementResource["category"]>("Objetos")
  const [tilesetId, setTilesetId] = useState("")
  const [cropId, setCropId] = useState("")
  const [error, setError] = useState<string | null>(null)
  const requestRef = useRef(0)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const tileset = project.tilesets.find((item) => item.id === tilesetId) ?? project.tilesets[0]
  const crop = tileset?.crops.find((item) => item.id === cropId) ?? tileset?.crops[0]
  const cropImage = tileset ? images.get(tileset.imageId) : undefined

  useEffect(() => {
    if (!open) {
      requestRef.current++
      setSourceMode("image"); setImage(null); setDecoded(null); setName(""); setError(null)
      setCategory("Objetos"); setTilesetId(""); setCropId("")
    }
  }, [open])

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d")
    if (!canvas || !ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    const source = sourceMode === "image" ? decoded : cropImage
    const bounds = sourceMode === "image" && decoded
      ? { x: 0, y: 0, width: decoded.naturalWidth, height: decoded.naturalHeight }
      : crop
    if (!source || !bounds) return
    const scale = Math.min(64 / bounds.width, 64 / bounds.height)
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(source, bounds.x, bounds.y, bounds.width, bounds.height,
      (64 - bounds.width * scale) / 2, (64 - bounds.height * scale) / 2, bounds.width * scale, bounds.height * scale)
  }, [sourceMode, decoded, cropImage, crop])

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[90vh] overflow-y-auto border-[#2a2a4a] bg-[#16213e] text-[#e0e0e0]">
      <DialogTitle>Criar elemento</DialogTitle>
      <DialogDescription>Cadastre um recurso reutilizável a partir de uma imagem ou de um recorte. Cada colocação cria uma instância própria.</DialogDescription>
      <label className="text-xs">Origem
        <select aria-label="Origem do elemento" className={inputClass} value={sourceMode} onChange={(event) => {
          setSourceMode(event.target.value as "image" | "crop")
          setError(null)
        }}>
          <option value="image">Imagem</option>
          <option value="crop">Recorte de tileset</option>
        </select>
      </label>
      {sourceMode === "image" ? <label className="text-xs">Imagem (PNG, JPEG, WebP ou GIF)
        <input aria-label="Imagem do elemento" type="file" accept="image/png,image/jpeg,image/webp,image/gif" className={inputClass} onChange={async (event) => {
          const file = event.target.files?.[0]
          if (!file) return
          const request = ++requestRef.current
          setError(null); setImage(null); setDecoded(null)
          try {
            if (!["image/png", "image/jpeg", "image/webp", "image/gif"].includes(file.type)) throw new Error("Formato de imagem não suportado.")
            const src = await readDataUrl(file)
            const loaded = await loadImage(src)
            if (request !== requestRef.current) return
            setImage({ id: newId("image"), name: file.name, src, width: loaded.naturalWidth, height: loaded.naturalHeight })
            setDecoded(loaded)
            setName((current) => current || file.name.replace(/\.[^.]+$/, ""))
          } catch (reason) {
            if (request === requestRef.current) setError(reason instanceof Error ? reason.message : "Erro ao carregar imagem.")
          }
        }} />
      </label> : <>
        <label className="text-xs">Tileset
          <select aria-label="Tileset do elemento" className={inputClass} value={tileset?.id ?? ""} onChange={(event) => { setTilesetId(event.target.value); setCropId("") }}>
            {project.tilesets.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <label className="text-xs">Recorte
          <select aria-label="Recorte do elemento" className={inputClass} value={crop?.id ?? ""} onChange={(event) => { setCropId(event.target.value); setName((current) => current || tileset?.crops.find((item) => item.id === event.target.value)?.name || "") }}>
            {tileset?.crops.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.width} × {item.height})</option>)}
          </select>
        </label>
      </>}
      <label className="text-xs">Nome
        <input aria-label="Nome do elemento" className={inputClass} maxLength={80} value={name} onChange={(event) => setName(event.target.value)} />
      </label>
      <label className="text-xs">Categoria
        <select aria-label="Categoria do elemento" className={inputClass} value={category} onChange={(event) => setCategory(event.target.value as ElementResource["category"])}>
          {(["Objetos", "Inimigos", "Player", "Decoração"] as const).map((item) => <option key={item}>{item}</option>)}
        </select>
      </label>
      <canvas ref={canvasRef} width={64} height={64} className="rounded bg-[#1a1a2e]" style={{ imageRendering: "pixelated" }} aria-label="Prévia do elemento" />
      {error && <p role="alert" className="text-xs text-amber-300">{error}</p>}
      <button type="button" disabled={!!error || !name.trim() || (sourceMode === "image" ? !image || !decoded : !tileset || !crop || !cropImage)} className="rounded bg-[#4a90d9] px-2 py-1.5 text-xs text-white disabled:opacity-40" onClick={() => {
        if (!name.trim()) return
        const source = sourceMode === "image" ? image : project.images.find((item) => item.id === tileset?.imageId)
        const sourceCrop = sourceMode === "image" && image
          ? { id: "full", name: name.trim(), x: 0, y: 0, width: image.width, height: image.height }
          : crop
        if (!source || !sourceCrop) return
        onCreate({ id: newId("element"), name: name.trim(), category, imageId: source.id, crop: sourceCrop }, sourceMode === "image" ? source : undefined, sourceMode === "image" ? decoded ?? undefined : undefined)
        onOpenChange(false)
      }}>Adicionar elemento</button>
    </DialogContent>
  </Dialog>
}
