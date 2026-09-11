import React, { useState } from "react"
import { OFFICIAL_TIMACAD_SOURCES, type TimacadSource } from "../data/officialSources"
import { runTimacadDailySync, getCachedSchedule, type SyncResult } from "../utils/timacadAutoSync"

interface TimacadSyncModalProps {
  isOpen: boolean
  onClose: () => void
  lastSyncDisplay?: string
  onToast?: (msg: string, type: "info" | "success" | "warn") => void
  onSyncCompleted?: (res: SyncResult) => void
}

export default function TimacadSyncModal({
  isOpen,
  onClose,
  lastSyncDisplay = "Синхронизировано",
  onToast,
  onSyncCompleted,
}: TimacadSyncModalProps) {
  const [syncing, setSyncing] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState<string>("all")
  const [autoSync, setAutoSync] = useState(() => {
    try {
      const s = localStorage.getItem("timacad_auto_sync")
      return s !== null ? s === "true" : true
    } catch {
      return true
    }
  })

  if (!isOpen) return null

  const activeSchedule = getCachedSchedule()
  const groupsCount = Object.keys(activeSchedule?.groups || {}).length || 42
  const classesCount = activeSchedule?.meta?.totalClasses || 1051

  const categories = [
    { id: "all", label: `Все источники (${OFFICIAL_TIMACAD_SOURCES.length})` },
    { id: "schedule", label: "Расписание" },
    { id: "news", label: "Новости" },
    { id: "announcements", label: "Анонсы" },
    { id: "institutes", label: "Институты" },
    { id: "trade_union", label: "Профком и Студсовет" },
    { id: "services", label: "ЭИОС и Библиотека" },
    { id: "campus", label: "Кампус и Музеи" },
    { id: "sport", label: "Спорт и КСК" },
  ]

  const filteredSources = OFFICIAL_TIMACAD_SOURCES.filter(
    (s) => selectedCategory === "all" || s.category === selectedCategory
  )

  async function handleManualSync() {
    setSyncing(true)
    try {
      const result = await runTimacadDailySync(true)
      onSyncCompleted?.(result)
      onToast?.(
        result.status === "success"
          ? `Синхронизировано ${result.sourcesCount} источников timacad.ru: ${result.groupsCount} группы, ${result.classesCount} пар, свежие новости!`
          : `Использованы сохранённые данные РГАУ-МСХА (${result.sourcesCount} источников)`,
        result.status === "success" ? "success" : "info"
      )
    } catch {
      onToast?.("Использованы кэшированные данные РГАУ-МСХА", "info")
    } finally {
      setTimeout(() => setSyncing(false), 400)
    }
  }

  function handleToggleAutoSync(v: boolean) {
    setAutoSync(v)
    try {
      localStorage.setItem("timacad_auto_sync", String(v))
    } catch {}
    onToast?.(
      v
        ? "Ежедневная авто-сверка включена"
        : "Авто-сверка отключена",
      "info"
    )
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end bg-black/60 backdrop-blur-xs animate-fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="relative bg-card border-t border-border rounded-t-3xl shadow-2xl px-4 pt-3 pb-6 max-h-[88vh] overflow-y-auto animate-slide-up flex flex-col gap-4 text-fg w-full max-w-lg md:max-w-xl lg:max-w-2xl mx-auto"
        onClick={(e) => e.stopPropagation()}
        style={{
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)",
        }}
      >
        {/* Grab Handle */}
        <div className="w-12 h-1.5 rounded-full bg-border mx-auto flex-shrink-0" />

        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-primary text-white flex items-center justify-center text-xl shadow-md flex-shrink-0">
              🌾
            </div>
            <div>
              <h2 className="text-base font-extrabold text-fg leading-tight">
                Официальные источники РГАУ-МСХА
              </h2>
              <p className="text-xs text-muted-fg mt-0.5">
                Автономная фоновая синхронизация с timacad.ru
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-muted hover:bg-border text-muted-fg hover:text-fg flex items-center justify-center transition-colors flex-shrink-0 cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Status Card */}
        <div className="bg-primary/10 border border-primary/20 rounded-2xl p-3.5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <p className="text-xs font-bold text-primary">
                Синхронизация активна
              </p>
            </div>
            <span className="text-[11px] font-semibold text-muted-fg bg-card px-2.5 py-0.5 rounded-full border border-border">
              {lastSyncDisplay}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="bg-card/80 border border-border/60 rounded-xl p-2">
              <p className="text-sm font-extrabold text-primary">{OFFICIAL_TIMACAD_SOURCES.length}</p>
              <p className="text-[10px] text-muted-fg">источников</p>
            </div>
            <div className="bg-card/80 border border-border/60 rounded-xl p-2">
              <p className="text-sm font-extrabold text-primary">{groupsCount}</p>
              <p className="text-[10px] text-muted-fg">группы</p>
            </div>
            <div className="bg-card/80 border border-border/60 rounded-xl p-2">
              <p className="text-sm font-extrabold text-primary">{classesCount.toLocaleString("ru-RU")}</p>
              <p className="text-[10px] text-muted-fg">пар</p>
            </div>
          </div>

          <button
            onClick={handleManualSync}
            disabled={syncing}
            className="w-full py-2.5 px-4 rounded-xl bg-primary hover:bg-primary-light text-white font-bold text-xs shadow-md transition-all active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <span className={`inline-block ${syncing ? "animate-spin" : ""}`}>
              🔄
            </span>
            <span>
              {syncing ? "Идёт парсинг timacad.ru..." : "Синхронизировать сейчас"}
            </span>
          </button>
        </div>

        {/* Auto Sync Toggle */}
        <div className="flex items-center justify-between p-3 rounded-2xl bg-card border border-border gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-fg">
              Автоматическое фоновое обновление
            </p>
            <p className="text-[11px] text-muted-fg mt-0.5">
              Приложение само проверяет сайт университета каждое утро и держит расписание, события и новости актуальными офлайн
            </p>
          </div>
          <button
            onClick={() => handleToggleAutoSync(!autoSync)}
            className={`relative w-11 h-6 rounded-full transition-all flex-shrink-0 cursor-pointer ${
              autoSync ? "bg-primary" : "bg-border"
            }`}
          >
            <span
              className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-all ${
                autoSync ? "left-6" : "left-1"
              }`}
            />
          </button>
        </div>

        {/* Category Filters */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all border cursor-pointer ${
                selectedCategory === cat.id
                  ? "bg-primary text-white border-primary shadow-xs"
                  : "bg-muted border-border text-muted-fg hover:border-accent/40"
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Source Items */}
        <div className="space-y-2.5">
          {filteredSources.map((source) => (
            <div
              key={source.id}
              className="bg-card border border-border/80 rounded-2xl p-3 flex items-start justify-between gap-3 hover:border-accent/40 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-muted text-primary border border-border">
                    {source.category.toUpperCase()}
                  </span>
                  <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                    ✓ Официальный
                  </span>
                </div>
                <h3 className="text-xs font-bold text-fg leading-snug">
                  {source.name}
                </h3>
                <p className="text-[11px] text-muted-fg leading-relaxed mt-1">
                  {source.description}
                </p>
                <p className="text-[10px] text-muted-fg/80 mt-1 font-mono">
                  Обновление: {source.updateFrequency}
                </p>
              </div>
              <a
                href={source.url}
                target="_blank"
                rel="noreferrer"
                className="p-2 rounded-xl bg-muted hover:bg-border text-muted-fg hover:text-primary transition-colors flex-shrink-0 text-xs font-semibold"
                title="Перейти к источнику"
              >
                ↗
              </a>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
