package ru.timacad.platform

import androidx.compose.runtime.Immutable
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.roundToLong

@Immutable
data class LessonRow(
    override val key: String,
    val startsAt: String,
    val endsAt: String,
    val subject: String,
    val kind: String,
    val teacher: String,
    val place: String,
    val mark: LessonMark,
    val badge: String?,
) : DayRow

@Immutable
data class GapRow(override val key: String, val label: String) : DayRow

@Immutable
sealed interface DayRow {
    val key: String
}

fun subgroupOf(subject: String): Int = when {
    subject.contains("п/г 2") || subject.contains("подгруппа 2") -> 2
    subject.contains("п/г 1") || subject.contains("подгруппа 1") -> 1
    else -> 0
}

fun composeDayRows(lessons: List<LocalLesson>, changes: List<StoredChange>, subgroup: Int): List<DayRow> {
    val visible = lessons.filter { lesson ->
        val group = subgroupOf(lesson.subject)
        subgroup == 0 || group == 0 || group == subgroup
    }.sortedBy { minutesOf(it.startsAt) }
    val rows = mutableListOf<DayRow>()
    visible.forEachIndexed { index, lesson ->
        if (index > 0) {
            val previous = visible[index - 1]
            val gap = minutesOf(lesson.startsAt) - minutesOf(previous.endsAt)
            if (gap >= 45) {
                rows += GapRow("gap|${previous.endsAt}|${lesson.startsAt}", gapLabel(gap))
            }
        }
        val overlay = changes.filter { it.fingerprint == lessonFingerprint(lesson) }.maxByOrNull { it.lsn }
        val mark = when (overlay?.kind) {
            "cancel" -> LessonMark.Cancelled
            "move" -> LessonMark.Moved
            "room" -> LessonMark.RoomChanged
            else -> LessonMark.AsScheduled
        }
        val starts = if (mark == LessonMark.Moved) payloadField(overlay?.payloadJson, "starts_at") ?: lesson.startsAt else lesson.startsAt
        val ends = if (mark == LessonMark.Moved) payloadField(overlay?.payloadJson, "ends_at") ?: lesson.endsAt else lesson.endsAt
        val room = if (mark == LessonMark.RoomChanged) payloadField(overlay?.payloadJson, "room") ?: lesson.room else lesson.room
        val building = if (mark == LessonMark.RoomChanged) payloadField(overlay?.payloadJson, "building") ?: lesson.building else lesson.building
        val badge = when (mark) {
            LessonMark.Cancelled -> "Отменена"
            LessonMark.Moved -> "Перенос"
            LessonMark.RoomChanged -> "Аудитория"
            LessonMark.AsScheduled -> null
        }
        rows += LessonRow(
            key = lessonFingerprint(lesson),
            startsAt = starts,
            endsAt = ends,
            subject = lesson.subject,
            kind = lesson.kind,
            teacher = lesson.teacher,
            place = "$building · $room",
            mark = mark,
            badge = badge,
        )
    }
    return rows
}

fun gapLabel(minutes: Int): String {
    val hours = minutes / 60
    val rest = minutes % 60
    val body = when {
        hours == 0 -> "$rest мин"
        rest == 0 -> "$hours ч"
        else -> "$hours ч $rest мин"
    }
    return "Окно: $body"
}

fun institutesOf(groups: List<LocalGroup>): List<String> = groups.map { it.institute }.distinct().sorted()

fun coursesOf(groups: List<LocalGroup>, institute: String): List<Int> {
    return groups.filter { it.institute == institute }.map { it.course }.distinct().sorted()
}

fun groupsOf(groups: List<LocalGroup>, institute: String, course: Int): List<LocalGroup> {
    return groups.filter { it.institute == institute && it.course == course }.sortedBy { it.code }
}

