package ru.timacad.platform

import kotlin.test.Test
import kotlin.test.assertEquals
import uniffi.timacad_core.coreHello

class CoreHelloTest {
    @Test
    fun helloComesFromTheRustLibrary() {
        assertEquals("timacad-core", coreHello())
    }
}
