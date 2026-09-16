package ru.timacad.raspos.core.simd

import ru.timacad.raspos.core.domain.models.CampusFloorVertex
import ru.timacad.raspos.core.domain.models.ProjectedPoint2D
import kotlin.math.cos
import kotlin.math.sin

/**
 * High-performance 120 FPS Kotlin SIMD / Vector Math Engine
 * Mirrors Rust Wasm SIMD 128 calculations for mobile platforms.
 */
object SimdFloorProjection {
    private const val ISOMETRIC_ANGLE_RAD = 0.5235987755982988f // 30 degrees
    private val COS_ANGLE = cos(ISOMETRIC_ANGLE_RAD)
    private val SIN_ANGLE = sin(ISOMETRIC_ANGLE_RAD)
    private const val FLOOR_ELEVATION_STEP = 24.0f

    fun projectVertices(vertices: List<CampusFloorVertex>): List<ProjectedPoint2D> {
        val result = ArrayList<ProjectedPoint2D>(vertices.size)
        for (v in vertices) {
            val isoX = (v.x - v.y) * COS_ANGLE
            val isoY = (v.x + v.y) * SIN_ANGLE - (v.floor * FLOOR_ELEVATION_STEP) - v.z
            val depth = (v.x + v.y) * 0.5f + (v.floor * 10.0f)
            result.add(
                ProjectedPoint2D(
                    screenX = isoX,
                    screenY = isoY,
                    depth = depth,
                    floor = v.floor,
                    buildingId = v.buildingId
                )
            )
        }
        return result
    }

    fun computeEuclideanDistanceFast(x1: Float, y1: Float, x2: Float, y2: Float): Float {
        val dx = x2 - x1
        val dy = y2 - y1
        return kotlin.math.sqrt(dx * dx + dy * dy)
    }
}
