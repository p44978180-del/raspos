import { useState } from "react"
import { parseBackup, mergeBackup } from "../../lib/personal-backup"
import { type StudentData, updateStudent } from "../../lib/student-store"
import Icon from "./Icon"
export default function BackupRestore({ current, ready, onDone }: { current: StudentData; ready: boolean; onDone: () => void }) {
  const [backup,setBackup] = useState<StudentData | null>(null), [error,setError] = useState("")
  return <details className="backup-restore"><summary>Восстановить из резервной копии</summary><p className="footnote">Выберите JSON-файл, скачанный в ТИМ Кампус. Файл обрабатывается только на устройстве.</p><label className="field">Файл резервной копии<input type="file" accept="application/json,.json" disabled={!ready} onChange={async e => {
    const file = e.currentTarget.files?.[0]; setBackup(null); setError("")
    if (!file) return
    try { if (file.size > 5_000_000) throw new Error("Файл больше 5 МБ"); setBackup(parseBackup(await file.text())) } catch (error) { setError(error instanceof Error ? error.message : "Не удалось прочитать файл") }
  }}/></label>{error && <p role="alert" className="notice">{error}</p>}{backup && <><p>{backup.tasks.length} задач · {backup.plans.length} планов · {backup.notes.length} символов заметки</p><p className="footnote">Добавим записи из копии. Совпадающие записи обновятся, остальные сохранятся. Заметки объединим. Текущие имя и группа останутся, если уже заполнены.</p><button className="button primary wide" disabled={!ready} onClick={() => { try { updateStudent(mergeBackup(current,backup)); setBackup(null); onDone() } catch (error) { setError(error instanceof Error ? error.message : "Ошибка восстановления") } }}><Icon name="refresh" size={17}/>Объединить мои данные</button></>}</details>
}
