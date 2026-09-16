package ru.timacad.raspos.ui.screens

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import ru.timacad.raspos.core.domain.models.Lesson
import ru.timacad.raspos.ui.theme.TimacadGreen

@Composable
fun DynamicIslandCompose(
    currentLesson: Lesson?,
    nextLesson: Lesson?,
    minutesUntilNext: Int?,
    minutesLeftCurrent: Int?,
    onNavigate: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    var isExpanded by remember { mutableStateOf(false) }

    val activeLesson = currentLesson ?: nextLesson ?: return

    val islandWidth by animateDpAsState(
        targetValue = if (isExpanded) 340.dp else 220.dp,
        animationSpec = spring(dampingRatio = 0.75f, stiffness = 350f)
    )

    val islandHeight by animateDpAsState(
        targetValue = if (isExpanded) 130.dp else 36.dp,
        animationSpec = spring(dampingRatio = 0.75f, stiffness = 350f)
    )

    val cornerRadius by animateDpAsState(
        targetValue = if (isExpanded) 24.dp else 18.dp
    )

    Box(
        modifier = modifier
            .fillMaxWidth()
            .padding(top = 8.dp),
        contentAlignment = Alignment.TopCenter
    ) {
        Surface(
            modifier = Modifier
                .width(islandWidth)
                .height(islandHeight)
                .clip(RoundedCornerShape(cornerRadius))
                .clickable { isExpanded = !isExpanded },
            color = Color(0xFF090D0B),
            shadowElevation = 12.dp
        ) {
            if (!isExpanded) {
                // Compact Pill Mode
                Row(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(horizontal = 12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        Text(text = "📖", fontSize = 14.sp)
                        Text(
                            text = activeLesson.subject,
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold,
                            color = Color.White,
                            maxLines = 1,
                            modifier = Modifier.widthIn(max = 100.dp)
                        )
                    }

                    Text(
                        text = if (currentLesson != null) "${minutesLeftCurrent}м" else "${minutesUntilNext}м",
                        fontSize = 11.sp,
                        fontWeight = FontWeight.ExtraBold,
                        color = TimacadGreen
                    )
                }
            } else {
                // Expanded Interactive Mode
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(14.dp),
                    verticalArrangement = Arrangement.SpaceBetween
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Column {
                            Text(
                                text = if (currentLesson != null) "ИДЕТ ПАРА" else "СЛЕДУЮЩАЯ ПАРА",
                                fontSize = 9.sp,
                                fontWeight = FontWeight.Black,
                                color = TimacadGreen
                            )
                            Text(
                                text = activeLesson.subject,
                                fontSize = 13.sp,
                                fontWeight = FontWeight.Bold,
                                color = Color.White,
                                maxLines = 1
                            )
                        }

                        Text(
                            text = "ауд. ${activeLesson.classroom}",
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Bold,
                            color = Color(0xFF38BDF8)
                        )
                    }

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = "${activeLesson.building} • ${activeLesson.teacher}",
                            fontSize = 11.sp,
                            color = Color.White.copy(alpha = 0.6f)
                        )

                        TextButton(
                            onClick = { onNavigate(activeLesson.building) },
                            contentPadding = PaddingValues(horizontal = 8.dp, vertical = 2.dp)
                        ) {
                            Text(text = "Маршрут →", fontSize = 10.sp, color = TimacadGreen)
                        }
                    }
                }
            }
        }
    }
}
