package ru.timacad.platform

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

enum class LessonMark { AsScheduled, Cancelled, Moved, RoomChanged }

data class StoredChange(val lsn: Long, val fingerprint: String, val kind: String, val payloadJson: String)

data class WidgetFace(
    val headline: String,
    val phase: String,
    val room: String,
    val building: String,
    val countdownSeconds: Long,
    val mark: LessonMark,
)

fun lessonFingerprint(lesson: LocalLesson): String = listOf(lesson.occursOn, lesson.startsAt, lesson.subject).joinToString("|")

fun projectWidget(lessons: List<LocalLesson>, changes: List<StoredChange>, nowMinutes: Int): WidgetFace {
    val overlays = latestLessonChanges(changes)
    val slots = lessons.map { original ->
        val (lesson, mark) = applyLessonChange(original, overlays[lessonFingerprint(original)])
        Slot(lesson, mark, minutes(lesson.startsAt), minutes(lesson.endsAt), lesson.room, lesson.building)
    }.sortedBy { it.start }
    val current = slots.firstOrNull { it.start <= nowMinutes && nowMinutes < it.end }
    val upcoming = slots.firstOrNull { it.start > nowMinutes }
    val shown = current ?: upcoming
        ?: return WidgetFace("Пар нет", "день", "", "", 0, LessonMark.AsScheduled)
    val countdown = if (current != null) {
        (shown.end - nowMinutes).coerceAtLeast(0) * 60L
    } else {
        (shown.start - nowMinutes).coerceAtLeast(0) * 60L
    }
    return WidgetFace(
        headline = shown.lesson.subject,
        phase = if (current != null) "сейчас" else "далее",
        room = shown.room,
        building = shown.building,
        countdownSeconds = countdown,
        mark = shown.mark,
    )
}

private data class Slot(
    val lesson: LocalLesson,
    val mark: LessonMark,
    val start: Int,
    val end: Int,
    val room: String,
    val building: String,
)

fun formatCountdown(seconds: Long): String {
    val whole = seconds.coerceAtLeast(0)
    return "${whole / 60}:${(whole % 60).toString().padStart(2, '0')}"
}

internal fun latestLessonChanges(changes: List<StoredChange>): Map<String, StoredChange> {
    val latest = mutableMapOf<String, StoredChange>()
    changes.forEach { change ->
        if (change.lsn > (latest[change.fingerprint]?.lsn ?: Long.MIN_VALUE)) latest[change.fingerprint] = change
    }
    return latest
}

private val validClock = Regex("""(?:[01]\d|2[0-3]):[0-5]\d""")

internal fun applyLessonChange(lesson: LocalLesson, change: StoredChange?): Pair<LocalLesson, LessonMark> {
    return when (change?.kind) {
        "cancel" -> lesson to LessonMark.Cancelled
        "room" -> lesson.copy(
            room = payloadField(change.payloadJson, "room") ?: lesson.room,
            building = payloadField(change.payloadJson, "building") ?: lesson.building,
        ) to LessonMark.RoomChanged
        "move" -> {
            val start = payloadField(change.payloadJson, "starts_at") ?: lesson.startsAt
            val end = payloadField(change.payloadJson, "ends_at") ?: lesson.endsAt
            val valid = listOf(start, end).all { it.matches(validClock) } && minutes(start) < minutes(end)
            (if (valid) lesson.copy(startsAt = start, endsAt = end) else lesson) to LessonMark.Moved
        }
        else -> lesson to LessonMark.AsScheduled
    }
}

fun payloadField(json: String?, key: String): String? {
    if (json == null) return null
    val objectValue = runCatching { Json.parseToJsonElement(json) as? JsonObject }.getOrNull() ?: return null
    val value = objectValue[key] as? JsonPrimitive ?: return null
    return value.content.takeIf { value.isString }
}

private fun minutes(clock: String): Int {
    val parts = clock.split(":")
    val hour = parts.getOrNull(0)?.toIntOrNull() ?: 0
    val minute = parts.getOrNull(1)?.toIntOrNull() ?: 0
    return hour * 60 + minute
}

class UpdateBurst(private val windowMs: Long = 500) {
    private var lastEmitAt = Long.MIN_VALUE / 4
    private var pending = false

    fun push(now: Long): Boolean {
        if (now - lastEmitAt >= windowMs) {
            lastEmitAt = now
            pending = false
            return true
        }
        pending = true
        return false
    }

    fun flush(now: Long): Boolean {
        if (pending && now - lastEmitAt >= windowMs) {
            pending = false
            lastEmitAt = now
            return true
        }
        return false
    }
}
