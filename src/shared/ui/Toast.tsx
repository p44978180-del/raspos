import React from "react"
import { I } from "./Icons"

export interface ToastMsg {
  id: number
  text: string
  type?: "info" | "success" | "warn"
}

export function Toast({
  toasts,
  onDismiss,
}: {
  toasts: ToastMsg[]
  onDismiss: (id: number) => void
}) {
  return (
    <div className="fixed top-16 left-0 right-0 z-[100] flex flex-col gap-2 px-4 pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`animate-toast-in flex items-start gap-3 px-4 py-3 rounded-2xl shadow-lg border pointer-events-auto ${
            t.type === "warn"
              ? "bg-amber-bg border-amber/30 text-amber"
              : t.type === "success"
                ? "bg-muted border-accent/30 text-primary"
                : "bg-card border-border text-fg"
          }`}
        >
          <span className="text-sm font-semibold flex-1 leading-snug">
            {t.text}
          </span>
          <button
            onClick={() => onDismiss(t.id)}
            className="flex-shrink-0 opacity-60 hover:opacity-100 cursor-pointer"
          >
            {I.close(14)}
          </button>
        </div>
      ))}
    </div>
  )
}
