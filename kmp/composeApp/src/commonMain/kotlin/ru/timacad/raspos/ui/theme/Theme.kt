package ru.timacad.raspos.ui.theme

import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

// RGAU-MSHA Timiryazev Brand Color Palette
val TimacadGreen = Color(0xFF15803D)
val TimacadGreenDark = Color(0xFF22C55E)
val TimacadAccent = Color(0xFF10B981)

val BackgroundLight = Color(0xFFF8F9FA)
val BackgroundDark = Color(0xFF090D0B)

val CardLight = Color(0xFFFFFFFF)
val CardDark = Color(0xFF131A15)

val TextPrimaryLight = Color(0xFF0F172A)
val TextPrimaryDark = Color(0xFFF1F5F9)

val BorderLight = Color(0xFFE2E8F0)
val BorderDark = Color(0xFF233327)

// 120 FPS Fluid Spring Motion Tokens
object MotionTokens {
    val snappy = spring<Float>(
        dampingRatio = Spring.DampingRatioLowBouncy,
        stiffness = Spring.StiffnessMedium
    )
    val gentle = spring<Float>(
        dampingRatio = Spring.DampingRatioNoBouncy,
        stiffness = Spring.StiffnessLow
    )
}

private val DarkColorScheme = darkColorScheme(
    primary = TimacadGreenDark,
    background = BackgroundDark,
    surface = CardDark,
    onPrimary = Color.Black,
    onBackground = TextPrimaryDark,
    onSurface = TextPrimaryDark
)

private val LightColorScheme = lightColorScheme(
    primary = TimacadGreen,
    background = BackgroundLight,
    surface = CardLight,
    onPrimary = Color.White,
    onBackground = TextPrimaryLight,
    onSurface = TextPrimaryLight
)

@Composable
fun RasposTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit
) {
    val colorScheme = if (darkTheme) DarkColorScheme else LightColorScheme

    MaterialTheme(
        colorScheme = colorScheme,
        content = content
    )
}
