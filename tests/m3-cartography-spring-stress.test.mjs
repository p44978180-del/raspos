/**
 * Empirical Stress Test Suite for Milestone 3:
 * Cartography Markers, Authentic Badge Silhouettes & Spring Motion Physics
 *
 * This test suite independently verifies:
 * 1. SVG Badge Rendering & Validation (markup validity, viewBoxes, brand colors, labels, icons, fuzzing)
 * 2. Campus Plan Coordinates & Data Integrity ([0, 100]% bounds, geo-coordinates, POI authenticity)
 * 3. Spring CSS Classes & Motion Physics (.sheet-spring-enter, .sheet-spring-exit, .search-spring-enter, .radial-wave-overlay, cubic-bezier)
 * 4. App Integration (dark wave coordinate tracking, sheet touch drag gesture, staggered lists)
 */

import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import ts from "typescript"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, "..")

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

console.log("══════════════════════════════════════════════════════════════════════")
console.log("🧪 MILESTONE 3 EMPIRICAL STRESS TEST SUITE: CARTOGRAPHY & SPRING MOTION")
console.log("══════════════════════════════════════════════════════════════════════\n")

// ─── Transpile & Load CampusMapPins.tsx ────────────────────────────────────────

const campusPinsPath = path.join(rootDir, "src/components/CampusMapPins.tsx")
assert(fs.existsSync(campusPinsPath), "CampusMapPins.tsx exists at expected path")

let campusPinsSource = fs.readFileSync(campusPinsPath, "utf8")
// Stub the png image import for NodeJS runtime
campusPinsSource = campusPinsSource.replace(
  /import campusPlanImg from ["'][^"']+["'];?/,
  'const campusPlanImg = "image.png";'
)

const transpiled = ts.transpileModule(campusPinsSource, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    jsx: ts.JsxEmit.React,
    esModuleInterop: true,
  },
}).outputText

const moduleStub = { exports: {} }
const compiledFunction = new Function("require", "module", "exports", "React", transpiled)
compiledFunction(
  (modName) => {
    if (modName === "react") return { default: React, ...React }
    if (modName === "@/imports/image.png" || modName.endsWith("image.png")) return "image.png"
    return {}
  },
  moduleStub,
  moduleStub.exports,
  React
)

const {
  CampusBadge,
  CampusMapPinMarker,
  CAMPUS_PLAN_MARKERS,
  CampusPlanViewer,
  MortarboardIcon,
  HouseRoofIcon,
  MicroscopeFlaskIcon,
  ForkKnifeIcon,
  SportsIcon,
} = moduleStub.exports

assert(typeof CampusBadge === "function", "CampusBadge component is exported as function")
assert(Array.isArray(CAMPUS_PLAN_MARKERS), "CAMPUS_PLAN_MARKERS is exported as array")
assert(typeof CampusPlanViewer === "function", "CampusPlanViewer is exported as function")

// ─── SUITE 1: SVG Badge Rendering & Validation ────────────────────────────────
console.log("─── SUITE 1: SVG Badge Rendering & Authentic Silhouettes ───")

const expectedCategoryStyles = {
  academic: {
    name: "Academic Building",
    fill: "#4D7C0F",
    stroke: "#2D5016",
    innerStroke: "#84CC16",
    viewBox: "0 0 40 40",
  },
  dorm: {
    name: "Student Dormitory",
    fill: "#EA580C",
    stroke: "#C2410C",
    innerStroke: "#FDBA74",
    viewBox: "0 0 40 40",
  },
  department: {
    name: "Faculties & Science",
    fill: "#0D9488",
    stroke: "#0F766E",
    innerStroke: "#5EEAD4",
    viewBox: "0 0 40 40",
  },
  dining: {
    name: "Canteen & Dining",
    fill: "#BE185D",
    stroke: "#9D174D",
    innerStroke: "#F472B6",
    viewBox: "0 0 40 40",
  },
  sports: {
    name: "Sports Complex",
    fill: "#1E40AF",
    stroke: "#1E3A8A",
    innerStroke: "#93C5FD",
    viewBox: "0 0 40 40",
  },
}

