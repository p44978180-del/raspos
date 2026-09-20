import type { StudentData } from "./student-store"
import { validStudent } from "./data-validation.ts"
export function parseBackup(content: string): StudentData {
  if (new TextEncoder().encode(content).length > 5_000_000) throw new Error("Файл больше 5 МБ")
  const value: unknown = JSON.parse(content)
  if (!value || typeof value !== "object" || !("version" in value) || value.version !== 4 || !("data" in value) || !validStudent(value.data)) throw new Error("Нужна корректная резервная копия ТИМ Кампус 4")
  return value.data
}
export function mergeBackup(current: StudentData, backup: StudentData): StudentData {
  if (!validStudent(current) || !validStudent(backup)) throw new Error("Некорректные личные данные")
  const merge = <T extends {id: string}>(a: T[], b: T[]) => [...new Map([...a,...b].map(item => [item.id,item])).values()]
  const notes = !current.notes ? backup.notes : !backup.notes || current.notes === backup.notes ? current.notes : `${current.notes}\n\n— Из резервной копии —\n${backup.notes}`
  const next = { name: current.name || backup.name, group: current.group || backup.group, tasks: merge(current.tasks,backup.tasks), plans: merge(current.plans,backup.plans), favorites: [...new Set([...current.favorites,...backup.favorites])], notes }
  if (!validStudent(next)) throw new Error("Объединённые данные превышают допустимый размер")
  return next
}
