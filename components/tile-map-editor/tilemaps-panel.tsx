"use client"

import { useEffect, useMemo, useState } from "react"
import { Eye, EyeOff, Plus, Settings2 } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import type { Tilemap } from "./types"
import { previewTilemapGrid, type GridChangePolicy, type TilemapGrid } from "./project"

interface TilemapsPanelProps {
  tilemaps: Tilemap[]
  activeId: string
  onCreate: () => void
  onSelect: (id: string) => void
  onRename: (id: string, name: string) => void
  onVisibility: (id: string, visible: boolean) => void
  onConfigure: (id: string, grid: TilemapGrid, policy: GridChangePolicy) => void
  onLayerChange: (id: string, layer: number) => void
}

const inputClass = "w-full rounded bg-[#1a1a2e] px-2 py-1.5 text-xs text-[#e0e0e0] outline-none focus:ring-1 focus:ring-[#4a90d9]"

export function TilemapsPanel({ tilemaps, activeId, onCreate, onSelect, onRename, onVisibility, onConfigure, onLayerChange }: TilemapsPanelProps) {
  const active = tilemaps.find((map) => map.id === activeId) ?? tilemaps[0]
  const [name, setName] = useState(active?.name ?? "")
  const [configOpen, setConfigOpen] = useState(false)
  const [draft, setDraft] = useState<TilemapGrid>({ cellWidth: 16, cellHeight: 16, origin: { x: 0, y: 0 } })
  const [policy, setPolicy] = useState<GridChangePolicy | null>(null)

  useEffect(() => { setName(active?.name ?? "") }, [active?.id, active?.name])

  const preview = useMemo(() => {
    if (!active) return { value: null, error: "Tilemap não encontrado." }
    try { return { value: previewTilemapGrid(active, draft), error: null } }
    catch (error) { return { value: null, error: error instanceof Error ? error.message : "Grade inválida." } }
  }, [active, draft])
  const changed = active && (active.cellWidth !== draft.cellWidth || active.cellHeight !== draft.cellHeight || active.origin.x !== draft.origin.x || active.origin.y !== draft.origin.y)
  const needsChoice = changed && !!active?.tiles.length

  function applyName() {
    if (!active) return
    if (name.trim()) onRename(active.id, name.trim())
    else setName(active.name)
  }

  return <section aria-label="Tilemaps" className="border-b border-l border-[#2a2a4a] bg-[#16213e]">
    <div className="flex items-center justify-between border-b border-[#2a2a4a] px-3 py-2">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-[#8888aa]">Tilemaps</h2>
      <button type="button" aria-label="Criar tilemap" title="Criar tilemap" onClick={onCreate} className="rounded p-1 text-[#aaaacc] hover:bg-[#2a2a4a]"><Plus className="h-3.5 w-3.5" /></button>
    </div>
    <div className="max-h-40 overflow-y-auto p-1.5">
      {tilemaps.map((map) => <div key={map.id} className={`flex items-center gap-1 rounded text-xs ${active?.id === map.id ? "bg-[#4a90d9] text-white" : "text-[#aaaacc] hover:bg-[#2a2a4a]"}`}>
        <button type="button" aria-label={`Selecionar ${map.name}`} aria-pressed={active?.id === map.id} onClick={() => onSelect(map.id)} className="min-w-0 flex-1 truncate px-2 py-1.5 text-left">{map.name} <span className="opacity-70">({map.tiles.length})</span></button>
        <button type="button" aria-label={`${map.visible ? "Ocultar" : "Mostrar"} ${map.name}`} title={map.visible ? "Ocultar tilemap" : "Mostrar tilemap"} onClick={() => onVisibility(map.id, !map.visible)} className="p-1.5">{map.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}</button>
      </div>)}
    </div>
    {active && <div className="space-y-2 border-t border-[#2a2a4a] p-2">
      <label className="block text-[10px] text-[#8888aa]">Nome do tilemap
        <input aria-label="Nome do tilemap ativo" className={inputClass} value={name} onChange={(e) => setName(e.target.value)} onBlur={applyName} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur() }} maxLength={80} />
      </label>
      <label className="block text-[10px] text-[#8888aa]">Camada do tilemap
        <select aria-label="Camada do tilemap ativo" className={inputClass} value={active.layer ?? 0} onChange={(event) => onLayerChange(active.id, Number(event.target.value))}>
          {[0, 1, 2, 3, 4].map((layer) => <option key={layer} value={layer}>Camada {layer + 1}</option>)}
        </select>
      </label>
      <button type="button" className="flex w-full items-center justify-center gap-1 rounded bg-[#2a2a4a] px-2 py-1.5 text-xs hover:bg-[#3a3a5a]" onClick={() => {
        setDraft({ cellWidth: active.cellWidth, cellHeight: active.cellHeight, origin: { ...active.origin } })
        setPolicy(null)
        setConfigOpen(true)
      }}><Settings2 className="h-3.5 w-3.5" />Grade {active.cellWidth} × {active.cellHeight}, origem {active.origin.x}, {active.origin.y}</button>
    </div>}
    <Dialog open={configOpen} onOpenChange={setConfigOpen}>
      <DialogContent className="max-h-[90vh] overflow-y-auto border-[#2a2a4a] bg-[#16213e] text-[#e0e0e0]">
        <DialogTitle>Configurar grade de {active?.name}</DialogTitle>
        <DialogDescription>A grade posiciona tiles neste tilemap. Os recortes mantêm seu tamanho visual e a grade dos objetos continua separada.</DialogDescription>
        <div className="grid grid-cols-2 gap-2">
          {([["cellWidth", "Largura da célula"], ["cellHeight", "Altura da célula"], ["originX", "Origem X"], ["originY", "Origem Y"]] as const).map(([key, label]) => <label key={key} className="text-xs">{label}
            <input aria-label={label} type="number" step="1" min={key.startsWith("cell") ? 1 : undefined} className={inputClass} value={Number.isNaN(key === "originX" ? draft.origin.x : key === "originY" ? draft.origin.y : draft[key]) ? "" : key === "originX" ? draft.origin.x : key === "originY" ? draft.origin.y : draft[key]} onChange={(e) => {
              const value = e.target.value === "" ? NaN : Number(e.target.value)
              if (key === "originX") setDraft({ ...draft, origin: { ...draft.origin, x: value } })
              else if (key === "originY") setDraft({ ...draft, origin: { ...draft.origin, y: value } })
              else setDraft({ ...draft, [key]: value })
            }} />
          </label>)}
        </div>
        {preview.error && <p role="alert" className="text-xs text-amber-300">{preview.error}</p>}
        {needsChoice && preview.value && <div className="space-y-2 rounded border border-[#2a2a4a] p-2 text-xs">
          <p className="font-semibold text-[#e0e0e0]">Prévia da alteração</p>
          <p>{preview.value.count} tile(s) neste mapa. Com reposicionamento, {preview.value.moved} mudam de posição.</p>
          <div className="max-h-24 overflow-y-auto text-[10px] text-[#aaaacc]">
            {preview.value.samples.map((sample) => <p key={sample.id}>({sample.before.x}, {sample.before.y}) → ({sample.after.x}, {sample.after.y})</p>)}
          </div>
          <label className="flex gap-2"><input type="radio" name="grid-policy" checked={policy === "keep-world"} onChange={() => setPolicy("keep-world")} />Manter posições no mundo; tiles podem ficar fora da nova grade</label>
          <label className="flex gap-2"><input type="radio" name="grid-policy" checked={policy === "keep-cells"} onChange={() => setPolicy("keep-cells")} />Manter células; reposicionar tiles na nova grade</label>
        </div>}
        <button type="button" disabled={!!preview.error || !changed || !!(needsChoice && !policy)} className="rounded bg-[#4a90d9] px-2 py-1.5 text-xs text-white disabled:opacity-40" onClick={() => {
          if (!active || !changed || preview.error || (needsChoice && !policy)) return
          onConfigure(active.id, draft, policy ?? "keep-world")
          setConfigOpen(false)
        }}>Aplicar grade</button>
      </DialogContent>
    </Dialog>
  </section>
}
