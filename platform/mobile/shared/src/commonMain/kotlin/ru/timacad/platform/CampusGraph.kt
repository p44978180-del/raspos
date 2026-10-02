package ru.timacad.platform

import androidx.compose.runtime.Immutable
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.*
import okio.ByteString.Companion.decodeBase64
import okio.ByteString.Companion.toByteString
import kotlin.math.abs

private const val MAX_PACK_BYTES = 4 * 1024 * 1024
private val campusJson = Json { ignoreUnknownKeys = true }
const val EMPTY_GEOJSON = "{\"type\":\"FeatureCollection\",\"features\":[]}"

@Immutable
data class CampusPoint(val lon: Double, val lat: Double)
@Immutable
data class CampusPreset(val id: Int, val name: String)
@Immutable
data class CampusBounds(val west: Double, val south: Double, val east: Double, val north: Double)
@Immutable
data class CampusView(
    val hash: String, val schemeJson: String, val center: CampusPoint,
    val presets: List<CampusPreset>, val from: Int, val to: Int,
    val markersJson: String, val routeJson: String, val routeBounds: CampusBounds?,
    val message: String, val attribution: String, val attributionUrl: String,
)

data class CampusRouteNodes(val found: Boolean, val names: List<String>)
fun interface CampusRouter { fun route(topology: ByteArray, from: String, to: String): CampusRouteNodes }

/** Parsed off the UI thread; topology stays private and is validated before native allocation. */
class CampusGraph internal constructor(
    val hash: String, private val topology: ByteArray, private val nodes: Map<Int, PackNode>,
    private val presets: List<CampusPreset>, private val schemeJson: String,
    private val center: CampusPoint, private val attribution: String, private val attributionUrl: String,
) {
    val nodeCount: Int get() = nodes.size
    fun view(from: Int? = null, to: Int? = null, router: CampusRouter): CampusView {
        val start = presets.firstOrNull { it.id == from } ?: presets.first()
        val end = presets.firstOrNull { it.id == to } ?: presets.firstOrNull { it.name.startsWith("Корпус 5") } ?: presets.last()
        val result = router.route(topology.copyOf(), "n${start.id}", "n${end.id}")
        val points = if (result.found) {
            require(result.names.size in 1..nodes.size) { "Invalid native route length" }
            require(result.names.first() == "n${start.id}" && result.names.last() == "n${end.id}")
            result.names.map { name ->
                val id = name.removePrefix("n").toInt()
                require(name == "n$id")
                nodes.getValue(id).point()
            }
        } else emptyList()
        val route = if (points.isEmpty()) EMPTY_GEOJSON else featureCollection(listOf(buildJsonObject {
            put("type", "Feature"); put("properties", buildJsonObject {})
            put("geometry", buildJsonObject {
                put("type", "LineString")
                put("coordinates", JsonArray((if (points.size == 1) points + points else points).map { it.coordinate() }))
            })
        }))
        val markers = featureCollection(listOf(start to "from", end to "to").map { (preset, role) -> buildJsonObject {
            put("type", "Feature")
            put("properties", buildJsonObject { put("name", preset.name); put("role", role) })
            put("geometry", buildJsonObject { put("type", "Point"); put("coordinates", nodes.getValue(preset.id).point().coordinate()) })
        } })
        val bounds = points.takeIf { it.isNotEmpty() }?.let { CampusBounds(it.minOf { p -> p.lon }, it.minOf { p -> p.lat }, it.maxOf { p -> p.lon }, it.maxOf { p -> p.lat }) }
        return CampusView(hash, schemeJson, center, presets, start.id, end.id, markers, route, bounds,
            if (result.found) "Маршрут по нанесённым дорожкам" else "Маршрут не найден в доступном графе. Закрытые проходы не учитываются.",
            attribution, attributionUrl)
    }
}

data class CampusSnapshot(val hash: String, val bytes: ByteArray, val graph: CampusGraph)

