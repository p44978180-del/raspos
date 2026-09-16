package ru.timacad.raspos.activitykit

// Expect/Actual or Objective-C export bridge for Swift ActivityKit & WidgetKit
class LiveActivityBridge {
    fun startLiveActivity(
        subject: String,
        room: String,
        building: String,
        startTime: String,
        minutesUntil: Int
    ) {
        // Calls native Swift ActivityKit Activity<ScheduleAttributes>.request(...)
    }

    fun updateLiveActivity(minutesUntil: Int, isCurrent: Boolean) {
        // Updates Dynamic Island expanded & compact leading/trailing views
    }

    fun endLiveActivity() {
        // Ends Live Activity when class concludes
    }
}
