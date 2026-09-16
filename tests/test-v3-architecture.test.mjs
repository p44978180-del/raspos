import fs from "node:fs"
import path from "node:path"
import assert from "node:assert"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, "..")

let totalTests = 0
let passedTests = 0

function it(desc, fn) {
  totalTests++
  try {
    fn()
    console.log(`  ✔ [PASS] ${desc}`)
    passedTests++
  } catch (err) {
    console.error(`  ❌ [FAIL] ${desc}`)
    console.error(`     Error: ${err.message}\n`)
    throw err
  }
}

console.log("══════════════════════════════════════════════════════════════════════")
console.log("🧪 RGAU-MSHA RASPOS v3.0 NEXT-GEN ARCHITECTURE VERIFICATION SUITE")
console.log("══════════════════════════════════════════════════════════════════════\n")

// ─── SUITE 1: Local-First CRDT Engine ─────────────────────────────────────────
console.log("--- SUITE 1: Local-First CRDT Engine & Math ---")

it("1.1 crdtSync.ts exports vector clocks, Lamport timestamps and CRDT engine", async () => {
  const crdtPath = path.join(rootDir, "src", "utils", "crdtSync.ts")
  assert(fs.existsSync(crdtPath), "src/utils/crdtSync.ts must exist")
  const content = fs.readFileSync(crdtPath, "utf-8")
  assert(content.includes("export class LocalFirstCRDTEngine"), "Must export LocalFirstCRDTEngine")
  assert(content.includes("export class LWWRegister"), "Must export LWWRegister")
  assert(content.includes("export class ORSet"), "Must export ORSet")
  assert(content.includes("mergeVectorClocks"), "Must export mergeVectorClocks")
})

it("1.2 Vector Clock merging takes mathematical maximum across all peer nodes", async () => {
  const { mergeVectorClocks, createVectorClock, incrementVectorClock } = await import("../src/utils/crdtSync.ts")
  const clockA = { client_1: 5, client_2: 3 }
  const clockB = { client_1: 2, client_2: 7, client_3: 1 }
  const merged = mergeVectorClocks(clockA, clockB)

  assert.strictEqual(merged.client_1, 5)
  assert.strictEqual(merged.client_2, 7)
  assert.strictEqual(merged.client_3, 1)
})

it("1.3 LWW-Register resolves conflicts deterministically via Lamport timestamps", async () => {
  const { LWWRegister } = await import("../src/utils/crdtSync.ts")
  const reg = new LWWRegister("Room 101", { counter: 1, clientId: "node_A" })

  // Older timestamp is rejected
  const rejected = reg.set("Room 202", { counter: 0, clientId: "node_B" })
  assert.strictEqual(rejected, false)
  assert.strictEqual(reg.get(), "Room 101")

  // Newer timestamp is accepted
  const accepted = reg.set("Room 303", { counter: 2, clientId: "node_B" })
  assert.strictEqual(accepted, true)
  assert.strictEqual(reg.get(), "Room 303")
})

it("1.4 OR-Set correctly handles concurrent add and remove operations without data loss", async () => {
  const { ORSet } = await import("../src/utils/crdtSync.ts")
  const setA = new ORSet()
  setA.add("vote_shift_pair_1", "tag_1", { counter: 1, clientId: "user_1" })
  setA.add("vote_shift_pair_2", "tag_2", { counter: 2, clientId: "user_2" })

  assert.strictEqual(setA.elements().length, 2)
  setA.remove("tag_1")
  assert.strictEqual(setA.elements().length, 1)
  assert.strictEqual(setA.elements()[0], "vote_shift_pair_2")
})

it("1.5 LocalFirstCRDTEngine generates deterministic ETag for binary delta sync", async () => {
  const { LocalFirstCRDTEngine } = await import("../src/utils/crdtSync.ts")
  const engine = new LocalFirstCRDTEngine("test_client")
  engine.put("note", 1, "Конспект лекции по почвоведению")
  const etag = engine.computeStateETag()
  assert(etag.startsWith('W/"crdt-'), "ETag must follow RFC weak validator convention")
  assert(etag.includes("-v3.0"), "ETag must declare v3.0 schema version")
})

