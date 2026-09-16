package ru.timacad.raspos.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Fill
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.dp
import ru.timacad.raspos.core.domain.models.ProjectedPoint2D

@Composable
fun Building3DRenderer(
    projectedVertices: List<ProjectedPoint2D>,
    activeFloor: Int,
    accentColor: Color,
    modifier: Modifier = Modifier
) {
    Canvas(modifier = modifier.fillMaxSize()) {
        val centerX = size.width / 2f
        val centerY = size.height / 2f

        // Render multi-floor isometric layers
        val groupedByFloor = projectedVertices.groupBy { it.floor }
        for ((floor, vertices) in groupedByFloor.toSortedMap()) {
            val isCurrent = floor == activeFloor
            val floorColor = if (isCurrent) accentColor else Color(0xFF1B261E)
            val strokeColor = if (isCurrent) Color.White else Color(0xFF2E4032)

            if (vertices.size >= 3) {
                val polyPath = Path().apply {
                    val first = vertices[0]
                    moveTo(centerX + first.screenX, centerY + first.screenY)
                    for (i in 1 until vertices.size) {
                        val pt = vertices[i]
                        lineTo(centerX + pt.screenX, centerY + pt.screenY)
                    }
                    close()
                }

                drawPath(path = polyPath, color = floorColor.copy(alpha = if (isCurrent) 0.85f else 0.4f), style = Fill)
                drawPath(path = polyPath, color = strokeColor, style = Stroke(width = if (isCurrent) 2.5f else 1.2f))
            }
        }
    }
}
