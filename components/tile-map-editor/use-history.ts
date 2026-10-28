"use client"

import { useCallback, useRef, useState } from "react"
import type { PlacedTile, Collider, Marker } from "./types"

export interface EditorState {
  tiles: PlacedTile[]
  colliders: Collider[]
  markers: Marker[]
}

const MAX_HISTORY = 50

export function useHistory<T>(initialState: T) {
  const [history, setHistory] = useState({ past: [] as T[], present: initialState, future: [] as T[] })
  const historyRef = useRef(history)
  const batchStart = useRef<{ state: T } | null>(null)
  const commit = useCallback((next: typeof history) => {
    historyRef.current = next
    setHistory(next)
  }, [])

  const pushState = useCallback((value: T | ((present: T) => T)) => {
    const current = historyRef.current
    const next = typeof value === "function" ? (value as (present: T) => T)(current.present) : value
    if (next === current.present) return
    commit({
      past: batchStart.current ? current.past : [...current.past, current.present].slice(-MAX_HISTORY),
      present: next,
      future: [],
    })
  }, [commit])

  const startBatch = useCallback(() => {
    batchStart.current ??= { state: historyRef.current.present }
  }, [])

  const endBatch = useCallback(() => {
    const start = batchStart.current
    batchStart.current = null
    const current = historyRef.current
    if (start && start.state !== current.present) {
      commit({ ...current, past: [...current.past, start.state].slice(-MAX_HISTORY), future: [] })
    }
  }, [commit])

  const undo = useCallback(() => {
    endBatch()
    const current = historyRef.current
    if (!current.past.length) return
    commit({ past: current.past.slice(0, -1), present: current.past[current.past.length - 1], future: [current.present, ...current.future] })
  }, [commit, endBatch])

  const redo = useCallback(() => {
    endBatch()
    const current = historyRef.current
    if (!current.future.length) return
    commit({ past: [...current.past, current.present].slice(-MAX_HISTORY), present: current.future[0], future: current.future.slice(1) })
  }, [commit, endBatch])

  const reset = useCallback((next: T) => {
    batchStart.current = null
    commit({ past: [], present: next, future: [] })
  }, [commit])

  // Applies a change that is not an edit (e.g. attaching an image) to every snapshot, so undo cannot revert it.
  const transformAll = useCallback((fn: (state: T) => T) => {
    const current = historyRef.current
    const next = { past: current.past.map(fn), present: fn(current.present), future: current.future.map(fn) }
    batchStart.current = batchStart.current && { state: fn(batchStart.current.state) }
    commit(next)
  }, [commit])

  return {
    transformAll,
    state: history.present, pushState, startBatch, endBatch, undo, redo, reset,
    canUndo: history.past.length > 0, canRedo: history.future.length > 0,
    historyLength: history.past.length, futureLength: history.future.length,
  }
}
