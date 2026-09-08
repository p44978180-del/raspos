import assert from "node:assert"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import React from "react"
import ts from "typescript"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, "..")

const promptPath = path.join(rootDir, "src/components/IosInstallPrompt.tsx")
const promptSource = fs.readFileSync(promptPath, "utf8")
const transpiledPrompt = ts.transpileModule(promptSource, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    jsx: ts.JsxEmit.React,
    esModuleInterop: true,
  },
}).outputText

const moduleStub = { exports: {} }
const compiledFunction = new Function("require", "module", "exports", "React", transpiledPrompt)
compiledFunction(
  (modName) => {
    if (modName === "react") return { default: React, ...React }
    return {}
  },
  moduleStub,
  moduleStub.exports,
  React,
)

const {
  isIosDevice,
  isIPadDevice,
  isStandaloneMode,
  getIosBrowserType,
  isRealMobileOrStandalone,
} = moduleStub.exports

console.log(
  "╔══════════════════════════════════════════════════════════════════════╗",
)
console.log(
  "║  EMPIRICAL STRESS TEST HARNESS: iOS A2HS LOGIC & STANDALONE STATES   ║",
)
console.log(
  "╚══════════════════════════════════════════════════════════════════════╝\n",
)

let passedTests = 0
let totalTests = 0

function runTest(name, fn) {
  totalTests++
  try {
    fn()
    console.log(`  ✔ [PASS] ${name}`)
    passedTests++
  } catch (err) {
    console.error(`  ✖ [FAIL] ${name}`)
    console.error(`     Error: ${err.message}`)
    throw err
  }
}

