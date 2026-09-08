/**
 * Empirical Adversarial Stress Test Harness for Milestone 4:
 * Automated Verification, CI/CD Pipeline & Subpath Asset Resolution
 *
 * This test suite independently and empirically validates:
 * 1. Strict TypeScript Typechecking across all sources (src/, vite.config.ts, capacitor.config.ts)
 * 2. Build Matrix Robustness: Production bundle compilation and distribution artifact integrity
 * 3. Subpath Simulation & Relative Asset Resolution: Multi-environment URL resolution without subpath escape
 * 4. CI/CD GitHub Actions Workflow Verification (.github/workflows/deploy.yml)
 * 5. Milestone Regression Invariance: Regression checks against M1 and M3 test suites
 * 6. Adversarial Edge Cases: Fuzzing subpath permutations, malformed paths, and security constraints
 */

import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { execSync, spawnSync } from "node:child_process"
import zlib from "node:zlib"
import ts from "typescript"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, "..")
const distDir = path.resolve(rootDir, "dist")

// ─── Test Runner Harness ──────────────────────────────────────────────────────

let totalAssertions = 0
let passedAssertions = 0
let failedAssertions = 0
const failures = []

function assert(condition, message, details = "") {
  totalAssertions++
  if (condition) {
    passedAssertions++
  } else {
    failedAssertions++
    const err = `FAIL: ${message}${details ? " | Details: " + details : ""}`
    failures.push(err)
    console.error("  ❌ " + err)
  }
}

function assertEqual(actual, expected, message) {
  assert(
    actual === expected,
    message,
    `expected "${expected}", got "${actual}"`
  )
}

function assertMatch(str, regex, message) {
  assert(
    regex.test(str),
    message,
    `string did not match pattern ${regex}`
  )
}

function assertIncludes(actual, expectedSub, message) {
  assert(
    actual && actual.includes(expectedSub),
    message,
    `expected to include "${expectedSub}"`
  )
}

console.log("══════════════════════════════════════════════════════════════════════")
console.log("🧪 MILESTONE 4 EMPIRICAL ADVERSARIAL STRESS TEST: CI/CD & BUILD MATRIX")
console.log("══════════════════════════════════════════════════════════════════════\n")

// ─── SUITE 1: Strict TypeScript Typechecking Across All Configurations ────────

console.log("─── SUITE 1: Strict TypeScript Typecheck & Static Analysis ───")

// 1.1 Verify tsconfig.json configuration and includes
const tsconfigPath = path.join(rootDir, "tsconfig.json")
assert(fs.existsSync(tsconfigPath), "tsconfig.json exists on disk")

let tsconfig = {}
try {
  tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, "utf-8"))
  assert(true, "tsconfig.json is valid JSON")
} catch (e) {
  assert(false, "tsconfig.json is valid JSON", e.message)
}

assertEqual(tsconfig.compilerOptions?.strict, true, "tsconfig compilerOptions.strict is true")
assertEqual(tsconfig.compilerOptions?.noEmit, true, "tsconfig compilerOptions.noEmit is true")
assert(Array.isArray(tsconfig.include), "tsconfig include is an array")
assert(tsconfig.include.includes("src"), "tsconfig includes 'src'")
assert(tsconfig.include.includes("vite.config.ts"), "tsconfig includes 'vite.config.ts'")
assert(tsconfig.include.includes("capacitor.config.ts"), "tsconfig includes 'capacitor.config.ts'")

// 1.2 Programmatic TypeScript Compiler API Check
const configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile)
const parsedCommandLine = ts.parseJsonConfigFileContent(
  configFile.config,
  ts.sys,
  rootDir
)

const program = ts.createProgram({
  rootNames: parsedCommandLine.fileNames,
  options: parsedCommandLine.options,
})

const diagnostics = ts.getPreEmitDiagnostics(program)
const formattedDiagnostics = ts.formatDiagnosticsWithColorAndContext(diagnostics, {
  getCanonicalFileName: (f) => f,
  getCurrentDirectory: () => rootDir,
  getNewLine: () => "\n",
})

assertEqual(
  diagnostics.length,
  0,
  `ts.getPreEmitDiagnostics finds 0 errors across ${parsedCommandLine.fileNames.length} files`
)
if (diagnostics.length > 0) {
  console.error(formattedDiagnostics)
}

