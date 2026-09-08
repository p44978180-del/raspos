import fs from "node:fs"
import path from "node:path"
import crypto from "node:crypto"
import assert from "node:assert"
import { execSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, "..")

const results = {
  total: 0,
  passed: 0,
  failed: 0,
  tests: [],
}

function test(name, fn) {
  results.total++
  try {
    fn()
    results.passed++
    results.tests.push({ name, status: "PASS" })
    console.log(`  ✓ PASS: ${name}`)
  } catch (err) {
    results.failed++
    results.tests.push({ name, status: "FAIL", error: err.message })
    console.error(`  ✗ FAIL: ${name}`)
    console.error(`    Error: ${err.message}`)
  }
}

console.log("================================================================")
console.log("  MILESTONE 2 EMPIRICAL STRESS TEST SUITE: SCRIPTS & CAPACITOR  ")
console.log(
  "================================================================\n",
)

// -----------------------------------------------------------------------------
// SUITE 1: package.json Scripts & Dependencies
// -----------------------------------------------------------------------------
console.log("--- SUITE 1: package.json Scripts & Dependencies ---")

const packageJsonPath = path.join(rootDir, "package.json")
let pkg

test("package.json exists and is valid JSON", () => {
  assert(fs.existsSync(packageJsonPath), "package.json does not exist")
  const raw = fs.readFileSync(packageJsonPath, "utf8")
  pkg = JSON.parse(raw)
  assert(pkg && typeof pkg === "object", "package.json is not an object")
})

test("package.json scripts contains build:android with vite build && cap sync android", () => {
  assert(pkg.scripts, "package.json has no scripts section")
  assert.strictEqual(
    pkg.scripts["build:android"],
    "vite build && cap sync android",
    `Expected "vite build && cap sync android", got "${pkg.scripts["build:android"]}"`,
  )
})

test("package.json scripts contains sync:android with cap sync android", () => {
  assert.strictEqual(
    pkg.scripts["sync:android"],
    "cap sync android",
    `Expected "cap sync android", got "${pkg.scripts["sync:android"]}"`,
  )
})

test("package.json dependencies contains @capacitor/core", () => {
  assert(pkg.dependencies, "package.json has no dependencies section")
  assert(
    pkg.dependencies["@capacitor/core"],
    "Missing @capacitor/core in dependencies",
  )
  console.log(
    `    @capacitor/core version specifier: ${pkg.dependencies["@capacitor/core"]}`,
  )
})

test("package.json devDependencies contains @capacitor/cli and @capacitor/android", () => {
  assert(pkg.devDependencies, "package.json has no devDependencies section")
  assert(
    pkg.devDependencies["@capacitor/cli"],
    "Missing @capacitor/cli in devDependencies",
  )
  assert(
    pkg.devDependencies["@capacitor/android"],
    "Missing @capacitor/android in devDependencies",
  )
  console.log(`    @capacitor/cli: ${pkg.devDependencies["@capacitor/cli"]}`)
  console.log(
    `    @capacitor/android: ${pkg.devDependencies["@capacitor/android"]}`,
  )
})

test("Installed Capacitor node_modules packages have matching versions and valid package.json", () => {
  const corePkgPath = path.join(
    rootDir,
    "node_modules",
    "@capacitor",
    "core",
    "package.json",
  )
  const cliPkgPath = path.join(
    rootDir,
    "node_modules",
    "@capacitor",
    "cli",
    "package.json",
  )
  const androidPkgPath = path.join(
    rootDir,
    "node_modules",
    "@capacitor",
    "android",
    "package.json",
  )

  assert(fs.existsSync(corePkgPath), "node_modules/@capacitor/core missing")
  assert(fs.existsSync(cliPkgPath), "node_modules/@capacitor/cli missing")
  assert(
    fs.existsSync(androidPkgPath),
    "node_modules/@capacitor/android missing",
  )

  const corePkg = JSON.parse(fs.readFileSync(corePkgPath, "utf8"))
  const cliPkg = JSON.parse(fs.readFileSync(cliPkgPath, "utf8"))
  const androidPkg = JSON.parse(fs.readFileSync(androidPkgPath, "utf8"))

  assert(
    corePkg.version.startsWith("8."),
    `Unexpected @capacitor/core version: ${corePkg.version}`,
  )
  assert.strictEqual(
    corePkg.version,
    cliPkg.version,
    "Version mismatch between core and cli",
  )
  assert.strictEqual(
    corePkg.version,
    androidPkg.version,
    "Version mismatch between core and android",
  )
  console.log(`    Verified installed Capacitor version: ${corePkg.version}`)
})

