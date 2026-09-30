package ru.timacad.platform

import android.content.Context
import android.util.Log
import androidx.compose.runtime.Immutable
import com.arkivanov.mvikotlin.core.store.Reducer
import com.arkivanov.mvikotlin.core.store.Store
import com.arkivanov.mvikotlin.core.store.SimpleBootstrapper
import com.arkivanov.mvikotlin.extensions.coroutines.CoroutineExecutor
import com.arkivanov.mvikotlin.extensions.coroutines.states
import com.arkivanov.mvikotlin.main.store.DefaultStoreFactory
import kotlinx.coroutines.*
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.stateIn
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
    val oled: Boolean = false, val picker: GroupPickerView = GroupPickerView(),
)

private sealed interface PlatformIntent {
    data class Select(val code: String) : PlatformIntent
    data class Favorite(val code: String) : PlatformIntent
    data class Subgroup(val value: Int) : PlatformIntent
    data class Swipe(val direction: Int) : PlatformIntent
    data class Notes(val text: String) : PlatformIntent
    data class NewPersonal(val kind: PersonalEntryKind) : PlatformIntent
    data class EditTask(val task: PersonalTask) : PlatformIntent
    data class EditPlan(val plan: PersonalPlan) : PlatformIntent
    data class Draft(val value: PersonalDraft) : PlatformIntent
    data object CancelPersonal : PlatformIntent
    data object SavePersonal : PlatformIntent
    data class ToggleTask(val task: PersonalTask) : PlatformIntent
    data class DeleteTask(val id: String) : PlatformIntent
    data class DeletePlan(val id: String) : PlatformIntent
    data class Import(val read: () -> String) : PlatformIntent
    data class Export(val ready: (String) -> Unit) : PlatformIntent
    data class Query(val value: String) : PlatformIntent
    data class Institute(val value: String) : PlatformIntent
    data class Course(val value: Int) : PlatformIntent
    data class Authenticate(val create: Boolean) : PlatformIntent
    data class Theme(val oled: Boolean) : PlatformIntent
    data object Logout : PlatformIntent
}
private class ViewUpdate(val reduce: (PlatformView) -> PlatformView)

/** UI callbacks send intents; MVIKotlin owns state and executor lifetime. */
class PlatformController(context: Context, schedule: ScheduleRepository, personal: PersonalRepository, onClosed: () -> Unit) {
    private val observation = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val store: Store<PlatformIntent, PlatformView, Nothing> = DefaultStoreFactory().create(
        name = "Platform", initialState = PlatformView(), bootstrapper = SimpleBootstrapper(Unit),
        executorFactory = { PlatformExecutor(context, schedule, personal, onClosed) },
        reducer = object : Reducer<PlatformView, ViewUpdate> {
            override fun PlatformView.reduce(msg: ViewUpdate) = msg.reduce(this)
        },
    )
    val view = store.states.stateIn(observation, SharingStarted.Eagerly, store.state)
    fun select(code: String) = store.accept(PlatformIntent.Select(code))
    fun favorite(code: String) = store.accept(PlatformIntent.Favorite(code))
    fun subgroup(value: Int) = store.accept(PlatformIntent.Subgroup(value))
    fun swipe(direction: Int) = store.accept(PlatformIntent.Swipe(direction))
    fun notes(text: String) = store.accept(PlatformIntent.Notes(text))
    fun newPersonal(kind: PersonalEntryKind) = store.accept(PlatformIntent.NewPersonal(kind))
    fun editTask(task: PersonalTask) = store.accept(PlatformIntent.EditTask(task))
    fun editPlan(plan: PersonalPlan) = store.accept(PlatformIntent.EditPlan(plan))
    fun draft(value: PersonalDraft) = store.accept(PlatformIntent.Draft(value))
    fun cancelPersonal() = store.accept(PlatformIntent.CancelPersonal)
    fun savePersonal() = store.accept(PlatformIntent.SavePersonal)
    fun toggleTask(task: PersonalTask) = store.accept(PlatformIntent.ToggleTask(task))
    fun deleteTask(id: String) = store.accept(PlatformIntent.DeleteTask(id))
    fun deletePlan(id: String) = store.accept(PlatformIntent.DeletePlan(id))
    fun importBackup(read: () -> String) = store.accept(PlatformIntent.Import(read))
    fun exportBackup(ready: (String) -> Unit) = store.accept(PlatformIntent.Export(ready))
    fun query(value: String) = store.accept(PlatformIntent.Query(value))
    fun institute(value: String) = store.accept(PlatformIntent.Institute(value))
    fun course(value: Int) = store.accept(PlatformIntent.Course(value))
    fun authenticate(create: Boolean) = store.accept(PlatformIntent.Authenticate(create))
    fun theme(oled: Boolean) = store.accept(PlatformIntent.Theme(oled))
    fun logout() = store.accept(PlatformIntent.Logout)
    fun close() { store.dispose(); observation.cancel() }
}

