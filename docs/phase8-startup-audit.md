# Cached startup audit on TECNO AD8

The startup change is commit `9a3925fa1247ae3625f88722ec5378bddcb8c554` on `phase-8`. The physical ARM64 TECNO AD8 (API 34) displayed real cached lessons in all ten offline process-cold launches. Campus decoding/native routing, personal repository preparation and network transport/Bootstrap began on IO after the cached content frame was submitted. FTS5 warm-up began 2001.316–2002.731 ms after that marker. All 47 JVM tests passed, and the signed APK/AAB build passed with R8 and resource shrinking.

The audit found work that could compete with initial rendering: startup loaded the full directory/calendar and scheduled campus, personal and network preparation before a drawn-content acknowledgement. The new first read selects today's cached lessons, falling back to the earliest cached day, without loading all 805 group models or the full calendar. It also reads published lesson changes and projects the rows, preserving cancellations/transfers. The theme preference is read on IO. This is one day query plus the required changes query, rather than literally one SQLite row.

`StartupWorkGate` releases preparation after a hardware frame-commit callback. A separate job waits another two seconds before running the bound prefix FTS query `MATCH '"ДА"*' LIMIT 1` on IO under the database mutex. It does not change the visible filter. The callback means the frame was submitted to the swapchain; it does not prove the instant pixels reached the display. API 26–28 use the after-draw fallback, covered by source review but not this API 34 hardware run. See the [Android frame callback contract](https://developer.android.com/reference/android/view/ViewTreeObserver).

WorkManager's automatic initializer was removed while retaining `Application`'s `Configuration.Provider` for Glance's later demand. ProfileInstaller, Lifecycle and Emoji startup providers remain; this is not a claim that every framework millisecond disappeared. The [official WorkManager configuration contract](https://developer.android.com/develop/background-work/background-tasks/persistent/configuration/custom-configuration) supports this initialization path. A new widget-update runtime test was not part of this audit.

## Measurements and their limits

The phone retained its real cache: selected group **ДЭ 17-26**, 116 lessons, fallback day 2026-09-14, four visible source links. It currently used guest mode; reinstalling the original tagged APK with data retained also showed guest mode before the audit. These runs do not repeat or replace the historical fingerprint/session-restoration proof. Battery was 31%, temperature about 30°C. Airplane mode and Wi-Fi were restored to their original values after measurements.

| ART mode | First-window times, ms (`am start -W`) | Median, ms |
|---|---|---:|
| Compilation reset | 190, 166, 163, 160, 168 | 166 |
| Installed Baseline Profile, `speed-profile` | 149, 198, 145, 170, 162 | 162 |

Each launch was reported `COLD`; filesystem/kernel caches were not cleared. ProfileInstaller returned result 1 and ARM64 ART reported `speed-profile`. Existing, genuinely generated rules from `5da5c2` were repackaged for this build; no fresh profile generation is claimed. These shell runs are diagnostics, not a successful Macrobenchmark run. The earlier OEM freezer limitation remains.

First-window time differs from the committed cached schedule marker. With AOT, Activity entry to that marker was 104.540–123.340 ms. Two usable Perfetto captures measured launch to committed cached content at **185.131 and 186.227 ms**, versus first-window durations of 169.421 and 168.461 ms. Traced values are excluded from benchmark medians. The group, authentication state, frame marker and hardware state differ from the historical accepted 158 ms run, so this is not a controlled before/after comparison against it.

| Diagnostic span, usable Perfetto captures | Capture 2, ms | Capture 3, ms |
|---|---:|---:|
| System `startProc` | 2.755 | 1.527 |
| `bindApplication` | 17.822 | 18.242 |
| Instrumented `Application.onCreate` | 0.036 | 0.034 |
| Instrumented `Activity.onCreate` | 9.006 | 9.550 |
| Cached day/changes/projection on IO | 10.414 | 9.006 |

The system spans overlap other initialization; they must not be summed as an independent startup budget. `startProc` is the named system span, not a pure Zygote fork measurement. These traces therefore **do not support attributing 50 ms exclusively to Zygote**, or claiming zero unnecessary milliseconds. The app's three requested background subsystems are absent before the committed cached frame in both timestamp logs and the usable app traces.

Perfetto's first capture lacked app spans and was discarded for attribution. Captures 2/3 contained 380/397 OEM systrace parse failures; their app span times agree with the monotonic app logs. The raw phone-wide traces remain private in `.cache`; only app summaries and app-tag logs are exported. Analysis follows the [official Android startup modules](https://perfetto.dev/docs/getting-started/android-trace-analysis).

A real picker smoke test after warm-up typed `17` and returned matching groups. The intermediate broad prefix `1` returned 99 matches in **4.216 ms**; `17` returned nine matches in **0.903 ms**. This single run does not establish a universal first-key ≤1 ms or ≤3 ms guarantee. The historical accepted 0.7–1.4 ms warm results remain a separate measurement.

The original ≤100 ms target is still unmet. The user's earlier acceptance of 158 ms for the TECNO hardware profile remains recorded in the original release ledger. This audit does not turn that observation into a guarantee for every launch or predict flagship-device results.

## Artifacts and evidence

| New audit artifact | Bytes | SHA-256 |
|---|---:|---|
| APK | 39,879,073 | `ab692cd23eba6de47e5560cb21e4556de776bdaa5e82c92ccd88ed1acd862d3d` |
| AAB | 22,387,614 | `03183389b0e12bf9d84a4bc671679830eda3d8a76b87a71916241d527da4ac6e` |

Local copies are in `releases/startup-audit-9a3925f/`. Both contain ARM64/x86_64 native code and the binary Baseline Profile (12,325 bytes; metadata 480 bytes). APK V2/V3 signatures, 16 KiB ZIP alignment and the AAB's 1,489 signed entries were verified. All ten native ELF entries in each artifact byte-match the previously directly verified `0x4000` references. The release certificate is unchanged. The user-supplied temporary HTTPS API/RP remains `plain-sites-matter.loca.lt`.

At audit completion the original `v8.0.0-platform` tag and APK/AAB were preserved. The user subsequently accepted this audit in full and explicitly requested retargeting the tag to `9a3925fa1247ae3625f88722ec5378bddcb8c554` and publishing these audited artifacts; [the release ledger](phase8-release.md) records the final closure. The older artifacts remain archived. Both `iosApp` and `widgetkit` passed for the audited source commit in [run 37074361609](https://github.com/p44978180-del/raspos/actions/runs/37074361609).

[Structured verification](evidence/phase8-startup-audit.json), [all ten samples](evidence/phase8-startup-audit-samples.json), [app-only timestamp logs](evidence/phase8-startup-audit.log), [Perfetto SQL](evidence/phase8-startup-audit-query.sql), [successful release build](evidence/phase8-startup-audit-build.log), [original release ledger](phase8-release.md).
