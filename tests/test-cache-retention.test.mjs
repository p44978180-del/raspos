import assert from "node:assert"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import ts from "typescript"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT = path.resolve(__dirname, "..")

console.log("══════════════════════════════════════════════════════════════════════")
console.log("🧪 CACHE RETENTION & GARBAGE COLLECTION EMPIRICAL TEST SUITE")
console.log("══════════════════════════════════════════════════════════════════════\n")

let totalPassed = 0

function test(name, fn) {
  try {
    fn()
    console.log(`  ✔ [PASS] ${name}`)
    totalPassed++
  } catch (err) {
    console.error(`  ✖ [FAIL] ${name}`)
    console.error(err)
    process.exit(1)
  }
}

// In-memory mock localStorage implementation for Node test harness
class MockLocalStorage {
  constructor() {
    this.store = new Map()
  }
  get length() {
    return this.store.size
  }
  key(i) {
    const keys = Array.from(this.store.keys())
    return keys[i] ?? null
  }
  getItem(k) {
    return this.store.get(k) ?? null
  }
  setItem(k, v) {
    this.store.set(String(k), String(v))
  }
  removeItem(k) {
    this.store.delete(k)
  }
  clear() {
    this.store.clear()
  }
}

const mockStorage = new MockLocalStorage()
globalThis.localStorage = mockStorage
globalThis.sessionStorage = new MockLocalStorage()

// Transpile cacheManager.ts
function loadTsModule(filePath) {
  const source = fs.readFileSync(filePath, "utf8")
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText

  const moduleStub = { exports: {} }
  const fn = new Function("require", "module", "exports", transpiled)
  fn(
    (id) => {
      if (id.includes("cacheManager")) return loadTsModule(path.resolve(ROOT, "src/utils/cacheManager.ts"))
      if (id.includes("officialSources")) return { OFFICIAL_TIMACAD_SOURCES: [] }
      if (id.includes("timacadFeedData")) return { OFFICIAL_TIMACAD_FEED: [] }
      if (id.includes("official-schedule.json")) return { groups: {} }
      return {}
    },
    moduleStub,
    moduleStub.exports
  )
  return moduleStub.exports
}

const cacheManager = loadTsModule(path.resolve(ROOT, "src/utils/cacheManager.ts"))
const {
  formatBytes,
  getStorageUsageBytes,
  performCacheGarbageCollection,
  clearUserCache,
  parseDateToMs,
  CACHE_CLEARED_EVENT,
  PRESERVED_SETTINGS_KEYS,
  STORAGE_LAST_CACHE_CLEANUP,
  STORAGE_CACHED_FEED,
  STORAGE_CACHED_SCHEDULE,
  STORAGE_AUTO_SYNC,
} = cacheManager

// --- SUITE 1: Byte Formatting Math ---
console.log("--- SUITE 1: Memory & Byte Formatting Math ---")

test("1.1 formatBytes handles 0 and negative bytes gracefully", () => {
  assert.strictEqual(formatBytes(0), "0 КБ")
  assert.strictEqual(formatBytes(-50), "0 КБ")
  assert.strictEqual(formatBytes(NaN), "0 КБ")
})

test("1.2 formatBytes formats bytes below 1KB", () => {
  assert.strictEqual(formatBytes(256), "256 Б")
  assert.strictEqual(formatBytes(1023), "1023 Б")
})

test("1.3 formatBytes formats kilobytes correctly (e.g. 240 КБ)", () => {
  assert.strictEqual(formatBytes(240 * 1024), "240 КБ")
  assert.strictEqual(formatBytes(52 * 1024), "52 КБ")
})

test("1.4 formatBytes formats megabytes with decimal precision", () => {
  assert.strictEqual(formatBytes(1024 * 1024), "1.0 МБ")
  assert.strictEqual(formatBytes(2.5 * 1024 * 1024), "2.5 МБ")
})

// --- SUITE 2: Storage Size Calculation Breakdown ---
console.log("\n--- SUITE 2: Storage Size Calculation & Breakdown ---")

test("2.1 getStorageUsageBytes on empty storage returns 0", () => {
  mockStorage.clear()
  const info = getStorageUsageBytes()
  assert.strictEqual(info.totalBytes, 0)
  assert.strictEqual(info.itemCount, 0)
  assert.strictEqual(info.formatted, "0 КБ")
})

