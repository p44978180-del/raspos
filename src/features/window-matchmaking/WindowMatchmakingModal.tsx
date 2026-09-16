import React, { useState, useMemo } from "react"
import officialScheduleData from "../../data/official-schedule.json"
import type { SharedWindowSlot } from "../../proto/schedule"

interface WindowMatchmakingModalProps {
  isOpen: boolean
  onClose: () => void
  myGroup: string
}

const DINING_SPOTS = [
  { name: "Столовая №2 (12-й корпус, 1 этаж)", walkMin: 3, type: "Обед" },
  { name: "Студенческое кафе «Колос» (Лиственничная аллея)", walkMin: 5, type: "Кофе / Сэндвичи" },
  { name: "Коворкинг и буфет (28-й Инженерный корпус)", walkMin: 6, type: "Учеба / Перекус" },
  { name: "Буфет 1-го корпуса (2 этаж)", walkMin: 2, type: "Выпечка / Чай" },
  { name: "Зона отдыха ЦНБ им. Железнова", walkMin: 4, type: "Тихий коворкинг" },
]

const BELL_PAIRS = [
  { slot: 1, start: "08:30", end: "10:05" },
  { slot: 2, start: "10:20", end: "11:55" },
  { slot: 3, start: "12:25", end: "14:00" },
  { slot: 4, start: "14:15", end: "15:50" },
  { slot: 5, start: "16:05", end: "17:40" },
  { slot: 6, start: "17:55", end: "19:30" },
]

const WEEKDAYS = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота"]

export default function WindowMatchmakingModal({
  isOpen,
  onClose,
  myGroup,
}: WindowMatchmakingModalProps) {
  const allGroups = useMemo(() => {
    const raw = officialScheduleData as any
    return raw?.groups ? Object.keys(raw.groups) : []
  }, [])

  const [friendGroup, setFriendGroup] = useState<string>(() => {
    return allGroups.find((g) => g !== myGroup) || "ДЭ 17-26"
  })
  const [selectedDay, setSelectedDay] = useState<string>("Понедельник")

  // Calculate matching free slots (windows) across selected groups
  const sharedWindows = useMemo<SharedWindowSlot[]>(() => {
    const raw = officialScheduleData as any
    if (!raw?.groups) return []

    const gData1 = raw.groups[myGroup]
    const gData2 = raw.groups[friendGroup]
    if (!gData1 || !gData2) return []

    const daySchedule1 = gData1.schedule?.find((d: any) => d.weekday === selectedDay)
    const daySchedule2 = gData2.schedule?.find((d: any) => d.weekday === selectedDay)

    const busySlots1 = new Set<number>(daySchedule1?.classes?.map((c: any) => c.num) || [])
    const busySlots2 = new Set<number>(daySchedule2?.classes?.map((c: any) => c.num) || [])

    const matches: SharedWindowSlot[] = []
    const dayIdx = WEEKDAYS.indexOf(selectedDay) + 1

    for (const pair of BELL_PAIRS) {
      if (!busySlots1.has(pair.slot) && !busySlots2.has(pair.slot)) {
        const spot = DINING_SPOTS[(dayIdx + pair.slot) % DINING_SPOTS.length]
        matches.push({
          day_of_week: dayIdx,
          weekday: selectedDay,
          slot_number: pair.slot,
          start_time: pair.start,
          end_time: pair.end,
          duration_minutes: 95,
          participating_group_names: [myGroup, friendGroup],
          suggested_meetup_spot: spot.name,
          walk_minutes_to_spot: spot.walkMin,
        })
      }
    }

    return matches
  }, [myGroup, friendGroup, selectedDay])

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
            <div className="w-9 h-9 rounded-xl bg-purple-500/10 text-purple-600 flex items-center justify-center text-lg">
              🤝
            </div>
            <div>
              <h3 className="text-base font-extrabold text-fg">Синхронизация окон («Matchmaking»)</h3>
              <p className="text-xs text-muted-fg">Поиск общего свободного времени для обеда или подготовки</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-muted-fg hover:text-fg"
          >
            ✕
          </button>
        </div>

        {/* Group Selector Controls */}
        <div className="p-4 border-b border-border/60 space-y-3 bg-muted/20">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold text-muted-fg uppercase tracking-wider block mb-1">
                Ваша группа
              </label>
              <div className="px-3 py-2 rounded-xl bg-card border border-border text-sm font-bold text-primary">
                {myGroup || "Не выбрана"}
              </div>
            </div>

            <div>
              <label className="text-[10px] font-bold text-muted-fg uppercase tracking-wider block mb-1">
                Группа друга
              </label>
              <select
                value={friendGroup}
                onChange={(e) => setFriendGroup(e.target.value)}
                className="w-full bg-card border border-border rounded-xl px-3 py-2 text-sm font-bold text-fg outline-none focus:border-primary"
              >
                {allGroups.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Day of Week Selector */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            {WEEKDAYS.map((w) => (
              <button
                key={w}
                onClick={() => setSelectedDay(w)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                  selectedDay === w
                    ? "bg-purple-600 text-white shadow-xs"
                    : "bg-card border border-border text-muted-fg hover:text-fg"
                }`}
              >
                {w.slice(0, 3)}
              </button>
            ))}
          </div>
        </div>

        {/* Shared Windows List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {sharedWindows.length === 0 ? (
            <div className="py-12 text-center text-xs text-muted-fg">
              В {selectedDay.toLowerCase()} у групп {myGroup} и {friendGroup} нет совпадающих свободных окон.
            </div>
          ) : (
            sharedWindows.map((win, idx) => (
              <div
                key={idx}
                className="p-3.5 rounded-2xl bg-card border border-purple-500/25 bg-gradient-to-r from-purple-500/5 to-transparent space-y-2 shadow-xs"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-lg bg-purple-500/15 text-purple-700 dark:text-purple-300 text-xs font-extrabold">
                      {win.slot_number}-я пара · {win.duration_minutes} мин
                    </span>
                    <span className="text-xs font-bold text-fg">
                      {win.start_time} – {win.end_time}
                    </span>
                  </div>
                  <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                    Окно свободно
                  </span>
                </div>

                <div className="text-xs text-muted-fg leading-relaxed">
                  Обе группы свободны. Идеальное время для обеда или совместной домашки.
                </div>

                <div className="pt-2 border-t border-border/60 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5 text-fg font-medium">
                    <span>☕</span>
                    <span>{win.suggested_meetup_spot}</span>
                  </div>
                  <span className="text-muted-fg font-semibold">~{win.walk_minutes_to_spot} мин</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
