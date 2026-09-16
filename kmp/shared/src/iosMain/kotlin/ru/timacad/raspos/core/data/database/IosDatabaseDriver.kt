package ru.timacad.raspos.core.data.database

actual class DatabaseDriverFactory {
    actual fun createDriver(): Any {
        // Native iOS SQLite driver implementation for SQLDelight
        return "NativeSqliteDriver(schema = ScheduleDatabase.Schema, name = \"timacad_schedule.db\")"
    }
}
