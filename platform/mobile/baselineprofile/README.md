# Baseline Profile

This producer captures real cached schedule startup and the GroupPicker → DaySchedule journey. It does not seed synthetic lessons. Install the non-minified app, let its real Bootstrap finish, then disable networking before collecting the offline profile. Use a dedicated API 33+ emulator or test device; collection resets compilation state and stops the app repeatedly.

`android.injected.androidTest.leaveApksInstalledAfterRun=true` keeps both APKs installed after connected tests, including failed runs. AGP's default teardown uninstalls the target and deletes its SQLite cache and Keystore session. Keep this setting enabled while collecting profiles or measuring cached startup; remove test packages manually only after the device's acceptance checks are complete.

```powershell
./gradlew.bat :androidApp:assembleNonMinifiedRelease :baselineprofile:assembleNonMinifiedRelease
# Install androidApp/build/outputs/apk/nonMinifiedRelease/androidApp-nonMinifiedRelease.apk.
# Open the app and wait for the 805-group Bootstrap and cached schedule.
$env:ANDROID_SERIAL = "emulator-5556" # Select only the dedicated test device.
./gradlew.bat :androidApp:generateBaselineProfile
./gradlew.bat :androidApp:assembleRelease :androidApp:bundleRelease
```

Generated rules are saved under `androidApp/src/main/generated/baselineProfiles` and must be committed. Release assembly consumes those rules without needing a connected device. `ProfileInstaller` handles installation of the packaged ART profile.

`StartupBenchmarks` compares `CompilationMode.None` with `Partial(BaselineProfileMode.Require)` and measures both first display and fully drawn cached content. Run on a physical device for performance acceptance. Emulator results remain diagnostic; suppress only the EMULATOR check explicitly when collecting those diagnostics.

```powershell
# Preserve the selected device's cached data; the signed target uses the release certificate.
./gradlew.bat :baselineprofile:connectedBenchmarkReleaseAndroidTest `
  -Pandroid.testInstrumentationRunnerArguments.class=ru.timacad.platform.baselineprofile.StartupBenchmarks
```

The Android test selectors are stable resource tags; screen titles and pixel coordinates do not control navigation.

[Android generation guide](https://developer.android.com/topic/performance/baselineprofiles/create-baselineprofile), [Gradle configuration](https://developer.android.com/topic/performance/baselineprofiles/configure-baselineprofiles).
