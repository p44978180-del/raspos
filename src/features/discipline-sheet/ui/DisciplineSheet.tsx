import React, { useState } from "react"
import { Sheet } from "../../../shared/ui/Sheet"
import { I } from "../../../shared/ui/Icons"
import { getDefaultDiscipline } from "../../../entities/lesson/lib/disciplineData"
import type { UserRole } from "../../../entities/lesson/model/types"

export interface DisciplineSheetProps {
  subject: string
  teacher: string
  role?: UserRole
  onClose: () => void
}

export function DisciplineSheet({
  subject,
  teacher,
  role,
  onClose,
}: DisciplineSheetProps) {
  const isHead = role === "headstudent"
  const [tab, setTab] =
    useState<"about" | "materials" | "notes" | "literature">("about")
  const [notes, setNotes] = useState("")
  const [editingNotes, setEditingNotes] = useState(false)
  const [draftNotes, setDraftNotes] = useState("")
  const [editingAbout, setEditingAbout] = useState(false)
  const [aboutOverride, setAboutOverride] = useState<{
    department?: string
    consultations?: string
    exam?: string
    email?: string
    teacher?: string
  }>({})
  const [draftAbout, setDraftAbout] = useState({
    department: "",
    consultations: "",
    exam: "",
    email: "",
    teacher: "",
  })
  const [litItems, setLitItems] = useState<
    {
      title: string
      author: string
      year: number
      url: string
      library: string
    }[]
  >([])
  const [addingLit, setAddingLit] = useState(false)
  const [litForm, setLitForm] = useState({
    title: "",
    author: "",
    year: new Date().getFullYear(),
    url: "",
    library: "",
  })
  const [uploads, setUploads] = useState<
    {
      name: string
      size: string
      date: string
    }[]
  >([])
  const [extraContacts, setExtraContacts] = useState<
    {
      type: string
      value: string
    }[]
  >([])
  const [addingContact, setAddingContact] = useState(false)
  const [contactForm, setContactForm] = useState({ type: "Телефон", value: "" })
  const info = getDefaultDiscipline(subject)
  const fileIcon: Record<string, string> = {
    pdf: "PDF",
    doc: "DOC",
    zip: "ZIP",
  }

  const displayEmail =
    aboutOverride.email !== undefined ? aboutOverride.email : info.email
  const displayTeacher =
    aboutOverride.teacher !== undefined ? aboutOverride.teacher : teacher

  function openEdit() {
    setDraftAbout({
      department: aboutOverride.department ?? info.department,
      consultations: aboutOverride.consultations ?? info.consultations,
      exam: aboutOverride.exam ?? info.exam,
      email: displayEmail,
      teacher: displayTeacher,
    })
    setEditingAbout(true)
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files) return
    const newFiles = Array.from(files).map((f) => ({
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
    setUploads((u) => [...newFiles, ...u])
    e.target.value = ""
  }

  return (
    <Sheet onClose={onClose}>
      <div className="px-4 pb-2 pt-1 flex items-start justify-between flex-shrink-0">
        <div>
          <p className="text-xs text-muted-fg font-semibold uppercase tracking-wider">
            Дисциплина
          </p>
          <h2 className="text-base font-bold text-fg mt-0.5 pr-8">{subject}</h2>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-xl hover:bg-muted text-muted-fg flex-shrink-0 cursor-pointer"
        >
          {I.close(18)}
        </button>
      </div>
      <div className="px-4 pb-2">
        <div className="flex bg-muted rounded-xl p-0.5 gap-0.5">
          {[
            ["about", "О предмете"],
            ["materials", "Материалы"],
            ["notes", "Заметки"],
            ["literature", "Литература"],
          ].map(([t, l]) => (
            <button
              key={t}
              onClick={() => setTab(t as typeof tab)}
              className={`flex-1 py-1.5 text-[11px] font-semibold rounded-lg transition-all cursor-pointer ${
                tab === t
                  ? "bg-primary text-white shadow-sm"
                  : "text-muted-fg hover:text-fg"
              }`}
            >
              {l}
            </button>
          ))}
        </div>
      </div>
      <div className="px-4 pb-8">
        {tab === "about" && (
          <div className="space-y-2.5 pt-1">
            {isHead && !editingAbout && (
              <button
                onClick={openEdit}
                className="flex items-center gap-1.5 text-xs font-semibold text-primary border border-primary/30 rounded-xl px-3 py-1.5 hover:bg-muted transition-colors cursor-pointer"
              >
                {I.pencil(12)} Редактировать контакты и информацию
              </button>
            )}
            {editingAbout ? (
              <div className="space-y-2">
                {[
                  { key: "department" as const, label: "Кафедра" },
                  { key: "teacher" as const, label: "Преподаватель (ФИО)" },
                  { key: "email" as const, label: "Email преподавателя" },
                  { key: "consultations" as const, label: "Консультации" },
                  { key: "exam" as const, label: "Форма аттестации" },
                ].map(({ key, label }) => (
                  <div key={key}>
                    <p className="text-[11px] text-muted-fg mb-1">{label}</p>
                    <input
                      value={draftAbout[key]}
                      onChange={(e) =>
                        setDraftAbout((p) => ({
                          ...p,
                          [key]: e.target.value,
                        }))
                      }
                      className="w-full border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-accent bg-card text-fg"
                    />
                  </div>
                ))}
                <div className="flex gap-2">
                  <button
                    onClick={() => setEditingAbout(false)}
                    className="flex-1 py-2 rounded-xl border border-border text-sm font-semibold text-muted-fg cursor-pointer"
                  >
                    Отмена
                  </button>
                  <button
                    onClick={() => {
                      setAboutOverride(draftAbout)
                      setEditingAbout(false)
                    }}
                    className="flex-1 py-2 bg-primary text-white rounded-xl text-sm font-bold cursor-pointer"
                  >
                    Сохранить
                  </button>
                </div>
              </div>
            ) : (
              <>
                {[
                  {
                    label: "Кафедра",
                    value: aboutOverride.department ?? info.department,
                  },
                  { label: "Преподаватель", value: displayTeacher },
                  {
                    label: "Консультации",
                    value: aboutOverride.consultations ?? info.consultations,
                  },
                  {
                    label: "Аттестация",
                    value: aboutOverride.exam ?? info.exam,
                  },
                ].map((row) => (
                  <div
                    key={row.label}
                    className="bg-muted rounded-xl px-3 py-2.5"
                  >
                    <p className="text-[11px] text-muted-fg font-semibold uppercase tracking-wide">
                      {row.label}
                    </p>
                    <p className="text-sm text-fg mt-0.5">{row.value}</p>
                  </div>
                ))}
                {displayEmail && (
                  <a
                    href={`mailto:${displayEmail}`}
                    className="flex items-center gap-2 text-sm font-semibold text-primary border border-border rounded-xl px-3 py-2.5 bg-card hover:border-accent/50 transition-colors"
                  >
                    {I.mail(13, "text-primary")} {displayEmail}
                  </a>
                )}
                {extraContacts.map((c, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 bg-card border border-border rounded-xl px-3 py-2.5"
                  >
                    <span className="text-xs font-bold text-muted-fg bg-muted px-1.5 py-0.5 rounded">
                      {c.type}
                    </span>
                    <span className="text-sm text-fg flex-1">{c.value}</span>
                    {isHead && (
                      <button
                        onClick={() =>
                          setExtraContacts((p) => p.filter((_, j) => j !== i))
                        }
                        className="p-1 rounded-lg hover:bg-muted text-muted-fg cursor-pointer"
                      >
                        {I.close(12)}
                      </button>
                    )}
                  </div>
                ))}
                {isHead &&
                  !editingAbout &&
                  (addingContact ? (
                    <div className="bg-muted rounded-xl p-3 space-y-2">
                      <div className="flex gap-1.5 flex-wrap">
                        {["Телефон", "Telegram", "ВКонтакте", "Сайт"].map(
                          (t) => (
                            <button
                              key={t}
                              onClick={() =>
                                setContactForm((f) => ({ ...f, type: t }))
                              }
                              className={`px-2.5 py-1 text-xs font-semibold rounded-xl border transition-all cursor-pointer ${
                                contactForm.type === t
                                  ? "bg-primary text-white border-primary"
                                  : "bg-card border-border text-muted-fg"
                              }`}
                            >
                              {t}
                            </button>
                          ),
                        )}
                      </div>
                      <input
                        value={contactForm.value}
                        onChange={(e) =>
                          setContactForm((f) => ({
                            ...f,
                            value: e.target.value,
                          }))
                        }
                        placeholder={`${contactForm.type}...`}
                        className="w-full border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-accent bg-card text-fg"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => setAddingContact(false)}
                          className="flex-1 py-1.5 rounded-xl border border-border text-xs font-semibold text-muted-fg cursor-pointer"
                        >
                          Отмена
                        </button>
                        <button
                          onClick={() => {
                            if (contactForm.value.trim()) {
                              setExtraContacts((p) => [...p, contactForm])
                              setContactForm({ type: "Телефон", value: "" })
                              setAddingContact(false)
                            }
                          }}
                          className="flex-1 py-1.5 bg-primary text-white rounded-xl text-xs font-bold cursor-pointer"
                        >
                          Добавить
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setAddingContact(true)}
                      className="flex items-center gap-1.5 text-xs font-semibold text-primary cursor-pointer"
                    >
                      {I.plus(12)} Добавить контакт преподавателя
                    </button>
                  ))}
              </>
            )}
          </div>
        )}
        {tab === "materials" && (
          <div className="space-y-2 pt-1">
            <label className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-accent/40 bg-muted/60 rounded-2xl py-4 cursor-pointer hover:bg-muted transition-colors">
              <input
                type="file"
                className="hidden"
                multiple
                onChange={handleFileInput}
                accept=".pdf,.doc,.docx,.zip,.jpg,.png"
              />
              {I.plus(15, "text-primary")}
              <span className="text-sm font-semibold text-primary">
                Загрузить материал
              </span>
            </label>
            {uploads.map((u, i) => (
              <div
                key={i}
                className="flex items-center gap-3 bg-card border border-border rounded-xl px-3 py-3"
              >
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-muted text-primary uppercase">
                  {u.name.split(".").pop() ?? ""}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-fg truncate">
                    {u.name}
                  </p>
                  <p className="text-xs text-muted-fg">
                    {u.size} · {u.date}
                  </p>
                </div>
                <button
                  onClick={() =>
                    setUploads((up) => up.filter((_, j) => j !== i))
                  }
                  className="p-1.5 rounded-lg hover:bg-muted text-muted-fg cursor-pointer"
                >
                  {I.close(13)}
                </button>
              </div>
            ))}
            {info.materials.length === 0 && uploads.length === 0 ? (
              <p className="text-sm text-muted-fg text-center py-4">
                Материалов пока нет
              </p>
            ) : (
              info.materials.map((m) => (
                <a
                  key={m.name}
                  href={m.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 bg-card border border-border rounded-xl px-3 py-3 hover:border-accent/50 transition-colors"
                >
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-muted text-muted-fg">
                    {fileIcon[m.type] ?? m.type.toUpperCase()}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-fg truncate">
                      {m.name}
                    </p>
                  </div>
                  {I.ext(12, "text-muted-fg flex-shrink-0")}
                </a>
              ))
            )}
          </div>
        )}
        {tab === "notes" && (
          <div className="space-y-3 pt-1">
            {editingNotes ? (
              <div className="space-y-2">
                <textarea
                  value={draftNotes}
                  onChange={(e) => setDraftNotes(e.target.value)}
                  placeholder="Общие заметки, важные даты..."
                  className="w-full border border-border rounded-xl px-3 py-3 text-sm focus:outline-none focus:border-accent resize-none bg-card text-fg"
                  rows={6}
                  autoFocus
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => setEditingNotes(false)}
                    className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold text-muted-fg cursor-pointer"
                  >
                    Отмена
                  </button>
                  <button
                    onClick={() => {
                      setNotes(draftNotes)
                      setEditingNotes(false)
                    }}
                    className="flex-1 py-2.5 rounded-xl bg-primary text-white text-sm font-bold cursor-pointer"
                  >
                    Сохранить
                  </button>
                </div>
              </div>
            ) : notes ? (
              <div className="space-y-2">
                <div className="bg-muted rounded-xl px-3 py-3 text-sm text-fg whitespace-pre-wrap">
                  {notes}
                </div>
                {isHead && (
                  <button
                    onClick={() => {
                      setDraftNotes(notes)
                      setEditingNotes(true)
                    }}
                    className="flex items-center gap-1.5 text-xs font-semibold text-primary cursor-pointer"
                  >
                    {I.pencil(12)} Редактировать
                  </button>
                )}
              </div>
            ) : isHead ? (
              <div className="text-center py-8 space-y-3">
                <p className="text-sm text-muted-fg">Заметок пока нет</p>
                <button
                  onClick={() => {
                    setDraftNotes("")
                    setEditingNotes(true)
                  }}
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary border border-primary rounded-xl px-4 py-2.5 hover:bg-muted transition-colors cursor-pointer"
                >
                  {I.plus(13)} Добавить
                </button>
              </div>
            ) : (
              <p className="text-sm text-muted-fg text-center py-8">
                Заметок пока нет
              </p>
            )}
          </div>
        )}
        {tab === "literature" && (
          <div className="space-y-2 pt-1">
            {isHead &&
              (addingLit ? (
                <div className="bg-muted rounded-2xl p-3 space-y-2">
                  {(["title", "author", "library", "url"] as const).map((k) => (
                    <input
                      key={k}
                      value={litForm[k]}
                      onChange={(e) =>
                        setLitForm((f) => ({ ...f, [k]: e.target.value }))
                      }
                      placeholder={
                        {
                          title: "Название",
                          author: "Автор",
                          library: "Источник (ЭБС...)",
                          url: "Ссылка",
                        }[k]
                      }
                      className="w-full border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-accent bg-card text-fg"
                    />
                  ))}
                  <input
                    type="number"
                    value={litForm.year}
                    onChange={(e) =>
                      setLitForm((f) => ({
                        ...f,
                        year: Number(e.target.value),
                      }))
                    }
                    placeholder="Год"
                    className="w-full border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-accent bg-card text-fg"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => setAddingLit(false)}
                      className="flex-1 py-2 rounded-xl border border-border text-sm font-semibold text-muted-fg cursor-pointer"
                    >
                      Отмена
                    </button>
                    <button
                      onClick={() => {
                        if (litForm.title.trim()) {
                          setLitItems((p) => [...p, { ...litForm }])
                          setLitForm({
                            title: "",
                            author: "",
                            year: new Date().getFullYear(),
                            url: "",
                            library: "",
                          })
                          setAddingLit(false)
                        }
                      }}
                      className="flex-1 py-2 bg-primary text-white rounded-xl text-sm font-bold cursor-pointer"
                    >
                      Добавить
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setAddingLit(true)}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-2xl border border-dashed border-accent/40 text-sm font-semibold text-primary hover:bg-muted transition-colors cursor-pointer"
                >
                  {I.plus(13)} Добавить литературу
                </button>
              ))}
            {[...info.literature, ...litItems].length === 0 ? (
              <p className="text-sm text-muted-fg text-center py-6">
                Не заполнено
              </p>
            ) : (
              [...info.literature, ...litItems].map((lit, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 bg-card border border-border rounded-xl px-3 py-3"
                >
                  {I.book(18, "text-primary flex-shrink-0 mt-0.5")}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-fg leading-snug">
                      {lit.title}
                    </p>
                    <p className="text-xs text-muted-fg">
                      {lit.author}, {lit.year}
                    </p>
                    <p className="text-[11px] text-accent font-semibold mt-0.5">
                      {lit.library}
                    </p>
                  </div>
                  {lit.url && (
                    <a
                      href={lit.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="flex-shrink-0 mt-1"
                    >
                      {I.ext(12, "text-muted-fg hover:text-primary")}
                    </a>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </Sheet>
  )
}