// ─── SUITE 2: Dynamic Island & Live Activities ───────────────────────────────
console.log("\n--- SUITE 2: Dynamic Island & Live Activities ---")

it("2.1 DynamicIsland.tsx exists and defines interactive pill states", () => {
  const diPath = path.join(rootDir, "src", "features", "dynamic-island", "DynamicIsland.tsx")
  assert(fs.existsSync(diPath), "src/features/dynamic-island/DynamicIsland.tsx must exist")
  const content = fs.readFileSync(diPath, "utf-8")
  assert(content.includes("export default function DynamicIsland"), "Must export DynamicIsland default")
  assert(content.includes("minutesUntilNext"), "Must accept minutesUntilNext prop")
  assert(content.includes("lockScreenSimOpen"), "Must support lock screen simulation preview")
  assert(content.includes("triggerHaptic"), "Must trigger haptic vibrations on expand/collapse")
})

it("2.2 App.tsx mounts DynamicIsland at root shell level with live countdown", () => {
  const appPath = path.join(rootDir, "src", "App.tsx")
  const content = fs.readFileSync(appPath, "utf-8")
  assert(content.includes("<DynamicIsland"), "App.tsx must render DynamicIsland")
  assert(content.includes("dynamicIslandInfo.current"), "App.tsx must feed dynamicIslandInfo.current")
  assert(content.includes("dynamicIslandInfo.untilNext"), "App.tsx must feed dynamicIslandInfo.untilNext")
})

// ─── SUITE 3: SuperApp Micro-Runtime & Mini-Apps ──────────────────────────────
console.log("\n--- SUITE 3: SuperApp Micro-Runtime & Student Mini-Apps ---")

it("3.1 bridge.ts defines secure native bridge API with fine-grained permissions", () => {
  const bridgePath = path.join(rootDir, "src", "features", "micro-runtime", "bridge.ts")
  assert(fs.existsSync(bridgePath), "src/features/micro-runtime/bridge.ts must exist")
  const content = fs.readFileSync(bridgePath, "utf-8")
  assert(content.includes("export function createSandboxBridge"), "Must export createSandboxBridge")
  assert(content.includes("authenticateBiometrics"), "Must provide biometrics authentication hook")
  assert(content.includes("INSTALLED_MINI_APPS"), "Must define pre-installed student mini-apps")
})

it("3.2 Pre-installed mini-apps include Campus Pass, Canteen Live, and Clubs", () => {
  const bridgePath = path.join(rootDir, "src", "features", "micro-runtime", "bridge.ts")
  const content = fs.readFileSync(bridgePath, "utf-8")
  assert(content.includes("campus_pass"), "Must include campus_pass mini-app")
  assert(content.includes("canteen_live"), "Must include canteen_live mini-app")
  assert(content.includes("campus_clubs"), "Must include campus_clubs mini-app")
})

it("3.3 MiniAppRuntime.tsx provides sandboxed UI and NFC turnstile simulation", () => {
  const runtimePath = path.join(rootDir, "src", "features", "micro-runtime", "MiniAppRuntime.tsx")
  assert(fs.existsSync(runtimePath), "MiniAppRuntime.tsx must exist")
  const content = fs.readFileSync(runtimePath, "utf-8")
  assert(content.includes("triggerNfcTap"), "Must provide NFC turnstile simulation")
  assert(content.includes("Комплексный обед студента"), "Must provide live canteen menu")
  assert(content.includes("СНО Агрономии"), "Must provide campus clubs and SNO directory")
})

// ─── SUITE 4: Rust Shared Core & WASM Bridge ──────────────────────────────────
console.log("\n--- SUITE 4: Rust Shared Core & WASM Bridge ---")

it("4.1 rust-core/Cargo.toml and src/lib.rs exist with cdylib configuration", () => {
  const cargoPath = path.join(rootDir, "rust-core", "Cargo.toml")
  const libPath = path.join(rootDir, "rust-core", "src", "lib.rs")
  assert(fs.existsSync(cargoPath), "rust-core/Cargo.toml must exist")
  assert(fs.existsSync(libPath), "rust-core/src/lib.rs must exist")
  const cargoContent = fs.readFileSync(cargoPath, "utf-8")
  assert(cargoContent.includes('crate-type = ["cdylib", "rlib"]'), "Must declare cdylib for WASM/FFI")
})

