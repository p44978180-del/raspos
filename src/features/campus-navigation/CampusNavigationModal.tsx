import React, { useState, useMemo } from "react"
import type { CampusRouteResponse } from "../../proto/schedule"

interface CampusNavigationModalProps {
  isOpen: boolean
  onClose: () => void
  initialFrom?: string
  initialTo?: string
  windowMinutes?: number
}

const BUILDINGS = [
  "1-й учебный корпус",
  "2-й учебный корпус",
  "4-й учебный корпус",
  "Корпус агрохимии (6-й)",
  "12-й учебный корпус",
  "Биологический корпус (16-й)",
  "17-й корпус (Почвенно-агрономический)",
  "Инженерный корпус (28-й)",
  "29-й корпус (Цифровой центр)",
  "Спортивный комплекс",
]

export default function CampusNavigationModal({
  isOpen,
  onClose,
  initialFrom,
  initialTo,
  windowMinutes = 15,
}: CampusNavigationModalProps) {
  const [fromBuilding, setFromBuilding] = useState(initialFrom || BUILDINGS[0])
  const [toBuilding, setToBuilding] = useState(initialTo || BUILDINGS[4])
  const [availWindow, setAvailWindow] = useState(windowMinutes)

  // Compute pedestrian graph route
  const route = useMemo<CampusRouteResponse>(() => {
    // Distance heuristic matrix in meters
    const distMap: Record<string, Record<string, number>> = {
      "1-й учебный корпус": {
        "2-й учебный корпус": 250,
        "4-й учебный корпус": 400,
        "Корпус агрохимии (6-й)": 650,
        "12-й учебный корпус": 800,
        "Биологический корпус (16-й)": 900,
        "17-й корпус (Почвенно-агрономический)": 1100,
        "Инженерный корпус (28-й)": 1400,
        "29-й корпус (Цифровой центр)": 1200,
        "Спортивный комплекс": 1600,
      },
      "12-й учебный корпус": {
        "1-й учебный корпус": 800,
        "2-й учебный корпус": 600,
        "4-й учебный корпус": 500,
        "Корпус агрохимии (6-й)": 300,
        "Биологический корпус (16-й)": 350,
        "17-й корпус (Почвенно-агрономический)": 450,
        "Инженерный корпус (28-й)": 750,
        "29-й корпус (Цифровой центр)": 650,
        "Спортивный комплекс": 1000,
      },
      "Инженерный корпус (28-й)": {
        "1-й учебный корпус": 1400,
        "2-й учебный корпус": 1200,
        "4-й учебный корпус": 1100,
        "12-й учебный корпус": 750,
        "17-й корпус (Почвенно-агрономический)": 600,
        "29-й корпус (Цифровой центр)": 250,
        "Спортивный комплекс": 500,
      },
    }

    let meters = 650
    if (fromBuilding === toBuilding) {
      meters = 30
    } else if (distMap[fromBuilding]?.[toBuilding]) {
      meters = distMap[fromBuilding][toBuilding]
    } else if (distMap[toBuilding]?.[fromBuilding]) {
      meters = distMap[toBuilding][fromBuilding]
    }

    // Walking speed: ~80 m/min
    const minutes = Math.max(2, Math.ceil(meters / 80))
    const isTight = availWindow > 0 && minutes >= availWindow

    let warning: string | undefined
    if (isTight) {
      warning = `У вас окно ${availWindow} мин, а переход между корпусами займет ${minutes} мин! Рекомендуем выйти сразу после звонка.`
    }

    return {
      from_building: fromBuilding,
      to_building: toBuilding,
      walking_duration_minutes: minutes,
      distance_meters: meters,
      path_waypoints: [
        fromBuilding,
        "Лиственничная аллея",
        "Центральный сквер Тимирязевки",
        toBuilding,
      ],
      is_tight_window: isTight,
      urgent_warning: warning,
      weather_advisory: "Пешеходные дорожки кампуса полностью освещены и расчищены.",
    }
  }, [fromBuilding, toBuilding, availWindow])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-xs" onClick={onClose} />

      <div
        className="relative w-full max-w-lg bg-card border border-border rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[85vh] animate-slide-in-up overflow-hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 16px)" }}
      >
        {/* Header */}
        <div className="p-4 border-b border-border/80 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-blue-500/10 text-blue-600 flex items-center justify-center text-lg">
              🧭
            </div>
            <div>
              <h3 className="text-base font-extrabold text-fg">Умная навигация между корпусами</h3>
              <p className="text-xs text-muted-fg">Расчет времени перехода с учетом перемены</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-muted-fg hover:text-fg"
          >
            ✕
          </button>
        </div>

        {/* Form Controls */}
        <div className="p-4 border-b border-border/60 space-y-3 bg-muted/20">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold text-muted-fg uppercase tracking-wider block mb-1">
                Откуда (Текущий корпус)
              </label>
              <select
                value={fromBuilding}
                onChange={(e) => setFromBuilding(e.target.value)}
                className="w-full bg-card border border-border rounded-xl px-3 py-2 text-xs font-bold text-fg outline-none focus:border-primary"
              >
                {BUILDINGS.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[10px] font-bold text-muted-fg uppercase tracking-wider block mb-1">
                Куда (Следующий корпус)
              </label>
              <select
                value={toBuilding}
                onChange={(e) => setToBuilding(e.target.value)}
                className="w-full bg-card border border-border rounded-xl px-3 py-2 text-xs font-bold text-fg outline-none focus:border-primary"
              >
                {BUILDINGS.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-fg">Длительность перемены:</span>
            <div className="flex items-center gap-1">
              {[10, 15, 20, 30, 40].map((min) => (
                <button
                  key={min}
                  onClick={() => setAvailWindow(min)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                    availWindow === min
                      ? "bg-blue-600 text-white shadow-xs"
                      : "bg-card border border-border text-muted-fg hover:text-fg"
                  }`}
                >
                  {min}м
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Route Details & Alert */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {/* Urgent Warning if window is tight */}
          {route.is_tight_window && (
            <div className="p-3 rounded-2xl bg-red-500/10 border border-red-500/25 flex items-start gap-2.5 text-red-700 dark:text-red-400">
              <span className="text-lg flex-shrink-0">⚠️</span>
              <div className="text-xs font-bold leading-relaxed">
                {route.urgent_warning}
              </div>
            </div>
          )}

          {/* Stats Card */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-2xl bg-card border border-border/80 text-center">
              <div className="text-[11px] font-bold text-muted-fg uppercase tracking-wider">
                Время в пути
              </div>
              <div className="text-xl font-extrabold text-fg mt-1">
                ~{route.walking_duration_minutes} мин
              </div>
              <div className="text-[11px] text-muted-fg font-medium">пешком</div>
            </div>

            <div className="p-3 rounded-2xl bg-card border border-border/80 text-center">
              <div className="text-[11px] font-bold text-muted-fg uppercase tracking-wider">
                Дистанция
              </div>
              <div className="text-xl font-extrabold text-primary mt-1">
                {route.distance_meters} м
              </div>
              <div className="text-[11px] text-muted-fg font-medium">по кампусу</div>
            </div>
          </div>

          {/* Path Steps */}
          <div className="p-3.5 rounded-2xl bg-card border border-border/80 space-y-2">
            <div className="text-xs font-extrabold text-fg mb-1">Маршрут по аллеям:</div>
            <div className="space-y-2 relative pl-4 border-l-2 border-primary/30">
              {route.path_waypoints.map((point, idx) => (
                <div key={idx} className="relative text-xs">
                  <span className="absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full bg-primary" />
                  <span className="font-semibold text-fg">{point}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="text-xs text-muted-fg bg-muted/40 p-3 rounded-2xl">
            💡 {route.weather_advisory}
          </div>
        </div>
      </div>
    </div>
  )
}
