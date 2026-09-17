import React, { useState, useEffect } from "react"
import { I } from "@/shared/ui/Icons"

export interface ModularDashboardProps {
  onOpenRadar: () => void
  onOpenMatchmaking: () => void
  onOpenBells: () => void
  onOpenNavigation: () => void
  onOpenWallet?: () => void
  onOpenIcal?: () => void
  role: "student" | "headstudent" | "deputy_headstudent" | "teacher"
  completedLabs?: number
  totalLabs?: number
  attendedClasses?: number
  totalClasses?: number
  onToast?: (msg: string, type?: "info" | "success" | "warn") => void
}

interface WidgetVisibility {
  progress: boolean
  quickServices: boolean
  deadlines: boolean
}

export function ModularDashboard({
  onOpenRadar,
  onOpenMatchmaking,
  onOpenBells,
  onOpenNavigation,
  onOpenWallet,
  onOpenIcal,
  role,
  completedLabs = 6,
  totalLabs = 8,
  attendedClasses = 24,
  totalClasses = 26,
  onToast,
}: ModularDashboardProps) {
  const [widgets, setWidgets] = useState<WidgetVisibility>(() => {
    try {
      const saved = localStorage.getItem("rgau_dashboard_widgets")
      if (saved) return JSON.parse(saved)
    } catch {}
    return { progress: true, quickServices: true, deadlines: true }
  })
  const [customizeOpen, setCustomizeOpen] = useState(false)
  const [labsCount, setLabsCount] = useState(completedLabs)
  const [attendedCount, setAttendedCount] = useState(attendedClasses)

  // Save widgets configuration
  useEffect(() => {
    try {
      localStorage.setItem("rgau_dashboard_widgets", JSON.stringify(widgets))
    } catch {}
  }, [widgets])

  const toggleWidget = (key: keyof WidgetVisibility) => {
    setWidgets((prev) => ({ ...prev, [key]: !prev[key] }))
    try {
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        navigator.vibrate(8)
      }
    } catch {}
  }

  const labPct = Math.min(100, Math.round((labsCount / Math.max(1, totalLabs)) * 100))
  const attendancePct = Math.min(100, Math.round((attendedCount / Math.max(1, totalClasses)) * 100))

  return (
    <div className="space-y-3 px-4 mb-3">
      {/* Dashboard Header with Customize Toggle */}
      <div className="flex items-center justify-between pt-1">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
          <h3 className="text-xs font-bold text-fg uppercase tracking-wider">
            Дашборд SuperApp
          </h3>
        </div>
        <button
          onClick={() => setCustomizeOpen((o) => !o)}
          className="text-[11px] font-semibold text-muted-fg hover:text-primary transition-colors flex items-center gap-1 cursor-pointer"
        >
          <span>{customizeOpen ? "Готово" : "Настроить виджеты"}</span>
          <span className="text-xs">{customizeOpen ? "✓" : "⚙️"}</span>
        </button>
      </div>

      {/* Widget Customization Drawer */}
      {customizeOpen && (
        <div className="p-3 bg-muted/60 border border-border/80 rounded-2xl space-y-2 animate-fade-in text-xs">
          <p className="font-bold text-fg">Отображение виджетов на главном экране:</p>
          <div className="flex flex-wrap gap-2 pt-1">
            <button
              onClick={() => toggleWidget("progress")}
              className={`px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                widgets.progress
                  ? "bg-primary text-white border-primary shadow-xs"
                  : "bg-card border-border text-muted-fg hover:text-fg"
              }`}
            >
              {widgets.progress ? "✓ " : "+ "}Успеваемость и лабы
            </button>
            <button
              onClick={() => toggleWidget("quickServices")}
              className={`px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                widgets.quickServices
                  ? "bg-primary text-white border-primary shadow-xs"
                  : "bg-card border-border text-muted-fg hover:text-fg"
              }`}
            >
              {widgets.quickServices ? "✓ " : "+ "}Быстрые сервисы
            </button>
            <button
              onClick={() => toggleWidget("deadlines")}
              className={`px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                widgets.deadlines
                  ? "bg-primary text-white border-primary shadow-xs"
                  : "bg-card border-border text-muted-fg hover:text-fg"
              }`}
            >
              {widgets.deadlines ? "✓ " : "+ "}Статус звонков
            </button>
          </div>
        </div>
      )}

      {/* 1. Progress Bars Widget: Attendance & Lab Deliveries */}
      {widgets.progress && (
        <div className="p-3.5 bg-card border border-border rounded-2xl shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm">📊</span>
              <h4 className="text-xs font-bold text-fg">Учебный прогресс семестра</h4>
            </div>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              В графике
            </span>
          </div>

          {/* Attendance progress bar */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-fg font-medium">Посещаемость пар</span>
              <span className="font-mono font-bold text-fg">
                {attendancePct}% ({attendedCount}/{totalClasses})
              </span>
            </div>
            <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-700 ease-out animate-progress-fill"
                style={{ width: `${attendancePct}%` }}
              />
            </div>
          </div>

          {/* Labs delivery progress bar */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-fg font-medium">Сдача лабораторных</span>
              <span className="font-mono font-bold text-fg">
                {labPct}% ({labsCount}/{totalLabs})
              </span>
            </div>
            <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-sky-500 rounded-full transition-all duration-700 ease-out animate-progress-fill"
                style={{ width: `${labPct}%` }}
              />
            </div>
          </div>

          {/* Quick interactive action for labs */}
          <div className="flex items-center justify-between pt-1 border-t border-border/50 text-[11px]">
            <span className="text-muted-fg">Ближайшая лаба: Физиология (пн)</span>
            <button
              onClick={() => {
                const next = labsCount >= totalLabs ? totalLabs - 2 : labsCount + 1
                setLabsCount(next)
                if (onToast) onToast(`Лабораторная работа отмечена: ${next}/${totalLabs}`, "success")
                try {
                  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
                    navigator.vibrate(10)
                  }
                } catch {}
              }}
              className="text-primary font-bold hover:underline cursor-pointer"
            >
              + Сдать лабу
            </button>
          </div>
        </div>
      )}

      {/* 2. Quick Services SuperApp Grid */}
      {widgets.quickServices && (
        <div className="grid grid-cols-4 gap-2">
          <button
            onClick={onOpenBells}
            className="flex flex-col items-center justify-center p-2.5 rounded-2xl bg-card border border-border hover:border-primary/40 hover:bg-muted/30 transition-all text-center group cursor-pointer active:scale-95 shadow-2xs"
          >
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center text-sm mb-1 group-hover:scale-110 transition-transform">
              🔔
            </div>
            <span className="text-[10px] font-bold text-fg leading-tight">Звонки</span>
          </button>

          <button
            onClick={onOpenRadar}
            className="flex flex-col items-center justify-center p-2.5 rounded-2xl bg-card border border-border hover:border-primary/40 hover:bg-muted/30 transition-all text-center group cursor-pointer active:scale-95 shadow-2xs"
          >
            <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center text-sm mb-1 group-hover:scale-110 transition-transform">
              📡
            </div>
            <span className="text-[10px] font-bold text-fg leading-tight">Радар</span>
          </button>

          <button
            onClick={onOpenMatchmaking}
            className="flex flex-col items-center justify-center p-2.5 rounded-2xl bg-card border border-border hover:border-primary/40 hover:bg-muted/30 transition-all text-center group cursor-pointer active:scale-95 shadow-2xs"
          >
            <div className="w-8 h-8 rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400 flex items-center justify-center text-sm mb-1 group-hover:scale-110 transition-transform">
              🤝
            </div>
            <span className="text-[10px] font-bold text-fg leading-tight">Окна</span>
          </button>

          <button
            onClick={onOpenNavigation}
            className="flex flex-col items-center justify-center p-2.5 rounded-2xl bg-card border border-border hover:border-primary/40 hover:bg-muted/30 transition-all text-center group cursor-pointer active:scale-95 shadow-2xs"
          >
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-sm mb-1 group-hover:scale-110 transition-transform">
              🗺
            </div>
            <span className="text-[10px] font-bold text-fg leading-tight">Кампус</span>
          </button>
        </div>
      )}

      {/* 3. Bell Schedule & Deadlines Status Widget */}
      {widgets.deadlines && (
        <div className="p-3 bg-card border border-border rounded-2xl shadow-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center text-sm flex-shrink-0">
              🔔
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-fg leading-tight truncate">
                График пар РГАУ-МСХА
              </p>
              <p className="text-[11px] text-muted-fg font-medium mt-0.5 truncate">
                1 пара: 09:00 – 10:35 · Обед 40 мин
              </p>
            </div>
          </div>
          <button
            onClick={onOpenBells}
            className="px-2.5 py-1.5 rounded-xl bg-muted hover:bg-border text-xs font-bold text-fg transition-colors flex-shrink-0 cursor-pointer active:scale-95"
          >
            Сетка пар
          </button>
        </div>
      )}
    </div>
  )
}

export default ModularDashboard
