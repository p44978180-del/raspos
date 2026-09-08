/**
 * RGAU-MSHA Timiryazevka Cache & Data Retention Manager
 * 
 * Provides automated Garbage Collection (GC) and Cache Retention:
 * 1. TTL for events & news (30–60 days, default 45 days)
 * 2. Schedule past-weeks pruning (retains current semester / last 4 weeks)
 * 3. Purging of temporary PDF parsing buffers
 * 4. Cache size calculation & human-readable formatting
 * 5. Safe user cache cleanup while strictly preserving user preferences (group, role, theme, etc.)
 */

export const STORAGE_CACHED_FEED = "rgau_cached_feed"
export const STORAGE_CACHED_SCHEDULE = "rgau_cached_schedule"
export const STORAGE_AUTO_SYNC = "timacad_auto_sync"
export const STORAGE_LAST_CACHE_CLEANUP = "rgau_last_cache_cleanup"
export const STORAGE_LAST_SYNC = "rgau_last_sync_timestamp"
export const STORAGE_LAST_DISPLAY = "rgau_last_sync_display"
export const CACHE_CLEARED_EVENT = "rgau-cache-cleared"
import type { TimacadFeedItem } from "../data/timacadFeedData"

/** Keys that MUST NOT be deleted during cache cleanup */
export const PRESERVED_SETTINGS_KEYS: readonly string[] = [
  "rgau_theme",
  "rgau_my_group",
  "rgau_saved_groups",
  "rgau_role",
  "rgau_dorm",
  STORAGE_AUTO_SYNC,
  STORAGE_LAST_SYNC,
  STORAGE_LAST_DISPLAY,
  "rgau_ios_a2hs_dismissed",
  "rgau_onboarded",
  "rgau_notifications",
  "rgau_homework",
  "rgau_personal",
  "rgau_subgroup_prefs",
]

export interface StorageUsageInfo {
  totalBytes: number
  feedBytes: number
  scheduleBytes: number
  pdfBufferBytes: number
  otherBytes: number
  formatted: string
  itemCount: number
}

export interface GarbageCollectionOptions {
  /** Maximum age of news and events in days (default: 45) */
  ttlDays?: number
  /** Number of past weeks to retain in custom schedules (default: 4) */
  pastWeeksToKeep?: number
  /** Reference date for calculation (default: new Date()) */
  refDate?: Date
}

export interface GarbageCollectionResult {
  timestamp: string
  initialBytes: number
  remainingBytes: number
  freedBytes: number
  removedFeedItems: number
  prunedScheduleDays: number
  removedPdfBuffers: number
  cleanedCategories: string[]
}

/**
 * Formats a byte size into human-readable Russian string (Б, КБ, МБ)
 */
export function formatBytes(bytes: number): string {
  if (bytes <= 0 || isNaN(bytes)) return "0 КБ"
  if (bytes < 1024) return `${bytes} Б`
  const kb = bytes / 1024
  if (kb < 1024) {
    return `${Math.round(kb)} КБ`
  }
  const mb = kb / 1024
  return `${mb.toFixed(1)} МБ`
}

/**
 * Safely calculates local storage memory usage breakdown in bytes
 */
export function getStorageUsageBytes(): StorageUsageInfo {
  let totalBytes = 0
  let feedBytes = 0
  let scheduleBytes = 0
  let pdfBufferBytes = 0
  let otherBytes = 0
  let itemCount = 0

  if (typeof localStorage === "undefined") {
    return {
      totalBytes: 0,
      feedBytes: 0,
      scheduleBytes: 0,
      pdfBufferBytes: 0,
      otherBytes: 0,
      formatted: "0 КБ",
      itemCount: 0,
    }
  }

  try {
    const len = localStorage.length
    itemCount = len

    for (let i = 0; i < len; i++) {
      const key = localStorage.key(i)
      if (!key) continue

      const val = localStorage.getItem(key) || ""
      const keyBytes = encodeUtf8Length(key)
      const valBytes = encodeUtf8Length(val)
      const entryBytes = keyBytes + valBytes

      totalBytes += entryBytes

      if (key === STORAGE_CACHED_FEED) {
        feedBytes += entryBytes
      } else if (key === STORAGE_CACHED_SCHEDULE || key.startsWith("timacad_custom_sched_")) {
        scheduleBytes += entryBytes
      } else if (isPdfBufferKey(key)) {
        pdfBufferBytes += entryBytes
      } else {
        otherBytes += entryBytes
      }
    }
  } catch {}

  return {
    totalBytes,
    feedBytes,
    scheduleBytes,
    pdfBufferBytes,
    otherBytes,
    formatted: formatBytes(totalBytes),
    itemCount,
  }
}

function encodeUtf8Length(str: string): number {
  let bytes = 0
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i)
    if (code <= 0x7f) bytes += 1
    else if (code <= 0x7ff) bytes += 2
    else if (code >= 0xd800 && code <= 0xdbff) {
      bytes += 4
      i++
    } else bytes += 3
  }
  return bytes
}

