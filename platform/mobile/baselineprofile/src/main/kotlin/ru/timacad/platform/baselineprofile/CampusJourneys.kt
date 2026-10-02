package ru.timacad.platform.baselineprofile

import androidx.test.uiautomator.By
import androidx.test.uiautomator.UiDevice
import androidx.test.uiautomator.Until

internal const val APP_PACKAGE = "ru.timacad.platform"

internal fun UiDevice.waitForSchedule() {
    check(wait(Until.hasObject(By.res("day_schedule_list")), 30_000)) { "Day schedule did not open" }
    check(wait(Until.hasObject(By.text("Источник расписания")), 30_000)) { "Cached lesson rows were not displayed" }
}

internal fun UiDevice.pickGroupAndOpenDay() {
    requireNotNull(wait(Until.findObject(By.res("nav_groups")), 10_000)).click()
    val search = requireNotNull(wait(Until.findObject(By.res("group_search")), 10_000))
    search.click()
    waitForIdle()
    search.text = "01-24"
    waitForIdle()
    pressBack()
    requireNotNull(wait(Until.findObject(By.text("ДА 01-24")), 15_000)).click()
    waitForSchedule()
}
