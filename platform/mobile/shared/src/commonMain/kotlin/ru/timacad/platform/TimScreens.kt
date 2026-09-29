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
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.TextButton
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
    picker: GroupPickerView,
    favorites: Set<String>,
    onPick: (String) -> Unit,
    onFavorite: (String) -> Unit,
    modifier: Modifier = Modifier,
    onQuery: (String) -> Unit,
    onInstitute: (String) -> Unit,
    onCourse: (Int) -> Unit,
) {
    Column(modifier = modifier.fillMaxSize().padding(20.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("Группа", style = MaterialTheme.typography.headlineMedium)
        BasicTextField(value = picker.query, onValueChange = onQuery, modifier = Modifier.fillMaxWidth())
        LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            items(picker.institutes, key = { it }) { name ->
                Button(onClick = { onInstitute(name) }) { Text(name.take(28)) }
            }
        }
        val selectedInstitute = picker.institute
        if (selectedInstitute != null) {
            Text(selectedInstitute)
            LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                items(picker.courses, key = { it }) { year ->
                    Button(onClick = { onCourse(year) }) { Text(if (picker.course == year) "· $year" else year.toString()) }
                }
            }
        }
        LazyColumn(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            items(picker.shown, key = { it.code }) { group ->
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
    plans: List<PersonalPlan> = emptyList(),
    draft: PersonalDraft? = null,
    notice: String? = null,
    onNew: (PersonalEntryKind) -> Unit = {},
    onEditTask: (PersonalTask) -> Unit = {},
    onEditPlan: (PersonalPlan) -> Unit = {},
    onToggleTask: (PersonalTask) -> Unit = {},
    onDeleteTask: (String) -> Unit = {},
    onDeletePlan: (String) -> Unit = {},
    onDraft: (PersonalDraft) -> Unit = {},
    onSave: () -> Unit = {},
    onCancel: () -> Unit = {},
    onImport: () -> Unit = {},
    onExport: () -> Unit = {},
) {
    LazyColumn(modifier = modifier.fillMaxSize().padding(20.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        item(key = "heading") { Text("Личное", style = MaterialTheme.typography.headlineMedium) }
        item(key = "notes") { OutlinedTextField(value = notes, onValueChange = onNotes, label = { Text("Заметки") }, modifier = Modifier.fillMaxWidth(), minLines = 3) }
        item(key = "actions") {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = { onNew(PersonalEntryKind.Task) }) { Text("Задача") }
                Button(onClick = { onNew(PersonalEntryKind.Plan) }) { Text("План") }
            }
        }
        if (notice != null) item(key = "notice") { Text(notice) }
        if (draft != null) item(key = "editor") {
            PersonalEntryEditor(draft, onDraft, onSave, onCancel)
        }
        items(tasks, key = { "task:${it.id}" }) { task ->
            Column {
                Row {
                    Checkbox(checked = task.done, onCheckedChange = { onToggleTask(task) })
                    Column {
                        Text(task.title, textDecoration = if (task.done) TextDecoration.LineThrough else null)
                        Text("${task.date} ${if (task.kind == "homework") "Домашнее задание" else "Задача"}", style = MaterialTheme.typography.bodySmall)
                    }
                }
                Row {
                    TextButton(onClick = { onEditTask(task) }) { Text("Изменить") }
                    TextButton(onClick = { onDeleteTask(task.id) }) { Text("Удалить") }
                }
            }
        }
        items(plans, key = { "plan:${it.id}" }) { plan ->
            Column {
                Text(plan.title, textDecoration = if (plan.cancelled) TextDecoration.LineThrough else null)
                Text("${plan.date} · ${plan.start}–${plan.end} · ${plan.room}", style = MaterialTheme.typography.bodySmall)
                Row {
                    TextButton(onClick = { onEditPlan(plan) }) { Text("Изменить") }
                    TextButton(onClick = { onDeletePlan(plan.id) }) { Text("Удалить") }
                }
            }
        }
        item(key = "backup") {
            Row {
                TextButton(onClick = onImport) { Text("Импорт v4") }
                TextButton(onClick = onExport) { Text("Экспорт v4") }
            }
        }
    }
}

@Composable
private fun PersonalEntryEditor(draft: PersonalDraft, onChange: (PersonalDraft) -> Unit, onSave: () -> Unit, onCancel: () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        OutlinedTextField(draft.title, { onChange(draft.copy(title = it)) }, label = { Text("Название") }, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(draft.date, { onChange(draft.copy(date = it)) }, label = { Text("Дата ГГГГ-ММ-ДД") }, singleLine = true, modifier = Modifier.fillMaxWidth())
        if (draft.kind == PersonalEntryKind.Plan) {
            OutlinedTextField(draft.start, { onChange(draft.copy(start = it)) }, label = { Text("Начало ЧЧ:ММ") }, singleLine = true)
            OutlinedTextField(draft.end, { onChange(draft.copy(end = it)) }, label = { Text("Конец ЧЧ:ММ") }, singleLine = true)
            OutlinedTextField(draft.room, { onChange(draft.copy(room = it)) }, label = { Text("Место") })
            Row { Checkbox(draft.cancelled, { onChange(draft.copy(cancelled = it)) }); Text("Отменено") }
        } else {
            Row { Checkbox(draft.homework, { onChange(draft.copy(homework = it)) }); Text("Домашнее задание") }
        }
        Row {
            Button(onClick = onSave, enabled = draft.title.isNotBlank()) { Text("Сохранить") }
            TextButton(onClick = onCancel) { Text("Отмена") }
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
    onRegister: () -> Unit = onPasskey,
    onLogout: () -> Unit = {},
    busy: Boolean = false,
) {
    Column(modifier = modifier.fillMaxSize().padding(20.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("Настройки", style = MaterialTheme.typography.headlineMedium)
        Text(if (session.isNullOrBlank()) "Гость" else "Вы вошли. Права группы проверяет сервер.")
        Button(onClick = { onTheme(!oled) }) { Text(if (oled) "Светлая тема" else "Тёмная тема") }
        if (session.isNullOrBlank()) {
            Button(onClick = onPasskey, enabled = !busy) { Text("Войти с ключом доступа") }
            Button(onClick = onRegister, enabled = !busy) { Text("Создать ключ доступа") }
        } else {
            Button(onClick = onLogout, enabled = !busy) { Text("Выйти на этом устройстве") }
        }
        if (!notice.isNullOrBlank()) Text(notice)
    }
}

enum class HomeTab { Day, Groups, Notes, Campus, Settings }
