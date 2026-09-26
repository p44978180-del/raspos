package ru.timacad.platform

import app.cash.sqldelight.driver.jdbc.sqlite.JdbcSqliteDriver
import ru.timacad.platform.db.PlatformDatabase
import uniffi.timacad_core.routeCampus
import java.io.ByteArrayOutputStream
import java.io.File
import java.net.HttpURLConnection
import java.net.ServerSocket
import java.net.URL
import kotlin.system.measureNanoTime
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class Phase8ClientTest {
    @Test
    fun directoryRoundTripAndLiveBootstrapLandInSqlite() {
        val groups = listOf(
            LocalGroup("Д-А401", "Агрономии", 4, "current"),
            LocalGroup("Э-12", "Экономики", 1, "current"),
        )
        val op = encodeDirectoryOp("v4", groups)
        assertEquals(groups.map { it.code }, decodeDirectory(op).map { it.code })
        val frame = BootstrapFrame("group_directory", "catalog", 9, op, true)
        val message = ProtoWriter().apply {
            fieldInt(1, frame.lsn)
            fieldString(2, frame.collection)
            fieldString(3, frame.scopeId)
            fieldBytes(4, frame.op)
            fieldBool(5, true)
        }.toByteArray()
        val wire = encodeEnvelope(message) + encodeEnvelope(ByteArray(0), end = true)
        assertEquals(9, decodeBootstrapFrames(wire).single().lsn)
        val opened = open()
        val repository = opened.first
        val worker = LiveSyncWorker(repository, opened.second, FakeTransport(listOf(frame)))
        assertEquals(1, worker.bootstrap("11111111-1111-4111-8111-111111111111", ""))
        assertEquals(2, repository.allGroups().size)
        assertEquals(9, repository.cursorLsn("group_directory", "catalog"))
    }

    @Test
    fun hintPullUpdatesTheWidgetAndOutboxDedups() {
        val driver = memory()
        val database = PlatformDatabase(driver)
        val schedule = ScheduleRepository(database, driver)
        schedule.replaceLessons("Д-А401", "hash", 4, listOf(LocalLesson("2026-09-29", "09:00", "10:35", "Ботаника", "lecture", "Петров", "2", "101", "")))
        val lesson = schedule.day("Д-А401", "2026-09-29").lessons.first()
        var widgets = 0
        val personal = PersonalRepository(database)
        val transport = FakeTransport(emptyList(), pull = { listOf(SyncFrame(8, changeOp("Д-А401", lessonFingerprint(lesson), "room", """{"room":"305","building":"3"}"""))) })
        val worker = LiveSyncWorker(schedule, personal, transport) { widgets += 1 }
        val result = worker.onHint(ScheduleHint("lesson_change", "Д-А401", 8))
        assertEquals(1, result.widgetUpdates)
        assertEquals(1, widgets)
        assertTrue(personal.enqueue(4, "me", byteArrayOf(1)))
        assertFalse(personal.enqueue(4, "me", byteArrayOf(1)))
        assertEquals(1, worker.flushOutbox("11111111-1111-4111-8111-111111111111"))
        assertEquals(0, worker.flushOutbox("11111111-1111-4111-8111-111111111111"))
        assertEquals(listOf("11111111-1111-4111-8111-111111111111" to 4L), transport.pushed)
    }

    @Test
    fun quietBackoffAndGuestGateStayOffTheModalPath() {
        assertEquals(1_000, backoffMillis(0, 0.5))
        assertEquals(30_000, backoffMillis(6, 0.5))
        assertEquals(900, backoffMillis(0, 0.0))
        val opened = open()
        val worker = LiveSyncWorker(opened.first, opened.second, object : SyncTransport {
            override fun bootstrap(replicaId: String, groupCode: String) = error("down")
            override fun pull(collection: String, scopeId: String, sinceLsn: Long) = error("down")
            override fun push(replicaId: String, rows: List<OutboxRow>) = error("down")
        })
        assertEquals(0, worker.bootstrap("11111111-1111-4111-8111-111111111111", ""))
        assertEquals(1, worker.quietFailures)
        assertTrue(worker.nextDelayMillis(0.5) >= 1_000)
        assertEquals(ElderGate.Guest, elderGate("schedule", null))
        assertEquals(ElderGate.NeedsElder, elderGate("lesson_change", null))
        assertEquals(ElderGate.Guest, elderGate("lesson_change", "token"))
    }

    @Test
    fun dayRowsKeepGapsSubgroupsAndStableKeys() {
        val lessons = listOf(
            LocalLesson("2026-09-29", "09:00", "10:30", "Ботаника", "lecture", "Петров", "2", "101", ""),
            LocalLesson("2026-09-29", "12:05", "13:40", "Физика п/г 2", "practice", "Иванов", "2", "202", ""),
        )
        val rows = composeDayRows(lessons, emptyList(), subgroup = 1)
        assertEquals(listOf("2026-09-29|09:00|Ботаника"), rows.filterIsInstance<LessonRow>().map { it.key })
        val both = composeDayRows(lessons, listOf(StoredChange(1, lessonFingerprint(lessons[0]), "cancel", "{}")), 0)
        assertEquals("Окно: 1 ч 35 мин", both.filterIsInstance<GapRow>().single().label)
        assertEquals(LessonMark.Cancelled, both.filterIsInstance<LessonRow>().first().mark)
        assertTrue(composeDayRows(listOf(lessons[0], lessons[1].copy(startsAt = "11:00", subject = "Физика")), emptyList(), 0).none { it is GapRow })
    }

    @Test
    fun catalogOf805GroupsIsSearchableInsideThreeMilliseconds() {
        val catalog = File("../../../public/data/official-schedule.json")
        val text = catalog.readText()
        val total = Regex(""""totalGroups"\s*:\s*(\d+)""").find(text)?.groupValues?.get(1)?.toInt()
        assertEquals(805, total)
        val driver = memory()
        val repository = ScheduleRepository(PlatformDatabase(driver), driver)
        val groups = (1..805).map { index -> LocalGroup("G$index", "Институт ${index % 12}", index % 5 + 1, "current") }
        repository.replaceDirectory(groups, 1)
        repository.search("G800")
        val elapsed = measureNanoTime { repository.search("G800") }
        assertTrue(repository.search("G800").any { it.code == "G800" })
        assertTrue(elapsed < 3_000_000, "search took ${elapsed / 1_000_000.0} ms")
        val cold = measureNanoTime {
            val fresh = memory()
            val opened = ScheduleRepository(PlatformDatabase(fresh), fresh)
            opened.day(null, null)
        }
        assertTrue(cold < 100_000_000, "cold read took ${cold / 1_000_000.0} ms")
    }

    @Test
    fun centrifugoHintAndPasskeySessionStayOnThePhase3Routes() {
        assertEquals("group:636174616c6f67", centrifugoChannel("catalog"))
        val hint = parseRealtimeHint("""{"push":{"pub":{"data":{"collection":"lesson","scope_id":"Д-А401","lsn":12}}}}""")
        assertEquals(ScheduleHint("lesson", "Д-А401", 12), hint)
        val vault = MemoryVault()
        val calls = mutableListOf<String>()
        val client = PasskeyClient(
            http = object : PasskeyHttp {
                override fun post(path: String, body: String, headers: Map<String, String>): PasskeyResponse {
                    calls += path.substringBefore('?')
                    return if (path.startsWith(PASSKEY_REGISTER_BEGIN)) {
                        PasskeyResponse(200, """{"publicKey":{}}""", mapOf("X-Principal-Id" to "11111111-1111-4111-8111-111111111111"))
                    } else {
                        PasskeyResponse(200, """{"session":"issued.token"}""", emptyMap())
                    }
                }
            },
            prompt = object : PasskeyPrompt {
                override fun create(requestJson: String) = """{"id":"cred"}"""
                override fun get(requestJson: String) = """{"id":"cred"}"""
            },
            vault = vault,
        )
        val outcome = client.register("Анна")
        assertTrue(outcome is PasskeyOutcome.Session)
        assertEquals("issued.token", vault.load())
        assertEquals(listOf(PASSKEY_REGISTER_BEGIN, PASSKEY_REGISTER_FINISH), calls)
    }

    @Test
    fun connectStreamSpeaksBootstrapAndPersonalBackupRoundTrips() {
        val op = encodeDirectoryOp("v4", listOf(LocalGroup("Д-А401", "Агрономии", 4, "current")))
        val payload = ProtoWriter().apply {
            fieldInt(1, 3)
            fieldString(2, "group_directory")
            fieldString(3, "catalog")
            fieldBytes(4, op)
            fieldBool(5, true)
        }.toByteArray()
        val body = encodeEnvelope(payload) + encodeEnvelope("{}".encodeToByteArray(), end = true)
        ServerSocket(0).use { socket ->
            val accepted = Thread {
                socket.accept().use { client ->
                    val input = client.getInputStream()
                    val header = ByteArrayOutputStream()
                    var matched = 0
                    val marker = byteArrayOf(13, 10, 13, 10)
                    while (matched < 4) {
                        val next = input.read()
                        if (next < 0) break
                        header.write(next)
                        matched = if (next.toByte() == marker[matched]) matched + 1 else 0
                    }
                    val response = "HTTP/1.1 200 OK\r\nContent-Type: application/connect+proto\r\nContent-Length: ${body.size}\r\nConnection: close\r\n\r\n".encodeToByteArray() + body
                    client.getOutputStream().write(response)
                    client.getOutputStream().flush()
                }
            }
            accepted.start()
            val connection = URL("http://127.0.0.1:${socket.localPort}$SYNC_SERVICE/Bootstrap").openConnection() as HttpURLConnection
            connection.requestMethod = "POST"
            connection.doOutput = true
            connection.setRequestProperty("Content-Type", "application/connect+proto")
            connection.outputStream.use { it.write(encodeBootstrapRequest("11111111-1111-4111-8111-111111111111", "")) }
            val frames = decodeBootstrapFrames(connection.inputStream.readBytes())
            accepted.join(2_000)
            assertEquals("Д-А401", decodeDirectory(frames.single().op).single().code)
        }
        val driver = memory()
        val personal = PersonalRepository(PlatformDatabase(driver))
        personal.saveTask(PersonalTask("t1", "черновик", "2026-09-29", false, "note"))
        personal.savePlan(PersonalPlan("p1", "пара", "2026-09-29", "09:00", "10:30", "101", true))
        val exported = personal.exportV4("Д-А401", "Анна", "заметка")
        val restored = PersonalRepository(PlatformDatabase(memory()))
        assertTrue(restored.importV4(exported))
        assertEquals("заметка", restored.notes())
        assertEquals("черновик", restored.tasks().single().title)
        assertTrue(restored.plans().single().cancelled)
    }

    @Test
    fun routeBetweenFloorsUsesTheTmg1Graph() {
        val route = routeCampus(demoTopology(), "101", "201")
        assertTrue(route.found)
        assertEquals(1u, route.floorChanges)
        assertEquals("Схема территории · 101 → Лестница → 201 · этажей: 1", routeCaption(route.found, route.floorChanges.toInt(), route.roomNames))
    }

    private fun memory(): JdbcSqliteDriver {
        val driver = JdbcSqliteDriver(JdbcSqliteDriver.IN_MEMORY)
        PlatformDatabase.Schema.create(driver)
        return driver
    }

    private fun open(): Pair<ScheduleRepository, PersonalRepository> {
        val driver = memory()
        val database = PlatformDatabase(driver)
        return ScheduleRepository(database, driver) to PersonalRepository(database)
    }
}

private fun changeOp(group: String, fingerprint: String, kind: String, payload: String): ByteArray {
    val writer = ProtoWriter()
    writer.fieldString(1, group)
    writer.fieldString(2, fingerprint)
    writer.fieldString(3, kind)
    writer.fieldString(4, payload)
    return writer.toByteArray()
}

private class FakeTransport(
    private val frames: List<BootstrapFrame>,
    private val pull: () -> List<SyncFrame> = { emptyList() },
) : SyncTransport {
    val pushed = mutableListOf<Pair<String, Long>>()
    override fun bootstrap(replicaId: String, groupCode: String) = frames
    override fun pull(collection: String, scopeId: String, sinceLsn: Long) = pull()
    override fun push(replicaId: String, rows: List<OutboxRow>): List<PushAck> {
        rows.forEach { pushed += replicaId to it.clientSeq }
        return rows.map { PushAck(it.clientSeq, it.clientSeq, true) }
    }
}
