export function getStudyWeek(ds: string): number {
  const d = new Date(ds + "T00:00:00")
  const sep1 = new Date("2026-09-01T00:00:00")
  const dow = sep1.getDay()
  const back = dow === 0 ? 6 : dow - 1
  const ws = new Date(sep1)
  ws.setDate(ws.getDate() - back)
  return Math.floor((d.getTime() - ws.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1
}

export function isOddWeek(ds: string): boolean {
  return getStudyWeek(ds) % 2 !== 0
}

export function getWeekStart(ds: string): Date {
  const d = new Date(ds + "T00:00:00")
  d.setDate(d.getDate() - (d.getDay() === 0 ? 6 : d.getDay() - 1))
  return d
}

export function fmtYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

export const toMin = (t: string): number => {
  const [h, m] = t.split(":").map(Number)
  return h * 60 + m
}

export const fmtDate = (ds: string): string =>
  new Date(ds + "T00:00:00").toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  })

export const TODAY: string = new Date().toISOString().split("T")[0]

export const WDAY = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"]
