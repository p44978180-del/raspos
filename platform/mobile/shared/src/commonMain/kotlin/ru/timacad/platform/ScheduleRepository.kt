package ru.timacad.platform

import app.cash.sqldelight.coroutines.asFlow
import app.cash.sqldelight.coroutines.mapToList
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import ru.timacad.platform.db.PlatformDatabase
import kotlin.coroutines.CoroutineContext

data class LocalGroup(val code: String, val institute: String, val course: Int, val status: String)

data class LocalLesson(
    val occursOn: String,
    val startsAt: String,
    val endsAt: String,
    val subject: String,
    val kind: String,
    val teacher: String,
    val building: String,
    val room: String,
    val sourceUrl: String,
)

data class DayView(
    val groupCode: String?,
    val date: String?,
    val lessons: List<LocalLesson>,
)

class ScheduleRepository(private val database: PlatformDatabase) {
    fun replaceDirectory(groups: List<LocalGroup>) {
        database.transaction {
            database.platformQueries.deleteGroups()
            groups.forEach { group ->
                database.platformQueries.insertGroup(group.code, group.institute, group.course.toLong(), group.status)
            }
        }
    }

    fun replaceLessons(groupCode: String, snapshotHash: String, lsn: Long, lessons: List<LocalLesson>) {
        database.transaction {
            database.platformQueries.deleteLessons(groupCode)
            lessons.forEachIndexed { index, lesson ->
                database.platformQueries.insertLesson(
                    group_code = groupCode,
                    position = index.toLong(),
                    occurs_on = lesson.occursOn,
                    starts_at = lesson.startsAt,
                    ends_at = lesson.endsAt,
                    subject = lesson.subject,
                    kind = lesson.kind,
                    teacher = lesson.teacher,
                    building = lesson.building,
                    room = lesson.room,
                    source_url = lesson.sourceUrl,
                    snapshot_hash = snapshotHash,
                )
            }
            database.platformQueries.upsertCursor("lesson", groupCode, snapshotHash, lsn)
            database.platformQueries.upsertSelection(groupCode)
        }
    }

    fun search(query: String): List<LocalGroup> {
        return database.platformQueries.searchGroups(query, query).executeAsList().map {
            LocalGroup(it.group_code, it.institute_name, it.course.toInt(), it.status)
        }
    }

    fun day(groupCode: String?, preferredDate: String?): DayView {
        if (groupCode == null) return DayView(null, null, emptyList())
        val dates = database.platformQueries.datesForGroup(groupCode).executeAsList()
        val date = when {
            preferredDate != null && preferredDate in dates -> preferredDate
            else -> dates.firstOrNull()
        }
        val lessons = if (date == null) {
            emptyList()
        } else {
            database.platformQueries.lessonsOn(groupCode, date).executeAsList().map {
                LocalLesson(date, it.starts_at, it.ends_at, it.subject, it.kind, it.teacher, it.building, it.room, it.source_url)
            }
        }
        return DayView(groupCode, date, lessons)
    }

    fun selectedGroup(): String? = database.platformQueries.selectedGroup().executeAsOneOrNull()

    fun publishedChanges(groupCode: String): List<StoredChange> {
        return database.platformQueries.publishedChanges(groupCode).executeAsList().map {
            StoredChange(it.lsn, it.fingerprint, it.kind, it.payload_json)
        }
    }

    fun cursorLsn(collection: String, scopeId: String): Long {
        return database.platformQueries.selectCursor(collection, scopeId).executeAsOneOrNull()?.lsn ?: 0
    }

    fun storeChange(groupCode: String, lsn: Long, fingerprint: String, kind: String, payloadJson: String, status: String) {
        database.platformQueries.insertLessonChange(groupCode, lsn, fingerprint, kind, payloadJson, status)
    }

    fun applyPublishedChange(groupCode: String, lsn: Long, fingerprint: String, kind: String, payloadJson: String) {
        database.transaction {
            storeChange(groupCode, lsn, fingerprint, kind, payloadJson, "published")
            database.platformQueries.upsertCursor("lesson_change", groupCode, "", lsn)
        }
    }

    fun watchFace(groupCode: String, date: String, nowMinutes: Int, context: CoroutineContext): Flow<WidgetFace> {
        val lessons = database.platformQueries.lessonsOn(groupCode, date).asFlow().mapToList(context)
        val changes = database.platformQueries.publishedChanges(groupCode).asFlow().mapToList(context)
        return combine(lessons, changes) { lessonRows, changeRows ->
            projectWidget(
                lessonRows.map { LocalLesson(date, it.starts_at, it.ends_at, it.subject, it.kind, it.teacher, it.building, it.room, it.source_url) },
                changeRows.map { StoredChange(it.lsn, it.fingerprint, it.kind, it.payload_json) },
                nowMinutes,
            )
        }
    }
}
