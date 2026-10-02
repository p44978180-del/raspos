package ru.timacad.platform

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.glance.appwidget.updateAll
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
            val driver = platformDriver(context)
            try {
                val database = PlatformDatabase(driver)
                val repository = ScheduleRepository(database, driver)
                val transport = KtorSyncTransport()
                try {
                val pump = HintPump(
                    repository = repository,
                    pull = SyncPull { collection, scopeId, since ->
                        try {
                            transport.pull(collection, scopeId, since)
                        } catch (_: Throwable) {
                            emptyList()
                        }
                    },
                    clock = { System.currentTimeMillis() },
                    onReset = {
                        val group = repository.selectedGroup().orEmpty()
                        applyBootstrapBundle(repository, transport.bootstrap(repository.replicaId(), group), group)
                    },
                    onWidget = { runBlocking { ScheduleGlanceWidget().updateAll(context) } },
                )
                deliverHintInline(hint, pump, ::finish)
                } finally { transport.close() }
            } catch (_: Exception) {
                // Preserve the cached bundle and let a later hint or connection retry.
            } finally {
                driver.close()
                finish()
            }
        }
    }
}
