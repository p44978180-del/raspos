import React from "react"
import { I } from "@/shared/ui/Icons"
import { TYPE_CFG } from "@/entities/lesson/lib/typeConfig"
import { cleanRoomNumber, formatLocationDisplay } from "@/entities/lesson/lib/location"
import { toMin } from "@/entities/lesson/lib/getStudyWeek"
import type {
  ClassItem,
  ClassEdit,
  Homework,
  SubgroupPref,
} from "@/entities/lesson/model/types"

export interface ClassCardProps {
  cls: ClassItem
  isNow: boolean
  nowMin: number
  edit?: ClassEdit
  homework?: Homework
  hasTodos?: boolean
  hasKonspekt?: boolean
  subgroupPref?: SubgroupPref
  weekday?: string
  movedFrom?: string
  onSubgroupTap?: () => void
  onNotesClick?: () => void
  onBuildingClick?: (b: string) => void
  onManage?: () => void
  onSubjectClick?: () => void
  onCrowdsource?: () => void
  isOddWeek?: boolean
  weekFilter?: "current" | "all"
}

export function ClassCard({
  cls,
  isNow,
  nowMin,
  edit,
  homework,
  hasTodos,
  hasKonspekt,
  subgroupPref,
  weekday,
  movedFrom,
  onSubgroupTap,
  onNotesClick,
  onBuildingClick,
  onManage,
  onSubjectClick,
  onCrowdsource,
  isOddWeek = true,
  weekFilter = "current",
}: ClassCardProps) {
  const cfg = TYPE_CFG[cls.type]
  const cancelled = edit?.cancelled ?? false
  const displayBuilding = edit?.building ?? cls.building
  const displayRoom = edit?.room ?? cls.room
  const displayTeacher = edit?.teacher ?? cls.teacher
  const displayStart = edit?.startOverride ?? cls.start
  const displayEnd = edit?.endOverride ?? cls.end
  const hasTimeChange = !!(
    edit?.startOverride && edit.startOverride !== cls.start
  )
  const hasBuildingChange = !!(edit?.building && edit.building !== cls.building)
  const hasTeacherChange = !!(edit?.teacher && edit.teacher !== cls.teacher)
  const hasMoved = !!(
    edit?.dayOverride &&
    edit.dayOverride !== weekday &&
    !movedFrom
  )

  // Progress for current class
  const startMin = toMin(displayStart)
  const endMin = toMin(displayEnd)
  const progressPct =
    isNow && !cancelled && endMin > startMin
      ? Math.min(
          100,
          Math.max(
            0,
            Math.round(((nowMin - startMin) / (endMin - startMin)) * 100),
          ),
        )
      : 0

  const barGrad = cancelled ? "bg-red" : movedFrom ? "bg-amber-500" : cfg.bar

  return (
    <div
      className={`relative flex rounded-2xl overflow-hidden border transition-all duration-200 tactile-card cursor-pointer ${
        cancelled
          ? "opacity-60 border-red-bg bg-card"
          : isNow && !cancelled
            ? "border-primary/50 ring-2 ring-primary/20 shadow-md shadow-primary/5 bg-card"
            : "border-border/80 bg-card hover:border-primary/40 hover:shadow-xs active:scale-[0.985]"
      }`}
    >
      <div
        className={`w-[6px] flex-shrink-0 ${barGrad}`}
        style={{
          background: movedFrom
            ? "linear-gradient(180deg,#f59e0b,#d97706)"
            : cancelled
              ? "var(--color-red)"
              : cls.type === "lecture"
                ? "linear-gradient(180deg,var(--color-primary),var(--color-primary-light))"
                : cls.type === "practice"
                  ? "linear-gradient(180deg,#f59e0b,#d97706)"
                  : cls.type === "elective"
                    ? "linear-gradient(180deg,#a855f7,#7e22ce)"
                    : "linear-gradient(180deg,var(--color-blue),#5ba3e0)",
        }}
      />
      <div className="flex-1 p-3.5 min-w-0">
        {movedFrom && (
          <div className="flex items-center gap-1.5 mb-2 text-[11px] font-semibold text-amber bg-amber-bg border border-amber/20 rounded-lg px-2.5 py-1.5">
            {I.arrowRight(11)} Перенесена с {movedFrom}
          </div>
        )}
        <div className="flex items-center gap-2 mb-1.5">
          <span
            className="text-base font-mono font-medium text-muted-fg w-5 flex-shrink-0"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            {edit?.numOverride ?? cls.num}
          </span>
          <span
            className={`text-sm font-mono font-semibold flex-shrink-0 ${
              hasTimeChange ? "text-red" : "text-fg"
            }`}
            style={{ fontFamily: "var(--font-mono)" }}
          >
            {displayStart}–{displayEnd}
          </span>
          {isNow && !cancelled && (
            <span className="flex items-center gap-1 text-xs font-bold text-white bg-accent px-2 py-0.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              Сейчас
            </span>
          )}
          {cancelled && (
            <span className="text-xs font-bold text-red bg-red-bg px-1.5 py-0.5 rounded-md">
              Отменена
            </span>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation()
              ;(onManage ?? onNotesClick)?.()
            }}
            className="ml-auto p-1 rounded-lg hover:bg-muted text-muted-fg transition-colors"
          >
            {I.dots(16)}
          </button>
        </div>
        {isNow && !cancelled && progressPct > 0 && (
          <div className="w-full h-1 bg-muted rounded-full overflow-hidden mb-2">
            <div
              className="h-full rounded-full bg-accent transition-all duration-1000"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        )}
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <button
            onClick={onSubjectClick}
            className={`text-sm font-bold leading-snug flex-1 min-w-0 text-left hover:underline underline-offset-2 decoration-accent/50 transition-colors ${
              cancelled ? "line-through text-muted-fg" : "text-fg"
            }`}
          >
            {cls.subject}
          </button>
          <div className="flex gap-1 flex-wrap justify-end items-center max-w-[44%]">
            <span
              className={`text-[11px] px-2 py-0.5 rounded-md font-semibold flex-shrink-0 inline-flex items-center gap-1 ${cfg.chip}`}
            >
              {cls.type === "lecture"
                ? I.book(11)
                : cls.type === "practice"
                  ? I.pencil(11)
                  : cls.type === "elective"
                    ? I.star(11)
                    : I.flask(11)}
              <span>{cfg.label}</span>
            </span>
            {cls.weekType && cls.weekType !== "all" && (() => {
              const isNotThisWeek =
                (isOddWeek && cls.weekType === "even") ||
                (!isOddWeek && cls.weekType === "odd")
              const isOdd = cls.weekType === "odd"
              const badgeText = isNotThisWeek
                ? isOdd
                  ? "Верхняя нед. (не на этой)"
                  : "Нижняя нед. (не на этой)"
                : isOdd
                  ? "Верхняя нед."
                  : "Нижняя нед."
              return (
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded-md font-bold flex-shrink-0 ${
                    isOdd
                      ? "bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-500/30"
                      : "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30"
                  }`}
                  title={
                    isOdd
                      ? !isOddWeek
                        ? "Верхняя пара · Не проводится на этой неделе (Числитель)"
                        : "Верхняя пара · Нечётная неделя (Числитель)"
                      : isOddWeek
                        ? "Нижняя пара · Не проводится на этой неделе (Знаменатель)"
                        : "Нижняя пара · Чётная неделя (Знаменатель)"
                  }
                >
                  {badgeText}
                </span>
              )
            })()}
            {(cls.subgroup || (cls.subgroups && cls.subgroups.length > 0)) && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onSubgroupTap?.()
                }}
                className="flex items-center gap-0.5 text-[11px] px-1.5 py-0.5 rounded-md font-semibold bg-muted text-muted-fg hover:bg-border transition-colors flex-shrink-0 cursor-pointer"
              >
                {cls.subgroup
                  ? `${cls.subgroup} п/г`
                  : cls.subgroups && cls.subgroups.length === 1
                    ? `${cls.subgroups[0]} п/г`
                    : subgroupPref && subgroupPref !== "all"
                      ? `${subgroupPref} п/г`
                      : "1, 2 п/г"}
                {I.chev("down", 9)}
              </button>
            )}
            {cancelled && edit?.cancelReason && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-red-bg text-red font-medium flex-shrink-0 truncate max-w-[90px]">
                {edit.cancelReason}
              </span>
            )}
            {homework && (
              <span className="text-[11px] px-1.5 py-0.5 rounded-md font-semibold bg-amber-bg text-amber border border-amber/20 flex-shrink-0 animate-bounce-in">
                ДЗ
              </span>
            )}
            {hasKonspekt && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-md font-semibold bg-primary/10 border border-primary/20 text-primary flex-shrink-0 inline-flex items-center gap-1">
                {I.file(10)} Конспект
              </span>
            )}
            {hasTodos && !homework && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-md font-semibold bg-primary/10 text-primary flex-shrink-0">
                {I.pencil(9)}
              </span>
            )}
          </div>
        </div>
        {(() => {
          const activeDetail = cls.subgroupDetails?.find(
            (d) => String(d.subgroup) === subgroupPref,
          )
          const teacherText = activeDetail?.teacher || displayTeacher
          const bldgText = activeDetail?.building || displayBuilding
          const roomText = activeDetail?.room || displayRoom
          const formattedLoc = formatLocationDisplay(bldgText, roomText)

          return (
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-xs text-muted-fg">
                {I.user(12, "flex-shrink-0")}
                <span className="truncate">{teacherText}</span>
              </div>
              <a
                href={`https://yandex.ru/maps/?text=${encodeURIComponent(
                  "РГАУ-МСХА " +
                    (bldgText === "Корпус уточняется"
                      ? "Тимирязевская"
                      : bldgText),
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => {
                  e.stopPropagation()
                  if (onBuildingClick) {
                    onBuildingClick(bldgText)
                  }
                }}
                className="flex items-center gap-1.5 text-xs text-primary hover:text-accent transition-colors"
              >
                {I.map(12)}
                <span>{formattedLoc}</span>
              </a>
              {subgroupPref === "all" &&
                cls.subgroupDetails &&
                cls.subgroupDetails.length > 1 && (
                  <div className="mt-2 pt-1.5 border-t border-border/50 flex flex-col gap-1">
                    {cls.subgroupDetails.map((sd) => (
                      <div
                        key={sd.subgroup}
                        className="flex items-center justify-between text-[11px] bg-muted/60 dark:bg-muted/30 rounded-md px-2 py-0.5 gap-1.5"
                      >
                        <span className="font-bold text-primary text-[10px] px-1 py-0.2 rounded bg-primary/10 flex-shrink-0">
                          {sd.subgroup} п/г
                        </span>
                        <span className="truncate text-muted-fg flex-1 font-medium">
                          {sd.teacher}
                        </span>
                        <span className="text-fg font-semibold flex-shrink-0">
                          {cleanRoomNumber(sd.building, sd.room)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
            </div>
          )
        })()}
        {(hasMoved ||
          hasTimeChange ||
          hasBuildingChange ||
          hasTeacherChange) && (
          <div className="flex gap-1 flex-wrap mt-1.5">
            {hasMoved && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-amber-bg text-amber font-bold border border-amber/20 flex-shrink-0 animate-slide-right">
                →{" "}
                {({
                  Понедельник: "Пн",
                  Вторник: "Вт",
                  Среда: "Ср",
                  Четверг: "Чт",
                  Пятница: "Пт",
                  Суббота: "Сб",
                } as Record<string, string>)[edit?.dayOverride ?? ""] ??
                  edit?.dayOverride?.slice(0, 2)}
                , п.{edit?.numOverride}
              </span>
            )}
            {hasTimeChange && !hasMoved && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-blue-bg text-blue font-bold border border-blue/20 flex-shrink-0 animate-slide-right">
                ⏱ {edit?.startOverride}–{edit?.endOverride}
              </span>
            )}
            {hasBuildingChange && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-muted text-muted-fg font-semibold flex-shrink-0 animate-slide-right">
                📍 {edit?.building?.slice(0, 10)}
              </span>
            )}
            {hasTeacherChange && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-muted text-muted-fg font-semibold flex-shrink-0 animate-slide-right">
                👤 Замена
              </span>
            )}
          </div>
        )}
        {cancelled && edit?.cancelNote && (
          <p className="mt-1.5 text-xs text-muted-fg bg-muted rounded-xl px-3 py-1.5">
            {edit.cancelNote}
          </p>
        )}
        {hasMoved && edit?.displacedNote && (
          <p className="mt-1 text-[11px] text-amber">
            Слот: {edit.displacedNote}
          </p>
        )}
        {(onNotesClick || onCrowdsource) && (
          <div className="mt-2.5 flex items-center justify-between gap-2 pt-1 border-t border-border/40">
            {onNotesClick && (
              <button
                onClick={onNotesClick}
                className="flex items-center gap-1.5 text-xs text-muted-fg hover:text-primary transition-colors cursor-pointer"
              >
                {I.book(12)}
                <span>{homework ? "ДЗ и заметки" : "Заметки"}</span>
                {I.chev("right", 11)}
              </button>
            )}
            {onCrowdsource && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onCrowdsource()
                }}
                className="flex items-center gap-1 text-[11px] font-semibold text-amber-700 dark:text-amber-300 hover:text-amber-800 transition-colors cursor-pointer bg-amber-500/10 px-2 py-0.5 rounded-lg border border-amber-500/20 active:scale-95"
                title="Сообщить о переносе пары или отмене"
              >
                <span>📣</span>
                <span>Перенос / отмена</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
