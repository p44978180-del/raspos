package ru.timacad.platform

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

@Composable
fun DayScreen(day: DayView, modifier: Modifier = Modifier) {
    MaterialTheme {
        Column(modifier = modifier.fillMaxSize().padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text("Платформа", style = MaterialTheme.typography.headlineMedium)
            Text(day.groupCode ?: "Группа не выбрана", style = MaterialTheme.typography.titleMedium)
            Text(day.date ?: "Нет сохранённого дня", style = MaterialTheme.typography.bodyMedium)
            LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                itemsIndexed(day.lessons) { _, lesson ->
                    Column {
                        Text("${lesson.startsAt}–${lesson.endsAt}  ${lesson.subject}")
                        Text("${lesson.teacher} · ${lesson.building} · ${lesson.room}", style = MaterialTheme.typography.bodySmall)
                    }
                }
            }
        }
    }
}
