package ru.timacad.raspos.ui

import androidx.compose.animation.*
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
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
import ru.timacad.raspos.core.domain.models.DaySchedule
import ru.timacad.raspos.core.domain.models.Lesson
import ru.timacad.raspos.core.domain.models.LessonType

val TimacadGreen = Color(0xFF15803D)
val DarkBackground = Color(0xFF090D0B)
val CardBackground = Color(0xFF131A15)

@Composable
fun ScheduleScreen(
    activeGroup: String,
    days: List<DaySchedule>,
    selectedDayIndex: Int,
    onSelectDay: (Int) -> Unit,
    onLessonClick: (Lesson) -> Unit
) {
    Surface(
        modifier = Modifier.fillMaxSize(),
        color = DarkBackground
    ) {
        Column(
            modifier = Modifier.fillMaxSize()
        ) {
            // App Header
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Column {
                    Text(
                        text = "РГАУ-МСХА",
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold,
                        color = TimacadGreen
                    )
                    Text(
                        text = activeGroup,
                        fontSize = 18.sp,
                        fontWeight = FontWeight.ExtraBold,
                        color = Color.White
                    )
                }

                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Surface(
                        shape = RoundedCornerShape(12.dp),
                        color = Color.White.copy(alpha = 0.1f)
                    ) {
                        Text(
                            text = "Верхняя неделя",
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold,
                            color = Color(0xFF38BDF8),
                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp)
                        )
                    }
                }
            }

            // Virtualized 120 FPS Lesson List
            if (selectedDayIndex in days.indices) {
                val currentDay = days[selectedDayIndex]
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    items(currentDay.lessons, key = { it.id }) { lesson ->
                        LessonCard(lesson = lesson, onClick = { onLessonClick(lesson) })
                    }
                }
            }
        }
    }
}

@Composable
fun LessonCard(
    lesson: Lesson,
    onClick: () -> Unit
) {
    val typeColor = when (lesson.type) {
        LessonType.LECTURE -> Color(0xFF22C55E)
        LessonType.PRACTICE -> Color(0xFFF59E0B)
        LessonType.LABORATORY -> Color(0xFF38BDF8)
        LessonType.ELECTIVE -> Color(0xFFA855F7)
    }

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(20.dp))
            .background(CardBackground)
            .clickable { onClick() }
            .padding(14.dp)
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Surface(
                    shape = RoundedCornerShape(8.dp),
                    color = typeColor.copy(alpha = 0.15f)
                ) {
                    Text(
                        text = lesson.type.name,
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Bold,
                        color = typeColor,
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp)
                    )
                }

                Text(
                    text = "${lesson.startTime} — ${lesson.endTime}",
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color.White
                )
            }

            Spacer(modifier = Modifier.height(2.dp))

            Text(
                text = lesson.subject,
                fontSize = 15.sp,
                fontWeight = FontWeight.Bold,
                color = Color.White
            )

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "📍 ауд. ${lesson.classroom} • ${lesson.building}",
                    fontSize = 12.sp,
                    color = Color.Gray
                )
                Text(
                    text = lesson.teacher,
                    fontSize = 11.sp,
                    color = Color.LightGray
                )
            }
        }
    }
}
