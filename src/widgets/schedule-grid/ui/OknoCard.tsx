import React from "react"
import { motion } from "framer-motion"
import { springPhysics } from "../../../shared/lib/spring-physics"
import { I } from "../../../shared/ui/Icons"

export interface OknoCardProps {
  from: string
  to: string
  gapMin: number
  onEat: () => void
  onRest: () => void
}

export function OknoCard({ from, to, gapMin, onEat, onRest }: OknoCardProps) {
  const h = Math.floor(gapMin / 60)
  const m = gapMin % 60
  const durationText = h > 0 ? `${h} ч. ${m > 0 ? `${m} мин.` : "00 мин."}` : `${m} мин.`

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={springPhysics.gentle}
      className="mx-4 my-2 rounded-2xl border-dashed border-2 border-amber-500/35 dark:border-amber-400/30 bg-amber-50/60 dark:bg-amber-950/20 px-4 py-3 space-y-2.5"
    >
      <div className="flex items-center gap-2">
        <span className="text-base flex-shrink-0">☕</span>
        <div>
          <p className="text-sm font-bold text-fg">
            Окно: {durationText}
          </p>
          <p className="text-xs text-muted-fg">
            {from} — {to}
          </p>
        </div>
      </div>
      <div className="flex gap-2">
        <button
          onClick={onEat}
          className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold bg-muted text-fg hover:bg-border rounded-xl py-2 transition-colors cursor-pointer"
        >
          {I.fork(14, "flex-shrink-0")} Где поесть
        </button>
        <button
          onClick={onRest}
          className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold bg-muted text-fg hover:bg-border rounded-xl py-2 transition-colors cursor-pointer"
        >
          {I.book(14, "flex-shrink-0")} Где переждать
        </button>
      </div>
    </motion.div>
  )
}
