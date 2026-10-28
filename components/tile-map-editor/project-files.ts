import type { ImageResource } from "./types"

interface FilePickerWindow extends Window {
  showOpenFilePicker?: (options: { types: { description: string; accept: Record<string, string[]> }[]; multiple: false }) => Promise<{ getFile: () => Promise<File> }[]>
  showSaveFilePicker?: (options: { suggestedName: string; types: { description: string; accept: Record<string, string[]> }[] }) => Promise<{ createWritable: () => Promise<{ write: (data: Blob) => Promise<void>; close: () => Promise<void> }> }>
}

const jsonTypes = [{ description: "Projeto JSON", accept: { "application/json": [".json"] } }]

export async function pickJsonFile(): Promise<File | null> {
  const picker = (window as FilePickerWindow).showOpenFilePicker
  if (picker) {
    try {
      const handles = await picker.call(window, { types: jsonTypes, multiple: false })
      return handles[0] ? handles[0].getFile() : null
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return null
      if (!(error instanceof DOMException) || !["SecurityError", "NotAllowedError"].includes(error.name)) throw error
    }
  }
  return new Promise((resolve) => {
    const input = document.createElement("input")
    input.type = "file"
    input.accept = ".json,application/json"
    input.addEventListener("change", () => resolve(input.files?.[0] ?? null), { once: true })
    input.addEventListener("cancel", () => resolve(null), { once: true })
    input.click()
  })
}

export function readDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error("Não foi possível ler a imagem."))
    reader.readAsDataURL(blob)
  })
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error("Não foi possível decodificar a imagem."))
    image.src = src
  })
}

export async function loadProjectImages(images: ImageResource[]) {
  const loaded = await Promise.all(images.filter((resource) => resource.src).map(async (resource) => [resource.id, await loadImage(resource.src!)] as const))
  return new Map(loaded)
}

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function downloadJson(value: unknown, name: string) {
  downloadBlob(new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }), name)
}

export async function saveJson(value: unknown, name: string): Promise<boolean> {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" })
  const picker = (window as FilePickerWindow).showSaveFilePicker
  if (picker) {
    try {
      const handle = await picker.call(window, { suggestedName: name, types: jsonTypes })
      const writable = await handle.createWritable()
      await writable.write(blob)
      await writable.close()
      return true
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return false
      if (!(error instanceof DOMException) || !["SecurityError", "NotAllowedError"].includes(error.name)) throw error
    }
  }
  downloadBlob(blob, name)
  return true
}
