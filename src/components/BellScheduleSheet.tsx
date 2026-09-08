import React from "react"
import { BELL_TIMES, BREAKS } from "../utils/timacadPdfParser"

export interface BellScheduleSheetProps {
  nowMin: number
  onClose: () => void
  onEat?: () => void
}

export function getCurrentBellStatus(nowMin: number): {
  status: "before" | "class" | "break" | "after"
  text: string
  detail: string
  currentNum?: number
  nextNum?: number
  progressPct?: number
} {
  const first = { start: 8 * 60 + 30, end: 10 * 60 + 5 }
  const last = { start: 19 * 60 + 45, end: 21 * 60 + 20 }

  if (nowMin < first.start) {
    const diff = first.start - nowMin
    const h = Math.floor(diff / 60)
    const m = diff % 60
    return {
      status: "before",
      text: "До начала занятий",
      detail: h > 0 ? `${h} ч ${m} мин до 1-й пары (08:30)` : `${m} мин до 1-й пары (08:30)`,
    }
  }

  if (nowMin >= last.end) {
    return {
      status: "after",
      text: "Учебный день завершён",
      detail: "Занятия на сегодня окончены. Отличного отдыха!",
    }
  }

  // Check each official pair
  const PAIRS = [
    { num: 1, start: 8 * 60 + 30, end: 10 * 60 + 5, sStr: "08:30", eStr: "10:05" },
    { num: 2, start: 10 * 60 + 20, end: 11 * 60 + 55, sStr: "10:20", eStr: "11:55" },
    { num: 3, start: 12 * 60 + 25, end: 14 * 60, sStr: "12:25", eStr: "14:00" },
    { num: 4, start: 14 * 60 + 15, end: 15 * 60 + 50, sStr: "14:15", eStr: "15:50" },
    { num: 5, start: 16 * 60 + 5, end: 17 * 60 + 40, sStr: "16:05", eStr: "17:40" },
    { num: 6, start: 17 * 60 + 55, end: 19 * 60 + 30, sStr: "17:55", eStr: "19:30" },
    { num: 7, start: 19 * 60 + 45, end: 21 * 60 + 20, sStr: "19:45", eStr: "21:20" },
  ]

  for (const p of PAIRS) {
    if (nowMin >= p.start && nowMin < p.end) {
      const left = p.end - nowMin
      const total = p.end - p.start
      const passed = nowMin - p.start
      const pct = Math.min(100, Math.max(0, Math.round((passed / total) * 100)))
      return {
        status: "class",
        text: `Идёт ${p.num}-я пара`,
        detail: `До конца ${left} мин (до ${p.eStr})`,
        currentNum: p.num,
        progressPct: pct,
      }
    }
  }

  // Otherwise in break between pairs
  for (let i = 0; i < PAIRS.length - 1; i++) {
    const cur = PAIRS[i]
    const next = PAIRS[i + 1]
    if (nowMin >= cur.end && nowMin < next.start) {
      const left = next.start - nowMin
      const isLunch = cur.num === 2 // 11:55 - 12:25
      return {
        status: "break",
        text: isLunch ? "🍽 Большой обеденный перерыв (30 мин)" : `Перерыв (${next.start - cur.end} мин)`,
        detail: `Следующая пара (${next.num}-я) начнётся через ${left} мин в ${next.sStr}`,
        nextNum: next.num,
      }
    }
  }

  return {
    status: "after",
    text: "Занятия окончены",
    detail: "Учебный день подошёл к концу",
  }
}

export default function BellScheduleSheet({
  nowMin,
  onClose,
  onEat,
}: BellScheduleSheetProps) {
  const currentStatus = getCurrentBellStatus(nowMin)

  const BELLS = [
    { num: 1, time: "08:30 – 10:05", breakAfter: "15 мин перерыв" },
    { num: 2, time: "10:20 – 11:55", breakAfter: "🍽 30 мин большой обеденный перерыв" },
    { num: 3, time: "12:25 – 14:00", breakAfter: "15 мин перерыв" },
    { num: 4, time: "14:15 – 15:50", breakAfter: "15 мин перерыв" },
    { num: 5, time: "16:05 – 17:40", breakAfter: "15 мин перерыв" },
    { num: 6, time: "17:55 – 19:30", breakAfter: "15 мин перерыв" },
    { num: 7, time: "19:45 – 21:20", breakAfter: "Завершение занятий" },
  ]

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end justify-center p-0 sm:p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-card w-full max-w-lg rounded-t-3xl sm:rounded-3xl border border-border shadow-2xl overflow-hidden sheet-spring-enter max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-3 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold text-sm">
              🔔
            </div>
            <div>
              <h3 className="font-extrabold text-base text-fg">Режим звонков РГАУ-МСХА</h3>
              <p className="text-xs text-muted-fg">Официальное расписание учебных пар</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-muted hover:bg-border text-muted-fg hover:text-fg flex items-center justify-center transition-colors text-sm"
          >
            ✕
          </button>
        </div>

        {/* Current status bar */}
        <div className="px-5 py-3 bg-muted/60 border-b border-border">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-primary flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
              {currentStatus.text}
            </span>
            <span className="text-xs text-muted-fg font-mono">
              {String(Math.floor(nowMin / 60)).padStart(2, "0")}:{String(nowMin % 60).padStart(2, "0")}
            </span>
          </div>
          <p className="text-xs text-muted-fg mt-0.5">{currentStatus.detail}</p>
          {currentStatus.progressPct !== undefined && (
            <div className="w-full h-1.5 bg-border rounded-full overflow-hidden mt-2">
              <div
                className="h-full bg-accent rounded-full transition-all duration-500"
                style={{ width: `${currentStatus.progressPct}%` }}
              />
            </div>
          )}
        </div>

        {/* Bells list */}
        <div className="px-5 py-3 overflow-y-auto space-y-2 flex-1">
          {BELLS.map((b) => {
            const isCur = currentStatus.currentNum === b.num
            return (
              <div
                key={b.num}
                className={`p-3 rounded-2xl border transition-all ${
                  isCur
                    ? "border-accent bg-accent/10 shadow-sm"
                    : "border-border bg-card hover:border-accent/40"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span
                      className={`w-7 h-7 rounded-lg flex items-center justify-center font-mono font-bold text-xs ${
                        isCur ? "bg-accent text-white" : "bg-muted text-fg"
                      }`}
                    >
                      {b.num}
                    </span>
                    <span className="text-sm font-bold font-mono text-fg">{b.time}</span>
                  </div>
                  {isCur && (
                    <span className="text-[11px] font-bold text-accent bg-card px-2 py-0.5 rounded-full shadow-xs">
                      Текущая
                    </span>
                  )}
                </div>
                <div className="mt-1.5 pl-10 flex items-center justify-between text-xs text-muted-fg">
                  <span>{b.breakAfter}</span>
                  {b.num === 2 && onEat && (
                    <button
                      onClick={() => {
                        onClose()
                        onEat()
                      }}
                      className="text-primary hover:text-accent font-bold hover:underline"
                    >
                      Где поесть →
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Footer info */}
        <div className="p-4 bg-muted/40 border-t border-border flex items-center justify-between text-xs text-muted-fg">
          <span>Сверка с сайтом: timacad.ru</span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-primary text-white rounded-xl font-bold hover:bg-primary-light transition-colors text-xs"
          >
            Понятно
          </button>
        </div>
      </div>
    </div>
  )
}
