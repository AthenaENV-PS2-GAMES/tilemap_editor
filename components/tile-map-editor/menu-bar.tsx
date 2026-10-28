"use client"

import { useState } from "react"
import type { Camera, CanvasSize } from "./types"
import { MAX_CANVAS_SIZE } from "./project"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import {
  Menubar,
  MenubarCheckboxItem,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarSeparator,
  MenubarShortcut,
  MenubarTrigger,
} from "@/components/ui/menubar"

interface MenuBarProps {
  camera: Camera
  isFullscreen: boolean
  canUndo: boolean
  canRedo: boolean
  showColliders: boolean
  onShowCollidersChange: (show: boolean) => void
  showMarkers: boolean
  onShowMarkersChange: (show: boolean) => void
  backgroundColor: string
  onBackgroundColorChange: (color: string) => void
  canvasSize: CanvasSize
  onCanvasSizeChange: (size: CanvasSize) => void
  onImportMap: () => void
  onSaveProject: () => void
  fileBusy: boolean
  pendingCount: number
  onAttach: () => void
  onUndo: () => void
  onRedo: () => void
  onClearAll: () => void
  onResetView: () => void
  onToggleFullscreen: () => void
}

const triggerClass =
  "h-7 cursor-pointer rounded px-2.5 text-xs font-medium text-[#8888aa] hover:bg-[#2a2a4a] hover:text-[#e0e0e0] data-[state=open]:bg-[#2a2a4a] data-[state=open]:text-[#e0e0e0]"
const contentClass =
  "border-[#2a2a4a] bg-[#16213e] text-[#e0e0e0]"
const itemClass =
  "text-xs focus:bg-[#2a2a4a] focus:text-[#ffffff]"