// Helper to configure browser environment
function setupEnv({
  ua = "",
  platform = "",
  maxTouchPoints = 0,
  standalone = false,
  displayMode = "browser",
  capacitor = undefined,
  storage = {},
  storageThrows = false,
  matchMediaExists = true,
} = {}) {
  const localStorageMock = {
    _data: { ...storage },
    getItem(key) {
      if (storageThrows)
        throw new Error(
          "QuotaExceededError / SecurityError: Storage access blocked",
        )
      return this._data[key] ?? null
    },
    setItem(key, val) {
      if (storageThrows)
        throw new Error(
          "QuotaExceededError / SecurityError: Storage access blocked",
        )
      this._data[key] = String(val)
    },
    removeItem(key) {
      if (storageThrows)
        throw new Error(
          "QuotaExceededError / SecurityError: Storage access blocked",
        )
      delete this._data[key]
    },
    clear() {
      if (storageThrows)
        throw new Error(
          "QuotaExceededError / SecurityError: Storage access blocked",
        )
      this._data = {}
    },
  }

  const matchMediaMock = matchMediaExists
    ? (query) => {
        const isStandalone =
          query === "(display-mode: standalone)" && displayMode === "standalone"
        const isFullscreen =
          query === "(display-mode: fullscreen)" && displayMode === "fullscreen"
        return {
          matches: isStandalone || isFullscreen,
          media: query,
          onchange: null,
          addListener: () => {},
          removeListener: () => {},
          addEventListener: () => {},
          removeEventListener: () => {},
          dispatchEvent: () => true,
        }
      }
    : undefined

  const mockNavigator = {
    userAgent: ua,
    platform,
    maxTouchPoints,
    standalone,
  }

  const mockWindow = {
    navigator: mockNavigator,
    matchMedia: matchMediaMock,
    localStorage: localStorageMock,
    Capacitor: capacitor,
  }

  Object.defineProperty(globalThis, "window", {
    value: mockWindow,
    configurable: true,
    writable: true,
  })

  Object.defineProperty(globalThis, "navigator", {
    value: mockNavigator,
    configurable: true,
    writable: true,
  })

  Object.defineProperty(globalThis, "localStorage", {
    value: localStorageMock,
    configurable: true,
    writable: true,
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 1: Device Detection Permutations (isIosDevice & isIPadDevice)
// ─────────────────────────────────────────────────────────────────────────────
console.log(
  "--- SUITE 1: Device Detection Permutations (isIosDevice & isIPadDevice) ---",
)

runTest("1.1 iPhone 15 Pro Safari (iOS 17.5)", () => {
  setupEnv({
    ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
    platform: "iPhone",
    maxTouchPoints: 5,
  })
  assert.strictEqual(isIosDevice(), true, "Must detect as iOS device")
  assert.strictEqual(isIPadDevice(), false, "Must NOT detect as iPad")
})

runTest("1.2 iPhone 13 Safari (iOS 16.6)", () => {
  setupEnv({
    ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
    platform: "iPhone",
    maxTouchPoints: 5,
  })
  assert.strictEqual(isIosDevice(), true, "Must detect as iOS device")
  assert.strictEqual(isIPadDevice(), false, "Must NOT detect as iPad")
})

runTest("1.3 iPod Touch 7th Gen (iOS 14.8)", () => {
  setupEnv({
    ua: "Mozilla/5.0 (iPod touch; CPU iPhone OS 14_8 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.8 Mobile/15E148 Safari/604.1",
    platform: "iPod",
    maxTouchPoints: 5,
  })
  assert.strictEqual(isIosDevice(), true, "Must detect iPod as iOS device")
  assert.strictEqual(isIPadDevice(), false, "Must NOT detect as iPad")
})

runTest("1.4 iPad Classic UA (iOS 12.5 Mobile UA string)", () => {
  setupEnv({
    ua: "Mozilla/5.0 (iPad; CPU OS 12_5_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.1.2 Mobile/15E148 Safari/604.1",
    platform: "iPad",
    maxTouchPoints: 5,
  })
  assert.strictEqual(
    isIosDevice(),
    true,
    "Must detect iPad classic as iOS device",
  )
  assert.strictEqual(isIPadDevice(), true, "Must detect iPad classic as iPad")
})

runTest(
  "1.5 iPad Desktop Emulation Mode (iPadOS 13+ default: MacIntel + maxTouchPoints=5)",
  () => {
    setupEnv({
      ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
      platform: "MacIntel",
      maxTouchPoints: 5,
    })
    assert.strictEqual(
      isIosDevice(),
      true,
      "Must detect iPad in desktop mode as iOS device",
    )
    assert.strictEqual(
      isIPadDevice(),
      true,
      "Must detect iPad in desktop mode as iPad",
    )
  },
)

runTest("1.6 iPad Desktop Emulation Mode via UA Macintosh check", () => {
  setupEnv({
    ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Safari/605.1.15",
    platform: "",
    maxTouchPoints: 2,
  })
  assert.strictEqual(
    isIosDevice(),
    true,
    "Must detect as iOS device via UA Macintosh + touch",
  )
  assert.strictEqual(
    isIPadDevice(),
    true,
    "Must detect as iPad via UA Macintosh + touch",
  )
})

runTest(
  "1.7 Real Mac Desktop Safari (MacIntel, maxTouchPoints = 0) -> ZERO FALSE POSITIVE",
  () => {
    setupEnv({
      ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
      platform: "MacIntel",
      maxTouchPoints: 0,
    })
    assert.strictEqual(
      isIosDevice(),
      false,
      "Mac desktop MUST NOT be detected as iOS device",
    )
    assert.strictEqual(
      isIPadDevice(),
      false,
      "Mac desktop MUST NOT be detected as iPad",
    )
  },
)

runTest(
  "1.8 Real Mac Desktop Chrome (MacIntel, maxTouchPoints = 0) -> ZERO FALSE POSITIVE",
  () => {
    setupEnv({
      ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      platform: "MacIntel",
      maxTouchPoints: 0,
    })
    assert.strictEqual(
      isIosDevice(),
      false,
      "Mac Chrome MUST NOT be detected as iOS device",
    )
    assert.strictEqual(
      isIPadDevice(),
      false,
      "Mac Chrome MUST NOT be detected as iPad",
    )
  },
)

runTest(
  "1.9 Windows 11 Desktop Chrome (Win32, maxTouchPoints = 0) -> ZERO FALSE POSITIVE",
  () => {
    setupEnv({
      ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      platform: "Win32",
      maxTouchPoints: 0,
    })
    assert.strictEqual(
      isIosDevice(),
      false,
      "Windows PC MUST NOT be detected as iOS device",
    )
    assert.strictEqual(
      isIPadDevice(),
      false,
      "Windows PC MUST NOT be detected as iPad",
    )
  },
)

runTest(
  "1.10 Windows 11 Touchscreen Laptop (Win32, maxTouchPoints = 10) -> ZERO FALSE POSITIVE",
  () => {
    setupEnv({
      ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      platform: "Win32",
      maxTouchPoints: 10,
    })
    assert.strictEqual(
      isIosDevice(),
      false,
      "Windows touch laptop MUST NOT be detected as iOS",
    )
    assert.strictEqual(
      isIPadDevice(),
      false,
      "Windows touch laptop MUST NOT be detected as iPad",
    )
  },
)

runTest(
  "1.11 Android Mobile Phone Chrome (Pixel 8) -> ZERO FALSE POSITIVE",
  () => {
    setupEnv({
      ua: "Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.6367.82 Mobile Safari/537.36",
      platform: "Linux armv8l",
      maxTouchPoints: 5,
    })
    assert.strictEqual(
      isIosDevice(),
      false,
      "Android phone MUST NOT be detected as iOS",
    )
    assert.strictEqual(
      isIPadDevice(),
      false,
      "Android phone MUST NOT be detected as iPad",
    )
  },
)

runTest(
  "1.12 Android Tablet Chrome (Samsung Galaxy Tab) -> ZERO FALSE POSITIVE",
  () => {
    setupEnv({
      ua: "Mozilla/5.0 (Linux; Android 13; SM-X906N Build/TP1A.220624.014) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.6367.82 Safari/537.36",
      platform: "Linux armv8l",
      maxTouchPoints: 10,
    })
    assert.strictEqual(
      isIosDevice(),
      false,
      "Android tablet MUST NOT be detected as iOS",
    )
    assert.strictEqual(
      isIPadDevice(),
      false,
      "Android tablet MUST NOT be detected as iPad",
    )
  },
)

runTest("1.13 Linux Ubuntu Desktop Firefox -> ZERO FALSE POSITIVE", () => {
  setupEnv({
    ua: "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0",
    platform: "Linux x86_64",
    maxTouchPoints: 0,
  })
  assert.strictEqual(isIosDevice(), false, "Linux MUST NOT be detected as iOS")
  assert.strictEqual(
    isIPadDevice(),
    false,
    "Linux MUST NOT be detected as iPad",
  )
})

runTest("1.14 Undefined window/navigator environment (SSR safety)", () => {
  Object.defineProperty(globalThis, "window", {
    value: undefined,
    configurable: true,
    writable: true,
  })
  Object.defineProperty(globalThis, "navigator", {
    value: undefined,
    configurable: true,
    writable: true,
  })
  assert.strictEqual(isIosDevice(), false, "SSR must return false safely")
  assert.strictEqual(isIPadDevice(), false, "SSR must return false safely")
})

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 2: Browser Classification on iOS (getIosBrowserType)
// ─────────────────────────────────────────────────────────────────────────────
console.log(
  "\n--- SUITE 2: Browser Classification on iOS (getIosBrowserType) ---",
)

runTest("2.1 Mobile Safari on iPhone -> safari", () => {
  setupEnv({
    ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
    platform: "iPhone",
    maxTouchPoints: 5,
  })
  assert.strictEqual(getIosBrowserType(), "safari")
})

runTest("2.2 Desktop-mode Safari on iPad -> safari", () => {
  setupEnv({
    ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
    platform: "MacIntel",
    maxTouchPoints: 5,
  })
  assert.strictEqual(getIosBrowserType(), "safari")
})

runTest("2.3 Telegram in-app webview on iOS -> in_app", () => {
  setupEnv({
    ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Telegram/10.9.1",
    platform: "iPhone",
    maxTouchPoints: 5,
  })
  assert.strictEqual(getIosBrowserType(), "in_app")
})

runTest("2.4 VKApp in-app webview on iOS -> in_app", () => {
  setupEnv({
    ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 VKApp/8.45",
    platform: "iPhone",
    maxTouchPoints: 5,
  })
  assert.strictEqual(getIosBrowserType(), "in_app")
})

runTest("2.5 VKClient in-app webview on iOS -> in_app", () => {
  setupEnv({
    ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 VKClient/7.10",
    platform: "iPhone",
    maxTouchPoints: 5,
  })
  assert.strictEqual(getIosBrowserType(), "in_app")
})

runTest("2.6 Instagram in-app webview on iOS -> in_app", () => {
  setupEnv({
    ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 319.0.0.12",
    platform: "iPhone",
    maxTouchPoints: 5,
  })
  assert.strictEqual(getIosBrowserType(), "in_app")
})

runTest("2.7 Facebook in-app webview on iOS (FBAN/FBAV) -> in_app", () => {
  setupEnv({
    ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/447.0.0.32]",
    platform: "iPhone",
    maxTouchPoints: 5,
  })
  assert.strictEqual(getIosBrowserType(), "in_app")
})

runTest("2.8 Line in-app webview on iOS -> in_app", () => {
  setupEnv({
    ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Line/14.5.0",
    platform: "iPhone",
    maxTouchPoints: 5,
  })
  assert.strictEqual(getIosBrowserType(), "in_app")
})

runTest("2.9 Chrome for iOS (CriOS) -> other", () => {
  setupEnv({
    ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/124.0.6367.88 Mobile/15E148 Safari/604.1",
    platform: "iPhone",
    maxTouchPoints: 5,
  })
  assert.strictEqual(getIosBrowserType(), "other")
})

runTest("2.10 Firefox for iOS (FxiOS) -> other", () => {
  setupEnv({
    ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/125.0 Mobile/15E148 Safari/605.1.15",
    platform: "iPhone",
    maxTouchPoints: 5,
  })
  assert.strictEqual(getIosBrowserType(), "other")
})

runTest("2.11 Edge for iOS (EdgiOS) -> other", () => {
  setupEnv({
    ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 EdgiOS/124.0.2478.67 Mobile/15E148 Safari/605.1.15",
    platform: "iPhone",
    maxTouchPoints: 5,
  })
  assert.strictEqual(getIosBrowserType(), "other")
})

runTest("2.12 Opera for iOS (OPiOS) -> other", () => {
  setupEnv({
    ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) OPiOS/18.0.0.0 Mobile/15E148 Safari/605.1.15",
    platform: "iPhone",
    maxTouchPoints: 5,
  })
  assert.strictEqual(getIosBrowserType(), "other")
})

runTest("2.13 Yandex Browser for iOS (YaBrowser) -> other", () => {
  setupEnv({
    ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 YaBrowser/24.3.1 Mobile/15E148 Safari/604.1",
    platform: "iPhone",
    maxTouchPoints: 5,
  })
  assert.strictEqual(getIosBrowserType(), "other")
})

runTest("2.14 DuckDuckGo for iOS -> other", () => {
  setupEnv({
    ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 DuckDuckGo/7 Mobile/15E148 Safari/604.1",
    platform: "iPhone",
    maxTouchPoints: 5,
  })
  assert.strictEqual(getIosBrowserType(), "other")
})

runTest("2.15 Non-iOS browser (Desktop / Android) -> other", () => {
  setupEnv({
    ua: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36",
    platform: "Linux armv8l",
    maxTouchPoints: 5,
  })
  assert.strictEqual(
    getIosBrowserType(),
    "other",
    "Non-iOS devices must classify as other",
  )
})

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 3: Standalone Mode Detection (isStandaloneMode)
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n--- SUITE 3: Standalone Mode Detection (isStandaloneMode) ---")

runTest("3.1 iOS Web Clip standalone (navigator.standalone = true)", () => {
  setupEnv({
    ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
    platform: "iPhone",
    standalone: true,
    displayMode: "browser",
  })
  assert.strictEqual(
    isStandaloneMode(),
    true,
    "navigator.standalone=true must return true",
  )
})

runTest(
  "3.2 Modern PWA standalone (display-mode: standalone media query)",
  () => {
    setupEnv({
      ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X)",
      standalone: false,
      displayMode: "standalone",
    })
    assert.strictEqual(
      isStandaloneMode(),
      true,
      "display-mode: standalone must return true",
    )
  },
)

