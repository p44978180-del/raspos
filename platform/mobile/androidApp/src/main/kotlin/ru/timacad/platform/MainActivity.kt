package ru.timacad.platform

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Text
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.animation.core.spring
import com.arkivanov.decompose.defaultComponentContext
import com.arkivanov.decompose.extensions.compose.subscribeAsState
import com.arkivanov.decompose.extensions.compose.stack.Children
import com.arkivanov.decompose.extensions.compose.stack.animation.fade
import com.arkivanov.decompose.extensions.compose.stack.animation.stackAnimation
import androidx.compose.ui.Modifier
import app.cash.sqldelight.db.SqlDriver
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import ru.timacad.platform.db.PlatformDatabase

class MainActivity : ComponentActivity() {
    private val work = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private lateinit var controller: PlatformController
    private lateinit var driver: SqlDriver
    private val importDocument = registerForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) controller.importBackup {
            contentResolver.openInputStream(uri).use { input ->
                requireNotNull(input)
                val output = java.io.ByteArrayOutputStream()
                val buffer = ByteArray(8192)
                while (true) {
                    val count = input.read(buffer)
                    if (count < 0) break
                    require(output.size() + count <= 8 * 1024 * 1024) { "Backup exceeds 8 MiB" }
                    output.write(buffer, 0, count)
                }
                output.toByteArray().decodeToString(throwOnInvalidSequence = true)
            }
        }
    }
    private val exportDocument = registerForActivityResult(ActivityResultContracts.CreateDocument("application/json")) { uri ->
        if (uri != null) controller.exportBackup { json -> work.launch {
            val message = try {
                contentResolver.openOutputStream(uri, "wt").use { output ->
                    requireNotNull(output).write(json.encodeToByteArray())
                }
                "Резервная копия сохранена"
            } catch (_: Exception) { "Не удалось сохранить файл" }
            withContext(Dispatchers.Main) { android.widget.Toast.makeText(this@MainActivity, message, android.widget.Toast.LENGTH_LONG).show() }
        } }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        driver = platformDriver(applicationContext)
        val database = PlatformDatabase(driver)
        controller = PlatformController(this, ScheduleRepository(database, driver), PersonalRepository(database, NativePersonalEngine())) { driver.close() }
        val root = PlatformRoot(defaultComponentContext())
        if (intent.getBooleanExtra("pin_widget", false)) {
            val widgets = AppWidgetManager.getInstance(this)
            if (widgets.isRequestPinAppWidgetSupported) {
                widgets.requestPinAppWidget(ComponentName(this, ScheduleGlanceWidgetReceiver::class.java), null, null)
            }
        }
        setContent {
            val state by controller.view.collectAsState()
            val stack by root.stack.subscribeAsState()
            TimTheme(state.oled) {
                Column(Modifier.fillMaxSize().safeDrawingPadding()) {
                    Children(root.stack, Modifier.weight(1f), animation = stackAnimation(fade(spring(stiffness = 400f, dampingRatio = 0.8f)))) { child ->
                    when (child.instance.tab) {
                        HomeTab.Day -> DayScheduleScreen(state.rows, state.group, state.date, state.subgroup,
                            controller::subgroup, controller::swipe, Modifier.fillMaxSize())
                        HomeTab.Groups -> GroupPickerScreen(state.picker, state.favorites, {
                            controller.select(it); root.select(HomeTab.Day)
                        }, controller::favorite, Modifier.fillMaxSize(), controller::query, controller::institute, controller::course)
                        HomeTab.Notes -> PersonalNotesScreen(state.notes, state.tasks, controller::notes, Modifier.fillMaxSize(),
                            plans = state.plans, draft = state.draft, notice = state.personalNotice,
                            onNew = controller::newPersonal, onEditTask = controller::editTask, onEditPlan = controller::editPlan,
                            onToggleTask = controller::toggleTask, onDeleteTask = controller::deleteTask, onDeletePlan = controller::deletePlan,
                            onDraft = controller::draft, onSave = controller::savePersonal, onCancel = controller::cancelPersonal,
                            onImport = { importDocument.launch(arrayOf("application/json", "text/plain")) },
                            onExport = { exportDocument.launch("tim-backup-v4.json") })
                        HomeTab.Campus -> Column(Modifier.fillMaxSize()) {
                            Text("Схема территории")
                            CampusMap()
                        }
                        HomeTab.Settings -> SettingsScreen(state.oled, state.session, state.notice, controller::theme,
                            { controller.authenticate(false) }, Modifier.fillMaxSize(),
                            onRegister = { controller.authenticate(true) }, onLogout = controller::logout,
                            busy = state.authenticating)
                    }
                    }
                    NavigationBar(containerColor = MaterialTheme.colorScheme.background) {
                        HomeTab.entries.forEach { item ->
                            val label = when (item) {
                                HomeTab.Day -> "День"
                                HomeTab.Groups -> "Группа"
                                HomeTab.Notes -> "Личное"
                                HomeTab.Campus -> "Кампус"
                                HomeTab.Settings -> "Настройки"
                            }
                            NavigationBarItem(selected = stack.active.instance.tab == item, onClick = { root.select(item) },
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
        super.onDestroy()
    }
}
