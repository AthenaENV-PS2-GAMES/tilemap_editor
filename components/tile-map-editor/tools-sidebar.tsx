"use client"

import type { Tool } from "./types"
import { MousePointer, Pencil, Eraser, Square, Hand, MapPin } from "lucide-react"

interface ToolsSidebarProps {
  activeTool: Tool
  onToolChange: (tool: Tool) => void
}

const tools: { id: Tool; label: string; icon: React.ReactNode; key: string }[] = [
  { id: "drag", label: "Mover câmera", icon: <Hand className="h-4 w-4" />, key: "D" },
  { id: "place", label: "Pintar", icon: <Pencil className="h-4 w-4" />, key: "P" },
  { id: "erase", label: "Apagar", icon: <Eraser className="h-4 w-4" />, key: "E" },
  { id: "select", label: "Selecionar", icon: <MousePointer className="h-4 w-4" />, key: "S" },
  { id: "collider", label: "Collider", icon: <Square className="h-4 w-4" />, key: "C" },
  { id: "marker", label: "Marcador", icon: <MapPin className="h-4 w-4" />, key: "M" },
]

export function ToolsSidebar({ activeTool, onToolChange }: ToolsSidebarProps) {
  return (
    <div className="flex w-11 shrink-0 flex-col items-center gap-1 border-r border-[#2a2a4a] bg-[#16213e] py-2">
      {tools.map((tool) => (
        <button
          key={tool.id}
          title={`${tool.label} (${tool.key})`}
          aria-label={tool.label}
          aria-pressed={activeTool === tool.id}
          onClick={() => onToolChange(tool.id)}
          className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
            activeTool === tool.id
              ? "bg-[#4a90d9] text-[#ffffff]"
              : "text-[#8888aa] hover:bg-[#2a2a4a] hover:text-[#e0e0e0]"
          }`}
        >
          {tool.icon}
        </button>
      ))}
    </div>
  )
}
