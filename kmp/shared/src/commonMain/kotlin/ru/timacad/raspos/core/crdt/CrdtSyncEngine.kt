package ru.timacad.raspos.core.crdt

import ru.timacad.raspos.core.domain.models.CrdtOperation

data class LamportClock(
    var counter: Long = 0L,
    val clientId: String
) {
    fun tick(): Long {
        counter++
        return counter
    }

    fun update(incomingCounter: Long): Long {
        counter = maxOf(counter, incomingCounter) + 1
        return counter
    }
}

class VectorClock(
    val clocks: MutableMap<String, Long> = mutableMapOf()
) {
    fun increment(clientId: String) {
        val current = clocks.getOrElse(clientId) { 0L }
        clocks[clientId] = current + 1L
    }

    fun merge(other: VectorClock) {
        for ((node, count) in other.clocks) {
            val existing = clocks.getOrElse(node) { 0L }
            clocks[node] = maxOf(existing, count)
        }
    }

    fun isDescendantOf(other: VectorClock): Boolean {
        var strictlyGreater = false
        for ((node, count) in other.clocks) {
            val current = clocks.getOrElse(node) { 0L }
            if (current < count) return false
            if (current > count) strictlyGreater = true
        }
        return strictlyGreater
    }
}

class LWWRegister<T>(
    var value: T,
    var timestamp: Long,
    var clientId: String
) {
    fun set(newValue: T, incomingTs: Long, incomingClientId: String): Boolean {
        if (incomingTs > timestamp || (incomingTs == timestamp && incomingClientId > clientId)) {
            value = newValue
            timestamp = incomingTs
            clientId = incomingClientId
            return true
        }
        return false
    }
}

class ORSet<T>(
    val adds: MutableMap<String, Pair<T, Long>> = mutableMapOf(),
    val removes: MutableSet<String> = mutableSetOf()
) {
    fun add(element: T, tag: String, timestamp: Long) {
        adds[tag] = Pair(element, timestamp)
    }

    fun remove(tag: String) {
        removes.add(tag)
    }

    fun elements(): List<T> {
        return adds.filterKeys { !removes.contains(it) }.values.map { it.first }
    }

    fun merge(other: ORSet<T>) {
        for ((tag, pair) in other.adds) {
            val existing = adds[tag]
            if (existing == null || pair.second > existing.second) {
                adds[tag] = pair
            }
        }
        removes.addAll(other.removes)
    }
}

class CrdtSyncEngine(
    val clientId: String
) {
    private val clock = LamportClock(0L, clientId)
    private val operations = mutableListOf<CrdtOperation>()
    private val stateRegisters = mutableMapOf<String, LWWRegister<String>>()

    fun recordMutation(entityType: String, entityId: String, field: String, value: String): CrdtOperation {
        val ts = clock.tick()
        val op = CrdtOperation(
            entityType = entityType,
            entityId = entityId,
            field = field,
            value = value,
            lamportCounter = ts,
            clientId = clientId,
            isDeleted = false
        )
        operations.add(op)

        val key = "$entityType:$entityId:$field"
        val reg = stateRegisters.getOrPut(key) { LWWRegister(value, ts, clientId) }
        reg.set(value, ts, clientId)
        return op
    }

    fun applyRemoteOperation(op: CrdtOperation): Boolean {
        clock.update(op.lamportCounter)
        operations.add(op)
        val key = "${op.entityType}:${op.entityId}:${op.field}"
        val reg = stateRegisters.getOrPut(key) { LWWRegister(op.value, op.lamportCounter, op.clientId) }
        return reg.set(op.value, op.lamportCounter, op.clientId)
    }

    fun getFieldValue(entityType: String, entityId: String, field: String): String? {
        val key = "$entityType:$entityId:$field"
        return stateRegisters[key]?.value
    }
}
