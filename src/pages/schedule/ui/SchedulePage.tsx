import React, { useState, useEffect } from "react"
import { I } from "@/shared/ui/Icons"
import { DayView } from "@/widgets/schedule-grid/ui/DayView"
import { DaySlider } from "@/widgets/day-slider/ui/DaySlider"
import { WeekToggle } from "@/features/toggle-week/ui/WeekToggle"
import { SearchBar } from "@/features/search-schedule/ui/SearchBar"
import BellScheduleSheet, {
  getCurrentBellStatus,
} from "@/components/BellScheduleSheet"
import {
  getStudyWeek,
  getWeekStart,
  fmtDate,
  fmtYMD,
  WDAY,
  TODAY,
} from "@/entities/lesson/lib/getStudyWeek"
import { TYPE_CFG } from "@/entities/lesson/lib/typeConfig"
import type {
  DaySchedule,
  ClassItem,
  Homework,
  PersonalNote,
  KonspektEntry,
  UserRole,
  ClassEdit,
  SubgroupPref,
  MovedInEntry,
  WeekFilterMode,
} from "@/entities/lesson/model/types"

export interface SchedulePageProps {
  allDays?: DaySchedule[]
  homework: Homework[]
  personal: PersonalNote[]
  role: UserRole
  classEdits: Record<number, ClassEdit>
  subgroupPrefs: Record<string, SubgroupPref>
  dorm: string
  dormDismissed: boolean
  dismissedEvents: number[]
  showDormBanner: boolean
  showEventBanners: boolean
  searchOpen: boolean
  search: string
  onSearchChange: (v: string) => void
  konspekts: Record<number, KonspektEntry>
  onDismissDorm: () => void
  onDismissEvent: (id: number) => void
  onBuildingClick: (b: string) => void
  onNotesClick: (id: number) => void
  onManageClass: (id: number) => void
  onSubgroupTap: (cls: ClassItem) => void
  onSubjectClick: (cls: ClassItem) => void
  onEat: () => void
  selDate?: string
  onDateChange?: (d: string) => void
}

