import React, { useRef, useState } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import type { ScheduleItem } from "../proto/schedule"
import { formatLocationDisplay } from "../entities/lesson/lib/location"

interface VirtualizedScheduleListProps {
  items: ScheduleItem[]
  onSubjectClick?: (item: ScheduleItem) => void
  onNotesClick?: (id: number) => void
  onManageClick?: (id: number) => void
  onBuildingClick?: (building: string) => void
  onRouteClick?: (fromBuilding: string, toBuilding: string) => void
  onCrowdsourceClick?: (item: ScheduleItem) => void
  nextClassBuilding?: string
  role?: string
}

export default function VirtualizedScheduleList({
  items,
  onSubjectClick,
  onNotesClick,
  onManageClick,
  onBuildingClick,
  onRouteClick,
  onCrowdsourceClick,
  nextClassBuilding,
  role = "student",
}: VirtualizedScheduleListProps) {
  const parentRef = useRef<HTMLDivElement>(null)
  const [expandedId, setExpandedId] = useState<number | null>(null)

  const rowVirtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 110,
    overscan: 3,
  })

  const typeConfig: Record<string, { label: string; badgeCls: string; dotCls: string }> = {
    lecture: {
      label: "Лекция",
      badgeCls: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20",
      dotCls: "bg-blue-500",
    },
    practice: {
      label: "Практика",
      badgeCls: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
      dotCls: "bg-emerald-500",
    },
    lab: {
      label: "Лабораторная",
      badgeCls: "bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20",
      dotCls: "bg-purple-500",
    },
    elective: {
      label: "Факультатив",
      badgeCls: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
      dotCls: "bg-amber-500",
    },
  }

  return (
    <div
      ref={parentRef}
      className="w-full overflow-auto px-4 py-2"
      style={{
        maxHeight: "calc(100dvh - 240px)",
        contain: "strict",
      }}
    >
      <div
        style={{
          height: `${rowVirtualizer.getTotalSize()}px`,
          width: "100%",
          position: "relative",
        }}
      >
        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
          const item = items[virtualRow.index]
          const isExpanded = expandedId === item.id
          const typeInfo = typeConfig[item.type] || typeConfig.lecture

          return (
            <div
              key={item.id}
              data-index={virtualRow.index}
              ref={rowVirtualizer.measureElement}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translate3d(0, ${virtualRow.start}px, 0)`,
              }}
              className="pb-3"
            >
              <div className="bg-card border border-border/80 rounded-2xl p-3.5 shadow-xs transition-shadow hover:shadow-sm">
                {/* Header Row */}
                <div
                  className="flex items-start justify-between gap-2 cursor-pointer"
                  onClick={() => setExpandedId(isExpanded ? null : item.id)}
                >
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-lg bg-primary/10 text-primary text-xs font-extrabold flex items-center justify-center">
                      {item.num}
                    </span>
                    <span className="text-xs font-semibold text-muted-fg">
                      {item.start} – {item.end}
                    </span>
                  </div>

                  <span
                    className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${typeInfo.badgeCls}`}
                  >
                    {typeInfo.label}
                  </span>
                </div>

                {/* Subject Title */}
                <div className="mt-2">
                  <h4
                    onClick={(e) => {
                      e.stopPropagation()
                      onSubjectClick?.(item)
                    }}
                    className="text-sm font-bold text-fg hover:text-primary transition-colors cursor-pointer leading-snug"
                  >
                    {item.subject}
                  </h4>
                </div>

                {/* Location & Teacher Pill */}
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-fg">
                  {item.building && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        onBuildingClick?.(item.building)
                      }}
                      className="flex items-center gap-1 hover:text-fg font-medium"
                    >
                      <span>📍</span>
                      <span>{formatLocationDisplay(item.building, item.room)}</span>
                    </button>
                  )}

                  {item.teacher && (
                    <span className="flex items-center gap-1">
                      <span>👤</span>
                      <span>{item.teacher}</span>
                    </span>
                  )}
                </div>

                {/* Hardware-Accelerated Accordion: 0fr -> 1fr CSS Grid */}
                <div
                  className="hw-accordion-grid mt-2"
                  data-expanded={isExpanded ? "true" : "false"}
                >
                  <div className="hw-accordion-inner pt-2 border-t border-border/60">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          onNotesClick?.(item.id)
                        }}
                        className="px-2.5 py-1 text-xs font-semibold rounded-xl bg-muted text-fg hover:bg-muted/80 transition-colors"
                      >
                        📝 Заметки / ДЗ
                      </button>

                      {nextClassBuilding && nextClassBuilding !== item.building && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            onRouteClick?.(item.building, nextClassBuilding)
                          }}
                          className="px-2.5 py-1 text-xs font-semibold rounded-xl bg-amber-500/10 text-amber-800 dark:text-amber-300 border border-amber-500/25 flex items-center gap-1"
                        >
                          🚶 Маршрут до след. пары
                        </button>
                      )}

                      {(role === "headstudent" || role === "deputy_headstudent") && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            onManageClick?.(item.id)
                          }}
                          className="px-2.5 py-1 text-xs font-semibold rounded-xl bg-primary/10 text-primary border border-primary/20"
                        >
                          ⚙ Управление парой
                        </button>
                      )}

                      {onCrowdsourceClick && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            onCrowdsourceClick(item)
                          }}
                          className="px-2.5 py-1 text-xs font-semibold rounded-xl bg-amber-500/10 text-amber-800 dark:text-amber-300 border border-amber-500/25 flex items-center gap-1 hover:bg-amber-500/20 transition-colors cursor-pointer"
                        >
                          📣 Сообщить о переносе
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
