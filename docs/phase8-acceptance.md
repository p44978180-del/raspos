# Phase 8 acceptance — work in progress

The phase is **not accepted yet**. This ledger distinguishes observed behavior from requirements still missing or unverified. The source of scope is the user's Phase 8 objective, including the explicit deferral of 120 Hz physical-device profiling.

## Verified on 27–28 September 2026

- Server parity: 805 groups and 47,068 lessons in **current** snapshots. The older count of 47,342 included 274 retained historical rows. History is preserved; counting only current snapshots fixes the discrepancy without dropping subgroup data.
- Actual Android network bootstrap: release APK, clean API 35 Google APIs x86_64 emulator `timacad_phase8_network`, Docker/Caddy/Connect transport. Log recorded `groups=805 group=ДА 01-24 lessons=113`; the UI displayed the real imported lessons.
- FTS5 is bundled via Requery SQLite 3.49.0. System SQLite on this emulator lacked FTS5 and previously rolled back the bootstrap. Activity, widget and background receiver now use the same bundled driver. Tests cover Cyrillic/hyphenated group codes, numeric code search and literal FTS operators.
- Network update: local `/ingest` ran the Temporal pipeline on a temporary, explicitly synthetic HTML source for an existing group. Version A was visible. Publishing version B produced LSN 4 and Android logged `hint=lesson lsn=4 applied=1 widgets=1`. The card and pinned Glance widget both displayed B; Android PID stayed `7466` throughout the A→B transition. Screenshots: [card](evidence/phase8-live-card.png), [widget](evidence/phase8-live-widget.png). This validates delivery, not the academic accuracy of the synthetic fixture.
- Cleanup after network test: the temporary HTML was deleted and v4 was reimported successfully (`groups=805 lessons=47068`). The application was restarted after the measured transition to refresh its ordinary schedule.
- Snapshot reversion regression: A→B→A creates three increasing LSNs and three hint records, leaves one current lesson and two historical lesson rows; repeating A is a no-op. Reimporting v4 also reactivates a superseded matching snapshot. Focused PostgreSQL integration tests passed (171.735 seconds).
- Full `go test ./...` passed before the snapshot-reversion change. Subsequent reversion changes passed the focused import/reversion integration tests; this is not a claim that the earlier full run covered later edits.
- JVM suite at mobile commit `1f1342746f2cb0222fe36cd7c223dd72497d4352`: 23 tests, zero failures/errors. Android release build succeeded with R8 and resource shrinking. Unchanged cached Rust native outputs and generated bindings were reused; a clean native rebuild was not verified in that run.
- Release APK at that commit: SHA-256 `9d0e7e8e7acf8e64b1c2f35e9ebbc9bb77d5b31853c4546ea0d49060c17f701c`, ARM64 and x86_64, V2/V3 signatures, `zipalign -c -P 16 4` passed. All LOAD segments in the five libraries per ABI, including SQLite, aligned to `0x4000`. Installation and runtime were exercised on x86_64 only; ARM64 installation is not proven.
- iOS CI for the same mobile commit: [run 36340210482](https://github.com/p44978180-del/raspos/actions/runs/36340210482) succeeded. Both `iosApp` compilation and the SharedCore/WidgetKit build jobs are green. This does not prove iOS runtime behavior or production transport.
- Passkey server tests cover real signature validation using a software authenticator, persisted synced-credential flags, required user verification, discoverable login, challenge expiry/single use and replay rejection. They do **not** prove Android biometric UI or hardware-backed credential creation.
- The h2c request wrapper now limits bodies before Upgrade buffering and inside request routing. A regression test proves oversized Upgrade input is bounded before reaching the route.

## Personal data implementation — 28 September, still under runtime verification

- Native Loro open/edit/merge functions now drive the Android repository through UniFFI. Snapshot, SQL projection and pending operations commit atomically. SQL schema migration preserves pre-CRDT notes/tasks/plans. JSON import uses structural parsing and Rust v4 validation, including real calendar/time checks.
- Guest and account documents are stored separately. `/auth/session` returns the verified principal; personal Pull/Push require that principal's scope. Guest operations remain local. Switching accounts or signing out restores the corresponding local document.
- Personal UI now includes task/plan creation, editing, completion/cancellation, deletion and system-file v4 import/export. Runtime acceptance of those actions is pending.
- Six Rust personal tests passed, including concurrent devices, redelivery, late offline edits after server log compaction, v4 parsing and the existing compaction budget. The five Kotlin repository tests passed against the real native library, including SQL-failure rollback, schema migration and account separation (27 total JVM tests at that run). A later bounded-outbox batching test is awaiting the next build.
- PostgreSQL tests passed for authenticated personal exchange, session identity and compaction/reset behavior. Compaction now merges the whole operation log while holding the same scope lock as Push, retaining causal history for offline replicas. A reset stream includes the complete snapshot followed by later deltas.
- Rust was rebuilt from the changed sources on Windows, ARM64 Android and x86_64 Android. The first resulting APK installed successfully, but a real note edit exposed an R8/JNA `Pointer.peer` crash. A JNA keep rule was added; its runtime fix is **not yet verified**.
- That intermediate APK used debug-profile native libraries and was 251 MB. Gradle is being corrected to use separately generated, optimized Release libraries for both ABIs. Do not distribute the intermediate APK as the final release.
- The task-created `timacad_phase8_network` AVD was moved, preserving its data, to `D:\raspos\.cache\android-avd\timacad_phase8_network.avd` after C: ran out of free space. The AVD registration points there; the older PIN-protected AVD was not moved.
- Production Compose override passed `docker compose ... config --quiet` with placeholder domain values. Public DNS/TLS deployment is still pending.

## Remaining requirements and evidence gaps

| Requirement | Current limitation / required proof |
|---|---|
| Real Credential Manager fingerprint registration and login | No completed system biometric ceremony, no confirmed real passkey-backed session. User setup of device/provider and a working HTTPS RP/Digital Asset Links domain remain needed. |
| Production endpoint | Release defaults are local emulator endpoints. HTTPS/Caddy templates exist, but no user-selected public domain is deployed or verified. |
| Bootstrap of directory, schedule and campus graph atomically | Directory and selected schedule are requested separately; server campus graph bootstrap and one combined transaction are not implemented. |
| Full personal Loro flow | Native editing, atomic persistence, v4 parsing and account separation are implemented and covered by tests above. Complete Android CRUD/backup runtime checks, live account sync and recovery after compaction remain to be exercised. A single update larger than the 1 MiB Push batch limit still needs chunking; ordinary queued updates are being batched. |
| Decompose Child Stack and MVIKotlin | Current controller uses coroutines/StateFlow and local tab state. Required libraries/architecture are not integrated. |
| Campus route rendering | Local MapLibre scheme is displayed, but routing is not connected to the displayed map and real synced campus graph. |
| Offline cold start ≤100 ms | Not demonstrated. Observed release launches on this host exceed the limit. A JVM in-memory read test is not an application startup measurement. |
| FTS5 ≤3 ms on Android | JVM search test passes; actual Android timing with the real 805-group dataset is still required. |
| Glance after package update | Emulator previously reported an ANR for `androidx.glance.appwidget.MyPackageReplacedReceiver`. SQLite reads in `provideGlance` now run on IO and compile successfully; final widget runtime verification remains. |
| Full semester data | Imported source window is 14 September–2 November, not proof of all semester dates. 342 catalog groups have an empty electronic source. Do not invent lessons. |
| ARM64 device installation | ELF and APK contents checked; no ARM64 runtime installation log yet. |
| Native release build | Changed native sources rebuilt for host and both Android ABIs. Optimized Release-profile packaging and the JNA keep-rule fix are still being verified. |
| UI completeness | Source links, subgroup edge cases and route interaction need further work. New tasks/plans editing and backup controls need runtime verification. |
| Security scan | Immutable server diff `4eb6de0..2ab88ab`, scan `5540fb80-4ab5-4d2b-94aa-23442a5a6ab4`, remains incomplete. Service usage limits and a later cyber-risk block interrupted finalization; no clean security verdict is claimed. |
| Legacy / entrypoint | Legacy directories were removed in prior commit `b170137`. Root README now points exclusively to `platform/` for development, with v4 identified as historical parity data. |
| 120 FPS | Physical 120 Hz measurement explicitly deferred by the user; code must still keep DB/network work out of composition. |

Local execution logs are retained under `.cache/phase8-*.log`; they are diagnostic evidence, not portable release artifacts. The active goal must remain open until the applicable requirements above have been implemented and directly verified.
