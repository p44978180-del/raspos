import type { ScheduleData, Group } from "./campus-data"
import type { StudentData } from "./student-store"

const record = (v: unknown): v is Record<string, any> => !!v && typeof v === "object" && !Array.isArray(v)
const text = (v: unknown, max = 1000): v is string => typeof v === "string" && v.length <= max
export function validDate(v: unknown): v is string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false
  const time = Date.parse(`${v}T12:00:00Z`)
  return Number.isFinite(time) && new Date(time).toISOString().slice(0,10) === v
}
const time = (v: unknown): v is string => typeof v === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(v)
const official = (v: unknown) => {
  if (!text(v, 2048)) return false
  try { const u = new URL(v); return u.protocol === "https:" && !u.username && !u.password && !u.port && (u.hostname === "timacad.ru" || u.hostname.endsWith(".timacad.ru")) } catch { return false }
}
export function validCatalog(v: unknown): v is ScheduleData {
  if (!record(v) || !record(v.meta) || !record(v.groups) || !Array.isArray(v.institutes) || v.institutes.length > 100) return false
  const m = v.meta, entries = Object.entries(v.groups)
  if (m.schemaVersion !== 4 || !official(m.sourceUrl) || !official(m.electronicSourceUrl) || !text(m.checkedAt,40) || !Number.isFinite(Date.parse(m.checkedAt))) return false
  if (!text(m.dataVersion,64) || !/^[a-f0-9]{64}$/.test(m.dataVersion) || entries.length > 5000 || m.totalGroups !== entries.length || !Number.isSafeInteger(m.totalClasses) || m.totalClasses < 0) return false
  if (!record(m.currentTerm) || !validDate(m.currentTerm.startDate) || !validDate(m.currentTerm.endDate) || !/^[0-9]{4}\/[0-9]{4}$/.test(m.currentTerm.academicYear) || ![1,2].includes(m.currentTerm.semester)) return false
  if (!record(m.scheduleWindow) || !validDate(m.scheduleWindow.from) || !validDate(m.scheduleWindow.to) || m.scheduleWindow.from > m.scheduleWindow.to || m.scheduleWindow.from < m.currentTerm.startDate || m.scheduleWindow.to > m.currentTerm.endDate) return false
  if (v.institutes.some(i => !record(i) || !text(i.id,100) || !text(i.name,500) || (i.short !== undefined && !text(i.short,500)))) return false
  if (entries.some(([name,g]) => !record(g) || !name || name.length > 150 || !Number.isSafeInteger(g.id) || g.id < 1 || g.name !== name || !text(g.institute,500) || !text(g.instituteId,100) || !Number.isInteger(g.course) || g.course < 0 || g.course > 8 || !official(g.sourceUrl) || !["current","no-classes","fetch-failed"].includes(g.status) || (g.status !== "fetch-failed" && (typeof g.schedulePath !== "string" || !new RegExp(`^data/groups/${g.id}-[a-f0-9]{16}\\.json$`).test(g.schedulePath))))) return false
  return Array.isArray(v.documents) && v.documents.length <= 2000 && v.documents.every(d => record(d) && text(d.title,1000) && official(d.url))
}
export function validGroup(v: unknown, item: Group, name: string, window?: {from: string; to: string}): v is Group {
  if (!record(v) || v.id !== item.id || v.name !== name || !Array.isArray(v.schedule) || v.schedule.length > 200) return false
  const dates = new Set<string>()
  return v.schedule.every(d => {
    if (!record(d) || !validDate(d.date) || dates.has(d.date) || !text(d.weekday,30) || !Array.isArray(d.classes) || d.classes.length > 100 || (window && (d.date < window.from || d.date > window.to))) return false
    dates.add(d.date)
    return d.classes.every(l => record(l) && Number.isSafeInteger(l.id) && Number.isInteger(l.num) && l.num >= 1 && l.num <= 12 && time(l.start) && time(l.end) && l.start < l.end && text(l.subject,2000) && !!l.subject.trim() && text(l.teacher,2000) && text(l.building,1000) && text(l.room,2000) && ["lecture","practice","lab","other"].includes(l.type) && (l.sourceUrl === undefined || official(l.sourceUrl)))
  })
}
export function validStudent(v: unknown): v is StudentData {
  if (!record(v) || !text(v.group,150) || !text(v.name,40) || !text(v.notes,100000) || !Array.isArray(v.favorites) || v.favorites.length > 5000 || v.favorites.some(f => !text(f,150))) return false
  if (!Array.isArray(v.tasks) || v.tasks.length > 10000 || !Array.isArray(v.plans) || v.plans.length > 10000) return false
  const ids = new Set<string>()
  const id = (v: unknown) => { if (!text(v,100) || !v || ids.has(v)) return false; ids.add(v); return true }
  if (!v.tasks.every(t => record(t) && id(t.id) && text(t.title,300) && !!t.title.trim() && (t.date === "" || validDate(t.date)) && typeof t.done === "boolean" && ["task","homework"].includes(t.kind))) return false
  return v.plans.every(p => record(p) && id(p.id) && text(p.title,300) && !!p.title.trim() && validDate(p.date) && time(p.start) && time(p.end) && p.start < p.end && text(p.room,200) && (p.cancelled === undefined || typeof p.cancelled === "boolean"))
}