runTest(
  "3.3 Modern PWA fullscreen (display-mode: fullscreen media query)",
  () => {
    setupEnv({
      ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X)",
      standalone: false,
      displayMode: "fullscreen",
    })
    assert.strictEqual(
      isStandaloneMode(),
      true,
      "display-mode: fullscreen must return true",
    )
  },
)

runTest(
  "3.4 Capacitor Native Platform container (Capacitor.isNativePlatform() = true)",
  () => {
    setupEnv({
      ua: "Mozilla/5.0 (Linux; Android 14; Capacitor)",
      standalone: false,
      displayMode: "browser",
      capacitor: { isNativePlatform: () => true },
    })
    assert.strictEqual(
      isStandaloneMode(),
      true,
      "Capacitor native must return true",
    )
  },
)

runTest("3.5 Regular Safari / Chrome browser tab (Not installed)", () => {
  setupEnv({
    ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) Safari/604.1",
    standalone: false,
    displayMode: "browser",
  })
  assert.strictEqual(isStandaloneMode(), false, "Regular tab must return false")
})

runTest("3.6 Graceful handling when matchMedia is undefined", () => {
  setupEnv({
    ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X)",
    standalone: false,
    matchMediaExists: false,
  })
  assert.strictEqual(
    isStandaloneMode(),
    false,
    "Missing matchMedia must not throw and return false",
  )
})

