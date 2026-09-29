package ru.timacad.platform

import android.content.Context
import android.util.Log
import androidx.compose.runtime.Immutable
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlin.random.Random

@Immutable
data class PlatformView(
    val groups: List<LocalGroup> = emptyList(), val favorites: Set<String> = emptySet(),
    val group: String? = null, val date: String? = null, val dates: List<String> = emptyList(),
    val subgroup: Int = 0, val rows: List<DayRow> = emptyList(),
    val notes: String = "", val tasks: List<PersonalTask> = emptyList(),
    val plans: List<PersonalPlan> = emptyList(), val draft: PersonalDraft? = null, val personalNotice: String? = null,
    val session: String? = null, val notice: String? = null, val authenticating: Boolean = false,
    val picker: GroupPickerView = GroupPickerView(),
)

/** Owns database/network work for the activity; composition only renders view. */
class PlatformController(
    private val context: Context, private val schedule: ScheduleRepository,
    private val personal: PersonalRepository, private val scope: CoroutineScope,
) {
    private val state = MutableStateFlow(PlatformView())
    val view = state.asStateFlow()
    private val vault = KeystoreVault(context)
    private val transport = KtorSyncTransport(session = { state.value.session })
    private val passkeyHttp = KtorPasskeyHttp()
    private val worker = LiveSyncWorker(schedule, personal, transport) { refreshScheduleWidget(context) }
    private val writes = Mutex()
    private var sync: Job? = null
    private var observer: Job? = null
    private var personalSync: Job? = null

    init { scope.launch {
        val session = vault.load()
        if (session == null) personal.activateAccount(null)
        state.update { it.copy(session = session, notes = personal.notes(), tasks = personal.tasks(), plans = personal.plans()) }
        reload()
        restartSync()
        restartPersonalSync()
    } }

    private suspend fun reload() {
        val group = schedule.selectedGroup()
        val day = schedule.day(group, state.value.date)
        val groups = schedule.allGroups()
        val favorites = schedule.favorites()
        val dates = group?.let(schedule::dates).orEmpty()
        state.update { it.copy(groups = groups, favorites = favorites, group = group, date = day.date, dates = dates) }
        filterGroups()
        observeDay()
    }

    private suspend fun observeDay() {
        observer?.cancelAndJoin()
        val current = state.value
        val group = current.group
        val date = current.date
        if (group == null || date == null) { state.update { it.copy(rows = emptyList()) }; return }
        observer = scope.launch {
            schedule.watchDay(group, date, current.subgroup, Dispatchers.IO).collect { rows ->
                state.update { if (it.group == group && it.date == date && it.subgroup == current.subgroup) it.copy(rows = rows) else it }
            }
        }
    }

    private suspend fun restartSync() {
        sync?.cancelAndJoin()
        sync = scope.launch {
            var attempt = 0
            while (isActive) {
                try {
                    writes.withLock {
                        val replica = schedule.replicaId()
                        worker.bootstrap(replica, "")
                        check(worker.lastError == null) { "Directory sync failed" }
                        val groups = schedule.allGroups()
                        val group = schedule.selectedGroup()?.takeIf { code -> groups.any { it.code == code } } ?: groups.firstOrNull()?.code
                        if (group != null) {
                            schedule.select(group)
                            worker.bootstrap(replica, group)
                            check(worker.lastError == null) { "Schedule sync failed" }
                        }
                        reload()
                        Log.i("TimSync", "groups=${groups.size} group=$group lessons=${group?.let(schedule::lessonCount) ?: 0}")
                    }
                    val connectedAt = System.nanoTime()
                    transport.listen(centrifugoChannel(state.value.group ?: "catalog")) { hint ->
                        val result = worker.onHint(hint)
                        Log.i("TimSync", "hint=${hint.collection} lsn=${hint.lsn} applied=${result.applied} widgets=${result.widgetUpdates}")
                        scope.launch { writes.withLock { reload() } }
                    }
                    if (System.nanoTime() - connectedAt > 30_000_000_000L) attempt = 0
                } catch (cancelled: CancellationException) { throw cancelled
                } catch (error: Exception) {
                    Log.w("TimSync", "retry=${attempt + 1} reason=${worker.lastError ?: error.javaClass.simpleName}")
                }
                delay(backoffMillis(attempt++, Random.nextDouble()))
            }
        }
    }

    private suspend fun restartPersonalSync() {
        personalSync?.cancelAndJoin()
        personalSync = scope.launch {
            var attempt = 0
            while (isActive && state.value.session != null) {
                try {
                    val account = transport.accountId()
                    writes.withLock {
                        personal.activateAccount(account)
                        worker.flushOutbox(schedule.replicaId(), account)
                        worker.pullPersonal()
                        state.update { it.copy(notes = personal.notes(), tasks = personal.tasks(), plans = personal.plans()) }
                    }
                    attempt = 0
                    delay(10_000)
                } catch (cancelled: CancellationException) { throw cancelled
                } catch (_: Exception) { delay(backoffMillis(attempt++, Random.nextDouble())) }
            }
        }
    }

    fun select(code: String) { scope.launch {
        sync?.cancelAndJoin()
        writes.withLock { schedule.select(code); state.update { it.copy(date = null) }; reload() }
        restartSync()
    } }
    fun favorite(code: String) { scope.launch { writes.withLock {
        schedule.rememberFavorite(code)
        val favorites = schedule.favorites()
        state.update { it.copy(favorites = favorites) }
    } } }
    fun subgroup(value: Int) { scope.launch { writes.withLock { state.update { it.copy(subgroup = value) }; observeDay() } } }
    fun swipe(direction: Int) { scope.launch { writes.withLock {
        state.update { old -> old.copy(date = old.dates.getOrNull(old.dates.indexOf(old.date) + direction) ?: old.date) }
        observeDay()
    } } }
    fun notes(text: String) {
        if (text.length > 100_000) { state.update { it.copy(personalNotice = "Заметка не должна превышать 100 000 символов") }; return }
        state.update { it.copy(notes = text) }
        personalWrite { personal.saveNotes(text) }
    }
    private fun personalWrite(edit: () -> Unit) { scope.launch { writes.withLock {
        try {
            edit()
            state.update { it.copy(tasks = personal.tasks(), plans = personal.plans(), personalNotice = null) }
        } catch (cancelled: CancellationException) { throw cancelled
        } catch (_: Exception) {
            state.update { it.copy(personalNotice = "Не удалось сохранить. Проверьте название, дату и время. Предыдущие данные сохранены.") }
        }
    } } }
    fun newPersonal(kind: PersonalEntryKind) { state.update { it.copy(draft = PersonalDraft(java.util.UUID.randomUUID().toString(), kind, date = it.date.orEmpty()), personalNotice = null) } }
    fun editTask(task: PersonalTask) { state.update { it.copy(draft = PersonalDraft(task.id, PersonalEntryKind.Task, task.title, task.date, homework = task.kind == "homework", done = task.done)) } }
    fun editPlan(plan: PersonalPlan) { state.update { it.copy(draft = PersonalDraft(plan.id, PersonalEntryKind.Plan, plan.title, plan.date, plan.start, plan.end, plan.room, cancelled = plan.cancelled)) } }
    fun draft(value: PersonalDraft) { state.update { it.copy(draft = value) } }
    fun cancelPersonal() { state.update { it.copy(draft = null, personalNotice = null) } }
    fun savePersonal() {
        val draft = state.value.draft ?: return
        personalWrite {
            if (draft.kind == PersonalEntryKind.Task) personal.saveTask(PersonalTask(draft.id, draft.title.trim(), draft.date, draft.done, if (draft.homework) "homework" else "task"))
            else personal.savePlan(PersonalPlan(draft.id, draft.title.trim(), draft.date, draft.start, draft.end, draft.room, draft.cancelled))
            state.update { if (it.draft == draft) it.copy(draft = null) else it }
        }
    }
    fun toggleTask(task: PersonalTask) = personalWrite { personal.saveTask(task.copy(done = !task.done)) }
    fun deleteTask(id: String) = personalWrite { personal.deleteTask(id) }
    fun deletePlan(id: String) = personalWrite { personal.deletePlan(id) }

    fun importBackup(read: () -> String) { personalWrite {
        check(personal.importV4(read()))
        state.update { it.copy(notes = personal.notes()) }
    } }
    fun exportBackup(ready: (String) -> Unit) { scope.launch {
        val json = writes.withLock { personal.exportV4(group = state.value.group.orEmpty(), notes = state.value.notes) }
        withContext(Dispatchers.Main) { ready(json) }
    } }
    private fun filterGroups() {
        val current = state.value
        val matches = if (current.picker.query.isBlank()) emptyList() else schedule.search(current.picker.query)
        val picker = groupPickerView(current.groups, current.picker, matches)
        state.update { if (it.picker == current.picker) it.copy(picker = picker) else it }
    }
    fun query(value: String) {
        state.update { it.copy(picker = it.picker.copy(query = value)) }
        scope.launch { writes.withLock { filterGroups() } }
    }
    fun institute(value: String) { scope.launch { writes.withLock {
        state.update { it.copy(picker = it.picker.copy(institute = value, course = null, query = "")) }; filterGroups()
    } } }
    fun course(value: Int) { scope.launch { writes.withLock {
        state.update { it.copy(picker = it.picker.copy(course = value, query = "")) }; filterGroups()
    } } }
    fun authenticate(create: Boolean) {
        if (state.value.authenticating) return
        state.update { it.copy(authenticating = true, notice = null) }
        scope.launch {
            val client = PasskeyClient(passkeyHttp, AndroidPasskeyPrompt(context), vault)
            val outcome = if (create) client.register("Студент") else client.login()
            state.update { old -> when (outcome) {
                is PasskeyOutcome.Session -> old.copy(session = outcome.token, notice = "Вы вошли", authenticating = false)
                is PasskeyOutcome.Quiet -> old.copy(notice = outcome.detail, authenticating = false)
            } }
            if (outcome is PasskeyOutcome.Session) restartPersonalSync()
        }
    }
    fun logout() { scope.launch {
        personalSync?.cancelAndJoin()
        writes.withLock {
            vault.clear()
            personal.activateAccount(null)
            state.update { it.copy(session = null, notice = "Вы вышли на этом устройстве", notes = personal.notes(), tasks = personal.tasks(), plans = personal.plans(), draft = null) }
        }
    } }
    fun close() { transport.close(); passkeyHttp.close() }
}
