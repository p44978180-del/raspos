package ru.timacad.platform

data class ScheduleHint(val collection: String, val scopeId: String, val lsn: Long)

data class SyncFrame(val lsn: Long, val op: ByteArray)

fun interface SyncPull {
    fun pull(collection: String, scopeId: String, sinceLsn: Long): List<SyncFrame>
}

object OfflineSyncPull : SyncPull {
    override fun pull(collection: String, scopeId: String, sinceLsn: Long): List<SyncFrame> = emptyList()
}

data class HintResult(val applied: Int, val widgetUpdates: Int, val elapsedMs: Long, val finishedInline: Boolean)

class HintPump(
    private val repository: ScheduleRepository,
    private val pull: SyncPull,
    private val burst: UpdateBurst = UpdateBurst(),
    private val budgetMs: Long = 10_000,
    private val clock: () -> Long = { 0 },
    private val onWidget: () -> Unit,
) {
    fun deliver(hint: ScheduleHint): HintResult {
        val started = clock()
        fun elapsed() = clock() - started
        if (hint.collection.isEmpty() || hint.scopeId.isEmpty() || hint.lsn < 1) {
            return HintResult(0, 0, elapsed(), true)
        }
        val since = repository.cursorLsn(hint.collection, hint.scopeId)
        if (elapsed() > budgetMs) return HintResult(0, 0, elapsed(), false)
        val frames = pull.pull(hint.collection, hint.scopeId, since)
        if (elapsed() > budgetMs) return HintResult(0, 0, elapsed(), false)
        var applied = 0
        for (frame in frames.sortedBy { it.lsn }) {
            if (frame.lsn <= since) continue
            when (hint.collection) {
                "lesson" -> {
                    val snapshot = decodeLessonSnapshot(frame.op)
                    repository.replaceLessons(snapshot.groupCode, snapshot.snapshotHash, frame.lsn, snapshot.lessons)
                    applied += 1
                }
                "lesson_change" -> {
                    val change = decodeLessonChange(frame.op)
                    if (change.kind == "cancel" || change.kind == "move" || change.kind == "room") {
                        repository.applyPublishedChange(change.groupCode, frame.lsn, change.fingerprint, change.kind, change.payloadJson)
                        applied += 1
                    }
                }
            }
        }
        val updates = if (applied > 0 && burst.push(clock())) {
            onWidget()
            1
        } else {
            0
        }
        return HintResult(applied, updates, elapsed(), elapsed() <= budgetMs)
    }
}

fun deliverHintInline(hint: ScheduleHint, pump: HintPump, finish: () -> Unit): HintResult {
    try {
        return pump.deliver(hint)
    } finally {
        finish()
    }
}

data class DecodedLessonChange(val groupCode: String, val fingerprint: String, val kind: String, val payloadJson: String)

fun decodeLessonChange(bytes: ByteArray): DecodedLessonChange {
    val fields = MutableList(4) { "" }
    val reader = ChangeReader(bytes)
    while (!reader.exhausted()) {
        val tag = reader.varint()
        val field = (tag ushr 3).toInt()
        if ((tag and 7) != 2 || field !in 1..4) error("unexpected lesson change field")
        fields[field - 1] = reader.bytes().decodeToString()
    }
    return DecodedLessonChange(fields[0], fields[1], fields[2], fields[3])
}

private class ChangeReader(private val data: ByteArray) {
    private var index = 0

    fun exhausted() = index >= data.size

    fun varint(): Int {
        var shift = 0
        var result = 0
        while (shift < 32) {
            val byte = data[index++].toInt() and 0xff
            result = result or ((byte and 0x7f) shl shift)
            if (byte and 0x80 == 0) return result
            shift += 7
        }
        error("varint is too long")
    }

    fun bytes(): ByteArray {
        val size = varint()
        val out = data.copyOfRange(index, index + size)
        index += size
        return out
    }
}