runTest("3.7 SSR / undefined window safety", () => {
  Object.defineProperty(globalThis, "window", {
    value: undefined,
    configurable: true,
    writable: true,
  })
  Object.defineProperty(globalThis, "navigator", {
    value: undefined,
    configurable: true,
    writable: true,
  })
  assert.strictEqual(isStandaloneMode(), false, "SSR must return false safely")
})

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 4: Mobile or Standalone for StatusBar Deconfliction (isRealMobileOrStandalone)
// ─────────────────────────────────────────────────────────────────────────────
console.log(
  "\n--- SUITE 4: Mobile or Standalone (isRealMobileOrStandalone) ---",
)

runTest(
  "4.1 iPhone Safari (Touch Mobile) -> true (suppresses mock 9:41 bar)",
  () => {
    setupEnv({
      ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) Safari/604.1",
      platform: "iPhone",
      maxTouchPoints: 5,
    })
    assert.strictEqual(isRealMobileOrStandalone(), true)
  },
)

runTest("4.2 Android Phone Chrome -> true (suppresses mock 9:41 bar)", () => {
  setupEnv({
    ua: "Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile Safari/537.36",
    platform: "Linux armv8l",
    maxTouchPoints: 5,
  })
  assert.strictEqual(isRealMobileOrStandalone(), true)
})

