import React, { useState } from "react"

export interface MorphingButtonProps {
  onClick: () => Promise<boolean | void> | boolean | void
  children?: React.ReactNode
  idleText?: string
  loadingText?: string
  successText?: string
  errorText?: string
  className?: string
  disabled?: boolean
  type?: "button" | "submit" | "reset"
  icon?: React.ReactNode
  size?: "sm" | "md" | "lg"
}

export function MorphingButton({
  onClick,
  children,
  idleText = "Сохранить",
  loadingText = "Сохранение...",
  successText = "Успешно!",
  errorText = "Ошибка",
  className = "",
  disabled = false,
  type = "button",
  icon,
  size = "md",
}: MorphingButtonProps) {
  const [state, setState] = useState<"idle" | "loading" | "success" | "error">("idle")

  const handleClick = async (e: React.MouseEvent) => {
    if (disabled || state === "loading") return
    e.stopPropagation()

    // Tactile haptic feedback
    try {
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        navigator.vibrate(12)
      }
    } catch {}

    setState("loading")
    try {
      const res = await onClick()
      if (res === false) {
        setState("error")
        setTimeout(() => setState("idle"), 1800)
      } else {
        setState("success")
        try {
          if (typeof navigator !== "undefined" && "vibrate" in navigator) {
            navigator.vibrate([15, 40, 20])
          }
        } catch {}
        setTimeout(() => setState("idle"), 1800)
      }
    } catch {
      setState("error")
      setTimeout(() => setState("idle"), 1800)
    }
  }

  const sizeClasses = {
    sm: "px-3 py-1.5 text-xs rounded-xl",
    md: "px-4 py-2 text-sm rounded-xl",
    lg: "px-5 py-2.5 text-base rounded-2xl",
  }[size]

  return (
    <button
      type={type}
      disabled={disabled || state === "loading"}
      onClick={handleClick}
      className={`relative inline-flex items-center justify-center font-bold select-none cursor-pointer overflow-hidden tactile-btn transition-all ${sizeClasses} ${
        state === "success"
          ? "bg-emerald-600 text-white shadow-md scale-[1.02]"
          : state === "error"
            ? "bg-red-600 text-white shadow-md"
            : state === "loading"
              ? "bg-primary/80 text-white cursor-wait opacity-90"
              : className || "bg-primary text-white hover:bg-primary-light"
      }`}
      style={{
        transitionDuration: "140ms",
        transitionTimingFunction: "cubic-bezier(0.0, 0.0, 0.2, 1)",
      }}
    >
      <span
        className={`flex items-center gap-1.5 transition-all ${
          state === "loading" ? "opacity-90 scale-95" : "opacity-100 scale-100"
        }`}
      >
        {state === "idle" && (
          <>
            {icon}
            <span>{children || idleText}</span>
          </>
        )}

        {state === "loading" && (
          <span className="flex items-center gap-2">
            <span className="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />
            <span>{loadingText}</span>
          </span>
        )}

        {state === "success" && (
          <span className="flex items-center gap-1.5 animate-pop-in">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span>{successText}</span>
          </span>
        )}

        {state === "error" && (
          <span className="flex items-center gap-1.5 animate-shake">
            <span>✕</span>
            <span>{errorText}</span>
          </span>
        )}
      </span>
    </button>
  )
}

export default MorphingButton
