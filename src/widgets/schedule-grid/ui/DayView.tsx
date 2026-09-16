import React, { useState } from "react"
import { motion } from "framer-motion"
import { springPhysics } from "@/shared/lib/spring-physics"
import { I } from "@/shared/ui/Icons"
import { DormCard } from "./DormCard"
import { MovedAwayCard } from "./MovedAwayCard"
import { ClassCard } from "./ClassCard"
import { OknoCard } from "./OknoCard"
import { TravelBanner } from "./TravelBanner"
import { RestSheet } from "./RestSheet"
import { getStudyWeek, toMin, TODAY } from "@/entities/lesson/lib/getStudyWeek"
import { detectWindowGap } from "@/entities/lesson/lib/detectWindowGap"
import { getAppEvents } from "@/entities/campus/model/campusData"
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

export interface DayViewProps {
  allDays?: DaySchedule[]
  dateStr: string
  search: string
  homework: Homework[]
  personal: PersonalNote[]
  konspekts: Record<number, KonspektEntry>
  role: UserRole
  classEdits: Record<number, ClassEdit>
  subgroupPrefs: Record<string, SubgroupPref>
  dorm: string
  dormDismissed: boolean
  dismissedEvents: number[]
  showDormBanner: boolean
  showEventBanners: boolean
  movedInEntries: MovedInEntry[]
  nowMin: number
  onDismissDorm: () => void
  onDismissEvent: (id: number) => void
  onBuildingClick: (b: string) => void
  onNotesClick: (id: number) => void
  onManageClass: (id: number) => void
  onSubgroupTap: (cls: ClassItem) => void
  onSubjectClick: (cls: ClassItem) => void
  onEat: () => void
  weekFilterMode?: WeekFilterMode
}

