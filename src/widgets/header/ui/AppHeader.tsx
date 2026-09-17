import React, { useState, useEffect } from "react"
import { I } from "@/shared/ui/Icons"
import { getStudyWeek, TODAY } from "@/entities/lesson/lib/getStudyWeek"
import {
  isIosDevice,
  isIPadDevice,
  isStandaloneMode,
  getIosBrowserType,
} from "@/components/IosInstallPrompt"

export interface AppHeaderProps {
  tab: string
  dark: boolean
  onDarkToggle: (e: React.MouseEvent) => void
  groupId: string
  onGroupOpen: () => void
  searchOpen: boolean
  onSearchToggle: () => void
  onSyncOpen?: () => void
  lastSyncDisplay?: string
  onOpenIosPrompt?: () => void
  onGoHome?: () => void
  activeDate?: string
}

function StatusBar() {
  // Transparent overlay that extends the header color into the notch / status bar area.
  // height = env(safe-area-inset-top) so it fills exactly the OS-level bar region.
  return (
    <div
      className="w-full flex-shrink-0"
      style={{
        height: "env(safe-area-inset-top, 0px)",
        background: "var(--color-bg)",
        minHeight: 0,
      }}
    />
  )
}

export function AppHeader({
  tab,
  dark,
  onDarkToggle,
  groupId,
  onGroupOpen,
  searchOpen,
  onSearchToggle,
  onSyncOpen,
  lastSyncDisplay,
  onOpenIosPrompt,
  onGoHome,
  activeDate,
}: AppHeaderProps) {
  const [scrolled, setScrolled] = useState(false)
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator !== "undefined" ? navigator.onLine : true,
  )

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 10)
    window.addEventListener("scroll", handleScroll, { passive: true })
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  useEffect(() => {
    const on = () => setIsOnline(true)
    const off = () => setIsOnline(false)
    window.addEventListener("online", on)
    window.addEventListener("offline", off)
    return () => {
      window.removeEventListener("online", on)
      window.removeEventListener("offline", off)
    }
  }, [])

  return (
    <div
      className={`sticky top-0 z-40 flex-shrink-0 bg-background transition-shadow ${
        scrolled ? "shadow-sm" : ""
      }`}
      style={{ background: "var(--color-bg)" }}
    >
      <StatusBar />
      {!isOnline && (
        <div className="bg-amber-500 text-white text-[11px] font-bold px-4 py-1 flex items-center justify-center gap-1.5 shadow-xs animate-fade-in">
          <span>📡</span>
          <span>Работаете офлайн: отображаются сохранённые данные</span>
        </div>
      )}
      {tab === "schedule" ? (
        <div className="flex items-center justify-between px-4 pb-2.5 gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={onGroupOpen}
              className="flex items-center gap-1.5 bg-muted px-2.5 sm:px-3 py-1.5 rounded-xl hover:bg-border transition-colors min-w-0 cursor-pointer active:scale-[0.98]"
            >
              <span className="text-sm font-bold text-fg truncate">
                {groupId || "Группа"}
              </span>
              {I.chev("down", 13, "text-muted-fg flex-shrink-0")}
            </button>
            {(() => {
              const curWeek = getStudyWeek(activeDate || TODAY)
              const isOdd = curWeek % 2 !== 0
              return (
                <div className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1 rounded-xl bg-card border border-border/80 text-xs font-semibold text-fg shadow-xs flex-shrink-0">
                  <span className="text-muted-fg font-medium">
                    {curWeek}-я<span className="hidden sm:inline"> нед</span>
                  </span>
                  <span
                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
                      isOdd
                        ? "bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-500/30"
                        : "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30"
                    }`}
                  >
                    {isOdd ? "Верхняя" : "Нижняя"}
                  </span>
                </div>
              )
            })()}
            {onSyncOpen && (
              <button
                onClick={onSyncOpen}
                className="flex items-center gap-1.5 px-2 py-1 rounded-xl bg-card border border-border/80 text-xs font-semibold text-fg shadow-xs hover:border-primary/40 hover:bg-muted/40 transition-all cursor-pointer"
                title="Синхронизация с timacad.ru"
              >
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse flex-shrink-0" />
                <span className="text-[10px] font-bold text-muted-fg hidden sm:inline">
                  timacad.ru
                </span>
              </button>
            )}
          </div>
          <div className="flex gap-1 items-center">
            {((isIosDevice() || isIPadDevice()) &&
              getIosBrowserType() === "safari" &&
              !isStandaloneMode() &&
              onOpenIosPrompt) && (
              <button
                onClick={onOpenIosPrompt}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-primary/10 border border-primary/25 text-xs font-bold text-primary hover:bg-primary/20 transition-colors cursor-pointer"
                title="Установить на экран «Домой»"
              >
                {I.mobile(13, "text-primary")}
                <span className="text-[10px] font-bold">На «Домой»</span>
              </button>
            )}
            <button
              onClick={onSearchToggle}
              className={`p-2 rounded-xl transition-colors cursor-pointer ${
                searchOpen
                  ? "bg-primary text-white"
                  : "hover:bg-muted text-muted-fg"
              }`}
            >
              {I.search(17)}
            </button>
            <button
              onClick={onDarkToggle}
              className="p-2 rounded-xl hover:bg-muted text-muted-fg transition-colors cursor-pointer"
              title="Переключить тему"
            >
              {dark ? I.sun(17) : I.moon(17)}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between px-4 pb-2.5">
          <div className="flex items-center gap-2 min-w-0">
            <h1 className="text-xl sm:text-2xl font-extrabold text-fg truncate">
              {({
                campus: "Кампус",
                events: "События",
                profile: "Профиль",
              } as Record<string, string>)[tab] ?? ""}
            </h1>
            {onSyncOpen && (
              <button
                onClick={onSyncOpen}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-card border border-border/80 text-xs font-semibold text-fg shadow-xs hover:border-primary/40 hover:bg-muted/40 transition-all cursor-pointer flex-shrink-0"
                title="Официальные источники timacad.ru"
              >
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse flex-shrink-0" />
                <span className="text-[10px] font-bold text-muted-fg hidden xs:inline">
                  timacad.ru
                </span>
              </button>
            )}
          </div>
          <div className="flex gap-1 items-center">
            {((isIosDevice() || isIPadDevice()) &&
              getIosBrowserType() === "safari" &&
              !isStandaloneMode() &&
              onOpenIosPrompt) && (
              <button
                onClick={onOpenIosPrompt}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-primary/10 border border-primary/25 text-xs font-bold text-primary hover:bg-primary/20 transition-colors cursor-pointer"
                title="Установить на экран «Домой»"
              >
                {I.mobile(13, "text-primary")}
                <span className="text-[10px] font-bold">На «Домой»</span>
              </button>
            )}
            <button
              onClick={onSearchToggle}
              className={`p-2 rounded-xl transition-colors cursor-pointer ${
                searchOpen
                  ? "bg-primary text-white"
                  : "hover:bg-muted text-muted-fg"
              }`}
            >
              {I.search(17)}
            </button>
            <button
              onClick={onDarkToggle}
              className="p-2 rounded-xl hover:bg-muted text-muted-fg transition-colors cursor-pointer"
              title="Переключить тему"
            >
              {dark ? I.sun(17) : I.moon(17)}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
