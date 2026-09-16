import React from "react"
import { motion, AnimatePresence } from "framer-motion"
import { springPhysics } from "../../../shared/lib/spring-physics"
import { useFavoriteGroups } from "../model/useFavoriteGroups"

interface FavoriteGroupsBarProps {
  activeGroupId: string
  onSelect: (groupId: string) => void
}

/**
 * Horizontal scrollable bar of pinned/favourite groups.
 * Each chip animates in/out with spring physics.
 * Tap to switch group, long-press or ✕ to unpin.
 */
export function FavoriteGroupsBar({ activeGroupId, onSelect }: FavoriteGroupsBarProps) {
  const { favorites, removeFavorite } = useFavoriteGroups()

  if (favorites.length === 0) return null

  return (
    <div
      className="flex gap-1.5 overflow-x-auto px-4 pb-1 pt-0.5"
      style={{ scrollbarWidth: "none" }}
    >
      <AnimatePresence initial={false} mode="popLayout">
        {favorites.map((gId) => {
          const isActive = gId === activeGroupId
          return (
            <motion.div
              key={gId}
              layout
              initial={{ opacity: 0, scale: 0.8, x: -8 }}
              animate={{ opacity: 1, scale: 1, x: 0, transition: springPhysics.snappy }}
              exit={{ opacity: 0, scale: 0.7, x: -8, transition: springPhysics.instant }}
              className="flex-shrink-0"
            >
              <div
                className={`flex items-center gap-1 pl-2.5 pr-1.5 py-1 rounded-xl border text-xs font-bold cursor-pointer transition-colors active:scale-95 select-none ${
                  isActive
                    ? "bg-primary text-white border-primary shadow-sm"
                    : "bg-card border-border text-fg hover:border-primary/40 hover:bg-muted"
                }`}
              >
                <button
                  onClick={() => onSelect(gId)}
                  className="cursor-pointer whitespace-nowrap"
                >
                  {gId}
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    removeFavorite(gId)
                  }}
                  className={`ml-0.5 p-0.5 rounded-md transition-colors cursor-pointer ${
                    isActive
                      ? "text-white/60 hover:text-white hover:bg-white/20"
                      : "text-muted-fg hover:text-fg hover:bg-muted"
                  }`}
                  title={`Убрать ${gId} из избранного`}
                >
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 10 10"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  >
                    <line x1="2" y1="2" x2="8" y2="8" />
                    <line x1="8" y1="2" x2="2" y2="8" />
                  </svg>
                </button>
              </div>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