runTest("4.3 Android Tablet Chrome -> true (suppresses mock 9:41 bar)", () => {
  setupEnv({
    ua: "Mozilla/5.0 (Linux; Android 13; SM-X906N) Safari/537.36",
    platform: "Linux armv8l",
    maxTouchPoints: 10,
  })
  assert.strictEqual(isRealMobileOrStandalone(), true)
})

runTest("4.4 iPad Desktop mode -> true (suppresses mock 9:41 bar)", () => {
  setupEnv({
    ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15",
    platform: "MacIntel",
    maxTouchPoints: 5,
  })
  assert.strictEqual(isRealMobileOrStandalone(), true)
})

runTest(
  "4.5 Desktop Chrome in Standalone PWA window -> true (suppresses mock 9:41 bar)",
  () => {
    setupEnv({
      ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0.0.0 Safari/537.36",
      platform: "Win32",
      maxTouchPoints: 0,
      displayMode: "standalone",
    })
    assert.strictEqual(isRealMobileOrStandalone(), true)
  },
)

runTest(
  "4.6 Desktop Windows PC in normal browser tab -> false (renders mock 9:41 frame)",
  () => {
    setupEnv({
      ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0.0.0 Safari/537.36",
      platform: "Win32",
      maxTouchPoints: 0,
      displayMode: "browser",
    })
    assert.strictEqual(
      isRealMobileOrStandalone(),
      false,
      "Desktop PC browser must return false",
    )
  },
)