/** SyncOp's campus arm. Exact oneof validation prevents silently accepting a different snapshot. */
fun syncOpBody(op: ByteArray, arm: Int): ByteArray {
    val reader = WireReader(op)
    require(reader.varint() == ((arm shl 3) or 2).toLong()) { "Unexpected SyncOp arm" }
    val body = reader.bytes()
    require(reader.exhausted()) { "SyncOp has multiple bodies" }
    return body
}

fun decodeCampusSnapshot(op: ByteArray): CampusSnapshot {
    require(op.size <= MAX_PACK_BYTES + 128) { "Campus snapshot is too large" }
    val reader = WireReader(syncOpBody(op, 3))
    var hash: String? = null
    var bytes: ByteArray? = null
    while (!reader.exhausted()) {
        when (reader.varint()) {
            10L -> { require(hash == null); hash = reader.bytes().decodeToString(throwOnInvalidSequence = true) }
            18L -> { require(bytes == null); bytes = reader.bytes() }
            else -> error("Unexpected campus snapshot field")
        }
    }
    val data = requireNotNull(bytes)
    val digest = requireNotNull(hash)
    return CampusSnapshot(digest, data, decodeCampusPack(data, digest))
}

fun decodeCampusPack(bytes: ByteArray, expectedHash: String): CampusGraph {
    require(bytes.size in 1..MAX_PACK_BYTES) { "Campus pack size is invalid" }
    require(Regex("[0-9a-f]{64}").matches(expectedHash) && bytes.toByteString().sha256().hex() == expectedHash) { "Campus hash mismatch" }
    val pack = campusJson.decodeFromString<Pack>(bytes.decodeToString(throwOnInvalidSequence = true))
    require(pack.format == "tim-campus-v1" && pack.license == "ODbL-1.0")
    require(pack.attribution == "© OpenStreetMap contributors" && pack.attributionUrl == "https://www.openstreetmap.org/copyright")
    require(pack.bounds.size == 4 && pack.bounds.all { it.isFinite() })
    val bounds = CampusBounds(pack.bounds[0], pack.bounds[1], pack.bounds[2], pack.bounds[3])
    require(bounds.west in -180.0..180.0 && bounds.east in -180.0..180.0 && bounds.south in -90.0..90.0 && bounds.north in -90.0..90.0)
    require(bounds.west < bounds.east && bounds.south < bounds.north)
    require(bounds.east - bounds.west < 0.2 && bounds.north - bounds.south < 0.2) { "Campus extent is too large" }
    fun checkPoint(lon: Double, lat: Double) {
        require(lon.isFinite() && lat.isFinite() && lon in bounds.west..bounds.east && lat in bounds.south..bounds.north) { "Campus coordinate is outside bounds" }
    }
    require(pack.center.size == 2); checkPoint(pack.center[0], pack.center[1])
    require(pack.nodes.size in 1..20_000)
    val nodes = pack.nodes.associateBy { it.id }
    require(nodes.size == pack.nodes.size) { "Duplicate campus node" }
    nodes.values.forEach { require(it.id >= 0 && it.x in 0..65535 && it.y in 0..65535); checkPoint(it.lon, it.lat) }
    require(pack.presets.size in 2..32 && pack.presets.map { it.id }.toSet().size == pack.presets.size)
    pack.presets.forEach { require(it.id in nodes && it.name.length in 1..120) }
    val topology = requireNotNull(pack.topologyBase64.decodeBase64()).toByteArray()
    require(topology.size <= 1024 * 1024)
    validateTopology(topology, nodes)
    require(pack.map["type"]?.jsonPrimitive?.content == "FeatureCollection")
    val features = pack.map.getValue("features").jsonArray
    require(features.size <= 5_000)
    var coordinateCount = 0
    fun checkCoordinates(element: JsonElement, depth: Int) {
        require(depth in 0..4)
        val array = element.jsonArray
        if (depth == 0) {
            require(array.size == 2)
            // Complete building rings may cross the extract edge. Keep their surveyed
            // outline; only routable nodes must lie strictly inside the graph bounds.
            val lon = array[0].jsonPrimitive.double; val lat = array[1].jsonPrimitive.double
            require(lon.isFinite() && lat.isFinite() && lon in (bounds.west - 0.01)..(bounds.east + 0.01) && lat in (bounds.south - 0.01)..(bounds.north + 0.01))
            require(++coordinateCount <= 100_000)
        } else array.forEach { checkCoordinates(it, depth - 1) }
    }
    features.forEach { feature ->
        val item = feature.jsonObject
        require(item["type"]?.jsonPrimitive?.content == "Feature")
        val geometry = item.getValue("geometry").jsonObject
        val depth = when (geometry["type"]?.jsonPrimitive?.content) {
            "Polygon", "MultiLineString" -> 2
            "MultiPolygon" -> 3
            else -> error("Unsupported campus geometry")
        }
        checkCoordinates(geometry.getValue("coordinates"), depth)
    }
    return CampusGraph(expectedHash, topology, nodes, pack.presetsView,
        pack.map.toString(), CampusPoint(pack.center[0], pack.center[1]), pack.attribution, pack.attributionUrl)
}

