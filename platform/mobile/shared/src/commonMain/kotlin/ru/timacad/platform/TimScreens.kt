package ru.timacad.platform

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp

private val Paper = lightColorScheme(
    background = Color(0xFFF7F3EA),
    surface = Color(0xFFFFFBF4),
    primary = Color(0xFF2F5D50),
    onBackground = Color(0xFF1C1915),
    onSurface = Color(0xFF1C1915),
)

private val Oled = darkColorScheme(
    background = Color.Black,
    surface = Color.Black,
    primary = Color(0xFF8FCBB8),
    onBackground = Color(0xFFF4F1EA),
    onSurface = Color(0xFFF4F1EA),
)

private val Motion = spring<Color>(dampingRatio = 0.8f, stiffness = 400f)

@Composable
fun TimTheme(oled: Boolean, content: @Composable () -> Unit) {
    val scheme = if (oled) Oled else Paper
    val background by animateColorAsState(scheme.background, Motion)
    MaterialTheme(colorScheme = scheme) {
        Surface(modifier = Modifier.fillMaxSize().background(background), color = background, content = content)
    }
}

@Composable
fun DayScheduleScreen(
    rows: List<DayRow>,
    groupCode: String?,
    date: String?,
    subgroup: Int,
    onSubgroup: (Int) -> Unit,
    onSwipe: (Int) -> Unit,
    modifier: Modifier = Modifier,
) {
    var offset by remember(date) { mutableFloatStateOf(0f) }
    Column(
        modifier = modifier.fillMaxSize().padding(horizontal = 20.dp, vertical = 12.dp).pointerInput(date) {
            detectHorizontalDragGestures(
                onHorizontalDrag = { _, drag -> offset += drag },
                onDragEnd = {
                    val direction = when {
                        offset > 80f -> -1
                        offset < -80f -> 1
                        else -> 0
                    }
                    offset = 0f
                    if (direction != 0) onSwipe(direction)
                },
            )
        }.graphicsLayer { translationX = offset },
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Text("Платформа", style = MaterialTheme.typography.headlineMedium)
        Text(groupCode ?: "Группа не выбрана", style = MaterialTheme.typography.titleMedium)
        Text(date ?: "Нет сохранённого дня", style = MaterialTheme.typography.bodyMedium)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf(0 to "Все", 1 to "1", 2 to "2").forEach { (value, label) ->
                Button(onClick = { onSubgroup(value) }) { Text(if (subgroup == value) "· $label" else label) }
            }
        }
        LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
            items(rows, key = { it.key }) { row ->
                when (row) {
                    is GapRow -> Text(row.label, color = MaterialTheme.colorScheme.primary)
                    is LessonRow -> LessonCard(row)
                }
            }
        }
    }
}

@Composable
private fun LessonCard(row: LessonRow) {
    val tint = when (row.kind) {
        "lecture" -> Color(0xFF2F5D50)
        "practice" -> Color(0xFF8A5A2A)
        "lab" -> Color(0xFF3D4C7A)
        else -> MaterialTheme.colorScheme.onSurface
    }
    Column {
        Text("${row.startsAt}–${row.endsAt}  ${row.subject}", color = tint, textDecoration = if (row.mark == LessonMark.Cancelled) TextDecoration.LineThrough else null)
        Text("${row.teacher} · ${row.place}", style = MaterialTheme.typography.bodySmall)
        if (row.badge != null) Text(row.badge, color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.labelMedium)
    }
}

@Composable
fun GroupPickerScreen(
    groups: List<LocalGroup>,
    favorites: Set<String>,
    onPick: (String) -> Unit,
    onFavorite: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    var institute by remember(groups) { mutableStateOf(institutesOf(groups).firstOrNull()) }
    var course by remember(institute, groups) { mutableStateOf(institute?.let { coursesOf(groups, it).firstOrNull() }) }
    var query by remember { mutableStateOf("") }
    val shown = if (query.isBlank()) {
        val selectedInstitute = institute
        val selectedCourse = course
        if (selectedInstitute == null || selectedCourse == null) emptyList() else groupsOf(groups, selectedInstitute, selectedCourse)
    } else {
        groups.filter { it.code.contains(query, ignoreCase = true) || it.institute.contains(query, ignoreCase = true) }.take(100)
    }
    Column(modifier = modifier.fillMaxSize().padding(20.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("Группа", style = MaterialTheme.typography.headlineMedium)
        BasicTextField(value = query, onValueChange = { query = it }, modifier = Modifier.fillMaxWidth())
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            institutesOf(groups).forEach { name ->
                Button(onClick = {
                    institute = name
                    course = coursesOf(groups, name).firstOrNull()
                }) { Text(name.take(12)) }
            }
        }
        val selectedInstitute = institute
        if (selectedInstitute != null) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                coursesOf(groups, selectedInstitute).forEach { year ->
                    Button(onClick = { course = year }) { Text(year.toString()) }
                }
            }
        }
        LazyColumn(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            items(shown, key = { it.code }) { group ->
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(onClick = { onPick(group.code) }) { Text(group.code) }
                    Button(onClick = { onFavorite(group.code) }) {
                        Text(if (group.code in favorites) "в избранном" else "избранное")
                    }
                }
            }
        }
    }
}

@Composable
fun PersonalNotesScreen(
    notes: String,
    tasks: List<PersonalTask>,
    onNotes: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(modifier = modifier.fillMaxSize().padding(20.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("Личное", style = MaterialTheme.typography.headlineMedium)
        BasicTextField(value = notes, onValueChange = onNotes, modifier = Modifier.fillMaxWidth())
        tasks.forEach { task ->
            Text("${task.date}  ${task.title}", textDecoration = if (task.done) TextDecoration.LineThrough else null)
        }
    }
}

@Composable
fun SettingsScreen(
    oled: Boolean,
    session: String?,
    notice: String?,
    onTheme: (Boolean) -> Unit,
    onPasskey: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(modifier = modifier.fillMaxSize().padding(20.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("Настройки", style = MaterialTheme.typography.headlineMedium)
        Text(if (session.isNullOrBlank()) "Гость" else "Сессия старосты сохранена")
        Button(onClick = { onTheme(!oled) }) { Text(if (oled) "Светлая тема" else "Тёмная тема") }
        Button(onClick = onPasskey) { Text("Вход старосты по отпечатку") }
        if (!notice.isNullOrBlank()) Text(notice)
    }
}

enum class HomeTab { Day, Groups, Notes, Campus, Settings }
