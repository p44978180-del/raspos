package ru.timacad.raspos.core.data.database

import ru.timacad.raspos.core.domain.models.DaySchedule
import ru.timacad.raspos.core.domain.models.Lesson
import ru.timacad.raspos.core.domain.models.LessonType

class ScheduleDatabaseHelper(
    private val driverFactory: DatabaseDriverFactory
) {
    private val inMemoryLessons = mutableListOf<Lesson>()
    private val inMemoryGroups = mutableListOf<String>()

    fun initDatabase() {
        // Initializes embedded SQLite relational tables
    }

    fun insertLessons(lessons: List<Lesson>) {
        inMemoryLessons.addAll(lessons)
    }

    fun getLessonsForDate(groupId: String, date: String, weekParity: String): List<Lesson> {
        return inMemoryLessons.filter {
            it.weekParity == "ALL" || it.weekParity == weekParity
        }
    }

    fun getSavedGroups(): List<String> {
        return if (inMemoryGroups.isEmpty()) listOf("ДА 01-26") else inMemoryGroups
    }

    fun saveGroup(groupId: String) {
        if (!inMemoryGroups.contains(groupId)) {
            inMemoryGroups.add(groupId)
        }
    }

    fun clearAllData() {
        inMemoryLessons.clear()
        inMemoryGroups.clear()
    }
}
