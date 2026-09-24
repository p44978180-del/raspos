package ru.timacad.platform

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
    val slots = lessons.map { lesson ->
        val overlay = changes.filter { it.fingerprint == lessonFingerprint(lesson) }.maxByOrNull { it.lsn }
        val mark = when (overlay?.kind) {
            "cancel" -> LessonMark.Cancelled
            "move" -> LessonMark.Moved
            "room" -> LessonMark.RoomChanged
            else -> LessonMark.AsScheduled
        }
        val start = if (mark == LessonMark.Moved) minutes(payloadField(overlay?.payloadJson, "starts_at") ?: lesson.startsAt) else minutes(lesson.startsAt)
        val end = if (mark == LessonMark.Moved) minutes(payloadField(overlay?.payloadJson, "ends_at") ?: lesson.endsAt) else minutes(lesson.endsAt)
        val room = if (mark == LessonMark.RoomChanged) payloadField(overlay?.payloadJson, "room") ?: lesson.room else lesson.room
        val building = if (mark == LessonMark.RoomChanged) payloadField(overlay?.payloadJson, "building") ?: lesson.building else lesson.building
        Slot(lesson, mark, start, end, room, building)
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

fun payloadField(json: String?, key: String): String? {
    if (json == null) return null
    val pattern = Regex(""""${Regex.escape(key)}"\s*:\s*"((?:\\.|[^"])*)"""")
    return pattern.find(json)?.groupValues?.get(1)
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
