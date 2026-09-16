import React, { useState, useEffect } from "react"
import { localDb } from "../../utils/localDatabase"
import { connectClient } from "../../shared/api/connectClient"
import type { ScheduleChangeProposal, RoleInGroup } from "../../proto/schedule"

interface CrowdsourceChangeModalProps {
  isOpen: boolean
  onClose: () => void
  lessonId: number
  groupId: number
  subjectName: string
  currentRole: RoleInGroup
  onRoleUpgrade?: (newRole: RoleInGroup) => void
  onToast?: (msg: string, type?: "info" | "success" | "warn") => void
}

export default function CrowdsourceChangeModal({
  isOpen,
  onClose,
  lessonId,
  groupId,
  subjectName,
  currentRole,
  onRoleUpgrade,
  onToast,
}: CrowdsourceChangeModalProps) {
  const [proposals, setProposals] = useState<ScheduleChangeProposal[]>([])
  const [showProposeForm, setShowProposeForm] = useState(false)
  const [changeType, setChangeType] = useState<"cancellation" | "transfer" | "room_change">("cancellation")
  const [reason, setReason] = useState("")
  const [targetRoom, setTargetRoom] = useState("")
  const [studentName, setStudentName] = useState(() => {
    try {
      return localStorage.getItem("rgau_student_name") || "Студент"
    } catch {
      return "Студент"
    }
  })

  // Deputy appointment state
  const [deputyCandidate, setDeputyCandidate] = useState("")
  const [showDeputyAppoint, setShowDeputyAppoint] = useState(false)

  // Load existing proposals
  useEffect(() => {
    if (!isOpen) return
    let active = true

    // Load from local storage / cache
    try {
      const raw = localStorage.getItem(`rgau_crowdsource_${groupId}_${lessonId}`)
      if (raw) {
        setProposals(JSON.parse(raw))
      }
    } catch {}

    return () => {
      active = false
    }
  }, [isOpen, groupId, lessonId])

  const saveProposalsState = (updated: ScheduleChangeProposal[]) => {
    setProposals(updated)
    try {
      localStorage.setItem(`rgau_crowdsource_${groupId}_${lessonId}`, JSON.stringify(updated))
    } catch {}
  }

  const handlePropose = async () => {
    if (!reason.trim()) {
      onToast?.("Укажите причину переноса или отмены", "warn")
      return
    }

    let status: ScheduleChangeProposal["status"] = "pending"
    let badge = "Проверяется одногруппниками (1/3)"
    let hasHeadstudent = false
    let hasDeputy = false

    if (currentRole === "headstudent") {
      status = "officially_confirmed"
      badge = "Официально подтверждено старостой"
      hasHeadstudent = true
    } else if (currentRole === "deputy_headstudent") {
      status = "peer_confirmed"
      badge = "Подтверждено зам. старосты"
      hasDeputy = true
    }

    const newProp: ScheduleChangeProposal = {
      id: Date.now(),
      lesson_id: lessonId,
      group_id: groupId,
      student_name: studentName,
      student_role: currentRole,
      change_type: changeType,
      target_room: targetRoom || undefined,
      reason,
      peer_votes: 1,
      has_deputy_confirmation: hasDeputy,
      has_headstudent_confirmation: hasHeadstudent,
      status,
      display_badge: badge,
      created_at: new Date().toISOString(),
    }

    const updated = [newProp, ...proposals]
    saveProposalsState(updated)
    await localDb.saveProposal(newProp)
    await connectClient.proposeChange(newProp as any)

    onToast?.("Изменение предложено. Одногруппники могут подтвердить его!", "success")
    setShowProposeForm(false)
    setReason("")
    setTargetRoom("")
  }

  const handleVote = async (propId: number) => {
    const updated = proposals.map((p) => {
      if (p.id !== propId) return p

      const newVotes = p.peer_votes + 1
      let status = p.status
      let badge = p.display_badge
      let hasHeadstudent = p.has_headstudent_confirmation
      let hasDeputy = p.has_deputy_confirmation

      if (currentRole === "headstudent") {
        status = "officially_confirmed"
        badge = "Официально подтверждено старостой"
        hasHeadstudent = true
      } else if (currentRole === "deputy_headstudent") {
        status = "peer_confirmed"
        badge = "Подтверждено зам. старосты"
        hasDeputy = true
      } else if (newVotes >= 3 && status !== "officially_confirmed" && !hasDeputy) {
        status = "peer_confirmed"
        badge = "Возможен перенос (подтверждено 3+ студентами)"
      } else if (status !== "officially_confirmed" && !hasDeputy) {
        badge = `Проверяется одногруппниками (${newVotes}/3)`
      }

      return {
        ...p,
        peer_votes: newVotes,
        has_deputy_confirmation: hasDeputy,
        has_headstudent_confirmation: hasHeadstudent,
        status,
        display_badge: badge,
      }
    })

    saveProposalsState(updated)
    const voted = updated.find((p) => p.id === propId)
    if (voted) {
      await localDb.saveProposal(voted)
      await connectClient.voteChange({
        proposal_id: propId,
        group_id: groupId,
        student_name: studentName,
        student_role: currentRole,
        vote_confirm: true,
      })
    }
    onToast?.("Ваш голос учтен!", "success")
  }

  const handleAppointDeputy = () => {
    if (!deputyCandidate.trim()) return
    try {
      const existing = JSON.parse(localStorage.getItem(`rgau_deputies_${groupId}`) || "[]")
      if (!existing.includes(deputyCandidate.trim())) {
        existing.push(deputyCandidate.trim())
        localStorage.setItem(`rgau_deputies_${groupId}`, JSON.stringify(existing))
      }
    } catch {}
    onToast?.(`Студент ${deputyCandidate} назначен заместителем старосты!`, "success")
    setShowDeputyAppoint(false)
    setDeputyCandidate("")
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-xs" onClick={onClose} />

      <div
        className="relative w-full max-w-lg bg-card border border-border rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[85vh] animate-slide-in-up overflow-hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 16px)" }}
      >
        {/* Header */}
        <div className="p-4 border-b border-border/80 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center text-lg">
              📣
            </div>
            <div>
              <h3 className="text-base font-extrabold text-fg">Краудсорсинг изменений</h3>
              <p className="text-xs text-muted-fg leading-tight">
                {subjectName} · Подтверждение переноса студентами
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-muted-fg hover:text-fg"
          >
            ✕
          </button>
        </div>

        {/* Role Banner & Deputy Designation */}
        <div className="p-3 bg-muted/40 border-b border-border/60 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-muted-fg">Ваша роль:</span>
            <span className="font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
              {currentRole === "headstudent"
                ? "👑 Староста группы"
                : currentRole === "deputy_headstudent"
                ? "⭐ Зам. старосты"
                : "🎓 Студент"}
            </span>
          </div>

          {currentRole === "headstudent" && (
            <button
              onClick={() => setShowDeputyAppoint(!showDeputyAppoint)}
              className="text-primary font-bold hover:underline"
            >
              + Назначить зам. старосты
            </button>
          )}
        </div>

        {/* Deputy Appointment Form */}
        {showDeputyAppoint && (
          <div className="p-3.5 bg-card border-b border-border/80 space-y-2 animate-fade-in">
            <label className="text-xs font-bold text-fg block">
              Назначение заместителя старосты:
            </label>
            <div className="flex gap-2">
              <input
                value={deputyCandidate}
                onChange={(e) => setDeputyCandidate(e.target.value)}
                placeholder="Имя или фамилия одногруппника..."
                className="flex-1 text-xs bg-muted border border-border rounded-xl px-3 py-2 text-fg outline-none focus:border-primary font-medium"
              />
              <button
                onClick={handleAppointDeputy}
                className="px-3 py-2 bg-primary text-white text-xs font-bold rounded-xl hover:opacity-90"
              >
                Назначить
              </button>
            </div>
          </div>
        )}

        {/* Proposals List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {proposals.length === 0 && !showProposeForm ? (
            <div className="py-12 text-center text-xs text-muted-fg space-y-2">
              <p>По этой паре пока нет предложенных переносов или отмен.</p>
              <p>Преподаватель заболел или пара переносится? Сообщите группе первым!</p>
            </div>
          ) : (
            proposals.map((p) => {
              const isOfficial = p.status === "officially_confirmed"
              const isPeerConfirmed = p.status === "peer_confirmed"

              return (
                <div
                  key={p.id}
                  className={`p-3.5 rounded-2xl border transition-all ${
                    isOfficial
                      ? "bg-emerald-500/10 border-emerald-500/30 text-fg"
                      : isPeerConfirmed
                      ? "bg-amber-500/10 border-amber-500/30 text-fg"
                      : "bg-card border-border/80 text-fg"
                  } space-y-2.5 shadow-xs`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span
                        className={`inline-block text-[11px] font-extrabold px-2.5 py-0.5 rounded-full ${
                          isOfficial
                            ? "bg-emerald-600 text-white"
                            : isPeerConfirmed
                            ? "bg-amber-500 text-white"
                            : "bg-muted text-muted-fg border border-border"
                        }`}
                      >
                        {p.display_badge}
                      </span>
                      <div className="text-xs font-bold mt-1 text-fg">
                        {p.change_type === "cancellation"
                          ? "❌ Предложена отмена занятия"
                          : p.change_type === "room_change"
                          ? `📍 Перенос в ауд. ${p.target_room}`
                          : "🔄 Перенос времени пары"}
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="text-[11px] font-bold text-muted-fg">
                        Подтверждений: {p.peer_votes}
                      </span>
                    </div>
                  </div>

                  <p className="text-xs text-muted-fg leading-relaxed">
                    «{p.reason}» — <span className="font-semibold text-fg">{p.student_name}</span>
                  </p>

                  <div className="pt-2 border-t border-border/40 flex items-center justify-between">
                    <div className="text-[10px] text-muted-fg">
                      {p.has_deputy_confirmation && "⭐ Отмечено зам. старосты · "}
                      {p.has_headstudent_confirmation && "👑 Заверено старостой · "}
                      {p.peer_votes >= 3 && "3+ одногруппников"}
                    </div>

                    <button
                      onClick={() => handleVote(p.id)}
                      className="px-3 py-1.5 rounded-xl bg-primary text-white text-xs font-bold hover:opacity-90 transition-all flex items-center gap-1 shadow-xs"
                    >
                      <span>👍</span>
                      <span>Подтвердить (+1)</span>
                    </button>
                  </div>
                </div>
              )
            })
          )}

          {/* New Proposal Drawer */}
          {showProposeForm ? (
            <div className="p-3.5 rounded-2xl bg-card border border-primary/30 space-y-3 animate-fade-in">
              <div className="text-xs font-bold text-fg">Что произошло с парой?</div>

              <div className="grid grid-cols-3 gap-2">
                {[
                  ["cancellation", "Отмена"],
                  ["room_change", "Смена ауд."],
                  ["transfer", "Перенос"],
                ].map(([val, label]) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setChangeType(val as any)}
                    className={`py-2 text-xs font-bold rounded-xl border transition-all ${
                      changeType === val
                        ? "bg-primary text-white border-primary shadow-xs"
                        : "bg-muted text-muted-fg border-border"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {changeType === "room_change" && (
                <input
                  value={targetRoom}
                  onChange={(e) => setTargetRoom(e.target.value)}
                  placeholder="Новая аудитория (напр. 312)..."
                  className="w-full text-xs bg-muted border border-border rounded-xl px-3 py-2 text-fg outline-none focus:border-primary font-medium"
                />
              )}

              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Причина (напр. Преподаватель написал в чат группы, что пары не будет)..."
                rows={2}
                className="w-full text-xs bg-muted border border-border rounded-xl p-3 text-fg outline-none focus:border-primary font-medium"
              />

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowProposeForm(false)}
                  className="flex-1 py-2 rounded-xl bg-muted text-xs font-bold text-muted-fg hover:text-fg"
                >
                  Отмена
                </button>
                <button
                  type="button"
                  onClick={handlePropose}
                  className="flex-1 py-2 rounded-xl bg-primary text-white text-xs font-bold hover:opacity-90"
                >
                  Опубликовать
                </button>
              </div>
            </div>
          ) : null}
        </div>

        {/* Footer Propose Button */}
        {!showProposeForm && (
          <div className="p-4 border-t border-border/80 bg-card">
            <button
              onClick={() => setShowProposeForm(true)}
              className="w-full py-3 bg-primary text-white font-bold rounded-2xl text-xs sm:text-sm hover:opacity-90 transition-opacity flex items-center justify-center gap-2 shadow-sm"
            >
              <span>📢</span>
              <span>Сообщить о переносе или отмене пары</span>
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