fun backoffMillis(attempt: Int, unit: Double): Long {
    val power = attempt.coerceIn(0, 16)
    val base = min(30_000.0, 1_000.0 * 2.0.pow(power))
    val swing = unit.coerceIn(0.0, 1.0) * 2.0 - 1.0
    return (base + swing * base * 0.1).roundToLong().coerceAtLeast(0)
}

fun centrifugoChannel(scopeId: String): String {
    val hex = scopeId.encodeToByteArray().joinToString("") { byte ->
        (byte.toInt() and 0xff).toString(16).padStart(2, '0')
    }
    return "group:$hex"
}

fun parseRealtimeHint(payload: String): ScheduleHint? {
    val collection = jsonString(payload, "collection") ?: return null
    val scope = jsonString(payload, "scope_id") ?: return null
    val lsn = Regex(""""lsn"\s*:\s*(\d+)""").find(payload)?.groupValues?.get(1)?.toLongOrNull() ?: return null
    if (collection.isEmpty() || scope.isEmpty() || lsn < 1) return null
    return ScheduleHint(collection, scope, lsn)
}

fun randomUuid(nextByte: () -> Int): String {
    val bytes = ByteArray(16) { nextByte().and(0xff).toByte() }
    bytes[6] = ((bytes[6].toInt() and 0x0f) or 0x40).toByte()
    bytes[8] = ((bytes[8].toInt() and 0x3f) or 0x80).toByte()
    return bytes.joinToString("") { (it.toInt() and 0xff).toString(16).padStart(2, '0') }.let { hex ->
        "${hex.substring(0, 8)}-${hex.substring(8, 12)}-${hex.substring(12, 16)}-${hex.substring(16, 20)}-${hex.substring(20)}"
    }
}

enum class ElderGate { Guest, NeedsElder }

fun elderGate(action: String, session: String?): ElderGate {
    val guarded = action == "lesson_change" || action == "thread_hide"
    return if (guarded && session.isNullOrBlank()) ElderGate.NeedsElder else ElderGate.Guest
}

const val PASSKEY_REGISTER_BEGIN = "/auth/webauthn/register/begin"
const val PASSKEY_REGISTER_FINISH = "/auth/webauthn/register/finish"
const val PASSKEY_LOGIN_BEGIN = "/auth/webauthn/login/begin"
const val PASSKEY_LOGIN_FINISH = "/auth/webauthn/login/finish"

fun sessionToken(json: String): String? = jsonString(json, "session")?.takeIf { it.isNotEmpty() }

interface PasskeyHttp {
    fun post(path: String, body: String, headers: Map<String, String>): PasskeyResponse
}

data class PasskeyResponse(val status: Int, val body: String, val headers: Map<String, String>)

interface PasskeyPrompt {
    fun create(requestJson: String): String
    fun get(requestJson: String): String
}

interface SessionVault {
    fun save(token: String)
    fun load(): String?
}

class MemoryVault : SessionVault {
    private var token: String? = null
    override fun save(token: String) { this.token = token }
    override fun load(): String? = token
}

sealed interface PasskeyOutcome {
    data class Session(val token: String) : PasskeyOutcome
    data class Quiet(val detail: String) : PasskeyOutcome
}

