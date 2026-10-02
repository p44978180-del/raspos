package ru.timacad.platform

import app.cash.sqldelight.driver.jdbc.sqlite.JdbcSqliteDriver
import java.io.File
import kotlinx.serialization.json.*
import okio.ByteString.Companion.toByteString
import ru.timacad.platform.db.PlatformDatabase
import kotlin.test.*

private val campusBytes by lazy { File("../../campus/data/campus-pack.json").readBytes() }
internal fun campusBootstrapFrame(lsn: Long = 1): BootstrapFrame {
    val snapshot = ProtoWriter().apply {
        fieldString(1, campusBytes.toByteString().sha256().hex()); fieldBytes(2, campusBytes)
    }.toByteArray()
    return BootstrapFrame("campus_graph", "campus", lsn, ProtoWriter().apply { fieldBytes(3, snapshot) }.toByteArray(), true)
}
internal fun lessonBootstrapFrame(group: String, lsn: Long = 1): BootstrapFrame {
    val snapshot = ProtoWriter().apply { fieldString(1, group); fieldString(2, "semester") }.toByteArray()
    return BootstrapFrame("lesson", group, lsn, ProtoWriter().apply { fieldBytes(2, snapshot) }.toByteArray(), true)
}
private fun bundle(group: String = "NEW", lsn: Long = 2) = listOf(
    BootstrapFrame("group_directory", "catalog", lsn, encodeDirectoryOp("new", listOf(LocalGroup(group, "Institute", 1, "current"))), true),
    lessonBootstrapFrame(group, lsn), campusBootstrapFrame(lsn),
)

class BootstrapBundleTest {
    @Test
    fun invalidBundlesPreserveEverySnapshotCursorAndSelection() {
        JdbcSqliteDriver(JdbcSqliteDriver.IN_MEMORY).use { driver ->
            PlatformDatabase.Schema.create(driver)
            val repository = ScheduleRepository(PlatformDatabase(driver), driver)
            applyBootstrapBundle(repository, bundle("OLD", 1), "OLD")
            val beforeHash = repository.campusHash()
            val frames = bundle()
            val badCampus = frames.last().copy(op = frames.last().op.copyOf().also { it[it.lastIndex] = 0 })
            val invalid = listOf(
                frames.dropLast(1), frames + frames.first(), frames.map { it.copy(reset = false) },
                frames.map { it.copy(lsn = 0) }, frames.dropLast(1) + badCampus,
                frames.map { if (it.collection == "lesson") it.copy(scopeId = "OTHER") else it },
                frames.map { if (it.collection == "campus_graph") it.copy(scopeId = "OTHER") else it },
            )
            invalid.forEach { candidate ->
                assertFails { applyBootstrapBundle(repository, candidate, "NEW") }
                assertEquals(listOf("OLD"), repository.allGroups().map { it.code })
                assertEquals("OLD", repository.selectedGroup())
                assertEquals(beforeHash, repository.campusHash())
                assertEquals(1, repository.cursorLsn("group_directory", "catalog"))
                assertEquals(1, repository.cursorLsn("campus_graph", "campus"))
                assertEquals(0, repository.cursorLsn("lesson", "NEW"))
                assertEquals(listOf("OLD"), repository.search("OLD").map { it.code })
            }
            // A late SQL failure must also roll back the directory, FTS and lesson writes.
            driver.execute(null, "CREATE TRIGGER reject_campus BEFORE INSERT ON local_campus BEGIN SELECT RAISE(ABORT, 'disk failure'); END", 0)
            assertFails { applyBootstrapBundle(repository, frames, "NEW") }
            assertEquals(listOf("OLD"), repository.search("OLD").map { it.code })
            assertEquals("OLD", repository.selectedGroup())
            assertEquals(0, repository.cursorLsn("lesson", "NEW"))
        }
    }