test("2.2 getStorageUsageBytes categorizes feed, schedule and buffers accurately", () => {
  mockStorage.clear()
  mockStorage.setItem(STORAGE_CACHED_FEED, JSON.stringify([{ id: "1", title: "Новость" }]))
  mockStorage.setItem(STORAGE_CACHED_SCHEDULE, JSON.stringify({ groups: { "ДА 01-26": {} } }))
  mockStorage.setItem("timacad_custom_sched_АГ-204", JSON.stringify([{ weekday: "Пн", classes: [] }]))
  mockStorage.setItem("timacad_pdf_buffer_temp123", "base64-pdf-chunk-data")
  mockStorage.setItem("rgau_theme", "dark")

  const info = getStorageUsageBytes()
  assert.ok(info.totalBytes > 0, "Total bytes must be > 0")
  assert.ok(info.feedBytes > 0, "Feed bytes must be tracked")
  assert.ok(info.scheduleBytes > 0, "Schedule bytes must track official & custom schedule")
  assert.ok(info.pdfBufferBytes > 0, "PDF buffer bytes must be tracked")
  assert.ok(info.otherBytes > 0, "Other bytes must track theme")
  assert.strictEqual(info.itemCount, 5)
})

// --- SUITE 3: TTL Retention for News & Events (30–60 days) ---
console.log("\n--- SUITE 3: TTL Policy for News & Events ---")

test("3.1 Old news older than 45 days are pruned, fresh news are retained", () => {
  mockStorage.clear()
  const now = new Date("2026-09-08T12:00:00Z")

  // Feed items with various dates
  const feed = [
    {
      id: "fresh-1",
      title: "Свежая новость 1 сентября",
      date: "2026-09-01",
      isPinned: false,
    },
    {
      id: "recent-2",
      title: "Августовская новость 20 дней назад",
      date: "2026-08-19",
      isPinned: false,
    },
    {
      id: "old-3",
      title: "Старая новость 60 дней назад",
      date: "2026-07-01",
      isPinned: false,
    },
    {
      id: "ancient-4",
      title: "Очень старая новость 120 дней назад",
      date: "2026-05-01",
      isPinned: false,
    },
    {
      id: "pinned-5",
      title: "Закрепленная новость ректора (150 дней назад)",
      date: "2026-04-01",
      isPinned: true,
    },
  ]

  mockStorage.setItem(STORAGE_CACHED_FEED, JSON.stringify(feed))

  const gcResult = performCacheGarbageCollection({ ttlDays: 45, refDate: now })

  assert.strictEqual(gcResult.removedFeedItems, 2, "Must remove exactly 2 unpinned items older than 45 days")
  assert.ok(gcResult.freedBytes > 0, "Freed bytes must be positive")

  const updatedFeed = JSON.parse(mockStorage.getItem(STORAGE_CACHED_FEED))
  const remainingIds = updatedFeed.map((i) => i.id)

  assert.ok(remainingIds.includes("fresh-1"), "Fresh item must remain")
  assert.ok(remainingIds.includes("recent-2"), "Recent item must remain")
  assert.ok(!remainingIds.includes("old-3"), "60-day old item must be purged")
  assert.ok(!remainingIds.includes("ancient-4"), "120-day old item must be purged")
  assert.ok(remainingIds.includes("pinned-5"), "Pinned item must remain regardless of age")
})

