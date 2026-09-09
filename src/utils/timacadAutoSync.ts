import { OFFICIAL_TIMACAD_SOURCES, type TimacadSource } from "../data/officialSources"
import { OFFICIAL_TIMACAD_FEED, type TimacadFeedItem } from "../data/timacadFeedData"
import officialScheduleData from "../data/official-schedule.json"
import {
  performCacheGarbageCollection,
  getStorageUsageBytes,
  clearUserCache,
  formatBytes,
  STORAGE_LAST_CACHE_CLEANUP,
  CACHE_CLEARED_EVENT,
  parseDateToMs,
  type GarbageCollectionResult,
  type StorageUsageInfo,
} from "./cacheManager"

export {
  performCacheGarbageCollection,
  getStorageUsageBytes,
  clearUserCache,
  formatBytes,
  STORAGE_LAST_CACHE_CLEANUP,
  CACHE_CLEARED_EVENT,
  parseDateToMs,
  type GarbageCollectionResult,
  type StorageUsageInfo,
}

export interface SyncResult {
  status: "success" | "cached" | "failed"
  timestamp: string
  displayTime: string
  sourcesCount: number
  groupsCount: number
  classesCount: number
  newsCount: number
  eventsCount: number
  isAutoSync: boolean
  message: string
  freshFeed?: TimacadFeedItem[]
  gcResult?: GarbageCollectionResult
}

export interface SyncStatusState {
  isSyncing: boolean
  lastSyncTime: string | null
  displayTime: string
  autoSyncEnabled: boolean
  sources: TimacadSource[]
  lastResult: SyncResult | null
}

export const STORAGE_LAST_SYNC = "rgau_last_sync_timestamp"
export const STORAGE_LAST_DISPLAY = "rgau_last_sync_display"
export const STORAGE_AUTO_SYNC = "timacad_auto_sync"
export const STORAGE_CACHED_FEED = "rgau_cached_feed"
export const STORAGE_CACHED_SCHEDULE = "rgau_cached_schedule"
export const SYNC_EVENT_NAME = "rgau-sync-updated"

/**
 * Returns the most recent 04:00 AM MSK timestamp in milliseconds.
 * (Moscow Time is permanently UTC+3, so 04:00 MSK is 01:00 UTC)
 */
export function getMostRecent04AmMsk(refDate: Date = new Date()): number {
  const utcYear = refDate.getUTCFullYear()
  const utcMonth = refDate.getUTCMonth()
  const utcDay = refDate.getUTCDate()
  const today01Utc = Date.UTC(utcYear, utcMonth, utcDay, 1, 0, 0, 0)
  if (refDate.getTime() >= today01Utc) {
    return today01Utc
  }
  return today01Utc - 24 * 3600 * 1000
}

/**
 * Returns the next 04:00 AM MSK timestamp in milliseconds.
 * (Moscow Time is permanently UTC+3, so 04:00 MSK is 01:00 UTC)
 */
export function getNext04AmMsk(refDate: Date = new Date()): number {
  const utcYear = refDate.getUTCFullYear()
  const utcMonth = refDate.getUTCMonth()
  const utcDay = refDate.getUTCDate()
  const today01Utc = Date.UTC(utcYear, utcMonth, utcDay, 1, 0, 0, 0)
  if (refDate.getTime() < today01Utc) {
    return today01Utc
  }
  return today01Utc + 24 * 3600 * 1000
}

/**
 * Calculates whether synchronization is due:
 * 1. Never synced before
 * 2. More than 24 hours have elapsed
 * 3. Or 04:00 AM MSK threshold was crossed since last sync
 */
export function isDailySyncDue(): boolean {
  if (typeof localStorage === "undefined") return false

  const autoEnabled = localStorage.getItem(STORAGE_AUTO_SYNC)
  if (autoEnabled === "false") return false

  const lastSyncIso = localStorage.getItem(STORAGE_LAST_SYNC)
  if (!lastSyncIso) return true

  const lastSync = new Date(lastSyncIso)
  if (isNaN(lastSync.getTime())) return true

  const now = new Date()
  const elapsedMs = now.getTime() - lastSync.getTime()

  // If more than 24h passed
  if (elapsedMs > 24 * 3600 * 1000) return true

  // Check if 04:00 MSK (01:00 UTC) threshold was crossed since lastSync
  const mostRecent04Am = getMostRecent04AmMsk(now)
  if (lastSync.getTime() < mostRecent04Am) {
    return true
  }

  return false
}

/**
 * Formats a timestamp into human-readable Russian string in Moscow Time (UTC+3)
 */
