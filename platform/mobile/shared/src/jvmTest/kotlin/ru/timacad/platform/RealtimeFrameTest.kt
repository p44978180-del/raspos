package ru.timacad.platform

import kotlin.test.*

class RealtimeFrameTest {
    @Test
    fun batchedRepliesKeepEveryHintAndRecognizeWhitespacePings() {
        val frame = """{"id":1,"connect":{"ping":25,"pong":true}}
            | { }
            |{"push":{"pub":{"data":{"collection":"lesson","scope_id":"\u0414-\u0410401","lsn":12}}}}
            |{"push":{"pub":{"data":{"collection":"lesson_change","scope_id":"Д-А401","lsn":13,"error":"ordinary payload field"}}}}
        """.trimMargin()
        assertEquals(listOf(RealtimeMessage.Ping,
            RealtimeMessage.Publication(ScheduleHint("lesson", "Д-А401", 12)),
            RealtimeMessage.Publication(ScheduleHint("lesson_change", "Д-А401", 13))), decodeRealtimeFrame(frame))
    }

    @Test
    fun unrelatedStringsAndInvalidScopeTypesNeverBecomeHints() {
        assertNull(parseRealtimeHint("""{"push":{"message":{"data":{"collection":"lesson","scope_id":"other","lsn":1}}}}"""))
        assertNull(parseRealtimeHint("""{"collection":"lesson","scope_id":12,"lsn":1}"""))
        assertNull(parseRealtimeHint("""{"collection":"lesson","scope_id":"group","lsn":"1"}"""))
        assertNull(parseRealtimeHint("""{"collection":"lesson","scope_id":"group","lsn":0}"""))
        assertNull(parseRealtimeHint("""{"collection":"lesson","scope_id":"group","lsn":1.5}"""))
        assertEquals(ScheduleHint("lesson", "group", 1), parseRealtimeHint("""{"collection":"lesson","scope_id":"group","lsn":1}"""))
    }

    @Test
    fun errorsDisconnectsAndOversizedBatchesEndTheConnection() {
        assertFails { decodeRealtimeFrame("""{"id":2,"error":{"code":103}}""") }
        assertFails { decodeRealtimeFrame("""{"push":{"disconnect":{"code":3001}}}""") }
        assertFails { decodeRealtimeFrame("{}\n".repeat(129)) }
        assertFails { decodeRealtimeFrame(" ".repeat(65537)) }
    }
}
