import React, { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { I } from "@/shared/ui/Icons"
import { getStudyWeek, WDAY, TODAY } from "@/entities/lesson/lib/getStudyWeek"
import type { DaySchedule, WeekFilterMode } from "@/entities/lesson/model/types"

export interface DaySliderProps {
  selDate: string
  onDateChange: (d: string) => void
  activeDays: DaySchedule[]
  weekFilterMode: WeekFilterMode
  showWeek: boolean
  onToggleShowWeek: () => void
  onOpenBell: () => void
}

export function DaySlider({
  selDate,
  onDateChange,
  activeDays,
  weekFilterMode,
  showWeek,
  onToggleShowWeek,
  onOpenBell,
}: DaySliderProps) {
  const [direction, setDirection] = useState(0)

  // Compute week days for current selDate
  const dObj = new Date(selDate + "T00:00:00")
  const dayDow = dObj.getDay() === 0 ? 6 : dObj.getDay() - 1
  const ws = new Date(dObj)
  ws.setDate(ws.getDate() - dayDow)

  const weekDays: string[] = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(ws)
    d.setDate(d.getDate() + i)
    const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
    weekDays.push(ymd)
  }

  const currentDayIndex = weekDays.indexOf(selDate)

  function shiftWeek(n: number) {
    const d = new Date(selDate + "T00:00:00")
    d.setDate(d.getDate() + n * 7)
    const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
    onDateChange(ymd)
  }

  function goToDay(d: string, dir: number) {
    setDirection(dir)
    onDateChange(d)
  }

  const isCurrentWeek = weekDays.includes(TODAY)

  return (
    <div className="space-y-2">
      <div className="px-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={onToggleShowWeek}
            className={`flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-xl border transition-all cursor-pointer ${
              showWeek
                ? "bg-primary text-white border-primary"
                : "border-border text-muted-fg bg-card hover:border-accent/50"
            }`}
          >
            Неделя {I.chev(showWeek ? "up" : "down", 11)}
          </button>
          {!isCurrentWeek && (
            <button
              onClick={() => onDateChange(TODAY)}
              className="text-xs font-semibold text-primary hover:text-accent transition-colors cursor-pointer"
            >
              {I.chev("left", 12)} Сегодня
            </button>
          )}
        </div>
        <button
          onClick={onOpenBell}
          className="text-xs font-semibold text-muted-fg hover:text-fg flex items-center gap-1 px-2.5 py-1 rounded-xl border border-border/60 bg-card hover:border-primary/40 transition-all cursor-pointer"
          title="Официальный график звонков РГАУ-МСХА"
        >
          <span>🔔</span> Звонки
        </button>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={currentDayIndex}
          className="flex gap-1.5 overflow-x-auto px-4 pb-2"
          style={{ scrollbarWidth: "none" }}
          drag="x"
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.1}
          onDragEnd={(_e, info) => {
            const { offset, velocity } = info
            if (offset.x < -60 || velocity.x < -500) {
              // swipe left = next day
              const nextIdx = Math.min(currentDayIndex + 1, weekDays.length - 1)
              if (nextIdx !== currentDayIndex) {
                goToDay(weekDays[nextIdx], 1)
              }
            } else if (offset.x > 60 || velocity.x > 500) {
              // swipe right = prev day
              const prevIdx = Math.max(currentDayIndex - 1, 0)
              if (prevIdx !== currentDayIndex) {
                goToDay(weekDays[prevIdx], -1)
              }
            }
          }}
          initial={{ x: direction > 0 ? 40 : direction < 0 ? -40 : 0, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: direction > 0 ? -40 : 40, opacity: 0 }}
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        >
          <button
            onClick={() => shiftWeek(-1)}
            className="flex-shrink-0 flex items-center justify-center w-9 h-12 rounded-xl border border-border bg-card text-muted-fg hover:text-fg hover:border-accent/40 transition-all cursor-pointer"
          >
            {I.chev("left", 16)}
          </button>
          {weekDays.map((d) => {
            const dd = new Date(d + "T00:00:00")
            const dayData = activeDays.find((x) => x.date === d)
            const dayWeekNum = getStudyWeek(d)
            const dayIsOdd = dayWeekNum % 2 !== 0
            const activeClasses = (dayData?.classes ?? []).filter(
              (c) =>
                !c.weekType ||
                c.weekType === "all" ||
                (weekFilterMode === "odd" && c.weekType === "odd") ||
                (weekFilterMode === "even" && c.weekType === "even") ||
                weekFilterMode === "all" ||
                (weekFilterMode === "current" &&
                  (dayIsOdd ? c.weekType === "odd" : c.weekType === "even")),
            )
            const clsCount = activeClasses.length
            const isSel = d === selDate
            const isTod = d === TODAY
            const dayIdx = dd.getDay() === 0 ? 6 : dd.getDay() - 1
            const isWeekend = dayIdx >= 5

            return (
              <button
                key={d}
                onClick={() => goToDay(d, weekDays.indexOf(d) > currentDayIndex ? 1 : -1)}
                className={`flex-shrink-0 flex flex-col items-center gap-0.5 px-2.5 py-2 rounded-xl border transition-all duration-150 min-w-[2.8rem] active:scale-95 cursor-pointer ${
                  isSel
                    ? "bg-primary border-primary text-white shadow-md"
                    : isTod
                      ? "border-accent bg-muted text-primary"
                      : isWeekend
                        ? "border-border bg-muted/50 text-muted-fg hover:border-accent/40"
                        : "border-border bg-card text-fg hover:border-accent/40 hover:shadow-sm"
                }`}
              >
                <span className="text-[10px] font-semibold opacity-70">
                  {WDAY[dayIdx]}
                </span>
                <span
                  className="text-base font-bold leading-none"
                  style={{ fontFamily: "var(--font-mono)" }}
                >
                  {dd.getDate()}
                </span>
                {clsCount > 0 ? (
                  <span
                    className={`text-[9px] font-bold ${
                      isSel ? "text-white/70" : "text-accent"
                    }`}
                  >
                    {clsCount}п
                  </span>
                ) : (
                  <span className="h-3" />
                )}
              </button>
            )
          })}
          <button
            onClick={() => shiftWeek(1)}
            className="flex-shrink-0 flex items-center justify-center w-9 h-12 rounded-xl border border-border bg-card text-muted-fg hover:text-fg hover:border-accent/40 transition-all cursor-pointer"
          >
            {I.chev("right", 16)}
          </button>
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