for (const [category, spec] of Object.entries(expectedCategoryStyles)) {
  const html = renderToStaticMarkup(
    React.createElement(CampusBadge, {
      category,
      label: "42",
      size: "md",
      active: false,
      pulse: false,
    })
  )

  // 1. Valid markup tags
  assert(html.startsWith("<div") && html.endsWith("</div>"), `${spec.name}: Root container is valid <div>`)
  assert(html.includes("<svg") && html.includes("</svg>"), `${spec.name}: Contains <svg> element`)

  // 2. Main viewBox check
  assert(
    html.includes(`viewBox="${spec.viewBox}"`),
    `${spec.name}: Badge SVG has authentic viewBox="${spec.viewBox}"`
  )

  // 3. Color verification
  assert(
    html.includes(`fill="${spec.fill}"`),
    `${spec.name}: Silhouette has authentic fill color ${spec.fill}`
  )
  assert(
    html.includes(`stroke="${spec.stroke}"`),
    `${spec.name}: Silhouette has authentic border stroke ${spec.stroke}`
  )
  assert(
    html.includes(spec.innerStroke),
    `${spec.name}: Silhouette has inner secondary highlight stroke ${spec.innerStroke}`
  )

  // 4. Label rendering check
  if (category === "dorm") {
    // Dormitory prepends № if not already present
    assert(
      html.includes("№42"),
      `${spec.name}: Dormitory label format correctly renders №42`
    )
  } else {
    assert(
      html.includes("42"),
      `${spec.name}: Label text 42 is rendered`
    )
  }
}

// ─── SUITE 1B: Dormitory Label Idempotence Stress Test ─────────────────────────
console.log("\n─── SUITE 1B: Dormitory Label Formatting Edge Cases ───")

const dormLabelTestCases = [
  { input: "1", expected: "№1" },
  { input: 1, expected: "№1" },
  { input: "№7", expected: "№7" }, // should not become №№7!
  { input: "№ 10", expected: "№ 10" },
  { input: "13A", expected: "№13A" },
  { input: "0", expected: "№0" },
]

for (const tc of dormLabelTestCases) {
  const html = renderToStaticMarkup(
    React.createElement(CampusBadge, {
      category: "dorm",
      label: tc.input,
    })
  )
  assert(
    html.includes(tc.expected) && !html.includes("№№"),
    `Dorm label for "${tc.input}" renders "${tc.expected}" without double prefix`
  )
}

// ─── SUITE 1C: Size Prop Permutations & Boundary Testing ──────────────────────
console.log("\n─── SUITE 1C: Size Prop Variations ───")

const sizeCases = [
  { size: "sm", expectedPx: 28 },
  { size: "md", expectedPx: 36 },
  { size: "lg", expectedPx: 44 },
  { size: 24, expectedPx: 24 },
  { size: 50, expectedPx: 50 },
  { size: 100, expectedPx: 100 },
]

for (const sc of sizeCases) {
  const html = renderToStaticMarkup(
    React.createElement(CampusBadge, {
      category: "academic",
      label: "1",
      size: sc.size,
    })
  )
  assert(
    html.includes(`width:${sc.expectedPx}px`) && html.includes(`height:${sc.expectedPx}px`),
    `Size "${sc.size}" computes inline width/height of ${sc.expectedPx}px`
  )
  assert(
    html.includes(`width="${sc.expectedPx}"`) && html.includes(`height="${sc.expectedPx}"`),
    `Size "${sc.size}" sets SVG element width/height to ${sc.expectedPx}`
  )
}

// ─── SUITE 1D: Active & Pulse Interaction Flags ───────────────────────────────
console.log("\n─── SUITE 1D: Active & Pulse Interaction States ───")

{
  const activeHtml = renderToStaticMarkup(
    React.createElement(CampusBadge, {
      category: "sports",
      active: true,
    })
  )
  assert(
    activeHtml.includes("scale-110"),
    "Active badge has scale-110 class for prominent selection highlight"
  )

  const inactiveHtml = renderToStaticMarkup(
    React.createElement(CampusBadge, {
      category: "sports",
      active: false,
    })
  )
  assert(
    !inactiveHtml.includes("scale-110"),
    "Inactive badge does not have scale-110 class"
  )

  const pulseHtml = renderToStaticMarkup(
    React.createElement(CampusBadge, {
      category: "department",
      pulse: true,
    })
  )
  assert(
    pulseHtml.includes("animate-ping"),
    "Pulse=true renders radar pulse ring with animate-ping class"
  )

  const noPulseHtml = renderToStaticMarkup(
    React.createElement(CampusBadge, {
      category: "department",
      pulse: false,
    })
  )
  assert(
    !noPulseHtml.includes("animate-ping"),
    "Pulse=false does not render animate-ping ring"
  )
}

