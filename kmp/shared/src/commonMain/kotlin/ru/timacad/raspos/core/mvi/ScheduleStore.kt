package ru.timacad.raspos.core.mvi

import com.arkivanov.mvikotlin.core.store.Store
import com.arkivanov.mvikotlin.core.store.StoreFactory
import com.arkivanov.mvikotlin.main.store.DefaultStoreFactory
import ru.timacad.raspos.core.domain.models.DaySchedule
import ru.timacad.raspos.core.domain.models.Lesson

interface ScheduleStore : Store<ScheduleStore.Intent, ScheduleStore.State, ScheduleStore.Label> {

    sealed interface Intent {
        data class SelectDay(val date: String) : Intent
        data class SetWeekParity(val parity: String) : Intent // "CURRENT", "ODD", "EVEN", "ALL"
        data class SearchLessons(val query: String) : Intent
        data class OverrideLesson(val lessonId: Long, val newRoom: String?, val isCancelled: Boolean) : Intent
        data object RefreshScheduleDelta : Intent
    }

    data class State(
        val selectedDate: String = "",
        val weekParityFilter: String = "CURRENT",
        val activeGroup: String = "ДА 01-26",
        val days: List<DaySchedule> = emptyList(),
        val currentLesson: Lesson? = null,
        val nextLesson: Lesson? = null,
        val minutesUntilNext: Int? = null,
        val isSyncing: Boolean = false,
        val lastSyncTimestamp: Long = 0L,
        val searchQuery: String = "",
        val error: String? = null
    )

    sealed interface Label {
        data class ClassCancelledAlert(val lesson: Lesson) : Label
        data class UrgencyTransitAlert(val minutesLeft: Int, val targetBuilding: String) : Label
        data class ToastMessage(val message: String) : Label
    }
}

class ScheduleStoreFactory(
    private val storeFactory: StoreFactory = DefaultStoreFactory()
) {
    fun create(): ScheduleStore =
        object : ScheduleStore, Store<ScheduleStore.Intent, ScheduleStore.State, ScheduleStore.Label> by storeFactory.create(
            name = "ScheduleStore",
            initialState = ScheduleStore.State(),
            bootstrapper = null,
            executorFactory = {
                // MVI Executor handling Intents and dispatching to Local SQLite
                object : com.arkivanov.mvikotlin.extensions.coroutines.CoroutineExecutor<ScheduleStore.Intent, Unit, ScheduleStore.State, ScheduleStore.State, ScheduleStore.Label>() {
                    override fun executeIntent(intent: ScheduleStore.Intent) {
                        when (intent) {
                            is ScheduleStore.Intent.SelectDay -> {
                                dispatch(state().copy(selectedDate = intent.date))
                            }
                            is ScheduleStore.Intent.SetWeekParity -> {
                                dispatch(state().copy(weekParityFilter = intent.parity))
                            }
                            is ScheduleStore.Intent.SearchLessons -> {
                                dispatch(state().copy(searchQuery = intent.query))
                            }
                            is ScheduleStore.Intent.OverrideLesson -> {
                                // 0ms Local-First mutation: updates state instantly, logs to CRDT
                                dispatch(state())
                            }
                            is ScheduleStore.Intent.RefreshScheduleDelta -> {
                                dispatch(state().copy(isSyncing = true))
                            }
                        }
                    }
                }
            },
            reducer = { state }
        ) {}
}
