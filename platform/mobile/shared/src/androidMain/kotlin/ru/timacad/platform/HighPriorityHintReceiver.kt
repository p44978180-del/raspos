package ru.timacad.platform

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.glance.appwidget.updateAll
import app.cash.sqldelight.driver.android.AndroidSqliteDriver
import kotlinx.coroutines.runBlocking
import ru.timacad.platform.db.PlatformDatabase
import kotlin.concurrent.thread

class HighPriorityHintReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val pending = goAsync()
        val hint = ScheduleHint(
            collection = intent.getStringExtra("collection").orEmpty(),
            scopeId = intent.getStringExtra("scope_id").orEmpty(),
            lsn = intent.getLongExtra("lsn", 0),
        )
        thread(name = "timacad-hint") {
            var finished = false
            fun finish() {
                if (!finished) {
                    finished = true
                    pending.finish()
                }
            }
            val driver = AndroidSqliteDriver(PlatformDatabase.Schema, context, "platform.db")
            try {
                val repository = ScheduleRepository(PlatformDatabase(driver))
                val pump = HintPump(
                    repository = repository,
                    pull = OfflineSyncPull,
                    clock = { System.currentTimeMillis() },
                    onWidget = { runBlocking { ScheduleGlanceWidget().updateAll(context) } },
                )
                deliverHintInline(hint, pump, ::finish)
            } finally {
                driver.close()
                finish()
            }
        }
    }
}