function isPdfBufferKey(key: string): boolean {
  if (/^(timacad_pdf_|pdf_cache_|temp_pdf_|rgau_pdf_|pdf_buffer|pdfjs|temp_buffer|temp_upload|rgau_temp_)/i.test(key)) {
    return true
  }
  const lower = key.toLowerCase()
  return lower.includes("pdf") && (lower.includes("temp") || lower.includes("cache") || lower.includes("buffer") || lower.includes("stream"))
}

/**
 * Safely parses various date formats to UTC millisecond timestamp:
 * 1. ISO 8601 / standard YYYY-MM-DD (e.g. "2026-09-08")
 * 2. Russian format DD.MM.YYYY (e.g. "25.07.2026" or "05.10.2026")
 * 3. Russian verbal format (e.g. "12 сентября 2026" or "1 сентября")
 */
export function parseDateToMs(dateStr: string | undefined | null): number | null {
  if (!dateStr || typeof dateStr !== "string") return null
  const trimmed = dateStr.trim()
  if (!trimmed) return null

  // 1. Check DD.MM.YYYY
  const ddmmyyyy = trimmed.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/)
  if (ddmmyyyy) {
    const day = parseInt(ddmmyyyy[1], 10)
    const month = parseInt(ddmmyyyy[2], 10) - 1
    const year = parseInt(ddmmyyyy[3], 10)
    const d = new Date(Date.UTC(year, month, day))
    return isNaN(d.getTime()) ? null : d.getTime()
  }

  // 2. Check Russian verbal dates like "12 сентября 2026"
  const ruMonths: Record<string, number> = {
    янв: 0, фев: 1, мар: 2, апр: 3, май: 4, мая: 4,
    июн: 5, июл: 6, авг: 7, сен: 8, окт: 9, ноя: 10, дек: 11,
  }
  const ruTextMatch = trimmed.match(/^(\d{1,2})\s+([а-яё]+)(?:\s+(\d{4}))?/i)
  if (ruTextMatch) {
    const day = parseInt(ruTextMatch[1], 10)
    const monthStr = ruTextMatch[2].toLowerCase().slice(0, 3)
    const year = ruTextMatch[3] ? parseInt(ruTextMatch[3], 10) : 2026
    if (ruMonths[monthStr] !== undefined) {
      const d = new Date(Date.UTC(year, ruMonths[monthStr], day))
      return isNaN(d.getTime()) ? null : d.getTime()
    }
  }

  // 3. Standard ISO / YYYY-MM-DD
  const parsed = new Date(trimmed).getTime()
  return isNaN(parsed) ? null : parsed
}

/**
 * Executes automatic garbage collection:
 * - Removes news and events older than TTL (30–60 days, default 45 days)
 * - Prunes schedule days older than 4 weeks (28 days)
 * - Removes temporary PDF buffers
 * - Updates last cleanup timestamp
 */