// 1.3 Verify npm run typecheck command executes cleanly
try {
  const typecheckResult = execSync("npm run typecheck", {
    cwd: rootDir,
    encoding: "utf-8",
    stdio: "pipe",
  })
  assert(true, "npm run typecheck exited with code 0")
} catch (err) {
  assert(false, "npm run typecheck exited with code 0", err.stdout || err.stderr || err.message)
}

// 1.4 capacitor.config.ts Structural Verification
const capacitorConfigPath = path.join(rootDir, "capacitor.config.ts")
assert(fs.existsSync(capacitorConfigPath), "capacitor.config.ts exists on disk")
const capContent = fs.readFileSync(capacitorConfigPath, "utf-8")
assertMatch(capContent, /appId:\s*["']ru\.timacad\.student["']/, "capacitor appId is 'ru.timacad.student'")
assertMatch(capContent, /appName:\s*["']РГАУ Расписание["']/, "capacitor appName is 'РГАУ Расписание'")
assertMatch(capContent, /webDir:\s*["']dist["']/, "capacitor webDir is 'dist'")
assertMatch(capContent, /androidScheme:\s*["']https["']/, "capacitor androidScheme is 'https'")

console.log("  ✓ SUITE 1 complete.\n")


// ─── SUITE 2: Build Matrix Robustness & Production Bundle Generation ──────────

console.log("─── SUITE 2: Build Matrix Robustness & Production Artifacts ───")

// 2.1 Trigger fresh production build
try {
  const buildOutput = execSync("npm run build", {
    cwd: rootDir,
    encoding: "utf-8",
    stdio: "pipe",
  })
  assert(true, "npm run build completes with exit code 0")
  assertMatch(buildOutput, /built in \d+ms/, "Vite build outputs build duration confirmation")
} catch (err) {
  assert(false, "npm run build completes with exit code 0", err.stdout || err.stderr || err.message)
}

// 2.2 Verify dist/ root artifacts
assert(fs.existsSync(distDir), "dist directory exists after build")

const indexHtmlPath = path.join(distDir, "index.html")
assert(fs.existsSync(indexHtmlPath), "dist/index.html exists")
const indexHtmlStat = fs.statSync(indexHtmlPath)
assert(indexHtmlStat.size > 1000, `dist/index.html is non-trivial (${indexHtmlStat.size} bytes > 1000)`)

const manifestWebmanifestPath = path.join(distDir, "manifest.webmanifest")
assert(fs.existsSync(manifestWebmanifestPath), "dist/manifest.webmanifest exists")

const manifestJsonPath = path.join(distDir, "manifest.json")
assert(fs.existsSync(manifestJsonPath), "dist/manifest.json exists")

// Byte-equivalence between webmanifest and json
const webmanifestRaw = fs.readFileSync(manifestWebmanifestPath)
const jsonRaw = fs.readFileSync(manifestJsonPath)
assertEqual(webmanifestRaw.equals(jsonRaw), true, "dist/manifest.webmanifest and dist/manifest.json are byte-identical")

const manifestObj = JSON.parse(webmanifestRaw.toString("utf-8"))
assertEqual(manifestObj.display, "standalone", "manifest display is standalone")
assertEqual(manifestObj.name, "РГАУ-МСХА Расписание", "manifest name is correct")
assertEqual(manifestObj.short_name, "РГАУ Студент", "manifest short_name is correct")
assertEqual(manifestObj.theme_color, "#2D5016", "manifest theme_color is #2D5016")
assertEqual(manifestObj.background_color, "#F4F1EB", "manifest background_color is #F4F1EB")
assert(Array.isArray(manifestObj.icons) && manifestObj.icons.length >= 4, "manifest has >= 4 icon definitions")

// 2.3 Verify robots.txt
const robotsTxtPath = path.join(distDir, "robots.txt")
assert(fs.existsSync(robotsTxtPath), "dist/robots.txt exists")
const robotsTxtContent = fs.readFileSync(robotsTxtPath, "utf-8")
assert(robotsTxtContent.length > 0, "dist/robots.txt is not empty")
assertMatch(robotsTxtContent, /User-agent:/i, "dist/robots.txt contains User-agent declaration")

// 2.4 Verify assets directory & chunk metrics
const assetsDir = path.join(distDir, "assets")
assert(fs.existsSync(assetsDir), "dist/assets directory exists")
const assetFiles = fs.readdirSync(assetsDir)

const jsChunks = assetFiles.filter((f) => f.endsWith(".js"))
const cssChunks = assetFiles.filter((f) => f.endsWith(".css"))
const imgAssets = assetFiles.filter((f) => /\.(png|jpe?g|svg|webp)$/i.test(f))

assert(jsChunks.length >= 1, `dist/assets contains at least 1 JS chunk (found: ${jsChunks.join(", ")})`)
assert(cssChunks.length >= 1, `dist/assets contains at least 1 CSS chunk (found: ${cssChunks.join(", ")})`)
assert(imgAssets.length >= 1, `dist/assets contains at least 1 image asset (found: ${imgAssets.join(", ")})`)

// Check chunk sizes against performance budget (< 1MB JS uncompressed, < 200KB CSS)
for (const jsChunk of jsChunks) {
  const stat = fs.statSync(path.join(assetsDir, jsChunk))
  assert(stat.size < 1024 * 1024, `JS chunk ${jsChunk} is within 1MB budget (${Math.round(stat.size / 1024)} kB)`)
  assert(stat.size > 50 * 1024, `JS chunk ${jsChunk} contains realistic compiled code (${Math.round(stat.size / 1024)} kB > 50 kB)`)

  // Gzip compression test
  const content = fs.readFileSync(path.join(assetsDir, jsChunk))
  const gzipped = zlib.gzipSync(content)
  const ratio = (gzipped.length / content.length) * 100
  assert(ratio < 40, `JS chunk ${jsChunk} gzip compression ratio is healthy (${ratio.toFixed(1)}% < 40%)`)
}

for (const cssChunk of cssChunks) {
  const stat = fs.statSync(path.join(assetsDir, cssChunk))
  assert(stat.size < 250 * 1024, `CSS chunk ${cssChunk} is within 250KB budget (${Math.round(stat.size / 1024)} kB)`)
  assert(stat.size > 10 * 1024, `CSS chunk ${cssChunk} contains Tailwind compiled styles (${Math.round(stat.size / 1024)} kB > 10 kB)`)
}

// 2.5 Verify icons directory in dist
const distIconsDir = path.join(distDir, "icons")
assert(fs.existsSync(distIconsDir), "dist/icons directory exists")
const expectedIcons = [
  "icon-192.png",
  "icon-512.png",
  "icon-maskable-512.png",
  "apple-touch-icon.png",
  "icon.svg",
]
for (const icon of expectedIcons) {
  const iconPath = path.join(distIconsDir, icon)
  assert(fs.existsSync(iconPath), `dist/icons/${icon} exists`)
  if (fs.existsSync(iconPath)) {
    const size = fs.statSync(iconPath).size
    assert(size > 0, `dist/icons/${icon} is non-empty (${size} bytes)`)
  }
}

// 2.6 Verify vite.config.ts base path logic
const viteConfigContent = fs.readFileSync(path.join(rootDir, "vite.config.ts"), "utf-8")
assertMatch(
  viteConfigContent,
  /base:\s*process\.env\.FIGMA_PUBLIC_URL\s*\?\s*`\${process\.env\.FIGMA_PUBLIC_URL}\/`\s*:\s*\(process\.env\.BASE_URL\s*\|\|\s*["']\.\/["']\)/,
  "vite.config.ts correctly falls back to relative './' or BASE_URL"
)

// 2.7 Build Matrix Matrix Test: Environment Override with BASE_URL
try {
  const customSubpath = "/gh-pages-subpath-test/"
  execSync("npm run build", {
    cwd: rootDir,
    encoding: "utf-8",
    stdio: "pipe",
    env: { ...process.env, BASE_URL: customSubpath, FIGMA_PUBLIC_URL: "" },
  })
  const customHtml = fs.readFileSync(indexHtmlPath, "utf-8")
  assertIncludes(
    customHtml,
    `${customSubpath}assets/`,
    `Build matrix responds to BASE_URL override with ${customSubpath}assets/`
  )

  // Restore clean default build
  execSync("npm run build", {
    cwd: rootDir,
    encoding: "utf-8",
    stdio: "pipe",
    env: { ...process.env, BASE_URL: "", FIGMA_PUBLIC_URL: "" },
  })
  const restoredHtml = fs.readFileSync(indexHtmlPath, "utf-8")
  assertIncludes(
    restoredHtml,
    `./assets/`,
    "Build matrix restores default relative './assets/' without BASE_URL"
  )
} catch (err) {
  assert(false, "Build matrix BASE_URL override build succeeded", err.stdout || err.stderr || err.message)
}

console.log("  ✓ SUITE 2 complete.\n")



// ─── SUITE 3: Subpath Simulation & Relative Asset Resolution ──────────────────

console.log("─── SUITE 3: Subpath Simulation & Relative Asset Resolution ───")

const indexHtmlContent = fs.readFileSync(indexHtmlPath, "utf-8")

// 3.1 Extract all asset references from dist/index.html
const scriptSrcRegex = /<script\b[^>]*?\bsrc=["']([^"']+)["'][^>]*>/gi
const linkHrefRegex = /<link\b[^>]*?\bhref=["']([^"']+)["'][^>]*>/gi
const imgSrcRegex = /<img\b[^>]*?\bsrc=["']([^"']+)["'][^>]*>/gi

const extractedRefs = []

let match
while ((match = scriptSrcRegex.exec(indexHtmlContent)) !== null) {
  extractedRefs.push({ tag: "script", attr: "src", url: match[1] })
}
while ((match = linkHrefRegex.exec(indexHtmlContent)) !== null) {
  extractedRefs.push({ tag: "link", attr: "href", url: match[1] })
}
while ((match = imgSrcRegex.exec(indexHtmlContent)) !== null) {
  extractedRefs.push({ tag: "img", attr: "src", url: match[1] })
}

assert(extractedRefs.length >= 6, `Extracted ${extractedRefs.length} asset references from dist/index.html`)

// 3.2 Assert NO reference starts with absolute domain root / (which would break on subpaths)
for (const ref of extractedRefs) {
  // Allow absolute external HTTP/HTTPS if any, but disallow absolute paths like /assets/
  const isExternal = /^https?:\/\//i.test(ref.url)
  if (!isExternal) {
    assert(
      !ref.url.startsWith("/"),
      `Asset reference "${ref.url}" in <${ref.tag} ${ref.attr}="..."> MUST NOT start with absolute root /`,
      `Found forbidden absolute root path: ${ref.url}`
    )
    assert(
      ref.url.startsWith("./") || !ref.url.startsWith("/"),
      `Asset reference "${ref.url}" starts with relative './'`
    )
  }
}

// 3.3 Multi-environment Subpath Simulation
const simulatedSubpathBases = [
  { name: "GitHub Pages Repo Subpath", base: "https://timacad.github.io/raspos/" },
  { name: "Deep Multi-Level Subpath", base: "https://example.edu/rgau/msha/student/app/" },
  { name: "Capacitor Android Local Webview", base: "https://localhost/" },
  { name: "Custom Port Subpath", base: "http://127.0.0.1:8080/nested/app/" },
]

for (const sim of simulatedSubpathBases) {
  for (const ref of extractedRefs) {
    if (/^https?:\/\//i.test(ref.url)) continue

    const resolved = new URL(ref.url, sim.base)
    // Assert the resolved URL is strictly a descendant of sim.base
    const isDescendant = resolved.href.startsWith(sim.base)
    assert(
      isDescendant,
      `[${sim.name}] ${ref.url} resolves strictly within subpath`,
      `Base: ${sim.base} -> Resolved: ${resolved.href}`
    )

    // Ensure it does not escape to root
    const rootUrl = new URL("/", sim.base).href
    const escapedToRoot = resolved.href.startsWith(rootUrl) && !resolved.href.startsWith(sim.base)
    assert(
      !escapedToRoot,
      `[${sim.name}] ${ref.url} does not escape to domain root`,
      `Escaped to: ${resolved.href}`
    )
  }
}

// 3.4 Physical Disk Existence Verification for all local references in dist/index.html
for (const ref of extractedRefs) {
  if (/^https?:\/\//i.test(ref.url)) continue

  // Clean relative prefix ./
  const relativeFilePath = ref.url.replace(/^\.\//, "").split("?")[0].split("#")[0]
  const targetDiskPath = path.resolve(distDir, relativeFilePath)

  // Directory traversal check
  assert(
    targetDiskPath.startsWith(distDir),
    `Path "${ref.url}" does not escape dist directory via directory traversal`
  )

  const exists = fs.existsSync(targetDiskPath)
  assert(
    exists,
    `Referenced asset "${ref.url}" physically exists in dist/ at ${relativeFilePath}`,
    `Full path: ${targetDiskPath}`
  )

  if (exists) {
    const size = fs.statSync(targetDiskPath).size
    assert(size > 0, `Referenced asset "${ref.url}" is non-empty (${size} bytes)`)
  }
}

// 3.5 Manifest Icon Relative Resolution & Disk Integrity
for (const icon of manifestObj.icons) {
  const iconSrc = icon.src
  assert(
    !iconSrc.startsWith("/"),
    `Manifest icon src "${iconSrc}" does not use absolute domain root /`
  )

  // Subpath simulation
  const simPagesUrl = new URL(iconSrc, "https://timacad.github.io/raspos/")
  assert(
    simPagesUrl.href.startsWith("https://timacad.github.io/raspos/"),
    `Manifest icon "${iconSrc}" resolves inside GitHub Pages subpath`
  )

  // Physical disk existence
  const cleanPath = iconSrc.replace(/^\.\//, "").split("?")[0]
  const iconDiskPath = path.resolve(distDir, cleanPath)
  assert(
    fs.existsSync(iconDiskPath),
    `Manifest icon "${iconSrc}" physically exists in dist/ at ${cleanPath}`
  )
}

console.log("  ✓ SUITE 3 complete.\n")


// ─── SUITE 4: GitHub Actions Workflow Structural & Security Verification ──────

console.log("─── SUITE 4: GitHub Actions Workflow Integrity (.github/workflows/deploy.yml) ───")

const deployYamlPath = path.join(rootDir, ".github", "workflows", "deploy.yml")
assert(fs.existsSync(deployYamlPath), ".github/workflows/deploy.yml exists")

const deployYamlContent = fs.readFileSync(deployYamlPath, "utf-8")

// 4.1 Workflow triggers
assertMatch(deployYamlContent, /name:\s*Deploy to GitHub Pages/, "Workflow name is 'Deploy to GitHub Pages'")
assertMatch(deployYamlContent, /push:\s*\n\s*branches:\s*\n\s*-\s*main\s*\n\s*-\s*master/, "Workflow triggers on push to main and master")
assertMatch(deployYamlContent, /workflow_dispatch:/, "Workflow includes workflow_dispatch trigger")

// 4.2 Principle of Least Privilege Permissions
assertMatch(deployYamlContent, /permissions:\s*\n\s*contents:\s*read\s*\n\s*pages:\s*write\s*\n\s*id-token:\s*write/, "Top-level permissions strictly limited to contents:read, pages:write, id-token:write")

// 4.3 Concurrency Control
assertMatch(deployYamlContent, /concurrency:\s*\n\s*group:\s*['"]pages['"]\s*\n\s*cancel-in-progress:\s*false/, "Concurrency group is 'pages' with cancel-in-progress: false")

// 4.4 Two-job architecture: build and deploy
assertMatch(deployYamlContent, /jobs:\s*(?:#[^\n]*\r?\n\s*)*build:/, "Workflow defines 'build' job")
assertMatch(deployYamlContent, /deploy:\s*(?:\r?\n\s*#[^\n]*)*\r?\n\s*name:\s*Deploy to Pages\s*(?:\r?\n\s*#[^\n]*)*\r?\n\s*needs:\s*build/, "Workflow defines 'deploy' job with needs: build")


// 4.5 Toolchain synchronization with .mise.toml
const miseTomlPath = path.join(rootDir, ".mise.toml")
assert(fs.existsSync(miseTomlPath), ".mise.toml exists")
const miseContent = fs.readFileSync(miseTomlPath, "utf-8")

const pnpmVersionMatch = miseContent.match(/["']?npm:pnpm["']?\s*=\s*["']([^"']+)["']/)
const nodeVersionMatch = miseContent.match(/node\s*=\s*["']([^"']+)["']/)

assert(pnpmVersionMatch !== null, "Found pnpm version in .mise.toml")
assert(nodeVersionMatch !== null, "Found node version in .mise.toml")

const expectedPnpmVersion = pnpmVersionMatch ? pnpmVersionMatch[1] : "10.34.3"
const expectedNodeVersion = nodeVersionMatch ? nodeVersionMatch[1] : "22"

assertIncludes(
  deployYamlContent,
  `version: ${expectedPnpmVersion}`,
  `deploy.yml pins pnpm version ${expectedPnpmVersion} matching .mise.toml`
)
assertIncludes(
  deployYamlContent,
  `node-version: ${expectedNodeVersion}`,
  `deploy.yml pins node version ${expectedNodeVersion} matching .mise.toml`
)

// 4.6 Verification of required build steps
assertMatch(deployYamlContent, /pnpm install --frozen-lockfile/, "Build job runs pnpm install with --frozen-lockfile")
assertMatch(deployYamlContent, /pnpm exec tsc --noEmit/, "Build job executes strict pre-build typecheck (pnpm exec tsc --noEmit)")
assertMatch(deployYamlContent, /actions\/configure-pages@v5/, "Build job utilizes actions/configure-pages@v5")
assertMatch(deployYamlContent, /BASE_URL:\s*\${{\s*steps\.pages\.outputs\.base_path\s*\|\|\s*['"]\.\/['"]\s*}}/, "Build job passes BASE_URL from configure-pages with relative fallback")
assertMatch(deployYamlContent, /actions\/upload-pages-artifact@v3/, "Build job uploads artifact via actions/upload-pages-artifact@v3")
assertMatch(deployYamlContent, /path:\s*['"]\.\/dist['"]/, "Upload artifact targets './dist'")

// 4.7 Verification of deploy job
assertMatch(deployYamlContent, /environment:\s*\n\s*name:\s*github-pages/, "Deploy job specifies environment: github-pages")
assertMatch(deployYamlContent, /actions\/deploy-pages@v4/, "Deploy job uses actions/deploy-pages@v4")

// 4.8 Verify build-android.yml also exists and is valid
const androidWorkflowPath = path.join(rootDir, ".github", "workflows", "build-android.yml")
assert(fs.existsSync(androidWorkflowPath), ".github/workflows/build-android.yml exists")
const androidWorkflowContent = fs.readFileSync(androidWorkflowPath, "utf-8")
assertMatch(androidWorkflowContent, /name:\s*Build Android/, "Android workflow name is valid")
assertMatch(androidWorkflowContent, /gradle/i, "Android workflow references Gradle")

console.log("  ✓ SUITE 4 complete.\n")


// ─── SUITE 5: Regression Verification Across Prior Milestones (M1, M3) ────────

console.log("─── SUITE 5: Regression Verification Across Prior Milestones ───")

// 5.1 Run Milestone 1 Manifest & Brand Assets Stress Test Suite
console.log("  Running tests/manifest-stress.test.mjs...")
try {
  const m1Output = execSync("node tests/manifest-stress.test.mjs", {
    cwd: rootDir,
    encoding: "utf-8",
    stdio: "pipe",
  })
  assertMatch(m1Output, /TOTAL TESTS: 16 \| PASSED: 16 \| FAILED: 0/, "M1 manifest stress suite passes 16/16 tests")
  assert(true, "tests/manifest-stress.test.mjs executed with exit code 0")
} catch (err) {
  assert(false, "tests/manifest-stress.test.mjs executed with exit code 0", err.stdout || err.stderr || err.message)
}

// 5.2 Run Milestone 3 Cartography & Spring Motion Stress Test Suite
console.log("  Running tests/m3-cartography-spring-stress.test.mjs...")
try {
  const m3Output = execSync("node tests/m3-cartography-spring-stress.test.mjs", {
    cwd: rootDir,
    encoding: "utf-8",
    stdio: "pipe",
  })
  assertMatch(
    m3Output,
    /Passed Assertions:\s+1059 \(100\.0%\)/,
    "M3 cartography and spring motion suite passes all 1059 assertions (100.0%)"
  )
  assertMatch(m3Output, /VERDICT:\s*APPROVE/, "M3 test suite yields VERDICT: APPROVE")
  assert(true, "tests/m3-cartography-spring-stress.test.mjs executed with exit code 0")
} catch (err) {
  assert(false, "tests/m3-cartography-spring-stress.test.mjs executed with exit code 0", err.stdout || err.stderr || err.message)
}

console.log("  ✓ SUITE 5 complete.\n")


// ─── SUITE 6: Adversarial Edge Cases, Fuzzing & Header Verification ───────────

console.log("─── SUITE 6: Adversarial Edge Cases & Fuzzing ───")

// 6.1 Viewport & Apple PWA Meta Headers in dist/index.html
assertMatch(indexHtmlContent, /<meta[^>]+name=["']viewport["'][^>]+viewport-fit=cover/i, "index.html has viewport-fit=cover")
assertMatch(indexHtmlContent, /<meta[^>]+name=["']apple-mobile-web-app-capable["'][^>]+content=["']yes["']/i, "index.html has apple-mobile-web-app-capable=yes")
assertMatch(indexHtmlContent, /<meta[^>]+name=["']apple-mobile-web-app-status-bar-style["']/i, "index.html has apple-mobile-web-app-status-bar-style")
assertMatch(indexHtmlContent, /<meta[^>]+name=["']apple-mobile-web-app-title["'][^>]+content=["']РГАУ Студент["']/i, "index.html has apple-mobile-web-app-title='РГАУ Студент'")

// 6.2 Module script crossorigin verification
assertMatch(indexHtmlContent, /<script[^>]+type=["']module["'][^>]+crossorigin/i, "Vite emitted module script includes crossorigin attribute")

// 6.3 Subpath Fuzzing with 20 varied URI combinations
const fuzzPrefixes = [
  "https://sub.domain.com/app/",
  "https://university.ru/portal/student/timetable/",
  "http://localhost:3000/",
  "http://192.168.1.100:8080/demo/",
  "https://pages.github.io/~username/repo-name/",
]

for (const prefix of fuzzPrefixes) {
  for (const ref of extractedRefs) {
    if (/^https?:\/\//i.test(ref.url)) continue

    const parsed = new URL(ref.url, prefix)
    assertEqual(
      parsed.href.startsWith(prefix),
      true,
      `Fuzz base "${prefix}" correctly scopes ref "${ref.url}"`
    )
  }
}

// 6.4 Verify package.json scripts completeness
const packageJson = JSON.parse(fs.readFileSync(path.join(rootDir, "package.json"), "utf-8"))
assertEqual(packageJson.scripts?.typecheck, "tsc --noEmit", "package.json scripts.typecheck is 'tsc --noEmit'")
assertEqual(packageJson.scripts?.build, "vite build", "package.json scripts.build is 'vite build'")
assertEqual(packageJson.scripts?.["build:android"], "vite build && cap sync android", "package.json scripts['build:android'] is correct")
assertEqual(packageJson.scripts?.["sync:android"], "cap sync android", "package.json scripts['sync:android'] is correct")

console.log("  ✓ SUITE 6 complete.\n")


// ─── FINAL SUMMARY & VERDICT ──────────────────────────────────────────────────

console.log("══════════════════════════════════════════════════════════════════════")
console.log("📊 MILESTONE 4 TEST RESULTS SUMMARY:")
console.log(`   Total Assertions Checked: ${totalAssertions}`)
console.log(`   Passed Assertions:        ${passedAssertions} (${((passedAssertions / totalAssertions) * 100).toFixed(1)}%)`)
console.log(`   Failed Assertions:        ${failedAssertions}`)

if (failures.length > 0) {
  console.log("\n❌ FAILURES RECORDED:")
  failures.forEach((f, idx) => console.log(`   ${idx + 1}. ${f}`))
}

const verdict = failedAssertions === 0 ? "APPROVE" : "REJECT"
console.log(`\n🏁 VERDICT: ${verdict}`)
console.log("══════════════════════════════════════════════════════════════════════\n")

if (failedAssertions > 0) {
  process.exit(1)
} else {
  process.exit(0)
}
