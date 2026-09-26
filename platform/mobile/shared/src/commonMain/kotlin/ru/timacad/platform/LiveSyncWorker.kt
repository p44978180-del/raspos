package ru.timacad.platform

class LiveSyncWorker(
    private val schedule: ScheduleRepository,
    private val personal: PersonalRepository,
    private val transport: SyncTransport,
    private val onWidget: () -> Unit = {},
) {
    var quietFailures: Int = 0
        private set
    var lastError: String? = null
        private set

    fun bootstrap(replicaId: String, groupCode: String): Int {
        return try {
            val frames = transport.bootstrap(replicaId, groupCode)
            frames.forEach { frame -> apply(frame.collection, frame.scopeId, SyncFrame(frame.lsn, frame.op)) }
            quietFailures = 0
            lastError = null
            frames.size
        } catch (error: Throwable) {
            quietFailures += 1
            lastError = error.message
            0
        }
    }

    fun onHint(hint: ScheduleHint): HintResult {
        val pump = HintPump(schedule, transport.asPull(), onWidget = onWidget)
        return try {
            val result = pump.deliver(hint)
            if (result.finishedInline) quietFailures = 0
            result
        } catch (_: Throwable) {
            quietFailures += 1
            HintResult(0, 0, 0, true)
        }
    }

    fun flushOutbox(replicaId: String): Int {
        return try {
            val rows = personal.pendingRows()
            if (rows.isEmpty()) return 0
            val acks = transport.push(replicaId, rows)
            acks.filter { it.accepted }.forEach { personal.acknowledge(it.clientSeq) }
            quietFailures = 0
            acks.count { it.accepted }
        } catch (_: Throwable) {
            quietFailures += 1
            0
        }
    }

    fun nextDelayMillis(unit: Double): Long = backoffMillis(quietFailures, unit)

    private fun apply(collection: String, scopeId: String, frame: SyncFrame) {
        when (collection) {
            "group_directory" -> schedule.replaceDirectory(decodeDirectory(frame.op), frame.lsn)
            "lesson" -> {
                val snapshot = decodeLessonSnapshot(frame.op)
                schedule.replaceLessons(snapshot.groupCode.ifEmpty { scopeId }, snapshot.snapshotHash, frame.lsn, snapshot.lessons)
            }
            "lesson_change" -> HintPump(schedule, transport.asPull(), onWidget = onWidget)
                .deliver(ScheduleHint(collection, scopeId, frame.lsn))
        }
    }
}

private fun SyncTransport.asPull(): SyncPull = SyncPull { collection, scopeId, since ->
    pull(collection, scopeId, since)
}
