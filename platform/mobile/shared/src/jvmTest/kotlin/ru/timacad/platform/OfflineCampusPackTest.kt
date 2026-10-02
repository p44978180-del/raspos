package ru.timacad.platform

import java.io.File
import kotlinx.serialization.json.*
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class OfflineCampusPackTest {
    @Test
    fun mapStyleLoadsOnlyLocalGlyphsAndPreparedGeometry() {
        val root = File("src/androidMain/assets/campus")
        val text = File(root, "style.json").readText()
        val style = Json.parseToJsonElement(text).jsonObject
        assertFalse(text.contains("http://"))
        assertFalse(text.contains("https://"))
        assertEquals(CampusScheme.caption, style.getValue("name").jsonPrimitive.content)
        assertEquals("asset://campus/glyphs/{fontstack}/{range}.pbf", style.getValue("glyphs").jsonPrimitive.content)
        val sources = style.getValue("sources").jsonObject
        assertEquals(setOf("scheme", "route", "endpoints"), sources.keys)
        sources.values.forEach { source ->
            val json = source.jsonObject
            assertEquals("geojson", json.getValue("type").jsonPrimitive.content)
            // No invented buildings or indoor rooms are shipped with the style.
            assertTrue(json.getValue("data").jsonObject.getValue("features").jsonArray.isEmpty())
        }
        val layers = style.getValue("layers").jsonArray.map { it.jsonObject }
        assertTrue(layers.any { it.getValue("id").jsonPrimitive.content == "route" && it.getValue("source").jsonPrimitive.content == "route" })
        layers.filter { it.getValue("type").jsonPrimitive.content == "symbol" }.forEach {
            assertEquals("Sans Regular", it.getValue("layout").jsonObject.getValue("text-font").jsonArray.single().jsonPrimitive.content)
        }
        assertTrue(File(root, "glyphs/Sans Regular/0-255.pbf").length() > 10000)
        assertTrue(File(root, "glyphs/Sans Regular/1024-1279.pbf").length() > 10000)
        assertEquals(16.5, CampusScheme.cameraZoom)
    }
}
