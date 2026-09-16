import React from "react"
import { I } from "@/shared/ui/Icons"
import { DORM_WALK } from "@/entities/lesson/lib/disciplineData"
import { getBldgGenitive } from "@/entities/lesson/lib/location"

export interface DormCardProps {
  dorm: string
  onDismiss: () => void
}

export function DormCard({ dorm, onDismiss }: DormCardProps) {
  const info = DORM_WALK[dorm]
  if (!info) return null
  const displayBldg = getBldgGenitive(info.building)

  return (
    <div className="mx-4 flex items-center gap-3 bg-muted border border-border rounded-2xl px-4 py-3">
      <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
        {I.route(18, "text-primary")}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-fg">
          До {displayBldg}: ~{info.min} мин
        </p>
        <p className="text-xs text-muted-fg mt-0.5">от {dorm}</p>
      </div>
      <button
        onClick={onDismiss}
        className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-xl hover:bg-border text-muted-fg hover:text-fg transition-colors cursor-pointer"
      >
        {I.close(14)}
      </button>
    </div>
  )
}
