package ru.timacad.platform

import android.app.Application
import androidx.work.Configuration

/** Glance requests WorkManager when needed; its provider does no work at startup. */
class PlatformApplication : Application(), Configuration.Provider {
    override fun onCreate() = startupSpan("application_create") { super.onCreate() }
    override fun getWorkManagerConfiguration(): Configuration = startupSpan("work_manager_config") {
        Configuration.Builder().build()
    }
}
