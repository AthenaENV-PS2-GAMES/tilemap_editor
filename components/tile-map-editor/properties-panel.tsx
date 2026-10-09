"use client"

import type { PlacedTile, Collider, ColliderType, Marker } from "./types"
import { LAYER_COUNT } from "./types"
import { CopyCheck, Trash2, X } from "lucide-react"

interface PropertiesPanelProps {
  selectedTiles: PlacedTile[]
  selectedColliders: Collider[]
  selectedMarkers: Marker[]
  onSelectMatching: () => void
  onClearSelection: () => void
  onDeleteSelection: () => void
  onUpdateTile: (changes: Partial<PlacedTile>) => void
  onUpdateCollider: (changes: Partial<Collider>) => void
  onUpdateMarker: (changes: Partial<Marker>) => void
}

export function PropertiesPanel({
  selectedTiles,
  selectedColliders,
  selectedMarkers,
  onSelectMatching,
  onClearSelection,
  onDeleteSelection,
  onUpdateTile,
  onUpdateCollider,
  onUpdateMarker,
}: PropertiesPanelProps) {
  const selectedTile = selectedTiles[0]
  const selectedCollider = selectedColliders[0]
  const selectedMarker = selectedMarkers[0]
  const count = selectedTiles.length + selectedColliders.length + selectedMarkers.length
  const multiple = count > 1
  const mixedLayers = selectedTiles.some((tile) => (tile.layer ?? 0) !== (selectedTile?.layer ?? 0))
  const mixedLocks = selectedTiles.some((tile) => !!tile.locked !== !!selectedTile?.locked)
  const mixedWidths = selectedColliders.some((collider) => collider.width !== selectedCollider?.width)
  const mixedHeights = selectedColliders.some((collider) => collider.height !== selectedCollider?.height)
  const selectionActions = (
    <div className="space-y-2 border-b border-[#2a2a4a] p-3">
      <div className="flex items-center justify-between">
        <p role="status" className="text-xs text-[#e0e0e0]">
          {count} {count === 1 ? "elemento selecionado" : "elementos selecionados"}
        </p>
        <button type="button" onClick={onClearSelection} title="Limpar seleção (Esc)" aria-label="Limpar seleção" className="rounded p-1 text-[#8888aa] hover:bg-[#2a2a4a] hover:text-white">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <button type="button" onClick={onSelectMatching} className="flex w-full items-center justify-center gap-1.5 rounded bg-[#4a90d9] px-2 py-1.5 text-xs text-white hover:bg-[#3a7bc8]">
        <CopyCheck className="h-3.5 w-3.5" />
        Selecionar todos os iguais
      </button>
      <p className="text-[10px] leading-relaxed text-[#8888aa]">
        {selectedTile ? "Mesmo ID em todas as camadas, inclusive ocultas." : selectedCollider ? "Todos os colliders do mesmo tipo." : "Todos os marcadores com o mesmo nome."}
      </p>
      {multiple && (
        <p className="text-[10px] leading-relaxed text-[#8888aa]">
          As alterações afetam toda a seleção. X e Y movem o grupo mantendo as distâncias.
        </p>
      )}
      <button type="button" onClick={onDeleteSelection} className="flex w-full items-center justify-center gap-1.5 rounded border border-red-400/30 px-2 py-1.5 text-xs text-red-400 hover:bg-red-900/30">
        <Trash2 className="h-3.5 w-3.5" />
        Excluir {multiple ? "selecionados" : "selecionado"}
      </button>
    </div>
  )
  const hasSelection = selectedTile || selectedCollider || selectedMarker

  if (!hasSelection) {
    return (
      <div className="flex w-56 flex-col border-l border-[#2a2a4a] bg-[#16213e]">
        <div className="border-b border-[#2a2a4a] px-3 py-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[#8888aa]">
            Propriedades
          </h2>
        </div>
        <div className="flex flex-1 items-center justify-center p-4">
          <p className="text-center text-xs text-[#555577]">
            Selecione um elemento para ver as propriedades
          </p>
        </div>
      </div>
    )
  }

  if (selectedTile) {
    return (
      <div className="flex w-56 flex-col border-l border-[#2a2a4a] bg-[#16213e]">
        <div className="border-b border-[#2a2a4a] px-3 py-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[#8888aa]">
            {multiple ? "Elementos" : "Elemento"}
          </h2>
        </div>
        {selectionActions}
        <div className="flex flex-col gap-3 p-3">
          <div>
            <label className="mb-1 block text-[10px] uppercase tracking-wider text-[#555577]">
              ID
            </label>
            <div className="rounded bg-[#1a1a2e] px-2 py-1.5 text-xs text-[#e0e0e0]">
              {selectedTile.tileId}
            </div>
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="mb-1 block text-[10px] uppercase tracking-wider text-[#555577]">
                {multiple ? "X (referência)" : "X"}
              </label>
              <input
                type="number"
                value={selectedTile.x}
                onChange={(e) =>
                  onUpdateTile({
                    x: parseInt(e.target.value) || 0,
                  })
                }
                className="w-full rounded bg-[#1a1a2e] px-2 py-1.5 text-xs text-[#e0e0e0] outline-none focus:ring-1 focus:ring-[#4a90d9]"
              />
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-[10px] uppercase tracking-wider text-[#555577]">
                {multiple ? "Y (referência)" : "Y"}
              </label>
              <input
                type="number"
                value={selectedTile.y}
                onChange={(e) =>
                  onUpdateTile({
                    y: parseInt(e.target.value) || 0,
                  })
                }
                className="w-full rounded bg-[#1a1a2e] px-2 py-1.5 text-xs text-[#e0e0e0] outline-none focus:ring-1 focus:ring-[#4a90d9]"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-[10px] uppercase tracking-wider text-[#555577]">
              Camada
            </label>
            <select
              aria-label="Camada da seleção"
              value={mixedLayers ? "" : selectedTile.layer ?? 0}
              onChange={(e) =>
                onUpdateTile({ layer: parseInt(e.target.value) })
              }
              className="w-full rounded bg-[#1a1a2e] px-2 py-1.5 text-xs text-[#e0e0e0] outline-none focus:ring-1 focus:ring-[#4a90d9]"
            >
              {mixedLayers && <option value="" disabled>Várias camadas</option>}
              {Array.from({ length: LAYER_COUNT }, (_, i) => (
                <option key={i} value={i}>
                  Camada {i + 1}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[10px] uppercase tracking-wider text-[#555577]">
              Bloqueio
            </label>
            <select
              aria-label="Bloqueio da seleção"
              value={mixedLocks ? "" : selectedTile.locked ? "true" : "false"}
              onChange={(e) => onUpdateTile({ locked: e.target.value === "true" })}
              className="w-full rounded bg-[#1a1a2e] px-2 py-1.5 text-xs text-[#e0e0e0] outline-none focus:ring-1 focus:ring-[#4a90d9]"
            >
              {mixedLocks && <option value="" disabled>Vários valores</option>}
              <option value="false">Desbloqueado</option>
              <option value="true">Bloqueado</option>
            </select>
          </div>
        </div>
      </div>
    )
  }

  if (selectedMarker) {
    return (
      <div className="flex w-56 flex-col border-l border-[#2a2a4a] bg-[#16213e]">
        <div className="flex items-center justify-between border-b border-[#2a2a4a] px-3 py-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[#8888aa]">
            {multiple ? "Marcadores" : "Marcador"}
          </h2>
        </div>
        {selectionActions}
        <div className="flex flex-col gap-3 p-3">
          <div>
            <label className="mb-1 block text-[10px] uppercase tracking-wider text-[#555577]">Nome</label>
            <input
              type="text"
              value={selectedMarker.name}
              onChange={(e) =>
                onUpdateMarker({ name: e.target.value })
              }
              className="w-full rounded bg-[#1a1a2e] px-2 py-1.5 text-xs text-[#e0e0e0] outline-none focus:ring-1 focus:ring-[#4a90d9]"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-[10px] uppercase tracking-wider text-[#555577]">{multiple ? "X (referência)" : "X"}</label>
              <input
                type="number"
                value={selectedMarker.x}
                onChange={(e) =>
                  onUpdateMarker({
                    x: parseInt(e.target.value) || 0,
                  })
                }
                className="w-full rounded bg-[#1a1a2e] px-2 py-1.5 text-xs text-[#e0e0e0] outline-none focus:ring-1 focus:ring-[#4a90d9]"
              />
            </div>
            <div>
              <label className="mb-1 block text-[10px] uppercase tracking-wider text-[#555577]">{multiple ? "Y (referência)" : "Y"}</label>
              <input
                type="number"
                value={selectedMarker.y}
                onChange={(e) =>
                  onUpdateMarker({
                    y: parseInt(e.target.value) || 0,
                  })
                }
                className="w-full rounded bg-[#1a1a2e] px-2 py-1.5 text-xs text-[#e0e0e0] outline-none focus:ring-1 focus:ring-[#4a90d9]"
              />
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (selectedCollider) {
    return (
      <div className="flex w-56 flex-col border-l border-[#2a2a4a] bg-[#16213e]">
        <div className="flex items-center justify-between border-b border-[#2a2a4a] px-3 py-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[#8888aa]">
            {multiple ? "Colliders" : "Collider"}
          </h2>
        </div>
        {selectionActions}
        <div className="flex flex-col gap-3 p-3">
          <div>
            <label className="mb-1 block text-[10px] uppercase tracking-wider text-[#555577]">
              Tipo
            </label>
            <select
              value={selectedCollider.type}
              onChange={(e) =>
                onUpdateCollider({
                  type: e.target.value as ColliderType,
                })
              }
              className="w-full rounded bg-[#1a1a2e] px-2 py-1.5 text-xs text-[#e0e0e0] outline-none focus:ring-1 focus:ring-[#4a90d9]"
            >
              <option value="ground">ground</option>
              <option value="chest">chest</option>
              <option value="ladder">ladder</option>
              <option value="door">door</option>
              <option value="kill">kill</option>
            </select>
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="mb-1 block text-[10px] uppercase tracking-wider text-[#555577]">
                {multiple ? "X (referência)" : "X"}
              </label>
              <input
                type="number"
                value={selectedCollider.x}
                onChange={(e) =>
                  onUpdateCollider({
                    x: parseInt(e.target.value) || 0,
                  })
                }
                className="w-full rounded bg-[#1a1a2e] px-2 py-1.5 text-xs text-[#e0e0e0] outline-none focus:ring-1 focus:ring-[#4a90d9]"
              />
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-[10px] uppercase tracking-wider text-[#555577]">
                {multiple ? "Y (referência)" : "Y"}
              </label>
              <input
                type="number"
                value={selectedCollider.y}
                onChange={(e) =>
                  onUpdateCollider({
                    y: parseInt(e.target.value) || 0,
                  })
                }
                className="w-full rounded bg-[#1a1a2e] px-2 py-1.5 text-xs text-[#e0e0e0] outline-none focus:ring-1 focus:ring-[#4a90d9]"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="mb-1 block text-[10px] uppercase tracking-wider text-[#555577]">
                Largura
              </label>
              <input
                type="number"
                value={mixedWidths ? "" : selectedCollider.width}
                placeholder="Vários valores"
                onChange={(e) =>
                  onUpdateCollider({
                    width: parseInt(e.target.value) || 16,
                  })
                }
                className="w-full rounded bg-[#1a1a2e] px-2 py-1.5 text-xs text-[#e0e0e0] outline-none focus:ring-1 focus:ring-[#4a90d9]"
              />
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-[10px] uppercase tracking-wider text-[#555577]">
                Altura
              </label>
              <input
                type="number"
                value={mixedHeights ? "" : selectedCollider.height}
                placeholder="Vários valores"
                onChange={(e) =>
                  onUpdateCollider({
                    height: parseInt(e.target.value) || 16,
                  })
                }
                className="w-full rounded bg-[#1a1a2e] px-2 py-1.5 text-xs text-[#e0e0e0] outline-none focus:ring-1 focus:ring-[#4a90d9]"
              />
            </div>
          </div>
        </div>
      </div>
    )
  }

  return null
}
