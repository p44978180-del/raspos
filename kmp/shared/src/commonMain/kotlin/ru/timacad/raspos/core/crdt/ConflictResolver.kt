package ru.timacad.raspos.core.crdt

import ru.timacad.raspos.core.domain.models.Lesson

object ConflictResolver {
    fun <T> resolveLWW(
        current: T,
        currentTime: LamportTimestamp,
        incoming: T,
        incomingTime: LamportTimestamp
    ): Pair<T, LamportTimestamp> {
        return if (incomingTime.isAfter(currentTime)) {
            incoming to incomingTime
        } else {
            current to currentTime
        }
    }

    fun mergeLessons(
        localLessons: List<Lesson>,
        remoteLessons: List<Lesson>,
        localClock: VectorClock,
        remoteClock: VectorClock
    ): List<Lesson> {
        val lessonMap = mutableMapOf<Long, Lesson>()
        for (l in localLessons) lessonMap[l.id] = l
        for (r in remoteLessons) {
            val existing = lessonMap[r.id]
            if (existing == null) {
                lessonMap[r.id] = r
            } else {
                if (remoteClock.dominates(localClock)) {
                    lessonMap[r.id] = r
                }
            }
        }
        return lessonMap.values.sortedBy { it.num }
    }
}
