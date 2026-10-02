package ru.timacad.platform

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.os.Bundle
import android.os.Build
import android.os.SystemClock
import android.util.Log
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
import androidx.compose.runtime.LaunchedEffect
import android.view.ViewTreeObserver
import androidx.compose.animation.core.spring
import com.arkivanov.decompose.defaultComponentContext
import com.arkivanov.decompose.extensions.compose.subscribeAsState
import com.arkivanov.decompose.extensions.compose.stack.Children
import com.arkivanov.decompose.extensions.compose.stack.animation.fade
import com.arkivanov.decompose.extensions.compose.stack.animation.stackAnimation
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.testTagsAsResourceId
import app.cash.sqldelight.db.SqlDriver
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume
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

    override fun onCreate(savedInstanceState: Bundle?) = startupSpan("activity_create") {
        val activityStarted = SystemClock.elapsedRealtimeNanos()
        fun stage(name: String) { Log.i("TimStartup", "stage=$name activity_us=${(SystemClock.elapsedRealtimeNanos() - activityStarted) / 1_000} uptime_us=${SystemClock.elapsedRealtimeNanos() / 1_000}") }
        super.onCreate(savedInstanceState)
        stage("super")
        driver = platformDriver(applicationContext)
        val database = PlatformDatabase(driver)
        stage("database")
        controller = PlatformController(this, ScheduleRepository(database, driver),
            { PersonalRepository(database, NativePersonalEngine()) }) { driver.close() }
        stage("store")
        val root = PlatformRoot(defaultComponentContext())
        stage("navigation")
        if (intent.getBooleanExtra("pin_widget", false)) {
            val widgets = AppWidgetManager.getInstance(this)
            if (widgets.isRequestPinAppWidgetSupported) {
                widgets.requestPinAppWidget(ComponentName(this, ScheduleGlanceWidgetReceiver::class.java), null, null)
            }
        }
        setContent {
            val state by controller.view.collectAsState()
            val stack by root.stack.subscribeAsState()
            LaunchedEffect(state.localContentReady) {
                if (state.localContentReady) {
                    awaitDrawnFrame()
                    stage("local_content_frame")
                    reportFullyDrawn()
                    controller.onContentDrawn()
                }
            }
            TimTheme(state.oled) {
                Column(Modifier.fillMaxSize().safeDrawingPadding().semantics { testTagsAsResourceId = true }) {
                    Children(root.stack, Modifier.weight(1f), animation = stackAnimation(fade(spring(stiffness = 400f, dampingRatio = 0.8f)))) { child ->
                    when (child.instance.tab) {
                        HomeTab.Day -> DayScheduleScreen(state.rows, state.group, state.date, state.subgroup,
                            controller::subgroup, controller::swipe, Modifier.fillMaxSize())
                        HomeTab.Groups -> GroupPickerScreen(state.picker, state.favorites, {
                            controller.select(it); root.select(HomeTab.Day)
                        }, controller::favorite, Modifier.fillMaxSize(), controller::query, controller::institute, controller::course)
                        HomeTab.Notes -> if (!state.personalContentReady) Text("Загружаем личные записи…") else PersonalNotesScreen(state.notes, state.tasks, controller::notes, Modifier.fillMaxSize(),
                            plans = state.plans, draft = state.draft, notice = state.personalNotice,
                            onNew = controller::newPersonal, onEditTask = controller::editTask, onEditPlan = controller::editPlan,
                            onToggleTask = controller::toggleTask, onDeleteTask = controller::deleteTask, onDeletePlan = controller::deletePlan,
                            onDraft = controller::draft, onSave = controller::savePersonal, onCancel = controller::cancelPersonal,
                            onImport = { importDocument.launch(arrayOf("application/json", "text/plain")) },
                            onExport = { exportDocument.launch("tim-backup-v4.json") })
                        HomeTab.Campus -> CampusSchemeScreen(state.campus, controller::campusEndpoint, Modifier.fillMaxSize()) { view, modifier -> CampusMap(view, modifier) }
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
                                modifier = Modifier.testTag("nav_${item.name.lowercase()}"),
                                icon = { Text(label.take(1)) }, label = { Text(label) })
                        }
                    }
                }
            }
        }
        stage("set_content")
    }

    override fun onDestroy() {
        work.cancel()
        controller.close()
        super.onDestroy()
    }

    // Frame commit happens after render submission, unlike a vsync callback.
    private suspend fun awaitDrawnFrame() = suspendCancellableCoroutine<Unit> { continuation ->
        val view = window.decorView
        val observer = view.viewTreeObserver
        if (Build.VERSION.SDK_INT >= 29 && view.isHardwareAccelerated) {
            val callback = Runnable { view.post { if (continuation.isActive) continuation.resume(Unit) } }
            observer.registerFrameCommitCallback(callback)
            continuation.invokeOnCancellation { view.post { if (observer.isAlive) observer.unregisterFrameCommitCallback(callback) } }
        } else {
            val listener = object : ViewTreeObserver.OnDrawListener {
                override fun onDraw() { view.post {
                    if (observer.isAlive) observer.removeOnDrawListener(this)
                    if (continuation.isActive) continuation.resume(Unit)
                } }
            }
            observer.addOnDrawListener(listener)
            continuation.invokeOnCancellation { view.post { if (observer.isAlive) observer.removeOnDrawListener(listener) } }
        }
        view.invalidate()
    }
}
