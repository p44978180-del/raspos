import React from "react"
import { motion } from "framer-motion"
import { springPhysics } from "@/shared/lib/spring-physics"
import { I } from "@/shared/ui/Icons"

export type Tab = "schedule" | "campus" | "events" | "profile"

export const TAB_TITLES: Record<Tab, string> = {
  schedule: "Расписание",
  campus: "Кампус",
  events: "События",
  profile: "Профиль",
}

export const TAB_ORDER: Tab[] = ["schedule", "campus", "events", "profile"]

export interface BottomNavProps {
  active: Tab
  onChange: (t: Tab) => void
}

export function BottomNav({ active, onChange }: BottomNavProps) {
  const items: [Tab, (a: boolean) => React.ReactNode][] = [
    ["schedule", (a) => I.cal(22, a ? "text-primary" : "text-[#7C7C7C]")],
    ["campus", (a) => I.map(22, a ? "text-primary" : "text-[#7C7C7C]")],
    ["events", (a) => I.bell(22, a ? "text-primary" : "text-[#7C7C7C]")],
    ["profile", (a) => I.user(22, a ? "text-primary" : "text-[#7C7C7C]")],
  ]
  const activeIndex = TAB_ORDER.indexOf(active)

  return (
    <nav
      className="flex-shrink-0 relative flex items-stretch justify-around border-t border-border px-1 pt-2"
      style={{
        backdropFilter: "blur(12px)",
        background: "color-mix(in srgb,var(--color-card) 80%,transparent)",
        paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 14px)",
      }}
    >
      {/* sliding pill indicator */}
      <div
        className="absolute top-1.5 left-0 right-0 flex px-1 pointer-events-none"
        style={{ height: "calc(100% - 22px)" }}
      >
        <div
          style={{
            width: `${100 / items.length}%`,
            transform: `translateX(${activeIndex * 100}%)`,
            transition: "transform 0.25s cubic-bezier(.22,1,.36,1)",
          }}
          className="rounded-xl bg-primary/8"
        />
      </div>
      {items.map(([id, icon]) => (
        <button
          key={id}
          onClick={() => onChange(id)}
          className="flex flex-col items-center gap-0.5 px-4 pt-1 pb-0.5 rounded-xl transition-all active:scale-95 relative flex-1 cursor-pointer"
        >
          {active === id && (
            <motion.div
              layoutId="navPill"
              className="absolute inset-1 rounded-xl bg-primary/10 -z-10"
              transition={springPhysics.snappy}
            />
          )}
          {icon(active === id)}
          <span
            className={`text-[10px] font-bold transition-colors ${
              active === id ? "text-primary" : "text-[#7C7C7C]"
            }`}
          >
            {TAB_TITLES[id]}
          </span>
          {active === id && (
            <div
              className="absolute bottom-0 left-1/2 -translate-x-1/2 w-6 h-0.5 rounded-full bg-primary"
              style={{
                animation: "tab-indicator .25s cubic-bezier(.22,1,.36,1) both",
              }}
            />
          )}
        </button>
      ))}
    </nav>
  )
}
