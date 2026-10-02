package ru.timacad.platform

import kotlinx.coroutines.CancellationException

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
            val applied = applyBootstrapBundle(schedule, frames, groupCode)
            quietFailures = 0
            lastError = null
            onWidget()
            applied
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (error: Throwable) {
            quietFailures += 1
            lastError = error.message
            0
        }
    }

    fun onHint(hint: ScheduleHint): HintResult {
        val pump = HintPump(schedule, transport.asPull(), onReset = {
            val group = schedule.selectedGroup().orEmpty()
            applyBootstrapBundle(schedule, transport.bootstrap(schedule.replicaId(), group), group)
        }, onWidget = onWidget)
        return try {
            val result = pump.deliver(hint)
            if (result.finishedInline) { quietFailures = 0; lastError = null }
            result
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (error: Throwable) {
            quietFailures += 1
            lastError = error.message
            HintResult(0, 0, 0, true)
        }
    }

    fun flushOutbox(replicaId: String, personalScope: String? = null): Int {
        return try {
            val rows = personal.pendingRows().filter { personalScope == null || it.scopeId == personalScope }
            if (rows.isEmpty()) return 0
            var accepted = 0
            var batch = mutableListOf<OutboxRow>()
            var size = 0
            fun send() {
                if (batch.isEmpty()) return
                val sequences = batch.map { it.clientSeq }.toSet()
                val acks = transport.push(replicaId, batch)
                acks.filter { it.accepted && it.clientSeq in sequences }.forEach {
                    personal.acknowledge(it.clientSeq)
                    accepted++
                }
                batch = mutableListOf()
                size = 0
            }
            for (row in rows) {
                require(row.payload.size <= 1024 * 1024) { "Personal update exceeds the server batch limit" }
                if (size + row.payload.size > 1024 * 1024 || batch.size >= 128) send()
                batch += row
                size += row.payload.size
            }
            send()
            quietFailures = 0
            accepted
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (_: Throwable) {
            quietFailures += 1
            0
        }
    }

    fun pullPersonal(): Int {
        val frames = transport.pull("personal", personal.scopeId(), personal.cursor())
        personal.merge(frames)
        return frames.size
    }

    fun nextDelayMillis(unit: Double): Long = backoffMillis(quietFailures, unit)

}

private fun SyncTransport.asPull(): SyncPull = SyncPull { collection, scopeId, since ->
    pull(collection, scopeId, since)
}
