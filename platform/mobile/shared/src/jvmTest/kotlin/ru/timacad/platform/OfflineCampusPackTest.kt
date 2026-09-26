package ru.timacad.platform

import java.io.File
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class OfflineCampusPackTest {
    @Test
    fun stylePackHasNoNetworkAndKeepsRoomLabels() {
        val root = File("src/androidMain/assets/campus")
        val style = File(root, "style.json").readText()
        val lowered = style.lowercase()
        assertFalse(lowered.contains("http://"))
        assertFalse(lowered.contains("https://"))
        assertTrue(style.contains("\"name\": \"Схема территории\""))
        assertTrue(style.contains("asset://campus/glyphs/{fontstack}/{range}.pbf"))
        assertTrue(style.contains("\"text-allow-overlap\": true"))
        assertTrue(style.contains("\"text-ignore-placement\": true"))
        assertTrue(style.contains("\"text-halo-color\": \"#000000\""))
        assertTrue(style.contains("\"text-halo-width\": 1.5"))
        assertTrue(File(root, "glyphs/Sans Regular/0-255.pbf").length() > 10000)
        assertTrue(style.contains("\"text-font\": [\"Sans Regular\"]"))
        assertTrue(style.contains("\"zoom\": 16.5"))
        assertTrue(style.contains("\"minzoom\": 0"))
        assertTrue(style.contains("\"maxzoom\": 24"))
        assertTrue(style.contains("\"filter\": [\"==\", [\"get\", \"kind\"], \"room\"]"))
        assertEquals(16.5, CampusScheme.cameraZoom)
        assertTrue(style.contains("\"id\": \"labels\""))
        val names = listOf("Корпус 2", "101", "102", "201", "Лестница")
        names.forEach { name -> assertTrue(style.contains(name), name) }
        val latin = File(root, "glyphs/TimCampus/0-255.pbf")
        val cyrillic = File(root, "glyphs/TimCampus/1024-1279.pbf")
        assertTrue(latin.length() > 32)
        assertTrue(cyrillic.length() > 32)
        names.joinToString("").forEach { ch ->
            if (ch == ' ') return@forEach
            val file = if (ch.code < 256) latin else cyrillic
            assertTrue(file.readBytes().isNotEmpty())
        }
        assertEquals("Схема территории", CampusScheme.caption)
        val legend = CampusScheme.legend(names)
        assertFalse(legend.contains("мин"))
        assertFalse(Regex("\\d+\\s*мин").containsMatchIn(legend))
    }
}
