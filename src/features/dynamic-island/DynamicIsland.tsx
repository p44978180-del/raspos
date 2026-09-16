import { useState, useEffect, useMemo, useRef } from "react"

interface DynamicClassItem {
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

interface DynamicIslandProps {
  currentClass: DynamicClassItem | null
  nextClass: DynamicClassItem | null
  minutesUntilNext: number | null
  minutesLeftCurrent: number | null
  onOpenNavigation?: (building: string) => void
  onOpenClassDetail?: (cls: DynamicClassItem) => void
}

const TYPE_EMOJIS: Record<string, string> = {
  lecture: "📖",
  practice: "⚗️",
  lab: "🔬",
  elective: "🌟",
}

const TYPE_TITLES: Record<string, string> = {
  lecture: "Лекция",
  practice: "Практика",
  lab: "Лаб. работа",
  elective: "Факультатив",
}

export default function DynamicIsland({
  currentClass,
  nextClass,
  minutesUntilNext,
  minutesLeftCurrent,
  onOpenNavigation,
  onOpenClassDetail,
}: DynamicIslandProps) {
  const [expanded, setExpanded] = useState(false)
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [lockScreenSimOpen, setLockScreenSimOpen] = useState(false)
  const expandTimerRef = useRef<any>(null)

  // Trigger haptic vibration on expand
  const triggerHaptic = (durationMs = 15) => {
    try {
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        navigator.vibrate(durationMs)
      }
    } catch {}
  }

  const active = currentClass || (nextClass && minutesUntilNext !== null && minutesUntilNext <= 45)

  if (!active) {
    return null
  }

  const isCurrent = Boolean(currentClass)
  const displayClass = currentClass || nextClass!
  const emoji = TYPE_EMOJIS[displayClass.type] || "📚"
  const typeTitle = TYPE_TITLES[displayClass.type] || "Занятие"

  const handleToggleExpand = () => {
    triggerHaptic(expanded ? 10 : 25)
    setExpanded((prev) => !prev)
  }

  return (
    <>
      {/* ── Floating Dynamic Island (iOS & Android) ───────────────────────── */}
      <aside 
        aria-label="Dynamic Island - Текущая или следующая пара"
        className="fixed top-2.5 left-0 right-0 z-50 flex justify-center px-3 pointer-events-none"
      >
        <div
          onClick={handleToggleExpand}
          className={`pointer-events-auto cursor-pointer select-none transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] overflow-hidden shadow-2xl ${
            expanded
              ? "w-[94vw] max-w-md rounded-3xl bg-[#090D0B] text-white border border-emerald-500/30 p-4 ring-2 ring-emerald-500/20"
              : "rounded-full bg-[#090D0B] text-white border border-white/10 px-3.5 py-1.5 hover:border-emerald-500/40 hover:scale-[1.02] active:scale-[0.97]"
          }`}
          style={{
            backdropFilter: "blur(24px)",
            WebkitBackdropFilter: "blur(24px)",
          }}
        >
          {!expanded ? (
            /* ── Compact Pill View (0 ms footprint) ── */
            <div className="flex items-center gap-2.5 text-xs font-semibold">
              {/* Left Indicator */}
              <div className="flex items-center gap-1.5">
                <span className="text-sm leading-none">{emoji}</span>
                {isCurrent ? (
                  <span className="flex h-2 w-2 relative">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                ) : (
                  <span className="text-[10px] font-mono text-emerald-400 font-extrabold uppercase">
                    {minutesUntilNext}м
                  </span>
                )}
              </div>

              {/* Center Micro Summary */}
              <div className="flex items-center gap-1.5 truncate max-w-[200px] sm:max-w-[260px]">
                <span className="truncate font-bold text-gray-200">
                  {displayClass.subject}
                </span>
                <span className="text-white/40">•</span>
                <span className="font-mono text-emerald-300 font-bold text-[11px] flex-shrink-0">
                  ауд. {displayClass.room || "—"}
                </span>
              </div>

              {/* Right Indicator / Bell Countdown */}
              <div className="flex items-center gap-1 ml-auto text-[10px] font-mono font-bold text-white/70">
                {isCurrent ? (
                  <span className="text-emerald-400 font-mono">ещё {minutesLeftCurrent}м</span>
                ) : (
                  <span className="text-amber-300 font-mono">{displayClass.start}</span>
                )}
              </div>
            </div>
          ) : (
            /* ── Expanded Dynamic Island View ── */
            <div className="space-y-3 animate-fade-in">
              {/* Header inside pill */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-sm border border-emerald-500/30">
                    {emoji}
                  </div>
                  <div>
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-400">
                      {isCurrent ? "Пара идёт прямо сейчас" : `Следующая пара через ${minutesUntilNext} мин`}
                    </span>
                    <h3 className="text-sm font-extrabold text-white leading-tight truncate max-w-[260px]">
                      {displayClass.subject}
                    </h3>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setSoundEnabled((v) => !v)
                    }}
                    title={soundEnabled ? "Звуковые напоминания включены" : "Без звука"}
                    className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white/80 transition-colors"
                  >
                    {soundEnabled ? (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>
                    )}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setExpanded(false)
                    }}
                    className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white/80 transition-colors"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </div>
              </div>

