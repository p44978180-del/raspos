package ru.timacad.raspos.core.data.repository

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import ru.timacad.raspos.core.crdt.CrdtSyncEngine
import ru.timacad.raspos.core.crdt.VectorClock
import ru.timacad.raspos.core.domain.models.DaySchedule
import ru.timacad.raspos.core.domain.models.Lesson

interface ScheduleRepository {
    fun observeSchedule(groupId: String): Flow<List<DaySchedule>>
    suspend fun getSchedule(groupId: String): List<DaySchedule>
    suspend fun updateLessonNote(lessonId: Long, note: String)
    suspend fun syncWithRemote(groupId: String): Boolean
}

class LocalScheduleRepository(
    private val crdtEngine: CrdtSyncEngine,
    private val clientId: String
) : ScheduleRepository {

    private val _scheduleFlow = MutableStateFlow<List<DaySchedule>>(emptyList())
    private var currentVectorClock = VectorClock()

    override fun observeSchedule(groupId: String): Flow<List<DaySchedule>> = _scheduleFlow.asStateFlow()

    override suspend fun getSchedule(groupId: String): List<DaySchedule> {
        return _scheduleFlow.value
    }

    override suspend fun updateLessonNote(lessonId: Long, note: String) {
        currentVectorClock = currentVectorClock.increment(clientId)
        crdtEngine.put("note_$lessonId", note)
    }

    override suspend fun syncWithRemote(groupId: String): Boolean {
        // Delta sync algorithm
        val etag = crdtEngine.computeStateETag()
        return etag.isNotEmpty()
    }
}
