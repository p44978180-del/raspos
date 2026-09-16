import React, { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { springPhysics } from "../../../shared/lib/spring-physics"
import { I } from "../../../shared/ui/Icons"

export interface SubgroupDetail {
  subgroup: number
  teacher: string
  building: string
  room: string
}

export function SubgroupAccordion({
  subgroups,
}: {
  subgroups: SubgroupDetail[]
}) {
  const [isOpen, setIsOpen] = useState(false)

  if (!subgroups || subgroups.length === 0) return null

  return (
    <div className="mt-2 pt-1.5 border-t border-border/50">
      <button
        onClick={(e) => {
          e.stopPropagation()
          setIsOpen((prev) => !prev)
        }}
        className="w-full flex items-center justify-between text-xs text-muted-fg hover:text-fg py-1 cursor-pointer select-none"
      >
        <span className="font-semibold">Подгруппы ({subgroups.length})</span>
        <motion.div
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={springPhysics.instant}
        >
          {I.chev("down", 14)}
        </motion.div>
      </button>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            layout="position"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={springPhysics.instant}
            className="overflow-hidden space-y-1 pt-1"
          >
            {subgroups.map((sg) => (
              <div
                key={sg.subgroup}
                className="flex items-center justify-between text-[11px] bg-muted/60 dark:bg-muted/30 rounded-md px-2 py-1 gap-1.5"
              >
                <span className="font-bold text-primary text-[10px] px-1 py-0.5 rounded bg-primary/10">
                  {sg.subgroup} п/г
                </span>
                <span className="truncate text-muted-fg flex-1 font-medium">
                  {sg.teacher}
                </span>
                <span className="text-fg font-semibold flex-shrink-0">
                  {sg.building ? `${sg.building}, ` : ""}ауд. {sg.room}
                </span>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
