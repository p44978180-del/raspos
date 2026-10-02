package ru.timacad.platform

import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals

@OptIn(ExperimentalCoroutinesApi::class)
class StartupWorkGateTest {
    @Test fun backgroundWorkWaitsForDrawAndWarmupWaitsTwoMoreSeconds() = runTest {
        val gate = StartupWorkGate()
        val events = mutableListOf<String>()
        launch { gate.awaitContentDrawn(); events += "background" }
        launch { gate.awaitSearchWarmup(); events += "fts" }
        advanceTimeBy(10_000); runCurrent()
        assertEquals(emptyList(), events)
        gate.onContentDrawn(); runCurrent()
        assertEquals(listOf("background"), events)
        advanceTimeBy(1_999); runCurrent()
        assertEquals(listOf("background"), events)
        gate.onContentDrawn() // A repeated frame does not restart the timer.
        advanceTimeBy(1); runCurrent()
        assertEquals(listOf("background", "fts"), events)
    }

    @Test fun cancelledHostDoesNotRunDeferredWork() = runTest {
        val gate = StartupWorkGate()
        val events = mutableListOf<String>()
        val background = launch { gate.awaitContentDrawn(); events += "background" }
        val warmup = launch { gate.awaitSearchWarmup(); events += "fts" }
        runCurrent()
        background.cancel(); warmup.cancel()
        gate.onContentDrawn(); advanceUntilIdle()
        assertEquals(emptyList(), events)
    }
}
