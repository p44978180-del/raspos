package ru.timacad.platform

import kotlinx.serialization.json.*

sealed interface RealtimeMessage {
    data object Ping : RealtimeMessage
    data class Publication(val hint: ScheduleHint) : RealtimeMessage
}

/** Centrifugo joins compact JSON replies with newlines inside one WebSocket frame. */
fun decodeRealtimeFrame(payload: String): List<RealtimeMessage> {
    require(payload.length <= 64 * 1024) { "Realtime frame exceeds the hint limit" }
    val replies = payload.lineSequence().filterNot { it.isBlank() }.take(129).toList()
    require(replies.size in 1..128) { "Realtime frame has too many replies" }
    return replies.mapNotNull { text ->
        val root = Json.parseToJsonElement(text).jsonObject
        check(root["error"] == null || root["error"] == JsonNull) { "Realtime command failed" }
        val push = root["push"] as? JsonObject
        check(push?.get("disconnect") == null) { "Realtime server disconnected" }
        if (root.isEmpty()) RealtimeMessage.Ping else parseHint(root)?.let { RealtimeMessage.Publication(it) }
    }
}

fun parseRealtimeHint(payload: String): ScheduleHint? =
    parseHint(Json.parseToJsonElement(payload).jsonObject)

private fun parseHint(root: JsonObject): ScheduleHint? {
    val data = ((root["push"] as? JsonObject)?.get("pub") as? JsonObject)?.get("data") as? JsonObject
        ?: root.takeIf { "collection" in it && "scope_id" in it && "lsn" in it } ?: return null
    val collection = data["collection"] as? JsonPrimitive ?: return null
    val scope = data["scope_id"] as? JsonPrimitive ?: return null
    val number = data["lsn"] as? JsonPrimitive ?: return null
    val lsn = number.longOrNull ?: return null
    if (!collection.isString || !scope.isString || number.isString || collection.content.isEmpty() || scope.content.isEmpty() || lsn < 1) return null
    return ScheduleHint(collection.content, scope.content, lsn)
}
