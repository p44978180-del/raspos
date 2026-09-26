package ru.timacad.platform

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Button
import androidx.compose.material3.Text
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import app.cash.sqldelight.driver.android.AndroidSqliteDriver
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runBlocking
import ru.timacad.platform.db.PlatformDatabase
import uniffi.timacad_core.routeCampus
import kotlin.concurrent.thread

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
        val schedule = ScheduleRepository(database, driver)
        val personal = PersonalRepository(database)
        val transport = KtorSyncTransport()
        val worker = LiveSyncWorker(schedule, personal, transport) {
            refreshScheduleWidget(this@MainActivity)
        }
        thread(name = "timacad-sync") {
            val replica = schedule.replicaId()
            worker.bootstrap(replica, schedule.selectedGroup().orEmpty())
            worker.flushOutbox(replica)
            while (!isDestroyed) {
                try {
                    val scope = schedule.selectedGroup() ?: "catalog"
                    runBlocking { transport.listen(centrifugoChannel(scope)) { hint -> worker.onHint(hint) } }
                } catch (_: Throwable) {
                    Thread.sleep(worker.nextDelayMillis(0.5).coerceAtMost(30_000))
                }
            }
        }
        val route = try {
            routeCampus(demoTopology(), "101", "201")
        } catch (_: Throwable) {
            null
        }
        val routeLine = if (route == null) {
            CampusScheme.caption
        } else {
            routeCaption(route.found, route.floorChanges.toInt(), route.roomNames)
        }
        setContent {
            var oled by remember { mutableStateOf(false) }
            var tab by remember { mutableStateOf(HomeTab.Day) }
            var subgroup by remember { mutableIntStateOf(0) }
            var notice by remember { mutableStateOf<String?>(null) }
            var session by remember { mutableStateOf(KeystoreVault(this).load()) }
            var group by remember { mutableStateOf(schedule.selectedGroup()) }
            var favoriteTick by remember { mutableIntStateOf(0) }
            val opened = schedule.day(group, null)
            var date by remember(group) { mutableStateOf(opened.date) }
            val shownGroup = group
            val shownDate = date
            val rows by produceState(composeDayRows(opened.lessons, shownGroup?.let(schedule::publishedChanges).orEmpty(), subgroup), shownGroup, shownDate, subgroup) {
                if (shownGroup != null && shownDate != null) {
                    schedule.watchDay(shownGroup, shownDate, subgroup, Dispatchers.Default).collect { value = it }
                }
            }
            TimTheme(oled) {
                Column(Modifier.fillMaxSize()) {
                    when (tab) {
                        HomeTab.Day -> DayScheduleScreen(rows, group, date, subgroup, { subgroup = it }, { direction ->
                            val dates = group?.let(schedule::dates).orEmpty()
                            val index = dates.indexOf(date).coerceAtLeast(0)
                            date = dates.getOrNull(index + direction) ?: date
                        }, Modifier.weight(1f))
                        HomeTab.Groups -> GroupPickerScreen(schedule.allGroups(), if (favoriteTick >= 0) schedule.favorites() else emptySet(), {
                            schedule.select(it)
                            group = it
                            thread(name = "timacad-group") { worker.bootstrap(schedule.replicaId(), it) }
                            tab = HomeTab.Day
                        }, {
                            schedule.rememberFavorite(it)
                            favoriteTick += 1
                        }, Modifier.weight(1f))
                        HomeTab.Notes -> PersonalNotesScreen(personal.notes(), personal.tasks(), { personal.saveNotes(it) }, Modifier.weight(1f))
                        HomeTab.Campus -> Column(Modifier.weight(1f)) {
                            CampusSchemeScreen(listOf("Корпус 2", "101", "102", "201", "Лестница"))
                            Text(routeLine)
                            CampusMap()
                        }
                        HomeTab.Settings -> SettingsScreen(oled, session, notice, { oled = it }, {
                            if (elderGate("lesson_change", session) == ElderGate.NeedsElder || session.isNullOrBlank()) {
                                thread(name = "timacad-passkey") {
                                    val outcome = PasskeyClient(KtorPasskeyHttp(), AndroidPasskeyPrompt(this@MainActivity), KeystoreVault(this@MainActivity)).register("Староста")
                                    runOnUiThread {
                                        when (outcome) {
                                            is PasskeyOutcome.Session -> {
                                                session = outcome.token
                                                notice = "Сессия старосты записана в Keystore"
                                            }
                                            is PasskeyOutcome.Quiet -> notice = outcome.detail
                                        }
                                    }
                                }
                            }
                        }, Modifier.weight(1f))
                    }
                    Row {
                        HomeTab.entries.forEach { item ->
                            Button(onClick = { tab = item }) { Text(item.name) }
                        }
                    }
                }
            }
        }
    }
}
