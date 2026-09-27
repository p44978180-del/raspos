package ru.timacad.platform

import android.content.Context
import app.cash.sqldelight.driver.android.AndroidSqliteDriver
import app.cash.sqldelight.db.SqlDriver
import io.requery.android.database.sqlite.RequerySQLiteOpenHelperFactory
import ru.timacad.platform.db.PlatformDatabase

/** The catalog requires FTS5, which is not enabled in Android's system SQLite. */
fun platformDriver(context: Context): SqlDriver = AndroidSqliteDriver(
    schema = PlatformDatabase.Schema,
    context = context.applicationContext,
    name = "platform.db",
    factory = RequerySQLiteOpenHelperFactory(),
)
