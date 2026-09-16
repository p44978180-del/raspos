package ru.timacad.raspos.ui.screens

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
import ru.timacad.raspos.ui.theme.TimacadGreen

data class MatchmakingSlot(
    val id: String,
    val timeRange: String,
    val durationMinutes: Int,
    val commonGroups: List<String>,
    val recommendationType: String,
    val recommendedPlace: String
)

val SAMPLE_SLOTS = listOf(
    MatchmakingSlot("w1", "12:10 — 13:40", 90, listOf("ДА 01-26", "ДЭ 17-26"), "Обед", "Комбинат питания (КП)"),
    MatchmakingSlot("w2", "15:20 — 17:00", 100, listOf("ДА 01-26", "ТТ 11-26"), "Коворкинг", "ЦНБ им. Железнова, 2 этаж"),
    MatchmakingSlot("w3", "17:10 — 18:40", 90, listOf("ДА 01-26", "ЗУ 11-26"), "Спорт", "Спортивный комплекс (СК)")
)

@Composable
fun WindowMatchmakingScreen(
    myGroup: String,
    onClose: () -> Unit,
    modifier: Modifier = Modifier
) {
    Surface(
        modifier = modifier.fillMaxSize(),
        color = Color(0xFF090D0B)
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(16.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column {
                    Text(
                        text = "Пересечение окон",
                        fontSize = 20.sp,
                        fontWeight = FontWeight.ExtraBold,
                        color = Color.White
                    )
                    Text(
                        text = "Группа: $myGroup",
                        fontSize = 12.sp,
                        color = TimacadGreen
                    )
                }
                IconButton(onClick = onClose) {
                    Text("✕", color = Color.White, fontSize = 18.sp)
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            LazyColumn(
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                items(SAMPLE_SLOTS, key = { it.id }) { slot ->
                    Surface(
                        shape = RoundedCornerShape(16.dp),
                        color = Color(0xFF131A15),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                Text(
                                    text = slot.timeRange,
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 15.sp,
                                    color = Color.White
                                )
                                Surface(
                                    shape = RoundedCornerShape(8.dp),
                                    color = TimacadGreen.copy(alpha = 0.2f)
                                ) {
                                    Text(
                                        text = "${slot.durationMinutes} мин",
                                        fontWeight = FontWeight.Bold,
                                        fontSize = 11.sp,
                                        color = TimacadGreen,
                                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                                    )
                                }
                            }

                            Spacer(modifier = Modifier.height(8.dp))

                            Text(
                                text = "Группы: ${slot.commonGroups.joinToString(", ")}",
                                fontSize = 12.sp,
                                color = Color(0xFF94A3B8)
                            )

                            Spacer(modifier = Modifier.height(6.dp))

                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text("📍 ", fontSize = 12.sp)
                                Text(
                                    text = "${slot.recommendationType}: ${slot.recommendedPlace}",
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.SemiBold,
                                    color = Color(0xFF38BDF8)
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}
