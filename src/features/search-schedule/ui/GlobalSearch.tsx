import React from "react"
import CampusBadge from "../../../components/CampusMapPins"
import { FOOD_SPOTS, BUILDING_DETAILS, getAppEvents } from "../../../entities/campus/model/campusData"
import type { DaySchedule } from "../../../entities/lesson/model/types"

export interface GlobalSearchProps {
  query: string
  onClose: () => void
  allDays?: DaySchedule[]
}

const fmtDate = (ds: string) =>
  new Date(ds + "T00:00:00").toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  })

export function GlobalSearch({
  query,
  onClose,
  allDays = [],
}: GlobalSearchProps) {
  const q = query.toLowerCase().trim()
  if (!q) return null

  const classResults = allDays
    .flatMap((d) => d.classes)
    .filter((c, i, arr) => arr.findIndex((x) => x.subject === c.subject) === i)
    .filter(
      (c) =>
        c.subject.toLowerCase().includes(q) ||
        c.teacher.toLowerCase().includes(q) ||
        c.building.toLowerCase().includes(q),
    )

  const foodResults = FOOD_SPOTS.filter(
    (f) =>
      f.name.toLowerCase().includes(q) ||
      (f.building ?? f.proximity ?? "").toLowerCase().includes(q),
  )

  const bldgResults = Object.entries(BUILDING_DETAILS).filter(
    ([, b]) =>
      b.name.toLowerCase().includes(q) || b.address.toLowerCase().includes(q),
  )

  const eventResults = getAppEvents().filter(
    (e) =>
      e.title.toLowerCase().includes(q) || e.place.toLowerCase().includes(q),
  )

  const total =
    classResults.length +
    foodResults.length +
    bldgResults.length +
    eventResults.length

  return (
    <div
      className="absolute inset-0 z-30 overflow-y-auto animate-fade-in"
      style={{ background: "var(--color-bg)" }}
    >
      <div className="px-4 pt-3 pb-6 space-y-4">
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs text-muted-fg">
            {total > 0 ? `Найдено: ${total}` : "Ничего не найдено"}
          </p>
          <button
            onClick={onClose}
            className="text-xs text-primary font-semibold cursor-pointer"
          >
            Закрыть
          </button>
        </div>

        {classResults.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-bold text-muted-fg uppercase tracking-wide">
              Дисциплины
            </p>
            {classResults.map((c) => (
              <div
                key={c.id}
                className="bg-card border border-border rounded-2xl px-4 py-3"
              >
                <p className="text-sm font-bold text-fg">{c.subject}</p>
                <p className="text-xs text-muted-fg mt-0.5">{c.teacher}</p>
                <p className="text-xs text-muted-fg">
                  {c.building}, ауд. {c.room}
                </p>
              </div>
            ))}
          </div>
        )}

        {eventResults.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-bold text-muted-fg uppercase tracking-wide">
              События
            </p>
            {eventResults.map((e) => (
              <div
                key={e.id}
                className="bg-card border border-border rounded-2xl px-4 py-3"
              >
                <p className="text-sm font-bold text-fg">{e.title}</p>
                <p className="text-xs text-muted-fg">
                  {e.place} · {fmtDate(e.date)}
                </p>
              </div>
            ))}
          </div>
        )}

        {bldgResults.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-bold text-muted-fg uppercase tracking-wide">
              Корпуса
            </p>
            {bldgResults.map(([key, b], bi) => (
              <div
                key={key}
                className="stagger-card bg-card border border-border rounded-2xl px-4 py-3 flex items-center gap-3 hover:border-accent/40 transition-colors"
                style={{ animationDelay: `${bi * 30}ms` }}
              >
                <CampusBadge
                  category="academic"
                  label={b.short.replace(/[^\d]/g, "") || "1"}
                  size={32}
                  className="flex-shrink-0"
                />
                <div>
                  <p className="text-sm font-bold text-fg">{b.name}</p>
                  <p className="text-xs text-muted-fg">{b.address}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {foodResults.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-bold text-muted-fg uppercase tracking-wide">
              Где поесть
            </p>
            {foodResults.map((f, fi) => (
              <div
                key={f.id}
                className="stagger-card bg-card border border-border rounded-2xl px-4 py-3 flex items-center gap-3 hover:border-accent/40 transition-colors"
                style={{ animationDelay: `${fi * 30}ms` }}
              >
                <CampusBadge
                  category="dining"
                  size={32}
                  className="flex-shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-fg">{f.name}</p>
                  <p className="text-xs text-muted-fg">
                    {f.building ?? f.proximity}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
