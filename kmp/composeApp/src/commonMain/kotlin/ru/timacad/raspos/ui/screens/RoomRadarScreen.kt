package ru.timacad.raspos.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import ru.timacad.raspos.core.domain.models.FreeClassroom
import ru.timacad.raspos.ui.theme.TimacadGreen

@Composable
fun RoomRadarScreen(
    freeRooms: List<FreeClassroom>,
    onSelectRoom: (FreeClassroom) -> Unit,
    modifier: Modifier = Modifier
) {
    var socketFilter by remember { mutableStateOf(false) }
    var quietFilter by remember { mutableStateOf(false) }

    val filteredRooms = freeRooms.filter {
        (!socketFilter || it.hasOutlets) && (!quietFilter || it.isQuietZone)
    }

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(Color(0xFF090D0B))
            .padding(16.dp)
    ) {
        Text(
            text = "Радар свободных аудиторий",
            fontSize = 20.sp,
            fontWeight = FontWeight.ExtraBold,
            color = Color.White
        )
        Text(
            text = "Поиск аудиторий для учебы и отдыха в окнах между парами",
            fontSize = 12.sp,
            color = Color.White.copy(alpha = 0.6f)
        )

        Spacer(modifier = Modifier.height(12.dp))

        // Filter chips
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            FilterChip(
                selected = socketFilter,
                onClick = { socketFilter = !socketFilter },
                label = { Text("🔌 Розетки", fontSize = 11.sp) }
            )
            FilterChip(
                selected = quietFilter,
                onClick = { quietFilter = !quietFilter },
                label = { Text("🤫 Тихая зона", fontSize = 11.sp) }
            )
        }

        Spacer(modifier = Modifier.height(12.dp))

        LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            items(filteredRooms, key = { it.classroomId }) { room ->
                Surface(
                    shape = RoundedCornerShape(14.dp),
                    color = Color(0xFF131A15),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Row(
                        modifier = Modifier
                            .padding(14.dp)
                            .fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column {
                            Text(
                                text = "${room.building}, ауд. ${room.room}",
                                fontSize = 14.sp,
                                fontWeight = FontWeight.Bold,
                                color = Color.White
                            )
                            Text(
                                text = "Свободна до ${room.freeUntilTime} · ${room.floor} этаж",
                                fontSize = 11.sp,
                                color = TimacadGreen
                            )
                        }

                        Button(
                            onClick = { onSelectRoom(room) },
                            shape = RoundedCornerShape(8.dp),
                            colors = ButtonDefaults.buttonColors(containerColor = TimacadGreen),
                            contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp)
                        ) {
                            Text("Занять", fontSize = 11.sp, fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }
        }
    }
}