test("3.2 Russian DD.MM.YYYY and verbal date formats are correctly parsed and pruned by TTL", () => {
  mockStorage.clear()
  const now = new Date("2026-09-08T12:00:00Z")

  const feedWithRuDates = [
    { id: "ru-fresh-1", title: "Новость 1 сентября", date: "01.09.2026", isPinned: false },
    { id: "ru-old-2", title: "Старая новость 25 июля", date: "25.07.2026", isPinned: false },
    { id: "ru-verbal-old-3", title: "Старая новость словами", date: "15 июля 2026", isPinned: false },
    { id: "ru-verbal-fresh-4", title: "Свежая новость словами", date: "5 сентября 2026", isPinned: false },
    { id: "ru-pinned-old-5", title: "Закрепленная старая", date: "10.05.2026", isPinned: true },
  ]

  mockStorage.setItem(STORAGE_CACHED_FEED, JSON.stringify(feedWithRuDates))
  const gcResult = performCacheGarbageCollection({ ttlDays: 45, refDate: now })

  assert.strictEqual(gcResult.removedFeedItems, 2, "Must remove exactly 2 unpinned old Russian-date items")
  const remainingFeed = JSON.parse(mockStorage.getItem(STORAGE_CACHED_FEED))
  const remainingIds = remainingFeed.map((i) => i.id)

  assert.ok(remainingIds.includes("ru-fresh-1"), "01.09.2026 must be kept")
  assert.ok(!remainingIds.includes("ru-old-2"), "25.07.2026 (>45d) must be purged")
  assert.ok(!remainingIds.includes("ru-verbal-old-3"), "15 июля 2026 (>45d) must be purged")
  assert.ok(remainingIds.includes("ru-verbal-fresh-4"), "5 сентября 2026 must be kept")
  assert.ok(remainingIds.includes("ru-pinned-old-5"), "Pinned item must be kept")
})

// --- SUITE 4: Schedule Past Weeks Retention Policy ---
console.log("\n--- SUITE 4: Schedule Past Weeks Pruning ---")

test("4.1 Past schedule weeks older than 4 weeks (28 days) are pruned", () => {
  mockStorage.clear()
  const now = new Date("2026-09-28T12:00:00Z") // late September 2026

  const customSchedule = [
    { date: "2026-08-10", weekday: "Понедельник", classes: [] }, // ~49 days ago (purged)
    { date: "2026-08-24", weekday: "Понедельник", classes: [] }, // ~35 days ago (purged)
    { date: "2026-09-07", weekday: "Понедельник", classes: [] }, // 21 days ago (within 28d, kept)
    { date: "2026-09-14", weekday: "Понедельник", classes: [] }, // 14 days ago (kept)
    { date: "2026-09-28", weekday: "Понедельник", classes: [] }, // today (kept)
    { date: "2026-10-05", weekday: "Понедельник", classes: [] }, // future (kept)
  ]

  mockStorage.setItem("timacad_custom_sched_АГ-204", JSON.stringify(customSchedule))

  const gcResult = performCacheGarbageCollection({ pastWeeksToKeep: 4, refDate: now })

  assert.strictEqual(gcResult.prunedScheduleDays, 2, "Must prune 2 past days older than 4 weeks")

  const remainingSched = JSON.parse(mockStorage.getItem("timacad_custom_sched_АГ-204"))
  assert.strictEqual(remainingSched.length, 4)
  assert.strictEqual(remainingSched[0].date, "2026-09-07")
  assert.strictEqual(remainingSched[3].date, "2026-10-05")
})

test("4.2 Schedule DD.MM.YYYY dates: future dates (e.g. 05.10.2026) are KEPT and past (10.08.2026) are pruned", () => {
  mockStorage.clear()
  const now = new Date("2026-09-28T12:00:00Z")

  const scheduleRuDates = [
    { date: "10.08.2026", weekday: "Понедельник", classes: [] }, // ~49 days ago (purged)
    { date: "21.09.2026", weekday: "Понедельник", classes: [] }, // 7 days ago (kept)
    { date: "28.09.2026", weekday: "Понедельник", classes: [] }, // today (kept)
    { date: "05.10.2026", weekday: "Понедельник", classes: [] }, // future month (MUST BE KEPT, not pruned by '0' < '2' string bug)
  ]

  mockStorage.setItem("timacad_custom_sched_АГ-205", JSON.stringify(scheduleRuDates))
  const gcResult = performCacheGarbageCollection({ pastWeeksToKeep: 4, refDate: now })

  assert.strictEqual(gcResult.prunedScheduleDays, 1, "Must prune exactly 1 past day")
  const remaining = JSON.parse(mockStorage.getItem("timacad_custom_sched_АГ-205"))
  assert.strictEqual(remaining.length, 3)
  assert.ok(remaining.some((d) => d.date === "05.10.2026"), "Future date 05.10.2026 must be preserved!")
})

