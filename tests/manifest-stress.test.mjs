import fs from "node:fs"
import path from "node:path"
import zlib from "node:zlib"
import assert from "node:assert"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, "..")

// Helper: CRC32 implementation for PNG chunk validation
const crcTable = new Uint32Array(256)
for (let n = 0; n < 256; n++) {
  let c = n
  for (let k = 0; k < 8; k++) {
    if (c & 1) {
      c = 0xedb88320 ^ (c >>> 1)
    } else {
      c = c >>> 1
    }
  }
  crcTable[n] = c >>> 0
}

function calcCrc32(buf) {
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

// Helper: parse and validate PNG structure, chunks, CRCs, and decompress IDAT
function parseAndValidatePng(filePath) {
  const buf = fs.readFileSync(filePath)
  assert(buf.length >= 8, `File too short: ${filePath}`)

  // 1. Signature
  const signature = buf.subarray(0, 8).toString("hex")
  assert.strictEqual(
    signature,
    "89504e470d0a1a0a",
    `Invalid PNG signature: ${signature}`,
  )

  // 2. Chunks
  let offset = 8
  const chunks = []
  let idatBuffers = []
  let ihdr = null

  while (offset < buf.length) {
    assert(
      offset + 8 <= buf.length,
      `Truncated chunk header at offset ${offset}`,
    )
    const length = buf.readUInt32BE(offset)
    const type = buf.subarray(offset + 4, offset + 8).toString("ascii")
    const dataStart = offset + 8
    const dataEnd = dataStart + length
    assert(
      dataEnd + 4 <= buf.length,
      `Truncated chunk data/CRC for ${type} at ${offset}`,
    )

    const chunkData = buf.subarray(dataStart, dataEnd)
    const chunkTypeAndData = buf.subarray(offset + 4, dataEnd)
    const expectedCrc = buf.readUInt32BE(dataEnd)
    const actualCrc = calcCrc32(chunkTypeAndData)

    assert.strictEqual(
      actualCrc,
      expectedCrc,
      `CRC32 mismatch in chunk ${type} at offset ${offset}: expected 0x${expectedCrc.toString(16)}, got 0x${actualCrc.toString(16)}`,
    )

    chunks.push({ type, length, offset })

    if (type === "IHDR") {
      assert.strictEqual(chunks.length, 1, "IHDR must be the first chunk")
      assert.strictEqual(length, 13, "IHDR length must be 13")
      ihdr = {
        width: chunkData.readUInt32BE(0),
        height: chunkData.readUInt32BE(4),
        bitDepth: chunkData.readUInt8(8),
        colorType: chunkData.readUInt8(9),
        compression: chunkData.readUInt8(10),
        filter: chunkData.readUInt8(11),
        interlace: chunkData.readUInt8(12),
      }
    } else if (type === "IDAT") {
      idatBuffers.push(chunkData)
    } else if (type === "IEND") {
      assert.strictEqual(length, 0, "IEND length must be 0")
      assert.strictEqual(
        dataEnd + 4,
        buf.length,
        "Trailing bytes after IEND chunk",
      )
    }

    offset = dataEnd + 4
  }

  assert(ihdr !== null, "Missing IHDR chunk")
  assert(idatBuffers.length > 0, "Missing IDAT chunk")
  assert.strictEqual(
    chunks[chunks.length - 1].type,
    "IEND",
    "Last chunk must be IEND",
  )

  // Decompress raw pixel data to verify stream integrity
  const compressedIdat = Buffer.concat(idatBuffers)
  const decompressed = zlib.inflateSync(compressedIdat)

  // Each scanline has 1 filter byte + bytesPerPixel * width
  const bytesPerPixel = ihdr.colorType === 6 ? 4 : ihdr.colorType === 2 ? 3 : 1
  const expectedDecompressedLength =
    (ihdr.width * bytesPerPixel + 1) * ihdr.height
  assert.strictEqual(
    decompressed.length,
    expectedDecompressedLength,
    `Decompressed pixel data size mismatch: expected ${expectedDecompressedLength}, got ${decompressed.length}`,
  )

  return { ihdr, chunks, decompressed, bytesPerPixel }
}

// Test Runner
const results = []
function test(name, fn) {
  try {
    fn()
    results.push({ name, status: "PASS" })
    console.log(`  [PASS] ${name}`)
  } catch (err) {
    results.push({ name, status: "FAIL", error: err.message })
    console.error(`  [FAIL] ${name}: ${err.message}`)
  }
}

console.log("===============================================================")
console.log("  M1 EMPIRICAL STRESS TEST SUITE: WEB MANIFEST & BRAND ASSETS  ")
console.log("===============================================================\n")

// ─── SUITE 1: MANIFEST VALIDATION ───────────────────────────────────────────
console.log("--- SUITE 1: Manifest Syntax, Identity & Standards ---")

let manifestJsonContent
let manifestWebContent

test("public/manifest.json exists and is valid JSON", () => {
  const p = path.join(rootDir, "public/manifest.json")
  assert(fs.existsSync(p), "public/manifest.json does not exist")
  const raw = fs.readFileSync(p, "utf8")
  manifestJsonContent = JSON.parse(raw)
  assert(
    typeof manifestJsonContent === "object" && manifestJsonContent !== null,
  )
})

test("public/manifest.webmanifest exists and is valid JSON", () => {
  const p = path.join(rootDir, "public/manifest.webmanifest")
  assert(fs.existsSync(p), "public/manifest.webmanifest does not exist")
  const raw = fs.readFileSync(p, "utf8")
  manifestWebContent = JSON.parse(raw)
  assert(typeof manifestWebContent === "object" && manifestWebContent !== null)
})

test("manifest.json and manifest.webmanifest are strictly identical", () => {
  assert.deepStrictEqual(
    manifestJsonContent,
    manifestWebContent,
    "Manifest content divergence between .json and .webmanifest",
  )
})

test("Manifest required W3C fields and values", () => {
  const m = manifestJsonContent
  // Identity
  assert.strictEqual(
    m.id,
    "ru.timacad.student",
    "App ID must be ru.timacad.student",
  )
  assert.strictEqual(
    m.name,
    "РГАУ-МСХА Расписание",
    "Full name must be РГАУ-МСХА Расписание",
  )
  assert.strictEqual(
    m.short_name,
    "РГАУ Студент",
    "Short name must be РГАУ Студент",
  )
  assert(
    m.short_name.length <= 12,
    `Short name (${m.short_name}) exceeds 12 chars for launcher display`,
  )
  assert(
    m.description && m.description.length > 10,
    "Description must be descriptive",
  )

  // Navigation & Display
  assert.strictEqual(
    m.start_url,
    "./",
    "start_url must be ./ for subpath portability",
  )
  assert.strictEqual(m.scope, "./", "scope must be ./")
  assert.strictEqual(m.display, "standalone", "display must be standalone")
  assert(
    Array.isArray(m.display_override) &&
      m.display_override.includes("standalone"),
    "display_override must contain standalone",
  )
  assert.strictEqual(m.orientation, "portrait", "orientation must be portrait")

  // Colors
  assert.strictEqual(
    m.theme_color.toUpperCase(),
    "#2D5016",
    "theme_color must be university green #2D5016",
  )
  assert.strictEqual(
    m.background_color.toUpperCase(),
    "#F4F1EB",
    "background_color must be warm paper cream #F4F1EB",
  )

  // Localization
  assert.strictEqual(m.lang, "ru", "lang must be ru")
  assert.strictEqual(m.dir, "ltr", "dir must be ltr")
})

test("Manifest icons list has required 192, 512, maskable, and touch entries", () => {
  const m = manifestJsonContent
  assert(Array.isArray(m.icons), "icons must be an array")
  assert(
    m.icons.length >= 6,
    `Expected at least 6 icon entries, found ${m.icons.length}`,
  )

  const sizes = m.icons.map((i) => i.sizes)
  assert(sizes.includes("192x192"), "Must declare 192x192 icon")
  assert(sizes.includes("512x512"), "Must declare 512x512 icon")

  const purposes = m.icons.map((i) => i.purpose || "any")
  assert(
    purposes.includes("maskable"),
    "Must declare at least one maskable icon",
  )
  assert(
    purposes.includes("any"),
    "Must declare at least one standard any icon",
  )
})

test("Manifest shortcuts are correctly structured and reference valid targets", () => {
  const m = manifestJsonContent
  assert(Array.isArray(m.shortcuts), "shortcuts must be an array")
  assert(
    m.shortcuts.length >= 3,
    `Expected at least 3 shortcuts, got ${m.shortcuts.length}`,
  )
  for (const s of m.shortcuts) {
    assert(s.name, "Shortcut must have a name")
    assert(s.url, "Shortcut must have a url")
    assert(
      s.url.startsWith("./?tab="),
      `Shortcut url should target tab: ${s.url}`,
    )
    if (s.icons) {
      assert(Array.isArray(s.icons), "Shortcut icons must be array")
      for (const ic of s.icons) {
        assert(ic.src, "Shortcut icon must have src")
      }
    }
  }
})

// ─── SUITE 2: ASSET EXISTENCE & BINARY INTEGRITY ────────────────────────────
console.log("\n--- SUITE 2: Asset Existence, PNG Chunks & CRC32 Validation ---")

test("All manifest icon paths exist on disk with valid headers", () => {
  const allIcons = [...manifestJsonContent.icons]
  for (const s of manifestJsonContent.shortcuts || []) {
    if (s.icons) allIcons.push(...s.icons)
  }

  for (const icon of allIcons) {
    // resolve relative to public/
    const cleanSrc = icon.src.replace(/^\.\//, "")
    const fullPath = path.join(rootDir, "public", cleanSrc)
    assert(fs.existsSync(fullPath), `Referenced icon file missing: ${cleanSrc}`)
    const stat = fs.statSync(fullPath)
    assert(
      stat.size > 500,
      `Icon file too small (${stat.size} bytes): ${cleanSrc}`,
    )

    if (icon.type === "image/png") {
      const { ihdr } = parseAndValidatePng(fullPath)
      if (icon.sizes && icon.sizes !== "any") {
        const [w, h] = icon.sizes.split("x").map(Number)
        assert.strictEqual(
          ihdr.width,
          w,
          `Width mismatch for ${cleanSrc}: expected ${w}, got ${ihdr.width}`,
        )
        assert.strictEqual(
          ihdr.height,
          h,
          `Height mismatch for ${cleanSrc}: expected ${h}, got ${ihdr.height}`,
        )
      }
    } else if (icon.type === "image/svg+xml") {
      const svgText = fs.readFileSync(fullPath, "utf8")
      assert(
        svgText.includes("<svg") && svgText.includes("</svg>"),
        `Invalid SVG markup: ${cleanSrc}`,
      )
    }
  }
})

test("public/apple-touch-icon.png exists at root public/ and icons/ with identical 180x180 resolution", () => {
  const rootTouch = path.join(rootDir, "public/apple-touch-icon.png")
  const subTouch = path.join(rootDir, "public/icons/apple-touch-icon.png")
  assert(fs.existsSync(rootTouch), "public/apple-touch-icon.png missing")
  assert(fs.existsSync(subTouch), "public/icons/apple-touch-icon.png missing")

  const p1 = parseAndValidatePng(rootTouch)
  const p2 = parseAndValidatePng(subTouch)
  assert.strictEqual(p1.ihdr.width, 180)
  assert.strictEqual(p1.ihdr.height, 180)
  assert.strictEqual(p2.ihdr.width, 180)
  assert.strictEqual(p2.ihdr.height, 180)
})

test("public/favicon.ico has valid multi-resolution ICO header", () => {
  const icoPath = path.join(rootDir, "public/favicon.ico")
  assert(fs.existsSync(icoPath), "public/favicon.ico missing")
  const buf = fs.readFileSync(icoPath)
  assert(buf.length > 100, `ICO too small: ${buf.length}`)
  // ICO header: 0, 0, 1, 0, count (le)
  assert.strictEqual(buf.readUInt16LE(0), 0, "ICO reserved must be 0")
  assert.strictEqual(buf.readUInt16LE(2), 1, "ICO type must be 1 (icon)")
  const imageCount = buf.readUInt16LE(4)
  assert(imageCount >= 1, `ICO must contain >= 1 image, found ${imageCount}`)
})

// ─── SUITE 3: MOBILE STRESS TESTS (OPACITY, SAFE-ZONES & SHAPES) ───────────
console.log(
  "\n--- SUITE 3: Mobile Stress Tests (Maskable Opacity & Apple Touch Solid Fill) ---",
)

test("Apple touch icon has solid opaque background (no transparency black-box bug)", () => {
  const touchPath = path.join(rootDir, "public/apple-touch-icon.png")
  const { ihdr, decompressed, bytesPerPixel } = parseAndValidatePng(touchPath)
  assert.strictEqual(bytesPerPixel, 4, "Expected RGBA format")
  assert.strictEqual(ihdr.width, 180)
  assert.strictEqual(ihdr.height, 180)

  const stride = 1 + 180 * 4
  const corners = [
    [0, 0],
    [179, 0],
    [0, 179],
    [179, 179],
  ]

  for (const [x, y] of corners) {
    const offset = y * stride + 1 + x * 4
    const r = decompressed[offset]
    const g = decompressed[offset + 1]
    const b = decompressed[offset + 2]
    const a = decompressed[offset + 3]

    // Must be 100% opaque to prevent iOS WebKit rendering black letterbox voids
    assert.strictEqual(
      a,
      255,
      `Apple Touch Icon corner (${x}, ${y}) must be opaque (alpha 255), got ${a}`,
    )
    // Must be within Timiryazev green gradient palette (#3A631E to #1B330D)
    assert(
      g > r && g > b,
      `Corner (${x}, ${y}) must have green as dominant channel: rgb(${r}, ${g}, ${b})`,
    )
    assert(r >= 20 && r <= 65, `Red channel out of green palette: ${r}`)
    assert(g >= 45 && g <= 105, `Green channel out of green palette: ${g}`)
    assert(b >= 10 && b <= 35, `Blue channel out of green palette: ${b}`)
  }
})

test("Maskable 512x512 icon has solid full-bleed background (no transparent corner voids)", () => {
  const maskablePath = path.join(rootDir, "public/icons/icon-maskable-512.png")
  const { ihdr, decompressed, bytesPerPixel } =
    parseAndValidatePng(maskablePath)
  assert.strictEqual(ihdr.width, 512)
  assert.strictEqual(ihdr.height, 512)
  assert.strictEqual(bytesPerPixel, 4)

  // Scan corners (0,0), (511,0), (0,511), (511,511)
  const stride = 1 + 512 * 4
  const corners = [
    [0, 0],
    [511, 0],
    [0, 511],
    [511, 511],
  ]

  for (const [x, y] of corners) {
    const offset = y * stride + 1 + x * 4
    const r = decompressed[offset]
    const g = decompressed[offset + 1]
    const b = decompressed[offset + 2]
    const a = decompressed[offset + 3]

    // Maskable icons on Android MUST NOT have transparent corners
    assert.strictEqual(
      a,
      255,
      `Maskable corner pixel (${x}, ${y}) alpha must be 255, got ${a}`,
    )
    // Must be within Timiryazev green gradient palette
    assert(
      g > r && g > b,
      `Corner (${x}, ${y}) must have green as dominant channel: rgb(${r}, ${g}, ${b})`,
    )
    assert(r >= 20 && r <= 65, `Red channel out of green palette: ${r}`)
    assert(g >= 45 && g <= 105, `Green channel out of green palette: ${g}`)
    assert(b >= 10 && b <= 35, `Blue channel out of green palette: ${b}`)
  }
})

// ─── SUITE 4: INDEX.HTML INTEGRATION ────────────────────────────────────────
console.log("\n--- SUITE 4: index.html Head Integration ---")

test("index.html contains all required PWA manifest links", () => {
  const html = fs.readFileSync(path.join(rootDir, "index.html"), "utf8")
  assert(
    html.includes('<link rel="manifest" href="./manifest.webmanifest" />'),
    "Missing webmanifest link",
  )
  assert(
    html.includes('href="./manifest.json"'),
    "Missing manifest.json fallback",
  )
})

test("index.html contains all iOS Apple Web App tags", () => {
  const html = fs.readFileSync(path.join(rootDir, "index.html"), "utf8")
  assert(
    html.includes('<meta name="apple-mobile-web-app-capable" content="yes" />'),
    "Missing capable tag",
  )
  assert(
    html.includes(
      '<meta name="apple-mobile-web-app-status-bar-style" content="default" />',
    ),
    "Missing status bar style",
  )
  assert(
    html.includes(
      '<meta name="apple-mobile-web-app-title" content="РГАУ Студент" />',
    ),
    "Missing web app title",
  )
  assert(
    html.includes('rel="apple-touch-icon"'),
    "Missing apple-touch-icon link",
  )
})

test("index.html viewport contains cover and zoom constraints", () => {
  const html = fs.readFileSync(path.join(rootDir, "index.html"), "utf8")
  assert(html.includes("viewport-fit=cover"), "Missing viewport-fit=cover")
  assert(html.includes("maximum-scale=1.0"), "Missing maximum-scale=1.0")
})

test("index.html theme-color matches manifest brand colors", () => {
  const html = fs.readFileSync(path.join(rootDir, "index.html"), "utf8")
  assert(html.includes('content="#2D5016"'), "Missing theme-color #2D5016")
  assert(html.includes('content="#141714"'), "Missing dark theme-color #141714")
})

// ─── SUITE 5: BUILD & DISTRIBUTION ARTIFACTS ────────────────────────────────
console.log("\n--- SUITE 5: Build & Distribution Verification ---")

test("dist/ directory contains all manifests and brand icons", () => {
  const distDir = path.join(rootDir, "dist")
  assert(
    fs.existsSync(distDir),
    "dist/ directory missing. Run npm run build first.",
  )

  const requiredDistFiles = [
    "manifest.json",
    "manifest.webmanifest",
    "apple-touch-icon.png",
    "favicon.ico",
    "favicon.svg",
    "icons/icon-192.png",
    "icons/icon-512.png",
    "icons/icon-maskable-512.png",
    "icons/apple-touch-icon.png",
  ]

  for (const f of requiredDistFiles) {
    const fullP = path.join(distDir, f)
    assert(fs.existsSync(fullP), `dist/ missing ${f}`)
    const publicP = path.join(rootDir, "public", f)
    const distBuf = fs.readFileSync(fullP)
    const pubBuf = fs.readFileSync(publicP)
    assert.strictEqual(
      distBuf.length,
      pubBuf.length,
      `Size discrepancy for ${f} in dist vs public`,
    )
  }
})

// ─── SUMMARY ────────────────────────────────────────────────────────────────
console.log("\n===============================================================")
const passed = results.filter((r) => r.status === "PASS").length
const failed = results.filter((r) => r.status === "FAIL").length
console.log(
  `TOTAL TESTS: ${results.length} | PASSED: ${passed} | FAILED: ${failed}`,
)
console.log("===============================================================")

if (failed > 0) {
  process.exit(1)
} else {
  process.exit(0)
}