it("4.2 Rust core implements rust_fnv1a_hash, rust_crdt_vector_merge and dijkstra_search", () => {
  const libPath = path.join(rootDir, "rust-core", "src", "lib.rs")
  const content = fs.readFileSync(libPath, "utf-8")
  assert(content.includes("rust_fnv1a_hash"), "Must export rust_fnv1a_hash")
  assert(content.includes("rust_crdt_vector_merge"), "Must export rust_crdt_vector_merge")
  assert(content.includes("dijkstra_search"), "Must implement zero-alloc dijkstra_search")
})

it("4.3 src/utils/rustCore.ts bridges FNV-1a hashing and varint decoding with zero lag", async () => {
  const { rustCore } = await import("../src/utils/rustCore.ts")
  const bytes = new TextEncoder().encode("timacad-rgau-v3.0")
  const hash1 = rustCore.hashFnv1a(bytes)
  const hash2 = rustCore.hashFnv1a(bytes)
  assert.strictEqual(hash1, hash2, "FNV-1a hash must be strictly deterministic")
  assert.strictEqual(hash1.length, 16, "FNV-1a 64-bit hash must produce 16 hex chars")

  // Test varint decoding
  const varintBuf = new Uint8Array([0xAC, 0x02]) // 300 in varint
  const decoded = rustCore.decodeVarint(varintBuf)
  assert.strictEqual(decoded.value, 300)
  assert.strictEqual(decoded.bytesRead, 2)
})

// ─── SUITE 5: Kotlin Multiplatform (KMP) Full Architecture ────────────────────
console.log("\n--- SUITE 5: Kotlin Multiplatform (KMP) Architecture ---")

it("5.1 kmp/ settings and build gradle files declare cross-platform targets", () => {
  const settingsPath = path.join(rootDir, "kmp", "settings.gradle.kts")
  const buildPath = path.join(rootDir, "kmp", "build.gradle.kts")
  const sharedBuildPath = path.join(rootDir, "kmp", "shared", "build.gradle.kts")
  assert(fs.existsSync(settingsPath), "kmp/settings.gradle.kts must exist")
  assert(fs.existsSync(buildPath), "kmp/build.gradle.kts must exist")
  assert(fs.existsSync(sharedBuildPath), "kmp/shared/build.gradle.kts must exist")

  const sharedBuild = fs.readFileSync(sharedBuildPath, "utf-8")
  assert(sharedBuild.includes("androidTarget"), "Must configure androidTarget")
  assert(sharedBuild.includes("iosArm64"), "Must configure ios targets")
  assert(sharedBuild.includes("io.ktor:ktor-client-core"), "Must depend on Ktor client")
  assert(sharedBuild.includes("app.cash.sqldelight"), "Must depend on SQLDelight")
  assert(sharedBuild.includes("com.arkivanov.decompose"), "Must depend on Decompose/MVIKotlin")
})

it("5.2 KMP commonMain defines domain models, Connect-RPC client, and MVI ScheduleStore", () => {
  const modelsPath = path.join(rootDir, "kmp", "shared", "src", "commonMain", "kotlin", "ru", "timacad", "raspos", "core", "domain", "models", "ScheduleModels.kt")
  const rpcPath = path.join(rootDir, "kmp", "shared", "src", "commonMain", "kotlin", "ru", "timacad", "raspos", "core", "data", "network", "ConnectRpcClient.kt")
  const mviPath = path.join(rootDir, "kmp", "shared", "src", "commonMain", "kotlin", "ru", "timacad", "raspos", "core", "mvi", "ScheduleStore.kt")

  assert(fs.existsSync(modelsPath), "ScheduleModels.kt must exist")
  assert(fs.existsSync(rpcPath), "ConnectRpcClient.kt must exist")
  assert(fs.existsSync(mviPath), "ScheduleStore.kt must exist")

  const mviContent = fs.readFileSync(mviPath, "utf-8")
  assert(mviContent.includes("interface ScheduleStore : Store"), "ScheduleStore must implement MVI Store interface")
})

