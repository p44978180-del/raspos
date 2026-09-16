import React, { useState } from "react"
import { I } from "@/shared/ui/Icons"
import { Sheet } from "@/shared/ui/Sheet"
import { INSTITUTES_LIST } from "@/entities/institute/model/institutes"
import { getGroupMeta } from "@/entities/group/lib/groupMeta"
import { getRgauGroups, RGAU_TEACHERS } from "@/entities/lesson/lib/disciplineData"

export interface GroupSheetProps {
  current: string
  saved: string[]
  onSelect: (id: string) => void
  onDelete: (id: string) => void
  onClose: () => void
}

export function GroupSheet({
  current,
  saved,
  onSelect,
  onDelete,
  onClose,
}: GroupSheetProps) {
  const RGAU_GROUPS = getRgauGroups()
  const [viewMode, setViewMode] = useState<"hierarchy" | "search">("hierarchy")
  const [query, setQuery] = useState("")
  const [searchMode, setSearchMode] = useState<"group" | "teacher">("group")
  const [selectedInst, setSelectedInst] = useState<string>("agrobio")
  const [selectedCourse, setSelectedCourse] = useState<number>(1)

  const allList = searchMode === "group" ? RGAU_GROUPS : RGAU_TEACHERS
  const suggestions =
    query.length >= 1
      ? allList
          .filter((g: string) => g.toLowerCase().includes(query.toLowerCase()))
          .slice(0, 15)
      : []

  const hierarchyGroups = RGAU_GROUPS.filter((gId: string) => {
    const meta = getGroupMeta(gId)
    return meta.instId === selectedInst && meta.course === selectedCourse
  })

  function pick(id: string) {
    onSelect(id)
    onClose()
  }

  const currentMeta = getGroupMeta(current)
  const currentInst = INSTITUTES_LIST.find((i) => i.id === currentMeta.instId)

  return (
    <Sheet onClose={onClose} title="Выбор группы и расписания">
      <div className="px-4 pb-6 space-y-4">
        {/* Active Chosen Group Card */}
        <div className="flex items-center justify-between p-3.5 rounded-2xl bg-primary/10 border border-primary/30 shadow-xs">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-primary text-white flex items-center justify-center font-black text-sm flex-shrink-0 shadow-xs">
              {current.slice(0, 2)}
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold text-primary uppercase tracking-wider">
                Текущая выбранная группа
              </p>
              <p className="text-base font-bold text-fg truncate leading-tight mt-0.5">
                {current}
              </p>
              <p className="text-[11px] text-muted-fg truncate mt-0.5">
                {currentInst?.name || "РГАУ-МСХА им. К.А. Тимирязева"} · {currentMeta.course} курс
              </p>
            </div>
          </div>
          <span className="text-xs font-bold text-primary px-2.5 py-1 rounded-full bg-primary/15 border border-primary/20 flex-shrink-0">
            Активна
          </span>
        </div>

        {/* View Mode Switcher: Hierarchy vs Search */}
        <div className="flex bg-muted rounded-xl p-0.5 gap-0.5 text-xs font-bold">
          <button
            onClick={() => setViewMode("hierarchy")}
            className={`flex-1 py-2 rounded-lg transition-all cursor-pointer inline-flex items-center justify-center gap-1.5 ${
              viewMode === "hierarchy"
                ? "bg-card text-fg shadow-xs font-extrabold"
                : "text-muted-fg hover:text-fg font-semibold"
            }`}
          >
            {I.academicCap(14)}
            <span>По институтам</span>
          </button>
          <button
            onClick={() => setViewMode("search")}
            className={`flex-1 py-2 rounded-lg transition-all cursor-pointer inline-flex items-center justify-center gap-1.5 ${
              viewMode === "search"
                ? "bg-card text-fg shadow-xs font-extrabold"
                : "text-muted-fg hover:text-fg font-semibold"
            }`}
          >
            {I.search(13)}
            <span>Быстрый поиск ({RGAU_GROUPS.length})</span>
          </button>
        </div>

        {viewMode === "hierarchy" ? (
          <div className="space-y-3.5">
            {/* 1. Institute Selector */}
            <div>
              <p className="text-xs font-semibold text-muted-fg mb-1.5">
                1. Выберите институт:
              </p>
              <div className="grid grid-cols-2 gap-1.5 max-h-44 overflow-y-auto pr-0.5">
                {INSTITUTES_LIST.map((inst) => {
                  const isSel = selectedInst === inst.id
                  return (
                    <button
                      key={inst.id}
                      onClick={() => setSelectedInst(inst.id)}
                      className={`text-left p-2.5 rounded-xl text-xs border transition-all cursor-pointer ${
                        isSel
                          ? "bg-primary text-white border-primary shadow-xs font-bold"
                          : "bg-card border-border hover:bg-muted text-fg"
                      }`}
                      title={inst.name}
                    >
                      <p className="font-bold truncate">{inst.short}</p>
                      <p
                        className={`text-[10px] truncate ${
                          isSel ? "text-white/80" : "text-muted-fg"
                        }`}
                      >
                        {inst.name}
                      </p>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* 2. Course Selector */}
            <div>
              <p className="text-xs font-semibold text-muted-fg mb-1.5">
                2. Выберите курс:
              </p>
              <div className="grid grid-cols-5 gap-1">
                {[
                  { c: 1, label: "1 курс" },
                  { c: 2, label: "2 курс" },
                  { c: 3, label: "3 курс" },
                  { c: 4, label: "4 курс" },
                  { c: 5, label: "5 курс / Маг." },
                ].map(({ c, label }) => {
                  const isSel = selectedCourse === c
                  return (
                    <button
                      key={c}
                      onClick={() => setSelectedCourse(c)}
                      className={`py-2 px-1 rounded-xl text-xs font-bold border transition-all cursor-pointer text-center ${
                        isSel
                          ? "bg-primary text-white border-primary shadow-xs"
                          : "bg-card border-border hover:bg-muted text-fg"
                      }`}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* 3. Group Buttons */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-xs font-semibold text-muted-fg">
                  3. Выберите группу ({hierarchyGroups.length}):
                </p>
              </div>
              {hierarchyGroups.length > 0 ? (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5 max-h-56 overflow-y-auto pr-0.5">
                  {hierarchyGroups.map((gId: string) => {
                    const isCur = gId === current
                    return (
                      <button
                        key={gId}
                        onClick={() => pick(gId)}
                        className={`p-2 rounded-xl text-xs font-bold border text-center transition-all cursor-pointer truncate ${
                          isCur
                            ? "bg-primary text-white border-primary shadow-xs ring-2 ring-primary/40"
                            : "bg-card border-border hover:border-primary/40 hover:bg-muted text-fg"
                        }`}
                        title={gId}
                      >
                        {gId}
                      </button>
                    )
                  })}
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-muted/60 text-center text-xs text-muted-fg">
                  В выбранном курсе нет групп для данного института. Попробуйте
                  другой курс или воспользуйтесь поиском.
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex bg-card rounded-xl p-0.5 gap-0.5">
              {(["group", "teacher"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => {
                    setSearchMode(m)
                    setQuery("")
                  }}
                  className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                    searchMode === m
                      ? "bg-primary text-white"
                      : "text-muted-fg hover:text-fg"
                  }`}
                >
                  {m === "group"
                    ? `Группы (${RGAU_GROUPS.length})`
                    : "Преподаватели"}
                </button>
              ))}
            </div>

            <div className="relative">
              <div className="flex items-center gap-2 border border-border bg-card rounded-xl px-3 py-2.5 focus-within:border-primary transition-colors">
                {I.search(14, "text-muted-fg flex-shrink-0")}
                <input
                  key={searchMode}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={
                    searchMode === "group"
                      ? "Введите номер группы (например, ДА 01-26, ДЭ 17-26)..."
                      : "Введите фамилию преподавателя..."
                  }
                  className="flex-1 text-sm bg-transparent outline-none text-fg placeholder:text-muted-fg"
                  autoFocus
                />
                {query && (
                  <button
                    onClick={() => setQuery("")}
                    className="text-muted-fg hover:text-fg cursor-pointer"
                  >
                    {I.close(13)}
                  </button>
                )}
              </div>

              {suggestions.length > 0 && (
                <div className="mt-2 bg-card border border-border rounded-2xl shadow-lg overflow-hidden max-h-56 overflow-y-auto">
                  {suggestions.map((g: string) => (
                    <button
                      key={g}
                      onClick={() => pick(g)}
                      className="w-full text-left px-4 py-2.5 text-sm font-semibold text-fg hover:bg-muted transition-colors border-b border-border last:border-0 flex items-center justify-between cursor-pointer"
                    >
                      <span>{g}</span>
                      <span className="text-xs text-primary font-bold">
                        Выбрать →
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {query.length >= 2 && suggestions.length === 0 && (
              <div className="text-center py-4 text-xs text-muted-fg">
                Ничего не найдено по запросу «{query}»
              </div>
            )}
          </div>
        )}
      </div>
    </Sheet>
  )
}
