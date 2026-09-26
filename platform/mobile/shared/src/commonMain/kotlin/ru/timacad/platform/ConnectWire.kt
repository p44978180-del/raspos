package ru.timacad.platform

data class BootstrapFrame(
    val collection: String,
    val scopeId: String,
    val lsn: Long,
    val op: ByteArray,
    val reset: Boolean,
)

data class PushAck(val clientSeq: Long, val lsn: Long, val accepted: Boolean)

data class OutboxRow(val clientSeq: Long, val collection: String, val scopeId: String, val payload: ByteArray)

interface SyncTransport {
    fun bootstrap(replicaId: String, groupCode: String): List<BootstrapFrame>
    fun pull(collection: String, scopeId: String, sinceLsn: Long): List<SyncFrame>
    fun push(replicaId: String, rows: List<OutboxRow>): List<PushAck>
}

internal class ProtoWriter {
    private val out = ArrayList<Byte>()

    fun varint(value: Long) {
        var rest = value
        while (true) {
            val byte = (rest and 0x7f).toInt()
            rest = rest ushr 7
            if (rest == 0L) {
                out.add(byte.toByte())
                return
            }
            out.add((byte or 0x80).toByte())
        }
    }

    fun tag(field: Int, wire: Int) = varint(((field shl 3) or wire).toLong())

    fun fieldBytes(field: Int, value: ByteArray) {
        tag(field, 2)
        varint(value.size.toLong())
        value.forEach { out.add(it) }
    }

    fun fieldString(field: Int, value: String) = fieldBytes(field, value.encodeToByteArray())

    fun fieldInt(field: Int, value: Long) {
        tag(field, 0)
        varint(value)
    }

    fun fieldBool(field: Int, value: Boolean) {
        if (value) fieldInt(field, 1)
    }

    fun toByteArray(): ByteArray = out.toByteArray()
}

internal class WireReader(private val data: ByteArray) {
    private var index = 0

    fun exhausted() = index >= data.size

    fun varint(): Long {
        var shift = 0
        var result = 0L
        while (shift < 64) {
            val byte = data[index++].toLong() and 0xff
            result = result or ((byte and 0x7f) shl shift)
            if (byte and 0x80L == 0L) return result
            shift += 7
        }
        error("varint is too long")
    }

    fun bytes(): ByteArray {
        val size = varint().toInt()
        if (size < 0 || index + size > data.size) error("length-delimited field is truncated")
        val out = data.copyOfRange(index, index + size)
        index += size
        return out
    }

    fun skip(wire: Int) {
        when (wire) {
            0 -> varint()
            2 -> bytes()
            else -> error("unsupported wire type $wire")
        }
    }
}

fun encodeEnvelope(payload: ByteArray, end: Boolean = false): ByteArray {
    val out = ByteArray(5 + payload.size)
    out[0] = if (end) 2 else 0
    val size = payload.size
    out[1] = (size ushr 24).toByte()
    out[2] = (size ushr 16).toByte()
    out[3] = (size ushr 8).toByte()
    out[4] = size.toByte()
    payload.copyInto(out, destinationOffset = 5)
    return out
}

fun decodeEnvelopes(stream: ByteArray): List<ByteArray> {
    val messages = mutableListOf<ByteArray>()
    var cursor = 0
    while (cursor + 5 <= stream.size) {
        val flags = stream[cursor].toInt() and 0xff
        val size = ((stream[cursor + 1].toInt() and 0xff) shl 24) or
            ((stream[cursor + 2].toInt() and 0xff) shl 16) or
            ((stream[cursor + 3].toInt() and 0xff) shl 8) or
            (stream[cursor + 4].toInt() and 0xff)
        val start = cursor + 5
        if (size < 0 || start + size > stream.size) error("connect envelope is truncated")
        if (flags and 0x02 == 0) messages += stream.copyOfRange(start, start + size)
        cursor = start + size
    }
    return messages
}

fun encodeBootstrapRequest(replicaId: String, groupCode: String): ByteArray {
    val writer = ProtoWriter()
    writer.fieldString(1, replicaId)
    if (groupCode.isNotEmpty()) writer.fieldString(2, groupCode)
    return writer.toByteArray()
}

fun encodePullRequest(collection: String, scopeId: String, sinceLsn: Long): ByteArray {
    val writer = ProtoWriter()
    writer.fieldString(1, collection)
    writer.fieldString(2, scopeId)
    if (sinceLsn != 0L) writer.fieldInt(3, sinceLsn)
    return writer.toByteArray()
}

fun encodePushRequest(replicaId: String, rows: List<OutboxRow>): ByteArray {
    val writer = ProtoWriter()
    writer.fieldString(1, replicaId)
    rows.forEach { row ->
        val op = ProtoWriter()
        op.fieldString(1, row.collection)
        op.fieldString(2, row.scopeId)
        op.fieldInt(3, row.clientSeq)
        op.fieldBytes(4, row.payload)
        writer.fieldBytes(2, op.toByteArray())
    }
    return writer.toByteArray()
}

