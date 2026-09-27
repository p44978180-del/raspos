package ru.timacad.platform

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Text
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import app.cash.sqldelight.db.SqlDriver
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.Job
import kotlinx.coroutines.cancel
import ru.timacad.platform.db.PlatformDatabase

class MainActivity : ComponentActivity() {
    private val work = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private lateinit var controller: PlatformController
    private lateinit var driver: SqlDriver

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        driver = platformDriver(applicationContext)
        val database = PlatformDatabase(driver)
        controller = PlatformController(this, ScheduleRepository(database, driver), PersonalRepository(database), work)
        if (intent.getBooleanExtra("pin_widget", false)) {
            val widgets = AppWidgetManager.getInstance(this)
            if (widgets.isRequestPinAppWidgetSupported) {
                widgets.requestPinAppWidget(ComponentName(this, ScheduleGlanceWidgetReceiver::class.java), null, null)
            }
        }
        setContent {
            val state by controller.view.collectAsState()
            var oled by remember { mutableStateOf(false) }
            var tab by remember { mutableStateOf(HomeTab.Day) }
            TimTheme(oled) {
                Column(Modifier.fillMaxSize()) {
                    when (tab) {
                        HomeTab.Day -> DayScheduleScreen(state.rows, state.group, state.date, state.subgroup,
                            controller::subgroup, controller::swipe, Modifier.weight(1f))
                        HomeTab.Groups -> GroupPickerScreen(state.picker, state.favorites, {
                            controller.select(it); tab = HomeTab.Day
                        }, controller::favorite, Modifier.weight(1f), controller::query, controller::institute, controller::course)
                        HomeTab.Notes -> PersonalNotesScreen(state.notes, state.tasks, controller::notes, Modifier.weight(1f))
                        HomeTab.Campus -> Column(Modifier.weight(1f)) {
                            Text("Схема территории")
                            CampusMap()
                        }
                        HomeTab.Settings -> SettingsScreen(oled, state.session, state.notice, { oled = it },
                            { controller.authenticate(false) }, Modifier.weight(1f),
                            onRegister = { controller.authenticate(true) }, onLogout = controller::logout,
                            busy = state.authenticating)
                    }
                    NavigationBar {
                        HomeTab.entries.forEach { item ->
                            val label = when (item) {
                                HomeTab.Day -> "День"
                                HomeTab.Groups -> "Группа"
                                HomeTab.Notes -> "Личное"
                                HomeTab.Campus -> "Кампус"
                                HomeTab.Settings -> "Настройки"
                            }
                            NavigationBarItem(selected = tab == item, onClick = { tab = item },
                                icon = { Text(label.take(1)) }, label = { Text(label) })
                        }
                    }
                }
            }
        }
    }

    override fun onDestroy() {
        work.cancel()
        controller.close()
        // Queries may still be unwinding after cancellation; close only once all
        // activity-owned work has completed.
        work.coroutineContext[Job]?.invokeOnCompletion { driver.close() }
        super.onDestroy()
    }
}
