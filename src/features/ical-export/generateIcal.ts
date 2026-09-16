// ─── iCal / WebCal Generator ─────────────────────────────────────────────────
// Generates RFC-5545 compliant .ics files for RGAU-МСХА class schedules

export interface IcalClass {
  id: number
  num: number
  start: string // "08:30"
  end: string   // "10:05"
  subject: string
  type: "lecture" | "practice" | "lab" | "elective"
  teacher: string
  building: string
  room: string
  weekType?: "all" | "odd" | "even"
  subgroup?: number
}

export interface IcalDay {
  date: string    // "2026-09-07"
  weekday: string // "Понедельник"
  classes: IcalClass[]
}

type ExportRange = "current-week" | "next-4-weeks" | "full-semester"

export interface IcalExportOptions {
  group: string
  schedule: IcalDay[]
  range: ExportRange
  includeAlarms: boolean
  subgroupFilter?: "1" | "2" | "all"
}

const TYPE_LABELS: Record<string, string> = {
  lecture: "Лекция",
  practice: "Практика",
  lab: "Лабораторная",
  elective: "Факультатив",
}

function pad(n: number): string {
  return String(n).padStart(2, "0")
}

function toIcalDate(dateStr: string): string {
  // "2026-09-07" → "20260907"
  return dateStr.replace(/-/g, "")
}

function toIcalDateTime(dateStr: string, timeStr: string): string {
  // "2026-09-07", "08:30" → "20260907T083000"
  const [hh, mm] = timeStr.split(":")
  return `${dateStr.replace(/-/g, "")}T${hh}${mm}00`
}

function getStudyWeekNumber(dateStr: string): number {
  // Semester starts 2026-09-01 (Monday, odd week 1)
  const semesterStart = new Date("2026-09-01T00:00:00")
  const d = new Date(dateStr + "T00:00:00")
  const diffMs = d.getTime() - semesterStart.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  return Math.floor(diffDays / 7) + 1
}

function escapeIcal(str: string): string {
  return str
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "")
}

function foldLine(line: string): string {
  // RFC 5545 line folding: max 75 octets, fold with CRLF + SPACE
  const bytes = new TextEncoder().encode(line)
  if (bytes.length <= 75) return line
  
  const chunks: string[] = []
  let current = ""
  let currentLen = 0
  
  for (const char of line) {
    const charBytes = new TextEncoder().encode(char).length
    if (currentLen + charBytes > 75 && current.length > 0) {
      chunks.push(current)
      current = " " + char
      currentLen = 1 + charBytes
    } else {
      current += char
      currentLen += charBytes
    }
  }
  if (current) chunks.push(current)
  
  return chunks.join("\r\n")
}

function generateUID(groupId: string, classId: number, dateStr: string): string {
  return `rgau-${groupId.replace(/\s/g, "-")}-${classId}-${dateStr}@raspos.rgau.ru`
}

function getAlarmBlock(minutesBefore: number, description: string): string {
  return [
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    `DESCRIPTION:${escapeIcal(description)}`,
    `TRIGGER:-PT${minutesBefore}M`,
    "END:VALARM",
  ].join("\r\n")
}

function filterDaysByRange(schedule: IcalDay[], range: ExportRange): IcalDay[] {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  
  const todayStr = today.toISOString().split("T")[0]
  
  // Find the start of the current week (Monday)
  const dayOfWeek = today.getDay() // 0=Sun, 1=Mon
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
  const weekStart = new Date(today)
  weekStart.setDate(today.getDate() + mondayOffset)
  const weekStartStr = weekStart.toISOString().split("T")[0]
  
  let endDate: Date
  
  if (range === "current-week") {
    endDate = new Date(weekStart)
    endDate.setDate(weekStart.getDate() + 6)
  } else if (range === "next-4-weeks") {
    endDate = new Date(weekStart)
    endDate.setDate(weekStart.getDate() + 27)
  } else {
    // full-semester: until 2027-01-31
    endDate = new Date("2027-01-31")
  }
  
  const endStr = endDate.toISOString().split("T")[0]
  
  return schedule.filter(
    (day) => day.date >= weekStartStr && day.date <= endStr && day.classes.length > 0
  )
}