class PasskeyClient(
    private val http: PasskeyHttp,
    private val prompt: PasskeyPrompt,
    private val vault: SessionVault,
) {
    fun register(name: String): PasskeyOutcome = ceremony(
        begin = "$PASSKEY_REGISTER_BEGIN?name=${name.encodeUrl()}",
        finish = PASSKEY_REGISTER_FINISH,
        create = true,
    )

    fun login(principalId: String): PasskeyOutcome = ceremony(
        begin = PASSKEY_LOGIN_BEGIN,
        finish = PASSKEY_LOGIN_FINISH,
        create = false,
        principal = principalId,
    )

    private fun ceremony(begin: String, finish: String, create: Boolean, principal: String? = null): PasskeyOutcome {
        val headers = if (principal == null) emptyMap() else mapOf("X-Principal-Id" to principal)
        val started = http.post(begin, "", headers)
        if (started.status !in 200..299) return PasskeyOutcome.Quiet("сервер не выдал challenge")
        val principalId = principal ?: header(started.headers, "X-Principal-Id")
            ?: return PasskeyOutcome.Quiet("сервер не назвал старосту")
        val signed = try {
            if (create) prompt.create(started.body) else prompt.get(started.body)
        } catch (_: Throwable) {
            return PasskeyOutcome.Quiet("система не подтвердила биометрию")
        }
        val done = http.post(finish, signed, mapOf("X-Principal-Id" to principalId))
        val token = sessionToken(done.body)
        if (done.status !in 200..299 || token == null) return PasskeyOutcome.Quiet("сессия не выдана")
        vault.save(token)
        return PasskeyOutcome.Session(token)
    }
}

fun demoTopology(): ByteArray {
    val nodes = listOf(
        TopologyNode(1, 1, 10, 10, "101"),
        TopologyNode(2, 1, 40, 20, "Лестница"),
        TopologyNode(3, 1, 70, 10, "102"),
        TopologyNode(4, 2, 40, 20, "201"),
    )
    val edges = listOf(1 to 2, 2 to 3, 2 to 4)
    val out = ArrayList<Byte>()
    out.addAll("TMG1".encodeToByteArray().toList())
    out.addAll(le32(nodes.size))
    out.addAll(le32(edges.size))
    nodes.forEach { node ->
        out.addAll(le32(node.id))
        out.addAll(le16(node.floor))
        out.addAll(le16(node.x))
        out.addAll(le16(node.y))
        val name = node.name.encodeToByteArray()
        out.add(name.size.toByte())
        out.addAll(name.toList())
    }
    edges.forEach { (from, to) ->
        out.addAll(le32(from))
        out.addAll(le32(to))
        out.addAll(le32(8))
    }
    return out.toByteArray()
}

fun routeCaption(found: Boolean, floorChanges: Int, names: List<String>): String {
    if (!found || names.isEmpty()) return "Схема территории"
    val hops = names.joinToString(" → ")
    return if (floorChanges > 0) "Схема территории · $hops · этажей: $floorChanges" else "Схема территории · $hops"
}

private data class TopologyNode(val id: Int, val floor: Int, val x: Int, val y: Int, val name: String)

private fun le32(value: Int): List<Byte> = listOf(
    (value and 0xff).toByte(),
    ((value ushr 8) and 0xff).toByte(),
    ((value ushr 16) and 0xff).toByte(),
    ((value ushr 24) and 0xff).toByte(),
)

private fun le16(value: Int): List<Byte> = listOf((value and 0xff).toByte(), ((value ushr 8) and 0xff).toByte())

private fun minutesOf(clock: String): Int {
    val parts = clock.split(":")
    return (parts.getOrNull(0)?.toIntOrNull() ?: 0) * 60 + (parts.getOrNull(1)?.toIntOrNull() ?: 0)
}

private fun jsonString(json: String, key: String): String? {
    val match = Regex(""""${Regex.escape(key)}"\s*:\s*"((?:\\.|[^"])*)"""").find(json) ?: return null
    return match.groupValues[1].replace("\\\"", "\"").replace("\\\\", "\\")
}

private fun header(headers: Map<String, String>, name: String): String? {
    return headers.entries.firstOrNull { it.key.equals(name, ignoreCase = true) }?.value
}

private fun String.encodeUrl(): String = buildString {
    this@encodeUrl.encodeToByteArray().forEach { byte ->
        val value = byte.toInt() and 0xff
        if (value in 'a'.code..'z'.code || value in 'A'.code..'Z'.code || value in '0'.code..'9'.code) {
            append(value.toChar())
        } else {
            append('%')
            append(value.toString(16).uppercase().padStart(2, '0'))
        }
    }
}
