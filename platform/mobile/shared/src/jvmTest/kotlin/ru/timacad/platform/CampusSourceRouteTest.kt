package ru.timacad.platform

import java.io.File
import java.util.Base64
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import uniffi.timacad_core.routeCampus
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class CampusSourceRouteTest {
    @Test
    fun nativeRouterFollowsMappedPathsAndRespectsThePrivateGate() {
        val pack = Json.parseToJsonElement(File("../../campus/data/campus-pack.json").readText()).jsonObject
        val topology = Base64.getDecoder().decode(pack.getValue("topologyBase64").jsonPrimitive.content)
        val nodes = pack.getValue("nodes").jsonArray.map { it.jsonObject }
        val ids = nodes.associate { it.getValue("osmId").jsonPrimitive.content to "n${it.getValue("id").jsonPrimitive.content}" }
        val entrance15 = ids.getValue("7678045074")
        val approach5 = ids.getValue("7677706200")
        val route = routeCampus(topology, entrance15, approach5)
        assertTrue(route.found)
        assertEquals(entrance15, route.roomNames.first())
        assertEquals(approach5, route.roomNames.last())
        assertEquals(412u, route.cost)
        assertEquals(0u, route.floorChanges)
        assertTrue(route.floors.all { it == 0 })
        assertTrue(route.roomNames.all { it in ids.values })
        val gated = routeCampus(topology, entrance15, ids.getValue("7834243335"))
        assertFalse(gated.found)
        assertTrue(gated.roomNames.isEmpty())
    }
}
