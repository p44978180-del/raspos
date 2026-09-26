package ru.timacad.platform

import app.cash.sqldelight.coroutines.asFlow
import app.cash.sqldelight.coroutines.mapToList
import app.cash.sqldelight.db.QueryResult
import app.cash.sqldelight.db.SqlDriver
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

class ScheduleRepository(
    private val database: PlatformDatabase,
    private val driver: SqlDriver? = null,
) {
    fun replaceDirectory(groups: List<LocalGroup>, lsn: Long = 0) {
        database.transaction {
            database.platformQueries.deleteGroups()
            groups.forEach { group ->
                database.platformQueries.insertGroup(group.code, group.institute, group.course.toLong(), group.status)
            }
            database.platformQueries.upsertCursor("group_directory", "catalog", "", lsn)
        }
        rebuildFts(groups)
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
        val fts = ftsCodes(query)
        if (!fts.isNullOrEmpty()) {
            return fts.mapNotNull { code ->
                database.platformQueries.groupByCode(code).executeAsOneOrNull()?.let {
                    LocalGroup(it.group_code, it.institute_name, it.course.toInt(), it.status)
                }
            }
        }
        return database.platformQueries.searchGroups(query, query).executeAsList().map {
            LocalGroup(it.group_code, it.institute_name, it.course.toInt(), it.status)
        }
    }

    fun allGroups(): List<LocalGroup> = database.platformQueries.listGroups().executeAsList().map {
        LocalGroup(it.group_code, it.institute_name, it.course.toInt(), it.status)
    }

    fun rememberFavorite(code: String) {
        val current = favorites().toMutableSet()
        if (!current.add(code)) current.remove(code)
        database.platformQueries.upsertMeta("favorites", current.joinToString("\n"))
    }

    fun favorites(): Set<String> {
        val raw = database.platformQueries.selectByKey("favorites").executeAsOneOrNull().orEmpty()
        return raw.split('\n').filter { it.isNotEmpty() }.toSet()
    }

    fun replicaId(nextByte: () -> Int = { kotlin.random.Random.nextInt(256) }): String {
        val existing = database.platformQueries.selectByKey("replica_id").executeAsOneOrNull()
        if (existing != null) return existing
        val created = randomUuid(nextByte)
        database.platformQueries.upsertMeta("replica_id", created)
        return created
    }

    fun watchDay(groupCode: String, date: String, subgroup: Int, context: CoroutineContext): Flow<List<DayRow>> {
        val lessons = database.platformQueries.lessonsOn(groupCode, date).asFlow().mapToList(context)
        val changes = database.platformQueries.publishedChanges(groupCode).asFlow().mapToList(context)
        return combine(lessons, changes) { lessonRows, changeRows ->
            composeDayRows(
                lessonRows.map { LocalLesson(date, it.starts_at, it.ends_at, it.subject, it.kind, it.teacher, it.building, it.room, it.source_url) },
                changeRows.map { StoredChange(it.lsn, it.fingerprint, it.kind, it.payload_json) },
                subgroup,
            )
        }
    }

    private fun rebuildFts(groups: List<LocalGroup>) {
        val sql = driver ?: return
        sql.execute(null, "CREATE VIRTUAL TABLE IF NOT EXISTS group_fts USING fts5(group_code, institute_name)", 0, null)
        sql.execute(null, "DELETE FROM group_fts", 0, null)
        groups.forEach { group ->
            sql.execute(null, "INSERT INTO group_fts(group_code, institute_name) VALUES (?, ?)", 2) {
                bindString(0, group.code)
                bindString(1, group.institute)
            }
        }
    }

    private fun ftsCodes(query: String): List<String>? {
        val sql = driver ?: return null
        val token = query.trim()
        if (token.isEmpty()) return null
        val match = token.filter { it.isLetterOrDigit() }
        if (match.length < 2) return null
        return try {
            val codes = mutableListOf<String>()
            sql.executeQuery(null, "SELECT group_code FROM group_fts WHERE group_fts MATCH ? LIMIT 100", { cursor ->
                while (cursor.next().value) codes += cursor.getString(0).orEmpty()
                QueryResult.Value(codes)
            }, 1) {
                bindString(0, "$match*")
            }.value
        } catch (_: Throwable) {
            null
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

    fun select(groupCode: String) {
        database.platformQueries.upsertSelection(groupCode)
    }

    fun selectedGroup(): String? = database.platformQueries.selectedGroup().executeAsOneOrNull()

    fun dates(groupCode: String): List<String> = database.platformQueries.datesForGroup(groupCode).executeAsList()

    fun lessonCount(groupCode: String): Long = database.platformQueries.countLessons(groupCode).executeAsOne()

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
