package ru.timacad.raspos.ui.screens

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import ru.timacad.raspos.ui.theme.TimacadGreen

data class BuildingNode(
    val id: String,
    val name: String,
    val shortName: String,
    val xRatio: Float,
    val yRatio: Float,
    val isAcademic: Boolean
)

val TIMACAD_BUILDINGS = listOf(
    BuildingNode("corp1", "1-й Корпус", "1", 0.20f, 0.40f, true),
    BuildingNode("corp2", "2-й Корпус", "2", 0.26f, 0.40f, true),
    BuildingNode("corp3", "3-й Корпус", "3", 0.32f, 0.39f, true),
    BuildingNode("corp4", "4-й Корпус", "4", 0.38f, 0.38f, true),
    BuildingNode("corp6", "6-й Корпус", "6", 0.28f, 0.46f, true),
    BuildingNode("corp9", "9-й Корпус", "9", 0.36f, 0.50f, true),
    BuildingNode("corp10", "10-й Корпус", "10", 0.41f, 0.55f, true),
    BuildingNode("corp11", "11-й Корпус", "11", 0.46f, 0.60f, true),
    BuildingNode("corp12", "12-й Корпус (Почвоведение)", "12", 0.29f, 0.60f, true),
    BuildingNode("corp17", "17-й Корпус", "17", 0.55f, 0.49f, true),
    BuildingNode("corp26", "26-й Корпус (Инженерия)", "26", 0.64f, 0.37f, true),
    BuildingNode("corp27", "27-й Корпус (Экономика)", "27", 0.72f, 0.41f, true),
    BuildingNode("corp28", "28-й Корпус", "28", 0.63f, 0.45f, true),
    BuildingNode("corp29", "29-й Корпус", "29", 0.69f, 0.49f, true),
    BuildingNode("sport", "Спорткомплекс (СК)", "СК", 0.88f, 0.72f, false),
    BuildingNode("stadium", "Стадион", "Стадион", 0.81f, 0.66f, false),
    BuildingNode("library", "ЦНБ им. Железнова", "ЦНБ", 0.24f, 0.32f, false),
    BuildingNode("canteen", "Комбинат питания", "КП", 0.50f, 0.43f, false)
)

@Composable
fun CampusMapScreen(
    onBuildingSelected: (BuildingNode) -> Unit,
    modifier: Modifier = Modifier
) {
    var scale by remember { mutableStateOf(1f) }
    var offset by remember { mutableStateOf(Offset.Zero) }
    var selectedBuilding by remember { mutableStateOf<BuildingNode?>(null) }
    var selectedFloor by remember { mutableStateOf(1) }

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(Color(0xFF090D0B))
            .pointerInput(Unit) {
                detectTransformGestures { _, pan, zoom, _ ->
                    scale = (scale * zoom).coerceIn(0.7f, 3.5f)
                    offset += pan
                }
            }
    ) {
        // Skia Hardware-Accelerated Canvas
        Canvas(modifier = Modifier.fillMaxSize()) {
            val canvasW = size.width
            val canvasH = size.height

            // Draw Paths between buildings
            val path = Path().apply {
                val start = Offset(
                    TIMACAD_BUILDINGS[0].xRatio * canvasW * scale + offset.x,
                    TIMACAD_BUILDINGS[0].yRatio * canvasH * scale + offset.y
                )
                moveTo(start.x, start.y)
                for (b in TIMACAD_BUILDINGS.drop(1)) {
                    lineTo(
                        b.xRatio * canvasW * scale + offset.x,
                        b.yRatio * canvasH * scale + offset.y
                    )
                }
            }
            drawPath(
                path = path,
                color = TimacadGreen.copy(alpha = 0.35f),
                style = Stroke(width = 3.dp.toPx())
            )

            // Draw Building Markers
            for (b in TIMACAD_BUILDINGS) {
                val bx = b.xRatio * canvasW * scale + offset.x
                val by = b.yRatio * canvasH * scale + offset.y
                val isSelected = selectedBuilding?.id == b.id

                drawCircle(
                    color = if (isSelected) Color(0xFFF59E0B) else if (b.isAcademic) TimacadGreen else Color(0xFF38BDF8),
                    radius = (if (isSelected) 14.dp else 10.dp).toPx(),
                    center = Offset(bx, by)
                )
                drawCircle(
                    color = Color.White,
                    radius = (if (isSelected) 5.dp else 3.dp).toPx(),
                    center = Offset(bx, by)
                )
            }
        }

        // Floor selector overlay
        Surface(
            modifier = Modifier
                .align(Alignment.BottomEnd)
                .padding(16.dp),
            shape = RoundedCornerShape(16.dp),
            color = Color(0xFF131A15).copy(alpha = 0.9f),
            shadowElevation = 8.dp
        ) {
            Row(modifier = Modifier.padding(4.dp)) {
                for (floor in 1..4) {
                    TextButton(
                        onClick = { selectedFloor = floor },
                        colors = ButtonDefaults.textButtonColors(
                            contentColor = if (selectedFloor == floor) TimacadGreen else Color.White
                        )
                    ) {
                        Text(text = "${floor}Э", fontWeight = FontWeight.Bold, fontSize = 12.sp)
                    }
                }
            }
        }
    }
}
