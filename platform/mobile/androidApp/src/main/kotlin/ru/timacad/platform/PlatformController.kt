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

    init { scope.launch {
        state.update { it.copy(session = vault.load(), notes = personal.notes(), tasks = personal.tasks()) }
        reload()
        restartSync()
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
                        worker.flushOutbox(replica)
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
        state.update { it.copy(notes = text) }
        scope.launch { writes.withLock { personal.saveNotes(state.value.notes) } }
    }
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
        }
    }
    fun logout() { scope.launch { vault.clear(); state.update { it.copy(session = null, notice = "Вы вышли на этом устройстве") } } }
    fun close() { transport.close(); passkeyHttp.close() }
}