export function formatSyncDisplayTime(date: Date): string {
  const mskMs = date.getTime() + 3 * 3600000
  const mskDate = new Date(mskMs)
  const hours = String(mskDate.getUTCHours()).padStart(2, "0")
  const minutes = String(mskDate.getUTCMinutes()).padStart(2, "0")
  const day = String(mskDate.getUTCDate()).padStart(2, "0")
  const month = String(mskDate.getUTCMonth() + 1).padStart(2, "0")
  return `Сегодня в ${hours}:${minutes} МСК (${day}.${month})`
}

/**
 * Parses raw HTML from timacad.ru news and announcements
 */
export function parseTimacadHtmlFeed(newsHtml: string, annHtml: string): TimacadFeedItem[] {
  const items: TimacadFeedItem[] = []

  // 1. Parse News cards
  if (newsHtml) {
    const cardRegex = /<a[^>]*href="(\/news\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi
    let match: RegExpExecArray | null
    let idx = 1
    while ((match = cardRegex.exec(newsHtml)) !== null && items.length < 15) {
      const path = match[1]
      if (path.includes("/page/")) continue
      const rawText = match[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
      if (rawText.length > 25) {
        // Extract date if present (e.g. "08 Сентябрь / 2026")
        let date = new Date().toISOString().split("T")[0]
        const dateMatch = rawText.match(/(\d{2})\s+([А-Яа-яЁё]+)\s*(?:\/)?\s*(\d{4})?/)
        if (dateMatch) {
          const d = dateMatch[1]
          const y = dateMatch[3] || "2026"
          date = `${y}-09-${d}`
        }

        let cleanTitle = rawText.replace(/^\d{2}\s+[А-Яа-яЁё]+\s*(?:\/)?\s*\d{0,4}\s*/, "").trim()
        if (cleanTitle.length > 15) {
          items.push({
            id: `tim-live-news-${idx++}`,
            title: cleanTitle,
            summary: "Официальная новость с портала РГАУ-МСХА им. К.А. Тимирязева",
            date,
            category: "news",
            sourceName: "timacad.ru/news",
            sourceUrl: `https://www.timacad.ru${path}`,
            place: "Кампус РГАУ-МСХА",
            badgeText: "Новости",
          })
        }
      }
    }
  }

  // 2. Parse Announcements cards
  if (annHtml) {
    const annRegex = /<a[^>]*href="(\/announcements\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi
    let match: RegExpExecArray | null
    let idx = 1
    while ((match = annRegex.exec(annHtml)) !== null && items.length < 25) {
      const path = match[1]
      if (path.includes("/page/")) continue
      const rawText = match[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
      if (rawText.length > 25) {
        let date = new Date().toISOString().split("T")[0]
        const dateMatch = rawText.match(/(\d{1,2})\s+([а-яё]+)/i)
        if (dateMatch) {
          const d = String(dateMatch[1]).padStart(2, "0")
          date = `2026-09-${d}`
        }

        let category: TimacadFeedItem["category"] = "announcement"
        if (/научн|конференц|симпозиум/i.test(rawText)) category = "science"
        else if (/спорт|кросс|соревнован/i.test(rawText)) category = "sport"
        else if (/карьер|ваканс|стажировк/i.test(rawText)) category = "career"

        items.push({
          id: `tim-live-ann-${idx++}`,
          title: rawText.slice(0, 140),
          summary: rawText.length > 140 ? rawText.slice(140).trim() : "Анонс мероприятия РГАУ-МСХА",
          date,
          category,
          sourceName: "timacad.ru/announcements",
          sourceUrl: `https://www.timacad.ru${path}`,
          place: "РГАУ-МСХА",
          badgeText: category === "science" ? "Наука" : category === "sport" ? "Спорт" : "Анонс",
        })
      }
    }
  }

  return items
}

/**
 * Fetches HTML or JSON with robust fallbacks:
 * 1. Direct fetch
 * 2. Public CORS proxy (for browser webview)
 */
async function fetchWithFallback(url: string, timeoutMs: number = 4000): Promise<string | null> {
  const headers = {
    Accept: "text/html,application/xhtml+xml,application/json,*/*",
  }

  // Tier 1: Direct fetch
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    const res = await fetch(url, { headers, signal: controller.signal })
    clearTimeout(timer)
    if (res.ok) return await res.text()
  } catch {}

  // Tier 2: Public CORS proxy if direct fails (e.g. standard browser tab)
  const proxies = [
    `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    `https://corsproxy.io/?${encodeURIComponent(url)}`,
  ]

  for (const proxyUrl of proxies) {
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      const res = await fetch(proxyUrl, { headers, signal: controller.signal })
      clearTimeout(timer)
      if (res.ok) {
        const text = await res.text()
        if (text && text.length > 100) return text
      }
    } catch {}
  }

  return null
}

