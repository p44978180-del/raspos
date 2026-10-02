package ru.timacad.platform

import android.os.SystemClock
import android.os.Trace
import android.util.Log

internal inline fun <T> startupSpan(name: String, block: () -> T): T {
    val start = SystemClock.elapsedRealtimeNanos()
    Trace.beginSection("TimStartup:$name")
    Log.i("TimStartup", "stage=${name}_begin uptime_us=${start / 1_000} thread=${Thread.currentThread().name}")
    return try { block() } finally {
        Log.i("TimStartup", "stage=${name}_end duration_us=${(SystemClock.elapsedRealtimeNanos() - start) / 1_000}")
        Trace.endSection()
    }
}
