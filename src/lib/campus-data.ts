import { useEffect, useState } from "react"
import { get, set, del } from "idb-keyval"
import bundled from "../data/official-schedule.json"
import { validCatalog as valid, validGroup } from "./data-validation"
export interface Lesson { id: number; num: number; start: string; end: string; subject: string; type: string; teacher: string; building: string; room: string; sourceUrl?: string }
export interface Group { id?: number; name?: string; institute: string; instituteId?: string; course: number; studyForm?: string; sourceUrl?: string; schedulePath?: string; status?: string; checkedAt?: string; stale?: boolean; window?: {from: string; to: string}; schedule?: { date: string; weekday: string; classes: Lesson[] }[] }
export interface ScheduleData { meta: { schemaVersion?: number; status?: string; checkedAt?: string; lastSyncTime?: string; sourceUrl: string; electronicSourceUrl?: string; dataVersion?: string; totalGroups: number; totalClasses: number; currentTerm?: { startDate: string; endDate: string; academicYear: string; semester: number }; scheduleWindow?: { from: string; to: string } }; groups: Record<string, Group>; institutes: { id: string; name: string; short?: string }[]; documents?: { title: string; url: string; institute?: string }[] }
const fallback: ScheduleData = { meta: { sourceUrl: "https://www.timacad.ru/about/sveden/document/rezhim-zaniatii-obuchaiushchikhsia", totalGroups: 0, totalClasses: 0, status: "unavailable" }, groups: {}, institutes: [] }
export function safeSource(url?: string) { try { const u = new URL(url || ""); return u.protocol === "https:" && !u.username && !u.password && !u.port && (u.hostname === "timacad.ru" || u.hostname.endsWith(".timacad.ru")) ? u.href : "https://www.timacad.ru/students" } catch { return "https://www.timacad.ru/students" } }
const initial = valid(bundled) ? bundled as unknown as ScheduleData : fallback
const remoteBase = import.meta.env.VITE_SCHEDULE_BASE_URL || import.meta.env.BASE_URL
let cacheWrites: Promise<unknown> = Promise.resolve()
function retainGroup(key: string, path: string, group: Group) {
  cacheWrites = cacheWrites.catch(() => {}).then(async () => {
    await set(key, {path, group})
    const stored: unknown = await get("tim-v4-recent-groups").catch(() => [])
    const previous = Array.isArray(stored) ? stored.filter((k): k is string => typeof k === "string" && k.startsWith("tim-v4-group:")) : []
    const recent = [...new Set([key,...previous])]
    for (const expired of recent.slice(3)) await del(expired)
    await set("tim-v4-recent-groups", recent.slice(0,3))
  }).catch(() => {})
  return cacheWrites
}
async function fetchJson(path: string, signal: AbortSignal, maxBytes: number) {
  const response = await fetch(`${remoteBase}${path}`, { cache: "no-cache", signal: AbortSignal.any([signal, AbortSignal.timeout(20000)]) })
  if (!response.ok || !response.body || Number(response.headers.get("content-length")) > maxBytes) throw new Error("unavailable")
  const reader = response.body.getReader(), chunks: Uint8Array[] = []; let length = 0
  try { while (true) { const { done, value } = await reader.read(); if (done) break; length += value.length; if (length > maxBytes) throw new Error("oversized"); chunks.push(value) } }
  finally { await reader.cancel().catch(() => {}) }
  const bytes = new Uint8Array(length); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
  return JSON.parse(new TextDecoder().decode(bytes)) as unknown
}
export function useScheduleData(group: string) {
  const [data, setData] = useState<ScheduleData>(initial)
  const [selected, setSelected] = useState<Group | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState("")
  const [reload, setReload] = useState(0)
  useEffect(() => {
    const controller = new AbortController(); let live = true
    void (async () => {
      setSyncing(true)
      const cached = await get<ScheduleData>("tim-v4-catalog").catch(() => null)
      if (live && valid(cached) && (cached.meta.checkedAt || "") > (initial.meta.checkedAt || "")) setData(cached)
      try {
        const next = await fetchJson("data/official-schedule.json", controller.signal, 4_000_000)
        if (!valid(next)) throw new Error("invalid")
        if ((next.meta.checkedAt || "") < (initial.meta.checkedAt || "") || (valid(cached) && (next.meta.checkedAt || "") < (cached.meta.checkedAt || ""))) throw new Error("outdated")
        if (live) { setData(next); setError("") }
        await set("tim-v4-catalog", next).catch(() => {})
      } catch { if (live) setError("Обновление недоступно. Показана сохранённая версия.") }
      finally { if (live) setSyncing(false) }
    })()
    return () => { live = false; controller.abort() }
  }, [reload])
  useEffect(() => { const fn = () => setReload(n => n + 1); const timer = setInterval(fn, 3600000); window.addEventListener("online", fn); return () => { clearInterval(timer); window.removeEventListener("online", fn) } }, [])
  useEffect(() => {
    const controller = new AbortController(); let live = true
    setSelected(previous => previous?.name === group ? previous : null)
    const item = data.groups[group]
    if (!item) return
    if (!item.schedulePath) { setSelected(item); return }
    const groupKey = `tim-v4-group:${group}`
    void (async () => {
      const cached = await get<{ path: string; group: Group }>(groupKey).catch(() => null)
      const cacheMatches = cached?.path === item.schedulePath && validGroup(cached?.group, item, group, data.meta.scheduleWindow)
      const usableCache = validGroup(cached?.group, item, group)
      if (live && usableCache && cached) setSelected({ ...cached.group, stale: !cacheMatches })
      if (cacheMatches && cached) {
        const next = { ...item, schedule: cached.group.schedule, checkedAt: data.meta.checkedAt, window: data.meta.scheduleWindow }
        if (live) setSelected(next)
        await retainGroup(groupKey, item.schedulePath!, next)
        return
      }
      try {
        const match = item.schedulePath!.match(/^data\/groups\/(\d+)-([a-f0-9]{16})\.json$/)
        if (!match || Number(match[1]) !== item.id) throw new Error("invalid path")
        const payload = await fetchJson(item.schedulePath!, controller.signal, 2_000_000)
        if (!validGroup(payload, item, group, data.meta.scheduleWindow)) throw new Error("Invalid group snapshot")
        const next = { ...item, schedule: payload.schedule, checkedAt: data.meta.checkedAt, window: data.meta.scheduleWindow }
        const bytes = new TextEncoder().encode(JSON.stringify(next.schedule))
        const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))).map(b => b.toString(16).padStart(2,"0")).join("")
        if (hash.slice(0,16) !== match[2]) throw new Error("Snapshot integrity mismatch")
        if (live) setSelected(next)
        await retainGroup(groupKey, item.schedulePath!, next)
      } catch { if (live && !usableCache) setSelected({ ...item, status: "fetch-failed", schedule: [] }) }
    })()
    return () => { live = false; controller.abort() }
  }, [data, group, reload])
  return { catalog: data, groupData: selected?.name === group ? selected : null, syncing, syncError: error, refresh: () => setReload(n => n + 1) }
}
