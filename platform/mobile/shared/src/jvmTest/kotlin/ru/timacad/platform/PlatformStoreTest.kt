package ru.timacad.platform

import app.cash.sqldelight.driver.jdbc.sqlite.JdbcSqliteDriver
import ru.timacad.platform.db.PlatformDatabase
import kotlin.test.Test
import kotlin.test.assertEquals

class PlatformStoreTest {
    @Test
    fun screenTitleIsReadFromSqlite() {
        val driver = JdbcSqliteDriver(JdbcSqliteDriver.IN_MEMORY)
        PlatformDatabase.Schema.create(driver)
        val store = PlatformStore(PlatformDatabase(driver))

        store.ensureSeeded()
        store.ensureSeeded()

        assertEquals("Платформа", store.screenTitle())
    }
}
