"use client"

import { useCallback, useRef, useState } from "react"
import type { PlacedTile, Collider, Marker } from "./types"

export interface EditorState {
  tiles: PlacedTile[]
  colliders: Collider[]
  markers: Marker[]
}

const MAX_HISTORY = 50

export function useHistory(initialState: EditorState) {
  const [past, setPast] = useState<EditorState[]>([])
  const [present, setPresent] = useState<EditorState>(initialState)
  const [future, setFuture] = useState<EditorState[]>([])
  
  // Track if we're in a batch operation
  const batchRef = useRef(false)
  const batchStartStateRef = useRef<EditorState | null>(null)

  const canUndo = past.length > 0
  const canRedo = future.length > 0

  // Push current state to history and set new state
  const pushState = useCallback((newState: EditorState) => {
    if (batchRef.current) {
      // During batch, just update present without pushing to history
      setPresent(newState)
      return
    }
    
    setPast((prev) => {
      const newPast = [...prev, present]
      // Limit history size
      if (newPast.length > MAX_HISTORY) {
        return newPast.slice(newPast.length - MAX_HISTORY)
      }
      return newPast
    })
    setPresent(newState)
    setFuture([]) // Clear redo stack on new action
  }, [present])

  // Start a batch operation (e.g., dragging to place multiple tiles)
  const startBatch = useCallback(() => {
    if (!batchRef.current) {
      batchRef.current = true
      batchStartStateRef.current = present
    }
  }, [present])

  // End batch and commit to history
  const endBatch = useCallback(() => {
    if (batchRef.current && batchStartStateRef.current) {
      const startState = batchStartStateRef.current
      batchRef.current = false
      batchStartStateRef.current = null
      
      // Only push to history if state actually changed
      if (
        JSON.stringify(startState.tiles) !== JSON.stringify(present.tiles) ||
        JSON.stringify(startState.colliders) !== JSON.stringify(present.colliders) ||
        JSON.stringify(startState.markers) !== JSON.stringify(present.markers)
      ) {
        setPast((prev) => {
          const newPast = [...prev, startState]
          if (newPast.length > MAX_HISTORY) {
            return newPast.slice(newPast.length - MAX_HISTORY)
          }
          return newPast
        })
        setFuture([])
      }
    }
  }, [present])

  const undo = useCallback(() => {
    if (past.length === 0) return
    
    const previous = past[past.length - 1]
    const newPast = past.slice(0, -1)
    
    setPast(newPast)
    setFuture([present, ...future])
    setPresent(previous)
  }, [past, present, future])

  const redo = useCallback(() => {
    if (future.length === 0) return
    
    const next = future[0]
    const newFuture = future.slice(1)
    
    setPast([...past, present])
    setFuture(newFuture)
    setPresent(next)
  }, [past, present, future])

  // Reset history with new initial state
  const reset = useCallback((newState: EditorState) => {
    setPast([])
    setPresent(newState)
    setFuture([])
  }, [])

  return {
    state: present,
    pushState,
    startBatch,
    endBatch,
    undo,
    redo,
    canUndo,
    canRedo,
    reset,
    historyLength: past.length,
    futureLength: future.length,
  }
}
