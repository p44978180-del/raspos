package ru.timacad.raspos.core.domain.models

import kotlinx.serialization.Serializable

@Serializable
enum class LessonType {
    LECTURE,
    PRACTICE,
    LABORATORY,
    ELECTIVE
}

@Serializable
data class Lesson(
    val id: Long,
    val number: Int,
    val startTime: String,
    val endTime: String,
    val subject: String,
    val type: LessonType,
    val teacher: String,
    val building: String,
    val classroom: String,
    val subgroup: Int? = null,
    val weekParity: String = "ALL" // "ODD", "EVEN", "ALL"
)

@Serializable
data class DaySchedule(
    val date: String,
    val weekday: String,
    val lessons: List<Lesson>
)

@Serializable
data class GroupMeta(
    val id: String,
    val name: String,
    val institute: String,
    val course: Int
)

@Serializable
data class FreeClassroom(
    val classroomId: String,
    val building: String,
    val room: String,
    val floor: Int,
    val hasOutlets: Boolean,
    val isQuietZone: Boolean,
    val freeUntilTime: String
)

@Serializable
data class TransitRoute(
    val fromBuilding: String,
    val toBuilding: String,
    val estimatedMinutes: Int,
    val isTightWindow: Boolean,
    val steps: List<String>
)
