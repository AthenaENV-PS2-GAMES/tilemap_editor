"use client"

import type { Camera } from "./types"
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
  onImportMap: () => void
  onSaveProject: () => void
  fileBusy: boolean
  onExport: () => void
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
  onImportMap,
  onSaveProject,
  fileBusy,
  onExport,
  onUndo,
  onRedo,
  onClearAll,
  onResetView,
  onToggleFullscreen,
}: MenuBarProps) {
  return (
    <div className="flex h-9 shrink-0 items-center justify-between border-b border-[#2a2a4a] bg-[#16213e] px-2">
      <Menubar className="h-auto gap-0 border-0 bg-transparent p-0 shadow-none">
        <MenubarMenu>
          <MenubarTrigger className={triggerClass}>Arquivo</MenubarTrigger>
          <MenubarContent className={contentClass}>
            <MenubarItem className={itemClass} disabled={fileBusy} onSelect={onImportMap}>
              Abrir projeto / mapa antigo…
            </MenubarItem>
            <MenubarItem className={itemClass} disabled={fileBusy} onSelect={onSaveProject}>
              Salvar projeto (com imagens)
            </MenubarItem>
            <MenubarItem className={itemClass} onSelect={onExport}>
              Exportar mapa antigo
            </MenubarItem>
          </MenubarContent>
        </MenubarMenu>

        <MenubarMenu>
          <MenubarTrigger className={triggerClass}>Editar</MenubarTrigger>
          <MenubarContent className={contentClass}>
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
  )
}