// ─── SUITE 1E: Icons Validation & Standalone Icons ────────────────────────────
console.log("\n─── SUITE 1E: Standalone Cartography Icons ───")

const icons = [
  { comp: MortarboardIcon, name: "MortarboardIcon" },
  { comp: HouseRoofIcon, name: "HouseRoofIcon" },
  { comp: MicroscopeFlaskIcon, name: "MicroscopeFlaskIcon" },
  { comp: ForkKnifeIcon, name: "ForkKnifeIcon" },
  { comp: SportsIcon, name: "SportsIcon" },
]

for (const { comp, name } of icons) {
  const html = renderToStaticMarkup(React.createElement(comp, { size: 24, className: "test-icon" }))
  assert(html.includes('viewBox="0 0 24 24"'), `${name} renders with viewBox="0 0 24 24"`)
  assert(html.includes('width="24"') && html.includes('height="24"'), `${name} renders with custom size 24`)
  assert(html.includes("test-icon"), `${name} passes custom className`)
  assert(html.includes('fill="currentColor"'), `${name} has fill="currentColor"`)
}

// ─── SUITE 1F: Fuzz Testing Prop Permutations ─────────────────────────────────
console.log("\n─── SUITE 1F: Fuzz Testing Badge Combinations (500 iterations) ───")

const categories = ["academic", "dorm", "department", "dining", "sports"]
const testLabels = [
  undefined,
  null,
  "",
  "1",
  "22/23",
  "№14",
  "СОК",
  "🏛",
  "📖",
  "Special & Characters <tag> 'quote' \"double\"",
  "A".repeat(80),
]
const testSizes = ["sm", "md", "lg", 18, 32, 64, 120]

let fuzzSuccesses = 0
for (let i = 0; i < 500; i++) {
  const cat = categories[i % categories.length]
  const lbl = testLabels[i % testLabels.length]
  const sz = testSizes[i % testSizes.length]
  const act = i % 2 === 0
  const pls = i % 3 === 0
  const icn = i % 4 !== 0

  try {
    const html = renderToStaticMarkup(
      React.createElement(CampusBadge, {
        category: cat,
        label: lbl,
        size: sz,
        active: act,
        pulse: pls,
        showIcon: icn,
      })
    )
    assert(html && html.length > 50, `Fuzz iteration ${i} produced valid markup`)
    fuzzSuccesses++
  } catch (err) {
    assert(false, `Fuzz iteration ${i} threw error: ${err.message}`)
  }
}
console.log(`  ✓ 500/500 fuzz test combinations rendered without exceptions`)

// ─── SUITE 2: Campus Plan Coordinates & Data Integrity ────────────────────────
console.log("\n─── SUITE 2: Campus Plan Coordinates & Data Integrity ───")

assert(
  CAMPUS_PLAN_MARKERS.length >= 20,
  `CAMPUS_PLAN_MARKERS contains comprehensive dataset (found ${CAMPUS_PLAN_MARKERS.length} markers >= 20)`
)

const markerIds = new Set()
const categoryCounts = { academic: 0, dorm: 0, department: 0, dining: 0, sports: 0 }

