package ru.timacad.platform

import ru.timacad.platform.db.PlatformDatabase

class PlatformStore(private val database: PlatformDatabase) {
    fun ensureSeeded() {
        val existing = database.platformQueries.selectByKey(SCREEN_TITLE_KEY).executeAsOneOrNull()
        if (existing == null) {
            database.platformQueries.insertMeta(SCREEN_TITLE_KEY, SCREEN_TITLE)
        }
    }

    fun screenTitle(): String {
        return database.platformQueries.selectByKey(SCREEN_TITLE_KEY).executeAsOne()
    }

    private companion object {
        const val SCREEN_TITLE_KEY = "screen_title"
        const val SCREEN_TITLE = "Платформа"
    }
}
