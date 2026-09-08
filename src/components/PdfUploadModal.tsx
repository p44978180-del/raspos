import React, { useState } from "react"
import {
  parsePdfArrayBuffer,
  type ParsedGroupResult,
} from "../utils/timacadPdfParser"

export interface PdfUploadModalProps {
  isOpen: boolean
  activeGroup: string
  hasCustomSchedule: boolean
  onClose: () => void
  onApplySchedule: (result: ParsedGroupResult) => void
  onResetOfficial: () => void
  onToast?: (msg: string, type: "info" | "success" | "warn") => void
}

export default function PdfUploadModal({
  isOpen,
  activeGroup,
  hasCustomSchedule,
  onClose,
  onApplySchedule,
  onResetOfficial,
  onToast,
}: PdfUploadModalProps) {
  const [parsing, setParsing] = useState(false)
  const [parsedResult, setParsedResult] = useState<ParsedGroupResult | null>(null)
  const [rawBuffer, setRawBuffer] = useState<ArrayBuffer | null>(null)
  const [fileName, setFileName] = useState<string>("")
  const [selectedGroup, setSelectedGroup] = useState<string>(activeGroup)
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!isOpen) return null

  async function processBuffer(buffer: ArrayBuffer, targetGrp: string, name: string) {
    setError(null)
    setParsing(true)
    try {
      const result = await parsePdfArrayBuffer(buffer, targetGrp, name)
      setParsedResult(result)
      setSelectedGroup(result.groupName)
      onToast?.(
        `PDF успешно разобран! Найдено ${result.totalClasses} занятий для группы ${result.groupName}.`,
        "success"
      )
    } catch (err: any) {
      console.error("PDF parse error:", err)
      setError("Не удалось разобрать PDF файл: " + (err?.message || "неизвестная ошибка"))
      onToast?.("Ошибка разбора PDF", "warn")
    } finally {
      setParsing(false)
    }
  }

  async function handleFile(file: File) {
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setError("Пожалуйста, выберите файл в формате PDF (.pdf)")
      onToast?.("Файл должен быть в формате .pdf", "warn")
      return
    }

    try {
      const buffer = await file.arrayBuffer()
      setRawBuffer(buffer)
      setFileName(file.name)
      await processBuffer(buffer, activeGroup, file.name)
    } catch (err: any) {
      setError("Ошибка чтения файла: " + (err?.message || "неизвестная ошибка"))
    }
  }

  async function handleGroupSwitch(newGrp: string) {
    if (!rawBuffer) return
    setSelectedGroup(newGrp)
    await processBuffer(rawBuffer, newGrp, fileName)
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const f = e.dataTransfer.files?.[0]
    if (f) handleFile(f)
  }

  function apply() {
    if (!parsedResult) return
    onApplySchedule(parsedResult)
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-card w-full max-w-lg rounded-t-3xl sm:rounded-3xl border border-border shadow-2xl overflow-hidden sheet-spring-enter max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-3 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold text-base shadow-xs">
              📄
            </div>
            <div>
              <h3 className="font-extrabold text-base text-fg">Загрузка PDF расписания</h3>
              <p className="text-xs text-muted-fg">Портал старосты группы {activeGroup}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-muted hover:bg-border text-muted-fg hover:text-fg flex items-center justify-center transition-colors text-sm cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {/* Instructions banner */}
          <div className="p-3.5 rounded-2xl bg-muted/60 border border-border text-xs text-muted-fg space-y-1.5">
            <p className="font-bold text-fg flex items-center gap-1.5">
              <span>🏛</span> Официальный PDF РГАУ-МСХА
            </p>
            <p>
              Вы можете загрузить официальный PDF с сайта{" "}
              <a
                href="https://www.timacad.ru/about/sveden/document/rezhim-zaniatii-obuchaiushchikhsia"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline font-medium"
              >
                timacad.ru
              </a>{" "}
              или изменённый файл расписания вашей группы.
            </p>
            <p className="text-[11px] text-accent font-semibold flex items-center gap-1">
              <span>✓</span> Верхние пары распознаются как нечётная неделя (числитель), нижние — как чётная неделя (знаменатель).
            </p>
          </div>

          {/* Drag and Drop Zone */}
          <label
            onDragOver={(e) => {
              e.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            className={`flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-2xl cursor-pointer transition-all ${
              dragOver
                ? "border-primary bg-primary/10"
                : "border-border hover:border-accent/60 bg-muted/30"
            }`}
          >
            <input
              type="file"
              accept=".pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) handleFile(f)
              }}
            />
            {parsing ? (
              <div className="flex flex-col items-center gap-2 py-4">
                <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
                <span className="text-xs font-bold text-primary">Разбираем 2D сетку PDF в браузере...</span>
                <span className="text-[11px] text-muted-fg">Распознавание колонок, аудиторий, преподавателей и недель</span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-1.5 text-center">
                <span className="text-3xl">📥</span>
                <p className="text-sm font-bold text-fg">
                  Нажмите для выбора PDF или перетащите сюда
                </p>
                <p className="text-xs text-muted-fg">
                  Поддерживаются официальные файлы расписания РГАУ-МСХА
                </p>
              </div>
            )}
          </label>

          {error && (
            <div className="p-3 rounded-xl bg-red-bg border border-red/30 text-red text-xs font-medium">
              {error}
            </div>
          )}

          {/* Parsed Result Preview */}
          {parsedResult && (
            <div className="space-y-3 pt-2 border-t border-border">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-fg">
                  Результат разбора
                </h4>
                <span className="text-xs font-bold text-primary bg-primary/10 px-2.5 py-0.5 rounded-full border border-primary/20">
                  Группа: {parsedResult.groupName}
                </span>
              </div>

              {/* Multiple groups picker if document contained multiple columns */}
              {parsedResult.availableGroups && parsedResult.availableGroups.length > 1 && (
                <div className="p-2.5 rounded-xl bg-muted/60 border border-border space-y-1.5">
                  <p className="text-[11px] font-bold text-fg">
                    В файле найдено {parsedResult.availableGroups.length} групп. Выберите группу:
                  </p>
                  <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                    {parsedResult.availableGroups.map((grp) => (
                      <button
                        key={grp}
                        type="button"
                        onClick={() => handleGroupSwitch(grp)}
                        className={`px-2 py-1 text-[11px] font-bold rounded-lg transition-all cursor-pointer ${
                          grp === selectedGroup
                            ? "bg-primary text-white shadow-xs"
                            : "bg-card border border-border text-muted-fg hover:text-fg"
                        }`}
                      >
                        {grp}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <div className="p-2.5 rounded-xl bg-card border border-border">
                  <p className="text-[11px] text-muted-fg">Всего занятий</p>
                  <p className="text-base font-extrabold text-fg">{parsedResult.totalClasses}</p>
                </div>
                <div className="p-2.5 rounded-xl bg-card border border-border">
                  <p className="text-[11px] text-muted-fg">Учебных дней</p>
                  <p className="text-base font-extrabold text-fg">
                    {parsedResult.days.filter((d) => d.classes.length > 0).length}
                  </p>
                </div>
              </div>

              {/* Weekday distribution */}
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-muted-fg">Распределение по дням:</p>
                <div className="grid grid-cols-3 gap-1.5">
                  {parsedResult.days.map((d) => (
                    <div
                      key={d.weekday}
                      className="p-2 rounded-xl bg-muted/60 text-center border border-border/60"
                    >
                      <p className="text-[11px] font-bold text-fg">{d.weekday.slice(0, 2)}</p>
                      <p className="text-xs text-primary font-bold">{d.classes.length} пар</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Sample classes */}
              <div className="space-y-1.5 max-h-40 overflow-y-auto p-2 bg-muted/40 rounded-xl border border-border">
                {parsedResult.days
                  .flatMap((d) => d.classes)
                  .slice(0, 6)
                  .map((c) => (
                    <div
                      key={c.id}
                      className="text-xs flex items-center justify-between py-1 border-b border-border/40 last:border-0"
                    >
                      <span className="font-semibold text-fg truncate max-w-[200px]">
                        {c.num}. {c.subject}
                      </span>
                      <span className="text-[10px] text-muted-fg font-mono">
                        {c.room} · {c.weekType === "odd" ? "Верхняя" : c.weekType === "even" ? "Нижняя" : "Все"}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-muted/50 border-t border-border flex items-center justify-between gap-2">
          {hasCustomSchedule ? (
            <button
              onClick={() => {
                onResetOfficial()
                onClose()
              }}
              className="px-3 py-2 text-xs font-bold text-red hover:bg-red-bg rounded-xl transition-colors cursor-pointer"
            >
              Сбросить к официальному
            </button>
          ) : (
            <button
              onClick={onClose}
              className="px-3 py-2 text-xs font-bold text-muted-fg hover:text-fg rounded-xl cursor-pointer"
            >
              Отмена
            </button>
          )}

          <button
            onClick={apply}
            disabled={!parsedResult}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              parsedResult
                ? "bg-primary text-white hover:bg-primary-light shadow-md active:scale-98"
                : "bg-muted text-muted-fg cursor-not-allowed border border-border"
            }`}
          >
            Применить к группе {selectedGroup}
          </button>
        </div>
      </div>
    </div>
  )
}
