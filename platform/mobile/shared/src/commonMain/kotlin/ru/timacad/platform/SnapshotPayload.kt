package ru.timacad.platform

data class SnapshotPayload(val groupCode: String, val snapshotHash: String, val lessons: List<LocalLesson>)

// Reads the protobuf SyncOp produced by the Go bootstrap. Only the lesson snapshot arm is accepted.
fun decodeLessonSnapshot(bytes: ByteArray): SnapshotPayload {
    val reader = ProtoReader(bytes)
    var groupCode = ""
    var snapshotHash = ""
    val lessons = mutableListOf<LocalLesson>()
    while (!reader.exhausted()) {
        val tag = reader.varint()
        val field = tag ushr 3
        val wire = tag and 7
        if (wire != 2) error("unexpected wire type $wire")
        val value = reader.bytes()
        if (field == 2) {
            decodeSnapshot(value, onGroup = { groupCode = it }, onHash = { snapshotHash = it }, onLesson = { lessons += it })
        }
    }
    if (groupCode.isEmpty() || snapshotHash.isEmpty()) error("lesson snapshot is incomplete")
    return SnapshotPayload(groupCode, snapshotHash, lessons)
}

private fun decodeSnapshot(bytes: ByteArray, onGroup: (String) -> Unit, onHash: (String) -> Unit, onLesson: (LocalLesson) -> Unit) {
    val reader = ProtoReader(bytes)
    while (!reader.exhausted()) {
        val tag = reader.varint()
        val field = tag ushr 3
        if ((tag and 7) != 2) error("unexpected snapshot field")
        val value = reader.bytes()
        when (field.toInt()) {
            1 -> onGroup(value.decodeToString())
            2 -> onHash(value.decodeToString())
            3 -> onLesson(decodeLesson(value))
        }
    }
}

private fun decodeLesson(bytes: ByteArray): LocalLesson {
    val fields = MutableList(10) { "" }
    val reader = ProtoReader(bytes)
    while (!reader.exhausted()) {
        val tag = reader.varint()
        val field = (tag ushr 3).toInt()
        if ((tag and 7) != 2 || field !in 1..10) error("unexpected lesson field $field")
        fields[field - 1] = reader.bytes().decodeToString()
    }
    return LocalLesson(fields[0], fields[1], fields[2], fields[3], fields[4], fields[5], fields[6], fields[7], fields[9])
}

private class ProtoReader(private val data: ByteArray) {
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
