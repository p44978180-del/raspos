import { useEffect, useState } from "react"
import { get, set } from "idb-keyval"
import { validStudent } from "./data-validation"
import { Capacitor } from "@capacitor/core"
import { Filesystem, Directory, Encoding } from "@capacitor/filesystem"
import { Share } from "@capacitor/share"

export interface Task { id: string; title: string; date: string; done: boolean; kind: "task" | "homework" }
export interface Plan { id: string; title: string; date: string; start: string; end: string; room: string; cancelled?: boolean }
export interface StudentData { group: string; name: string; tasks: Task[]; notes: string; plans: Plan[]; favorites: string[] }
const empty: StudentData = { group: "", name: "", tasks: [], notes: "", plans: [], favorites: [] }
const key = "tim-campus-personal-v4"
let snapshot = empty
let loaded = false
let error = ""
const listeners = new Set<() => void>()
let writing: Promise<unknown> = Promise.resolve()
function emit() { listeners.forEach(fn => fn()) }
const init = get<StudentData>(key).then(value => {
  if (validStudent(value)) snapshot = value
  else if (value !== undefined) error = "Сохранённые данные повреждены. Восстановите резервную копию."
}).catch(() => { error = "Хранилище недоступно. Изменения останутся только до закрытия приложения." }).finally(() => { loaded = true; emit() })

export function updateStudent(update: Partial<StudentData> | ((data: StudentData) => Partial<StudentData>)) {
  if (!loaded) return
  const candidate = { ...snapshot, ...(typeof update === "function" ? update(snapshot) : update) }
  if (!validStudent(candidate)) { error = "Запись не сохранена: проверьте даты и размер данных."; emit(); return }
  snapshot = candidate
  const next = snapshot
  emit()
  writing = writing.catch(() => {}).then(() => set(key, next)).then(() => { if (error) { error = ""; emit() } }).catch(() => { error = "Не удалось сохранить. Освободите место и повторите изменение."; emit() })
}

export function useStudent() {
  const [, redraw] = useState(0)
  useEffect(() => { const fn = () => redraw(n => n + 1); listeners.add(fn); void init.then(fn); return () => { listeners.delete(fn) } }, [])
  return { data: snapshot, ready: loaded, storageError: error, update: updateStudent }
}

export function moscowToday() { return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Moscow", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()) }
export function addDays(date: string, amount: number) { const d = new Date(date + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + amount); return d.toISOString().slice(0, 10) }
export function shortDate(date: string, options?: Intl.DateTimeFormatOptions) { return new Date(date + "T12:00:00Z").toLocaleDateString("ru-RU", options || { day: "numeric", month: "long" }) }
export async function downloadText(name: string, content: string, type = "application/json") {
  if (!/^[a-z0-9-]+\.(json|ics)$/.test(name)) throw new Error("Invalid export filename")
  if (Capacitor.isNativePlatform()) {
    // App-private cache, exposed only after the user opens the system share sheet.
    // Fixed filenames keep temporary export storage bounded across repeated exports.
    const file = await Filesystem.writeFile({ path: `tim-exports/${name}`, data: content, directory: Directory.Cache, encoding: Encoding.UTF8, recursive: true })
    await Share.share({ title: "ТИМ Кампус", files: [file.uri], dialogTitle: "Сохранить или отправить файл" })
    return
  }
  const url = URL.createObjectURL(new Blob([content], { type })); const a = document.createElement("a"); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function exportPlans(plans: Plan[]) {
  const escape = (s: string) => s.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/[,;]/g, m => `\\${m}`).replace(/\r/g, "")
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//TIM Campus//Personal Planner//RU", "CALSCALE:GREGORIAN"]
  for (const p of plans.filter(p => !p.cancelled)) {
    // Moscow is UTC+03:00. UTC timestamps avoid a missing VTIMEZONE definition.
    const dt = (time: string) => new Date(`${p.date}T${time}:00+03:00`).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")
    lines.push("BEGIN:VEVENT", `UID:${escape(p.id)}@tim-campus.local`, `DTSTAMP:${stamp}`, `DTSTART:${dt(p.start)}`, `DTEND:${dt(p.end)}`, `SUMMARY:${escape(p.title)}`, `LOCATION:${escape(p.room)}`, "DESCRIPTION:Личный план. Не является официальным расписанием университета.", "END:VEVENT")
  }
  lines.push("END:VCALENDAR")
  // RFC 5545: fold by UTF-8 octet count, without splitting a code point.
  const folded = lines.map(line => { let out = "", bytes = 0; for (const c of line) { const n = new TextEncoder().encode(c).length; if (bytes + n > 73) { out += "\r\n "; bytes = 1 } out += c; bytes += n } return out }).join("\r\n") + "\r\n"
  return downloadText("tim-personal-plan.ics", folded, "text/calendar;charset=utf-8")
}
