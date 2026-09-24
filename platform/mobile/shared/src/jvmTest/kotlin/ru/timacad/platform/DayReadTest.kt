package ru.timacad.platform

import app.cash.sqldelight.driver.jdbc.sqlite.JdbcSqliteDriver
import ru.timacad.platform.db.PlatformDatabase
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class DayReadTest {
    @Test
    fun dayOpensFromSqliteWithoutASocket() {
        val driver = JdbcSqliteDriver(JdbcSqliteDriver.IN_MEMORY)
        PlatformDatabase.Schema.create(driver)
        val repository = ScheduleRepository(PlatformDatabase(driver))
        repository.replaceDirectory(listOf(LocalGroup("Д-А401", "Институт", 4, "current")))
        repository.replaceLessons(
            groupCode = "Д-А401",
            snapshotHash = "abc",
            lsn = 1,
            lessons = listOf(
                LocalLesson("2026-09-29", "10:55", "12:30", "Вторая", "practice", "Иванов", "2", "10", "https://eg.timacad.ru/a"),
                LocalLesson("2026-09-29", "09:00", "10:35", "Первая", "lecture", "Петров", "1", "101", "https://eg.timacad.ru/a"),
                LocalLesson("2026-09-30", "09:00", "10:35", "Другой день", "lab", "Петров", "1", "102", "https://eg.timacad.ru/a"),
            ),
        )

        val day = repository.day(repository.selectedGroup(), "2026-09-29")

        assertEquals("Д-А401", day.groupCode)
        assertEquals("2026-09-29", day.date)
        assertEquals(listOf("Первая", "Вторая"), day.lessons.map { it.subject })
        assertTrue(day.lessons.none { it.subject == "Другой день" })
    }
}
