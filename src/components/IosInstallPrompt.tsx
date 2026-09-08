import React, { useState, useEffect } from "react"

// ─── PWA & iOS Detection Helpers ──────────────────────────────────────────────

export function isIosDevice(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined")
    return false
  const ua = navigator.userAgent || ""
  const isClassicIos = /iPhone|iPad|iPod/i.test(ua)
  const isIpadDesktop =
    (navigator.platform === "MacIntel" || ua.includes("Macintosh")) &&
    (navigator.maxTouchPoints || 0) > 1
  return isClassicIos || isIpadDesktop
}

export function isIPadDevice(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined")
    return false
  const ua = navigator.userAgent || ""
  const isClassicIpad = /iPad/i.test(ua)
  const isIpadDesktop =
    (navigator.platform === "MacIntel" || ua.includes("Macintosh")) &&
    (navigator.maxTouchPoints || 0) > 1
  return isClassicIpad || isIpadDesktop
}

export function isStandaloneMode(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined")
    return false
  const isIosStandalone =
    "standalone" in window.navigator &&
    (window.navigator as unknown as { standalone: boolean }).standalone === true
  const isMediaStandalone =
    window.matchMedia?.("(display-mode: standalone)").matches ||
    window.matchMedia?.("(display-mode: fullscreen)").matches
  const isCapacitor =
    typeof (window as unknown as {
      Capacitor?: { isNativePlatform?: () => boolean }
    }).Capacitor !== "undefined" &&
    Boolean(
      (window as unknown as {
        Capacitor: { isNativePlatform: () => boolean }
      }).Capacitor.isNativePlatform?.(),
    )
  return Boolean(isIosStandalone || isMediaStandalone || isCapacitor)
}

export function getIosBrowserType(): "safari" | "in_app" | "other" {
  if (!isIosDevice()) return "other"
  const ua = navigator.userAgent || ""
  if (/Telegram|VKApp|VKClient|FBAN|FBAV|Instagram|Line/i.test(ua))
    return "in_app"
  if (/CriOS|FxiOS|EdgiOS|OPiOS|YaBrowser|DuckDuckGo/i.test(ua)) return "other"
  return "safari"
}

export function isRealMobileOrStandalone(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined")
    return false
  if (isStandaloneMode()) return true
  const ua = navigator.userAgent || ""
  const isTouchMobile =
    /Android|iPhone|iPad|iPod/i.test(ua) ||
    (navigator.platform === "MacIntel" && (navigator.maxTouchPoints || 0) > 1)
  return isTouchMobile
}

// ─── Component Props ──────────────────────────────────────────────────────────

export interface IosInstallPromptProps {
  /** If provided, overrides auto-detection and controls open state explicitly */
  isOpen?: boolean
  /** Callback fired when the prompt is closed or dismissed */
  onClose?: () => void
  /** Delay in milliseconds before automatic appearance on iOS Safari (default: 1500) */
  autoShowDelay?: number
}

// ─── Inline SVG Icons ─────────────────────────────────────────────────────────