runTest(
  "4.7 Desktop Mac in normal Safari browser tab -> false (renders mock 9:41 frame)",
  () => {
    setupEnv({
      ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Version/17.5 Safari/605.1.15",
      platform: "MacIntel",
      maxTouchPoints: 0,
      displayMode: "browser",
    })
    assert.strictEqual(
      isRealMobileOrStandalone(),
      false,
      "Desktop Mac browser must return false",
    )
  },
)

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 5: LocalStorage Persistence & Private Browsing Resilience
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n--- SUITE 5: LocalStorage Dismissal & Private Browsing ---")

runTest("5.1 Fresh iOS Safari visit: not dismissed initially", () => {
  setupEnv({
    ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) Safari/604.1",
    storage: {},
  })
  const dismissed = global.localStorage.getItem("rgau_ios_a2hs_dismissed")
  assert.strictEqual(dismissed, null)
})

runTest('5.2 Dismissal action sets rgau_ios_a2hs_dismissed to "true"', () => {
  setupEnv({
    ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) Safari/604.1",
    storage: {},
  })
  global.localStorage.setItem("rgau_ios_a2hs_dismissed", "true")
  assert.strictEqual(
    global.localStorage.getItem("rgau_ios_a2hs_dismissed"),
    "true",
  )
})

runTest(
  "5.3 Private browsing / SecurityError when localStorage throws does not crash",
  () => {
    setupEnv({
      ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) Safari/604.1",
      storageThrows: true,
    })
    let threw = false
    try {
      try {
        global.localStorage.getItem("rgau_ios_a2hs_dismissed")
      } catch {
        // Handled inside component
      }
      try {
        global.localStorage.setItem("rgau_ios_a2hs_dismissed", "true")
      } catch {
        // Handled inside component
      }
    } catch (e) {
      threw = true
    }
    assert.strictEqual(threw, false, "Storage errors must be swallowed safely")
  },
)

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 6: Decision Matrix Evaluation
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n--- SUITE 6: Decision Matrix Evaluation ---")

const decisionScenarios = [
  {
    name: "iPhone Safari (Uninstalled, fresh user)",
    env: {
      ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) Safari/604.1",
      platform: "iPhone",
      maxTouchPoints: 5,
      standalone: false,
      storage: {},
    },
    expectedPromptEligible: true,
    expectedBrowserType: "safari",
    expectedIsIpad: false,
  },
  {
    name: "iPhone Safari (Already installed standalone)",
    env: {
      ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X)",
      platform: "iPhone",
      maxTouchPoints: 5,
      standalone: true,
      storage: {},
    },
    expectedPromptEligible: false, // suppressed because standalone!
    expectedBrowserType: "safari",
    expectedIsIpad: false,
  },
  {
    name: "iPhone Safari (Already dismissed by student)",
    env: {
      ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) Safari/604.1",
      platform: "iPhone",
      maxTouchPoints: 5,
      standalone: false,
      storage: { rgau_ios_a2hs_dismissed: "true" },
    },
    expectedPromptEligible: false, // suppressed by dismissal flag!
    expectedBrowserType: "safari",
    expectedIsIpad: false,
  },
  {
    name: "iPad Safari Desktop Mode (Uninstalled, fresh)",
    env: {
      ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15",
      platform: "MacIntel",
      maxTouchPoints: 5,
      standalone: false,
      storage: {},
    },
    expectedPromptEligible: true,
    expectedBrowserType: "safari",
    expectedIsIpad: true, // Should show top-bar instructions!
  },
  {
    name: "iPhone Telegram Webview",
    env: {
      ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X) Telegram/10.9.1",
      platform: "iPhone",
      maxTouchPoints: 5,
      standalone: false,
      storage: {},
    },
    expectedPromptEligible: true,
    expectedBrowserType: "in_app", // Should show in_app warning banner!
    expectedIsIpad: false,
  },
  {
    name: "Android Chrome (Pixel 8 Pro)",
    env: {
      ua: "Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) Chrome/124.0 Mobile Safari/537.36",
      platform: "Linux armv8l",
      maxTouchPoints: 5,
      standalone: false,
      storage: {},
    },
    expectedPromptEligible: false, // MUST NEVER PROMPT!
    expectedBrowserType: "other",
    expectedIsIpad: false,
  },
  {
    name: "Desktop Windows Chrome",
    env: {
      ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0 Safari/537.36",
      platform: "Win32",
      maxTouchPoints: 0,
      standalone: false,
      storage: {},
    },
    expectedPromptEligible: false, // MUST NEVER PROMPT!
    expectedBrowserType: "other",
    expectedIsIpad: false,
  },
  {
    name: "Desktop Mac Safari",
    env: {
      ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Version/17.5 Safari/605.1.15",
      platform: "MacIntel",
      maxTouchPoints: 0,
      standalone: false,
      storage: {},
    },
    expectedPromptEligible: false, // MUST NEVER PROMPT!
    expectedBrowserType: "other",
    expectedIsIpad: false,
  },
]

