package ru.timacad.platform

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.ui.Modifier
import app.cash.sqldelight.driver.android.AndroidSqliteDriver
import ru.timacad.platform.db.PlatformDatabase

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val driver = AndroidSqliteDriver(PlatformDatabase.Schema, applicationContext, "platform.db")
        val database = PlatformDatabase(driver)
        val store = PlatformStore(database)
        store.ensureSeeded()
        if (intent.getBooleanExtra("pin_widget", false)) {
            val widgets = AppWidgetManager.getInstance(this)
            if (widgets.isRequestPinAppWidgetSupported) {
                widgets.requestPinAppWidget(ComponentName(this, ScheduleGlanceWidgetReceiver::class.java), null, null)
            }
        }
        val schedule = ScheduleRepository(database)
        val day = schedule.day(schedule.selectedGroup(), null)
        setContent {
            Column(Modifier.fillMaxSize()) {
                DayScreen(day, Modifier.weight(1f))
                CampusSchemeScreen(listOf("Корпус 2", "101", "102", "201", "Лестница"))
                CampusMap()
            }
        }
    }
}
