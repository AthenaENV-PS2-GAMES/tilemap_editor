"use client"

import { useMemo, useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import type { ObjectAlignment } from "./types"
import { validateObjectAlignment } from "./project"

export function ObjectAlignmentPanel({ alignment, onChange, title = "Objetos", buttonLabel = "Alinhamento…", description = "Define apenas a posição de novos objetos. Instâncias já colocadas permanecem onde estão." }: { alignment: ObjectAlignment; onChange: (alignment: ObjectAlignment) => void; title?: string; buttonLabel?: string; description?: string }) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(alignment)
  const error = useMemo(() => {
    try { validateObjectAlignment(draft); return null }
    catch (reason) { return reason instanceof Error ? reason.message : "Alinhamento inválido." }
  }, [draft])
  const inputClass = "w-full rounded bg-[#1a1a2e] px-2 py-1.5 text-xs text-[#e0e0e0]"

  return <section aria-label={`Alinhamento: ${title}`} className="border-b border-l border-[#2a2a4a] bg-[#16213e] p-2">
    <div className="mb-2 flex items-center justify-between">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-[#8888aa]">{title}</h2>
      <button type="button" className="rounded bg-[#2a2a4a] px-2 py-1 text-xs hover:bg-[#3a3a5a]" onClick={() => { setDraft({ ...alignment, origin: { ...alignment.origin } }); setOpen(true) }}>{buttonLabel}</button>
    </div>
    <p className="text-[10px] text-[#aaaacc]">{alignment.enabled ? `Grade ${alignment.cellWidth} × ${alignment.cellHeight}, origem ${alignment.origin.x}, ${alignment.origin.y}` : "Posição livre"}</p>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="border-[#2a2a4a] bg-[#16213e] text-[#e0e0e0]">
        <DialogTitle>Alinhamento: {title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
        <label className="flex items-center gap-2 text-xs"><input aria-label={title === "Objetos" ? "Alinhar novos objetos" : "Alinhar marcadores e colliders"} type="checkbox" checked={draft.enabled} onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })} />Alinhar à grade</label>
        <div className="grid grid-cols-2 gap-2">
          {([["cellWidth", "Largura"], ["cellHeight", "Altura"], ["originX", "Origem X"], ["originY", "Origem Y"]] as const).map(([key, label]) => <label key={key} className="text-xs">{label}<input aria-label={`${label} do alinhamento de ${title.toLowerCase()}`} type="number" step="1" min={key.startsWith("cell") ? 1 : undefined} className={inputClass} value={Number.isNaN(key === "originX" ? draft.origin.x : key === "originY" ? draft.origin.y : draft[key]) ? "" : key === "originX" ? draft.origin.x : key === "originY" ? draft.origin.y : draft[key]} onChange={(e) => {
            const value = e.target.value === "" ? NaN : Number(e.target.value)
            if (key === "originX") setDraft({ ...draft, origin: { ...draft.origin, x: value } })
            else if (key === "originY") setDraft({ ...draft, origin: { ...draft.origin, y: value } })
            else setDraft({ ...draft, [key]: value })
          }} /></label>)}
        </div>
        {error && <p role="alert" className="text-xs text-amber-300">{error}</p>}
        <button type="button" disabled={!!error} className="rounded bg-[#4a90d9] px-2 py-1.5 text-xs text-white disabled:opacity-40" onClick={() => { if (!error) { onChange(draft); setOpen(false) } }}>Aplicar alinhamento</button>
      </DialogContent>
    </Dialog>
  </section>
}