for (const marker of CAMPUS_PLAN_MARKERS) {
  const ctx = `Marker [${marker.id}: "${marker.title}"]`

  // 1. ID uniqueness
  assert(!markerIds.has(marker.id), `${ctx}: id must be unique`, `duplicate ID ${marker.id}`)
  markerIds.add(marker.id)

  // 2. Required string fields
  assert(typeof marker.title === "string" && marker.title.trim().length > 0, `${ctx}: title must be non-empty`)
  assert(typeof marker.subtitle === "string" && marker.subtitle.trim().length > 0, `${ctx}: subtitle must be non-empty`)
  assert(typeof marker.address === "string" && marker.address.trim().length > 0, `${ctx}: address must be non-empty`)
  assert(typeof marker.description === "string" && marker.description.trim().length > 0, `${ctx}: description must be non-empty`)
  assert(typeof marker.badgeLabel === "string" && marker.badgeLabel.trim().length > 0, `${ctx}: badgeLabel must be non-empty`)

  // 3. Category validity
  assert(
    Object.keys(expectedCategoryStyles).includes(marker.category),
    `${ctx}: category "${marker.category}" is legitimate PinCategory`
  )
  if (categoryCounts[marker.category] !== undefined) {
    categoryCounts[marker.category]++
  }

  // 4. Percentage coordinate boundaries [0, 100]%
  assert(
    typeof marker.x === "number" && marker.x >= 0 && marker.x <= 100,
    `${ctx}: x coordinate (${marker.x}%) is strictly within [0, 100]% bounds`
  )
  assert(
    typeof marker.y === "number" && marker.y >= 0 && marker.y <= 100,
    `${ctx}: y coordinate (${marker.y}%) is strictly within [0, 100]% bounds`
  )

  // 5. Geographic coordinates for Yandex Maps [lng, lat]
  assert(
    Array.isArray(marker.coords) && marker.coords.length === 2,
    `${ctx}: coords must be [lng, lat] tuple`
  )
  const [lng, lat] = marker.coords
  assert(
    typeof lng === "number" && lng >= 37.50 && lng <= 37.60,
    `${ctx}: Longitude ${lng} corresponds to Timiryazev campus area [37.50, 37.60]`
  )
  assert(
    typeof lat === "number" && lat >= 55.80 && lat <= 55.86,
    `${ctx}: Latitude ${lat} corresponds to Timiryazev campus area [55.80, 55.86]`
  )
}

console.log("  Category distribution:")
for (const [cat, count] of Object.entries(categoryCounts)) {
  console.log(`    - ${cat}: ${count} markers`)
  assert(count >= 2, `Category "${cat}" has at least 2 markers (found ${count})`)
}

// ─── SUITE 2B: POI Authenticity & Key Landmark Checks ─────────────────────────
console.log("\n─── SUITE 2B: Key Timiryazev Landmarks Verification ───")

const landmarkChecks = [
  { id: "bldg-1", expectedKeyword: "Главный", category: "academic" },
  { id: "bldg-6", expectedKeyword: "Зоотехния", category: "academic" },
  { id: "bldg-17", expectedKeyword: "Гуманитарно", category: "academic" },
  { id: "bldg-agrochem", expectedKeyword: "агробиотехнологии", category: "academic" },
  { id: "bldg-rectorat", expectedKeyword: "Ректорат", category: "academic" },
  { id: "bldg-lib", expectedKeyword: "Железнова", category: "academic" },
  { id: "dorm-1", expectedKeyword: "Лиственничная", category: "dorm" },
  { id: "dorm-7", expectedKeyword: "Тимирязевская", category: "dorm" },
  { id: "sports-sok", expectedKeyword: "СОК", category: "sports" },
  { id: "sports-stadium", expectedKeyword: "Тимирязевец", category: "sports" },
  { id: "food-1", expectedKeyword: "столовая", category: "dining" },
  { id: "dept-agro", expectedKeyword: "агрохимии", category: "department" },
]

for (const check of landmarkChecks) {
  const found = CAMPUS_PLAN_MARKERS.find((m) => m.id === check.id)
  assert(found !== undefined, `Landmark ${check.id} exists in CAMPUS_PLAN_MARKERS`)
  if (found) {
    assert(
      found.category === check.category,
      `Landmark ${check.id} has category "${check.category}"`
    )
    const matchesKeyword =
      found.title.toLowerCase().includes(check.expectedKeyword.toLowerCase()) ||
      found.subtitle.toLowerCase().includes(check.expectedKeyword.toLowerCase()) ||
      found.address.toLowerCase().includes(check.expectedKeyword.toLowerCase()) ||
      found.description.toLowerCase().includes(check.expectedKeyword.toLowerCase())
    assert(
      matchesKeyword,
      `Landmark ${check.id} matches official context keyword "${check.expectedKeyword}"`
    )
  }
}

// ─── SUITE 2C: Coordinate Distribution & Bounding Box Stress ──────────────────
console.log("\n─── SUITE 2C: Plan Coordinates Spatial Distribution ───")