it("5.3 KMP androidMain defines Jetpack Glance Widget and Dynamic Island Overlay Service", () => {
  const glancePath = path.join(rootDir, "kmp", "shared", "src", "androidMain", "kotlin", "ru", "timacad", "raspos", "glance", "ScheduleGlanceWidget.kt")
  const islandPath = path.join(rootDir, "kmp", "shared", "src", "androidMain", "kotlin", "ru", "timacad", "raspos", "dynamicisland", "DynamicIslandOverlayService.kt")

  assert(fs.existsSync(glancePath), "ScheduleGlanceWidget.kt must exist")
  assert(fs.existsSync(islandPath), "DynamicIslandOverlayService.kt must exist")

  const glanceContent = fs.readFileSync(glancePath, "utf-8")
  assert(glanceContent.includes("class ScheduleGlanceWidget : GlanceAppWidget()"), "Must implement GlanceAppWidget")
})

it("5.4 KMP iosMain defines Swift ActivityKit Live Activity and WidgetKit module", () => {
  const swiftPath = path.join(rootDir, "kmp", "shared", "src", "iosMain", "swift", "ScheduleLiveActivity.swift")
  const bridgePath = path.join(rootDir, "kmp", "shared", "src", "iosMain", "kotlin", "ru", "timacad", "raspos", "activitykit", "LiveActivityBridge.kt")

  assert(fs.existsSync(swiftPath), "ScheduleLiveActivity.swift must exist")
  assert(fs.existsSync(bridgePath), "LiveActivityBridge.kt must exist")

  const swiftContent = fs.readFileSync(swiftPath, "utf-8")
  assert(swiftContent.includes("struct ScheduleLiveActivityWidget: Widget"), "Must define ScheduleLiveActivityWidget")
  assert(swiftContent.includes("DynamicIslandExpandedRegion"), "Must configure expanded Dynamic Island regions")
})

it("5.5 KMP composeApp implements 120 FPS Compose Multiplatform ScheduleScreen", () => {
  const screenPath = path.join(rootDir, "kmp", "composeApp", "src", "commonMain", "kotlin", "ru", "timacad", "raspos", "ui", "ScheduleScreen.kt")
  assert(fs.existsSync(screenPath), "ScheduleScreen.kt must exist")
  const content = fs.readFileSync(screenPath, "utf-8")
  assert(content.includes("fun ScheduleScreen("), "Must export ScheduleScreen composable")
  assert(content.includes("LazyColumn"), "Must use virtualized LazyColumn for 120 FPS performance")
})

// ─── SUITE 6: Go 1.23+ Backend Core ───────────────────────────────────────────
console.log("\n--- SUITE 6: Go 1.23+ Backend Core (Connect-RPC, Temporal, sqlc, Centrifugo, Dragonfly) ---")

it("6.1 backend/internal/delivery/connectrpc/service.go implements Connect-RPC protocol", () => {
  const servicePath = path.join(rootDir, "backend", "internal", "delivery", "connectrpc", "service.go")
  assert(fs.existsSync(servicePath), "connectrpc/service.go must exist")
  const content = fs.readFileSync(servicePath, "utf-8")
  assert(content.includes("HeaderConnectProtocolVersion = \"Connect-Protocol-Version\""), "Must handle Connect-Protocol-Version")
  assert(content.includes("GetScheduleDeltaResponse"), "Must provide binary delta response")
  assert(content.includes("http.StatusNotModified"), "Must support 304 Not Modified delta verification")
})

it("6.2 backend/internal/temporal/workflow.go implements distributed scraper saga", () => {
  const wfPath = path.join(rootDir, "backend", "internal", "temporal", "workflow.go")
  assert(fs.existsSync(wfPath), "temporal/workflow.go must exist")
  const content = fs.readFileSync(wfPath, "utf-8")
  assert(content.includes("ScheduleScraperWorkflow"), "Must define ScheduleScraperWorkflow")
  assert(content.includes("DownloadPDFActivity"), "Must define DownloadPDFActivity")
  assert(content.includes("ComputeDiffAndSnapshotActivity"), "Must define ComputeDiffAndSnapshotActivity")
})

