import { useState, useEffect, useMemo } from "react"

interface ClassItem {
  id: number
  num: number
  start: string
  end: string
  subject: string
  type: "lecture" | "practice" | "lab" | "elective"
  teacher: string
  building: string
  room: string
  weekType?: "all" | "odd" | "even"
  subgroup?: number
}

interface DaySchedule {
  date: string
  weekday: string
  classes: ClassItem[]
}

interface Props {
  allDays: DaySchedule[]
  weekFilter: "current" | "odd" | "even" | "all"
  subgroupPref?: "1" | "2" | "all"
}

type ClassStatus = "next" | "current" | "none"

interface NextClass {
  cls: ClassItem
  date: string
  status: ClassStatus
  minutesUntil: number   // minutes until start (negative = already started)
  minutesLeft?: number   // minutes remaining (if in progress)
  progressPct?: number   // 0-100 progress through class
}

function getStudyWeek(dateStr: string): number {
  const semStart = new Date("2026-09-01T00:00:00")
  const d = new Date(dateStr + "T00:00:00")
  const diffDays = Math.floor((d.getTime() - semStart.getTime()) / 86400000)
  return Math.floor(diffDays / 7) + 1
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number)
  return h * 60 + m
}

const TYPE_COLORS: Record<string, string> = {
  lecture: "bg-primary/10 border-primary/25 text-primary",
  practice: "bg-amber-500/10 border-amber-500/25 text-amber-600 dark:text-amber-400",
  lab: "bg-blue-500/10 border-blue-500/25 text-blue-600 dark:text-blue-400",
  elective: "bg-purple-500/10 border-purple-500/25 text-purple-600 dark:text-purple-400",
}

const TYPE_LABELS: Record<string, string> = {
  lecture: "Лекция",
  practice: "Практика",
  lab: "Лабораторная",
  elective: "Факультатив",
}

export default function NextClassBanner({ allDays, weekFilter, subgroupPref = "all" }: Props) {
  const [now, setNow] = useState(() => new Date())
  const [dismissed, setDismissed] = useState(false)

  // Update every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 30000)
    return () => clearInterval(interval)
  }, [])

  // Reset dismiss on day change
  useEffect(() => {
    const dateKey = now.toISOString().split("T")[0]
    const lastDate = sessionStorage.getItem("nextclass_dismiss_date")
    if (lastDate !== dateKey) {
      setDismissed(false)
      sessionStorage.setItem("nextclass_dismiss_date", dateKey)
    }
  }, [now])

  const nextClass = useMemo((): NextClass | null => {
    const todayStr = now.toISOString().split("T")[0]
    const nowMinutes = now.getHours() * 60 + now.getMinutes()

    // Look at today and tomorrow
    for (const targetDate of [todayStr]) {
      const day = allDays.find((d) => d.date === targetDate)
      if (!day) continue

      const weekNum = getStudyWeek(targetDate)
      const isOdd = weekNum % 2 !== 0

      // Filter classes
      const eligible = day.classes.filter((cls) => {
        if (weekFilter !== "all") {
          if (cls.weekType === "odd" && !isOdd) return false
          if (cls.weekType === "even" && isOdd) return false
        }
        if (subgroupPref !== "all" && cls.subgroup) {
          if (cls.subgroup !== Number(subgroupPref)) return false
        }
        return true
      })

      // Sort by start time
      const sorted = [...eligible].sort(
        (a, b) => timeToMinutes(a.start) - timeToMinutes(b.start)
      )

      for (const cls of sorted) {
        const startMin = timeToMinutes(cls.start)
        const endMin = timeToMinutes(cls.end)

        if (nowMinutes >= startMin && nowMinutes < endMin) {
          // Currently in class
          const minutesLeft = endMin - nowMinutes
          const totalDuration = endMin - startMin
          const elapsed = nowMinutes - startMin
          return {
            cls,
            date: targetDate,
            status: "current",
            minutesUntil: 0,
            minutesLeft,
            progressPct: Math.min(100, Math.round((elapsed / totalDuration) * 100)),
          }
        }

        if (nowMinutes < startMin) {
          // Upcoming class
          const minutesUntil = startMin - nowMinutes
          if (minutesUntil <= 90) {
            // Only show if within 90 minutes
            return {
              cls,
              date: targetDate,
              status: "next",
              minutesUntil,
            }
          }
          break
        }
      }
    }

    return null
  }, [allDays, now, weekFilter, subgroupPref])

  if (!nextClass || dismissed) return null

  const { cls, status, minutesUntil, minutesLeft, progressPct } = nextClass
  const typeColors = TYPE_COLORS[cls.type] || TYPE_COLORS.lecture

  function formatTime(mins: number): string {
    if (mins <= 0) return "сейчас"
    if (mins === 1) return "1 мин"
    if (mins < 60) return `${mins} мин`
    const h = Math.floor(mins / 60)
    const m = mins % 60
    return m > 0 ? `${h} ч ${m} мин` : `${h} ч`
  }

  return (
    <div className="mx-3 mt-2 mb-0 animate-slide-up">
      <div className={`relative rounded-2xl border overflow-hidden ${
        status === "current"
          ? "bg-primary/6 border-primary/20"
          : minutesUntil <= 15
            ? "bg-amber-500/6 border-amber-500/25"
            : "bg-card border-border/60"
      }`}>
        {/* Progress bar for current class */}
        {status === "current" && progressPct !== undefined && (
          <div
            className="absolute bottom-0 left-0 h-0.5 bg-primary transition-all duration-[30000ms] rounded-full"
            style={{ width: `${progressPct}%` }}
          />
        )}

        <div className="flex items-center gap-3 px-3.5 py-2.5">
          {/* Status dot */}
          <div className="flex-shrink-0">
            {status === "current" ? (
              <div className="w-2 h-2 rounded-full bg-primary live-dot" />
            ) : minutesUntil <= 15 ? (
              <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            ) : (
              <div className="w-2 h-2 rounded-full bg-muted-fg/40" />
            )}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              {/* Status label */}
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md border ${typeColors}`}>
                {TYPE_LABELS[cls.type]}
              </span>
              <span className={`text-[10px] font-bold ${
                status === "current" ? "text-primary" : minutesUntil <= 15 ? "text-amber-600 dark:text-amber-400" : "text-muted-fg"
              }`}>
                {status === "current"
                  ? `Идёт · ещё ${formatTime(minutesLeft ?? 0)}`
                  : `Через ${formatTime(minutesUntil)}`}
              </span>
            </div>
            <p className="text-xs font-bold text-fg mt-0.5 truncate">{cls.subject}</p>
            <p className="text-[10px] text-muted-fg truncate">
              {cls.start}–{cls.end}
              {cls.room ? ` · ауд. ${cls.room}` : ""}
              {cls.building ? ` · ${cls.building.replace(/\(.*\)/, "").trim()}` : ""}
            </p>
          </div>

          {/* Time display */}
          <div className="flex-shrink-0 text-right">
            <div className={`text-base font-mono font-black ${
              status === "current" ? "text-primary" : minutesUntil <= 15 ? "text-amber-600 dark:text-amber-400" : "text-fg"
            }`}>
              {cls.start}
            </div>
            <button
              onClick={() => setDismissed(true)}
              className="text-[9px] text-muted-fg hover:text-fg transition-colors cursor-pointer mt-0.5"
            >
              Скрыть
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