              {/* Details Grid */}
              <div className="grid grid-cols-2 gap-2 bg-white/5 rounded-2xl p-2.5 border border-white/5 text-xs">
                <div>
                  <span className="text-[10px] text-white/50 block font-semibold">Аудитория & Корпус</span>
                  <span className="font-mono font-bold text-emerald-300">
                    ауд. {displayClass.room || "—"}
                  </span>
                  <span className="text-white/70 block truncate text-[11px]">
                    {displayClass.building || "Главный корпус"}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-white/50 block font-semibold">Время звонков</span>
                  <span className="font-mono font-bold text-white">
                    {displayClass.start} — {displayClass.end}
                  </span>
                  <span className="text-white/70 block truncate text-[11px]">
                    {displayClass.teacher || "Преподаватель"}
                  </span>
                </div>
              </div>

              {/* Live Timeline Bar */}
              {isCurrent && minutesLeftCurrent !== null && (
                <div className="space-y-1">
                  <div className="flex justify-between text-[10px] text-white/60 font-mono">
                    <span>{displayClass.start}</span>
                    <span className="text-emerald-400 font-bold">Осталось {minutesLeftCurrent} мин</span>
                    <span>{displayClass.end}</span>
                  </div>
                  <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-emerald-500 to-green-400 rounded-full transition-all duration-1000"
                      style={{
                        width: `${Math.min(100, Math.max(5, (1 - minutesLeftCurrent / 95) * 100))}%`,
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Quick Actions Footer */}
              <div className="flex items-center gap-2 pt-1">
                {onOpenNavigation && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onOpenNavigation(displayClass.building)
                      setExpanded(false)
                    }}
                    className="flex-1 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all active:scale-[0.98]"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>
                    <span>Маршрут в корпус</span>
                  </button>
                )}

                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setLockScreenSimOpen(true)
                  }}
                  className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white font-semibold text-xs flex items-center gap-1.5 transition-colors"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                  <span>Экран блокировки</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* ── Lock Screen Live Activity Modal Simulation ────────────────────── */}
      {lockScreenSimOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
          <div className="w-full max-w-sm rounded-[36px] bg-gradient-to-b from-gray-900 to-black p-6 text-white border border-white/20 shadow-2xl space-y-5">
            <div className="flex items-center justify-between text-xs text-white/60">
              <span className="font-mono">15 минут до пары</span>
              <span className="font-mono">РГАУ Расписание</span>
            </div>

            <div className="rounded-2xl bg-white/10 p-4 border border-white/10 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">
                  Live Activity • РГАУ-МСХА
                </span>
                <span className="text-xs font-mono text-white/70">
                  {displayClass.start} звонок
                </span>
              </div>
              <h4 className="text-base font-extrabold text-white leading-snug">
                {displayClass.subject} ({typeTitle})
              </h4>
              <p className="text-xs text-white/80 font-mono">
                📍 ауд. {displayClass.room || "—"} • {displayClass.building}
              </p>
              <div className="pt-2 flex items-center justify-between border-t border-white/10 text-xs">
                <span className="text-white/60 font-semibold">{displayClass.teacher}</span>
                <span className="text-emerald-400 font-extrabold font-mono">
                  {isCurrent ? `Осталось ${minutesLeftCurrent}м` : `Через ${minutesUntilNext}м`}
                </span>
              </div>
            </div>

            <p className="text-[11px] text-white/50 text-center leading-relaxed">
              На iOS и Android виджет Live Activity отображается на Always-On Display без необходимости разблокировать экран.
            </p>

            <button
              onClick={() => setLockScreenSimOpen(false)}
              className="w-full py-3 rounded-2xl bg-white/20 hover:bg-white/30 text-white font-bold text-xs transition-colors"
            >
              Закрыть предпросмотр
            </button>
          </div>
        </div>
      )}
    </>
  )
}
