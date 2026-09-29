package ru.timacad.platform

import app.cash.sqldelight.driver.jdbc.sqlite.JdbcSqliteDriver
import ru.timacad.platform.db.PlatformDatabase
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import kotlin.test.assertFails
import kotlin.test.assertContentEquals
import kotlinx.serialization.json.*
import kotlin.random.Random

class PersonalRepositoryTest {
    @Test
    fun largeV4ImportQueuesNativeChunksAndRecoversOnAnotherReplica() {
        val (leftDriver, leftDb) = memory()
        val (rightDriver, rightDb) = memory()
        val left = PersonalRepository(leftDb, NativePersonalEngine())
        val right = PersonalRepository(rightDb, NativePersonalEngine())
        val random = Random(41)
        val tasks = List(10_000) { index -> buildJsonObject {
            put("id", "task-$index")
            put("title", buildString { repeat(240) { append(('a'.code + random.nextInt(26)).toChar()) } })
            put("date", "2026-09-29"); put("done", index % 2 == 0); put("kind", "task")
        } }
        val backup = buildJsonObject {
            put("version", 4)
            put("data", buildJsonObject {
                put("group", "A"); put("name", "Student"); put("notes", "large backup")
                put("tasks", JsonArray(tasks)); put("plans", JsonArray(emptyList())); put("favorites", JsonArray(emptyList()))
            })
        }.toString()
        assertTrue(left.importV4(backup))
        val pending = left.pendingRows()
        assertTrue(pending.size > 1, "large import must be split")
        assertTrue(pending.all { it.payload.size <= 1024 * 1024 })
        assertEquals(pending.size, pending.map { it.clientSeq }.distinct().size)
        right.merge(pending.map { SyncFrame(it.clientSeq, it.payload) })
        assertEquals(left.exportV4(), right.exportV4())
        assertEquals(10_000, right.tasks().size)
        assertTrue(right.pending().isEmpty())
        leftDriver.close(); rightDriver.close()
    }

    @Test
    fun offlineOutboxFlushUsesBoundedBatchesAndOnlyTheActiveAccount() {
        val (driver, db) = memory()
        val repository = PersonalRepository(db, NativePersonalEngine())
        val account = "11111111-1111-4111-8111-111111111111"
        (1L..3L).forEach { repository.enqueue(it, account, ByteArray(600_000)) }
        repository.enqueue(4, "guest:local", byteArrayOf(1))
        var requests = 0
        val transport = object : SyncTransport {
            override fun bootstrap(replicaId: String, groupCode: String) = emptyList<BootstrapFrame>()
            override fun pull(collection: String, scopeId: String, sinceLsn: Long) = emptyList<SyncFrame>()
            override fun push(replicaId: String, rows: List<OutboxRow>): List<PushAck> {
                requests++
                assertTrue(rows.sumOf { it.payload.size } <= 1024 * 1024)
                assertTrue(rows.all { it.scopeId == account })
                return rows.map { PushAck(it.clientSeq, it.clientSeq, true) }
            }
        }
        val worker = LiveSyncWorker(ScheduleRepository(db, driver), repository, transport)
        assertEquals(3, worker.flushOutbox("replica", account))
        assertEquals(3, requests)
        assertEquals(listOf(4L), repository.pending())
        assertEquals(0, worker.flushOutbox("replica", account))
        driver.close()
    }

    @Test
    fun accountSwitchRetainsSeparateGuestAndAccountDocuments() {
        val (driver, db) = memory()
        val repository = PersonalRepository(db, NativePersonalEngine())
        repository.saveNotes("гость")
        val guest = repository.scopeId()
        val first = "11111111-1111-4111-8111-111111111111"
        val second = "22222222-2222-4222-8222-222222222222"
        repository.activateAccount(first)
        assertEquals("", repository.notes())
        repository.saveNotes("первый")
        repository.activateAccount(second)
        assertEquals("", repository.notes())
        repository.saveNotes("второй")
        repository.activateAccount(first)
        assertEquals("первый", repository.notes())
        repository.activateAccount(null)
        assertEquals(guest, repository.scopeId())
        assertEquals("гость", repository.notes())
        assertEquals(setOf(guest, first, second), repository.pendingRows().map { it.scopeId }.toSet())
        driver.close()
    }

    private fun memory(): Pair<JdbcSqliteDriver, PlatformDatabase> {
        val driver = JdbcSqliteDriver(JdbcSqliteDriver.IN_MEMORY)
        PlatformDatabase.Schema.create(driver)
        return driver to PlatformDatabase(driver)
    }