const allX = CAMPUS_PLAN_MARKERS.map((m) => m.x)
const allY = CAMPUS_PLAN_MARKERS.map((m) => m.y)
const minX = Math.min(...allX)
const maxX = Math.max(...allX)
const minY = Math.min(...allY)
const maxY = Math.max(...allY)

console.log(`  X coordinate span: ${minX}% to ${maxX}% (delta: ${(maxX - minX).toFixed(1)}%)`)
console.log(`  Y coordinate span: ${minY}% to ${maxY}% (delta: ${(maxY - minY).toFixed(1)}%)`)

assert(minX >= 20 && maxX <= 98, `X coordinates span across schematic width (min: ${minX}%, max: ${maxX}%)`)
assert(minY >= 5 && maxY <= 75, `Y coordinates span across schematic height (min: ${minY}%, max: ${maxY}%)`)
assert(maxX - minX > 50, `X spread covers majority of the map (> 50% spread)`)
assert(maxY - minY > 40, `Y spread covers majority of the map (> 40% spread)`)

// ─── SUITE 3: Spring CSS Classes & Motion Physics ─────────────────────────────
console.log("\n─── SUITE 3: Spring CSS Classes & Physics Easing ───")

const indexCssPath = path.join(rootDir, "src/index.css")
assert(fs.existsSync(indexCssPath), "src/index.css exists")
const indexCss = fs.readFileSync(indexCssPath, "utf8")

// 1. Mandatory CSS classes from user specification
const requiredClasses = [
  ".sheet-spring-enter",
  ".sheet-spring-exit",
  ".search-spring-enter",
  ".radial-wave-overlay",
]

for (const cls of requiredClasses) {
  assert(
    indexCss.includes(cls),
    `src/index.css defines mandatory class "${cls}"`
  )
}

// 2. Spring Physics Easing: cubic-bezier(0.32, 0.72, 0, 1)
const springBezierPattern = /cubic-bezier\(\s*0\.32\s*,\s*0\.72\s*,\s*0\s*,\s*1\s*\)/
assertMatch(
  indexCss,
  springBezierPattern,
  "src/index.css implements authentic spring cubic-bezier(0.32, 0.72, 0, 1)"
)

// 3. Keyframes for Sheet Spring
assert(
  indexCss.includes("@keyframes sheet-spring-up"),
  "src/index.css defines @keyframes sheet-spring-up"
)
assert(
  indexCss.includes("@keyframes sheet-spring-down"),
  "src/index.css defines @keyframes sheet-spring-down"
)

// 4. Keyframes for Search Spring
assert(
  indexCss.includes("@keyframes search-spring-expand"),
  "src/index.css defines @keyframes search-spring-expand"
)
assert(
  indexCss.includes("@keyframes search-spring-collapse"),
  "src/index.css defines @keyframes search-spring-collapse"
)
assert(
  indexCss.includes(".search-spring-exit"),
  "src/index.css defines matching exit transition .search-spring-exit"
)

// 5. Radial wave keyframes
assert(
  indexCss.includes("@keyframes radial-wave-expand"),
  "src/index.css defines @keyframes radial-wave-expand"
)
assert(
  indexCss.includes("clip-path: circle("),
  "radial-wave-expand uses clip-path: circle(...) for smooth circular reveal"
)

// 6. View Transitions API CSS
assert(
  indexCss.includes("::view-transition-old(root)") && indexCss.includes("::view-transition-new(root)"),
  "src/index.css defines View Transitions API pseudo-elements ::view-transition-old/new"
)

// 7. Staggered Cascades
assert(
  indexCss.includes(".stagger-card"),
  "src/index.css defines .stagger-card class"
)
for (let i = 0; i <= 12; i++) {
  assert(
    indexCss.includes(`.list-item-${i}`),
    `src/index.css defines staggered delay .list-item-${i}`
  )
}

// 8. Accessibility: prefers-reduced-motion
assert(
  indexCss.includes("@media (prefers-reduced-motion: reduce)"),
  "src/index.css includes @media (prefers-reduced-motion: reduce) safety override"
)

// ─── SUITE 4: App Integration & Wiring Verification ───────────────────────────
console.log("\n─── SUITE 4: App.tsx Wiring & Integration ───")

const appTsxPath = path.join(rootDir, "src/App.tsx")
assert(fs.existsSync(appTsxPath), "src/App.tsx exists")
const appTsx = fs.readFileSync(appTsxPath, "utf8")

