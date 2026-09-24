package ru.timacad.platform

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.dp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.provideContent
import androidx.glance.layout.Column
import androidx.glance.layout.padding
import androidx.glance.text.Text
import androidx.glance.text.TextDecoration
import androidx.glance.text.TextStyle
import app.cash.sqldelight.driver.android.AndroidSqliteDriver
import ru.timacad.platform.db.PlatformDatabase
import java.time.LocalDate
import java.time.LocalTime

class ScheduleGlanceWidget : GlanceAppWidget() {
    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val face = readWidgetFace(context)
        provideContent { ScheduleFace(face) }
    }
}

class ScheduleGlanceWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = ScheduleGlanceWidget()
}

@Composable
fun ScheduleFace(face: WidgetFace) {
    Column(modifier = GlanceModifier.padding(12.dp)) {
        Text(face.phase)
        Text(face.headline)
        if (face.mark == LessonMark.Cancelled) {
            Text("Отменена", style = TextStyle(textDecoration = TextDecoration.LineThrough))
        }
        if (face.mark == LessonMark.Moved) {
            Text("Перенос")
        }
        Text("${face.building} · ${face.room}")
        Text(formatCountdown(face.countdownSeconds))
    }
}

fun readWidgetFace(context: Context): WidgetFace {
    val driver = AndroidSqliteDriver(PlatformDatabase.Schema, context, "platform.db")
    return try {
        val repository = ScheduleRepository(PlatformDatabase(driver))
        val group = repository.selectedGroup() ?: return WidgetFace("Пар нет", "день", "", "", 0, LessonMark.AsScheduled)
        val now = LocalTime.now()
        val day = repository.day(group, LocalDate.now().toString())
        projectWidget(day.lessons, repository.publishedChanges(group), now.hour * 60 + now.minute)
    } finally {
        driver.close()
    }
}