export function MenuBar({
  camera,
  isFullscreen,
  canUndo,
  canRedo,
  showColliders,
  onShowCollidersChange,
  showMarkers,
  onShowMarkersChange,
  backgroundColor,
  onBackgroundColorChange,
  canvasSize,
  onCanvasSizeChange,
  onImportMap,
  onSaveProject,
  fileBusy,
  pendingCount,
  onAttach,
  onUndo,
  onRedo,
  onClearAll,
  onResetView,
  onToggleFullscreen,
}: MenuBarProps) {
  const [sizeOpen, setSizeOpen] = useState(false)
  const [draft, setDraft] = useState({ width: String(canvasSize.width), height: String(canvasSize.height) })
  const width = Number(draft.width)
  const height = Number(draft.height)
  const valid = draft.width.trim() !== "" && draft.height.trim() !== "" &&
    Number.isSafeInteger(width) && Number.isSafeInteger(height) &&
    width >= 1 && height >= 1 && width <= MAX_CANVAS_SIZE && height <= MAX_CANVAS_SIZE

  function openSize() {
    setDraft({ width: String(canvasSize.width), height: String(canvasSize.height) })
    setSizeOpen(true)
  }

  function applySize() {
    if (!valid) return
    onCanvasSizeChange({ width, height })
    setSizeOpen(false)
  }

  return (
    <>
    <div className="flex h-9 shrink-0 items-center justify-between border-b border-[#2a2a4a] bg-[#16213e] px-2">
      <Menubar className="h-auto gap-0 border-0 bg-transparent p-0 shadow-none">
        <MenubarMenu>
          <MenubarTrigger className={triggerClass}>Arquivo</MenubarTrigger>
          <MenubarContent className={contentClass}>
            <MenubarItem className={itemClass} disabled={fileBusy} onSelect={onImportMap}>
              Abrir projeto…
            </MenubarItem>
            <MenubarItem className={itemClass} disabled={fileBusy} onSelect={onSaveProject}>
              Salvar projeto (sem imagens)
            </MenubarItem>
            <MenubarItem className={itemClass} disabled={!pendingCount} onSelect={onAttach}>
              Anexar imagens e atlas…{pendingCount > 0 && ` (${pendingCount})`}
            </MenubarItem>
          </MenubarContent>
        </MenubarMenu>

        <MenubarMenu>
          <MenubarTrigger className={triggerClass}>Editar</MenubarTrigger>
          <MenubarContent className={contentClass}>
            <MenubarItem className={itemClass} onSelect={openSize}>Tamanho do canvas…</MenubarItem>
            <MenubarSeparator className="bg-[#2a2a4a]" />
            <MenubarItem className={itemClass} disabled={!canUndo} onSelect={onUndo}>
              Desfazer <MenubarShortcut>Ctrl+Z</MenubarShortcut>
            </MenubarItem>
            <MenubarItem className={itemClass} disabled={!canRedo} onSelect={onRedo}>
              Refazer <MenubarShortcut>Ctrl+Y</MenubarShortcut>
            </MenubarItem>
            <MenubarSeparator className="bg-[#2a2a4a]" />
            <MenubarItem className={itemClass} onSelect={onClearAll}>
              Limpar tudo
            </MenubarItem>
          </MenubarContent>
        </MenubarMenu>

        <MenubarMenu>
          <MenubarTrigger className={triggerClass}>Exibir</MenubarTrigger>
          <MenubarContent className={contentClass}>
            <MenubarCheckboxItem
              className={itemClass}
              checked={showColliders}
              onCheckedChange={onShowCollidersChange}
            >
              Mostrar colliders
            </MenubarCheckboxItem>
            <MenubarCheckboxItem
              className={itemClass}
              checked={showMarkers}
              onCheckedChange={onShowMarkersChange}
            >
              Mostrar marcadores
            </MenubarCheckboxItem>
            <MenubarSeparator className="bg-[#2a2a4a]" />
            <MenubarItem className={itemClass} onSelect={onResetView}>
              Resetar vista
            </MenubarItem>
            <MenubarItem className={itemClass} onSelect={onToggleFullscreen}>
              {isFullscreen ? "Sair da tela cheia" : "Tela cheia"}
              <MenubarShortcut>F</MenubarShortcut>
            </MenubarItem>
          </MenubarContent>
        </MenubarMenu>
      </Menubar>

      <div className="flex items-center gap-3 text-xs text-[#8888aa]">
        <button type="button" onClick={openSize} title="Alterar tamanho do canvas" className="hover:text-[#e0e0e0]">{canvasSize.width} × {canvasSize.height} px</button>
        <span>{Math.round(camera.zoom * 100)}%</span>
        <label className="flex cursor-pointer items-center gap-1.5" title="Cor de fundo">
          <span>BG</span>
          <span className="relative block h-5 w-5">
            <input
              type="color"
              value={backgroundColor}
              onChange={(e) => onBackgroundColorChange(e.target.value)}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            />
            <span
              className="block h-5 w-5 rounded border border-[#2a2a4a]"
              style={{ backgroundColor }}
            />
          </span>
        </label>
      </div>
    </div>
    <Dialog open={sizeOpen} onOpenChange={setSizeOpen}>
      <DialogContent className="border-[#2a2a4a] bg-[#16213e] text-[#e0e0e0]">
        <DialogTitle>Tamanho do canvas</DialogTitle>
        <DialogDescription>Defina a área de desenho em pixels. O canto superior esquerdo fica em 0, 0. O conteúdo existente fora da nova área permanece no projeto.</DialogDescription>
        <form onSubmit={(event) => { event.preventDefault(); applySize() }} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {(["width", "height"] as const).map((key) => <label key={key} className="space-y-1 text-xs text-[#aaaacc]">
              {key === "width" ? "Largura (px)" : "Altura (px)"}
              <input type="number" min="1" max={MAX_CANVAS_SIZE} step="1" value={draft[key]} onChange={(event) => setDraft((current) => ({ ...current, [key]: event.target.value }))} className="w-full rounded bg-[#1a1a2e] px-2 py-2 text-sm text-[#e0e0e0] outline-none focus:ring-1 focus:ring-[#4a90d9]" />
            </label>)}
          </div>
          {!valid && <p role="alert" className="text-xs text-amber-300">Use valores inteiros entre 1 e {MAX_CANVAS_SIZE} pixels.</p>}
          <button type="submit" disabled={!valid} className="rounded bg-[#4a90d9] px-3 py-1.5 text-xs text-white disabled:opacity-40">Aplicar tamanho</button>
        </form>
      </DialogContent>
    </Dialog>
    </>
  )
}