export function SchedulePage({
  allDays = [],
  homework,
  personal,
  role,
  classEdits,
  subgroupPrefs,
  dorm,
  dormDismissed,
  dismissedEvents,
  showDormBanner,
  showEventBanners,
  searchOpen,
  search,
  onSearchChange,
  konspekts,
  onDismissDorm,
  onDismissEvent,
  onBuildingClick,
  onNotesClick,
  onManageClass,
  onSubgroupTap,
  onSubjectClick,
  onEat,
  selDate: propsSelDate,
  onDateChange: propsOnDateChange,
}: SchedulePageProps) {
  const [internalSelDate, setInternalSelDate] = useState(TODAY)
  const selDate = propsSelDate ?? internalSelDate
  const setSelDate = (d: string) => {
    if (propsOnDateChange) propsOnDateChange(d)
    else setInternalSelDate(d)
  }
  const [weekFilterMode, setWeekFilterMode] =
    useState<WeekFilterMode>("current")
  const [showWeek, setShowWeek] = useState(false)
  const [bellOpen, setBellOpen] = useState(false)
  const [nowMin, setNowMin] = useState(() => {
    const d = new Date()
    return d.getHours() * 60 + d.getMinutes()
  })
  useEffect(() => {
    const t = setInterval(() => {
      const d = new Date()
      setNowMin(d.getHours() * 60 + d.getMinutes())
    }, 60000)
    return () => clearInterval(t)
  }, [])

  const ws = getWeekStart(selDate)
  const weekDays: string[] = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(ws)
    d.setDate(d.getDate() + i)
    weekDays.push(fmtYMD(d))
  }

  function shiftWeek(n: number) {
    const d = new Date(selDate + "T00:00:00")
    d.setDate(d.getDate() + n * 7)
    setSelDate(fmtYMD(d))
  }

  const isCurrentWeek = weekDays.includes(TODAY)
  const currentData = allDays.find((d) => d.date === selDate)
  const currentWeekday = currentData?.weekday ?? ""

  const movedInEntries: MovedInEntry[] = []
  allDays.forEach((d) => {
    if (d.weekday === currentWeekday) return
    d.classes.forEach((c) => {
      const edit = classEdits[c.id]
      if (edit?.dayOverride === currentWeekday)
        movedInEntries.push({ cls: c, fromWeekday: d.weekday })
    })
  })
  const seen = new Set<number>()
  const uniqueMovedIn = movedInEntries.filter((e) => {
    if (seen.has(e.cls.id)) return false
    seen.add(e.cls.id)
    return true
  })

  const currentWeekNum = getStudyWeek(selDate)
  const currentIsOdd = currentWeekNum % 2 !== 0
  const currentActiveClasses = (currentData?.classes ?? []).filter(
    (c) =>
      !c.weekType ||
      c.weekType === "all" ||
      (weekFilterMode === "odd" && c.weekType === "odd") ||
      (weekFilterMode === "even" && c.weekType === "even") ||
      weekFilterMode === "all" ||
      (weekFilterMode === "current" &&
        (currentIsOdd ? c.weekType === "odd" : c.weekType === "even")),
  )

  const weekTotalClasses = weekDays.reduce((acc, d) => {
    const dayData = allDays.find((x) => x.date === d)
    const dayWeekNum = getStudyWeek(d)
    const dayIsOdd = dayWeekNum % 2 !== 0
    const filtered = (dayData?.classes ?? []).filter(
      (c) =>
        !c.weekType ||
        c.weekType === "all" ||
        (weekFilterMode === "odd" && c.weekType === "odd") ||
        (weekFilterMode === "even" && c.weekType === "even") ||
        weekFilterMode === "all" ||
        (weekFilterMode === "current" &&
          (dayIsOdd ? c.weekType === "odd" : c.weekType === "even")),
    )
    return acc + filtered.length
  }, 0)

  const bellStatus = getCurrentBellStatus(nowMin)

  return (
    <div>
      <div className="px-4 pt-1 pb-2 flex items-end justify-between">
        <div>
          <p className="text-xs text-muted-fg font-semibold uppercase tracking-widest">
            {currentData?.weekday}
          </p>
          <h2 className="text-xl font-extrabold text-fg leading-tight">
            {fmtDate(selDate)}
          </h2>
        </div>
        <div className="text-right pb-0.5">
          <p
            className="text-lg font-extrabold text-primary leading-none"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            {currentActiveClasses.length}{" "}
            <span className="text-xs font-normal text-muted-fg">
              / {weekTotalClasses}
            </span>
          </p>
          <p className="text-[10px] text-muted-fg font-semibold mt-0.5">
            сегодня · на неделе
          </p>
        </div>
      </div>

      {/* 4-segment week parity switcher */}
      <WeekToggle
        mode={weekFilterMode}
        onChange={setWeekFilterMode}
        currentIsOdd={currentIsOdd}
      />

      {searchOpen && (
        <SearchBar
          value={search}
          onChange={onSearchChange}
          placeholder="Поиск пар, преподавателей..."
        />
      )}

      {/* Live class indicator only when active */}
      {(bellStatus.status === "class" || bellStatus.status === "break") && (
        <div className="px-4 mb-2">
          <button
            onClick={() => setBellOpen(true)}
            className="w-full flex items-center justify-between px-3 py-1.5 rounded-xl bg-primary/10 border border-primary/20 text-xs font-semibold text-primary hover:bg-primary/15 transition-all text-left cursor-pointer"
          >
            <span className="truncate">
              ⏱ {bellStatus.text} · {bellStatus.detail}
            </span>
            <span className="text-[11px] opacity-75 flex-shrink-0 ml-1">
              График →
            </span>
          </button>
        </div>
      )}

      {bellOpen && (
        <BellScheduleSheet
          nowMin={nowMin}
          onClose={() => setBellOpen(false)}
          onEat={onEat}
        />
      )}

      <DaySlider
        selDate={selDate}
        onDateChange={setSelDate}
        activeDays={allDays}
        weekFilterMode={weekFilterMode}
        showWeek={showWeek}
        onToggleShowWeek={() => setShowWeek((w) => !w)}
        onOpenBell={() => setBellOpen(true)}
      />

      {showWeek && (
        <div className="px-4 mb-2 space-y-1">
          {weekDays.map((d) => {
            const data = allDays.find((x) => x.date === d)
            const dd = new Date(d + "T00:00:00")
            const isTod = d === TODAY
            const dayWeekNum = getStudyWeek(d)
            const dayIsOdd = dayWeekNum % 2 !== 0
            const dayClasses = (data?.classes ?? []).filter(
              (c) =>
                !c.weekType ||
                c.weekType === "all" ||
                (weekFilterMode === "odd" && c.weekType === "odd") ||
                (weekFilterMode === "even" && c.weekType === "even") ||
                weekFilterMode === "all" ||
                (weekFilterMode === "current" &&
                  (dayIsOdd ? c.weekType === "odd" : c.weekType === "even")),
            )
            if (!data || !dayClasses.length)
              return (
                <div
                  key={d}
                  className="bg-card border border-border rounded-xl p-2.5 flex items-center gap-3"
                >
                  <div className="text-center w-10 flex-shrink-0">
                    <p className="text-[10px] text-muted-fg font-semibold">
                      {WDAY[dd.getDay() === 0 ? 6 : dd.getDay() - 1]}
                    </p>
                    <p
                      className="text-sm font-bold text-muted-fg"
                      style={{ fontFamily: "var(--font-mono)" }}
                    >
                      {dd.getDate()}
                    </p>
                  </div>
                  <p className="text-xs text-muted-fg">Занятий нет</p>
                </div>
              )
            return (
              <button
                key={d}
                onClick={() => setSelDate(d)}
                className={`w-full bg-card border rounded-xl overflow-hidden text-left cursor-pointer transition-colors ${
                  isTod
                    ? "border-accent bg-accent/5"
                    : "border-border hover:border-primary/40"
                }`}
              >
                <div className="flex items-center gap-2 px-3 py-2 bg-muted/60">
                  <div className="text-center w-10 flex-shrink-0">
                    <p className="text-[10px] text-muted-fg font-semibold">
                      {WDAY[dd.getDay() === 0 ? 6 : dd.getDay() - 1]}
                    </p>
                    <p
                      className="text-sm font-bold text-fg"
                      style={{ fontFamily: "var(--font-mono)" }}
                    >
                      {dd.getDate()}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1 items-center flex-1 min-w-0">
                    {dayClasses.slice(0, 4).map((c) => (
                      <span
                        key={c.id}
                        className={`text-[10px] px-1.5 py-0.5 rounded-md font-semibold ${TYPE_CFG[c.type].chip}`}
                      >
                        {c.start}–{c.end}
                      </span>
                    ))}
                    {dayClasses.length > 4 && (
                      <span className="text-[10px] text-muted-fg font-medium">
                        +{dayClasses.length - 4}
                      </span>
                    )}
                  </div>
                  {isTod && (
                    <span className="ml-auto text-[10px] font-bold text-primary flex-shrink-0">
                      Сегодня
                    </span>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      )}

      <div key={selDate} className="animate-fade-in">
        <DayView
          allDays={allDays}
          dateStr={selDate}
          search={search}
          homework={homework}
          personal={personal}
          role={role}
          classEdits={classEdits}
          subgroupPrefs={subgroupPrefs}
          dorm={dorm}
          konspekts={konspekts}
          dormDismissed={dormDismissed}
          dismissedEvents={dismissedEvents}
          showDormBanner={showDormBanner}
          showEventBanners={showEventBanners}
          movedInEntries={uniqueMovedIn}
          nowMin={nowMin}
          onDismissDorm={onDismissDorm}
          onDismissEvent={onDismissEvent}
          onBuildingClick={onBuildingClick}
          onNotesClick={onNotesClick}
          onManageClass={onManageClass}
          onSubgroupTap={onSubgroupTap}
          onSubjectClick={onSubjectClick}
          onEat={onEat}
          weekFilterMode={weekFilterMode}
        />
      </div>
    </div>
  )
}
