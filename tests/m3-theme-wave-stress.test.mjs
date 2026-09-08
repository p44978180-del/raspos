import fs from "node:fs"
import path from "node:path"
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
console.log(" MILESTONE 3 EMPIRICAL STRESS TEST SUITE: THEME & WAVE ")
console.log("================================================================\n")

// -----------------------------------------------------------------------------
// SUITE 1: TypeScript Build & Vite Bundle Integrity
// -----------------------------------------------------------------------------
console.log("--- SUITE 1: TypeScript & Vite Production Build ---")

test("TypeScript compilation (tsc --noEmit) exits with code 0 and zero errors", () => {
  const output = execSync("npx tsc --noEmit", {
    cwd: rootDir,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  })
  assert.strictEqual(output.trim(), "", `Expected empty output from tsc, got: ${output}`)
})

test("Vite production build (npm run build) succeeds and produces required artifacts", () => {
  const buildOutput = execSync("npm run build", {
    cwd: rootDir,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  })
  assert(buildOutput.includes("built in"), "Build output does not indicate successful completion")

  const distPath = path.join(rootDir, "dist")
  assert(fs.existsSync(distPath), "dist/ folder does not exist")
  assert(fs.existsSync(path.join(distPath, "index.html")), "dist/index.html does not exist")

  const assetsDir = path.join(distPath, "assets")
  assert(fs.existsSync(assetsDir), "dist/assets does not exist")
  const assetFiles = fs.readdirSync(assetsDir)
  const hasJs = assetFiles.some((f) => f.startsWith("index-") && f.endsWith(".js"))
  const hasCss = assetFiles.some((f) => f.startsWith("index-") && f.endsWith(".css"))
  assert(hasJs, "dist/assets has no index-*.js bundle")
  assert(hasCss, "dist/assets has no index-*.css stylesheet")
})

// -----------------------------------------------------------------------------
// SUITE 2: Radial Wave Mathematical Geometry & Viewport Coverage Oracle
// -----------------------------------------------------------------------------
console.log("\n--- SUITE 2: Radial Wave Mathematical Geometry & Coverage ---")

function calcMaxRadius(x, y, w, h) {
  return Math.hypot(
    Math.max(x, w - x),
    Math.max(y, h - y),
  )
}

function verifyViewportCoverage(x, y, w, h) {
  const radius = calcMaxRadius(x, y, w, h)
  const corners = [
    { name: "Top-Left (0,0)", cx: 0, cy: 0 },
    { name: "Top-Right (W,0)", cx: w, cy: 0 },
    { name: "Bottom-Left (0,H)", cx: 0, cy: h },
    { name: "Bottom-Right (W,H)", cx: w, cy: h },
  ]
  let maxCornerDist = 0
  for (const c of corners) {
    const dist = Math.hypot(x - c.cx, y - c.cy)
    if (dist > maxCornerDist) maxCornerDist = dist
    assert(
      radius >= dist - 1e-9,
      `Radius ${radius} fails to cover corner ${c.name} at distance ${dist} from (${x},${y}) on ${w}x${h}`,
    )
  }
  // Radius must equal the maximum corner distance (optimal coverage)
  assert(
    Math.abs(radius - maxCornerDist) < 1e-9,
    `Radius is not minimal optimal: max corner dist is ${maxCornerDist}, radius is ${radius}`,
  )
  return radius
}

const viewports = [
  { name: "iPhone SE", w: 375, h: 667 },
  { name: "iPhone 14 Pro", w: 393, h: 852 },
  { name: "Pixel 7", w: 412, h: 915 },
  { name: "iPad Air", w: 820, h: 1180 },
  { name: "iPad Pro Landscape", w: 1366, h: 1024 },
  { name: "Full HD Desktop", w: 1920, h: 1080 },
  { name: "QHD Monitor", w: 2560, h: 1440 },
  { name: "4K UHD Display", w: 3840, h: 2160 },
  { name: "Ultrawide", w: 3440, h: 1440 },
  { name: "Super Ultrawide", w: 5120, h: 1440 },
  { name: "Square Viewport", w: 1000, h: 1000 },
]

test("Wave radius at (0, 0) equals diagonal sqrt(W^2 + H^2) for all viewports", () => {
  for (const vp of viewports) {
    const expected = Math.hypot(vp.w, vp.h)
    const computed = calcMaxRadius(0, 0, vp.w, vp.h)
    assert(
      Math.abs(computed - expected) < 1e-9,
      `Failed on ${vp.name}: computed ${computed} != expected ${expected}`,
    )
    verifyViewportCoverage(0, 0, vp.w, vp.h)
  }
})

test("Wave radius at (W, H) equals diagonal sqrt(W^2 + H^2) for all viewports", () => {
  for (const vp of viewports) {
    const expected = Math.hypot(vp.w, vp.h)
    const computed = calcMaxRadius(vp.w, vp.h, vp.w, vp.h)
    assert(
      Math.abs(computed - expected) < 1e-9,
      `Failed on ${vp.name}: computed ${computed} != expected ${expected}`,
    )
    verifyViewportCoverage(vp.w, vp.h, vp.w, vp.h)
  }
})

