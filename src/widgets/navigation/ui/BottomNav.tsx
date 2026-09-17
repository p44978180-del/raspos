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
  role?: "student" | "headstudent" | "deputy_headstudent" | "teacher"
  onRoleChange?: (r: "student" | "headstudent" | "deputy_headstudent" | "teacher") => void
}

export function BottomNav({ active, onChange, role, onRoleChange }: BottomNavProps) {
  const items: [Tab, (a: boolean) => React.ReactNode][] = [
    ["schedule", (a) => I.cal(22, a ? "text-primary" : "text-[#9CA3AF]")],
    ["campus",   (a) => I.map(22, a ? "text-primary" : "text-[#9CA3AF]")],
    ["events",   (a) => I.bell(22, a ? "text-primary" : "text-[#9CA3AF]")],
    ["profile",  (a) => I.user(22, a ? "text-primary" : "text-[#9CA3AF]")],
  ]

  const handleCycleRole = () => {
    if (!role || !onRoleChange) return
    const roles: ("student" | "headstudent" | "teacher")[] = ["student", "headstudent", "teacher"]
    const curIdx = roles.indexOf(role as any)
    const nextRole = roles[(curIdx + 1) % roles.length]
    onRoleChange(nextRole)
    try {
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        navigator.vibrate(10)
      }
    } catch {}
  }

  return (
    <nav
      className="flex-shrink-0 flex flex-col border-t border-border/60"
      style={{
        background: "var(--color-card)",
        paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 14px)",
      }}
    >
      {role && onRoleChange && (
        <div className="flex items-center justify-between px-4 py-1 border-b border-border/30 text-[10px]">
          <span className="text-muted-fg font-medium">Роль:</span>
          <button
            onClick={handleCycleRole}
            className="flex items-center gap-1.5 font-bold px-2.5 py-0.5 rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-all cursor-pointer active:scale-95"
            title="Нажмите для переключения роли"
          >
            <span>
              {role === "headstudent"
                ? "⭐ Староста"
                : role === "teacher"
                  ? "👨‍🏫 Преподаватель"
                  : role === "deputy_headstudent"
                    ? "🌟 Зам. старосты"
                    : "🎓 Студент"}
            </span>
            <span className="text-muted-fg text-[9px]">⇄</span>
          </button>
        </div>
      )}
      <div className="flex items-stretch justify-around px-1 pt-1.5">
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
      </div>
    </nav>
  )
}