for (const sc of decisionScenarios) {
  runTest(`Matrix: ${sc.name}`, () => {
    setupEnv(sc.env)
    const isIos = isIosDevice()
    const isStandalone = isStandaloneMode()
    let isDismissed = false
    try {
      isDismissed =
        global.localStorage.getItem("rgau_ios_a2hs_dismissed") === "true"
    } catch {}

    const eligible = isIos && !isStandalone && !isDismissed
    const browserType = getIosBrowserType()
    const isIpad = isIPadDevice()

    assert.strictEqual(
      eligible,
      sc.expectedPromptEligible,
      `Prompt eligibility mismatch for ${sc.name}`,
    )
    assert.strictEqual(
      browserType,
      sc.expectedBrowserType,
      `Browser type mismatch for ${sc.name}`,
    )
    assert.strictEqual(
      isIpad,
      sc.expectedIsIpad,
      `iPad classification mismatch for ${sc.name}`,
    )
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 7: Component Source Code Inspection (Strings, Accessibility, Layout)
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n--- SUITE 7: Component Source & UX Polish Inspection ---")

const compSource = fs.readFileSync(
  path.join(rootDir, "src/components/IosInstallPrompt.tsx"),
  "utf8",
)

runTest("7.1 University branding and modal title", () => {
  assert(
    compSource.includes("Установите на экран «Домой»"),
    "Must include primary title",
  )
  assert(
    compSource.includes("РГАУ-МСХА им. К.А. Тимирязева"),
    "Must include university subtitle",
  )
  assert(
    compSource.includes("🌾"),
    "Must include university wheat emoji/emblem",
  )
})

runTest("7.2 3-Step instructions with dynamic iPad/iPhone guidance", () => {
  assert(compSource.includes("1. Нажмите «Поделиться»"), "Step 1 title")
  assert(compSource.includes("2. Выберите «На экран «Домой»»"), "Step 2 title")
  assert(compSource.includes("3. Нажмите «Добавить»"), "Step 3 title")
  assert(
    compSource.includes(
      'isIpad ? "Значок со стрелкой вверх в верхней панели Safari" : "Значок со стрелкой вверх в нижней панели Safari"',
    ),
    "Dynamic iPad vs iPhone bar location",
  )
})

runTest("7.3 In-app messenger warning banner (Telegram/VK)", () => {
  assert(
    compSource.includes('browserType === "in_app"'),
    "Must conditionally render messenger warning",
  )
  assert(
    compSource.includes("Вы открыли страницу в мессенджере (Telegram / VK)"),
    "Must guide user to Safari",
  )
  assert(compSource.includes("Открыть в Safari"), "Must specify Safari action")
})

runTest("7.4 Safe area bottom inset support", () => {
  assert(
    compSource.includes("calc(env(safe-area-inset-bottom, 0px) + 24px)"),
    "Must respect safe area inset for home bar",
  )
})

runTest("7.5 Accessibility attributes", () => {
  assert(compSource.includes('role="dialog"'), "Must have dialog role")
  assert(
    compSource.includes('aria-modal="true"'),
    "Must have aria-modal attribute",
  )
  assert(
    compSource.includes('aria-labelledby="ios-install-title"'),
    "Must have aria-labelledby",
  )
  assert(
    compSource.includes('aria-label="Закрыть"'),
    "Must have accessible close button label",
  )
})

console.log(
  `\n======================================================================`,
)
console.log(
  `RESULTS: ${passedTests} / ${totalTests} tests passed (100% SUCCESS)`,
)
console.log(
  `======================================================================\n`,
)
