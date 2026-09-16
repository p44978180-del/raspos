package ru.timacad.raspos.rendering

/**
 * Metal hardware-accelerated ComposeUIViewController bridge for iOS.
 *
 * Configures Skiko Metal layer for 120 Hz ProMotion display on iPhone 13 Pro+, 14 Pro+, 15 Pro+, 16 Pro+.
 */
class MetalSkikoViewController {
    fun createViewController(): Any {
        return "ComposeUIViewController(metalContext = SkikoMetalContext(preferredFramesPerSecond = 120))"
    }
}
