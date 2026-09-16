import React, { useState, useRef, useEffect } from "react"
import { I } from "./Icons"

export interface SheetProps {
  onClose: () => void
  children: React.ReactNode
  title?: string
}

export function Sheet({ onClose, children, title }: SheetProps) {
  const [isClosing, setIsClosing] = useState(false)
  const [dragY, setDragY] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const touchStartY = useRef<number | null>(null)

  const startClose = () => {
    if (isClosing) return
    setIsClosing(true)
    setTimeout(() => {
      onClose()
    }, 280)
  }

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY
    setIsDragging(true)
  }

  const onTouchMove = (e: React.TouchEvent) => {
    if (touchStartY.current === null) return
    const delta = e.touches[0].clientY - touchStartY.current
    if (delta > 0) {
      setDragY(delta)
    }
  }

  const onTouchEnd = () => {
    if (dragY > 75) {
      startClose()
    } else {
      setDragY(0)
    }
    setIsDragging(false)
    touchStartY.current = null
  }

  useEffect(() => {
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = ""
    }
  }, [])

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end"
      onClick={startClose}
    >
      <div
        className={`absolute inset-0 bg-black/40 transition-opacity duration-300 ${
          isClosing ? "opacity-0 pointer-events-none" : "animate-fade-in"
        }`}
      />
      <div
        className={`relative bg-card rounded-t-3xl shadow-2xl max-h-[90vh] flex flex-col w-full max-w-lg md:max-w-xl lg:max-w-2xl mx-auto ${
          isClosing ? "sheet-spring-exit" : "sheet-spring-enter"
        }`}
        style={{
          transform: !isClosing && dragY > 0 ? `translateY(${dragY}px)` : undefined,
          transition: isDragging
            ? "none"
            : !isClosing && dragY === 0
              ? "transform 0.35s cubic-bezier(0.32, 0.72, 0, 1)"
              : undefined,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header / Drag handle area with touch drag-to-dismiss */}
        <div
          className="touch-none select-none cursor-grab active:cursor-grabbing pt-3 pb-1 flex-shrink-0"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          <div className="flex justify-center pb-1">
            <div className="w-12 h-1.5 rounded-full bg-border hover:bg-muted-fg/40 transition-colors" />
          </div>
          {title && (
            <div className="px-4 pb-2 pt-1 flex items-center justify-between">
              <h2 className="text-base font-bold text-fg">{title}</h2>
              <button
                onClick={startClose}
                className="p-1.5 rounded-xl hover:bg-muted text-muted-fg transition-colors cursor-pointer"
              >
                {I.close(18)}
              </button>
            </div>
          )}
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  )
}
