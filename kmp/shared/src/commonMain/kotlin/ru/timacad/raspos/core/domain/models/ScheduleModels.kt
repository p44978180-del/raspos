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
enum class UserRole {
    STUDENT,
    HEADSTUDENT,
    DEPUTY_HEADSTUDENT
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
data class Institute(
    val id: String,
    val name: String,
    val shortName: String,
    val courses: List<Int>
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
    val warningMessage: String? = null,
    val steps: List<String>
)

@Serializable
data class BellScheduleSlot(
    val slotNumber: Int,
    val startTime: String,
    val endTime: String
)

@Serializable
data class StudentMiniAppManifest(
    val id: String,
    val name: String,
    val version: String,
    val author: String,
    val organization: String,
    val description: String,
    val icon: String,
    val permissions: List<String>,
    val category: String,
    val repositoryUrl: String? = null,
    val integrityHash: String? = null,
    val isCspV3Verified: Boolean = true,
    val isInstalled: Boolean = false
)

@Serializable
data class CrdtOperation(
    val entityType: String,
    val entityId: String,
    val field: String,
    val value: String,
    val lamportCounter: Long,
    val clientId: String,
    val isDeleted: Boolean = false
)
