import React, { useState } from "react"
import { I } from "@/shared/ui/Icons"
import { TYPE_CFG } from "@/entities/lesson/lib/typeConfig"
import { formatLocationDisplay } from "@/entities/lesson/lib/location"
import MorphingButton from "@/shared/ui/MorphingButton"
import type { ClassItem, Homework, PersonalNote, UserRole } from "@/entities/lesson/model/types"

export interface ClassDetailModalProps {
  cls: ClassItem
  isOpen: boolean
  onClose: () => void
  homework?: Homework
  personal?: PersonalNote
  role?: UserRole
  onSaveHomework?: (hw: Homework) => void
  onSavePersonal?: (note: PersonalNote) => void
  onOpenNavigation?: (building: string) => void
}

export function ClassDetailModal({
  cls,
  isOpen,
  onClose,
  homework,
  personal,
  role,
  onSaveHomework,
  onSavePersonal,
  onOpenNavigation,
}: ClassDetailModalProps) {
  const [tab, setTab] = useState<"details" | "homework" | "notes">("details")
  const [hwText, setHwText] = useState(homework?.text || "")
  const [deadline, setDeadline] = useState(homework?.deadline || "К следующей паре")
  const [isClosing, setIsClosing] = useState(false)
  const [dragY, setDragY] = useState(0)

  if (!isOpen) return null

  const cfg = TYPE_CFG[cls.type] || TYPE_CFG.lecture

  const touchStartY = React.useRef<number | null>(null)

  const handleClose = () => {
    if (isClosing) return
    setIsClosing(true)
    try {
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        navigator.vibrate(10)
      }
    } catch {}
    setTimeout(() => {
      onClose()
      setIsClosing(false)
      setDragY(0)
    }, 280)
  }

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY
  }

  const onTouchMove = (e: React.TouchEvent) => {
    if (touchStartY.current === null) return
    const delta = e.touches[0].clientY - touchStartY.current
    if (delta > 0) setDragY(delta)
  }

  const onTouchEnd = () => {
    if (dragY > 75) {
      handleClose()
    } else {
      setDragY(0)
    }
    touchStartY.current = null
  }

  const handleSaveHw = async () => {
    if (onSaveHomework) {
      onSaveHomework({
        classId: cls.id,
        text: hwText,
        deadline: deadline,
        author: role === "headstudent" ? "Староста группы" : "Студент",
        updatedAt: "Только что",
      })
    }
    return true
  }

  return (
    <div
      className={`fixed inset-0 z-50 flex items-end sm:items-center justify-center transition-all ${
        isClosing ? "opacity-0 pointer-events-none" : "animate-fade-in"
      }`}
      style={{
        backgroundColor: "rgba(0, 0, 0, 0.6)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
      }}
      onClick={handleClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`w-full max-w-lg bg-card rounded-t-3xl sm:rounded-3xl border border-border shadow-2xl overflow-hidden flex flex-col max-h-[88vh] ${
          isClosing ? "sheet-spring-exit" : "sheet-spring-enter"
        }`}
        style={{
          transform: dragY > 0 ? `translateY(${dragY}px)` : undefined,
          transition: dragY === 0 ? "transform 0.32s cubic-bezier(0.175, 0.885, 0.32, 1.15)" : "none",
        }}
      >
        {/* Drag handle for touch physics */}
        <div
          className="touch-none select-none flex justify-center pt-3 pb-1 cursor-grab active:cursor-grabbing flex-shrink-0"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          <div className="w-12 h-1.5 rounded-full bg-border hover:bg-muted-fg/40 transition-colors" />
        </div>

        {/* Header: Class Color Accent & Subject */}
        <div className="px-5 pt-2 pb-3 border-b border-border">
          <div className="flex items-center justify-between gap-2 mb-2">
            <span
              className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${cfg.chip}`}
            >
              {cfg.label}
            </span>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-muted-fg font-semibold">
                {cls.start} – {cls.end}
              </span>
              <button
                onClick={handleClose}
                className="w-7 h-7 rounded-full bg-muted hover:bg-border text-muted-fg flex items-center justify-center transition-colors text-xs"
              >
                ✕
              </button>
            </div>
          </div>
          <h2 className="text-lg font-black text-fg leading-snug">{cls.subject}</h2>
          <p className="text-xs text-muted-fg mt-1 flex items-center gap-1.5">
            <span>👤</span>
            <span>{cls.teacher || "Преподаватель кафедры"}</span>
          </p>
        </div>

        {/* Tab switch buttons */}
        <div className="px-5 py-2 flex gap-1 bg-muted/40 border-b border-border">
          {(["details", "homework", "notes"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                tab === t
                  ? "bg-card text-primary shadow-xs border border-border/80"
                  : "text-muted-fg hover:text-fg"
              }`}
            >
              {t === "details" && "Предмет и аудитория"}
              {t === "homework" && "Домашка"}
              {t === "notes" && "Заметки"}
            </button>
          ))}
        </div>

        {/* Tab Body */}
        <div className="p-5 overflow-y-auto flex-1 space-y-3.5 text-xs">
          {tab === "details" && (
            <>
              {/* Location & Navigation Card */}
              <div className="p-3.5 bg-muted/60 border border-border/80 rounded-2xl flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] text-muted-fg uppercase tracking-wider font-semibold">
                    Место проведения
                  </p>
                  <p className="text-sm font-extrabold text-fg mt-0.5">
                    {formatLocationDisplay(cls.building, cls.room)}
                  </p>
                </div>
                {onOpenNavigation && (
                  <button
                    onClick={() => {
                      onOpenNavigation(cls.building)
                      handleClose()
                    }}
                    className="px-3 py-1.5 bg-primary text-white rounded-xl font-bold flex items-center gap-1 hover:bg-primary-light transition-all shadow-xs cursor-pointer active:scale-95"
                  >
                    <span>🗺 Маршрут</span>
                  </button>
                )}
              </div>

              {/* Consultation & Exam Info */}
              <div className="space-y-2">
                <div className="p-3 bg-card border border-border rounded-xl space-y-1">
                  <span className="font-bold text-fg">Форма аттестации:</span>
                  <p className="text-muted-fg">Зачёт с оценкой / Дифференцированный зачёт</p>
                </div>
                <div className="p-3 bg-card border border-border rounded-xl space-y-1">
                  <span className="font-bold text-fg">Консультации кафедры:</span>
                  <p className="text-muted-fg">По средам с 16:30 до 18:00 в преподавательской</p>
                </div>
              </div>
            </>
          )}

          {tab === "homework" && (
            <div className="space-y-3">
              <div>
                <label className="block font-bold text-fg mb-1">Задание / Вопросы к паре:</label>
                <textarea
                  rows={3}
                  value={hwText}
                  onChange={(e) => setHwText(e.target.value)}
                  placeholder="Введите текст домашнего задания или вопросы к семинару..."
                  className="w-full p-2.5 rounded-xl border border-border bg-card text-fg focus:outline-none focus:border-primary"
                />
              </div>
              <div>
                <label className="block font-bold text-fg mb-1">Срок сдачи:</label>
                <input
                  type="text"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                  placeholder="Например: К следующей паре или 24 сентября"
                  className="w-full p-2.5 rounded-xl border border-border bg-card text-fg focus:outline-none focus:border-primary"
                />
              </div>
              <div className="pt-2">
                <MorphingButton
                  onClick={handleSaveHw}
                  idleText="Сохранить задание"
                  loadingText="Сохраняем..."
                  successText="Задание сохранено!"
                  className="w-full bg-primary text-white hover:bg-primary-light"
                />
              </div>
            </div>
          )}

          {tab === "notes" && (
            <div className="space-y-2">
              <p className="text-muted-fg">
                Личные чек-листы и конспекты синхронизируются локально на вашем устройстве.
              </p>
              <div className="p-3 rounded-xl bg-muted/40 border border-border text-fg">
                <span>📝 Заметки к занятию сохраняются автоматически при редактировании.</span>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-muted/30 border-t border-border flex items-center justify-between">
          <span className="text-[11px] text-muted-fg">РГАУ-МСХА им. К.А. Тимирязева</span>
          <button
            onClick={handleClose}
            className="px-4 py-1.5 bg-muted hover:bg-border text-fg rounded-xl font-bold transition-colors cursor-pointer"
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  )
}

export default ClassDetailModal