export function DayView({
  allDays = [],
  dateStr,
  search,
  homework,
  personal,
  role,
  classEdits,
  subgroupPrefs,
  dorm,
  konspekts,
  dormDismissed,
  dismissedEvents,
  showDormBanner,
  showEventBanners,
  movedInEntries,
  nowMin,
  onDismissDorm,
  onDismissEvent,
  onBuildingClick,
  onNotesClick,
  onManageClass,
  onSubgroupTap,
  onSubjectClick,
  onEat,
  weekFilterMode = "current",
}: DayViewProps) {
  const [restOpen, setRestOpen] = useState(false)
  const effectiveFilter = weekFilterMode ?? "current"
  const data = allDays.find((d) => d.date === dateStr)
  const isToday = dateStr === TODAY
  const todayEvents = getAppEvents().filter(
    (e) =>
      e.date === dateStr &&
      !dismissedEvents.includes(e.id) &&
      e.category === "announcement" &&
      (e.title.toLowerCase().includes("расписан") ||
        e.title.toLowerCase().includes("пар") ||
        e.title.toLowerCase().includes("занят") ||
        e.title.toLowerCase().includes("сесси") ||
        e.title.toLowerCase().includes("перенос")),
  )
  const weekNum = getStudyWeek(dateStr)
  const isOddWeek = weekNum % 2 !== 0

  if (!data)
    return (
      <div className="text-center py-16 text-muted-fg text-sm px-4">
        Нет данных
      </div>
    )

  type ListEntry =
    | { type: "native"; cls: ClassItem }
    | { type: "movedin"; cls: ClassItem; fromDay: string }
    | { type: "movedaway"; cls: ClassItem }

  const entries: ListEntry[] = []

  data.classes.forEach((c) => {
    if (c.weekType && c.weekType !== "all") {
      if (effectiveFilter === "odd" && c.weekType !== "odd") return
      if (effectiveFilter === "even" && c.weekType !== "even") return
      if (effectiveFilter === "current") {
        if (isOddWeek && c.weekType === "even") return
        if (!isOddWeek && c.weekType === "odd") return
      }
    }
    if (c.subgroup || (c.subgroups && c.subgroups.length === 1)) {
      const effectiveSub = c.subgroup ?? c.subgroups?.[0]
      const pref = subgroupPrefs[c.subject] ?? "all"
      if (pref !== "all" && effectiveSub !== Number(pref)) return
    }
    if (search) {
      const q = search.toLowerCase()
      if (
        !c.subject.toLowerCase().includes(q) &&
        !c.teacher.toLowerCase().includes(q)
      )
        return
    }
    const edit = classEdits[c.id]
    if (edit?.dayOverride && edit.dayOverride !== data.weekday) {
      entries.push({ type: "movedaway", cls: c })
    } else {
      entries.push({ type: "native", cls: c })
    }
  })

  movedInEntries.forEach(({ cls, fromWeekday }) => {
    if (cls.weekType && cls.weekType !== "all") {
      if (effectiveFilter === "odd" && cls.weekType !== "odd") return
      if (effectiveFilter === "even" && cls.weekType !== "even") return
      if (effectiveFilter === "current") {
        if (isOddWeek && cls.weekType === "even") return
        if (!isOddWeek && cls.weekType === "odd") return
      }
    }
    if (
      !search ||
      cls.subject.toLowerCase().includes(search.toLowerCase()) ||
      cls.teacher.toLowerCase().includes(search.toLowerCase())
    )
      entries.push({ type: "movedin", cls, fromDay: fromWeekday })
  })

  entries.sort((a, b) => {
    const numA =
      a.type === "native"
        ? (classEdits[a.cls.id]?.numOverride ?? a.cls.num)
        : a.cls.num
    const numB =
      b.type === "native"
        ? (classEdits[b.cls.id]?.numOverride ?? b.cls.num)
        : b.cls.num
    return numA - numB
  })

  // Detect slot conflicts: mark displaced classes
  const slotCounts = new Map<number, number>()
  const movedNums = new Set<number>()
  entries.forEach((e) => {
    const num =
      e.type === "native"
        ? (classEdits[e.cls.id]?.numOverride ?? e.cls.num)
        : e.cls.num
    if (
      e.type === "native" &&
      classEdits[e.cls.id]?.numOverride &&
      classEdits[e.cls.id]?.numOverride !== e.cls.num
    ) {
      movedNums.add(classEdits[e.cls.id]!.numOverride!)
    }
    slotCounts.set(num, (slotCounts.get(num) ?? 0) + 1)
  })
  const conflictNums = new Set(
    [...slotCounts.entries()].filter(([, c]) => c > 1).map(([n]) => n),
  )

  if (!data.classes.length && movedInEntries.length === 0)
    return (
      <div className="text-center py-16 px-4">
        <p className="text-sm font-semibold text-fg">Занятий нет</p>
        <p className="text-xs text-muted-fg mt-1">
          Отдыхайте или готовьтесь к следующему дню
        </p>
      </div>
    )

  return (
    <div className="space-y-2.5 pb-2">
      {restOpen && <RestSheet onClose={() => setRestOpen(false)} />}
      {showDormBanner &&
        dorm !== "Не указано" &&
        !dormDismissed &&
        entries.length > 0 && (
          <DormCard dorm={dorm} onDismiss={onDismissDorm} />
        )}
      {showEventBanners &&
        todayEvents.slice(0, 2).map((ev) => (
          <div
            key={ev.id}
            className="mx-4 flex items-center gap-2.5 bg-amber-bg border border-amber/20 rounded-xl px-3 py-2.5"
          >
            {I.bell(15, "text-amber flex-shrink-0")}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-fg">{ev.title}</p>
              <p className="text-xs text-muted-fg">{ev.place}</p>
            </div>
            <button
              onClick={() => onDismissEvent(ev.id)}
              className="p-1 rounded-lg hover:bg-amber/20 text-amber/70 flex-shrink-0 cursor-pointer"
            >
              {I.close(14)}
            </button>
          </div>
        ))}

      {entries.length === 0 ? (
        <p className="text-center py-8 text-muted-fg text-sm">
          Ничего не найдено
        </p>
      ) : (
        <motion.div
          key={`${dateStr}-${effectiveFilter}`}
          initial="hidden"
          animate="show"
          variants={{
            hidden: {},
            show: {
              transition: {
                staggerChildren: 0.04,
              },
            },
          }}
          className="space-y-2.5"
        >
          {entries.map((entry, idx) => {
            const prevEntry = entries[idx - 1]
            const prevCls =
              prevEntry &&
              (prevEntry.type === "native" || prevEntry.type === "movedin")
                ? prevEntry.cls
                : null
            const curCls = entry.cls
            const curEdit =
              entry.type === "native" ? classEdits[curCls.id] : undefined
            const curBuilding = curEdit?.building ?? curCls.building
            const prevBuilding = prevCls
              ? (classEdits[prevCls.id]?.building ?? prevCls.building)
              : null
            const curStart = curEdit?.startOverride ?? curCls.start
            const curEnd = curEdit?.endOverride ?? curCls.end
            const prevEnd = prevCls
              ? (classEdits[prevCls.id]?.endOverride ?? prevCls.end)
              : null
            const breakMin = prevEnd ? toMin(curStart) - toMin(prevEnd) : 0
            const gapMin = prevEnd ? toMin(curStart) - toMin(prevEnd) : 0
            const hw = homework.find((h) => h.classId === curCls.id)
            const pn = personal.find((n) => n.classId === curCls.id)
            const isCurrentWeekClass =
              !curCls.weekType ||
              curCls.weekType === "all" ||
              (isOddWeek ? curCls.weekType === "odd" : curCls.weekType === "even")
            const isNow =
              isToday &&
              isCurrentWeekClass &&
              toMin(curStart) <= nowMin &&
              nowMin < toMin(curEnd)

            const isDisplaced =
              entry.type === "native" &&
              !classEdits[curCls.id]?.numOverride &&
              conflictNums.has(curCls.num) &&
              movedNums.has(curCls.num)

            if (entry.type === "movedaway") {
              const tgt = classEdits[curCls.id]
              return (
                <motion.div
                  key={`movedaway-${curCls.id}`}
                  variants={{
                    hidden: { opacity: 0, y: 16, scale: 0.98 },
                    show: {
                      opacity: 1,
                      y: 0,
                      scale: 1.0,
                      transition: springPhysics.snappy,
                    },
                  }}
                  className="mx-4"
                >
                  <MovedAwayCard
                    cls={curCls}
                    toDay={tgt?.dayOverride ?? "?"}
                    toNum={tgt?.numOverride ?? curCls.num}
                  />
                </motion.div>
              )
            }

            const subPref =
              curCls.subgroup || (curCls.subgroups && curCls.subgroups.length > 0)
                ? (subgroupPrefs[curCls.subject] ?? "all")
                : undefined

            // Detect window gap with detectWindowGap helper or gap threshold
            const windowGap = prevCls ? detectWindowGap(prevCls, curCls) : null
            const hasWindow = windowGap !== null || gapMin > 40

            return (
              <motion.div
                key={
                  entry.type === "movedin"
                    ? `movedin-${curCls.id}`
                    : `native-${curCls.id}`
                }
                variants={{
                  hidden: { opacity: 0, y: 16, scale: 0.98 },
                  show: {
                    opacity: 1,
                    y: 0,
                    scale: 1.0,
                    transition: springPhysics.snappy,
                  },
                }}
                className="space-y-1.5"
              >
              {prevBuilding &&
                prevBuilding !== curBuilding &&
                entry.type === "native" && (
                  <TravelBanner
                    from={prevBuilding}
                    to={curBuilding}
                    breakMin={breakMin}
                  />
                )}
              {hasWindow && entry.type === "native" && prevEnd && (
                <OknoCard
                  from={windowGap?.startTime ?? prevEnd}
                  to={windowGap?.endTime ?? curStart}
                  gapMin={windowGap?.durationMinutes ?? gapMin}
                  onEat={onEat}
                  onRest={() => setRestOpen(true)}
                />
              )}
              <div className="mx-4">
                {isDisplaced && (
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-amber bg-amber-bg border border-amber/20 rounded-lg px-2.5 py-1.5 mb-1">
                    ⚠ Вытеснена: пара перенесена на этот слот другой парой
                  </div>
                )}
                <ClassCard
                  cls={curCls}
                  isNow={isNow && !isDisplaced}
                  nowMin={nowMin}
                  edit={entry.type === "native" ? curEdit : undefined}
                  homework={hw}
                  hasTodos={pn && pn.todos.length > 0}
                  hasKonspekt={
                    !!(
                      konspekts[curCls.id]?.text ||
                      konspekts[curCls.id]?.files?.length
                    )
                  }
                  subgroupPref={subPref}
                  weekday={data.weekday}
                  movedFrom={
                    entry.type === "movedin" ? entry.fromDay : undefined
                  }
                  onSubgroupTap={() => onSubgroupTap(curCls)}
                  onNotesClick={() => onNotesClick(curCls.id)}
                  onBuildingClick={onBuildingClick}
                  onManage={
                    role === "headstudent"
                      ? () => onManageClass(curCls.id)
                      : undefined
                  }
                  onSubjectClick={() => onSubjectClick(curCls)}
                  isOddWeek={isOddWeek}
                  weekFilter={effectiveFilter === "all" ? "all" : "current"}
                />
              </div>
            </motion.div>
          )
        })}
        </motion.div>
      )}
    </div>
  )
}
