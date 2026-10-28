"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import type { ProjectDocument } from "./types"
import { pendingImages } from "./project"
import { loadImage, readDataUrl } from "./project-files"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  project: ProjectDocument
  onAttach: (imageId: string, source: { src: string; width: number; height: number }, decoded: HTMLImageElement, atlas?: unknown) => void
}

const inputClass = "w-full rounded border border-[#2a2a4a] bg-[#1a1a2e] p-1.5 text-xs text-[#e0e0e0]"
const buttonClass = "rounded bg-[#4a90d9] px-2 py-1.5 text-xs text-white disabled:opacity-40"

export function AttachDialog({ open, onOpenChange, project, onAttach }: Props) {
  const pending = pendingImages(project)
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[90vh] overflow-y-auto border-[#2a2a4a] bg-[#16213e] text-[#e0e0e0]">
      <DialogTitle>Anexar imagens e atlas</DialogTitle>
      <DialogDescription>O projeto guarda apenas os índices dos tiles e suas posições. Anexe a imagem de cada tileset (e o atlas JSON, quando ele usa atlas) usados ao salvar.</DialogDescription>
      {!pending.length && <p className="text-xs text-[#8888aa]">Todas as imagens do projeto estão anexadas.</p>}
      {pending.map((entry) => <PendingRow key={entry.image.id} entry={entry} onAttach={onAttach} />)}
    </DialogContent>
  </Dialog>
}

function PendingRow({ entry, onAttach }: { entry: ReturnType<typeof pendingImages>[number]; onAttach: Props["onAttach"] }) {
  const needsAtlas = entry.tilesets.some((set) => set.mode === "atlas")
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [atlasFile, setAtlasFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const label = [...entry.tilesets.map((set) => `Tileset: ${set.name}`), ...entry.elements.map((item) => `Elemento: ${item.name}`)].join(" · ")

  async function attach() {
    if (!imageFile) return
    setBusy(true); setError(null)
    try {
      const src = await readDataUrl(imageFile)
      const decoded = await loadImage(src)
      const atlas = needsAtlas ? (atlasFile ? JSON.parse(await atlasFile.text()) : undefined) : undefined
      onAttach(entry.image.id, { src, width: decoded.naturalWidth, height: decoded.naturalHeight }, decoded, atlas)
    } catch (reason) {
      setError(reason instanceof SyntaxError ? "JSON do atlas inválido." : reason instanceof Error ? reason.message : "Erro ao anexar.")
    } finally { setBusy(false) }
  }

  return <div className="space-y-2 rounded border border-[#2a2a4a] p-2 text-xs">
    <p className="font-medium">{entry.image.name} <span className="text-[#8888aa]">({entry.image.width} × {entry.image.height} px)</span></p>
    {label && <p className="text-[#8888aa]">{label}</p>}
    <label className="block">Imagem<input aria-label={`Imagem de ${entry.image.name}`} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className={inputClass} onChange={(event) => setImageFile(event.target.files?.[0] ?? null)} /></label>
    {needsAtlas && <label className="block">Atlas JSON<input aria-label={`Atlas de ${entry.image.name}`} type="file" accept=".json,application/json" className={inputClass} onChange={(event) => setAtlasFile(event.target.files?.[0] ?? null)} /></label>}
    {error && <p role="alert" className="text-amber-300">{error}</p>}
    <button type="button" className={buttonClass} disabled={busy || !imageFile || (needsAtlas && !atlasFile)} onClick={attach}>{busy ? "Anexando…" : "Anexar"}</button>
  </div>
}