// -----------------------------------------------------------------------------
// SUITE 2: capacitor.config.ts Validation
// -----------------------------------------------------------------------------
console.log("\n--- SUITE 2: capacitor.config.ts Validation ---")

const capConfigPath = path.join(rootDir, "capacitor.config.ts")

test("capacitor.config.ts exists on disk", () => {
  assert(fs.existsSync(capConfigPath), "capacitor.config.ts does not exist")
})

test("capacitor.config.ts contains required configuration fields", () => {
  const content = fs.readFileSync(capConfigPath, "utf8")

  // Check imports
  assert(
    content.includes("from '@capacitor/cli'"),
    "Missing import from @capacitor/cli",
  )
  assert(
    content.includes("CapacitorConfig"),
    "Missing CapacitorConfig type reference",
  )

  // Check appId
  const appIdMatch = content.match(/appId\s*:\s*['"`]([^'"`]+)['"`]/)
  assert(appIdMatch, "appId property not found")
  assert.strictEqual(
    appIdMatch[1],
    "ru.timacad.student",
    `Invalid appId: ${appIdMatch[1]}`,
  )

  // Check appName
  const appNameMatch = content.match(/appName\s*:\s*['"`]([^'"`]+)['"`]/)
  assert(appNameMatch, "appName property not found")
  assert.strictEqual(
    appNameMatch[1],
    "РГАУ Расписание",
    `Invalid appName: ${appNameMatch[1]}`,
  )

  // Check webDir
  const webDirMatch = content.match(/webDir\s*:\s*['"`]([^'"`]+)['"`]/)
  assert(webDirMatch, "webDir property not found")
  assert.strictEqual(
    webDirMatch[1],
    "dist",
    `Invalid webDir: ${webDirMatch[1]}`,
  )

  // Check androidScheme
  const schemeMatch = content.match(/androidScheme\s*:\s*['"`]([^'"`]+)['"`]/)
  assert(schemeMatch, "androidScheme property not found")
  assert.strictEqual(
    schemeMatch[1],
    "https",
    `Invalid androidScheme: ${schemeMatch[1]}`,
  )

  // Check default export
  assert(
    /export\s+default\s+config;?/.test(content),
    "Missing export default config",
  )
})

// -----------------------------------------------------------------------------
// SUITE 3: Native Android Project Scaffold Verification
// -----------------------------------------------------------------------------
console.log("\n--- SUITE 3: Native Android Project Scaffold Verification ---")

const androidDir = path.join(rootDir, "android")
const buildGradlePath = path.join(androidDir, "app", "build.gradle")
const stringsXmlPath = path.join(
  androidDir,
  "app",
  "src",
  "main",
  "res",
  "values",
  "strings.xml",
)
const mainActivityPath = path.join(
  androidDir,
  "app",
  "src",
  "main",
  "java",
  "ru",
  "timacad",
  "student",
  "MainActivity.java",
)
const capConfigJsonPath = path.join(
  androidDir,
  "app",
  "src",
  "main",
  "assets",
  "capacitor.config.json",
)
const publicIndexPath = path.join(
  androidDir,
  "app",
  "src",
  "main",
  "assets",
  "public",
  "index.html",
)

test("android native project directory structure exists", () => {
  assert(fs.existsSync(androidDir), "android directory does not exist")
  assert(
    fs.existsSync(buildGradlePath),
    "android/app/build.gradle does not exist",
  )
  assert(
    fs.existsSync(stringsXmlPath),
    "android/app/src/main/res/values/strings.xml does not exist",
  )
  assert(
    fs.existsSync(mainActivityPath),
    "MainActivity.java does not exist in ru/timacad/student package",
  )
  assert(
    fs.existsSync(capConfigJsonPath),
    "capacitor.config.json does not exist in android assets",
  )
})

test("android/app/build.gradle defines correct namespace and applicationId", () => {
  const content = fs.readFileSync(buildGradlePath, "utf8")
  assert(
    content.includes('namespace = "ru.timacad.student"'),
    "Missing or incorrect namespace in build.gradle",
  )
  assert(
    content.includes('applicationId "ru.timacad.student"'),
    "Missing or incorrect applicationId in build.gradle",
  )
})

test("android/app/src/main/res/values/strings.xml defines correct app_name and package_name in UTF-8", () => {
  const content = fs.readFileSync(stringsXmlPath, "utf8")
  assert(
    content.includes('<string name="app_name">РГАУ Расписание</string>'),
    "Missing or incorrect app_name in strings.xml",
  )
  assert(
    content.includes(
      '<string name="title_activity_main">РГАУ Расписание</string>',
    ),
    "Missing or incorrect title_activity_main",
  )
  assert(
    content.includes('<string name="package_name">ru.timacad.student</string>'),
    "Missing or incorrect package_name",
  )
  assert(
    content.includes(
      '<string name="custom_url_scheme">ru.timacad.student</string>',
    ),
    "Missing or incorrect custom_url_scheme",
  )
})

test("MainActivity.java is properly configured with package and BridgeActivity", () => {
  const content = fs.readFileSync(mainActivityPath, "utf8")
  assert(
    content.includes("package ru.timacad.student;"),
    "Missing package ru.timacad.student",
  )
  assert(
    content.includes("import com.getcapacitor.BridgeActivity;"),
    "Missing BridgeActivity import",
  )
  assert(
    content.includes("public class MainActivity extends BridgeActivity"),
    "MainActivity does not extend BridgeActivity",
  )
})

test("android/app/src/main/assets/capacitor.config.json reflects capacitor.config.ts settings", () => {
  const raw = fs.readFileSync(capConfigJsonPath, "utf8")
  const json = JSON.parse(raw)
  assert.strictEqual(
    json.appId,
    "ru.timacad.student",
    `Mismatch appId in capacitor.config.json: ${json.appId}`,
  )
  assert.strictEqual(
    json.appName,
    "РГАУ Расписание",
    `Mismatch appName in capacitor.config.json: ${json.appName}`,
  )
  assert.strictEqual(
    json.webDir,
    "dist",
    `Mismatch webDir in capacitor.config.json: ${json.webDir}`,
  )
  assert(
    json.server && json.server.androidScheme === "https",
    "Mismatch server.androidScheme in capacitor.config.json",
  )
})

// -----------------------------------------------------------------------------
// SUITE 4: CI/CD Workflow (.github/workflows/build-android.yml) Validation
// -----------------------------------------------------------------------------
console.log(
  "\n--- SUITE 4: CI/CD Workflow (.github/workflows/build-android.yml) Validation ---",
)

const workflowPath = path.join(
  rootDir,
  ".github",
  "workflows",
  "build-android.yml",
)

test(".github/workflows/build-android.yml exists and has valid YAML syntax", () => {
  assert(fs.existsSync(workflowPath), "Workflow file does not exist")
  const yamlOut = execSync(`npx --yes js-yaml "${workflowPath}"`, {
    encoding: "utf8",
  })
  const parsed = JSON.parse(yamlOut)
  assert(
    parsed && parsed.jobs && parsed.jobs["build-android"],
    "Workflow missing build-android job",
  )
})

test("Workflow contains required build steps and fail-safes", () => {
  const content = fs.readFileSync(workflowPath, "utf8")
  assert(
    content.includes("actions/setup-java@v4"),
    "Workflow missing actions/setup-java@v4",
  )
  assert(content.includes("java-version: '17'"), "Workflow missing JDK 17")
  assert(
    content.includes("pnpm/action-setup@v4"),
    "Workflow missing pnpm/action-setup",
  )
  assert(
    content.includes("actions/setup-node@v4"),
    "Workflow missing actions/setup-node",
  )
  assert(
    content.includes("chmod +x android/gradlew"),
    "Workflow missing chmod +x android/gradlew",
  )
  assert(
    content.includes("./gradlew assembleDebug"),
    "Workflow missing assembleDebug step",
  )
  assert(
    content.includes("./gradlew assembleRelease"),
    "Workflow missing assembleRelease step",
  )
  assert(
    content.includes("actions/upload-artifact@v4"),
    "Workflow missing upload-artifact step",
  )
  assert(
    content.includes("npx cap sync android"),
    "Workflow missing npx cap sync android step",
  )
  assert(
    content.includes('if [ ! -d "android" ]; then'),
    "Workflow missing self-healing cap add android check",
  )
})

// -----------------------------------------------------------------------------
// SUITE 5: Live Execution & Asset Synchronization Stress Testing
// -----------------------------------------------------------------------------
console.log(
  "\n--- SUITE 5: Live Execution & Asset Synchronization Stress Testing ---",
)

test("npm run build:android executes successfully with exit code 0", () => {
  const startTime = Date.now()
  const stdout = execSync("npm run build:android", {
    cwd: rootDir,
    encoding: "utf8",
    stdio: "pipe",
  })
  const duration = Date.now() - startTime
  console.log(`    Command completed in ${duration}ms`)
  assert(
    stdout.includes("vite build") || stdout.includes("built in"),
    "Expected vite build in output",
  )
  assert(
    stdout.includes("sync android") ||
      stdout.includes("Syncing") ||
      stdout.includes("Copying web assets"),
    "Expected cap sync output",
  )
})

test("dist directory contains required production web bundle assets", () => {
  const distDir = path.join(rootDir, "dist")
  assert(fs.existsSync(distDir), "dist directory missing")
  assert(
    fs.existsSync(path.join(distDir, "index.html")),
    "dist/index.html missing",
  )
  assert(
    fs.existsSync(path.join(distDir, "manifest.json")),
    "dist/manifest.json missing",
  )
  assert(
    fs.existsSync(path.join(distDir, "manifest.webmanifest")),
    "dist/manifest.webmanifest missing",
  )

  const assetsDir = path.join(distDir, "assets")
  assert(fs.existsSync(assetsDir), "dist/assets missing")
  const assetFiles = fs.readdirSync(assetsDir)
  assert(
    assetFiles.some((f) => f.endsWith(".js")),
    "No JS bundles found in dist/assets",
  )
  assert(
    assetFiles.some((f) => f.endsWith(".css")),
    "No CSS bundles found in dist/assets",
  )
})

test("dist/index.html and android/app/src/main/assets/public/index.html are byte-identical", () => {
  const distHtml = fs.readFileSync(path.join(rootDir, "dist", "index.html"))
  const androidHtml = fs.readFileSync(publicIndexPath)

  const hash1 = crypto.createHash("sha256").update(distHtml).digest("hex")
  const hash2 = crypto.createHash("sha256").update(androidHtml).digest("hex")

  assert.strictEqual(
    hash1,
    hash2,
    `SHA-256 mismatch! dist=${hash1}, android=${hash2}`,
  )
  console.log(`    Verified SHA-256 match: ${hash1}`)
})

test("npm run sync:android executes cleanly", () => {
  const startTime = Date.now()
  const stdout = execSync("npm run sync:android", {
    cwd: rootDir,
    encoding: "utf8",
    stdio: "pipe",
  })
  const duration = Date.now() - startTime
  console.log(`    Command completed in ${duration}ms`)
  assert(
    stdout.includes("sync") ||
      stdout.includes("Copying") ||
      stdout.includes("Updating"),
    "Expected sync output",
  )
})

test("Adversarial Stress Test: Sentinel asset creation, sync propagation, and integrity", () => {
  const sentinelId = crypto.randomBytes(16).toString("hex")
  const sentinelFilename = `sentinel-stress-${sentinelId}.txt`
  const sentinelContent = `ADVERSARIAL_SYNC_TEST_${sentinelId}_${Date.now()}`

  const distSentinelPath = path.join(rootDir, "dist", sentinelFilename)
  const androidSentinelPath = path.join(
    rootDir,
    "android",
    "app",
    "src",
    "main",
    "assets",
    "public",
    sentinelFilename,
  )

  try {
    // 1. Write sentinel to dist
    fs.writeFileSync(distSentinelPath, sentinelContent, "utf8")
    assert(fs.existsSync(distSentinelPath), "Sentinel file not written to dist")

    // 2. Trigger sync:android
    execSync("npm run sync:android", {
      cwd: rootDir,
      encoding: "utf8",
      stdio: "pipe",
    })

    // 3. Verify sentinel was propagated to android assets
    assert(
      fs.existsSync(androidSentinelPath),
      "Sentinel file did NOT propagate to android/app/src/main/assets/public/",
    )
    const copiedContent = fs.readFileSync(androidSentinelPath, "utf8")
    assert.strictEqual(
      copiedContent,
      sentinelContent,
      "Content mismatch in propagated sentinel file",
    )
    console.log(`    Propagated sentinel verified: ${sentinelFilename}`)
  } finally {
    // 4. Cleanup
    if (fs.existsSync(distSentinelPath)) fs.unlinkSync(distSentinelPath)
    if (fs.existsSync(androidSentinelPath)) fs.unlinkSync(androidSentinelPath)

    // Re-sync to ensure clean native state
    execSync("npm run sync:android", {
      cwd: rootDir,
      encoding: "utf8",
      stdio: "pipe",
    })
    assert(
      !fs.existsSync(androidSentinelPath),
      "Sentinel remained in android after clean resync",
    )
  }
})

test("Adversarial Resilience Test: build:android succeeds even when dist is completely removed", () => {
  const distDir = path.join(rootDir, "dist")
  const distBackup = path.join(rootDir, "dist.stress.bak")

  try {
    if (fs.existsSync(distBackup)) {
      fs.rmSync(distBackup, { recursive: true, force: true })
    }
    fs.renameSync(distDir, distBackup)
    assert(!fs.existsSync(distDir), "Failed to temporarily remove dist")

    // Run build:android - should compile dist and then sync
    const stdout = execSync("npm run build:android", {
      cwd: rootDir,
      encoding: "utf8",
      stdio: "pipe",
    })

    assert(fs.existsSync(distDir), "build:android did not re-create dist")
    assert(
      fs.existsSync(path.join(distDir, "index.html")),
      "rebuilt dist missing index.html",
    )
    assert(
      fs.existsSync(publicIndexPath),
      "rebuilt android assets missing index.html",
    )
    console.log("    build:android resiliently recreated dist from scratch")
  } finally {
    if (fs.existsSync(distBackup)) {
      fs.rmSync(distBackup, { recursive: true, force: true })
    }
  }
})

// -----------------------------------------------------------------------------
// SUITE 6: Typecheck and Lint Diagnostics
// -----------------------------------------------------------------------------
console.log("\n--- SUITE 6: Typecheck and Lint Diagnostics ---")

test("npx tsc --noEmit completes with 0 errors across entire repository", () => {
  const stdout = execSync("npx tsc --noEmit", {
    cwd: rootDir,
    encoding: "utf8",
    stdio: "pipe",
  })
  console.log("    TypeScript typecheck passed with 0 errors.")
})

// -----------------------------------------------------------------------------
// SUMMARY & REPORT GENERATION
// -----------------------------------------------------------------------------
console.log(
  "\n================================================================",
)
console.log(`TOTAL TESTS: ${results.total}`)
console.log(`PASSED:      ${results.passed}`)
console.log(`FAILED:      ${results.failed}`)
console.log(
  "================================================================\n",
)

if (results.failed > 0) {
  console.error(`Verdict: REJECT (${results.failed} test failures)`)
  process.exit(1)
} else {
  console.log("Verdict: APPROVE (100% tests passed)")
  process.exit(0)
}
