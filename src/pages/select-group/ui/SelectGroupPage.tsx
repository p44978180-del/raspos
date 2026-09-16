import React, { useState } from "react"
import { I } from "@/shared/ui/Icons"
import { getRgauGroups, RGAU_TEACHERS } from "@/entities/lesson/lib/disciplineData"

export interface SelectGroupPageProps {
  onDone: (value: string, mode: "student" | "teacher") => void
}

export function SelectGroupPage({ onDone }: SelectGroupPageProps) {
  const RGAU_GROUPS = getRgauGroups()
  const [mode, setMode] = useState<"student" | "teacher">("student")
  const [query, setQuery] = useState("")
  const isStudent = mode === "student"
  const list = isStudent ? RGAU_GROUPS : RGAU_TEACHERS
  const suggestions =
    query.length >= 1
      ? (() => {
          const q = query.toLowerCase()
          const p = list.filter((g: string) => g.toLowerCase().startsWith(q))
          const r = list.filter(
            (g: string) =>
              !g.toLowerCase().startsWith(q) && g.toLowerCase().includes(q),
          )
          return [...p, ...r].slice(0, 8)
        })()
      : []

  function pick(v: string) {
    onDone(v, mode)
  }

  return (
    <div
      className="min-h-[100dvh] w-full flex flex-col items-center justify-center px-4 py-8 gap-5 animate-fade-in overflow-y-auto"
      style={{ background: "var(--color-bg)" }}
    >
      <div className="text-center space-y-1">
        <div className="w-20 h-20 rounded-3xl bg-primary flex items-center justify-center mx-auto mb-4 animate-bounce-in shadow-lg shadow-primary/25">
          <span className="text-3xl">🌾</span>
        </div>
        <h1 className="text-2xl font-extrabold text-fg animate-slide-up">
          РГАУ-МСХА
        </h1>
        <p className="text-sm text-muted-fg animate-fade-in">
          им. К.А. Тимирязева · с 1865 года
        </p>
      </div>
      <div className="w-full max-w-xs space-y-4">
        <div className="flex bg-muted rounded-2xl p-1 gap-1">
          {(["student", "teacher"] as const).map((m) => (
            <button
              key={m}
              onClick={() => {
                setMode(m)
                setQuery("")
              }}
              className={`flex-1 py-2 text-sm font-bold rounded-xl transition-all cursor-pointer ${
                mode === m
                  ? "bg-primary text-white shadow-sm"
                  : "text-muted-fg hover:text-fg"
              }`}
            >
              {m === "student" ? "Студент" : "Преподаватель"}
            </button>
          ))}
        </div>
        <div className="space-y-2">
          <p className="text-sm font-semibold text-fg text-center">
            {isStudent ? "Введите свою группу" : "Введите ваше имя"}
          </p>
          <div className="relative">
            <div className="flex items-center gap-2 border-2 border-border bg-card rounded-2xl px-4 py-3 focus-within:border-accent transition-colors">
              {I.search(16, "text-muted-fg flex-shrink-0")}
              <input
                key={mode}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={
                  isStudent
                    ? "Например ДЭ-17-26..."
                    : "Например Иванова М.С...."
                }
                className="flex-1 text-sm bg-transparent outline-none text-fg placeholder:text-muted-fg font-medium"
                autoFocus
              />
              {query && (
                <button
                  onClick={() => setQuery("")}
                  className="text-muted-fg hover:text-fg cursor-pointer"
                >
                  {I.close(14)}
                </button>
              )}
            </div>
            {suggestions.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-2xl shadow-lg overflow-hidden z-10">
                {suggestions.map((g) => (
                  <button
                    key={g}
                    onClick={() => pick(g)}
                    className="w-full text-left px-4 py-3 text-sm font-bold text-fg hover:bg-muted transition-colors border-b border-border last:border-0 cursor-pointer"
                  >
                    {g}
                  </button>
                ))}
              </div>
            )}
          </div>
          {query.length > 0 && suggestions.length === 0 && (
            <button
              onClick={() => pick(query)}
              className="w-full py-3 bg-primary text-white font-bold rounded-2xl text-sm hover:opacity-90 transition-opacity cursor-pointer"
            >
              Продолжить: «{query}»
            </button>
          )}
          {!query && (
            <div className="space-y-3 animate-fade-in">
              <p className="text-xs text-muted-fg text-center">
                Начните вводить или выберите из популярных
              </p>
              <div className="space-y-1.5">
                {isStudent
                  ? [
                      ["ДА", "ДА 01-26", "Агробиотехнология"],
                      ["ДЭ", "ДЭ 17-26", "Экономика и финансы"],
                      ["ТТ", "ТТ 11-26", "Механика и мобильные системы"],
                      ["ЗУ", "ЗУ 11-26", "Землеустройство и кадастры"],
                    ].map(([abbr, g, hint]) => (
                      <button
                        key={g}
                        onClick={() => pick(g)}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border border-border bg-card hover:border-accent/50 hover:bg-muted/30 transition-all text-left cursor-pointer"
                      >
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <span className="text-xs font-extrabold text-primary">
                            {abbr}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-fg">{g}</p>
                          <p className="text-[11px] text-muted-fg">{hint}</p>
                        </div>
                        {I.arrowRight(12, "text-muted-fg")}
                      </button>
                    ))
                  : ["Иванова М.С.", "Петров А.Н.", "Смирнов Г.К."].map((t) => (
                      <button
                        key={t}
                        onClick={() => pick(t)}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border border-border bg-card hover:border-accent/50 hover:bg-muted/30 transition-all text-left cursor-pointer"
                      >
                        <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                          <span className="text-xs font-extrabold text-white">
                            {t.split(" ")[0].slice(0, 2)}
                          </span>
                        </div>
                        <p className="text-sm font-bold text-fg flex-1">{t}</p>
                        {I.arrowRight(12, "text-muted-fg")}
                      </button>
                    ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
