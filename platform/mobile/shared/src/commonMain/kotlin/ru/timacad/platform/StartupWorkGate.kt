package ru.timacad.platform

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.delay

/** The host releases background preparation only after cached UI has been drawn. */
class StartupWorkGate(private val warmupDelayMillis: Long = 2_000) {
    private val contentDrawn = CompletableDeferred<Unit>()

    fun onContentDrawn() { contentDrawn.complete(Unit) }
    suspend fun awaitContentDrawn() { contentDrawn.await() }
    suspend fun awaitSearchWarmup() {
        contentDrawn.await()
        delay(warmupDelayMillis)
    }
}