test("4.3 When ALL schedule days expire, key is completely removed with no zombie [] left", () => {
  mockStorage.clear()
  const now = new Date("2026-09-28T12:00:00Z")

  const ancientSchedule = [
    { date: "2026-05-01", weekday: "Пт", classes: [] },
    { date: "2026-05-08", weekday: "Пт", classes: [] },
  ]

  mockStorage.setItem("timacad_custom_sched_EXPIRED", JSON.stringify(ancientSchedule))
  const gcResult = performCacheGarbageCollection({ pastWeeksToKeep: 4, refDate: now })

  assert.strictEqual(gcResult.prunedScheduleDays, 2)
  assert.strictEqual(
    mockStorage.getItem("timacad_custom_sched_EXPIRED"),
    null,
    "Completely expired schedule key must be removed from storage"
  )
})

// --- SUITE 5: Temporary PDF Buffers Removal ---
console.log("\n--- SUITE 5: Temporary PDF Buffer Cleanup ---")

test("5.1 Temporary PDF parsing buffers and sessionStorage caches are purged", () => {
  mockStorage.clear()
  globalThis.sessionStorage.clear()

  mockStorage.setItem("timacad_pdf_buffer_1", "raw-pdf-stream-chunk-1")
  mockStorage.setItem("pdf_cache_preview_page1", "canvas-png-base64")
  mockStorage.setItem("temp_pdf_upload_777", "arraybuffer-hex")
  mockStorage.setItem("rgau_pdf_stream_data", "pdf-data")
  mockStorage.setItem("rgau_theme", "light") // user setting

  globalThis.sessionStorage.setItem("timacad_pdf_buffer_sess", "temp-session-data")

  const gcResult = performCacheGarbageCollection()

  assert.strictEqual(gcResult.removedPdfBuffers, 4, "Must remove all 4 PDF buffer keys")
  assert.strictEqual(mockStorage.getItem("timacad_pdf_buffer_1"), null)
  assert.strictEqual(mockStorage.getItem("pdf_cache_preview_page1"), null)
  assert.strictEqual(mockStorage.getItem("temp_pdf_upload_777"), null)
  assert.strictEqual(mockStorage.getItem("rgau_pdf_stream_data"), null)
  assert.strictEqual(globalThis.sessionStorage.getItem("timacad_pdf_buffer_sess"), null)

  assert.strictEqual(mockStorage.getItem("rgau_theme"), "light", "User setting must be preserved")
})

test("5.2 Multiple adjacent buffer keys are purged without in-place index shifting skips", () => {
  mockStorage.clear()
  // Create 6 alternating keys: buffer, setting, buffer, setting, buffer, buffer
  mockStorage.setItem("timacad_pdf_b1", "data1")
  mockStorage.setItem("rgau_theme", "dark")
  mockStorage.setItem("temp_pdf_b2", "data2")
  mockStorage.setItem("rgau_role", "student")
  mockStorage.setItem("pdf_cache_b3", "data3")
  mockStorage.setItem("rgau_pdf_b4", "data4")

  const res = performCacheGarbageCollection()
  assert.strictEqual(res.removedPdfBuffers, 4, "All 4 buffers must be purged without skipping")
  assert.strictEqual(mockStorage.getItem("rgau_theme"), "dark")
  assert.strictEqual(mockStorage.getItem("rgau_role"), "student")
})

// --- SUITE 6: User "Clear Cache" with Settings Preservation ---
console.log("\n--- SUITE 6: Clear Cache Action & Settings Preservation ---")