test("Wave radius at (W/2, H/2) equals half diagonal 0.5 * sqrt(W^2 + H^2) for all viewports", () => {
  for (const vp of viewports) {
    const expected = 0.5 * Math.hypot(vp.w, vp.h)
    const computed = calcMaxRadius(vp.w / 2, vp.h / 2, vp.w, vp.h)
    assert(
      Math.abs(computed - expected) < 1e-9,
      `Failed on ${vp.name}: computed ${computed} != expected ${expected}`,
    )
    verifyViewportCoverage(vp.w / 2, vp.h / 2, vp.w, vp.h)
  }
})

test("Wave radius at top-right (W, 0) and bottom-left (0, H) covers entire viewport", () => {
  for (const vp of viewports) {
    const rTR = calcMaxRadius(vp.w, 0, vp.w, vp.h)
    const rBL = calcMaxRadius(0, vp.h, vp.w, vp.h)
    const diag = Math.hypot(vp.w, vp.h)
    assert(Math.abs(rTR - diag) < 1e-9)
    assert(Math.abs(rBL - diag) < 1e-9)
    verifyViewportCoverage(vp.w, 0, vp.w, vp.h)
    verifyViewportCoverage(0, vp.h, vp.w, vp.h)
  }
})

test("Wave radius at edge midpoints covers entire viewport", () => {
  for (const vp of viewports) {
    verifyViewportCoverage(vp.w / 2, 0, vp.w, vp.h) // Top middle
    verifyViewportCoverage(vp.w / 2, vp.h, vp.w, vp.h) // Bottom middle
    verifyViewportCoverage(0, vp.h / 2, vp.w, vp.h) // Left middle
    verifyViewportCoverage(vp.w, vp.h / 2, vp.w, vp.h) // Right middle
  }
})

test("Randomized Monte Carlo stress test: 2,000 points across viewports maintain 100% corner coverage", () => {
  let tested = 0
  for (const vp of viewports) {
    for (let i = 0; i < 200; i++) {
      const rx = Math.random() * vp.w
      const ry = Math.random() * vp.h
      verifyViewportCoverage(rx, ry, vp.w, vp.h)
      tested++
    }
  }
  assert.strictEqual(tested, viewports.length * 200)
})

test("Degenerate and boundary cases: zero, 1px, negative coordinates, out-of-bounds", () => {
  // 0 x 0 viewport
  assert.strictEqual(calcMaxRadius(0, 0, 0, 0), 0)
  // 1 x 1 viewport
  assert.strictEqual(calcMaxRadius(0, 0, 1, 1), Math.SQRT2)
  assert.strictEqual(calcMaxRadius(0.5, 0.5, 1, 1), Math.SQRT1_2)

  // Clicks outside viewport (e.g. overscroll or popup elements)
  const outsideR = calcMaxRadius(-50, -50, 1000, 1000)
  assert(outsideR >= Math.hypot(1050, 1050), "Outside negative click radius calculation valid")

  const outsideFar = calcMaxRadius(1200, 1200, 1000, 1000)
  assert(outsideFar >= Math.hypot(1200, 1200), "Outside positive click radius calculation valid")
})

// -----------------------------------------------------------------------------
// SUITE 3: Theme Persistence & Class Synchronization
// -----------------------------------------------------------------------------
console.log("\n--- SUITE 3: Theme Persistence & Storage Protocol ---")

const appTsxContent = fs.readFileSync(path.join(rootDir, "src", "App.tsx"), "utf8")

test("App.tsx implements localStorage key 'rgau_theme' read on initialization", () => {
  assert(
    appTsxContent.includes("localStorage.getItem(\"rgau_theme\")") ||
    appTsxContent.includes("localStorage.getItem('rgau_theme')"),
    "App.tsx must read 'rgau_theme' from localStorage",
  )
})

test("App.tsx implements localStorage key 'rgau_theme' write on toggle", () => {
  assert(
    appTsxContent.includes('localStorage.setItem("rgau_theme"') ||
    appTsxContent.includes("localStorage.setItem('rgau_theme'"),
    "App.tsx must persist next theme to 'rgau_theme'",
  )
})

test("App.tsx synchronizes document.documentElement.classList.toggle('dark', ...)", () => {
  assert(
    appTsxContent.includes("document.documentElement.classList.toggle(\"dark\"") ||
    appTsxContent.includes("document.documentElement.classList.toggle('dark'"),
    "App.tsx must synchronize 'dark' class on documentElement via useEffect",
  )
})

test("App.tsx wraps localStorage in try-catch to prevent crashes in private browsing", () => {
  const getItemMatch = appTsxContent.match(/try\s*\{[^}]*localStorage\.getItem\([^)]*rgau_theme[^)]*\)[^}]*\}\s*catch/s)
  assert(getItemMatch, "localStorage.getItem('rgau_theme') must be wrapped in try/catch")

  const setItemMatches = [...appTsxContent.matchAll(/try\s*\{[^}]*localStorage\.setItem\([^;]*rgau_theme[^;]*\)[^}]*\}\s*catch/gs)]
  assert(setItemMatches.length >= 1, "localStorage.setItem('rgau_theme') must be wrapped in try/catch")
})

