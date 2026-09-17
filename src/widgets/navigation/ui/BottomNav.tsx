import React from "react"
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
    ["schedule", (a) => I.cal(22, a ? "text-primary" : "text-[#9CA3AF]")],
    ["campus",   (a) => I.map(22, a ? "text-primary" : "text-[#9CA3AF]")],
    ["events",   (a) => I.bell(22, a ? "text-primary" : "text-[#9CA3AF]")],
    ["profile",  (a) => I.user(22, a ? "text-primary" : "text-[#9CA3AF]")],
  ]

  return (
    <nav
      className="flex-shrink-0 flex items-stretch justify-around border-t border-border/60 px-1 pt-1.5"
      style={{
        background: "var(--color-card)",
        paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 14px)",
      }}
    >
      {items.map(([id, icon]) => (
        <button
          key={id}
          onClick={() => onChange(id)}
          className="flex flex-col items-center gap-0.5 px-4 pt-1.5 pb-0.5 rounded-xl flex-1 cursor-pointer transition-colors"
        >
          {icon(active === id)}
          <span
            className={`text-[10px] font-semibold transition-colors ${
              active === id ? "text-primary" : "text-[#9CA3AF]"
            }`}
          >
            {TAB_TITLES[id]}
          </span>
          {active === id && (
            <div className="w-5 h-[2px] rounded-full bg-primary mt-0.5" style={{ animation: "tab-indicator .2s cubic-bezier(.22,1,.36,1) both" }} />
          )}
        </button>
      ))}
    </nav>
  )
}
