import React from "react"
import { I } from "../../../shared/ui/Icons"

export interface ThemeToggleProps {
  dark: boolean
  onToggle: (e?: React.MouseEvent) => void
}

export function ThemeToggle({ dark, onToggle }: ThemeToggleProps) {
  return (
    <button
      onClick={onToggle}
      className="p-2 rounded-xl bg-card border border-border text-muted-fg hover:text-fg transition-colors cursor-pointer"
      title={dark ? "Включить светлую тему" : "Включить тёмную тему"}
      aria-label="Переключить тему"
    >
      {dark ? I.sun(18) : I.moon(18)}
    </button>
  )
}