const Icons = {
  share: (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <polyline points="16 6 12 2 8 6" />
      <line x1="12" y1="2" x2="12" y2="15" />
    </svg>
  ),
  plusSquare: (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="3" width="18" height="18" rx="4" />
      <line x1="12" y1="8" x2="12" y2="16" />
      <line x1="8" y1="12" x2="16" y2="12" />
    </svg>
  ),
  check: (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  close: (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
  info: (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  ),
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function IosInstallPrompt({
  isOpen,
  onClose,
  autoShowDelay = 1500,
}: IosInstallPromptProps) {
  const [internalVisible, setInternalVisible] = useState(false)
  const [browserType, setBrowserType] = useState<"safari" | "in_app" | "other">(
    "safari",
  )
  const [isIpad, setIsIpad] = useState(false)

  useEffect(() => {
    // If controlled via props, respect parent state
    if (typeof isOpen === "boolean") {
      setInternalVisible(isOpen)
      setBrowserType(getIosBrowserType())
      setIsIpad(isIPadDevice())
      return
    }

    // Auto-detection flow:
    // Only auto-show on iOS when NOT already standalone and NOT dismissed previously
    if (!isIosDevice() || isStandaloneMode()) return

    try {
      const isDismissed = localStorage.getItem("rgau_ios_a2hs_dismissed")
      if (isDismissed === "true") return
    } catch {
      // Safe fallback for strict private browsing
    }

    setBrowserType(getIosBrowserType())
    setIsIpad(isIPadDevice())

    const timer = setTimeout(() => {
      setInternalVisible(true)
    }, autoShowDelay)

    return () => clearTimeout(timer)
  }, [isOpen, autoShowDelay])

  function handleDismiss() {
    try {
      localStorage.setItem("rgau_ios_a2hs_dismissed", "true")
    } catch {
      // Ignore private storage limitations
    }
    setInternalVisible(false)
    onClose?.()
  }

  if (!internalVisible) return null

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end bg-black/50 backdrop-blur-xs animate-fade-in"
      onClick={handleDismiss}
      role="dialog"
      aria-modal="true"
      aria-labelledby="ios-install-title"
    >
      <div
        className="relative bg-card border-t border-border rounded-t-3xl shadow-2xl px-5 pt-3 pb-6 max-h-[88vh] overflow-y-auto animate-slide-up flex flex-col gap-4 text-fg"
        onClick={(e) => e.stopPropagation()}
        style={{
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 24px)",
        }}
      >
        {/* Drag Handle Bar */}
        <div className="w-10 h-1.5 rounded-full bg-border mx-auto flex-shrink-0" />

        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-primary flex items-center justify-center text-xl shadow-md text-white flex-shrink-0">
              🌾
            </div>
            <div>
              <h2
                id="ios-install-title"
                className="text-base font-extrabold text-fg leading-tight"
              >
                Установите на экран «Домой»
              </h2>
              <p className="text-xs text-muted-fg mt-0.5">
                РГАУ-МСХА им. К.А. Тимирязева
              </p>
            </div>
          </div>
          <button
            onClick={handleDismiss}
            className="w-8 h-8 rounded-xl bg-muted hover:bg-border text-muted-fg hover:text-fg flex items-center justify-center transition-colors flex-shrink-0"
            aria-label="Закрыть"
          >
            {Icons.close}
          </button>
        </div>

        {/* Value proposition */}
        <p className="text-xs text-muted-fg leading-relaxed">
          Быстрый запуск расписания с рабочего стола без адресной строки и
          стабильная работа даже при слабом интернете в корпусах университета.
        </p>

        {/* Messenger in-app browser alert */}
        {browserType === "in_app" && (
          <div className="flex items-start gap-2.5 p-3 rounded-2xl bg-amber-bg border border-amber/30 text-amber text-xs leading-snug">
            <span className="flex-shrink-0 mt-0.5">{Icons.info}</span>
            <div>
              <span className="font-bold">
                Вы открыли страницу в мессенджере (Telegram / VK).{" "}
              </span>
              Нажмите значок <strong className="font-bold">«•••»</strong> в углу
              экрана и выберите{" "}
              <strong className="font-bold">«Открыть в Safari»</strong> для
              установки.
            </div>
          </div>
        )}

        {/* 3 Step Guide */}
        <div className="space-y-2.5">
          {/* Step 1 */}
          <div className="flex items-center gap-3.5 p-3 rounded-2xl bg-muted/60 border border-border/70">
            <div className="w-9 h-9 rounded-xl bg-blue-bg text-blue flex items-center justify-center flex-shrink-0 shadow-xs">
              {Icons.share}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-fg">
                1. Нажмите «Поделиться»
              </p>
              <p className="text-[11px] text-muted-fg leading-tight mt-0.5">
                {isIpad ? "Значок со стрелкой вверх в верхней панели Safari" : "Значок со стрелкой вверх в нижней панели Safari"}
              </p>
            </div>
          </div>

          {/* Step 2 */}
          <div className="flex items-center gap-3.5 p-3 rounded-2xl bg-muted/60 border border-border/70">
            <div className="w-9 h-9 rounded-xl bg-amber-bg text-amber flex items-center justify-center flex-shrink-0 shadow-xs">
              {Icons.plusSquare}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-fg">
                2. Выберите «На экран «Домой»»
              </p>
              <p className="text-[11px] text-muted-fg leading-tight mt-0.5">
                Прокрутите меню действий вниз до пункта с иконкой плюса
              </p>
            </div>
          </div>

          {/* Step 3 */}
          <div className="flex items-center gap-3.5 p-3 rounded-2xl bg-muted/60 border border-border/70">
            <div className="w-9 h-9 rounded-xl bg-primary text-white flex items-center justify-center flex-shrink-0 shadow-xs">
              {Icons.check}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-fg">3. Нажмите «Добавить»</p>
              <p className="text-[11px] text-muted-fg leading-tight mt-0.5">
                В правом верхнем углу подтвердите добавление иконки
              </p>
            </div>
          </div>
        </div>

        {/* Action Button */}
        <div className="space-y-2 pt-1">
          <button
            onClick={handleDismiss}
            className="w-full py-3 px-4 rounded-xl bg-primary hover:bg-primary-light text-white font-bold text-sm shadow-md transition-all active:scale-[0.98] cursor-pointer"
          >
            Понятно
          </button>
          <p className="text-center text-[11px] text-muted-fg">
            Инструкция всегда доступна в разделе «Профиль»
          </p>
        </div>
      </div>
    </div>
  )
}
