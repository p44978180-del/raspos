package ru.timacad.raspos.core.crdt

import kotlinx.serialization.Serializable
import kotlin.math.max

@Serializable
data class VectorClock(
    val nodeCounters: Map<String, Long> = emptyMap()
) {
    fun increment(nodeId: String): VectorClock {
        val next = (nodeCounters[nodeId] ?: 0L) + 1L
        return copy(nodeCounters = nodeCounters + (nodeId to next))
    }

    fun merge(other: VectorClock): VectorClock {
        val allNodes = nodeCounters.keys + other.nodeCounters.keys
        val merged = allNodes.associateWith { node ->
            max(nodeCounters[node] ?: 0L, other.nodeCounters[node] ?: 0L)
        }
        return VectorClock(merged)
    }

    fun isConcurrentWith(other: VectorClock): Boolean {
        var hasGreater = false
        var hasLesser = false
        val allNodes = nodeCounters.keys + other.nodeCounters.keys
        for (node in allNodes) {
            val cA = nodeCounters[node] ?: 0L
            val cB = other.nodeCounters[node] ?: 0L
            if (cA > cB) hasGreater = true
            if (cA < cB) hasLesser = true
            if (hasGreater && hasLesser) return true
        }
        return false
    }

    fun dominates(other: VectorClock): Boolean {
        var strictlyGreater = false
        val allNodes = nodeCounters.keys + other.nodeCounters.keys
        for (node in allNodes) {
            val cA = nodeCounters[node] ?: 0L
            val cB = other.nodeCounters[node] ?: 0L
            if (cA < cB) return false
            if (cA > cB) strictlyGreater = true
        }
        return strictlyGreater
    }
}
