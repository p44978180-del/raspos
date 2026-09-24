package ru.timacad.platform

import app.cash.sqldelight.driver.jdbc.sqlite.JdbcSqliteDriver
import ru.timacad.platform.db.PlatformDatabase
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class PersonalRepositoryTest {
    @Test
    fun outboxRedeliveryDoesNotQueueTwiceAndExportMatchesV4() {
        val driver = JdbcSqliteDriver(JdbcSqliteDriver.IN_MEMORY)
        PlatformDatabase.Schema.create(driver)
        val repository = PersonalRepository(PlatformDatabase(driver))
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
