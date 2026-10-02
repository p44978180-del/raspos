# v8.0.0-platform — Phase 8 closed

Phase 8 was fully closed by the user's final acceptance on **3 October 2026**. The published [GitHub Release](https://github.com/p44978180-del/raspos/releases/tag/v8.0.0-platform) uses audited source commit **`9a3925fa1247ae3625f88722ec5378bddcb8c554`**. The user explicitly requested moving the previously published tag from `8179febff3f4257cc53cdde14e4c982f5a8a8d57` to this exact audited commit and attaching its verified APK/AAB.

| Published signed artifact | Bytes | SHA-256 |
|---|---:|---|
| APK | 39,879,073 | `ab692cd23eba6de47e5560cb21e4556de776bdaa5e82c92ccd88ed1acd862d3d` |
| AAB | 22,387,614 | `03183389b0e12bf9d84a4bc671679830eda3d8a76b87a71916241d527da4ac6e` |

The release also provides `SHA256SUMS.txt`. Both artifacts contain ARM64/x86_64 Rust/UniFFI and SQLite libraries, R8/resource shrinking and the generated Baseline Profile (12,325 bytes; metadata 480 bytes). APK V2/V3 signatures, the AAB's 1,489 signed entries, 16 KiB ZIP alignment and all ten ELF entries per artifact were verified. Native files byte-match the directly verified `0x4000` references. The release certificate is unchanged.

The audited APK installed on the physical ARM64 TECNO AD8 / Android API 34. All ten offline process-cold launches displayed real cached lessons. TMG1, personal/Loro preparation and network transport run on IO after the cached-content frame is submitted; FTS5 warm-up starts two seconds later. All 47 JVM tests passed, as did `iosApp` and `widgetkit` for the exact source in [run 37074361609](https://github.com/p44978180-del/raspos/actions/runs/37074361609).

The user accepted the measured TECNO profile: median first-window time 162 ms and two diagnostic Perfetto launch-to-cached-content commits at 185–186 ms. The warm query `17` took 0.903 ms; the broad prefix `1` took 4.216 ms. These are distinct metrics and recorded acceptance decisions, not a universal ≤100 ms startup or ≤3 ms search guarantee. The traces do not prove that 50 ms belong exclusively to Zygote. See the [complete startup audit](phase8-startup-audit.md).

During Phase 8, real Connect-RPC Bootstrap loaded the canonical 805 groups / 47,068 lessons, realtime publication updated the card and Glance, native campus routing restored the 5,392-node graph, and the Loro backup path handled 10,000 tasks. Actual fingerprint registration/login over trusted HTTPS and Android Keystore session restoration were verified before the startup audit. The audit itself used the phone's existing guest state and did not repeat the biometric ceremony. [Acceptance history](phase8-acceptance.md) preserves the exact artifacts, dates and evidence for those checks.

These builds use the user-supplied temporary acceptance API/RP `https://plain-sites-matter.loca.lt`. Permanent deployment requires a configured stable HTTPS API/RP, matching Digital Asset Links and a build with that address. Phase closure does not claim that a permanent production service has already been deployed. Physical 120 Hz profiling was deferred by the user; universal hardware performance, authenticated compaction recovery and the interrupted historical security scan retain their documented follow-up scope.

The previous candidate artifacts remain locally archived under `releases/v8.0.0-platform/`: APK `e861c262…` and AAB `2c82ac17…`, application source `5da5c283435d1014a275c7d01055b3d9ed64f9d0`. Their original byte contents and [verification record](evidence/phase8-final-release-verification.json) are preserved. The published final artifacts are the audited files listed above, retained locally under `releases/startup-audit-9a3925f/`.

[Publication readback](evidence/phase8-release-publication.json), [audited build verification](evidence/phase8-startup-audit.json), [ten startup samples](evidence/phase8-startup-audit-samples.json), [app-only timestamps](evidence/phase8-startup-audit.log), [original ARM64 installation](evidence/phase8-arm64-install.log), [historical Keystore restoration](evidence/phase8-keystore-restoration.log).
