package ru.timacad.platform

import app.cash.sqldelight.coroutines.asFlow
import app.cash.sqldelight.coroutines.mapToList
import app.cash.sqldelight.db.QueryResult
import app.cash.sqldelight.db.SqlCursor
import app.cash.sqldelight.db.SqlDriver
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flowOn
import ru.timacad.platform.db.PlatformDatabase
import kotlin.coroutines.CoroutineContext
import androidx.compose.runtime.Immutable
import kotlin.time.TimeSource

@Immutable
data class LocalGroup(val code: String, val institute: String, val course: Int, val status: String)

@Immutable
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

@Immutable
data class DayView(
    val groupCode: String?,
    val date: String?,
    val lessons: List<LocalLesson>,
)

class ScheduleRepository(
    private val database: PlatformDatabase,
    private val driver: SqlDriver? = null,
) {
    private var ftsInitialized = false

    fun transaction(block: () -> Unit) { database.transaction { block() } }

    fun replaceDirectory(groups: List<LocalGroup>, lsn: Long = 0) {
        database.transaction {
            database.platformQueries.deleteGroups()
            groups.forEach { group ->
                database.platformQueries.insertGroup(group.code, group.institute, group.course.toLong(), group.status)
            }
            database.platformQueries.upsertCursor("group_directory", "catalog", "", lsn)
            rebuildFts(groups)
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
            if (selectedGroup() == null) database.platformQueries.upsertSelection(groupCode)
        }
    }

    fun search(query: String, trace: ((String, Long) -> Unit)? = null): List<LocalGroup> {
        val fts = ftsMatches(query, ftsMatchSql, trace) { cursor -> LocalGroup(
            cursor.getString(0).orEmpty(), cursor.getString(1).orEmpty(),
            cursor.getLong(2)!!.toInt(), cursor.getString(3).orEmpty(),
        ) }
        if (fts != null) return fts
        return database.platformQueries.searchGroups(query, query).executeAsList().map {
            LocalGroup(it.group_code, it.institute_name, it.course.toInt(), it.status)
        }
    }

    /** The picker already owns the immutable catalog; only matching IDs cross JNI. */
    fun searchCodes(query: String, trace: ((String, Long) -> Unit)? = null): Set<String> =
        (ftsMatches(query, ftsCodeSql, trace) { it.getString(0).orEmpty() }
            ?: search(query).map { it.code }).toHashSet()

    /** A bounded FTS read; the caller delays it until after the first UI frame. */
    fun warmupSearch() { ftsMatches("ДА", "$ftsCodeSql LIMIT 1", null) { it.getString(0) } }

    /** Only the selected day's rows cross JNI; directory/calendar load later. */
    fun initialDay(today: String): DayView {
        val rows = database.platformQueries.initialCachedDay(today).executeAsList()
        val first = rows.firstOrNull() ?: return DayView(null, null, emptyList())
        val date = first.occurs_on.orEmpty().takeIf { it.isNotEmpty() }
        if (date == null) return DayView(first.group_code, null, emptyList())
        return DayView(first.group_code, date, rows.mapNotNull { row ->
            val start = row.starts_at ?: return@mapNotNull null
            LocalLesson(date, start, row.ends_at.orEmpty(), row.subject.orEmpty(), row.kind.orEmpty(),
                row.teacher.orEmpty(), row.building.orEmpty(), row.room.orEmpty(), row.source_url.orEmpty())
        })
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
        }.flowOn(context)
    }

    private fun rebuildFts(groups: List<LocalGroup>) {
        val sql = driver ?: return
        ensureFts(sql)
        sql.execute(null, "DELETE FROM group_fts", 0, null)
        groups.forEach { group ->
            sql.execute(null, "INSERT INTO group_fts(group_code, institute_name) VALUES (?, ?)", 2) {
                bindString(0, group.code)
                // Also index the numeric part separately: a student searching
                // for 401 should find Д-А401 without knowing its letter prefix.
                val numbers = numberPattern.findAll(group.code).joinToString(" ") { it.value }
                bindString(1, "${group.institute} $numbers")
            }
        }
    }

    private fun <T> ftsMatches(query: String, statement: String, trace: ((String, Long) -> Unit)?, map: (SqlCursor) -> T): List<T>? {
        val sql = driver ?: return null
        val tokensStarted = if (trace != null) TimeSource.Monotonic.markNow() else null
        // Match unicode61's word boundaries, including hyphenated group codes.
        // Quote tokens so user input never becomes an FTS expression.
        val tokens = query.split(tokenBoundary).filter { it.isNotEmpty() }
        if (tokens.isEmpty()) return emptyList()
        val match = tokens.joinToString(" AND ") { "\"$it\"*" }
        tokensStarted?.let { trace?.invoke("tokenize", it.elapsedNow().inWholeMicroseconds) }
        val tableStarted = if (trace != null) TimeSource.Monotonic.markNow() else null
        ensureFts(sql)
        tableStarted?.let { trace?.invoke("ensure_table", it.elapsedNow().inWholeMicroseconds) }
        val queryStarted = if (trace != null) TimeSource.Monotonic.markNow() else null
        var rowsUs = 0L
        val found = sql.executeQuery(statement.hashCode(), statement, { cursor ->
            val rowsStarted = if (trace != null) TimeSource.Monotonic.markNow() else null
            val groups = mutableListOf<T>()
            while (cursor.next().value) groups += map(cursor)
            rowsUs = rowsStarted?.elapsedNow()?.inWholeMicroseconds ?: 0
            QueryResult.Value(groups)
        }, 1) { bindString(0, match) }.value
        queryStarted?.let { trace?.invoke("execute_query", it.elapsedNow().inWholeMicroseconds); trace?.invoke("read_rows", rowsUs) }
        return found
    }

    private fun ensureFts(sql: SqlDriver) {
        if (ftsInitialized) return
        sql.execute(null, "CREATE VIRTUAL TABLE IF NOT EXISTS group_fts USING fts5(group_code, institute_name)", 0, null)
        // Bootstrap can roll back CREATE along with the catalog. Only remember
        // initialization after a standalone, committed statement.
        if (sql.currentTransaction() == null) ftsInitialized = true
    }

    private companion object {
        val tokenBoundary = Regex("[^\\p{L}\\p{N}]+")
        val numberPattern = Regex("[0-9]+")
        val ftsMatchSql = """
            SELECT g.group_code, g.institute_name, g.course, g.status
            FROM group_fts JOIN local_group g ON g.group_code = group_fts.group_code
            WHERE group_fts MATCH ? ORDER BY g.group_code
        """.trimIndent()
        const val ftsCodeSql = "SELECT group_code FROM group_fts WHERE group_fts MATCH ?"
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

    fun replaceCampus(snapshot: CampusSnapshot, lsn: Long) {
        database.transaction {
            database.platformQueries.saveCampus(snapshot.hash, snapshot.bytes)
            database.platformQueries.upsertCursor("campus_graph", "campus", snapshot.hash, lsn)
        }
    }

    fun campusHash(): String? = database.platformQueries.campusHash().executeAsOneOrNull()

    fun campusGraph(): CampusGraph? = database.platformQueries.campusSnapshot().executeAsOneOrNull()?.let {
        decodeCampusPack(it.pack_json, it.snapshot_hash)
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
        }.flowOn(context)
    }
}
