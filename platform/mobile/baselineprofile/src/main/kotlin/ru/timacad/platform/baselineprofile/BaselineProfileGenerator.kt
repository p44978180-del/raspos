package ru.timacad.platform.baselineprofile

import androidx.benchmark.macro.junit4.BaselineProfileRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.filters.LargeTest
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
@LargeTest
class BaselineProfileGenerator {
    @get:Rule val rule = BaselineProfileRule()

    @Test
    fun cachedStartup() = rule.collect(
        packageName = APP_PACKAGE,
        includeInStartupProfile = true,
        maxIterations = 5,
    ) {
        pressHome()
        startActivityAndWait()
        device.waitForSchedule()
    }

    @Test
    fun groupPickerToDay() = rule.collect(
        packageName = APP_PACKAGE,
        includeInStartupProfile = false,
        maxIterations = 5,
    ) {
        pressHome()
        startActivityAndWait()
        device.waitForSchedule()
        device.pickGroupAndOpenDay()
    }
}
