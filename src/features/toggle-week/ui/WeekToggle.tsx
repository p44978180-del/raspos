import React from "react"
import { motion } from "framer-motion"
import { springPhysics } from "../../../shared/lib/spring-physics"
import type { WeekFilterMode } from "../../../entities/lesson/model/types"

export interface WeekToggleProps {
  mode: WeekFilterMode
  onChange: (mode: WeekFilterMode) => void
  currentIsOdd: boolean
}

export function WeekToggle({ mode, onChange, currentIsOdd }: WeekToggleProps) {
  const options: Array<{ id: WeekFilterMode; label: string; title: string }> = [
    {
      id: "current",
      label: `Текущая (${currentIsOdd ? "Верхн." : "Нижн."})`,
      title: "Отображать пары для текущей недели",
    },
    {
      id: "odd",
      label: "Верхняя",
      title: "Отображать только пары верхней недели (Числитель)",
    },
    {
      id: "even",
      label: "Нижняя",
      title: "Отображать только пары нижней недели (Знаменатель)",
    },
    {
      id: "all",
      label: "Все недели",
      title: "Отображать пары обеих недель",
    },
  ]

  return (
    <div className="px-4 mb-2">
      <div className="flex p-1 bg-muted/80 rounded-xl border border-border/80 text-xs font-semibold gap-1 relative">
        {options.map((opt) => {
          const isSelected = mode === opt.id
          return (
            <button
              key={opt.id}
              onClick={() => onChange(opt.id)}
              className={`relative flex-1 py-1.5 px-1.5 rounded-lg text-center cursor-pointer truncate z-10 transition-colors ${
                isSelected
                  ? opt.id === "odd"
                    ? "text-white font-bold"
                    : opt.id === "even"
                      ? "text-white font-bold"
                      : "text-fg font-bold"
                  : opt.id === "odd"
                    ? "text-muted-fg hover:text-sky-600 dark:hover:text-sky-400"
                    : opt.id === "even"
                      ? "text-muted-fg hover:text-amber-600 dark:hover:text-amber-400"
                      : "text-muted-fg hover:text-fg"
              }`}
              title={opt.title}
            >
              {isSelected && (
                <motion.div
                  layoutId="activePill"
                  className={`absolute inset-0 rounded-lg shadow-xs z-[-1] ${
                    opt.id === "odd"
                      ? "bg-sky-500"
                      : opt.id === "even"
                        ? "bg-amber-500"
                        : "bg-card border border-border/60"
                  }`}
                  transition={{
                    ...springPhysics.snappy,
                  }}
                />
              )}
              <span className="truncate">{opt.label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
