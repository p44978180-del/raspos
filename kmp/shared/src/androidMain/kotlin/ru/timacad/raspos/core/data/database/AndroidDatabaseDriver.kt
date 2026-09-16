package ru.timacad.raspos.core.data.database

import android.content.Context

actual class DatabaseDriverFactory(private val context: Context) {
    actual fun createDriver(): Any {
        // Android SQLite driver implementation for SQLDelight
        return "AndroidSqliteDriver(context = context, name = \"timacad_schedule.db\")"
    }
}