test("App.tsx falls back gracefully to window.matchMedia when localStorage is empty", () => {
  assert(
    appTsxContent.includes("window.matchMedia(\"(prefers-color-scheme: dark)\").matches") ||
    appTsxContent.includes("window.matchMedia('(prefers-color-scheme: dark)').matches"),
    "Must check prefers-color-scheme when no saved theme exists in localStorage",
  )
})

// -----------------------------------------------------------------------------
// SUITE 4: Animation & View Transitions API Styling Integrity
// -----------------------------------------------------------------------------
console.log("\n--- SUITE 4: CSS Animation & View Transitions Architecture ---")

const indexCssContent = fs.readFileSync(path.join(rootDir, "src", "index.css"), "utf8")

test("src/index.css defines ::view-transition-old(root) and ::view-transition-new(root)", () => {
  assert(
    indexCssContent.includes("::view-transition-old(root)"),
    "index.css must declare ::view-transition-old(root)",
  )
  assert(
    indexCssContent.includes("::view-transition-new(root)"),
    "index.css must declare ::view-transition-new(root)",
  )
})

test("src/index.css defines radial-wave-expand keyframe with CSS variables", () => {
  assert(
    indexCssContent.includes("@keyframes radial-wave-expand"),
    "index.css must define @keyframes radial-wave-expand",
  )
  assert(
    indexCssContent.includes("--wave-x") && indexCssContent.includes("--wave-y") && indexCssContent.includes("--wave-radius"),
    "Keyframe must reference CSS variables --wave-x, --wave-y, and --wave-radius",
  )
})

test("src/index.css defines .radial-wave-overlay with fixed positioning and pointer-events: none", () => {
  assert(
    indexCssContent.includes(".radial-wave-overlay"),
    "index.css must define .radial-wave-overlay",
  )
  assert(
    indexCssContent.includes("position: fixed") && indexCssContent.includes("pointer-events: none"),
    ".radial-wave-overlay must be fixed and pointer-events: none to avoid blocking UI",
  )
})

test("src/index.css defines spring physics keyframes using authentic cubic-bezier(0.32, 0.72, 0, 1)", () => {
  assert(
    indexCssContent.includes("cubic-bezier(0.32, 0.72, 0, 1)"),
    "Spring animations must utilize cubic-bezier(0.32, 0.72, 0, 1)",
  )
})

test("src/index.css includes prefers-reduced-motion accessibility overrides", () => {
  assert(
    indexCssContent.includes("@media (prefers-reduced-motion: reduce)"),
    "CSS must respect prefers-reduced-motion",
  )
})

// -----------------------------------------------------------------------------
// SUITE 5: Component Wiring & Coordinate Forwarding
// -----------------------------------------------------------------------------
console.log("\n--- SUITE 5: Component Wiring & Coordinate Forwarding ---")

test("AppHeader accepts onDarkToggle with mouse click event coordinates", () => {
  assert(
    appTsxContent.includes("onDarkToggle={handleDarkToggle}"),
    "AppHeader must be wired with handleDarkToggle",
  )
  assert(
    appTsxContent.includes("const handleDarkToggle = (e?: React.MouseEvent) => {") ||
    appTsxContent.includes("function handleDarkToggle"),
    "handleDarkToggle must accept optional React.MouseEvent",
  )
})

test("handleDarkToggle computes origin coordinates from event with window center fallback", () => {
  assert(
    appTsxContent.includes("const x = e ? e.clientX : window.innerWidth / 2"),
    "Must extract e.clientX or fallback to window.innerWidth / 2",
  )
  assert(
    appTsxContent.includes("const y = e ? e.clientY : window.innerHeight / 2"),
    "Must extract e.clientY or fallback to window.innerHeight / 2",
  )
})

test("App.tsx renders radial-wave-overlay with computed CSS custom properties", () => {
  assert(
    appTsxContent.includes("radial-wave-overlay"),
    "Must render radial-wave-overlay element",
  )
  assert(
    appTsxContent.includes("--wave-x") &&
    appTsxContent.includes("--wave-y") &&
    appTsxContent.includes("--wave-radius"),
    "Overlay must inject --wave-x, --wave-y, and --wave-radius styles",
  )
})

// -----------------------------------------------------------------------------
// SUMMARY & VERDICT
// -----------------------------------------------------------------------------
console.log("\n================================================================")
console.log(`TOTAL TESTS: ${results.total}`)
console.log(`PASSED:      ${results.passed}`)
console.log(`FAILED:      ${results.failed}`)
console.log("================================================================")

if (results.failed > 0) {
  console.error(`\nOVERALL VERDICT: REJECT (${results.failed} tests failed)`)
  process.exit(1)
} else {
  console.log("\nOVERALL VERDICT: APPROVE (All tests passed)")
  process.exit(0)
}