    @Test
    fun resetPullRefetchesTheWholeBundleBeforeOneWidgetUpdate() {
        JdbcSqliteDriver(JdbcSqliteDriver.IN_MEMORY).use { driver ->
            PlatformDatabase.Schema.create(driver)
            val database = PlatformDatabase(driver)
            val repository = ScheduleRepository(database, driver)
            applyBootstrapBundle(repository, bundle("OLD", 1), "OLD")
            var bootstraps = 0
            var widgets = 0
            var fail = false
            val worker = LiveSyncWorker(repository, PersonalRepository(database, NativePersonalEngine()), object : SyncTransport {
                override fun bootstrap(replicaId: String, groupCode: String): List<BootstrapFrame> {
                    bootstraps++; assertEquals("OLD", groupCode)
                    return if (fail) bundle("OLD", 3).dropLast(1) else bundle("OLD", 2)
                }
                override fun pull(collection: String, scopeId: String, sinceLsn: Long) = listOf(SyncFrame(1, byteArrayOf(0), reset = true))
                override fun push(replicaId: String, rows: List<OutboxRow>) = emptyList<PushAck>()
            }) { widgets++ }
            assertEquals(3, worker.onHint(ScheduleHint("lesson", "OLD", 2)).applied)
            assertEquals(1, bootstraps); assertEquals(1, widgets)
            assertEquals(2, repository.cursorLsn("group_directory", "catalog"))
            assertEquals(2, repository.cursorLsn("campus_graph", "campus"))
            fail = true
            assertEquals(0, worker.onHint(ScheduleHint("lesson", "OLD", 3)).applied)
            assertEquals(1, widgets)
            assertEquals(2, repository.cursorLsn("group_directory", "catalog"))
            assertEquals(2, repository.cursorLsn("lesson", "OLD"))
            assertNotNull(worker.lastError)
        }
    }

    @Test
    fun migrationKeepsCachedScheduleAndPersonalHistory() {
        JdbcSqliteDriver(JdbcSqliteDriver.IN_MEMORY).use { driver ->
            PlatformDatabase.Schema.create(driver)
            val database = PlatformDatabase(driver)
            val repository = ScheduleRepository(database, driver)
            repository.replaceDirectory(listOf(LocalGroup("OLD", "Institute", 1, "current")), 11)
            repository.select("OLD")
            database.platformQueries.savePersonalSnapshot("account", byteArrayOf(1, 2, 3))
            driver.execute(null, "DROP TABLE local_campus", 0)
            PlatformDatabase.Schema.migrate(driver, 2, 3)
            assertEquals("OLD", repository.selectedGroup())
            assertEquals(11, repository.cursorLsn("group_directory", "catalog"))
            assertContentEquals(byteArrayOf(1, 2, 3), database.platformQueries.personalSnapshot("account").executeAsOne())
            assertNull(repository.campusGraph())
            applyBootstrapBundle(repository, bundle("OLD", 12), "OLD")
            assertEquals(5392, repository.campusGraph()!!.nodeCount)
        }
    }

    @Test
    fun packValidationAndNativeRouteProduceRealMapCoordinates() {
        val graph = decodeCampusSnapshot(campusBootstrapFrame().op).graph
        val route = graph.view(3167, 3140, NativeCampusRouter())
        val coordinates = Json.parseToJsonElement(route.routeJson).jsonObject.getValue("features").jsonArray.first()
            .jsonObject.getValue("geometry").jsonObject.getValue("coordinates").jsonArray
        assertEquals(37.5548196, coordinates.first().jsonArray[0].jsonPrimitive.double)
        assertEquals(55.8305063, coordinates.first().jsonArray[1].jsonPrimitive.double)
        assertTrue(coordinates.size > 2)
        assertNotNull(route.routeBounds)
        assertEquals(EMPTY_GEOJSON, graph.view(3167, 3222, NativeCampusRouter()).routeJson)
        val original = Json.parseToJsonElement(campusBytes.decodeToString()).jsonObject
        val changes = listOf(
            "topologyBase64" to JsonPrimitive("VE1HMf//////////"),
            "nodes" to JsonArray(original.getValue("nodes").jsonArray + original.getValue("nodes").jsonArray.first()),
            "center" to JsonArray(listOf(JsonPrimitive(0), JsonPrimitive(0))),
        )
        changes.forEach { (key, value) ->
            val bytes = JsonObject(original + (key to value)).toString().encodeToByteArray()
            assertFails { decodeCampusPack(bytes, bytes.toByteString().sha256().hex()) }
        }
        assertFails { decodeCampusPack(campusBytes, "0".repeat(64)) }
    }
}
