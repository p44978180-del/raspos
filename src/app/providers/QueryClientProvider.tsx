import React from "react"
import { QueryClient } from "@tanstack/react-query"
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client"
import type { Persister } from "@tanstack/react-query-persist-client"
import { get, set, del } from "idb-keyval"

function createAsyncStoragePersister(opts: {
  storage: {
    getItem: (key: string) => Promise<string | null>
    setItem: (key: string, value: string) => Promise<void>
    removeItem: (key: string) => Promise<void>
  }
  key: string
}): Persister {
  const { storage, key } = opts
  return {
    persistClient: async (client) => {
      await storage.setItem(key, JSON.stringify(client))
    },
    restoreClient: async () => {
      const raw = await storage.getItem(key)
      if (!raw) return undefined
      return JSON.parse(raw)
    },
    removeClient: async () => {
      await storage.removeItem(key)
    },
  }
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: 1000 * 60 * 60 * 24 * 7, // 7 days offline persistence
      staleTime: 1000 * 60 * 5, // 5 minutes stale time
      retry: 2,
    },
  },
})

const asyncStorage = {
  getItem: async (key: string) => {
    try {
      const val = await get(key)
      return val ?? null
    } catch {
      return null
    }
  },
  setItem: async (key: string, value: string) => {
    try {
      await set(key, value)
    } catch {}
  },
  removeItem: async (key: string) => {
    try {
      await del(key)
    } catch {}
  },
}

export const persister = createAsyncStoragePersister({
  storage: asyncStorage,
  key: "RGAU_QUERY_OFFLINE_CACHE",
})

export function QueryProvider({ children }: { children: React.ReactNode }) {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister }}
    >
      {children}
    </PersistQueryClientProvider>
  )
}