export function generateIcalString(options: IcalExportOptions): string {
  const { group, schedule, range, includeAlarms, subgroupFilter = "all" } = options
  
  const filteredDays = filterDaysByRange(schedule, range)
  
  const events: string[] = []
  const now = new Date()
  const dtstamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`
  
  filteredDays.forEach((day) => {
    const weekNum = getStudyWeekNumber(day.date)
    const isOdd = weekNum % 2 !== 0
    
    day.classes.forEach((cls) => {
      // Filter by week type
      if (cls.weekType === "odd" && !isOdd) return
      if (cls.weekType === "even" && isOdd) return
      
      // Filter by subgroup
      if (subgroupFilter !== "all" && cls.subgroup !== undefined) {
        if (cls.subgroup !== Number(subgroupFilter)) return
      }
      
      const dtstart = toIcalDateTime(day.date, cls.start)
      const dtend = toIcalDateTime(day.date, cls.end)
      const uid = generateUID(group, cls.id, day.date)
      const typeLabel = TYPE_LABELS[cls.type] || cls.type
      
      const summary = escapeIcal(`${cls.subject} (${typeLabel})`)
      const location = escapeIcal(
        cls.room
          ? `ауд. ${cls.room}, ${cls.building}`
          : cls.building
      )
      const descLines = [
        `Группа: ${group}`,
        `Преподаватель: ${cls.teacher || "—"}`,
        `Тип: ${typeLabel}`,
        cls.subgroup ? `Подгруппа: ${cls.subgroup}` : "",
        `Корпус: ${cls.building}`,
        cls.room ? `Аудитория: ${cls.room}` : "",
        `Пара №${cls.num}: ${cls.start}–${cls.end}`,
      ].filter(Boolean).join("\\n")
      
      const lines = [
        "BEGIN:VEVENT",
        foldLine(`UID:${uid}`),
        `DTSTAMP:${dtstamp}`,
        `DTSTART:${dtstart}`,
        `DTEND:${dtend}`,
        foldLine(`SUMMARY:${summary}`),
        foldLine(`LOCATION:${location}`),
        foldLine(`DESCRIPTION:${descLines}`),
        `STATUS:CONFIRMED`,
        `CLASS:PUBLIC`,
        `TRANSP:OPAQUE`,
      ]
      
      if (includeAlarms) {
        lines.push(
          getAlarmBlock(15, `Через 15 минут: ${cls.subject}`)
        )
        if (cls.start >= "08:00") {
          // Morning prep alarm if class is in first half
          lines.push(
            getAlarmBlock(60, `Напоминание: ${cls.subject} в ${cls.start} — ${cls.building}`)
          )
        }
      }
      
      lines.push("END:VEVENT")
      events.push(lines.join("\r\n"))
    })
  })
  
  const rangeLabels: Record<ExportRange, string> = {
    "current-week": "текущая неделя",
    "next-4-weeks": "4 недели",
    "full-semester": "весь семестр",
  }
  
  const calLines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//RGAU-МСХА RasPOS//v3.0//RU",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    foldLine(`X-WR-CALNAME:РГАУ-МСХА · ${group} · ${rangeLabels[range]}`),
    "X-WR-TIMEZONE:Europe/Moscow",
    "X-WR-CALDESC:Расписание занятий РГАУ-МСХА им. К.А. Тимирязева",
    "BEGIN:VTIMEZONE",
    "TZID:Europe/Moscow",
    "BEGIN:STANDARD",
    "DTSTART:19701025T030000",
    "TZOFFSETFROM:+0400",
    "TZOFFSETTO:+0300",
    "TZNAME:MSK",
    "END:STANDARD",
    "END:VTIMEZONE",
    ...events,
    "END:VCALENDAR",
  ]
  
  return calLines.join("\r\n") + "\r\n"
}

export function downloadIcal(icalString: string, filename: string): void {
  const blob = new Blob([icalString], { type: "text/calendar;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}

export function generateAndDownload(options: IcalExportOptions): void {
  const ical = generateIcalString(options)
  const groupSlug = options.group.replace(/\s+/g, "-").toUpperCase()
  downloadIcal(ical, `RGAU-${groupSlug}-schedule.ics`)
}