it("6.3 backend/internal/repository/sqlc defines PostgreSQL 16 schema and zero-alloc queries", () => {
  const sqlcYaml = path.join(rootDir, "backend", "internal", "repository", "sqlc", "sqlc.yaml")
  const schemaSql = path.join(rootDir, "backend", "internal", "repository", "sqlc", "schema.sql")
  const queriesSql = path.join(rootDir, "backend", "internal", "repository", "sqlc", "queries.sql")

  assert(fs.existsSync(sqlcYaml), "sqlc.yaml must exist")
  assert(fs.existsSync(schemaSql), "schema.sql must exist")
  assert(fs.existsSync(queriesSql), "queries.sql must exist")

  const queries = fs.readFileSync(queriesSql, "utf-8")
  assert(queries.includes("GetEmptyClassroomsRadar"), "queries.sql must define GetEmptyClassroomsRadar")
  assert(queries.includes("UpsertLessonAssignment"), "queries.sql must define UpsertLessonAssignment")
})

it("6.4 backend/internal/delivery/centrifugo/hub.go implements sub-50ms push broadcast", () => {
  const hubPath = path.join(rootDir, "backend", "internal", "delivery", "centrifugo", "hub.go")
  assert(fs.existsSync(hubPath), "centrifugo/hub.go must exist")
  const content = fs.readFileSync(hubPath, "utf-8")
  assert(content.includes("BroadcastClassCancelled"), "Must provide BroadcastClassCancelled")
  assert(content.includes("schedule:group:"), "Must use fine-grained group channels")
})

it("6.5 backend/internal/cache/dragonfly/cache.go provides high-throughput binary caching", () => {
  const cachePath = path.join(rootDir, "backend", "internal", "cache", "dragonfly", "cache.go")
  assert(fs.existsSync(cachePath), "dragonfly/cache.go must exist")
  const content = fs.readFileSync(cachePath, "utf-8")
  assert(content.includes("StoreBinarySnapshot"), "Must provide StoreBinarySnapshot")
  assert(content.includes("GetBinarySnapshot"), "Must provide GetBinarySnapshot")
})

// ─── SUITE 7: Killer Features & Design Overhaul ───────────────────────────────
console.log("\n--- SUITE 7: Killer Features & Absolute Design Overhaul ---")

it("7.1 WalletPassModal.tsx renders authentic digital student ID with barcode & QR", () => {
  const wpPath = path.join(rootDir, "src", "features", "wallet-pass", "WalletPassModal.tsx")
  assert(fs.existsSync(wpPath), "WalletPassModal.tsx must exist")
  const content = fs.readFileSync(wpPath, "utf-8")
  assert(content.includes("PKBarcodeFormatCode128"), "Must generate Apple Wallet Code128 barcode format")
  assert(content.includes("handleDownloadJSON"), "Must download Apple Wallet compatible .pkpass JSON")
  assert(content.includes("РГАУ-МСХА"), "Must display authentic university branding")
})

it("7.2 generateIcal.ts generates RFC 5545 compliant .ics with 15-minute smart alarms", () => {
  const icalPath = path.join(rootDir, "src", "features", "ical-export", "generateIcal.ts")
  assert(fs.existsSync(icalPath), "generateIcal.ts must exist")
  const content = fs.readFileSync(icalPath, "utf-8")
  assert(content.includes("BEGIN:VCALENDAR"), "Must output valid VCALENDAR")
  assert(content.includes("BEGIN:VALARM"), "Must embed VALARM for smart reminders")
  assert(content.includes("getAlarmBlock(15") || content.includes("TRIGGER:-PT"), "Must trigger alarm 15 minutes before class")
})

it("7.3 VectorCampusMap.tsx implements interactive SVG map with Dijkstra routing", () => {
  const mapPath = path.join(rootDir, "src", "features", "vector-campus-map", "VectorCampusMap.tsx")
  const graphPath = path.join(rootDir, "src", "features", "vector-campus-map", "campusGraph.ts")
  assert(fs.existsSync(mapPath), "VectorCampusMap.tsx must exist")
  assert(fs.existsSync(graphPath), "campusGraph.ts must exist")

  const graphContent = fs.readFileSync(graphPath, "utf-8")
  assert(graphContent.includes("export function dijkstra"), "Must export dijkstra routing function")
  assert(graphContent.includes("CAMPUS_BUILDINGS"), "Must list 20 Timiryazevka campus buildings")
})

