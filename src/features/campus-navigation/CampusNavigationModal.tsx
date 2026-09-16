import React, { useState, useMemo } from "react"
import type { CampusRouteResponse } from "../../proto/schedule"

interface CampusNavigationModalProps {
  isOpen: boolean
  onClose: () => void
  initialFrom?: string
  initialTo?: string
  windowMinutes?: number
}

export const CAMPUS_BUILDINGS = [
  "1-й учебный корпус",
  "2-й учебный корпус",
  "3-й учебный корпус",
  "4-й учебный корпус",
  "Корпус агрохимии (6-й)",
  "8-й учебный корпус",
  "9-й учебный корпус",
  "12-й учебный корпус",
  "Биологический корпус (16-й)",
  "17-й корпус (Почвенно-агрономический)",
  "18-й корпус (Метеорологический)",
  "26-й учебный корпус",
  "27-й корпус (Лингвистический центр)",
  "Инженерный корпус (28-й)",
  "29-й корпус (Цифровой центр)",
  "37-й корпус (Биотехнология)",
  "Спортивный комплекс",
  "Центральная научная библиотека (ЦНБ)",
]

// Detailed campus transit timing (minutes) taking into account pedestrian distance & traffic/crossing bottlenecks
const TRANSIT_MATRIX: Record<string, Record<string, { minutes: number; meters: number; trafficDelayMin: number; waypoints: string[] }>> = {
  "1-й учебный корпус": {
    "Спортивный комплекс": {
      minutes: 35,
      meters: 2100,
      trafficDelayMin: 7,
      waypoints: [
        "1-й учебный корпус (Лиственничная аллея, 4)",
        "Лиственничная аллея (пешеходная зона)",
        "Светофор и перекресток ул. Тимирязевская (ожидание перехода трамвайных путей)",
        "Парковая дорожка Верхнего Фермского пруда",
        "Спортивный комплекс РГАУ-МСХА (ул. Прянишникова)",
      ],
    },
    "2-й учебный корпус": {
      minutes: 4,
      meters: 250,
      trafficDelayMin: 0,
      waypoints: ["1-й учебный корпус", "Лиственничная аллея", "2-й учебный корпус"],
    },
    "4-й учебный корпус": {
      minutes: 6,
      meters: 400,
      trafficDelayMin: 1,
      waypoints: ["1-й учебный корпус", "Лиственничная аллея", "4-й учебный корпус"],
    },
    "12-й учебный корпус": {
      minutes: 10,
      meters: 800,
      trafficDelayMin: 1,
      waypoints: ["1-й учебный корпус", "Лиственничная аллея", "12-й учебный корпус"],
    },
    "26-й учебный корпус": {
      minutes: 12,
      meters: 950,
      trafficDelayMin: 2,
      waypoints: ["1-й учебный корпус", "Лиственничная аллея", "Перекресток ул. Тимирязевская", "26-й учебный корпус"],
    },
    "Инженерный корпус (28-й)": {
      minutes: 16,
      meters: 1300,
      trafficDelayMin: 3,
      waypoints: ["1-й учебный корпус", "Лиственничная аллея", "Тимирязевская ул.", "Инженерный корпус (28-й)"],
    },
    "29-й корпус (Цифровой центр)": {
      minutes: 16,
      meters: 1250,
      trafficDelayMin: 3,
      waypoints: ["1-й учебный корпус", "Лиственничная аллея", "Тимирязевская ул.", "29-й корпус (Цифровой центр)"],
    },
    "Биологический корпус (16-й)": {
      minutes: 11,
      meters: 900,
      trafficDelayMin: 2,
      waypoints: ["1-й учебный корпус", "Тимирязевская ул.", "Биологический корпус (16-й)"],
    },
    "17-й корпус (Почвенно-агрономический)": {
      minutes: 14,
      meters: 1100,
      trafficDelayMin: 2,
      waypoints: ["1-й учебный корпус", "Тимирязевская ул.", "17-й корпус (Почвенно-агрономический)"],
    },
    "Корпус агрохимии (6-й)": {
      minutes: 9,
      meters: 650,
      trafficDelayMin: 1,
      waypoints: ["1-й учебный корпус", "Лиственничная аллея", "Корпус агрохимии (6-й)"],
    },
    "Центральная научная библиотека (ЦНБ)": {
      minutes: 7,
      meters: 500,
      trafficDelayMin: 0,
      waypoints: ["1-й учебный корпус", "Лиственничная аллея", "ЦНБ им. Железнова"],
    },
  },
  "26-й учебный корпус": {
    "Инженерный корпус (28-й)": {
      minutes: 3,
      meters: 200,
      trafficDelayMin: 0,
      waypoints: ["26-й учебный корпус", "Внутренний двор кампуса", "Инженерный корпус (28-й)"],
    },
    "29-й корпус (Цифровой центр)": {
      minutes: 5,
      meters: 350,
      trafficDelayMin: 0,
      waypoints: ["26-й учебный корпус", "Аллея к цифровому центру", "29-й корпус"],
    },
    "Спортивный комплекс": {
      minutes: 20,
      meters: 1400,
      trafficDelayMin: 4,
      waypoints: ["26-й учебный корпус", "Тимирязевская ул.", "Прянишникова ул.", "Спортивный комплекс"],
    },
  },
  "Инженерный корпус (28-й)": {
    "29-й корпус (Цифровой центр)": {
      minutes: 4,
      meters: 250,
      trafficDelayMin: 0,
      waypoints: ["Инженерный корпус (28-й)", "Пешеходная дорожка", "29-й корпус (Цифровой центр)"],
    },
    "Спортивный комплекс": {
      minutes: 18,
      meters: 1200,
      trafficDelayMin: 3,
      waypoints: ["Инженерный корпус (28-й)", "Тимирязевская ул.", "Прянишникова ул.", "Спортивный комплекс"],
    },
  },
  "12-й учебный корпус": {
    "Корпус агрохимии (6-й)": {
      minutes: 5,
      meters: 350,
      trafficDelayMin: 0,
      waypoints: ["12-й учебный корпус", "Лиственничная аллея", "Корпус агрохимии (6-й)"],
    },
    "Биологический корпус (16-й)": {
      minutes: 6,
      meters: 400,
      trafficDelayMin: 1,
      waypoints: ["12-й учебный корпус", "Тимирязевская ул.", "Биологический корпус (16-й)"],
    },
    "17-й корпус (Почвенно-агрономический)": {
      minutes: 7,
      meters: 500,
      trafficDelayMin: 1,
      waypoints: ["12-й учебный корпус", "Тимирязевская ул.", "17-й корпус"],
    },
    "Спортивный комплекс": {
      minutes: 22,
      meters: 1500,
      trafficDelayMin: 5,
      waypoints: ["12-й учебный корпус", "Лиственничная аллея", "Прянишникова ул.", "Спортивный комплекс"],
    },
  },
}