fun encodeDirectoryOp(version: String, groups: List<LocalGroup>): ByteArray {
    val directory = ProtoWriter()
    directory.fieldString(1, version)
    groups.forEach { group ->
        val entry = ProtoWriter()
        entry.fieldString(1, group.code)
        entry.fieldString(3, group.institute)
        entry.fieldInt(4, group.course.toLong())
        entry.fieldString(5, group.status)
        directory.fieldBytes(2, entry.toByteArray())
    }
    val op = ProtoWriter()
    op.fieldBytes(1, directory.toByteArray())
    return op.toByteArray()
}

fun decodeBootstrapFrames(stream: ByteArray): List<BootstrapFrame> {
    return decodeEnvelopes(stream).map { message ->
        val reader = WireReader(message)
        var lsn = 0L
        var collection = ""
        var scope = ""
        var op = ByteArray(0)
        var reset = false
        while (!reader.exhausted()) {
            val tag = reader.varint()
            val field = (tag ushr 3).toInt()
            val wire = (tag and 7).toInt()
            when {
                field == 1 && wire == 0 -> lsn = reader.varint()
                field == 2 && wire == 2 -> collection = reader.bytes().decodeToString()
                field == 3 && wire == 2 -> scope = reader.bytes().decodeToString()
                field == 4 && wire == 2 -> op = reader.bytes()
                field == 5 && wire == 0 -> reset = reader.varint() != 0L
                else -> reader.skip(wire)
            }
        }
        BootstrapFrame(collection, scope, lsn, op, reset)
    }
}

fun decodePullFrames(stream: ByteArray): List<SyncFrame> {
    return decodeEnvelopes(stream).map { message ->
        val reader = WireReader(message)
        var lsn = 0L
        var op = ByteArray(0)
        while (!reader.exhausted()) {
            val tag = reader.varint()
            val field = (tag ushr 3).toInt()
            val wire = (tag and 7).toInt()
            when {
                field == 1 && wire == 0 -> lsn = reader.varint()
                field == 2 && wire == 2 -> op = reader.bytes()
                else -> reader.skip(wire)
            }
        }
        SyncFrame(lsn, op)
    }
}

fun decodePushResponse(message: ByteArray): List<PushAck> {
    val reader = WireReader(message)
    val items = mutableListOf<PushAck>()
    while (!reader.exhausted()) {
        val tag = reader.varint()
        val field = (tag ushr 3).toInt()
        val wire = (tag and 7).toInt()
        if (field == 1 && wire == 2) {
            val item = WireReader(reader.bytes())
            var seq = 0L
            var lsn = 0L
            var accepted = false
            while (!item.exhausted()) {
                val itemTag = item.varint()
                val itemField = (itemTag ushr 3).toInt()
                val itemWire = (itemTag and 7).toInt()
                when {
                    itemField == 1 && itemWire == 0 -> seq = item.varint()
                    itemField == 2 && itemWire == 0 -> lsn = item.varint()
                    itemField == 3 && itemWire == 0 -> accepted = item.varint() != 0L
                    else -> item.skip(itemWire)
                }
            }
            items += PushAck(seq, lsn, accepted)
        } else {
            reader.skip(wire)
        }
    }
    return items
}

fun decodeDirectory(op: ByteArray): List<LocalGroup> {
    val root = WireReader(op)
    val groups = mutableListOf<LocalGroup>()
    while (!root.exhausted()) {
        val tag = root.varint()
        val field = (tag ushr 3).toInt()
        val wire = (tag and 7).toInt()
        if (field == 1 && wire == 2) {
            val directory = WireReader(root.bytes())
            while (!directory.exhausted()) {
                val entryTag = directory.varint()
                val entryField = (entryTag ushr 3).toInt()
                val entryWire = (entryTag and 7).toInt()
                if (entryField == 2 && entryWire == 2) {
                    groups += decodeDirectoryEntry(directory.bytes())
                } else {
                    directory.skip(entryWire)
                }
            }
        } else {
            root.skip(wire)
        }
    }
    return groups
}

private fun decodeDirectoryEntry(bytes: ByteArray): LocalGroup {
    val reader = WireReader(bytes)
    var code = ""
    var institute = ""
    var course = 0
    var status = "current"
    while (!reader.exhausted()) {
        val tag = reader.varint()
        val field = (tag ushr 3).toInt()
        val wire = (tag and 7).toInt()
        when {
            field == 1 && wire == 2 -> code = reader.bytes().decodeToString()
            field == 3 && wire == 2 -> institute = reader.bytes().decodeToString()
            field == 4 && wire == 0 -> course = reader.varint().toInt()
            field == 5 && wire == 2 -> status = reader.bytes().decodeToString()
            else -> reader.skip(wire)
        }
    }
    return LocalGroup(code, institute, course, status)
}

const val SYNC_SERVICE = "/timacad.sync.v1.SyncService"
