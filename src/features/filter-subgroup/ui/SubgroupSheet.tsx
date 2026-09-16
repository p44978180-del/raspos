import React, { useState } from "react"
import { Sheet } from "../../../shared/ui/Sheet"
import type { SubgroupPref } from "../../../entities/lesson/model/types"

export interface SubgroupSheetProps {
  subject: string
  current: SubgroupPref
  onChange: (p: SubgroupPref) => void
  onClose: () => void
}

export function SubgroupSheet({
  subject,
  current,
  onChange,
  onClose,
}: SubgroupSheetProps) {
  const [val, setVal] = useState<SubgroupPref>(current)
  const opts: [SubgroupPref, string, string][] = [
    ["1", "1-я подгруппа", "Только пары 1-й"],
    ["2", "2-я подгруппа", "Только пары 2-й"],
    ["all", "Все подгруппы", "Оба варианта"],
  ]
  return (
    <Sheet onClose={onClose} title="Подгруппа">
      <div className="px-4 pb-8 space-y-2">
        <p className="text-xs text-muted-fg mb-3">«{subject}»</p>
        {opts.map(([v, label, sub]) => (
          <button
            key={v}
            onClick={() => setVal(v)}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl border transition-all cursor-pointer ${
              val === v
                ? "border-accent bg-muted"
                : "border-border bg-card hover:border-accent/40"
            }`}
          >
            <div
              className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                val === v ? "border-primary" : "border-border"
              }`}
            >
              {val === v && (
                <div className="w-2.5 h-2.5 rounded-full bg-primary" />
              )}
            </div>
            <div className="text-left flex-1">
              <p
                className={`text-sm font-semibold ${
                  val === v ? "text-primary" : "text-fg"
                }`}
              >
                {label}
              </p>
              <p className="text-xs text-muted-fg">{sub}</p>
            </div>
          </button>
        ))}
        <button
          onClick={() => {
            onChange(val)
            onClose()
          }}
          className="w-full mt-2 py-3 bg-primary text-white rounded-2xl text-sm font-bold hover:opacity-90 transition-opacity cursor-pointer"
        >
          Сохранить
        </button>
      </div>
    </Sheet>
  )
}