export default function CampusNavigationModal({
  isOpen,
  onClose,
  initialFrom,
  initialTo,
  windowMinutes = 40,
}: CampusNavigationModalProps) {
  const [fromBuilding, setFromBuilding] = useState(initialFrom || CAMPUS_BUILDINGS[0])
  const [toBuilding, setToBuilding] = useState(initialTo || CAMPUS_BUILDINGS[16]) // default to СК
  const [availWindow, setAvailWindow] = useState(windowMinutes)

  // Compute pedestrian graph route with traffic & crossings
  const route = useMemo<CampusRouteResponse>(() => {
    if (fromBuilding === toBuilding) {
      return {
        from_building: fromBuilding,
        to_building: toBuilding,
        walking_duration_minutes: 1,
        distance_meters: 50,
        path_waypoints: [fromBuilding, "Переход по этажам / переходу внутри корпуса", toBuilding],
        is_tight_window: false,
        urgent_warning: undefined,
        weather_advisory: "Перемещение внутри одного корпуса. Верхняя одежда не требуется.",
      }
    }

    // Direct or reverse lookup in transit matrix
    const direct = TRANSIT_MATRIX[fromBuilding]?.[toBuilding]
    const reverse = TRANSIT_MATRIX[toBuilding]?.[fromBuilding]
    const matched = direct || reverse

    let minutes = 12
    let meters = 800
    let trafficDelay = 2
    let waypoints = [
      fromBuilding,
      "Лиственничная аллея",
      "Центральный сквер Тимирязевки",
      toBuilding,
    ]

    if (matched) {
      minutes = matched.minutes
      meters = matched.meters
      trafficDelay = matched.trafficDelayMin
      waypoints = direct ? matched.waypoints : [...matched.waypoints].reverse()
    } else {
      // Heuristic fallback for arbitrary pair
      minutes = 14
      meters = 950
    }

    // Calculate buffer and tight window check
    // "У вас окно 40 минут, переход между корпусом 1 и СК займет 35 минут"
    const buffer = availWindow - minutes
    const isTight = availWindow > 0 && buffer <= 5

    let warning: string | undefined
    if (buffer < 0) {
      warning = `⚠️ Критический риск опоздания! У вас перерыв ${availWindow} мин, а переход между ${fromBuilding} и ${toBuilding} займет ${minutes} мин (не хватает ${Math.abs(buffer)} мин)!`
    } else if (isTight) {
      warning = `У вас окно ${availWindow} минут, переход между ${fromBuilding} и ${toBuilding} займет ${minutes} минут. В запасе всего ${buffer} минут — рекомендуем выходить сразу после звонка!`
    }

    return {
      from_building: fromBuilding,
      to_building: toBuilding,
      walking_duration_minutes: minutes,
      distance_meters: meters,
      path_waypoints: waypoints,
      is_tight_window: isTight || buffer < 0,
      urgent_warning: warning,
      weather_advisory: trafficDelay > 0
        ? `Маршрут включает ${trafficDelay} мин задержки на светофорах и переходе ул. Тимирязевская. Зимой учитывайте гололед на аллеях.`
        : "Пешеходные дорожки кампуса полностью освещены и расчищены.",
    }
  }, [fromBuilding, toBuilding, availWindow])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-xs animate-fade-in" onClick={onClose} />

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
              <p className="text-xs text-muted-fg">Граф переходов Тимирязевки с учетом светофоров и пробок</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-muted-fg hover:text-fg active:scale-95 transition-all"
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
                {CAMPUS_BUILDINGS.map((b) => (
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
                {CAMPUS_BUILDINGS.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-xs font-semibold text-muted-fg">Длительность перерыва (окна):</span>
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
            <div className="p-3.5 rounded-2xl bg-red-500/10 border border-red-500/30 flex items-start gap-2.5 text-red-700 dark:text-red-400 animate-pulse">
              <span className="text-lg flex-shrink-0">⚠️</span>
              <div className="text-xs font-bold leading-relaxed">
                {route.urgent_warning}
              </div>
            </div>
          )}

          {/* Stats Card */}
          <div className="grid grid-cols-3 gap-2.5">
            <div className="p-3 rounded-2xl bg-card border border-border/80 text-center">
              <div className="text-[10px] font-bold text-muted-fg uppercase tracking-wider">
                Время в пути
              </div>
              <div className="text-lg font-extrabold text-fg mt-1">
                ~{route.walking_duration_minutes} мин
              </div>
              <div className="text-[10px] text-muted-fg font-medium">пешком</div>
            </div>

            <div className="p-3 rounded-2xl bg-card border border-border/80 text-center">
              <div className="text-[10px] font-bold text-muted-fg uppercase tracking-wider">
                Дистанция
              </div>
              <div className="text-lg font-extrabold text-primary mt-1">
                {route.distance_meters} м
              </div>
              <div className="text-[10px] text-muted-fg font-medium">по кампусу</div>
            </div>

            <div className="p-3 rounded-2xl bg-card border border-border/80 text-center">
              <div className="text-[10px] font-bold text-muted-fg uppercase tracking-wider">
                Запас времени
              </div>
              <div
                className={`text-lg font-extrabold mt-1 ${
                  availWindow - route.walking_duration_minutes < 0
                    ? "text-red-500"
                    : availWindow - route.walking_duration_minutes <= 5
                    ? "text-amber-500"
                    : "text-emerald-500"
                }`}
              >
                {availWindow - route.walking_duration_minutes} мин
              </div>
              <div className="text-[10px] text-muted-fg font-medium">
                {availWindow - route.walking_duration_minutes <= 5 ? "впритык!" : "комфортно"}
              </div>
            </div>
          </div>

          {/* Path Steps */}
          <div className="p-3.5 rounded-2xl bg-card border border-border/80 space-y-2">
            <div className="text-xs font-extrabold text-fg mb-1">Маршрут по аллеям и контрольным точкам:</div>
            <div className="space-y-2 relative pl-4 border-l-2 border-primary/30">
              {route.path_waypoints.map((point, idx) => (
                <div key={idx} className="relative text-xs">
                  <span className="absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full bg-primary" />
                  <span className="font-semibold text-fg leading-relaxed">{point}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="text-xs text-muted-fg bg-muted/40 p-3 rounded-2xl leading-relaxed">
            💡 {route.weather_advisory}
          </div>
        </div>
      </div>
    </div>
  )
}
