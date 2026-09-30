package ru.timacad.platform

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

class ScheduleProjectionTest {
    private fun lesson(start: String, end: String, title: String) = LocalLesson(
        "2026-09-30", start, end, title, "lecture", "Преподаватель", "2", "101",
        "https://www.timacad.ru/schedule.pdf",
    )

    @Test
    fun combinedSubgroupsStayVisibleInBothFilters() {
        val combined = listOf("Физика П/Г 1, 2", "Физика подгруппы 1 и 2", "Физика п/г 1; п/г 2", "Физика 1/2 подгруппы")
        combined.forEach { title ->
            assertEquals(0, subgroupOf(title), title)
            for (filter in 1..2) assertEquals(1, composeDayRows(listOf(lesson("09:00", "10:30", title)), emptyList(), filter).size)
        }
        assertEquals(1, subgroupOf("Физика П / Г № 1"))
        assertEquals(2, subgroupOf("Физика 2-я подгруппа"))
        assertEquals(1, subgroupOf("Растения и сад - 1 п/г"))
        assertEquals(2, subgroupOf("Ландшафтоведение - 2 п/г"))
        assertEquals(0, subgroupOf("Растения - 1 п/г или Ландшафтоведение - 2 п/г"))
        assertEquals(0, subgroupOf("Математика 1"))
        assertEquals(0, subgroupOf("Физика п/г 12"))
    }

    @Test
    fun parallelOfficialClassesHaveStableDistinctKeysWithoutDroppingRecords() {
        val language = lesson("14:55", "16:30", "Иностранный язык")
        val practice = language.copy(kind = "practice", teacher = "Второй преподаватель", room = "27-4; 12-204")
        val originals = listOf(language, practice)
        val before = composeDayRows(originals, emptyList(), 0).filterIsInstance<LessonRow>()
        assertEquals(2, before.size)
        assertEquals(2, before.map { it.key }.toSet().size)
        assertEquals(before, composeDayRows(originals.reversed(), emptyList(), 0))
        val room = StoredChange(1, lessonFingerprint(language), "room", """{"room":"305"}""")
        assertEquals(before.map { it.key }, composeDayRows(originals, listOf(room), 0).map { it.key })
        val identical = composeDayRows(listOf(language, language), emptyList(), 0)
        assertEquals(2, identical.size)
        assertEquals(2, identical.map { it.key }.toSet().size)
    }

    @Test
    fun movedCardsSortByEffectiveTimeButKeepOriginalIdentity() {
        val first = lesson("09:00", "10:30", "Перенесённая")
        val second = lesson("12:00", "13:30", "Обычная")
        val change = StoredChange(2, lessonFingerprint(first), "move", """{"starts_at":"15:00","ends_at":"16:30"}""")
        val stale = change.copy(lsn = 1, payloadJson = """{"starts_at":"08:00","ends_at":"09:30"}""")
        val rows = composeDayRows(listOf(first, second), listOf(change, stale), 0)
        val cards = rows.filterIsInstance<LessonRow>()
        assertEquals(listOf("Обычная", "Перенесённая"), cards.map { it.subject })
        assertEquals(lessonFingerprint(first), cards.last().key)
        assertEquals("15:00", cards.last().startsAt)
        assertEquals("Окно: 1 ч 30 мин", rows.filterIsInstance<GapRow>().single().label)
        assertEquals("Обычная", projectWidget(listOf(first, second), listOf(change, stale), 11 * 60).headline)
    }

    @Test
    fun cancelledAndOverlappingLessonsDoNotCreateFalseGaps() {
        val long = lesson("09:00", "12:00", "Длинная")
        val short = lesson("09:30", "10:00", "Параллельная")
        val cancelled = lesson("12:30", "14:00", "Отменённая")
        val next = lesson("15:00", "16:30", "Следующая")
        val changes = listOf(StoredChange(1, lessonFingerprint(cancelled), "cancel", "{}"))
        val rows = composeDayRows(listOf(long, short, cancelled, next), changes, 0)
        assertEquals("Окно: 3 ч", rows.filterIsInstance<GapRow>().single().label)
        assertEquals(4, rows.filterIsInstance<LessonRow>().size)
        assertEquals(rows.size, rows.map { it.key }.toSet().size)
        assertTrue(composeDayRows(listOf(cancelled, next), changes, 0).none { it is GapRow })
    }

    @Test
    fun overlaysDecodeJsonStringsAndIgnoreNestedOrInvalidFields() {
        val original = lesson("09:00", "10:30", "Физика")
        val room = StoredChange(1, lessonFingerprint(original), "room", """{"room":"\u0411\"2","building":"3"}""")
        val card = composeDayRows(listOf(original), listOf(room), 0).single() as LessonRow
        assertEquals("3 · Б\"2", card.place)
        assertEquals("Б\"2", projectWidget(listOf(original), listOf(room), 9 * 60).room)
        assertNull(payloadField("""{"nested":{"room":"wrong"},"room":42}""", "room"))
        assertNull(payloadField("invalid", "room"))
        val invalidMove = room.copy(kind = "move", payloadJson = """{"starts_at":"29:00","ends_at":"01:00"}""")
        assertEquals("09:00", (composeDayRows(listOf(original), listOf(invalidMove), 0).single() as LessonRow).startsAt)
        assertEquals(original.sourceUrl, card.sourceUrl)
        assertNull((composeDayRows(listOf(original.copy(sourceUrl = "file:///private")), emptyList(), 0).single() as LessonRow).sourceUrl)
    }
}
