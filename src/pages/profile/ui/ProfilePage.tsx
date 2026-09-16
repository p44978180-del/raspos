import React, { useState, useEffect } from "react"
import { I } from "@/shared/ui/Icons"
import { getStudyWeek, TODAY } from "@/entities/lesson/lib/getStudyWeek"
import { DORMS } from "@/entities/lesson/lib/disciplineData"
import {
  isIosDevice,
  isIPadDevice,
  isStandaloneMode,
  getIosBrowserType,
} from "@/components/IosInstallPrompt"
import PdfUploadModal from "@/components/PdfUploadModal"
import { OFFICIAL_TIMACAD_SOURCES } from "@/data/officialSources"
import {
  getStorageUsageBytes,
  clearUserCache,
  type StorageUsageInfo,
} from "@/utils/cacheManager"
import type { UserRole } from "@/entities/lesson/model/types"
import type { ParsedGroupResult } from "@/utils/timacadPdfParser"

export interface ProfilePageProps {
  role: UserRole
  onRoleChange: (r: UserRole) => void
  dorm: string
  onDormChange: (d: string) => void
  myGroup: string
  myMode: "student" | "teacher"
  activeGroup: string
  showDormBanner: boolean
  showEventBanners: boolean
  onShowDormBanner: (v: boolean) => void
  onShowEventBanners: (v: boolean) => void
  onToast?: (msg: string, type: "info" | "success" | "warn") => void
  onOpenIosPrompt?: () => void
  hasCustomSchedule?: boolean
  onApplySchedule?: (result: ParsedGroupResult) => void
  onResetOfficial?: () => void
  onOpenSyncModal?: () => void
  lastSyncDisplay?: string
}

const NOTIF_TIMES = [5, 10, 15, 20, 30]

