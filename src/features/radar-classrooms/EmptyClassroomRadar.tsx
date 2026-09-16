import React, { useState, useEffect } from "react"
import { localDb } from "../../utils/localDatabase"
import { connectClient } from "../../shared/api/connectClient"
import type { EmptyClassroomItem } from "../../proto/schedule"

interface EmptyClassroomRadarProps {
  isOpen: boolean
  onClose: () => void
  onNavigateToBuilding?: (building: string) => void
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

export default function EmptyClassroomRadar({
  isOpen,
  onClose,
  onNavigateToBuilding,
}: EmptyClassroomRadarProps) {
  const [selectedBuilding, setSelectedBuilding] = useState(BUILDINGS[0])
  const [dayOfWeek, setDayOfWeek] = useState(1)
  const [slotNumber, setSlotNumber] = useState(2)
  const [requireSockets, setRequireSockets] = useState(false)
  const [requireQuiet, setRequireQuiet] = useState(false)
  const [rooms, setRooms] = useState<EmptyClassroomItem[]>([])
  const [loading, setLoading] = useState(false)

  // Current day and slot determination on open
  useEffect(() => {
    if (!isOpen) return
    const now = new Date()
    const jsDay = now.getDay()
    const d = jsDay === 0 ? 7 : jsDay
    setDayOfWeek(d)

    // Rough slot determination based on hour
    const hour = now.getHours()
    if (hour < 10) setSlotNumber(1)
    else if (hour < 12) setSlotNumber(2)
    else if (hour < 14) setSlotNumber(3)
    else if (hour < 16) setSlotNumber(4)
    else if (hour < 18) setSlotNumber(5)
    else setSlotNumber(6)
  }, [isOpen])

  // Query empty rooms from Local SQLite OPFS with Connect-RPC fallback
  useEffect(() => {
    if (!isOpen) return
    let active = true
    setLoading(true)

    async function loadRadar() {
      // 1. Try local SQLite OPFS
      const localResults = await localDb.getEmptyClassrooms(
        selectedBuilding,
        dayOfWeek,
        slotNumber,
        "all"
      )

      if (localResults.length > 0 && active) {
        let filtered = localResults
        if (requireSockets) filtered = filtered.filter((r) => r.has_power_sockets)
        if (requireQuiet) filtered = filtered.filter((r) => r.is_quiet_zone)
        setRooms(filtered)
        setLoading(false)
        return
      }

      // 2. Connect-RPC fallback
      const resp = await connectClient.getEmptyClassrooms({
        building: selectedBuilding,
        day_of_week: dayOfWeek,
        slot_number: slotNumber,
        require_power_sockets: requireSockets,
        require_quiet_zone: requireQuiet,
      })

      if (active) {
        setRooms(resp.classrooms)
        setLoading(false)
      }
    }

    loadRadar()
    return () => {
      active = false
    }
  }, [isOpen, selectedBuilding, dayOfWeek, slotNumber, requireSockets, requireQuiet])

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
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center text-lg">
              📡
            </div>
            <div>
              <h3 className="text-base font-extrabold text-fg">Радар пустых аудиторий</h3>
              <p className="text-xs text-muted-fg">Где посидеть, зарядить ноутбук или поботать</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-muted-fg hover:text-fg"
          >
            ✕
          </button>
        </div>

        {/* Filter Bar */}
        <div className="p-4 border-b border-border/60 space-y-3 bg-muted/20">
          {/* Building Select */}
          <div>
            <label className="text-[11px] font-bold text-muted-fg uppercase tracking-wider block mb-1">
              Учебный корпус
            </label>
            <select
              value={selectedBuilding}
              onChange={(e) => setSelectedBuilding(e.target.value)}
              className="w-full bg-card border border-border rounded-xl px-3 py-2 text-sm font-semibold text-fg outline-none focus:border-primary"
            >
              {BUILDINGS.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>

          {/* Slot & Filter Chips */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-muted-fg">Пара:</span>
              {[1, 2, 3, 4, 5, 6].map((num) => (
                <button
                  key={num}
                  onClick={() => setSlotNumber(num)}
                  className={`w-7 h-7 rounded-lg text-xs font-bold transition-all ${
                    slotNumber === num
                      ? "bg-primary text-white shadow-xs"
                      : "bg-card border border-border text-muted-fg hover:text-fg"
                  }`}
                >
                  {num}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setRequireSockets(!requireSockets)}
                className={`px-2.5 py-1 rounded-xl text-xs font-semibold border transition-all ${
                  requireSockets
                    ? "bg-amber-500/15 border-amber-500/40 text-amber-700 dark:text-amber-300 font-bold"
                    : "bg-card border-border text-muted-fg"
                }`}
              >
                🔌 Розетки
              </button>
              <button
                onClick={() => setRequireQuiet(!requireQuiet)}
                className={`px-2.5 py-1 rounded-xl text-xs font-semibold border transition-all ${
                  requireQuiet
                    ? "bg-blue-500/15 border-blue-500/40 text-blue-700 dark:text-blue-300 font-bold"
                    : "bg-card border-border text-muted-fg"
                }`}
              >
                🤫 Тихая зона
              </button>
            </div>
          </div>
        </div>

        {/* Results List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
          {loading ? (
            <div className="py-12 text-center text-xs text-muted-fg animate-pulse">
              Поиск свободных кабинетов в {selectedBuilding}...
            </div>
          ) : rooms.length === 0 ? (
            <div className="py-12 text-center text-xs text-muted-fg">
              На выбранный слот свободных аудиторий по заданным критериям не найдено.
            </div>
          ) : (
            rooms.map((room) => (
              <div
                key={room.classroom_id}
                className="flex items-center justify-between p-3 rounded-2xl bg-card border border-border/80 hover:border-primary/40 transition-colors shadow-xs"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary font-black flex items-center justify-center text-sm">
                    {room.room}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-fg">Аудитория {room.room}</span>
                      <span className="text-[11px] font-semibold text-muted-fg">
                        ({room.floor} этаж)
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-fg">
                      <span>Вместимость ~{room.capacity} мест</span>
                      {room.has_power_sockets && <span className="text-amber-600 font-medium">· 🔌 Есть розетки</span>}
                      {room.is_quiet_zone && <span className="text-blue-600 font-medium">· 🤫 Тихо</span>}
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => {
                    onNavigateToBuilding?.(selectedBuilding)
                    onClose()
                  }}
                  className="px-3 py-1.5 rounded-xl bg-primary text-white text-xs font-bold hover:opacity-90 transition-opacity"
                >
                  Маршрут
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