test("6.1 clearUserCache wipes heavy data while strictly preserving group, role, theme", () => {
  mockStorage.clear()

  // Crucial user settings:
  mockStorage.setItem("rgau_theme", "dark")
  mockStorage.setItem("rgau_my_group", "АГ-204")
  mockStorage.setItem("rgau_saved_groups", JSON.stringify(["АГ-204", "ЭК-101"]))
  mockStorage.setItem("rgau_role", "headstudent")
  mockStorage.setItem("rgau_dorm", "Общежитие 8")
  mockStorage.setItem(STORAGE_AUTO_SYNC, "true")
  mockStorage.setItem("rgau_ios_a2hs_dismissed", "true")

  // Volatile caches:
  mockStorage.setItem(STORAGE_CACHED_FEED, JSON.stringify([{ id: "1", title: "Heavy news item" }]))
  mockStorage.setItem(STORAGE_CACHED_SCHEDULE, JSON.stringify({ groups: { "АГ-204": { schedule: [] } } }))
  mockStorage.setItem("timacad_custom_sched_АГ-204", JSON.stringify([{ weekday: "Пн" }]))
  mockStorage.setItem("timacad_pdf_buffer_chunk", "huge-binary-pdf-chunk")

  const res = clearUserCache(true)

  assert.ok(res.freedBytes > 0, "Freed bytes must be > 0")

  // Verify volatile caches are gone:
  assert.strictEqual(mockStorage.getItem(STORAGE_CACHED_FEED), null)
  assert.strictEqual(mockStorage.getItem(STORAGE_CACHED_SCHEDULE), null)
  assert.strictEqual(mockStorage.getItem("timacad_custom_sched_АГ-204"), null)
  assert.strictEqual(mockStorage.getItem("timacad_pdf_buffer_chunk"), null)

  // Verify critical user settings are 100% PRESERVED:
  assert.strictEqual(mockStorage.getItem("rgau_theme"), "dark", "Theme must be preserved")
  assert.strictEqual(mockStorage.getItem("rgau_my_group"), "АГ-204", "User group must be preserved")
  assert.strictEqual(mockStorage.getItem("rgau_role"), "headstudent", "Role must be preserved")
  assert.strictEqual(mockStorage.getItem("rgau_dorm"), "Общежитие 8", "Dorm must be preserved")
  assert.strictEqual(mockStorage.getItem(STORAGE_AUTO_SYNC), "true", "Auto-sync preference must be preserved")
  assert.strictEqual(mockStorage.getItem("rgau_ios_a2hs_dismissed"), "true", "iOS prompt state preserved")

  assert.ok(mockStorage.getItem(STORAGE_LAST_CACHE_CLEANUP) !== null, "Cleanup timestamp recorded")
})

test("6.2 clearUserCache dispatches CACHE_CLEARED_EVENT for immediate UI state synchronization", () => {
  let eventDispatched = false
  const origWindow = globalThis.window
  globalThis.window = {
    dispatchEvent: (evt) => {
      if (evt.type === CACHE_CLEARED_EVENT) eventDispatched = true
    },
  }
  globalThis.CustomEvent = class {
    constructor(type) { this.type = type }
  }

  clearUserCache(true)
  assert.strictEqual(eventDispatched, true, "CACHE_CLEARED_EVENT must be dispatched to window")

  globalThis.window = origWindow
})

// --- SUITE 7: Date Parsing Helper Robustness ---
console.log("\n--- SUITE 7: Date Parsing Helper Robustness ---")

test("7.1 parseDateToMs parses ISO, DD.MM.YYYY and verbal Russian formats reliably", () => {
  // ISO
  const isoMs = parseDateToMs("2026-09-08")
  assert.ok(isoMs !== null)
  assert.strictEqual(new Date(isoMs).getUTCFullYear(), 2026)
  assert.strictEqual(new Date(isoMs).getUTCMonth(), 8) // 0-indexed September
  assert.strictEqual(new Date(isoMs).getUTCDate(), 8)

  // DD.MM.YYYY
  const ddmmyyyyMs = parseDateToMs("25.07.2026")
  assert.ok(ddmmyyyyMs !== null)
  assert.strictEqual(new Date(ddmmyyyyMs).getUTCFullYear(), 2026)
  assert.strictEqual(new Date(ddmmyyyyMs).getUTCMonth(), 6) // July
  assert.strictEqual(new Date(ddmmyyyyMs).getUTCDate(), 25)

  // Russian verbal
  const ruVerbalMs = parseDateToMs("12 сентября 2026")
  assert.ok(ruVerbalMs !== null)
  assert.strictEqual(new Date(ruVerbalMs).getUTCFullYear(), 2026)
  assert.strictEqual(new Date(ruVerbalMs).getUTCMonth(), 8)
  assert.strictEqual(new Date(ruVerbalMs).getUTCDate(), 12)

  // Invalid / Null
  assert.strictEqual(parseDateToMs(null), null)
  assert.strictEqual(parseDateToMs(""), null)
  assert.strictEqual(parseDateToMs("invalid-date-string"), null)
})

console.log("\n==================================================================")
console.log(`  TOTAL TESTS: ${totalPassed} | PASSED: ${totalPassed} | FAILED: 0`)
console.log("==================================================================")
console.log("\nALL CACHE RETENTION & GARBAGE COLLECTION CHECKS PASSED WITH 100% SUCCESS!\n")
