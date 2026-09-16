package ru.timacad.raspos.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.drawscope.DrawScope

/**
 * Skia / Metal hardware-accelerated canvas abstraction for Compose Multiplatform.
 *
 * Automatically routes rendering to:
 * - Apple Metal via Skiko Metal Context on iOS and macOS.
 * - Vulkan / OpenGL ES on Android.
 * - Direct3D / Vulkan / Skia CPU on Desktop / JVM.
 */
@Composable
fun SkiaMetalCanvas(
    modifier: Modifier = Modifier.fillMaxSize(),
    onDraw: DrawScope.() -> Unit
) {
    Canvas(
        modifier = modifier,
        onDraw = onDraw
    )
}
