import React from "react"
import { I } from "@/shared/ui/Icons"
import type { ClassItem } from "@/entities/lesson/model/types"

export interface MovedAwayCardProps {
  cls: ClassItem
  toDay: string
  toNum: number
}

export function MovedAwayCard({ cls, toDay, toNum }: MovedAwayCardProps) {
  return (
    <div className="relative flex rounded-2xl overflow-hidden border border-border bg-card opacity-50">
      <div className="w-[3px] flex-shrink-0 bg-muted-fg" />
      <div className="flex-1 px-3.5 py-3 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span
            className="text-base font-mono text-muted-fg"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            {cls.num}
          </span>
          <span
            className="text-sm font-mono text-muted-fg line-through"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            {cls.start}–{cls.end}
          </span>
          <span className="ml-auto text-[11px] bg-muted text-muted-fg px-2 py-0.5 rounded-lg font-semibold flex items-center gap-1">
            {I.arrowRight(10)} {toDay?.slice(0, 2)}, п.{toNum}
          </span>
        </div>
        <p className="text-sm text-muted-fg line-through truncate">
          {cls.subject}
        </p>
      </div>
    </div>
  )
}
