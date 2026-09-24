package ru.timacad.platform

import app.cash.sqldelight.driver.jdbc.sqlite.JdbcSqliteDriver
import ru.timacad.platform.db.PlatformDatabase
import java.io.File
import kotlin.test.Test
import kotlin.test.assertEquals

class SnapshotPayloadTest {
    @Test
    fun goldenBootstrapOpOpensItsDayFromSqlite() {
        val payload = decodeLessonSnapshot(platformFile("testdata/group-da401.op.bin").readBytes())
        val hash = platformFile("testdata/group-da401.sha256").readText().trim()
        assertEquals("Д-А401", payload.groupCode)
        assertEquals(hash, payload.snapshotHash)
        assertEquals(73, payload.lessons.size)

        val driver = JdbcSqliteDriver(JdbcSqliteDriver.IN_MEMORY)
        PlatformDatabase.Schema.create(driver)
        val repository = ScheduleRepository(PlatformDatabase(driver))
        repository.replaceLessons(payload.groupCode, payload.snapshotHash, 1, payload.lessons)
        val day = repository.day(repository.selectedGroup(), "2026-09-29")
        assertEquals("Д-А401", day.groupCode)
        assertEquals("2026-09-29", day.date)
        assertEquals(3, day.lessons.size)
    }

    private fun platformFile(relative: String): File {
        var dir = File("").absoluteFile
        repeat(8) {
            val candidate = File(dir, relative)
            if (candidate.isFile) return candidate
            dir = dir.parentFile ?: return candidate
        }
        error("missing $relative from ${File("").absolutePath}")
    }
}