function Toggle({
  value,
  onChange,
}: {
  value: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={`relative w-10 h-6 rounded-full transition-all flex-shrink-0 cursor-pointer ${
        value ? "bg-primary" : "bg-border"
      }`}
    >
      <span
        className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-all ${
          value ? "left-5" : "left-1"
        }`}
      />
    </button>
  )
}

export function ProfilePage({
  role,
  onRoleChange,
  dorm,
  onDormChange,
  myGroup,
  myMode,
  activeGroup,
  showDormBanner,
  onShowDormBanner,
  showEventBanners,
  onShowEventBanners,
  onToast,
  onOpenIosPrompt,
  hasCustomSchedule,
  onApplySchedule,
  onResetOfficial,
  onOpenSyncModal,
  lastSyncDisplay,
}: ProfilePageProps) {
  const weekNum = getStudyWeek(TODAY)

  const [notifSchedule, setNotifSchedule] = useState(false)
  const [notifScheduleMin, setNotifScheduleMin] = useState(15)
  const [notifScheduleExpanded, setNotifScheduleExpanded] = useState(false)
  const [notifEvents, setNotifEvents] = useState(false)
  const [notifHomework, setNotifHomework] = useState(false)
  const [notifHomeworkDeadline, setNotifHomeworkDeadline] = useState(false)
  const [notifDorm, setNotifDorm] = useState(false)
  const [notifDormMin, setNotifDormMin] = useState(10)
  const [notifChanges, setNotifChanges] = useState(false)

  const [codeVal, setCodeVal] = useState("")
  const [shaking, setShaking] = useState(false)
  const [pdfModalOpen, setPdfModalOpen] = useState(false)
  const [autoSync, setAutoSync] = useState(() => {
    try {
      const s = localStorage.getItem("timacad_auto_sync")
      return s !== null ? s === "true" : true
    } catch {
      return true
    }
  })

  // Cache & Storage Retention state
  const [cacheUsage, setCacheUsage] = useState<StorageUsageInfo>(() =>
    getStorageUsageBytes(),
  )
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false)

  useEffect(() => {
    setCacheUsage(getStorageUsageBytes())
  }, [lastSyncDisplay, hasCustomSchedule])

  function handleClearCacheConfirm() {
    const res = clearUserCache(true)
    setCacheUsage(getStorageUsageBytes())
    setClearConfirmOpen(false)
    onResetOfficial?.()
    onToast?.(
      `Кэш очищен. Освобождено: ${
        res.formattedFreed || "0 КБ"
      }. Настройки (группа, роль, тема) сохранены.`,
      "success",
    )
  }

  const SECRET = "TIMA-2025"
  function tryCode() {
    const trimmed = codeVal.trim()
    if (
      trimmed === SECRET ||
      trimmed.toUpperCase() === "СТАРОСТА" ||
      trimmed === "2026"
    ) {
      onRoleChange("headstudent")
      onToast?.(
        "Вы теперь Староста! Все функции управления и импорта расписания активны.",
        "success",
      )
      setCodeVal("")
    } else {
      setShaking(true)
      onToast?.("Неверный код Старосты (демо-код: TIMA-2025)", "warn")
      setTimeout(() => setShaking(false), 400)
    }
  }

  function handleAutoSyncToggle(v: boolean) {
    setAutoSync(v)
    try {
      localStorage.setItem("timacad_auto_sync", String(v))
    } catch {}
    onToast?.(
      v
        ? "Ежедневная сверка включена (фоновое обновление с timacad.ru)"
        : "Автоматическая сверка отключена старостой",
      "info",
    )
  }

  return (
    <div className="px-4 pt-1 pb-2 space-y-3">
      <div className="bg-card border border-border rounded-2xl p-4 flex items-center gap-4">
        <div className="w-14 h-14 rounded-2xl bg-primary flex items-center justify-center flex-shrink-0">
          <span className="text-xl text-white font-extrabold">
            {activeGroup.slice(0, 2)}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-fg text-base">
            {myMode === "teacher" ? activeGroup : `Группа ${activeGroup}`}
          </p>
          <p className="text-xs text-muted-fg mt-0.5">
            {myMode === "teacher" ? "Преподаватель" : "Студент"} · РГАУ–МСХА
          </p>
          <p className="text-xs text-accent font-semibold mt-0.5">
            {weekNum}-я неделя · {weekNum % 2 === 0 ? "Чётная" : "Нечётная"}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {[
          { label: "Учебная неделя", value: `${weekNum}-я` },
          { label: "Семестр", value: "Осенний 2026" },
          { label: "Форма обучения", value: "Очная" },
          { label: "Институт", value: "Агрономия" },
        ].map((item) => (
          <div
            key={item.label}
            className="bg-card border border-border rounded-xl p-3"
          >
            <p className="text-[11px] text-muted-fg">{item.label}</p>
            <p className="text-sm font-bold text-fg mt-0.5">{item.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          {I.route(16, "text-muted-fg")}
          <span className="text-sm font-bold text-fg">Проживание</span>
        </div>
        <div className="px-4 py-3 space-y-2">
          <p className="text-xs text-muted-fg">
            Откуда добираетесь на занятия?
          </p>
          <div className="flex gap-1.5 flex-wrap">
            {DORMS.map((d) => (
              <button
                key={d}
                onClick={() => onDormChange(d)}
                className={`px-2.5 py-1.5 text-xs font-semibold rounded-xl border transition-all cursor-pointer ${
                  dorm === d
                    ? "bg-primary text-white border-primary"
                    : "bg-muted border-border text-muted-fg hover:text-fg hover:border-accent/40"
                }`}
              >
                {d === "Не указано" ? d : d.replace("Общежитие ", "Общ. ")}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Notifications */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          {I.bell(16, "text-muted-fg")}
          <span className="text-sm font-bold text-fg">Уведомления</span>
          <span className="ml-auto text-[11px] text-muted-fg bg-muted px-2 py-0.5 rounded-full">
            По умолчанию выкл.
          </span>
        </div>
        <div className="divide-y divide-border">
          <div>
            <div className="flex items-center justify-between px-4 py-3 gap-3">
              <button
                onClick={() =>
                  notifSchedule && setNotifScheduleExpanded((e) => !e)
                }
                className="flex-1 min-w-0 text-left cursor-pointer"
              >
                <p className="text-sm font-semibold text-fg">
                  Напоминание о парах
                </p>
                <p className="text-xs text-muted-fg">
                  {notifSchedule
                    ? `За ${notifScheduleMin} мин до начала`
                    : "Выключено"}
                </p>
              </button>
              <Toggle
                value={notifSchedule}
                onChange={(v) => {
                  setNotifSchedule(v)
                  if (v) setNotifScheduleExpanded(true)
                  else setNotifScheduleExpanded(false)
                }}
              />
            </div>
            {notifSchedule && notifScheduleExpanded && (
              <div className="px-4 pb-3">
                <p className="text-xs text-muted-fg mb-2">За сколько минут:</p>
                <div className="flex gap-1.5 flex-wrap">
                  {NOTIF_TIMES.map((t) => (
                    <button
                      key={t}
                      onClick={() => setNotifScheduleMin(t)}
                      className={`px-3 py-1.5 text-xs font-bold rounded-xl border transition-all cursor-pointer ${
                        notifScheduleMin === t
                          ? "bg-primary text-white border-primary"
                          : "bg-muted border-border text-muted-fg hover:border-accent/40"
                      }`}
                    >
                      {t} мин
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => setNotifScheduleExpanded(false)}
                  className="mt-2 text-xs text-muted-fg hover:text-fg cursor-pointer"
                >
                  Свернуть
                </button>
              </div>
            )}
          </div>
          <div className="flex items-center justify-between px-4 py-3 gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-fg">
                Изменения в расписании
              </p>
              <p className="text-xs text-muted-fg">Отмены, переносы, замены</p>
            </div>
            <Toggle value={notifChanges} onChange={setNotifChanges} />
          </div>
          <div className="flex items-center justify-between px-4 py-3 gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-fg">События кампуса</p>
              <p className="text-xs text-muted-fg">Мероприятия и объявления</p>
            </div>
            <Toggle value={notifEvents} onChange={setNotifEvents} />
          </div>
          <div>
            <div className="flex items-center justify-between px-4 py-3 gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-fg">
                  Домашние задания
                </p>
                <p className="text-xs text-muted-fg">
                  При добавлении старостой
                </p>
              </div>
              <Toggle value={notifHomework} onChange={setNotifHomework} />
            </div>
            {notifHomework && (
              <div className="flex items-center justify-between px-4 pb-3 gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-muted-fg">
                    Напоминание о дедлайне
                  </p>
                  <p className="text-xs text-muted-fg">За день до сдачи</p>
                </div>
                <Toggle
                  value={notifHomeworkDeadline}
                  onChange={setNotifHomeworkDeadline}
                />
              </div>
            )}
          </div>
          <div>
            <div className="flex items-center justify-between px-4 py-3 gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-fg">
                  Выход из общежития
                </p>
                <p className="text-xs text-muted-fg">
                  {notifDorm ? `За ${notifDormMin} мин` : "Расчёт времени пути"}
                </p>
              </div>
              <Toggle value={notifDorm} onChange={setNotifDorm} />
            </div>
            {notifDorm && (
              <div className="px-4 pb-3">
                <div className="flex gap-1.5 flex-wrap">
                  {[5, 10, 15, 20].map((t) => (
                    <button
                      key={t}
                      onClick={() => setNotifDormMin(t)}
                      className={`px-3 py-1.5 text-xs font-bold rounded-xl border transition-all cursor-pointer ${
                        notifDormMin === t
                          ? "bg-primary text-white border-primary"
                          : "bg-muted border-border text-muted-fg hover:border-accent/40"
                      }`}
                    >
                      {t} мин
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Display settings */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          {I.settings(16, "text-muted-fg")}
          <span className="text-sm font-bold text-fg">Отображение</span>
        </div>
        <div className="divide-y divide-border">
          <div className="flex items-center justify-between px-4 py-3 gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-fg">
                Баннеры о событиях
              </p>
              <p className="text-xs text-muted-fg">
                «День открытых дверей» и другие
              </p>
            </div>
            <Toggle value={showEventBanners} onChange={onShowEventBanners} />
          </div>
          <div className="flex items-center justify-between px-4 py-3 gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-fg">
                Подсказка пути из общежития
              </p>
              <p className="text-xs text-muted-fg">Время до первой пары</p>
            </div>
            <Toggle value={showDormBanner} onChange={onShowDormBanner} />
          </div>
        </div>
      </div>

      {/* Application / PWA section */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          {I.home(16, "text-muted-fg")}
          <span className="text-sm font-bold text-fg">Приложение</span>
        </div>
        <div className="p-3">
          {isStandaloneMode() ? (
            <div className="flex items-center gap-3 p-3 bg-muted rounded-xl">
              <span className="text-primary font-bold text-base">✓</span>
              <div>
                <p className="text-xs font-bold text-fg">
                  Приложение установлено
                </p>
                <p className="text-[11px] text-muted-fg">
                  Запущено в полноэкранном режиме экрана «Домой»
                </p>
              </div>
            </div>
          ) : (isIosDevice() || isIPadDevice()) &&
            getIosBrowserType() === "safari" ? (
            <button
              onClick={onOpenIosPrompt}
              className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-muted transition-colors text-left cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold text-sm">
                  📱
                </div>
                <div>
                  <p className="text-xs font-bold text-fg">
                    Установка на экран «Домой»
                  </p>
                  <p className="text-[11px] text-muted-fg">
                    Инструкция для быстрого запуска на iPhone и iPad
                  </p>
                </div>
              </div>
              {I.chev("right", 14, "text-muted-fg")}
            </button>
          ) : (
            <div className="flex items-center gap-3 p-3 bg-muted rounded-xl">
              <span className="text-base">🌐</span>
              <div>
                <p className="text-xs font-bold text-fg">
                  Веб-версия активна
                </p>
                <p className="text-[11px] text-muted-fg">
                  Автономный режим и кэш данных работают в текущем браузере
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          {I.settings(16, "text-muted-fg")}
          <span className="text-sm font-bold text-fg">Роль (демо)</span>
        </div>
        <div className="px-4 py-3 space-y-2">
          <div className="flex bg-muted rounded-xl p-0.5 gap-0.5">
            {(
              [
                ["student", "Студент"],
                ["headstudent", "Старостa"],
              ] as [UserRole, string][]
            ).map(([r, l]) => (
              <button
                key={r}
                onClick={() => onRoleChange(r)}
                className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  role === r
                    ? "bg-primary text-white shadow-sm"
                    : "text-muted-fg hover:text-fg"
                }`}
              >
                {l}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-muted-fg">
            Старостa: управление парами, ДЗ, события
          </p>
          {/* Headstudent authentication and control panel */}
          <div className="mt-2 space-y-3">
            {role !== "headstudent" ? (
              <div className="space-y-2">
                <p className="text-[11px] text-muted-fg">
                  Введите секретный код Старосты (демо-код: TIMA-2025):
                </p>
                <div className="flex gap-2">
                  <input
                    value={codeVal}
                    onChange={(e) => setCodeVal(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") tryCode()
                    }}
                    placeholder="Код Старосты..."
                    className={`flex-1 border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-accent bg-card text-fg ${
                      shaking ? "animate-shake border-red" : ""
                    }`}
                  />
                  <button
                    onClick={tryCode}
                    className="px-3 py-2 bg-primary text-white rounded-xl text-sm font-bold active:scale-95 transition-transform cursor-pointer"
                  >
                    OK
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3 pt-1 border-t border-border">
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-primary/10 border border-primary/20">
                  <div className="flex items-center gap-2">
                    <span className="text-base">🎓</span>
                    <div>
                      <p className="text-xs font-bold text-primary">
                        Режим Старосты активен
                      </p>
                      <p className="text-[10px] text-muted-fg">
                        Группа {activeGroup} · Полные права куратора
                      </p>
                    </div>
                  </div>
                  <span className="text-xs font-bold text-primary px-2 py-0.5 rounded-md bg-card shadow-xs">
                    Куратор
                  </span>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-fg">
                      Ежедневная сверка с сайтом
                    </p>
                    <p className="text-xs text-muted-fg">
                      Автоматическая сверка расписания (timacad.ru)
                    </p>
                  </div>
                  <Toggle value={autoSync} onChange={handleAutoSyncToggle} />
                </div>

                <div className="space-y-2 pt-1 border-t border-border">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-fg">
                        Официальное PDF расписание
                      </p>
                      <p className="text-xs text-muted-fg">
                        {hasCustomSchedule
                          ? "Применено расписание из загруженного PDF"
                          : "Синхронизировано с timacad.ru"}
                      </p>
                    </div>
                    {hasCustomSchedule && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-500/25">
                        Кастомный PDF
                      </span>
                    )}
                  </div>

                  <button
                    onClick={() => setPdfModalOpen(true)}
                    className="flex items-center justify-center gap-2 w-full py-2.5 px-3 border border-dashed border-primary/50 rounded-xl bg-primary/5 text-primary text-xs font-bold cursor-pointer hover:bg-primary/10 transition-colors active:scale-[0.99]"
                  >
                    {I.upload(14)}
                    <span>Загрузить PDF расписания группы</span>
                  </button>

                  {hasCustomSchedule && (
                    <button
                      onClick={onResetOfficial}
                      className="text-xs font-semibold text-muted-fg hover:text-red transition-colors w-full text-center py-1 cursor-pointer"
                    >
                      Сбросить к официальному расписанию сайта
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <PdfUploadModal
        isOpen={pdfModalOpen}
        activeGroup={activeGroup}
        hasCustomSchedule={!!hasCustomSchedule}
        onClose={() => setPdfModalOpen(false)}
        onApplySchedule={(result: import("@/utils/timacadPdfParser").ParsedGroupResult) => {
          onApplySchedule?.(result)
          setPdfModalOpen(false)
        }}
        onResetOfficial={() => {
          onResetOfficial?.()
          setPdfModalOpen(false)
        }}
        onToast={onToast}
      />

      {/* Official Timacad Sources & Sync status */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-sm font-bold text-fg">
            Сверка с timacad.ru
          </span>
          <span className="ml-auto text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full">
            Актуально
          </span>
        </div>
        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-bold text-fg">
                Статус актуальности данных
              </p>
              <p className="text-[11px] text-muted-fg mt-0.5">
                {lastSyncDisplay || "Синхронизировано"} ·{" "}
                {OFFICIAL_TIMACAD_SOURCES.length} источников
              </p>
            </div>
            {onOpenSyncModal && (
              <button
                onClick={onOpenSyncModal}
                className="px-3 py-1.5 rounded-xl bg-primary text-white text-xs font-bold shadow-xs hover:bg-primary-light transition-colors cursor-pointer flex-shrink-0"
              >
                Реестр источников
              </button>
            )}
          </div>
          <div className="flex items-center justify-between pt-2 border-t border-border">
            <div className="flex-1 min-w-0 pr-2">
              <p className="text-xs font-semibold text-fg">
                Фоновая авто-сверка данных
              </p>
              <p className="text-[10px] text-muted-fg">
                Автономная сверка расписания на устройстве
              </p>
            </div>
            <Toggle value={autoSync} onChange={handleAutoSyncToggle} />
          </div>
        </div>
      </div>

      {/* Cache Retention & Storage section */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          {I.database(16, "text-muted-fg")}
          <span className="text-sm font-bold text-fg">Память и кэш данных</span>
          <span className="ml-auto text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full">
            Кэш данных: {cacheUsage.formatted}
          </span>
        </div>
        <div className="p-4 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-fg">
                Размер локального кэша
              </p>
              <p className="text-[11px] text-muted-fg mt-0.5 leading-relaxed">
                Занято на устройстве:{" "}
                <span className="font-semibold text-fg">
                  {cacheUsage.formatted}
                </span>{" "}
                ({cacheUsage.itemCount} записей). Включает новости, анонсы и
                оффлайн-сетку расписания.
              </p>
              <div className="flex items-center gap-1.5 mt-2 text-[10px] text-muted-fg">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span>
                  Авто-очистка: события старше 45 дней и временные буферы
                  очищаются автоматически
                </span>
              </div>
            </div>
            <button
              onClick={() => setClearConfirmOpen(true)}
              className="px-3 py-1.5 rounded-xl border border-red/40 bg-red/10 text-red text-xs font-bold hover:bg-red/15 active:scale-95 transition-all cursor-pointer flex-shrink-0 flex items-center gap-1.5"
            >
              {I.trash(13)}
              <span>Очистить кэш</span>
            </button>
          </div>

          {clearConfirmOpen && (
            <div className="p-3 rounded-xl bg-muted/60 border border-border space-y-2.5 animate-fade-in">
              <div className="flex items-start gap-2">
                <span className="text-base">⚠️</span>
                <div>
                  <p className="text-xs font-bold text-fg">
                    Очистить кэш данных приложения?
                  </p>
                  <p className="text-[11px] text-muted-fg mt-0.5">
                    Будут удалены временные буферы PDF, кэш новостей и
                    расписания. Ваши настройки группы, роли и темы оформления
                    сохранятся.
                  </p>
                </div>
              </div>
              <div className="flex gap-2 justify-end pt-1">
                <button
                  onClick={() => setClearConfirmOpen(false)}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-border bg-card text-muted-fg hover:text-fg cursor-pointer"
                >
                  Отмена
                </button>
                <button
                  onClick={handleClearCacheConfirm}
                  className="px-3 py-1.5 text-xs font-bold rounded-lg bg-red text-white hover:opacity-90 active:scale-95 transition-all cursor-pointer shadow-xs"
                >
                  Подтвердить очистку
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Official Android APK Release v1.0.1 */}
      <div className="bg-card border border-primary/25 rounded-2xl p-4 shadow-xs relative overflow-hidden tactile-card">
        <div className="flex items-start justify-between gap-3 mb-2.5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center text-white text-xl shadow-xs flex-shrink-0">
              {I.android(22, "text-white")}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-extrabold text-fg">
                  Официальный Android APK
                </span>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-primary/10 text-primary border border-primary/25">
                  v1.0.1
                </span>
              </div>
              <p className="text-xs text-muted-fg mt-0.5">
                Нативное приложение для Android-смартфонов и планшетов
              </p>
            </div>
          </div>
        </div>
        <p className="text-xs text-muted-fg leading-relaxed mb-3">
          Все 432 группы 8 институтов Тимирязевки, автономная работа без
          интернета, физика плавных анимаций, схема кампуса и ночная авто-сверка
          расписания.
        </p>
        <div className="flex flex-col sm:flex-row gap-2">
          <a
            href="./rgau-raspos-v1.0.1.apk"
            download="rgau-raspos-v1.0.1.apk"
            className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-primary text-white text-xs font-bold shadow-xs hover:bg-primary-light active:scale-[0.98] transition-all cursor-pointer"
          >
            {I.download(15)}
            <span>Скачать APK напрямую (6.5 МБ)</span>
          </a>
          <a
            href="https://github.com/p44978180-del/raspos/releases/download/v1.0.1/rgau-raspos-v1.0.1.apk"
            download="rgau-raspos-v1.0.1.apk"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl border border-primary/30 bg-primary/5 text-primary hover:bg-primary/10 text-xs font-semibold active:scale-[0.98] transition-all cursor-pointer"
          >
            {I.download(13)}
            <span>Зеркало GitHub</span>
          </a>
          <a
            href="https://github.com/p44978180-del/raspos/releases/tag/v1.0.1"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl border border-border bg-card text-muted-fg hover:text-fg text-xs font-semibold hover:border-primary/40 active:scale-[0.98] transition-all cursor-pointer"
          >
            {I.ext(13)}
            <span>Релиз</span>
          </a>
        </div>
        <div className="mt-3 pt-2.5 border-t border-border/60 flex items-start gap-2 text-[11px] text-muted-fg leading-relaxed">
          <span className="text-primary mt-0.5 flex-shrink-0">
            {I.sparkle(13)}
          </span>
          <span>
            В Telegram или VK: нажмите меню вверху (три точки ⋮) и выберите
            «Открыть в браузере» для прямой загрузки установочного файла.
          </span>
        </div>
      </div>

      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          {I.ext(13, "text-muted-fg")}
          <span className="text-sm font-bold text-fg">
            Сервисы и ресурсы РГАУ-МСХА
          </span>
        </div>
        {[
          {
            label: "Личный кабинет обучающегося (ЭИОС)",
            sub: "edu.timacad.ru · Электронная зачётка и портфолио",
            href: "https://edu.timacad.ru",
          },
          {
            label: "СДО Moodle РГАУ-МСХА",
            sub: "moodle.timacad.ru · Учебные курсы, тесты и задания",
            href: "https://moodle.timacad.ru",
          },
          {
            label: "Научная библиотека им. Н.И. Железнова",
            sub: "elib.timacad.ru · ЭБС, фонд учебников и периодики",
            href: "https://elib.timacad.ru",
          },
          {
            label: "Профком студентов (ППОС РГАУ-МСХА)",
            sub: "t.me/profcom_timacad · Социальные карты, матпомощь, льготы",
            href: "https://t.me/profcom_timacad",
          },
          {
            label: "Официальный Telegram Тимирязевки",
            sub: "t.me/timacad_live · Главные новости и важные оповещения",
            href: "https://t.me/timacad_live",
          },
          {
            label: "Официальная группа ВКонтакте",
            sub: "vk.com/timacad · Студенческая жизнь и анонсы",
            href: "https://vk.com/timacad",
          },
          {
            label: "Студенческий городок и общежития",
            sub: "timacad.ru · Паспортный стол, коменданты, график",
            href: "https://www.timacad.ru/life/studencheskii-gorodok",
          },
          {
            label: "Спортивный клуб «Тимирязевские Зубры»",
            sub: "timacad.ru/life/sport · Бассейн и 24 спортивные секции",
            href: "https://www.timacad.ru/life/sport",
          },
          {
            label: "Центр карьеры и практики в АПК",
            sub: "timacad.ru/life/karera · Вакансии агрохолдингов и стажировки",
            href: "https://www.timacad.ru/life/karera",
          },
          {
            label: "Деканаты и дирекции институтов",
            sub: "Пн–Пт 10:00–17:00 · Контакты дирекций и учебных отделов",
            href: "https://www.timacad.ru/education/instituty-i-fakultety",
          },
          {
            label: "Единая справочная и горячая линия",
            sub: "+7 (499) 976-04-80 · Справочная университета",
            href: "https://www.timacad.ru/contacts",
          },
        ].map((item) => (
          <div
            key={item.label}
            className={`flex items-center gap-3 px-4 py-3 border-b border-border last:border-0 ${
              item.href ? "hover:bg-muted cursor-pointer" : ""
            } transition-colors`}
            onClick={() => item.href && window.open(item.href, "_blank")}
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-fg">{item.label}</p>
              <p className="text-xs text-muted-fg">{item.sub}</p>
            </div>
            {item.href && I.ext(12, "text-muted-fg flex-shrink-0")}
          </div>
        ))}
      </div>
    </div>
  )
}
