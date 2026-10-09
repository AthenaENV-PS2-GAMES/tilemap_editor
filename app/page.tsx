"use client"

import dynamic from "next/dynamic"

const TileMapEditor = dynamic(
  () =>
    import("@/components/tile-map-editor/tile-map-editor").then(
      (mod) => mod.TileMapEditor
    ),
  { ssr: false, loading: () => <div className="flex h-screen w-screen items-center justify-center bg-[#1a1a2e] text-[#8888aa]">Carregando editor...</div> }
)

export default function Page() {
  return <TileMapEditor />
}
