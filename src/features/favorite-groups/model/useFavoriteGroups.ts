import { useState, useCallback } from "react"

const STORAGE_KEY = "rgau_favorite_groups"

function readFromStorage(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    return JSON.parse(raw) as string[]
  } catch {
    return []
  }
}

function writeToStorage(groups: string[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(groups))
  } catch {}
}

/**
 * Manages favorite/pinned group IDs persisted to localStorage.
 * Provides add, remove, toggle, and reorder operations.
 */
export function useFavoriteGroups() {
  const [favorites, setFavorites] = useState<string[]>(readFromStorage)

  const addFavorite = useCallback((groupId: string) => {
    setFavorites((prev) => {
      if (prev.includes(groupId)) return prev
      const next = [...prev, groupId]
      writeToStorage(next)
      return next
    })
  }, [])

  const removeFavorite = useCallback((groupId: string) => {
    setFavorites((prev) => {
      const next = prev.filter((g) => g !== groupId)
      writeToStorage(next)
      return next
    })
  }, [])

  const toggleFavorite = useCallback((groupId: string) => {
    setFavorites((prev) => {
      const next = prev.includes(groupId)
        ? prev.filter((g) => g !== groupId)
        : [...prev, groupId]
      writeToStorage(next)
      return next
    })
  }, [])

  const isFavorite = useCallback(
    (groupId: string) => favorites.includes(groupId),
    [favorites],
  )

  const reorder = useCallback((fromIdx: number, toIdx: number) => {
    setFavorites((prev) => {
      if (fromIdx < 0 || toIdx < 0 || fromIdx >= prev.length || toIdx >= prev.length)
        return prev
      const next = [...prev]
      const [item] = next.splice(fromIdx, 1)
      next.splice(toIdx, 0, item)
      writeToStorage(next)
      return next
    })
  }, [])

  return {
    favorites,
    addFavorite,
    removeFavorite,
    toggleFavorite,
    isFavorite,
    reorder,
  }
}