private fun validateTopology(bytes: ByteArray, nodes: Map<Int, PackNode>) {
    val reader = TopologyReader(bytes)
    require(reader.take(4).decodeToString() == "TMG1")
    val count = reader.u32()
    val edges = reader.u32()
    require(count == nodes.size && edges in 0..60_000)
    val seen = mutableSetOf<Int>()
    repeat(count) {
        val id = reader.u32(); val node = nodes.getValue(id)
        require(seen.add(id))
        require(reader.u16() == 0 && reader.u16() == node.x && reader.u16() == node.y) { "Topology node mismatch" }
        require(reader.take(reader.u8()).decodeToString(throwOnInvalidSequence = true) == "n$id")
    }
    repeat(edges) {
        val from = nodes.getValue(reader.u32()); val to = nodes.getValue(reader.u32()); val cost = reader.u32()
        require(from.id != to.id && cost in 1..1_000_000 && cost >= abs(from.x - to.x) + abs(from.y - to.y)) { "Invalid campus edge cost" }
    }
    require(reader.exhausted()) { "Trailing topology bytes" }
}

private class TopologyReader(private val bytes: ByteArray) {
    private var at = 0
    fun exhausted() = at == bytes.size
    fun take(size: Int): ByteArray { require(size >= 0 && size <= bytes.size - at); return bytes.copyOfRange(at, at + size).also { at += size } }
    fun u8(): Int { require(at < bytes.size); return bytes[at++].toInt() and 255 }
    fun u16(): Int = u8() or (u8() shl 8)
    fun u32(): Int { val value = u16().toLong() or (u16().toLong() shl 16); require(value <= Int.MAX_VALUE); return value.toInt() }
}

@Serializable
internal data class PackNode(val id: Int, val lon: Double, val lat: Double, val x: Int, val y: Int) {
    fun point() = CampusPoint(lon, lat)
}
@Serializable
private data class Pack(
    val format: String, val license: String, val attribution: String, val attributionUrl: String,
    val bounds: List<Double>, val center: List<Double>, val topologyBase64: String,
    val nodes: List<PackNode>, val presets: List<CampusPresetDto>, val map: JsonObject,
) {
    val presetsView get() = presets.map { CampusPreset(it.id, it.name) }
}
@Serializable
private data class CampusPresetDto(val id: Int, val name: String)

private fun CampusPoint.coordinate() = JsonArray(listOf(JsonPrimitive(lon), JsonPrimitive(lat)))
private fun featureCollection(features: List<JsonObject>): String = buildJsonObject {
    put("type", "FeatureCollection"); put("features", JsonArray(features))
}.toString()