/**
 * Retrieves the cached feed items or bundled default
 */
export function getCachedTimacadFeed(): TimacadFeedItem[] {
  try {
    if (typeof localStorage !== "undefined") {
      const saved = localStorage.getItem(STORAGE_CACHED_FEED)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed
        }
      }
    }
  } catch {}
  return OFFICIAL_TIMACAD_FEED
}

let inMemorySchedule: any = null

export const SCHEDULE_UPDATED_EVENT = "rgau-schedule-updated"

/**
 * Retrieves the active schedule data (cached or bundled fallback)
 */
export function getCachedSchedule(): any {
  if (inMemorySchedule?.groups && Object.keys(inMemorySchedule.groups).length > 0) {
    return inMemorySchedule
  }
  try {
    if (typeof localStorage !== "undefined") {
      const saved = localStorage.getItem(STORAGE_CACHED_SCHEDULE)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (parsed?.groups && Object.keys(parsed.groups).length > 0) {
          inMemorySchedule = parsed
          return parsed
        }
      }
    }
  } catch {}
  return officialScheduleData
}

// Background eager loader for full 359 groups schedule
if (typeof window !== "undefined" && typeof fetch === "function") {
  fetch("./data/official-schedule.json")
    .then((r) => (r.ok ? r.json() : null))
    .then((schedJson) => {
      if (schedJson?.groups && Object.keys(schedJson.groups).length > 0) {
        inMemorySchedule = schedJson
        window.dispatchEvent(new CustomEvent(SCHEDULE_UPDATED_EVENT, { detail: schedJson }))
      }
    })
    .catch(() => {})
}

/**
 * Executes the full client-side synchronization routine across all official Timiryazevka sources
 */
export async function runTimacadDailySync(force: boolean = false): Promise<SyncResult> {
  const now = new Date()
  const displayTime = formatSyncDisplayTime(now)
  let freshFeedList: TimacadFeedItem[] = [...OFFICIAL_TIMACAD_FEED]
  let hasRemoteSuccess = false

  try {
    // 1. Fetch live news & announcements HTML from timacad.ru
    const [newsHtml, annHtml] = await Promise.all([
      fetchWithFallback("https://www.timacad.ru/news", 3500),
      fetchWithFallback("https://www.timacad.ru/announcements", 3500),
    ])

    if (newsHtml || annHtml) {
      const parsedItems = parseTimacadHtmlFeed(newsHtml || "", annHtml || "")
      if (parsedItems.length > 0) {
        hasRemoteSuccess = true
        // Merge with pinned and base feed
        const existingUrls = new Set(parsedItems.map((i) => i.sourceUrl))
        const combined = [...parsedItems, ...OFFICIAL_TIMACAD_FEED.filter((f) => !existingUrls.has(f.sourceUrl))]
        freshFeedList = combined
      }
    }

    // 2. Fetch fresh JSON bundles if available from web server / PWA host
    try {
      const feedRes = await fetch("./data/official-timacad-feed.json", { cache: "no-cache" })
      if (feedRes.ok) {
        const jsonFeed = await feedRes.json()
        if (Array.isArray(jsonFeed) && jsonFeed.length > 0) {
          const seen = new Set(freshFeedList.map((i) => i.sourceUrl))
          for (const item of jsonFeed) {
            if (!seen.has(item.sourceUrl)) {
              freshFeedList.push(item)
              seen.add(item.sourceUrl)
            }
          }
          hasRemoteSuccess = true
        }
      }
    } catch {}

    try {
      const schedRes = await fetch("./data/official-schedule.json", { cache: "no-cache" })
      if (schedRes.ok) {
        const schedJson = await schedRes.json()
        if (schedJson?.groups && Object.keys(schedJson.groups).length > 0) {
          inMemorySchedule = schedJson
          if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent(SCHEDULE_UPDATED_EVENT, { detail: schedJson }))
          }
          if (typeof localStorage !== "undefined") {
            try {
              localStorage.setItem(STORAGE_CACHED_SCHEDULE, JSON.stringify(schedJson))
            } catch {}
          }
        }
      }
    } catch {}

    // 3. Persist fresh feed to local cache
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(STORAGE_LAST_SYNC, now.toISOString())
      localStorage.setItem(STORAGE_LAST_DISPLAY, displayTime)
      try {
        localStorage.setItem(STORAGE_CACHED_FEED, JSON.stringify(freshFeedList))
      } catch {}
    }

    // 4. Automated Garbage Collection (TTL pruning of news > 45d, past schedule weeks > 4w, and temp PDF buffers)
    let gcResult: GarbageCollectionResult | undefined
    try {
      gcResult = performCacheGarbageCollection({ refDate: now })
    } catch {}

    const currentSchedule = getCachedSchedule()
    const groupCount = Object.keys(currentSchedule.groups || {}).length
    const classCount = currentSchedule.meta?.totalClasses || 1051

    const result: SyncResult = {
      status: hasRemoteSuccess ? "success" : "cached",
      timestamp: now.toISOString(),
      displayTime,
      sourcesCount: OFFICIAL_TIMACAD_SOURCES.length,
      groupsCount: groupCount,
      classesCount: classCount,
      newsCount: freshFeedList.length,
      eventsCount: freshFeedList.filter(
        (f) => f.category === "announcement" || f.category === "science" || f.category === "sport"
      ).length,
      isAutoSync: !force,
      message: hasRemoteSuccess
        ? `Синхронизировано ${OFFICIAL_TIMACAD_SOURCES.length} источников РГАУ-МСХА (${groupCount} групп, ${classCount} пар)`
        : `Использованы сохранённые данные РГАУ-МСХА (${OFFICIAL_TIMACAD_SOURCES.length} источников офлайн)`,
      freshFeed: freshFeedList,
      gcResult,
    }

    // Notify listeners via custom event in browser
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(SYNC_EVENT_NAME, { detail: result }))
    }

    return result
  } catch {
    let gcResult: GarbageCollectionResult | undefined
    try {
      gcResult = performCacheGarbageCollection({ refDate: now })
    } catch {}

    const fallbackFeed = getCachedTimacadFeed()
    const currentSchedule = getCachedSchedule()
    const groupCount = Object.keys(currentSchedule.groups || {}).length
    const classCount = currentSchedule.meta?.totalClasses || 1051

    const cachedResult: SyncResult = {
      status: "cached",
      timestamp: now.toISOString(),
      displayTime,
      sourcesCount: OFFICIAL_TIMACAD_SOURCES.length,
      groupsCount: groupCount,
      classesCount: classCount,
      newsCount: fallbackFeed.length,
      eventsCount: fallbackFeed.filter(
        (f) => f.category === "announcement" || f.category === "science" || f.category === "sport"
      ).length,
      isAutoSync: !force,
      message: "Использованы локально сохранённые данные РГАУ-МСХА (офлайн-режим)",
      freshFeed: fallbackFeed,
      gcResult,
    }

    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(SYNC_EVENT_NAME, { detail: cachedResult }))
    }

    return cachedResult
  }
}

