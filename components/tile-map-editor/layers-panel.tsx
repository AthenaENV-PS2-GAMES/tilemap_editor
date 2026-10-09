"use client"

import { useId, useState } from "react"
import { ArrowRight, Eye, EyeOff } from "lucide-react"
import { LAYER_COUNT } from "./types"

interface LayersPanelProps {
  activeLayer: number
  hiddenLayers: number[]
  activeLayerElementCount: number
  onActiveLayerChange: (layer: number) => void
  onToggleLayerVisibility: (layer: number) => void
  onMoveLayerElements: (sourceLayer: number, targetLayer: number) => void
}

export function LayersPanel({
  activeLayer,
  hiddenLayers,
  activeLayerElementCount,
  onActiveLayerChange,
  onToggleLayerVisibility,
  onMoveLayerElements,
}: LayersPanelProps) {
  const destinationId = useId()
  const [destination, setDestination] = useState("")
  const targetLayer = destination === "" ? null : Number(destination)
  const canMove = activeLayerElementCount > 0 && targetLayer !== null && targetLayer !== activeLayer

  // Top-most layer first, as in most editors
  const layers = Array.from({ length: LAYER_COUNT }, (_, i) => LAYER_COUNT - 1 - i)

  return (
    <div className="border-b border-l border-[#2a2a4a] bg-[#16213e]">
      <div className="border-b border-[#2a2a4a] px-3 py-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-[#8888aa]">
          Camadas
        </h2>
      </div>
      <ul className="p-1.5">
        {layers.map((layer) => {
          const hidden = hiddenLayers.includes(layer)
          const active = activeLayer === layer
          return (
            <li
              key={layer}
              className={`flex items-center rounded-md text-xs ${
                active ? "bg-[#4a90d9] text-[#ffffff]" : "text-[#8888aa] hover:bg-[#2a2a4a]"
              }`}
            >
              <button
                onClick={() => onActiveLayerChange(layer)}
                className={`flex-1 px-2 py-1.5 text-left ${hidden ? "opacity-50" : ""}`}
              >
                Camada {layer + 1}
              </button>
              <button
                title={hidden ? "Mostrar camada" : "Ocultar camada"}
                aria-label={hidden ? "Mostrar camada" : "Ocultar camada"}
                onClick={() => onToggleLayerVisibility(layer)}
                className="px-2 py-1.5 hover:text-[#ffffff]"
              >
                {hidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </li>
          )
        })}
      </ul>
      <div className="space-y-2 border-t border-[#2a2a4a] px-3 py-2.5">
        <p className="text-xs text-[#8888aa]">
          Camada {activeLayer + 1}: {activeLayerElementCount}{" "}
          {activeLayerElementCount === 1 ? "elemento" : "elementos"}
        </p>
        <label htmlFor={destinationId} className="block text-xs text-[#8888aa]">
          Mover todos para
        </label>
        <select
          id={destinationId}
          value={targetLayer === activeLayer ? "" : destination}
          onChange={(e) => setDestination(e.target.value)}
          className="w-full rounded bg-[#1a1a2e] px-2 py-1.5 text-xs text-[#e0e0e0] outline-none focus:ring-1 focus:ring-[#4a90d9]"
        >
          <option value="">Selecione a camada</option>
          {layers.filter((layer) => layer !== activeLayer).map((layer) => (
            <option key={layer} value={layer}>
              Camada {layer + 1}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={!canMove}
          onClick={() => {
            if (!canMove || targetLayer === null) return
            onMoveLayerElements(activeLayer, targetLayer)
            setDestination("")
          }}
          className="flex w-full items-center justify-center gap-1.5 rounded bg-[#4a90d9] px-2 py-1.5 text-xs text-white hover:bg-[#3a7bc8] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ArrowRight className="h-3.5 w-3.5" />
          Mover todos
        </button>
        <p className="text-[10px] leading-relaxed text-[#8888aa]">
          Mantém as posições e os elementos já existentes no destino.
        </p>
      </div>
    </div>
  )
}
