import React, { useState } from "react"
import { I } from "@/shared/ui/Icons"
import { fmtDate } from "@/entities/lesson/lib/getStudyWeek"
import { getAppEvents } from "@/entities/campus/model/campusData"
import type { AppEvent, EventCat } from "@/entities/campus/model/types"
import type { UserRole } from "@/entities/lesson/model/types"
import type { TimacadFeedItem } from "@/data/timacadFeedData"

export interface NewsPageProps {
  role: UserRole
  customEvents: AppEvent[]
  onAddEvent: (e: AppEvent) => void
  onEditEvent: (e: AppEvent) => void
  onDeleteEvent: (id: number) => void
  pinnedNote: string
  onPinnedNote: (n: string) => void
  search: string
  onOpenSyncModal?: () => void
  lastSyncDisplay?: string
  feedItems?: TimacadFeedItem[]
}

export function NewsPage({
  role,
  customEvents,
  onAddEvent,
  onEditEvent,
  onDeleteEvent,
  pinnedNote,
  onPinnedNote,
  search,
  onOpenSyncModal,
  lastSyncDisplay,
  feedItems,
}: NewsPageProps) {
  const [filter, setFilter] = useState<EventCat>("all")
  const [showAllEvents, setShowAllEvents] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [editingNote, setEditingNote] = useState(false)
  const [draftNote, setDraftNote] = useState(pinnedNote)
  const [form, setForm] = useState({
    title: "",
    date: "",
    place: "",
    category: "faculty" as EventCat,
  })
  const cats: [EventCat, string][] = [
    ["all", "Все"],
    ["news", "Новости РГАУ"],
    ["announcement", "Анонсы"],
    ["profcom", "Профком"],
    ["faculty", "Факультет"],
    ["science", "Наука"],
    ["sport", "Спорт"],
    ["career", "Карьера"],
  ]
  const baseList = getAppEvents(feedItems)
  const allEvents = [...baseList, ...customEvents]
  const q = search.toLowerCase().trim()
  const filtered = allEvents.filter((e) => {
    const matchCat = filter === "all" || e.category === filter
    const matchSearch =
      !q ||
      e.title.toLowerCase().includes(q) ||
      e.place.toLowerCase().includes(q) ||
      (e.summary && e.summary.toLowerCase().includes(q)) ||
      (e.sourceName && e.sourceName.toLowerCase().includes(q))
    return matchCat && matchSearch
  })
  const isLimited = !showAllEvents && filter === "all" && !q
  const displayList = isLimited ? filtered.slice(0, 3) : filtered
  const catChip: Record<string, string> = {
    news: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25",
    announcement:
      "bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/25",
    profcom:
      "bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/25",
    faculty: "bg-muted text-primary border border-border",
    science: "bg-blue-bg text-blue border border-blue/20",
    sport: "bg-amber-bg text-amber border border-amber/20",
    career:
      "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border border-indigo-500/25",
  }
  const catLabel: Record<string, string> = {
    news: "Новости",
    announcement: "Анонс",
    profcom: "Профком",
    faculty: "Факультет",
    science: "Наука",
    sport: "Спорт",
    career: "Карьера",
  }
  const isHead = role === "headstudent"

  function submitAdd() {
    if (!form.title.trim() || !form.date.trim()) return
    onAddEvent({
      id: Date.now(),
      title: form.title,
      date: form.date,
      place: form.place || "—",
      category: form.category,
    })
    setForm({ title: "", date: "", place: "", category: "faculty" })
    setAddOpen(false)
  }
  function startEdit(ev: AppEvent) {
    setEditId(ev.id)
    setForm({
      title: ev.title,
      date: ev.date,
      place: ev.place,
      category: ev.category,
    })
  }
  function submitEdit() {
    if (editId === null) return
    onEditEvent({
      id: editId,
      title: form.title,
      date: form.date,
      place: form.place,
      category: form.category,
    })
    setEditId(null)
  }

  return (
    <div className="px-4 pt-1 pb-2 space-y-3">
      {/* Official Timacad Sync Bar */}
      <div className="flex items-center justify-between p-3 rounded-2xl bg-card border border-border/80 shadow-xs">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-xs font-bold text-fg truncate">
              Сверка с порталом timacad.ru
            </p>
            <p className="text-[10px] text-muted-fg truncate">
              {lastSyncDisplay || "Синхронизировано"} · 18 официальных
              источников
            </p>
          </div>
        </div>
        {onOpenSyncModal && (
          <button
            onClick={onOpenSyncModal}
            className="px-2.5 py-1.5 rounded-xl bg-primary/10 text-primary text-xs font-bold hover:bg-primary/20 transition-colors flex-shrink-0 cursor-pointer"
          >
            Источники ↗
          </button>
        )}
      </div>

      {(pinnedNote || isHead) && (
        <div className="bg-amber-bg border border-amber/20 rounded-2xl px-4 py-3">
          {editingNote ? (
            <div className="space-y-2">
              <textarea
                value={draftNote}
                onChange={(e) => setDraftNote(e.target.value)}
                placeholder="Важная информация для группы..."
                className="w-full bg-transparent text-sm text-fg outline-none resize-none"
                rows={3}
                autoFocus
              />
              <div className="flex gap-2">
                <button
                  onClick={() => setEditingNote(false)}
                  className="text-xs font-semibold text-muted-fg cursor-pointer"
                >
                  Отмена
                </button>
                <button
                  onClick={() => {
                    onPinnedNote(draftNote)
                    setEditingNote(false)
                  }}
                  className="text-xs font-bold text-primary cursor-pointer"
                >
                  Сохранить
                </button>
              </div>
            </div>
          ) : pinnedNote ? (
            <div className="flex items-start gap-2">
              <div className="flex-1">
                <p className="text-xs font-bold text-amber uppercase tracking-wide mb-1">
                  Важно от старосты
                </p>
                <p className="text-sm text-fg">{pinnedNote}</p>
              </div>
              {isHead && (
                <div className="flex gap-1 flex-shrink-0">
                  <button
                    onClick={() => {
                      setDraftNote(pinnedNote)
                      setEditingNote(true)
                    }}
                    className="w-7 h-7 flex items-center justify-center rounded-xl hover:bg-amber/20 text-muted-fg cursor-pointer"
                  >
                    {I.pencil(12)}
                  </button>
                  <button
                    onClick={() => onPinnedNote("")}
                    className="w-7 h-7 flex items-center justify-center rounded-xl hover:bg-red-bg text-muted-fg hover:text-red cursor-pointer"
                  >
                    {I.close(12)}
                  </button>
                </div>
              )}
            </div>
          ) : isHead ? (
            <button
              onClick={() => {
                setDraftNote("")
                setEditingNote(true)
              }}
              className="flex items-center gap-2 text-sm font-semibold text-amber w-full cursor-pointer"
            >
              {I.plus(14, "text-amber")} Добавить важную заметку для группы
            </button>
          ) : null}
        </div>
      )}
      <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
        {cats.map(([id, label]) => (
          <button
            key={id}
            onClick={() => setFilter(id)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap border transition-all cursor-pointer ${
              filter === id
                ? "bg-primary text-white border-primary shadow-xs"
                : "bg-card border-border text-muted-fg hover:border-accent/40 hover:text-fg"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {filtered.length === 0 ? (
        <p className="text-sm text-muted-fg text-center py-12">Событий нет</p>
      ) : (
        <div className="space-y-2.5">
          {displayList.map((ev, idx) => {
            const isCustom = customEvents.some((c) => c.id === ev.id)
            const isEditing = editId === ev.id
            if (isEditing)
              return (
                <div
                  key={ev.id}
                  className="bg-card border border-accent rounded-2xl p-4 space-y-2"
                >
                  <input
                    value={form.title}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, title: e.target.value }))
                    }
                    placeholder="Название"
                    className="w-full border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-accent bg-card text-fg"
                  />
                  <input
                    value={form.date}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, date: e.target.value }))
                    }
                    placeholder="ГГГГ-ММ-ДД"
                    className="w-full border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-accent bg-card text-fg font-mono"
                  />
                  <input
                    value={form.place}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, place: e.target.value }))
                    }
                    placeholder="Место проведения"
                    className="w-full border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-accent bg-card text-fg"
                  />
                  <select
                    value={form.category}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        category: e.target.value as any,
                      }))
                    }
                    className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-card text-fg focus:outline-none focus:border-accent"
                  >
                    <option value="faculty">Факультетские</option>
                    <option value="science">Наука</option>
                    <option value="sport">Спорт</option>
                    <option value="news">Новости</option>
                    <option value="announcement">Анонсы</option>
                    <option value="profcom">Профком</option>
                  </select>
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => setEditId(null)}
                      className="flex-1 py-2 rounded-xl border border-border text-sm font-semibold text-muted-fg cursor-pointer"
                    >
                      Отмена
                    </button>
                    <button
                      onClick={submitEdit}
                      className="flex-1 py-2 bg-primary text-white rounded-xl text-sm font-bold cursor-pointer"
                    >
                      Сохранить
                    </button>
                  </div>
                </div>
              )
            return (
              <div
                key={ev.id}
                className="stagger-card bg-card border border-border rounded-2xl p-4 hover:border-accent/40 transition-all hover:shadow-sm active:scale-[0.99]"
                style={{ animationDelay: `${idx * 40}ms` }}
              >
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <p className="text-sm font-bold text-fg leading-snug">
                    {ev.title}
                  </p>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-md font-semibold ${
                        catChip[ev.category] || "bg-muted text-fg"
                      }`}
                    >
                      {catLabel[ev.category] || ev.category}
                    </span>
                    {isHead && (
                      <button
                        onClick={() => startEdit(ev)}
                        className="p-1 rounded-lg hover:bg-muted text-muted-fg cursor-pointer"
                      >
                        {I.pencil(11)}
                      </button>
                    )}
                    {isHead && isCustom && (
                      <button
                        onClick={() => onDeleteEvent(ev.id)}
                        className="p-1 rounded-lg hover:bg-red-bg text-muted-fg hover:text-red cursor-pointer"
                      >
                        {I.trash(11)}
                      </button>
                    )}
                  </div>
                </div>

                {ev.summary && (
                  <p className="text-xs text-muted-fg mb-2 line-clamp-2">
                    {ev.summary}
                  </p>
                )}
                <div className="flex items-center justify-between text-xs text-muted-fg mt-2 pt-2 border-t border-border/60">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1">
                      {I.clock(11)}
                      <span className="font-mono">{fmtDate(ev.date)}</span>
                    </span>
                    <span className="flex items-center gap-1">
                      {I.map(11)}
                      <span className="truncate max-w-[120px]">
                        {ev.place}
                      </span>
                    </span>
                  </div>
                  {ev.sourceUrl && (
                    <a
                      href={ev.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-bold text-primary hover:underline flex items-center gap-1"
                    >
                      <span>Источник</span>
                      <span>↗</span>
                    </a>
                  )}
                </div>
              </div>
            )
          })}
          {isLimited && filtered.length > 3 && (
            <button
              onClick={() => setShowAllEvents(true)}
              className="w-full py-2.5 rounded-xl border border-border bg-card hover:bg-muted text-xs font-semibold text-primary transition-all duration-200 text-center cursor-pointer shadow-xs"
            >
              Показать все события ({filtered.length})
            </button>
          )}
        </div>
      )}
      {isHead &&
        (addOpen ? (
          <div className="bg-card border border-accent rounded-2xl p-4 space-y-2">
            <p className="text-sm font-bold text-fg">Новое событие</p>
            <input
              value={form.title}
              onChange={(e) =>
                setForm((f) => ({ ...f, title: e.target.value }))
              }
              placeholder="Название события"
              className="w-full border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-accent bg-card text-fg"
            />
            <input
              value={form.date}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              placeholder="Дата (2026-09-15)"
              className="w-full border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-accent bg-card text-fg"
            />
            <input
              value={form.place}
              onChange={(e) =>
                setForm((f) => ({ ...f, place: e.target.value }))
              }
              placeholder="Место проведения"
              className="w-full border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-accent bg-card text-fg"
            />
            <div className="flex gap-1.5 flex-wrap">
              {(["faculty", "science", "sport"] as AppEvent["category"][]).map(
                (c) => (
                  <button
                    key={c}
                    onClick={() => setForm((f) => ({ ...f, category: c }))}
                    className={`px-2.5 py-1 text-xs font-semibold rounded-xl border transition-all cursor-pointer ${
                      form.category === c
                        ? "bg-primary text-white border-primary"
                        : "bg-muted border-border text-muted-fg"
                    }`}
                  >
                    {catLabel[c]}
                  </button>
                ),
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setAddOpen(false)}
                className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold text-muted-fg cursor-pointer"
              >
                Отмена
              </button>
              <button
                onClick={submitAdd}
                className="flex-1 py-2.5 bg-primary text-white rounded-xl text-sm font-bold cursor-pointer"
              >
                Добавить
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setAddOpen(true)}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border border-dashed border-accent/40 text-sm font-semibold text-primary hover:bg-muted/30 transition-colors cursor-pointer"
          >
            {I.plus(14)} Добавить событие
          </button>
        ))}
    </div>
  )
}
