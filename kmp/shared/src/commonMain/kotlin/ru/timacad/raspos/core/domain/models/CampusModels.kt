package ru.timacad.raspos.core.domain.models

import kotlinx.serialization.Serializable

@Serializable
data class CampusFloorVertex(
    val x: Float,
    val y: Float,
    val z: Float,
    val floor: Int,
    val buildingId: String,
    val label: String? = null
)

@Serializable
data class ProjectedPoint2D(
    val screenX: Float,
    val screenY: Float,
    val depth: Float,
    val floor: Int,
    val buildingId: String
)

@Serializable
data class CampusBuilding(
    val id: String,
    val name: String,
    val shortName: String,
    val address: String,
    val floorsCount: Int,
    val latitude: Double,
    val longitude: Double,
    val isAcademic: Boolean,
    val departments: List<String> = emptyList(),
    val diningOptions: List<String> = emptyList()
)

@Serializable
data class TransitSegment(
    val fromNode: String,
    val toNode: String,
    val fromFloor: Int,
    val toFloor: Int,
    val distanceMeters: Int,
    val estimatedMinutes: Int,
    val isOutdoor: Boolean,
    val hasStairs: Boolean,
    val isAccessible: Boolean
)

@Serializable
data class TransitRoute(
    val fromBuilding: String,
    val fromFloor: Int,
    val toBuilding: String,
    val toFloor: Int,
    val segments: List<TransitSegment>,
    val totalMeters: Int,
    val totalMinutes: Int,
    val isUrgent: Boolean,
    val warningMessage: String? = null
)
