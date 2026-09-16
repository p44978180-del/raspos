import React from "react"
import { I } from "../../../shared/ui/Icons"

export interface SearchBarProps {
  value: string
  onChange: (v: string) => void
  placeholder?: string
}

export function SearchBar({
  value,
  onChange,
  placeholder,
}: SearchBarProps) {
  return (
    <div className="search-spring-enter relative mx-4 mb-2">
      {I.search(
        15,
        "absolute left-3 top-1/2 -translate-y-1/2 text-muted-fg pointer-events-none",
      )}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? "Поиск..."}
        className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-border bg-card text-sm placeholder:text-muted-fg focus:outline-none focus:border-accent transition-colors shadow-sm"
        autoFocus
      />
    </div>
  )
}
