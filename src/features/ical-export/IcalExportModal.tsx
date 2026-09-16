import { useState } from "react"
import { generateAndDownload, generateIcalString, type IcalDay } from "./generateIcal"

type ExportRange = "current-week" | "next-4-weeks" | "full-semester"

interface Props {
  isOpen: boolean
  onClose: () => void
  group: string
  schedule: IcalDay[]
}

const RANGE_OPTIONS: { value: ExportRange; label: string; sublabel: string; emoji: string }[] = [
  { value: "current-week", label: "Текущая неделя", sublabel: "7 дней", emoji: "📅" },
  { value: "next-4-weeks", label: "Следующие 4 недели", sublabel: "28 дней", emoji: "🗓" },
  { value: "full-semester", label: "Весь семестр", sublabel: "До 31 января 2027", emoji: "📚" },
]

export default function IcalExportModal({ isOpen, onClose, group, schedule }: Props) {
  const [range, setRange] = useState<ExportRange>("next-4-weeks")
  const [alarms, setAlarms] = useState(true)
  const [subgroup, setSubgroup] = useState<"1" | "2" | "all">("all")
  const [downloaded, setDownloaded] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)

  if (!isOpen) return null

  function handleDownload() {
    generateAndDownload({ group, schedule, range, includeAlarms: alarms, subgroupFilter: subgroup })
    setDownloaded(true)
    setTimeout(() => setDownloaded(false), 3000)
  }

  // Count events that would be exported
  const icalStr = generateIcalString({ group, schedule, range, includeAlarms: false, subgroupFilter: subgroup })
  const eventCount = (icalStr.match(/BEGIN:VEVENT/g) || []).length

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" role="dialog" aria-modal="true">
      <div
        className="absolute inset-0 bg-black/40 transition-opacity"
        onClick={onClose}
      />
      <div className="relative sheet-spring-enter bg-card rounded-t-3xl shadow-2xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-border/60 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-500/12 border border-blue-500/25 flex items-center justify-center text-lg">
              📆
            </div>
            <div>
              <h2 className="text-base font-extrabold text-fg">Экспорт расписания</h2>
              <p className="text-[11px] text-muted-fg">iCal / WebCal · группа {group}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-muted text-muted-fg transition-colors cursor-pointer"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Webcal info */}
          <div className="p-3.5 rounded-2xl bg-blue-500/8 border border-blue-500/20">
            <p className="text-xs font-semibold text-blue-600 dark:text-blue-400 mb-1">
              📱 Добавить в Календарь
            </p>
            <p className="text-[11px] text-muted-fg leading-relaxed">
              Скачайте файл <strong>.ics</strong> и откройте в Apple Календарь, Google Calendar или Яндекс.Календарь. Занятия добавятся автоматически с будильниками за 15 минут.
            </p>
          </div>

          {/* Range selection */}
          <div>
            <p className="text-xs font-bold text-muted-fg uppercase tracking-wider mb-2">Период экспорта</p>
            <div className="space-y-2">
              {RANGE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setRange(opt.value)}
                  className={`w-full flex items-center gap-3 p-3.5 rounded-xl border transition-all cursor-pointer text-left ${
                    range === opt.value
                      ? "border-primary bg-primary/8 shadow-xs"
                      : "border-border bg-card hover:border-border/80 hover:bg-muted/40"
                  }`}
                >
                  <span className="text-lg">{opt.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-bold ${range === opt.value ? "text-primary" : "text-fg"}`}>
                      {opt.label}
                    </p>
                    <p className="text-[11px] text-muted-fg">{opt.sublabel}</p>
                  </div>
                  {range === opt.value && (
                    <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                      <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                        <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Subgroup filter */}
          <div>
            <p className="text-xs font-bold text-muted-fg uppercase tracking-wider mb-2">Подгруппа</p>
            <div className="flex gap-2">
              {([["all", "Обе"], ["1", "1-я"], ["2", "2-я"]] as const).map(([v, label]) => (
                <button
                  key={v}
                  onClick={() => setSubgroup(v)}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-bold border transition-all cursor-pointer ${
                    subgroup === v
                      ? "bg-primary text-white border-primary shadow-xs"
                      : "bg-card border-border hover:bg-muted text-fg"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Alarms toggle */}
          <div className="flex items-center justify-between p-3.5 rounded-xl bg-muted/60 border border-border/60">
            <div>
              <p className="text-sm font-bold text-fg">Будильники за 15 минут</p>
              <p className="text-[11px] text-muted-fg mt-0.5">Уведомление перед каждой парой</p>
            </div>
            <button
              onClick={() => setAlarms((a) => !a)}
              className={`w-11 h-6 rounded-full transition-all duration-200 relative cursor-pointer flex-shrink-0 ${
                alarms ? "bg-primary" : "bg-border"
              }`}
            >
              <div
                className={`w-5 h-5 rounded-full bg-white shadow absolute top-0.5 transition-all duration-200 ${
                  alarms ? "left-5.5" : "left-0.5"
                }`}
              />
            </button>
          </div>

          {/* Event count preview */}
          <div className="p-3.5 rounded-xl bg-muted/60 border border-border/60 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-mono font-black text-sm">
              {eventCount}
            </div>
            <div>
              <p className="text-sm font-bold text-fg">{eventCount === 0 ? "Нет занятий" : `${eventCount} ${eventCount === 1 ? "занятие" : eventCount < 5 ? "занятия" : "занятий"}`}</p>
              <p className="text-[11px] text-muted-fg">будет добавлено в календарь</p>
            </div>
          </div>

          {/* Preview toggle */}
          {eventCount > 0 && (
            <button
              onClick={() => setPreviewOpen((o) => !o)}
              className="w-full text-xs font-semibold text-muted-fg hover:text-fg transition-colors flex items-center justify-center gap-1.5 py-1 cursor-pointer"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {previewOpen ? <><path d="M9 18l6-6-6-6"/></> : <><path d="M3 8l7-5 7 5v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></>}
              </svg>
              {previewOpen ? "Скрыть" : "Предварительный просмотр (.ics)"}
            </button>
          )}

          {previewOpen && (
            <pre className="text-[9px] font-mono text-muted-fg bg-muted/40 rounded-xl p-3 overflow-x-auto max-h-40 border border-border/60">
              {icalStr.slice(0, 800)}...
            </pre>
          )}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 px-5 py-4 border-t border-border/60 space-y-2.5">
          <button
            onClick={handleDownload}
            disabled={eventCount === 0}
            className={`w-full py-3.5 rounded-2xl font-bold text-sm transition-all active:scale-[0.98] cursor-pointer shadow-sm ${
              downloaded
                ? "bg-emerald-500 text-white"
                : eventCount === 0
                  ? "bg-muted text-muted-fg cursor-not-allowed"
                  : "bg-primary text-white hover:bg-primary-light"
            }`}
          >
            {downloaded ? (
              <span className="flex items-center justify-center gap-2">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
                </svg>
                Файл скачан!
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                Скачать RGAU-{group.replace(/\s/g, "-")}-schedule.ics
              </span>
            )}
          </button>
          <p className="text-[10px] text-muted-fg text-center">
            Откройте файл в Календарь (iOS/macOS), Google Calendar или Outlook
          </p>
        </div>
      </div>
    </div>
  )
}
