# v8.0.0-platform

Phase 8 was accepted on 3 October 2026 after installing the signed release on a physical ARM64 TECNO AD8 (Android API 34), completing real fingerprint registration and login over trusted HTTPS, and restoring the saved Android Keystore session after process replacement. Real imported lessons and the native 5,392-node campus graph were verified on the phone.

The APK/AAB include generated Baseline Profile rules for cached startup and GroupPicker → DaySchedule. ProfileInstaller succeeded and ART compiled the ARM64 profile. Five cached offline cold launches measured 156–166 ms to the first window, median 158 ms, compared with 168 ms after compilation reset. The user explicitly accepted 158 ms for this TECNO; the original 100 ms target was not met. These shell measurements verify cached content in every process and are not a successful Macrobenchmark run: the OEM froze its test helper.

| Signed artifact | Bytes | SHA-256 |
|---|---:|---|
| APK | 39,879,093 | `e861c262f5abf8251e98ccaa574a37223a28d5df8346fca09fdb39ba4247e24a` |
| AAB | 22,372,100 | `2c82ac178d7a3f527f0330340913eb198b7a0cd765b3280bf808729da413c47d` |

The candidate's application source is commit `5da5c283435d1014a275c7d01055b3d9ed64f9d0`; later test-retention and evidence changes do not alter these already installed artifacts. They contain ARM64 and x86_64 libraries with verified 16 KiB alignment, R8/resource shrinking, and binary ART profiles. APK V2/V3 signatures and the AAB JAR signature were verified. All 44 mobile JVM tests passed, and both iOS jobs passed in [run 37034004294](https://github.com/p44978180-del/raspos/actions/runs/37034004294).

These artifacts use the user-supplied temporary acceptance origin `https://plain-sites-matter.loca.lt`. A permanent deployment requires a configured stable HTTPS API/RP, matching Digital Asset Links, and a new build. The temporary origin is not claimed as a permanent production service.

The canonical fixture is 805 groups / 47,068 lessons. Windows-emulator cold-start/FTS outliers and physical 120 Hz profiling were handled by the user's earlier acceptance decisions. Live account sync after compaction, universal device performance, and the interrupted security scan remain follow-up evidence gaps; no clean security verdict is claimed.

[Acceptance ledger](phase8-acceptance.md), [release verification](evidence/phase8-final-release-verification.json), [ARM64 installation](evidence/phase8-arm64-install.log), [native startup](evidence/phase8-arm64-runtime.log), [Keystore restoration](evidence/phase8-keystore-restoration.log), [startup samples](evidence/phase8-arm64-startup-samples.json).
