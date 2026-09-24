package ru.timacad.platform

import app.cash.sqldelight.driver.jdbc.sqlite.JdbcSqliteDriver
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import ru.timacad.platform.db.PlatformDatabase
import java.io.File
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class WidgetAndHintTest {
    @Test
    fun publishedChangeRedrawsTheWidgetFromSqlite() = runBlocking {
        val repository = repository()
        repository.replaceLessons(
            "Д-А401",
            "hash",
            4,
            listOf(
                LocalLesson("2026-09-29", "09:00", "10:35", "Ботаника", "lecture", "Петров", "2", "101", "https://eg.timacad.ru/a"),
                LocalLesson("2026-09-29", "10:55", "12:30", "Физика", "practice", "Иванов", "2", "202", "https://eg.timacad.ru/a"),
            ),
        )
        val faces = mutableListOf<WidgetFace>()
        val job = launch(Dispatchers.Unconfined) {
            repository.watchFace("Д-А401", "2026-09-29", nowMinutes = 9 * 60 + 10, context = Dispatchers.Unconfined).collect { faces += it }
        }
        assertEquals(LessonMark.AsScheduled, faces.last().mark)
        assertEquals("Ботаника", faces.last().headline)
        assertEquals("101", faces.last().room)
        repository.storeChange("Д-А401", 1, lessonFingerprint(repository.day("Д-А401", "2026-09-29").lessons.first()), "cancel", """{"reason":"нет"}""", "review")
        assertEquals(LessonMark.AsScheduled, faces.last().mark)
        repository.applyPublishedChange("Д-А401", 2, lessonFingerprint(repository.day("Д-А401", "2026-09-29").lessons.first()), "cancel", """{"reason":"нет"}""")
        assertEquals(LessonMark.Cancelled, faces.last().mark)
        assertTrue(faces.none { it.room == "sqlite-host" })
        job.cancel()
    }

    @Test
    fun moveAndRoomOverlaysChangeTheShownPair() {
        val lesson = LocalLesson("2026-09-29", "09:00", "10:35", "Ботаника", "lecture", "Петров", "2", "101", "https://eg.timacad.ru/a")
        val moved = projectWidget(listOf(lesson), listOf(StoredChange(3, lessonFingerprint(lesson), "move", """{"starts_at":"12:00","ends_at":"13:30"}""")), 9 * 60)
        assertEquals(LessonMark.Moved, moved.mark)
        assertEquals(3 * 60 * 60L, moved.countdownSeconds)
        val relocated = projectWidget(listOf(lesson), listOf(StoredChange(4, lessonFingerprint(lesson), "room", """{"room":"305","building":"3"}""")), 9 * 60 + 10)
        assertEquals(LessonMark.RoomChanged, relocated.mark)
        assertEquals("305", relocated.room)
        assertEquals("3", relocated.building)
        assertEquals("85:00", formatCountdown(relocated.countdownSeconds))
    }

    @Test
    fun burstKeepsOneUpdatePerHalfSecond() {
        val burst = UpdateBurst()
        assertTrue(burst.push(0))
        repeat(8) { assertFalse(burst.push(100L + it)) }
        assertFalse(burst.flush(499))
        assertTrue(burst.flush(500))
        assertFalse(burst.flush(500))
    }

    @Test
    fun hintCommitsSqliteAndUpdatesTheWidgetInsideTheBudget() {
        val repository = repository()
        repository.replaceLessons("Д-А401", "hash", 4, listOf(LocalLesson("2026-09-29", "09:00", "10:35", "Ботаника", "lecture", "Петров", "2", "101", "https://eg.timacad.ru/a")))
        val lesson = repository.day("Д-А401", "2026-09-29").lessons.first()
        var widgets = 0
        var finished = false
        val pump = HintPump(repository, SyncPull { _, _, _ -> listOf(SyncFrame(5, lessonChange("Д-А401", lessonFingerprint(lesson), "cancel", """{"reason":"нет"}"""))) }, clock = { 1_000 }, onWidget = { widgets += 1 })
        val result = deliverHintInline(ScheduleHint("lesson_change", "Д-А401", 5), pump) {
            assertEquals(1, widgets)
            finished = true
        }
        assertTrue(finished)
        assertTrue(result.finishedInline)
        assertEquals(1, result.applied)
        assertEquals(1, result.widgetUpdates)
        assertTrue(result.elapsedMs < 10_000)
        val face = projectWidget(
            repository.day("Д-А401", "2026-09-29").lessons,
            listOf(StoredChange(5, lessonFingerprint(lesson), "cancel", """{"reason":"нет"}""")),
            9 * 60 + 10,
        )
        assertEquals(LessonMark.Cancelled, face.mark)
        assertEquals(5, repository.cursorLsn("lesson_change", "Д-А401"))
    }

    @Test
    fun overtimeHintDoesNotWriteAndDoesNotDefer() {
        val repository = repository()
        var widgets = 0
        var now = 0L
        val pump = HintPump(
            repository,
            SyncPull { _, _, _ ->
                now = 20_000
                listOf(SyncFrame(1, lessonChange("Д-А401", "x", "cancel", "{}")))
            },
            clock = { now },
            onWidget = { widgets += 1 },
        )
        val result = pump.deliver(ScheduleHint("lesson_change", "Д-А401", 1))
        assertFalse(result.finishedInline)
        assertEquals(0, result.applied)
        assertEquals(0, widgets)
        assertEquals(0, repository.cursorLsn("lesson_change", "Д-А401"))
    }

    @Test
    fun receiverStaysOnTheInlinePath() {
        val source = File("src/androidMain/kotlin/ru/timacad/platform/HighPriorityHintReceiver.kt").readText()
        assertTrue(source.contains("goAsync()"))
        assertTrue(source.contains("deliverHintInline"))
        assertFalse(source.contains("WorkManager"))
        assertFalse(source.contains("androidx.work"))
        val tree = listOf(File("src/commonMain"), File("src/androidMain"), File("src/jvmMain"))
            .filter { it.exists() }
            .flatMap { root -> root.walkTopDown().filter { it.extension == "kt" }.toList() }
            .joinToString("\n") { it.readText() }
        assertFalse(tree.contains("androidx.work"))
        assertFalse(tree.contains("DynamicIsland"))
        assertFalse(tree.contains("ActivityKit"))
    }

    private fun repository(): ScheduleRepository {
        val driver = JdbcSqliteDriver(JdbcSqliteDriver.IN_MEMORY)
        PlatformDatabase.Schema.create(driver)
        return ScheduleRepository(PlatformDatabase(driver))
    }

}

private fun lessonChange(group: String, fingerprint: String, kind: String, payload: String): ByteArray {
    return protoString(1, group) + protoString(2, fingerprint) + protoString(3, kind) + protoString(4, payload)
}

private fun protoString(field: Int, value: String): ByteArray {
    val body = value.encodeToByteArray()
    return varint((field shl 3) or 2) + varint(body.size) + body
}

private fun varint(value: Int): ByteArray {
    var rest = value
    val out = ArrayList<Byte>()
    while (rest > 0x7f) {
        out += ((rest and 0x7f) or 0x80).toByte()
        rest = rest ushr 7
    }
    out += rest.toByte()
    return out.toByteArray()
}
