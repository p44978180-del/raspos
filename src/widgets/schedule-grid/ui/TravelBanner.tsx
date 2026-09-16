import React from "react"
import { calculateWalkBetween } from "../../../entities/campus/model/campusData"
import { I } from "../../../shared/ui/Icons"

export interface TravelBannerProps {
  from: string
  to: string
  breakMin: number
  onOpenNavigation?: (from: string, to: string) => void
}

export function TravelBanner({ from, to, breakMin, onOpenNavigation }: TravelBannerProps) {
  const walkInfo = calculateWalkBetween(from, to)
  if (!walkInfo) return null
  if (walkInfo.mins === 0) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-muted text-muted-fg text-xs font-medium mx-4">
        {I.bldg(12, "flex-shrink-0")}
        <span>В этом же корпусе</span>
      </div>
    )
  }
  const tight = walkInfo.mins >= breakMin - 3
  return (
    <div
      className={`flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl text-xs font-medium mx-4 ${
        tight
          ? "bg-amber-bg text-amber border border-amber/20"
          : "bg-muted text-muted-fg"
      }`}
    >
      <div
        onClick={() => onOpenNavigation?.(from, to)}
        className="flex items-center gap-2 min-w-0 cursor-pointer hover:opacity-85"
      >
        {I.route(13, "flex-shrink-0")}
        <span className="truncate">{walkInfo.text}</span>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {onOpenNavigation && (
          <button
            type="button"
            onClick={() => onOpenNavigation(from, to)}
            className="text-[11px] font-bold text-primary hover:opacity-80 cursor-pointer"
            title="Открыть умную навигацию между корпусами"
          >
            🧭 Навигатор
          </button>
        )}
        {walkInfo.routeUrl && (
          <a
            href={walkInfo.routeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] font-semibold text-muted-fg underline hover:opacity-80"
            title="Открыть пешеходный маршрут на Яндекс.Картах"
          >
            Карты →
          </a>
        )}
      </div>
    </div>
  )
}
