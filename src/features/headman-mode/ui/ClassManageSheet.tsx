import React, { useState } from "react"
import { Sheet } from "../../../shared/ui/Sheet"
import { I } from "../../../shared/ui/Icons"
import { BIDS, BGEN } from "../../../entities/lesson/lib/location"
import { getWalk } from "../../../entities/campus/model/campusData"
import type { ClassItem, ClassEdit } from "../../../entities/lesson/model/types"

const CANCEL_REASONS = [
  "Болезнь преподавателя",
  "Перенос занятия",
  "Самостоятельная работа",
  "Другая причина",
]

const DISPLACED_OPTIONS = [
  "Слот был свободен",
  "Пара отменена",
  "Пара перенесена на другой день",
  "Другое",
]

export interface ClassManageSheetProps {
  cls: ClassItem
  edit: ClassEdit | undefined
  onSave: (e: ClassEdit) => void
  onClose: () => void
  onToast: (msg: string, type: "info" | "success" | "warn") => void
}

export function ClassManageSheet({
  cls,
  edit,
  onSave,
  onClose,
  onToast,
}: ClassManageSheetProps) {
  const [action, setAction] =
    useState<"cancel" | "room" | "teacher" | "time" | "move" | null>(null)
  const [moveStep, setMoveStep] = useState<"pick" | "displaced">("pick")
  const [displacedOption, setDisplacedOption] = useState(DISPLACED_OPTIONS[0])
  const [pendingEdit, setPendingEdit] = useState<ClassEdit | null>(null)
  const [reason, setReason] = useState(CANCEL_REASONS[0])
  const [note, setNote] = useState(edit?.cancelNote ?? "")
  const [room, setRoom] = useState(edit?.room ?? cls.room)
  const [building, setBuilding] = useState(edit?.building ?? cls.building)
  const [teacher, setTeacher] = useState(edit?.teacher ?? cls.teacher)
  const [startT, setStartT] = useState(edit?.startOverride ?? cls.start)
  const [endT, setEndT] = useState(edit?.endOverride ?? cls.end)
  const [moveDay, setMoveDay] = useState(edit?.dayOverride ?? "Понедельник")
  const [moveNum, setMoveNum] = useState<number>(edit?.numOverride ?? cls.num)
  const isCancelled = edit?.cancelled ?? false
  const buildings = Object.keys(BIDS)
  const walk = getWalk(cls.building, building)
  const DAYS = [
    "Понедельник",
    "Вторник",
    "Среда",
    "Четверг",
    "Пятница",
    "Суббота",
  ]

  function save() {
    if (action === "cancel") {
      onSave({
        ...edit,
        cancelled: !isCancelled,
        cancelReason: reason,
        cancelNote: note,
      })
      onToast(
        !isCancelled
          ? `Пара «${cls.subject}» отменена — группа уведомлена`
          : `Пара «${cls.subject}» восстановлена`,
        !isCancelled ? "warn" : "success",
      )
    } else if (action === "room") {
      onSave({ ...edit, building, room })
      onToast(`Аудитория изменена: ${building}, ауд. ${room}`, "info")
    } else if (action === "teacher") {
      onSave({ ...edit, teacher })
      onToast(`Замена преподавателя: ${teacher}`, "info")
    } else if (action === "time") {
      onSave({ ...edit, startOverride: startT, endOverride: endT })
      onToast(`Время пары изменено: ${startT}–${endT}`, "warn")
    } else if (action === "move") {
      const e = { ...edit, dayOverride: moveDay, numOverride: moveNum }
      setPendingEdit(e)
      setMoveStep("displaced")
      return
    }
    onClose()
  }

  function confirmDisplaced() {
    if (pendingEdit) {
      onSave({ ...pendingEdit, displacedNote: displacedOption })
      onToast(
        `«${cls.subject}» перенесена на ${moveDay}, п.${moveNum} — группа уведомлена`,
        "warn",
      )
    }
    onClose()
  }

  if (action === "move" && moveStep === "displaced") {
    return (
      <Sheet onClose={onClose} title="Уточнение переноса">
        <div className="px-4 pb-8 space-y-3">
          <p className="text-sm text-fg">
            Что происходит с{" "}
            <span className="font-bold">
              парой {moveNum} в {moveDay}
            </span>
            ?
          </p>
          <div className="space-y-1.5">
            {DISPLACED_OPTIONS.map((opt) => (
              <button
                key={opt}
                onClick={() => setDisplacedOption(opt)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl border transition-all cursor-pointer ${
                  displacedOption === opt
                    ? "border-accent bg-muted"
                    : "border-border bg-card hover:border-accent/40"
                }`}
              >
                <div
                  className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${
                    displacedOption === opt ? "border-primary" : "border-border"
                  }`}
                >
                  {displacedOption === opt && (
                    <div className="w-2 h-2 rounded-full bg-primary" />
                  )}
                </div>
                <span
                  className={`text-sm font-medium ${
                    displacedOption === opt ? "text-primary" : "text-fg"
                  }`}
                >
                  {opt}
                </span>
              </button>
            ))}
          </div>
          <p className="text-[11px] text-muted-fg bg-muted rounded-xl px-3 py-2">
            Информация войдёт в уведомление группе
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setMoveStep("pick")}
              className="flex-1 py-3 rounded-2xl border border-border text-sm font-semibold text-muted-fg cursor-pointer"
            >
              Назад
            </button>
            <button
              onClick={confirmDisplaced}
              className="flex-1 py-3 bg-primary text-white rounded-2xl text-sm font-bold cursor-pointer"
            >
              Подтвердить перенос
            </button>
          </div>
        </div>
      </Sheet>
    )
  }

  return (
    <Sheet onClose={onClose} title="Управление парой">
      <div className="px-4 pb-8 space-y-2">
        <p className="text-xs text-muted-fg mb-1">
          Пара {cls.num} · {cls.subject}
        </p>
        {!action ? (
          <>
            {[
              {
                id: "cancel",
                icon: I.ban(16, "text-red flex-shrink-0"),
                label: isCancelled
                  ? "Восстановить занятие"
                  : "Отменить занятие",
                sub: "Выбор причины + уведомление группе",
                danger: true,
              },
              {
                id: "time",
                icon: I.clock(16, "text-muted-fg flex-shrink-0"),
                label: "Изменить время пары",
                sub: "Сдвинуть начало/конец",
              },
              {
                id: "move",
                icon: I.cal(16, "text-muted-fg flex-shrink-0"),
                label: "Перенести на другой день",
                sub: "Изменить день и номер пары",
              },
              {
                id: "room",
                icon: I.bldg(16, "text-muted-fg flex-shrink-0"),
                label: "Сменить аудиторию",
                sub: "Корпус и номер аудитории",
              },
              {
                id: "teacher",
                icon: I.user(16, "text-muted-fg flex-shrink-0"),
                label: "Заменить преподавателя",
                sub: "Временная замена на одну пару",
              },
            ].map((item) => (
              <button
                key={item.id}
                onClick={() =>
                  setAction(
                    item.id as "cancel" | "room" | "teacher" | "time" | "move",
                  )
                }
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl border transition-all cursor-pointer ${
                  item.danger
                    ? "border-border bg-card hover:border-red/40"
                    : "border-border bg-card hover:border-accent/40"
                }`}
              >
                {item.icon}
                <div className="text-left">
                  <p className="text-sm font-semibold text-fg">{item.label}</p>
                  <p className="text-xs text-muted-fg">{item.sub}</p>
                </div>
              </button>
            ))}
          </>
        ) : action === "cancel" ? (
          <div className="space-y-3">
            <button
              onClick={() => setAction(null)}
              className="flex items-center gap-1 text-xs text-muted-fg hover:text-fg cursor-pointer"
            >
              {I.chev("left", 12)} Назад
            </button>
            {!isCancelled && (
              <div className="space-y-1.5">
                {CANCEL_REASONS.map((r) => (
                  <button
                    key={r}
                    onClick={() => setReason(r)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all cursor-pointer ${
                      reason === r
                        ? "border-accent bg-muted"
                        : "border-border bg-card hover:border-accent/40"
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                        reason === r ? "border-primary" : "border-border"
                      }`}
                    >
                      {reason === r && (
                        <div className="w-2 h-2 rounded-full bg-primary" />
                      )}
                    </div>
                    <span
                      className={`text-sm font-medium ${
                        reason === r ? "text-primary" : "text-fg"
                      }`}
                    >
                      {r}
                    </span>
                  </button>
                ))}
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Комментарий для группы (опционально)"
                  className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-accent bg-card text-fg resize-none"
                  rows={2}
                />
              </div>
            )}
            <button
              onClick={save}
              className={`w-full py-3 rounded-2xl text-sm font-bold text-white cursor-pointer ${
                isCancelled ? "bg-accent" : "bg-red"
              }`}
            >
              {isCancelled ? "Восстановить пару" : "Отменить занятие"}
            </button>
          </div>
        ) : action === "time" ? (
          <div className="space-y-3">
            <button
              onClick={() => setAction(null)}
              className="flex items-center gap-1 text-xs text-muted-fg cursor-pointer"
            >
              {I.chev("left", 12)} Назад
            </button>
            {(() => {
              const isValidTime = (t: string) =>
                /^([01]\d|2[0-3]):([0-5]\d)$/.test(t)
              const startErr = startT && !isValidTime(startT)
              const endErr = endT && !isValidTime(endT)
              const canSave = isValidTime(startT) && isValidTime(endT)
              return (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs text-muted-fg mb-1">Начало</p>
                      <input
                        type="time"
                        value={startT}
                        onChange={(e) => setStartT(e.target.value)}
                        className={`w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-accent bg-card text-fg ${
                          startErr ? "border-red" : "border-border"
                        }`}
                        style={{ fontFamily: "var(--font-mono)" }}
                      />
                      {startErr && (
                        <p className="text-[11px] text-red mt-1">
                          Формат: ЧЧ:ММ
                        </p>
                      )}
                    </div>
                    <div>
                      <p className="text-xs text-muted-fg mb-1">Конец</p>
                      <input
                        type="time"
                        value={endT}
                        onChange={(e) => setEndT(e.target.value)}
                        className={`w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-accent bg-card text-fg ${
                          endErr ? "border-red" : "border-border"
                        }`}
                        style={{ fontFamily: "var(--font-mono)" }}
                      />
                      {endErr && (
                        <p className="text-[11px] text-red mt-1">
                          Формат: ЧЧ:ММ
                        </p>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={save}
                    disabled={!canSave}
                    className={`w-full py-3 rounded-2xl text-sm font-bold text-white transition-opacity cursor-pointer ${
                      canSave
                        ? "bg-primary"
                        : "bg-primary opacity-40 cursor-not-allowed"
                    }`}
                  >
                    Сохранить
                  </button>
                </>
              )
            })()}
          </div>
        ) : action === "move" ? (
          <div className="space-y-3">
            <button
              onClick={() => setAction(null)}
              className="flex items-center gap-1 text-xs text-muted-fg cursor-pointer"
            >
              {I.chev("left", 12)} Назад
            </button>
            <div>
              <p className="text-xs text-muted-fg mb-1.5">День недели</p>
              <div className="flex flex-wrap gap-1.5">
                {DAYS.map((d) => {
                  const abbr =
                    ({
                      Понедельник: "Пн",
                      Вторник: "Вт",
                      Среда: "Ср",
                      Четверг: "Чт",
                      Пятница: "Пт",
                      Суббота: "Сб",
                    } as Record<string, string>)[d] ?? d.slice(0, 2)
                  return (
                    <button
                      key={d}
                      onClick={() => setMoveDay(d)}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-xl border transition-all cursor-pointer ${
                        moveDay === d
                          ? "bg-primary text-white border-primary"
                          : "bg-card border-border text-muted-fg hover:border-accent/40"
                      }`}
                    >
                      {abbr}
                    </button>
                  )
                })}
              </div>
            </div>
            <div>
              <p className="text-xs text-muted-fg mb-1.5">Номер пары</p>
              <div className="flex gap-1.5">
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <button
                    key={n}
                    onClick={() => setMoveNum(n)}
                    className={`w-9 h-9 text-sm font-bold rounded-xl border transition-all cursor-pointer ${
                      moveNum === n
                        ? "bg-primary text-white border-primary"
                        : "bg-card border-border text-muted-fg hover:border-accent/40"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <p className="text-[11px] text-amber bg-amber-bg border border-amber/20 rounded-xl px-3 py-2">
              После сохранения уточните детали переноса
            </p>
            <button
              onClick={save}
              className="w-full py-3 bg-primary text-white rounded-2xl text-sm font-bold cursor-pointer"
            >
              Далее →
            </button>
          </div>
        ) : action === "room" ? (
          <div className="space-y-3">
            <button
              onClick={() => setAction(null)}
              className="flex items-center gap-1 text-xs text-muted-fg cursor-pointer"
            >
              {I.chev("left", 12)} Назад
            </button>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {buildings.map((b) => (
                <button
                  key={b}
                  onClick={() => setBuilding(b)}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl border transition-all cursor-pointer ${
                    building === b
                      ? "border-accent bg-muted"
                      : "border-border bg-card hover:border-accent/40"
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                      building === b ? "border-primary" : "border-border"
                    }`}
                  >
                    {building === b && (
                      <div className="w-2 h-2 rounded-full bg-primary" />
                    )}
                  </div>
                  <span className="text-sm font-medium text-fg">{b}</span>
                </button>
              ))}
            </div>
            <input
              value={room}
              onChange={(e) => setRoom(e.target.value)}
              placeholder="Аудитория"
              className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-accent bg-card text-fg"
            />
            {building !== cls.building && walk !== null && walk > 0 && (
              <p className="text-xs text-amber bg-amber-bg border border-amber/20 rounded-xl px-3 py-2">
                Переход: {walk} мин от {BGEN[cls.building] ?? cls.building}
              </p>
            )}
            <button
              onClick={save}
              className="w-full py-3 bg-primary text-white rounded-2xl text-sm font-bold cursor-pointer"
            >
              Сохранить
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <button
              onClick={() => setAction(null)}
              className="flex items-center gap-1 text-xs text-muted-fg cursor-pointer"
            >
              {I.chev("left", 12)} Назад
            </button>
            <div>
              <p className="text-xs text-muted-fg mb-1">ФИО преподавателя</p>
              <input
                value={teacher}
                onChange={(e) => setTeacher(e.target.value)}
                className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-accent bg-card text-fg"
              />
            </div>
            <button
              onClick={save}
              className="w-full py-3 bg-primary text-white rounded-2xl text-sm font-bold cursor-pointer"
            >
              Сохранить
            </button>
          </div>
        )}
      </div>
    </Sheet>
  )
}