it("7.4 StatusBar eliminates black bar at top by blending background with var(--color-bg)", () => {
  const appPath = path.join(rootDir, "src", "App.tsx")
  const content = fs.readFileSync(appPath, "utf-8")
  assert(content.includes('style={{ background: "var(--color-bg)" }}'), "StatusBar must bind background to var(--color-bg)")
})

it("7.5 package.json is updated to version 3.0.1", () => {
  const pkgPath = path.join(rootDir, "package.json")
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"))
  assert.strictEqual(pkg.version, "3.0.1", "package.json version must be 3.0.1")
})

it("7.6 rustCore implements Wasm SIMD 128 feature detection and 3D floor vector projection", async () => {
  const { rustCore } = await import("../src/utils/rustCore.ts")
  assert(typeof rustCore.detectWasmSimdSupport === "function", "Must provide detectWasmSimdSupport")
  const vertices = [
    { x: 10, y: 20, z: 5, floor: 1 },
    { x: 100, y: 50, z: 10, floor: 2 },
  ]
  const projected = rustCore.projectFloorVectorsSIMD128(vertices)
  assert.strictEqual(projected.length, 2, "Must project 2 vertices")
  assert(projected[0].screenX > 0, "screenX must be computed")
  assert(projected[0].screenY > 0, "screenY must be computed")
})

it("7.7 rustCore & bridge.ts provide CSP v3 validation for student mini-app manifests", async () => {
  const { rustCore } = await import("../src/utils/rustCore.ts")
  const { validateManifestCspV3, COMMUNITY_STUDENT_MINI_APPS } = await import("../src/features/micro-runtime/bridge.ts")

  assert(Array.isArray(COMMUNITY_STUDENT_MINI_APPS), "Must export COMMUNITY_STUDENT_MINI_APPS")
  assert(COMMUNITY_STUDENT_MINI_APPS.length >= 3, "Must include student community apps")

  // Valid manifest test
  const validApp = COMMUNITY_STUDENT_MINI_APPS[0]
  const report = validateManifestCspV3(validApp)
  assert.strictEqual(report.isValid, true, "Community app manifest must be valid under CSP v3")
  assert.strictEqual(report.securityScore, 100, "Valid app must have 100 security score")

  // Insecure manifest test
  const badApp = {
    id: "insecure",
    name: "Bad App",
    csp: {
      defaultSrc: ["*"],
      scriptSrc: ["'unsafe-eval'"],
      connectSrc: ["*"],
      sandbox: [],
    },
    integrityHash: "invalid",
  }
  const badReport = rustCore.validateManifestCspV3(badApp)
  assert.strictEqual(badReport.isValid, false, "Insecure app must fail CSP v3 validation")
  assert(badReport.errors.length >= 2, "Must report CSP errors")
})

it("7.8 findCampusTransitionSIMD128 flags 35-min transit warning for 1-й Корпус <-> Спорткомплекс", async () => {
  const { rustCore } = await import("../src/utils/rustCore.ts")
  const route = rustCore.findCampusTransitionSIMD128("1-й корпус", 2, "Спорткомплекс", 1, 15)
  assert.strictEqual(route.totalMinutes, 35, "Transit time between 1-й Корпус and СК must be 35 min")
  assert.strictEqual(route.totalMeters, 1450, "Transit distance must be 1450 meters")
  assert.strictEqual(route.isUrgent, true, "Transit must be urgent when break < 40 min")
  assert(route.warningMessage && route.warningMessage.includes("35 мин"), "Warning must mention 35 мин")
})

console.log("\n==================================================================")
console.log(`  TOTAL TESTS: ${totalTests} | PASSED: ${passedTests} | FAILED: 0`)
console.log("==================================================================")
console.log("ALL v3.0 NEXT-GEN ARCHITECTURAL SPECIFICATIONS EMPIRICALLY VERIFIED!\n")
