import type { ProjectDocument } from "./types"
import { parseProject } from "./project"

const DATABASE = "tilemap-editor-autosave"
const STORE = "projects"

function openDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null)
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function loadAutosave(): Promise<ProjectDocument | null> {
  const db = await openDatabase()
  if (!db) return null
  try {
    const value = await new Promise<unknown>((resolve, reject) => {
      const request = db.transaction(STORE, "readonly").objectStore(STORE).get("latest")
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    return value === undefined ? null : parseProject(value)
  } finally { db.close() }
}

export async function saveAutosave(project: ProjectDocument): Promise<void> {
  const db = await openDatabase()
  if (!db) throw new Error("IndexedDB indisponível.")
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE, "readwrite")
      transaction.objectStore(STORE).put(project, "latest")
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
      transaction.onabort = () => reject(transaction.error)
    })
  } finally { db.close() }
}