/**
 * Calculates milliseconds until next 04:00 AM MSK
 */
export function getMsUntilNext04AmMsk(): number {
  const now = new Date()
  const nextTarget = getNext04AmMsk(now)
  return Math.max(1000, nextTarget - now.getTime())
}

/**
 * Initializes automatic background daily sync watcher in client runtime.
 * Handles app boots, exact 04:00 AM MSK timer, 30m intervals,
 * and crucial mobile/iPhone visibilitychange wake-ups when returning from Home screen.
 */
export function initDailySyncWatcher(onSync?: (res: SyncResult) => void): () => void {
  if (typeof window === "undefined" || typeof document === "undefined") return () => {}

  // 1. Initial check on boot
  if (isDailySyncDue()) {
    runTimacadDailySync(false).then((res) => onSync?.(res)).catch(() => {})
  }

  // 2. Schedule exact 04:00 AM MSK timer
  let timerId: any = null
  const scheduleNext = () => {
    const delay = getMsUntilNext04AmMsk()
    timerId = setTimeout(async () => {
      const res = await runTimacadDailySync(false)
      onSync?.(res)
      scheduleNext()
    }, delay)
  }
  scheduleNext()

  // 3. Periodic liveness check (every 30 minutes)
  const intervalId = setInterval(() => {
    if (isDailySyncDue()) {
      runTimacadDailySync(false).then((res) => onSync?.(res)).catch(() => {})
    }
  }, 30 * 60 * 1000)

  // 4. Critical for iPhone / Mobile: wake-up trigger when returning from Home button or app switcher
  const handleVisibilityOrFocus = () => {
    if (document.visibilityState === "visible") {
      if (isDailySyncDue()) {
        runTimacadDailySync(false).then((res) => onSync?.(res)).catch(() => {})
      }
    }
  }

  document.addEventListener("visibilitychange", handleVisibilityOrFocus)
  window.addEventListener("focus", handleVisibilityOrFocus)

  return () => {
    if (timerId) clearTimeout(timerId)
    clearInterval(intervalId)
    document.removeEventListener("visibilitychange", handleVisibilityOrFocus)
    window.removeEventListener("focus", handleVisibilityOrFocus)
  }
}