    @Test
    fun concurrentNativeDocumentsConvergeWithoutEchoAndSurviveReopen() {
        val (leftDriver, leftDb) = memory()
        val (rightDriver, rightDb) = memory()
        val left = PersonalRepository(leftDb, NativePersonalEngine())
        val right = PersonalRepository(rightDb, NativePersonalEngine())
        left.saveNotes("Исходная заметка")
        right.merge(left.pendingRows().map { SyncFrame(it.clientSeq, it.payload) })
        assertTrue(right.pendingRows().isEmpty())
        left.pending().forEach(left::acknowledge)
        left.saveNotes("Исходная заметка\nдобавление")
        right.saveTask(PersonalTask("t", "Отчёт", "", false, "task"))
        val leftDelta = left.pendingRows().map { SyncFrame(it.clientSeq + 10, it.payload) }
        val rightDelta = right.pendingRows().map { SyncFrame(it.clientSeq + 20, it.payload) }
        left.merge(rightDelta + rightDelta)
        right.merge(leftDelta)
        assertEquals(left.notes(), right.notes())
        assertEquals(left.tasks(), right.tasks())
        assertEquals(1, right.pendingRows().size)
        val reopened = PersonalRepository(leftDb, NativePersonalEngine())
        assertEquals(left.scopeId(), reopened.scopeId())
        reopened.deleteTask("t")
        right.merge(reopened.pendingRows().map { SyncFrame(it.clientSeq + 30, it.payload) })
        assertTrue(right.tasks().isEmpty())
        assertEquals(reopened.notes(), right.notes())
        leftDriver.close(); rightDriver.close()
    }

    @Test
    fun sqlFailureRollsBackSnapshotProjectionAndOutbox() {
        val (driver, db) = memory()
        val repository = PersonalRepository(db, NativePersonalEngine())
        repository.saveNotes("сохранено")
        val snapshot = db.platformQueries.personalSnapshot(repository.scopeId()).executeAsOne()
        val pending = repository.pending()
        driver.execute(null, "CREATE TRIGGER reject_task BEFORE INSERT ON personal_task BEGIN SELECT RAISE(ABORT, 'test disk failure'); END", 0)
        assertFails { repository.saveTask(PersonalTask("t", "Новая", "", false, "task")) }
        assertContentEquals(snapshot, db.platformQueries.personalSnapshot(repository.scopeId()).executeAsOne())
        assertEquals(pending, repository.pending())
        assertTrue(repository.tasks().isEmpty())
        assertEquals("сохранено", repository.notes())
        driver.close()
    }

    @Test
    fun upgradeAndV4ImportPreserveExistingDataAndRejectInvalidBackupAtomically() {
        val (driver, db) = memory()
        driver.execute(null, "DROP TABLE personal_document", 0)
        PlatformDatabase.Schema.migrate(driver, 1, 2)
        db.platformQueries.upsertMeta("personal_notes", "старое")
        db.platformQueries.upsertTask("old", "Задание", "", 0, "homework")
        val repository = PersonalRepository(db, NativePersonalEngine())
        repository.saveNotes("после обновления")
        assertEquals("old", repository.tasks().single().id)
        val backup = """{ "version": 4, "data": {"group":"А","name":"Я","notes":"строка\n\t\"{текст}\"","tasks":[],"plans":[],"favorites":["А"]}}"""
        assertTrue(repository.importV4(backup))
        assertEquals("строка\n\t\"{текст}\"", repository.notes())
        assertTrue(repository.tasks().isEmpty())
        val before = repository.exportV4("А", "Я", repository.notes())
        val pending = repository.pending()
        assertFalse(repository.importV4(backup.replace("\"tasks\":[]", "\"tasks\":[{\"id\":\"bad\",\"title\":\"\",\"date\":\"\",\"done\":false,\"kind\":\"task\"}]")))
        assertEquals(before, repository.exportV4("А", "Я", repository.notes()))
        assertEquals(pending, repository.pending())
        assertTrue(before.contains("\"favorites\":[\"А\"]"))
        driver.close()
    }

    @Test
    fun outboxRedeliveryDoesNotQueueTwiceAndExportMatchesV4() {
        val driver = JdbcSqliteDriver(JdbcSqliteDriver.IN_MEMORY)
        PlatformDatabase.Schema.create(driver)
        val repository = PersonalRepository(PlatformDatabase(driver), NativePersonalEngine())
        val payload = byteArrayOf(1, 2, 3)
        assertTrue(repository.enqueue(1, "user-1", payload))
        repository.acknowledge(1)
        assertFalse(repository.enqueue(1, "user-1", payload))
        assertEquals(emptyList(), repository.pending())

        repository.saveTask(PersonalTask("t1", "Сдать отчёт", "2026-09-23", false, "homework"))
        repository.savePlan(PersonalPlan("p1", "Библиотека", "2026-09-23", "16:00", "17:30", "читальный зал", false))
        val exported = repository.exportV4("Д-А401", "Анна", "черновик")
        assertTrue(exported.startsWith("{\"version\":4,"))
        assertTrue(exported.contains("\"title\":\"Сдать отчёт\""))
        assertTrue(exported.contains("\"kind\":\"homework\""))
        assertTrue(exported.contains("\"start\":\"16:00\""))
        assertTrue(exported.contains("\"notes\":\"черновик\""))
    }
}