private class PlatformExecutor(
    private val context: Context, private val schedule: ScheduleRepository,
    private val personal: PersonalRepository, private val onClosed: () -> Unit,
) : CoroutineExecutor<PlatformIntent, Unit, PlatformView, ViewUpdate, Nothing>(Dispatchers.Main.immediate) {
    private val vault = KeystoreVault(context)
    @Volatile private var token: String? = null
    private val transport = KtorSyncTransport(session = { token })
    private val passkeyHttp = KtorPasskeyHttp()
    private val worker = LiveSyncWorker(schedule, personal, transport) { refreshScheduleWidget(context) }
    private val writes = Mutex()
    private var sync: Job? = null
    private var observer: Job? = null
    private var personalSync: Job? = null
    private var activeScope: String? = null
    private var notesRevision = 0L
    private var scheduleRevision = 0L
    private var observationRevision = 0L
    private var themeChanged = false
    private var pendingEdits = 0
    private val edits = Channel<Edit>(Channel.UNLIMITED)
    private data class Edit(val scope: String?, val action: () -> Unit, val after: () -> Unit)
    private data class PersonalContent(val scope: String, val notes: String, val tasks: List<PersonalTask>, val plans: List<PersonalPlan>)
    private fun update(reduce: (PlatformView) -> PlatformView) = dispatch(ViewUpdate(reduce))
    private suspend fun <T> database(block: () -> T): T = withContext(Dispatchers.IO) { writes.withLock { block() } }
    private fun personalContent() = PersonalContent(personal.scopeId(), personal.notes(), personal.tasks(), personal.plans())
    private fun showPersonal(content: PersonalContent, revision: Long = notesRevision) {
        val changedAccount = activeScope != content.scope
        activeScope = content.scope
        update { it.copy(
            notes = if (changedAccount || (revision == notesRevision && pendingEdits == 0)) content.notes else it.notes,
            tasks = content.tasks, plans = content.plans, draft = if (changedAccount) null else it.draft,
        ) }
    }
    override fun executeAction(action: Unit) {
        scope.launch {
            token = withContext(Dispatchers.IO) { vault.load() }
            val oled = withContext(Dispatchers.IO) { context.getSharedPreferences("ui", Context.MODE_PRIVATE).getBoolean("oled", false) }
            val content = database { if (token == null) personal.activateAccount(null); personalContent() }
            update { it.copy(session = token, oled = if (themeChanged) it.oled else oled) }
            showPersonal(content)
            scope.launch { consumeEdits() }
            reload(); restartSync(); restartPersonalSync()
        }
    }
    override fun executeIntent(intent: PlatformIntent) {
        when (intent) {
            is PlatformIntent.Select -> {
                val revision = ++scheduleRevision
                scope.launch {
                    sync?.cancelAndJoin()
                    if (revision != scheduleRevision) return@launch
                    database { schedule.select(intent.code) }
                    if (revision != scheduleRevision) return@launch
                    update { it.copy(date = null) }; reload(); restartSync()
                }
            }
            is PlatformIntent.Favorite -> scope.launch { val favorites = database { schedule.rememberFavorite(intent.code); schedule.favorites() }; update { it.copy(favorites = favorites) } }
            is PlatformIntent.Subgroup -> scope.launch { update { it.copy(subgroup = intent.value) }; observeDay() }
            is PlatformIntent.Swipe -> { scheduleRevision++; scope.launch { update { it.copy(date = it.dates.getOrNull(it.dates.indexOf(it.date) + intent.direction) ?: it.date) }; observeDay() } }
            is PlatformIntent.Notes -> {
                if (intent.text.length > 100_000) { update { it.copy(personalNotice = "Заметка не должна превышать 100 000 символов") }; return }
                notesRevision++; update { it.copy(notes = intent.text) }; enqueue { personal.saveNotes(intent.text) }
            }
            is PlatformIntent.NewPersonal -> update { it.copy(draft = PersonalDraft(java.util.UUID.randomUUID().toString(), intent.kind, date = it.date.orEmpty()), personalNotice = null) }
            is PlatformIntent.EditTask -> update { it.copy(draft = PersonalDraft(intent.task.id, PersonalEntryKind.Task, intent.task.title, intent.task.date, homework = intent.task.kind == "homework", done = intent.task.done)) }
            is PlatformIntent.EditPlan -> update { it.copy(draft = PersonalDraft(intent.plan.id, PersonalEntryKind.Plan, intent.plan.title, intent.plan.date, intent.plan.start, intent.plan.end, intent.plan.room, cancelled = intent.plan.cancelled)) }
            is PlatformIntent.Draft -> update { it.copy(draft = intent.value) }
            PlatformIntent.CancelPersonal -> update { it.copy(draft = null, personalNotice = null) }
            PlatformIntent.SavePersonal -> {
                val draft = state().draft ?: return
                enqueue(after = { update { if (it.draft == draft) it.copy(draft = null) else it } }) {
                    if (draft.kind == PersonalEntryKind.Task) personal.saveTask(PersonalTask(draft.id, draft.title.trim(), draft.date, draft.done, if (draft.homework) "homework" else "task"))
                    else personal.savePlan(PersonalPlan(draft.id, draft.title.trim(), draft.date, draft.start, draft.end, draft.room, draft.cancelled))
                }
            }
            is PlatformIntent.ToggleTask -> enqueue {
                personal.tasks().find { it.id == intent.task.id }?.let { personal.saveTask(it.copy(done = !it.done)) }
            }
            is PlatformIntent.DeleteTask -> enqueue { personal.deleteTask(intent.id) }
            is PlatformIntent.DeletePlan -> enqueue { personal.deletePlan(intent.id) }
            is PlatformIntent.Import -> { notesRevision++; enqueue { check(personal.importV4(intent.read())) } }
            is PlatformIntent.Export -> {
                val group = state().group.orEmpty()
                enqueue { val json = personal.exportV4(group = group); scope.launch { intent.ready(json) } }
            }
            is PlatformIntent.Query -> { update { it.copy(picker = it.picker.copy(query = intent.value)) }; scope.launch { filterGroups() } }
            is PlatformIntent.Institute -> { update { it.copy(picker = it.picker.copy(institute = intent.value, course = null, query = "")) }; scope.launch { filterGroups() } }
            is PlatformIntent.Course -> { update { it.copy(picker = it.picker.copy(course = intent.value, query = "")) }; scope.launch { filterGroups() } }
            is PlatformIntent.Authenticate -> authenticate(intent.create)
            is PlatformIntent.Theme -> {
                themeChanged = true
                update { it.copy(oled = intent.oled) }
                context.getSharedPreferences("ui", Context.MODE_PRIVATE).edit().putBoolean("oled", intent.oled).apply()
            }
            PlatformIntent.Logout -> scope.launch {
                personalSync?.cancelAndJoin(); withContext(Dispatchers.IO) { vault.clear() }; token = null
                val content = database { personal.activateAccount(null); personalContent() }
                update { it.copy(session = null, notice = "Вы вышли на этом устройстве", draft = null) }; showPersonal(content)
            }
        }
    }
    private fun enqueue(after: () -> Unit = {}, edit: () -> Unit) {
        pendingEdits++; edits.trySend(Edit(activeScope, edit, after)).getOrThrow()
    }
    private suspend fun consumeEdits() {
        for (edit in edits) {
            try {
                val content = database { check(edit.scope == null || edit.scope == personal.scopeId()) { "Personal account changed" }; edit.action(); personalContent() }
                pendingEdits--; showPersonal(content); update { it.copy(personalNotice = null) }; edit.after()
            } catch (cancelled: CancellationException) { throw cancelled
            } catch (_: Exception) {
                pendingEdits--; update { it.copy(personalNotice = "Не удалось сохранить. Проверьте название, дату и время. Предыдущие данные сохранены.") }
            }
        }
    }
    private suspend fun reload() {
        val revision = scheduleRevision
        val date = state().date
        val loaded = database {
            val group = schedule.selectedGroup(); val day = schedule.day(group, date)
            PlatformView(groups = schedule.allGroups(), favorites = schedule.favorites(), group = group, date = day.date, dates = group?.let(schedule::dates).orEmpty())
        }
        if (revision != scheduleRevision) return
        update { it.copy(groups = loaded.groups, favorites = loaded.favorites, group = loaded.group, date = loaded.date, dates = loaded.dates) }
        filterGroups(); observeDay()
    }
    private suspend fun filterGroups() {
        val current = state()
        val picker = withContext(Dispatchers.IO) {
            val matches = if (current.picker.query.isBlank()) emptyList() else database { schedule.search(current.picker.query) }
            groupPickerView(current.groups, current.picker, matches)
        }
        update { if (it.picker == current.picker && it.groups === current.groups) it.copy(picker = picker) else it }
    }
    private suspend fun observeDay() {
        val revision = ++observationRevision
        observer?.cancelAndJoin()
        if (revision != observationRevision) return
        val current = state(); val group = current.group; val date = current.date
        if (group == null || date == null) { update { it.copy(rows = emptyList()) }; return }
        observer = scope.launch {
            schedule.watchDay(group, date, current.subgroup, Dispatchers.IO).collect { rows ->
                update { if (it.group == group && it.date == date && it.subgroup == current.subgroup) it.copy(rows = rows) else it }
            }
        }
    }
    private suspend fun restartSync() {
        sync?.cancelAndJoin()
        sync = scope.launch {
            var attempt = 0
            while (isActive) {
                try {
                    val replica = database { schedule.replicaId() }
                    // Network waits never hold the local-write mutex.
                    withContext(Dispatchers.IO) { worker.bootstrap(replica, "") }; check(worker.lastError == null)
                    val group = database {
                        val groups = schedule.allGroups()
                        (schedule.selectedGroup()?.takeIf { code -> groups.any { it.code == code } } ?: groups.firstOrNull()?.code)?.also(schedule::select)
                    }
                    if (group != null) { withContext(Dispatchers.IO) { worker.bootstrap(replica, group) }; check(worker.lastError == null) }
                    reload()
                    Log.i("TimSync", "groups=${state().groups.size} group=$group lessons=${database { group?.let(schedule::lessonCount) ?: 0 }}")
                    val connectedAt = System.nanoTime()
                    withContext(Dispatchers.IO) {
                        transport.listen(centrifugoChannel(group ?: "catalog")) { hint ->
                            val result = worker.onHint(hint)
                            Log.i("TimSync", "hint=${hint.collection} lsn=${hint.lsn} applied=${result.applied} widgets=${result.widgetUpdates}")
                            scope.launch { reload() }
                        }
                    }
                    if (System.nanoTime() - connectedAt > 30_000_000_000L) attempt = 0
                } catch (cancelled: CancellationException) { throw cancelled
                } catch (error: Exception) { Log.w("TimSync", "retry=${attempt + 1} reason=${worker.lastError ?: error.javaClass.simpleName}") }
                delay(backoffMillis(attempt++, Random.nextDouble()))
            }
        }
    }
    private suspend fun restartPersonalSync() {
        personalSync?.cancelAndJoin()
        personalSync = scope.launch {
            var attempt = 0
            while (isActive && token != null) {
                try {
                    val account = withContext(Dispatchers.IO) { transport.accountId() }
                    showPersonal(database { personal.activateAccount(account); personalContent() })
                    val replica = database { schedule.replicaId() }
                    withContext(Dispatchers.IO) { worker.flushOutbox(replica, account) }
                    val revision = notesRevision; val cursor = database { personal.cursor() }
                    val frames = withContext(Dispatchers.IO) { transport.pull("personal", account, cursor) }
                    val content = database { check(personal.scopeId() == account); personal.merge(frames); personalContent() }
                    showPersonal(content, revision); attempt = 0; delay(10_000)
                } catch (cancelled: CancellationException) { throw cancelled
                } catch (_: Exception) { delay(backoffMillis(attempt++, Random.nextDouble())) }
            }
        }
    }
    private fun authenticate(create: Boolean) {
        if (state().authenticating) return
        update { it.copy(authenticating = true, notice = null) }
        scope.launch {
            val client = PasskeyClient(passkeyHttp, AndroidPasskeyPrompt(context), vault)
            val outcome = withContext(Dispatchers.IO) { if (create) client.register("Студент") else client.login() }
            update { old -> when (outcome) {
                is PasskeyOutcome.Session -> old.copy(session = outcome.token, notice = "Вы вошли", authenticating = false)
                is PasskeyOutcome.Quiet -> old.copy(notice = outcome.detail, authenticating = false)
            } }
            if (outcome is PasskeyOutcome.Session) { token = outcome.token; restartPersonalSync() }
        }
    }
    override fun dispose() {
        scope.coroutineContext[Job]?.invokeOnCompletion { onClosed() }
        super.dispose(); edits.close(); transport.close(); passkeyHttp.close()
    }
}
