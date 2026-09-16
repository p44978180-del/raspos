import React, { useState } from "react"
import { Sheet } from "../../../shared/ui/Sheet"
import { I } from "../../../shared/ui/Icons"
import { TYPE_CFG } from "../../../entities/lesson/lib/typeConfig"
import type {
  ClassItem,
  Homework,
  PersonalNote,
  UserRole,
  KonspektEntry,
  KonspektFile,
} from "../../../entities/lesson/model/types"

export interface HomeworkSheetProps {
  cls: ClassItem
  homework?: Homework
  personal?: PersonalNote
  role: UserRole
  konspekt?: KonspektEntry
  onClose: () => void
  onHwChange: (h: Homework) => void
  onPnChange: (n: PersonalNote) => void
  onKonspektChange: (classId: number, k: KonspektEntry) => void
}

export function HomeworkSheet({
  cls,
  homework,
  personal,
  role,
  konspekt,
  onClose,
  onHwChange,
  onPnChange,
  onKonspektChange,
}: HomeworkSheetProps) {
  const [tab, setTab] = useState<"group" | "personal" | "konspekt">("group")
  const [editing, setEditing] = useState(false)
  const [draftText, setDraftText] = useState(homework?.text ?? "")
  const [draftDl, setDraftDl] = useState(homework?.deadline ?? "")
  const [draftLink, setDraftLink] = useState(homework?.link ?? "")
  const [hwDone, setHwDone] = useState(false)
  const [newTodo, setNewTodo] = useState("")
  const [draftKonspekt, setDraftKonspekt] = useState(konspekt?.text ?? "")
  const [editingKonspekt, setEditingKonspekt] = useState(false)
  const [konspektFiles, setKonspektFiles] = useState<KonspektFile[]>(
    konspekt?.files ?? [],
  )
  const todos = personal?.todos ?? []

  function save() {
    onHwChange({
      classId: cls.id,
      text: draftText,
      deadline: draftDl,
      link: draftLink || undefined,
      linkLabel: "Ссылка на материалы",
      author: "Анна К. (Староста)",
      updatedAt: "Только что",
    })
    setEditing(false)
  }
  function toggle(id: number) {
    onPnChange({
      classId: cls.id,
      todos: todos.map((t) => (t.id === id ? { ...t, done: !t.done } : t)),
    })
  }
  function add() {
    if (!newTodo.trim()) return
    onPnChange({
      classId: cls.id,
      todos: [...todos, { id: Date.now(), text: newTodo.trim(), done: false }],
    })
    setNewTodo("")
  }
  function del(id: number) {
    onPnChange({ classId: cls.id, todos: todos.filter((t) => t.id !== id) })
  }

  function handleKFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files) return
    const newF: KonspektFile[] = Array.from(files).map((f) => ({
      name: f.name,
      size:
        f.size > 1024 * 1024
          ? `${(f.size / 1024 / 1024).toFixed(1)} МБ`
          : `${Math.round(f.size / 1024)} КБ`,
      date: new Date().toLocaleDateString("ru-RU", {
        day: "numeric",
        month: "short",
      }),
    }))
    const updated = [...newF, ...konspektFiles]
    setKonspektFiles(updated)
    onKonspektChange(cls.id, { text: konspekt?.text ?? "", files: updated })
    e.target.value = ""
  }

  function saveKonspekt() {
    const entry = { text: draftKonspekt, files: konspektFiles }
    onKonspektChange(cls.id, entry)
    setEditingKonspekt(false)
  }

  return (
    <Sheet onClose={onClose}>
      <div className="px-4 pb-2 pt-1 flex items-start justify-between flex-shrink-0">
        <div>
          <p className="text-xs text-muted-fg font-semibold uppercase tracking-wider">
            {TYPE_CFG[cls.type].label} · Пара {cls.num}
          </p>
          <h2 className="text-base font-bold text-fg mt-0.5">{cls.subject}</h2>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-xl hover:bg-muted text-muted-fg cursor-pointer"
        >
          {I.close(18)}
        </button>
      </div>
      <div className="px-4 pb-3">
        <div className="flex bg-muted rounded-xl p-0.5 gap-0.5">
          {(["group", "personal", "konspekt"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2 text-[11px] font-semibold rounded-lg transition-all cursor-pointer ${
                tab === t
                  ? "bg-primary text-white shadow-sm"
                  : "text-muted-fg hover:text-fg"
              }`}
            >
              {t === "group"
                ? "ДЗ группы"
                : t === "personal"
                  ? "Заметки"
                  : "Конспект"}
            </button>
          ))}
        </div>
      </div>
      <div className="px-4 pb-8">
        {tab === "group" ? (
          homework && !editing ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-fg">
                  {homework.author} · {homework.updatedAt}
                </p>
                {role === "headstudent" && (
                  <button
                    onClick={() => {
                      setEditing(true)
                      setDraftText(homework.text)
                      setDraftDl(homework.deadline)
                      setDraftLink(homework.link ?? "")
                    }}
                    className="flex items-center gap-1 text-xs text-primary font-semibold cursor-pointer"
                  >
                    {I.pencil(12)} Ред.
                  </button>
                )}
              </div>
              <p className="text-sm text-fg leading-relaxed bg-muted rounded-xl px-3 py-3">
                {homework.text}
              </p>
              {homework.deadline && (
                <div className="flex items-center gap-2 text-xs font-semibold text-amber bg-amber-bg border border-amber/20 rounded-xl px-3 py-2">
                  {I.clock(13)} Дедлайн: {homework.deadline}
                </div>
              )}
              {homework.link && (
                <a
                  href={homework.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-xs text-primary font-semibold border border-border rounded-xl px-3 py-2.5 bg-card hover:border-accent/50 transition-colors"
                >
                  {I.link(12)} {homework.linkLabel ?? "Материалы"}
                  {I.ext(11, "ml-auto text-muted-fg")}
                </a>
              )}
              <button
                onClick={() => setHwDone((d) => !d)}
                className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold border transition-all cursor-pointer ${
                  hwDone
                    ? "bg-muted border-accent text-primary"
                    : "bg-card border-border text-fg hover:border-accent/50"
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${
                    hwDone ? "bg-primary border-primary" : "border-border"
                  }`}
                >
                  {hwDone && I.check(11, "text-white")}
                </div>
                {hwDone ? "Выполнено" : "Отметить как выполненное"}
              </button>
            </div>
          ) : editing ? (
            <div className="space-y-3">
              <textarea
                value={draftText}
                onChange={(e) => setDraftText(e.target.value)}
                placeholder="Описание задания..."
                className="w-full border border-border rounded-xl px-3 py-3 text-sm focus:outline-none focus:border-accent resize-none bg-card text-fg"
                rows={4}
              />
              <input
                value={draftDl}
                onChange={(e) => setDraftDl(e.target.value)}
                placeholder="Дедлайн (необязательно)"
                className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-accent bg-card text-fg"
              />
              <input
                value={draftLink}
                onChange={(e) => setDraftLink(e.target.value)}
                placeholder="Ссылка на материалы (опционально)"
                className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-accent bg-card text-fg"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => setEditing(false)}
                  className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold text-muted-fg cursor-pointer"
                >
                  Отмена
                </button>
                <button
                  onClick={save}
                  className="flex-1 py-2.5 rounded-xl bg-primary text-white text-sm font-bold cursor-pointer"
                >
                  Сохранить
                </button>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 space-y-3">
              <p className="text-sm font-semibold text-fg">Задания нет</p>
              {role === "headstudent" && (
                <button
                  onClick={() => {
                    setEditing(true)
                    setDraftText("")
                    setDraftDl("")
                    setDraftLink("")
                  }}
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary border border-primary rounded-xl px-4 py-2.5 hover:bg-muted transition-colors cursor-pointer"
                >
                  {I.plus(13)} Добавить задание
                </button>
              )}
            </div>
          )
        ) : tab === "personal" ? (
          <div className="space-y-3">
            {todos.length === 0 && (
              <p className="text-xs text-muted-fg text-center py-4">
                Добавьте личные заметки
              </p>
            )}
            {todos.map((todo) => (
              <div key={todo.id} className="flex items-center gap-3 group">
                <button
                  onClick={() => toggle(todo.id)}
                  className={`w-5 h-5 rounded-md border-2 flex-shrink-0 flex items-center justify-center transition-all cursor-pointer ${
                    todo.done
                      ? "bg-primary border-primary"
                      : "border-border hover:border-accent"
                  }`}
                >
                  {todo.done && I.check(10, "text-white")}
                </button>
                <span
                  className={`flex-1 text-sm ${
                    todo.done ? "line-through text-muted-fg" : "text-fg"
                  }`}
                >
                  {todo.text}
                </span>
                <button
                  onClick={() => del(todo.id)}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded-lg hover:bg-muted text-muted-fg transition-opacity cursor-pointer"
                >
                  {I.close(13)}
                </button>
              </div>
            ))}
            <div className="flex gap-2 pt-1">
              <input
                value={newTodo}
                onChange={(e) => setNewTodo(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") add()
                }}
                placeholder="Добавить заметку..."
                className="flex-1 border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-accent bg-card text-fg placeholder:text-muted-fg"
              />
              <button
                onClick={add}
                className="px-3 py-2 bg-primary text-white rounded-xl cursor-pointer"
              >
                {I.plus(14, "text-white")}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-muted-fg">
              Конспект именно этой пары — только для вас
            </p>
            <label className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-accent/40 bg-muted/50 hover:bg-muted rounded-2xl py-3 cursor-pointer transition-colors">
              <input
                type="file"
                className="hidden"
                multiple
                accept=".pdf,.doc,.docx,.jpg,.png,.zip,.txt"
                onChange={handleKFiles}
              />
              {I.upload(14, "text-primary")}
              <span className="text-sm font-semibold text-primary">
                Прикрепить файл
              </span>
            </label>
            {konspektFiles.length > 0 && (
              <div className="space-y-1.5">
                {konspektFiles.map((f, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 bg-card border border-border rounded-xl px-3 py-2.5"
                  >
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-muted text-primary uppercase">
                      {f.name.split(".").pop() ?? ""}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-fg truncate">
                        {f.name}
                      </p>
                      <p className="text-xs text-muted-fg">
                        {f.size} · {f.date}
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        const updated = konspektFiles.filter((_, j) => j !== i)
                        setKonspektFiles(updated)
                        onKonspektChange(cls.id, {
                          text: konspekt?.text ?? "",
                          files: updated,
                        })
                      }}
                      className="p-1 rounded-lg hover:bg-muted text-muted-fg cursor-pointer"
                    >
                      {I.close(13)}
                    </button>
                  </div>
                ))}
              </div>
            )}
            {editingKonspekt ? (
              <div className="space-y-2">
                <textarea
                  value={draftKonspekt}
                  onChange={(e) => setDraftKonspekt(e.target.value)}
                  placeholder="Ключевые мысли, определения, формулы..."
                  className="w-full border border-border rounded-xl px-3 py-3 text-sm focus:outline-none focus:border-accent resize-none bg-card text-fg"
                  rows={6}
                  autoFocus
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setEditingKonspekt(false)
                      setDraftKonspekt(konspekt?.text ?? "")
                    }}
                    className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold text-muted-fg cursor-pointer"
                  >
                    Отмена
                  </button>
                  <button
                    onClick={saveKonspekt}
                    className="flex-1 py-2.5 rounded-xl bg-primary text-white text-sm font-bold cursor-pointer"
                  >
                    Сохранить
                  </button>
                </div>
              </div>
            ) : konspekt?.text ? (
              <div className="space-y-2">
                <div className="bg-muted rounded-xl px-3 py-3 text-sm text-fg whitespace-pre-wrap leading-relaxed">
                  {konspekt.text}
                </div>
                <button
                  onClick={() => {
                    setDraftKonspekt(konspekt.text)
                    setEditingKonspekt(true)
                  }}
                  className="flex items-center gap-1.5 text-xs font-semibold text-primary cursor-pointer"
                >
                  {I.pencil(12)} Редактировать
                </button>
              </div>
            ) : (
              <div className="text-center py-4 space-y-2">
                <p className="text-sm text-muted-fg">
                  {konspektFiles.length > 0
                    ? "Добавьте текстовые заметки к файлам"
                    : "Текстовый конспект пока пуст"}
                </p>
                <button
                  onClick={() => {
                    setDraftKonspekt("")
                    setEditingKonspekt(true)
                  }}
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary border border-primary rounded-xl px-4 py-2 hover:bg-muted transition-colors cursor-pointer"
                >
                  {I.note(13)} Написать конспект
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </Sheet>
  )
}