export function performCacheGarbageCollection(
  options: GarbageCollectionOptions = {}
): GarbageCollectionResult {
  const {
    ttlDays = 45,
    pastWeeksToKeep = 4,
    refDate = new Date(),
  } = options

  const nowIso = refDate.toISOString()
  const initialUsage = getStorageUsageBytes()
  let removedFeedItems = 0
  let prunedScheduleDays = 0
  let removedPdfBuffers = 0
  const cleanedCategories: string[] = []

  if (typeof localStorage === "undefined") {
    return {
      timestamp: nowIso,
      initialBytes: 0,
      remainingBytes: 0,
      freedBytes: 0,
      removedFeedItems: 0,
      prunedScheduleDays: 0,
      removedPdfBuffers: 0,
      cleanedCategories,
    }
  }

  const ttlMs = ttlDays * 24 * 3600 * 1000
  const thresholdMs = refDate.getTime() - (pastWeeksToKeep * 7 * 24 * 3600 * 1000)

  try {
    // Snapshot existing keys to avoid index shifting during in-loop mutations
    const allKeys: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k) allKeys.push(k)
    }

    // 1. Clean up temporary PDF buffers
    const pdfKeysToRemove = allKeys.filter(isPdfBufferKey)
    for (const key of pdfKeysToRemove) {
      localStorage.removeItem(key)
      removedPdfBuffers++
    }
    if (removedPdfBuffers > 0) {
      cleanedCategories.push("pdf_buffers")
    }

    // Also clean sessionStorage if available
    if (typeof sessionStorage !== "undefined") {
      const sessKeysToRemove: string[] = []
      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i)
        if (k && isPdfBufferKey(k)) {
          sessKeysToRemove.push(k)
        }
      }
      for (const k of sessKeysToRemove) {
        sessionStorage.removeItem(k)
      }
    }

    // 2. Prune old news and announcements from feed cache
    const rawFeed = localStorage.getItem(STORAGE_CACHED_FEED)
    if (rawFeed) {
      try {
        const feedList = JSON.parse(rawFeed)
        if (Array.isArray(feedList)) {
          const originalCount = feedList.length
          const retainedFeed = feedList.filter((item: TimacadFeedItem) => {
            // Keep pinned items regardless of age
            if (item.isPinned) return true
            if (!item.date) return true

            // Parse date safely across ISO and Russian formats
            const itemTime = parseDateToMs(item.date)
            if (itemTime === null) return true // retain if date cannot be parsed

            const ageMs = refDate.getTime() - itemTime
            return ageMs <= ttlMs
          })

          const diff = originalCount - retainedFeed.length
          if (diff > 0) {
            removedFeedItems += diff
            localStorage.setItem(STORAGE_CACHED_FEED, JSON.stringify(retainedFeed))
            cleanedCategories.push("news_and_events")
          }
        }
      } catch {}
    }

    // 3. Prune past weeks from custom and cached schedules
    const scheduleKeys = allKeys.filter((k) => 
      k.startsWith("timacad_custom_sched_") ||
      k.startsWith("timacad_sched_") ||
      k.startsWith("rgau_sched_") ||
      k.startsWith("rgau_schedule_")
    )

    for (const key of scheduleKeys) {
      const rawSched = localStorage.getItem(key)
      if (rawSched) {
        try {
          const days = JSON.parse(rawSched)
          if (Array.isArray(days)) {
            const originalDaysCount = days.length
            const filteredDays = days.filter((d: { date?: string }) => {
              if (!d.date) return true
              const dayMs = parseDateToMs(d.date)
              if (dayMs === null) return true // retain if unparseable
              return dayMs >= thresholdMs
            })
            const prunedCount = originalDaysCount - filteredDays.length
            if (prunedCount > 0) {
              prunedScheduleDays += prunedCount
              if (filteredDays.length === 0) {
                // If all days expired, completely remove key so no zombie [] lingers
                localStorage.removeItem(key)
              } else {
                localStorage.setItem(key, JSON.stringify(filteredDays))
              }
            }
          }
        } catch {}
      }
    }
    if (prunedScheduleDays > 0) {
      cleanedCategories.push("past_schedule_weeks")
    }

    // 4. Record last cleanup timestamp
    localStorage.setItem(STORAGE_LAST_CACHE_CLEANUP, nowIso)
  } catch {}

  const finalUsage = getStorageUsageBytes()
  const freedBytes = Math.max(0, initialUsage.totalBytes - finalUsage.totalBytes)

  return {
    timestamp: nowIso,
    initialBytes: initialUsage.totalBytes,
    remainingBytes: finalUsage.totalBytes,
    freedBytes,
    removedFeedItems,
    prunedScheduleDays,
    removedPdfBuffers,
    cleanedCategories,
  }
}

/**
 * Explicit user action: "Очистить кэш"
 * Wipes non-essential cached schedules, feeds and temporary buffers
 * while STRICTLY preserving user settings (group, role, theme, dorm, etc.)
 */
export function clearUserCache(preserveSettings: boolean = true): {
  freedBytes: number
  remainingBytes: number
  formattedFreed: string
} {
  const initialUsage = getStorageUsageBytes()

  if (typeof localStorage === "undefined") {
    return { freedBytes: 0, remainingBytes: 0, formattedFreed: "0 КБ" }
  }

  try {
    if (preserveSettings) {
      // Collect preserved values
      const preservedMap: Record<string, string> = {}
      for (const key of PRESERVED_SETTINGS_KEYS) {
        const val = localStorage.getItem(key)
        if (val !== null) {
          preservedMap[key] = val
        }
      }

      // Also preserve any keys that contain user notes or custom assignments
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)
        if (k && (k.startsWith("rgau_notes_") || k.startsWith("rgau_hw_") || k.startsWith("rgau_user_"))) {
          const v = localStorage.getItem(k)
          if (v !== null) preservedMap[k] = v
        }
      }

      // Snapshot keys before removal
      const allKeys: string[] = []
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)
        if (k) allKeys.push(k)
      }

      // Keys to remove: caches & buffers
      const keysToRemove = allKeys.filter((key) =>
        key === STORAGE_CACHED_FEED ||
        key === STORAGE_CACHED_SCHEDULE ||
        key.startsWith("timacad_custom_sched_") ||
        key.startsWith("timacad_sched_") ||
        key.startsWith("rgau_sched_") ||
        key.startsWith("rgau_schedule_") ||
        isPdfBufferKey(key) ||
        key.startsWith("cache_") ||
        key.startsWith("temp_")
      )

      for (const k of keysToRemove) {
        localStorage.removeItem(k)
      }

      // Ensure preserved settings are intact
      for (const [k, v] of Object.entries(preservedMap)) {
        localStorage.setItem(k, v)
      }
    } else {
      localStorage.clear()
    }

    if (typeof sessionStorage !== "undefined") {
      sessionStorage.clear()
    }

    localStorage.setItem(STORAGE_LAST_CACHE_CLEANUP, new Date().toISOString())

    // Dispatch global event so React components can update immediately
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(CACHE_CLEARED_EVENT))
    }
  } catch {}

  const finalUsage = getStorageUsageBytes()
  const freedBytes = Math.max(0, initialUsage.totalBytes - finalUsage.totalBytes)

  return {
    freedBytes,
    remainingBytes: finalUsage.totalBytes,
    formattedFreed: formatBytes(freedBytes),
  }
}
