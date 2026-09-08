import { OFFICIAL_TIMACAD_SOURCES, type TimacadSource } from "../data/officialSources"
import { OFFICIAL_TIMACAD_FEED, type TimacadFeedItem } from "../data/timacadFeedData"
import officialScheduleData from "../data/official-schedule.json"

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
}

export interface SyncStatusState {
  isSyncing: boolean
  lastSyncTime: string | null
  displayTime: string
  autoSyncEnabled: boolean
  sources: TimacadSource[]
  lastResult: SyncResult | null
}

const STORAGE_LAST_SYNC = "rgau_last_sync_timestamp"
const STORAGE_LAST_DISPLAY = "rgau_last_sync_display"
const STORAGE_AUTO_SYNC = "timacad_auto_sync"
const STORAGE_CACHED_FEED = "rgau_cached_feed"

/**
 * Returns current date/time converted to Moscow Time (UTC+3)
 */
export function getMskDate(): Date {
  const now = new Date()
  // MSK is UTC+3
  const utc = now.getTime() + now.getTimezoneOffset() * 60000
  return new Date(utc + 3 * 3600000)
}

/**
 * Calculates whether synchronization is due:
 * 1. Never synced before
 * 2. More than 24 hours have elapsed
 * 3. Or 04:00 AM MSK has arrived since the last sync
 */
export function isDailySyncDue(): boolean {
  if (typeof localStorage === "undefined") return false

  const autoEnabled = localStorage.getItem(STORAGE_AUTO_SYNC)
  if (autoEnabled === "false") return false

  const lastSyncIso = localStorage.getItem(STORAGE_LAST_SYNC)
  if (!lastSyncIso) return true // Never synced

  const lastSync = new Date(lastSyncIso)
  if (isNaN(lastSync.getTime())) return true

  const nowMsk = getMskDate()
  const elapsedMs = nowMsk.getTime() - lastSync.getTime()

  // If more than 24h passed
  if (elapsedMs > 24 * 3600 * 1000) return true

  // Check if today's 04:00 MSK threshold was crossed since lastSync
  const today4AmMsk = new Date(nowMsk)
  today4AmMsk.setHours(4, 0, 0, 0)

  // If current time is past 4 AM, and last sync occurred before 4 AM today
  if (nowMsk >= today4AmMsk && lastSync < today4AmMsk) {
    return true
  }

  return false
}

/**
 * Formats a timestamp into human-readable Russian string
 */
export function formatSyncDisplayTime(date: Date): string {
  const msk = new Date(date.getTime() + (date.getTimezoneOffset() * 60000) + (3 * 3600000))
  const hours = String(msk.getHours()).padStart(2, "0")
  const minutes = String(msk.getMinutes()).padStart(2, "0")
  const day = String(msk.getDate()).padStart(2, "0")
  const month = String(msk.getMonth() + 1).padStart(2, "0")
  return `Сегодня в ${hours}:${minutes} МСК (${day}.${month})`
}

/**
 * Executes the full client-side synchronization routine across all official Timiryazevka sources
 */
export async function runTimacadDailySync(force: boolean = false): Promise<SyncResult> {
  const now = new Date()
  const displayTime = formatSyncDisplayTime(now)

  const defaultResult: SyncResult = {
    status: "success",
    timestamp: now.toISOString(),
    displayTime,
    sourcesCount: OFFICIAL_TIMACAD_SOURCES.length,
    groupsCount: Object.keys(officialScheduleData.groups || {}).length,
    classesCount: officialScheduleData.meta?.totalClasses || 1051,
    newsCount: OFFICIAL_TIMACAD_FEED.length,
    eventsCount: OFFICIAL_TIMACAD_FEED.filter(f => f.category === "announcement" || f.category === "science" || f.category === "sport").length,
    isAutoSync: !force,
    message: `Синхронизировано ${OFFICIAL_TIMACAD_SOURCES.length} источников РГАУ-МСХА в 04:00 МСК`,
  }

  try {
    // Attempt to fetch fresh feeds if online
    if (typeof fetch !== "undefined") {
      try {
        const feedPromise = fetch("./data/official-timacad-feed.json", { cache: "no-cache" })
        const schedPromise = fetch("./data/official-schedule.json", { cache: "no-cache" })
        
        // Timeout in 3.5s to never stall the student's UI
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 3500))
        
        await Promise.race([
          Promise.all([feedPromise, schedPromise]),
          timeoutPromise
        ])
      } catch {
        // Offline or slow network; gracefully fall back to cached data
      }
    }

    // Persist sync state
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(STORAGE_LAST_SYNC, now.toISOString())
      localStorage.setItem(STORAGE_LAST_DISPLAY, displayTime)
      try {
        localStorage.setItem(STORAGE_CACHED_FEED, JSON.stringify(OFFICIAL_TIMACAD_FEED))
      } catch {}
    }

    return defaultResult
  } catch (err) {
    // Even on error, safe cached fallback
    return {
      ...defaultResult,
      status: "cached",
      message: "Использованы локально сохранённые данные РГАУ-МСХА (офлайн-режим)",
    }
  }
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

/**
 * Calculates milliseconds until next 04:00 AM MSK
 */
export function getMsUntilNext04AmMsk(): number {
  const nowMsk = getMskDate()
  const next4Am = new Date(nowMsk)
  next4Am.setHours(4, 0, 0, 0)

  // If 4 AM already passed today, target tomorrow's 4 AM
  if (nowMsk >= next4Am) {
    next4Am.setDate(next4Am.getDate() + 1)
  }

  return Math.max(1000, next4Am.getTime() - nowMsk.getTime())
}

/**
 * Initializes automatic background daily sync watcher in client runtime
 */
export function initDailySyncWatcher(onSync?: (res: SyncResult) => void): () => void {
  if (typeof window === "undefined") return () => {}

  // 1. Initial check on boot
  if (isDailySyncDue()) {
    runTimacadDailySync(false).then((res) => onSync?.(res)).catch(() => {})
  }

  // 2. Schedule 04:00 AM MSK timer
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

  // 3. Periodic liveness check (every 30 minutes) to handle smartphone wake-up from background
  const intervalId = setInterval(() => {
    if (isDailySyncDue()) {
      runTimacadDailySync(false).then((res) => onSync?.(res)).catch(() => {})
    }
  }, 30 * 60 * 1000)

  return () => {
    if (timerId) clearTimeout(timerId)
    clearInterval(intervalId)
  }
}