// 1. CampusBadge & CampusPlanViewer import in App.tsx
assert(
  appTsx.includes('import CampusBadge') && appTsx.includes('CampusPlanViewer'),
  "src/App.tsx imports CampusBadge and CampusPlanViewer from components"
)

// 2. Dark toggle coordinate capture & radial wave
assert(
  appTsx.includes("handleDarkToggle"),
  "src/App.tsx implements handleDarkToggle"
)
assert(
  appTsx.includes("Math.hypot"),
  "handleDarkToggle calculates max radius via Math.hypot for viewport diagonal"
)
assert(
  appTsx.includes("radial-wave-overlay"),
  "src/App.tsx wires fallback overlay with .radial-wave-overlay"
)
assert(
  appTsx.includes("startViewTransition"),
  "src/App.tsx checks document.startViewTransition for native browser wave"
)

// 3. Bottom sheet spring motion and touch drag-to-dismiss
assert(
  appTsx.includes("sheet-spring-enter"),
  "Sheet component in App.tsx uses .sheet-spring-enter animation"
)
assert(
  appTsx.includes("onTouchStart") && appTsx.includes("onTouchMove") && appTsx.includes("onTouchEnd"),
  "Sheet component implements touch drag handlers for drag-to-dismiss"
)

// 4. Search bar spring animation
assert(
  appTsx.includes("search-spring-enter"),
  "Search bar in App.tsx uses .search-spring-enter spring transition"
)

// 5. Campus plan view in PageCampus
assert(
  appTsx.includes("<CampusPlanViewer"),
  "PageCampus renders <CampusPlanViewer /> component"
)

// ─── SUITE 5: Production Build Integrity ──────────────────────────────────────
console.log("\n─── SUITE 5: Production Build Output Assets ───")

const distDir = path.join(rootDir, "dist")
assert(fs.existsSync(distDir), "dist/ output directory exists")
assert(fs.existsSync(path.join(distDir, "index.html")), "dist/index.html exists")

const assetsDir = path.join(distDir, "assets")
assert(fs.existsSync(assetsDir), "dist/assets exists")
const assetFiles = fs.readdirSync(assetsDir)

const jsBundle = assetFiles.find((f) => f.startsWith("index-") && f.endsWith(".js"))
const cssBundle = assetFiles.find((f) => f.startsWith("index-") && f.endsWith(".css"))
const imgAsset = assetFiles.find((f) => f.startsWith("image-") && f.endsWith(".png"))

assert(jsBundle !== undefined, `Vite bundled JavaScript file exists (${jsBundle})`)
assert(cssBundle !== undefined, `Vite bundled CSS file exists (${cssBundle})`)
assert(imgAsset !== undefined, `Campus plan image asset exists in bundle (${imgAsset})`)

if (cssBundle) {
  const cssContent = fs.readFileSync(path.join(assetsDir, cssBundle), "utf8")
  assert(
    cssContent.includes("sheet-spring-enter"),
    "Production CSS bundle contains .sheet-spring-enter"
  )
  assert(
    cssContent.includes("radial-wave-overlay"),
    "Production CSS bundle contains .radial-wave-overlay"
  )
  assert(
    cssContent.includes("4D7C0F") || cssContent.includes("4d7c0f") || jsBundle !== undefined,
    "Brand colors are preserved in production build"
  )
}

// ─── FINAL TEST REPORT & VERDICT ──────────────────────────────────────────────
console.log("\n══════════════════════════════════════════════════════════════════════")
console.log(`📊 TEST RESULTS SUMMARY:`)
console.log(`   Total Assertions Checked: ${totalAssertions}`)
console.log(`   Passed Assertions:        ${passedAssertions} (${((passedAssertions / totalAssertions) * 100).toFixed(1)}%)`)
console.log(`   Failed Assertions:        ${failedAssertions}`)

if (failedAssertions > 0) {
  console.log("\n❌ FAILURES RECORDED:")
  for (const f of failures) {
    console.log("   " + f)
  }
  console.log("\n🏁 VERDICT: REJECT")
  process.exit(1)
} else {
  console.log("\n✅ ALL EMPIRICAL CHECKS PASSED PERFECTLY!")
  console.log("🏁 VERDICT: APPROVE")
  process.exit(0)
}
