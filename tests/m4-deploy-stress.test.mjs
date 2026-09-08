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

console.log("==================================================================")
console.log("  MILESTONE 4 EMPIRICAL STRESS TEST SUITE: CI/CD & VERIFICATION  ")
console.log("==================================================================\n")

// -----------------------------------------------------------------------------
// SUITE 1: GitHub Actions Workflow YAML Syntactic & Structural Validity
// -----------------------------------------------------------------------------
console.log("--- SUITE 1: Workflow YAML Syntactic & Structural Validity ---")

const deployWorkflowPath = path.join(rootDir, ".github", "workflows", "deploy.yml")
let workflowYamlContent = ""
let workflowObj = null

test("deploy.yml file exists and is non-empty", () => {
  assert(fs.existsSync(deployWorkflowPath), `.github/workflows/deploy.yml does not exist at ${deployWorkflowPath}`)
  workflowYamlContent = fs.readFileSync(deployWorkflowPath, "utf8")
  assert(workflowYamlContent.length > 100, `deploy.yml is unexpectedly short (${workflowYamlContent.length} bytes)`)
})

test("deploy.yml contains no prohibited tab characters (YAML spec compliance)", () => {
  const linesWithTabs = workflowYamlContent.split("\n").map((line, idx) => ({ line, num: idx + 1 })).filter(item => item.line.includes("\t"))
  assert.strictEqual(linesWithTabs.length, 0, `YAML contains tab characters on lines: ${linesWithTabs.map(t => t.num).join(", ")}`)
})

test("deploy.yml parses successfully via js-yaml AST parser into valid schema", () => {
  const stdout = execSync("npx --yes js-yaml .github/workflows/deploy.yml", {
    cwd: rootDir,
    encoding: "utf8",
  })
  workflowObj = JSON.parse(stdout)
  assert(workflowObj && typeof workflowObj === "object", "Parsed workflow is not an object")
  assert.strictEqual(workflowObj.name, "Deploy to GitHub Pages", `Unexpected workflow name: "${workflowObj.name}"`)
})

test("Workflow triggers are configured for push to main/master and manual workflow_dispatch", () => {
  assert(workflowObj.on, "Missing 'on' triggers in workflow")
  assert(workflowObj.on.push, "Missing 'push' trigger in workflow")
  assert(Array.isArray(workflowObj.on.push.branches), "push.branches must be an array")
  assert(workflowObj.on.push.branches.includes("main"), "push.branches must include 'main'")
  assert(workflowObj.on.push.branches.includes("master"), "push.branches must include 'master'")
  assert("workflow_dispatch" in workflowObj.on, "Missing 'workflow_dispatch' trigger")
})

test("Workflow concurrency is configured with group 'pages' and cancel-in-progress: false", () => {
  assert(workflowObj.concurrency, "Missing 'concurrency' block")
  assert.strictEqual(
    workflowObj.concurrency.group,
    "pages",
    `Expected concurrency.group to be 'pages', got '${workflowObj.concurrency.group}'`
  )
  assert.strictEqual(
    workflowObj.concurrency["cancel-in-progress"],
    false,
    `Expected cancel-in-progress to be false (prevents corrupting active Pages deployments), got '${workflowObj.concurrency["cancel-in-progress"]}'`
  )
})

test("Top-level permissions strictly conform to GitHub Pages least privilege", () => {
  assert(workflowObj.permissions, "Missing top-level 'permissions' block")
  const perms = workflowObj.permissions
  assert.strictEqual(perms.contents, "read", `Expected permissions.contents: 'read', got '${perms.contents}'`)
  assert.strictEqual(perms.pages, "write", `Expected permissions.pages: 'write', got '${perms.pages}'`)
  assert.strictEqual(perms["id-token"], "write", `Expected permissions.id-token: 'write', got '${perms["id-token"]}'`)
  
  // Adversarial check: ensure no dangerous excess permissions are granted
  const allowedKeys = new Set(["contents", "pages", "id-token"])
  for (const key of Object.keys(perms)) {
    assert(allowedKeys.has(key), `Unnecessary or unexpected permission granted: ${key}: ${perms[key]}`)
  }
})

// -----------------------------------------------------------------------------
// SUITE 2: Action Versions, Pinning & Toolchain Alignment
// -----------------------------------------------------------------------------
console.log("\n--- SUITE 2: Action Versions, Pinning & Toolchain Alignment ---")

test("Workflow defines two distinct jobs: build and deploy with proper dependency", () => {
  assert(workflowObj.jobs, "Missing 'jobs' object")
  assert(workflowObj.jobs.build, "Missing 'build' job")
  assert(workflowObj.jobs.deploy, "Missing 'deploy' job")
  assert.strictEqual(workflowObj.jobs.deploy.needs, "build", "Job 'deploy' must depend on 'build' via 'needs: build'")
  assert.strictEqual(workflowObj.jobs.build["runs-on"], "ubuntu-latest", "Job 'build' runs-on must be 'ubuntu-latest'")
  assert.strictEqual(workflowObj.jobs.deploy["runs-on"], "ubuntu-latest", "Job 'deploy' runs-on must be 'ubuntu-latest'")
})

test("Toolchain versions in deploy.yml match .mise.toml exactly", () => {
  const misePath = path.join(rootDir, ".mise.toml")
  assert(fs.existsSync(misePath), ".mise.toml missing")
  const miseContent = fs.readFileSync(misePath, "utf8")
  
  const nodeMatch = miseContent.match(/node\s*=\s*"([^"]+)"/)
  const pnpmMatch = miseContent.match(/"npm:pnpm"\s*=\s*"([^"]+)"/)
  
  assert(nodeMatch, "Could not extract node version from .mise.toml")
  assert(pnpmMatch, "Could not extract pnpm version from .mise.toml")
  
  const expectedNodeVersion = nodeMatch[1] // "22"
  const expectedPnpmVersion = pnpmMatch[1] // "10.34.3"
  
  const buildSteps = workflowObj.jobs.build.steps
  const pnpmStep = buildSteps.find(s => s.uses && s.uses.startsWith("pnpm/action-setup"))
  const nodeStep = buildSteps.find(s => s.uses && s.uses.startsWith("actions/setup-node"))
  
  assert(pnpmStep, "Missing pnpm/action-setup step")
  assert.strictEqual(
    String(pnpmStep.with?.version),
    expectedPnpmVersion,
    `pnpm version mismatch: workflow has ${pnpmStep.with?.version}, .mise.toml has ${expectedPnpmVersion}`
  )
  
  assert(nodeStep, "Missing actions/setup-node step")
  assert.strictEqual(
    String(nodeStep.with?.["node-version"]),
    expectedNodeVersion,
    `Node version mismatch: workflow has ${nodeStep.with?.["node-version"]}, .mise.toml has ${expectedNodeVersion}`
  )
  assert.strictEqual(nodeStep.with?.cache, "pnpm", "actions/setup-node must specify cache: 'pnpm'")
})

test("Required official GitHub Action versions are pinned in build job steps", () => {
  const steps = workflowObj.jobs.build.steps
  
  const checkoutStep = steps.find(s => s.uses && s.uses.includes("checkout"))
  assert(checkoutStep, "Missing checkout step")
  assert.strictEqual(checkoutStep.uses, "actions/checkout@v4", `Checkout step uses '${checkoutStep.uses}', expected 'actions/checkout@v4'`)

  const pnpmStep = steps.find(s => s.uses && s.uses.includes("action-setup"))
  assert(pnpmStep, "Missing action-setup step")
  assert.strictEqual(pnpmStep.uses, "pnpm/action-setup@v4", `pnpm step uses '${pnpmStep.uses}', expected 'pnpm/action-setup@v4'`)

  const nodeStep = steps.find(s => s.uses && s.uses.includes("setup-node"))
  assert(nodeStep, "Missing setup-node step")
  assert.strictEqual(nodeStep.uses, "actions/setup-node@v4", `setup-node step uses '${nodeStep.uses}', expected 'actions/setup-node@v4'`)

  const configurePagesStep = steps.find(s => s.uses && s.uses.includes("configure-pages"))
  assert(configurePagesStep, "Missing configure-pages step")
  assert.strictEqual(configurePagesStep.uses, "actions/configure-pages@v5", `configure-pages step uses '${configurePagesStep.uses}', expected 'actions/configure-pages@v5'`)
  assert.strictEqual(configurePagesStep.id, "pages", "configure-pages step must have id: 'pages'")

  const uploadArtifactStep = steps.find(s => s.uses && s.uses.includes("upload-pages-artifact"))
  assert(uploadArtifactStep, "Missing upload-pages-artifact step")
  assert.strictEqual(uploadArtifactStep.uses, "actions/upload-pages-artifact@v3", `upload-pages-artifact uses '${uploadArtifactStep.uses}', expected 'actions/upload-pages-artifact@v3'`)
  assert.strictEqual(uploadArtifactStep.with?.path, "./dist", `upload artifact path should be './dist', got '${uploadArtifactStep.with?.path}'`)
})

test("Pre-build typecheck, build step, and artifact verification steps are in build job", () => {
  const steps = workflowObj.jobs.build.steps
  
  // Dependency installation with frozen lockfile
  const installStep = steps.find(s => s.run && s.run.includes("pnpm install"))
  assert(installStep, "Missing 'pnpm install' step")
  assert(installStep.run.includes("--frozen-lockfile"), `Install step should use '--frozen-lockfile': got '${installStep.run}'`)
  
  // Typecheck pre-build
  const typecheckStep = steps.find(s => s.run && s.run.includes("tsc --noEmit"))
  assert(typecheckStep, "Missing pre-build typecheck step ('tsc --noEmit')")
  
  // Build step with BASE_URL env
  const buildStep = steps.find(s => s.run && s.run.includes("pnpm run build"))
  assert(buildStep, "Missing 'pnpm run build' step")
  assert(
    buildStep.env?.BASE_URL && buildStep.env.BASE_URL.includes("steps.pages.outputs.base_path"),
    `Build step must pass BASE_URL from steps.pages.outputs.base_path: got '${buildStep.env?.BASE_URL}'`
  )
  
  // Pre-upload verification step
  const verifyStep = steps.find(s => s.run && s.run.includes("dist/index.html") && s.run.includes("manifest"))
  assert(verifyStep, "Missing pre-upload dist verification step")
})

test("Deploy job uses actions/deploy-pages@v4 with github-pages environment", () => {
  const deployJob = workflowObj.jobs.deploy
  assert(deployJob.environment, "Deploy job missing 'environment' configuration")
  assert.strictEqual(deployJob.environment.name, "github-pages", "environment.name must be 'github-pages'")
  assert(
    deployJob.environment.url.includes("steps.deployment.outputs.page_url"),
    `environment.url must reference steps.deployment.outputs.page_url, got '${deployJob.environment.url}'`
  )
  
  const deployStep = deployJob.steps.find(s => s.uses && s.uses.includes("deploy-pages"))
  assert(deployStep, "Missing deploy-pages step in deploy job")
  assert.strictEqual(deployStep.uses, "actions/deploy-pages@v4", `Expected 'actions/deploy-pages@v4', got '${deployStep.uses}'`)
  assert.strictEqual(deployStep.id, "deployment", "deploy step must have id: 'deployment'")
})

// -----------------------------------------------------------------------------
// SUITE 3: vite.config.ts Base URL Logic & Edge Case Stress Testing
// -----------------------------------------------------------------------------
console.log("\n--- SUITE 3: vite.config.ts Base URL Logic Stress Testing ---")

const viteConfigPath = path.join(rootDir, "vite.config.ts")
let viteConfigRaw = ""

test("vite.config.ts exists and contains dynamic base expression", () => {
  assert(fs.existsSync(viteConfigPath), "vite.config.ts does not exist")
  viteConfigRaw = fs.readFileSync(viteConfigPath, "utf8")
  
  assert(viteConfigRaw.includes("FIGMA_PUBLIC_URL"), "vite.config.ts must inspect process.env.FIGMA_PUBLIC_URL")
  assert(viteConfigRaw.includes("BASE_URL"), "vite.config.ts must inspect process.env.BASE_URL")
  assert(viteConfigRaw.includes('"./"') || viteConfigRaw.includes("'./'"), "vite.config.ts must have fallback './'")
})

// Extract and test the exact logic used in vite.config.ts
function resolveViteBase(env) {
  return env.FIGMA_PUBLIC_URL
    ? `${env.FIGMA_PUBLIC_URL}/`
    : (env.BASE_URL || "./")
}

test("Base evaluation matrix: Default (no env) yields relative './'", () => {
  const res = resolveViteBase({})
  assert.strictEqual(res, "./", `Expected './', got '${res}'`)
})

test("Base evaluation matrix: Empty string BASE_URL yields relative './'", () => {
  const res = resolveViteBase({ BASE_URL: "" })
  assert.strictEqual(res, "./", `Expected './', got '${res}'`)
})

test("Base evaluation matrix: Explicit BASE_URL subpath yields provided subpath", () => {
  const res = resolveViteBase({ BASE_URL: "/rgau-msha-timetable/" })
  assert.strictEqual(res, "/rgau-msha-timetable/", `Expected '/rgau-msha-timetable/', got '${res}'`)
})

test("Base evaluation matrix: FIGMA_PUBLIC_URL takes precedence and appends trailing slash", () => {
  const res = resolveViteBase({
    FIGMA_PUBLIC_URL: "https://figma-make-proxy.dev/preview/42",
    BASE_URL: "/ignore-me/",
  })
  assert.strictEqual(
    res,
    "https://figma-make-proxy.dev/preview/42/",
    `Expected 'https://figma-make-proxy.dev/preview/42/', got '${res}'`
  )
})

test("Dynamic Vite build with custom BASE_URL generates subpath asset references", () => {
  const customSubpath = "/custom-subpath-test/"
  const output = execSync("npm run build", {
    cwd: rootDir,
    env: { ...process.env, BASE_URL: customSubpath, FIGMA_PUBLIC_URL: "" },
    encoding: "utf8",
  })
  assert(output.includes("built in"), "Vite build did not report successful completion")
  
  const distHtmlPath = path.join(rootDir, "dist", "index.html")
  const distHtml = fs.readFileSync(distHtmlPath, "utf8")
  assert(
    distHtml.includes(`${customSubpath}assets/`),
    `Expected dist/index.html to contain '${customSubpath}assets/', but not found`
  )
})

test("Dynamic Vite build with unset BASE_URL cleanly restores relative './assets/' references", () => {
  const output = execSync("npm run build", {
    cwd: rootDir,
    env: { ...process.env, BASE_URL: "", FIGMA_PUBLIC_URL: "" },
    encoding: "utf8",
  })
  assert(output.includes("built in"), "Vite build did not report successful completion")
  
  const distHtmlPath = path.join(rootDir, "dist", "index.html")
  const distHtml = fs.readFileSync(distHtmlPath, "utf8")
  assert(
    distHtml.includes("./assets/"),
    "Expected dist/index.html to contain './assets/' after standard build"
  )
  assert(
    !distHtml.includes("/custom-subpath-test/"),
    "Expected custom subpath to be purged after standard build"
  )
})

// -----------------------------------------------------------------------------
// SUITE 4: TypeScript Typecheck, Package Scripts, and Build Integrity
// -----------------------------------------------------------------------------
console.log("\n--- SUITE 4: TypeScript Typecheck, Scripts & Build Integrity ---")

test("package.json includes required scripts: typecheck, build, build:android, sync:android", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, "package.json"), "utf8"))
  assert.strictEqual(pkg.scripts?.typecheck, "tsc --noEmit", "package.json missing 'typecheck': 'tsc --noEmit'")
  assert.strictEqual(pkg.scripts?.build, "vite build", "package.json missing 'build': 'vite build'")
  assert(pkg.scripts?.["build:android"], "package.json missing 'build:android'")
  assert(pkg.scripts?.["sync:android"], "package.json missing 'sync:android'")
})

test("tsconfig.json includes src, vite.config.ts, and capacitor.config.ts", () => {
  const tsconfig = JSON.parse(fs.readFileSync(path.join(rootDir, "tsconfig.json"), "utf8"))
  assert(Array.isArray(tsconfig.include), "tsconfig.json missing 'include' array")
  assert(tsconfig.include.includes("src"), "tsconfig.json must include 'src'")
  assert(tsconfig.include.includes("vite.config.ts"), "tsconfig.json must include 'vite.config.ts'")
  assert(tsconfig.include.includes("capacitor.config.ts"), "tsconfig.json must include 'capacitor.config.ts'")
})

test("TypeScript compilation (npm run typecheck) exits with code 0 and zero errors", () => {
  let output = ""
  try {
    output = execSync("npm run typecheck", { cwd: rootDir, encoding: "utf8" })
  } catch (err) {
    assert.fail(`npm run typecheck failed with exit code ${err.status}:\n${err.stdout}\n${err.stderr}`)
  }
  assert(!output.toLowerCase().includes("error TS"), `TypeScript reported errors:\n${output}`)
})

test("Production bundle (npm run build) exits with code 0 and emits dist artifacts", () => {
  let output = ""
  try {
    output = execSync("npm run build", { cwd: rootDir, encoding: "utf8" })
  } catch (err) {
    assert.fail(`npm run build failed with exit code ${err.status}:\n${err.stdout}\n${err.stderr}`)
  }
  assert(fs.existsSync(path.join(rootDir, "dist", "index.html")), "dist/index.html is missing after build")
  assert(fs.existsSync(path.join(rootDir, "dist", "assets")), "dist/assets directory is missing after build")
  assert(
    fs.existsSync(path.join(rootDir, "dist", "manifest.webmanifest")) ||
    fs.existsSync(path.join(rootDir, "dist", "manifest.json")),
    "dist manifest is missing after build"
  )
})

// -----------------------------------------------------------------------------
// SUITE 5: Deep Scan of dist/index.html and Relative Asset Path Verification
// -----------------------------------------------------------------------------
console.log("\n--- SUITE 5: Deep Scan of dist/index.html & Relative Asset Links ---")

test("dist/index.html contains ZERO root-absolute '/assets/' references", () => {
  const distHtml = fs.readFileSync(path.join(rootDir, "dist", "index.html"), "utf8")
  
  // Adversarial regexes to catch any leading absolute /assets references
  const absoluteAssetSrcMatch = distHtml.match(/src\s*=\s*["']\/assets\/[^"']*["']/gi)
  const absoluteAssetHrefMatch = distHtml.match(/href\s*=\s*["']\/assets\/[^"']*["']/gi)
  
  assert.strictEqual(
    absoluteAssetSrcMatch,
    null,
    `Found forbidden absolute /assets/ in src attributes: ${JSON.stringify(absoluteAssetSrcMatch)}`
  )
  assert.strictEqual(
    absoluteAssetHrefMatch,
    null,
    `Found forbidden absolute /assets/ in href attributes: ${JSON.stringify(absoluteAssetHrefMatch)}`
  )
})

test("dist/index.html: 100% of script and stylesheet asset links use relative './assets/'", () => {
  const distHtml = fs.readFileSync(path.join(rootDir, "dist", "index.html"), "utf8")
  
  // Find all script tags with src containing assets
  const scriptMatches = [...distHtml.matchAll(/<script[^>]+src=["']([^"']+)["'][^>]*>/gi)]
  assert(scriptMatches.length > 0, "No <script src=...> tags found in dist/index.html")
  for (const match of scriptMatches) {
    const src = match[1]
    if (src.includes("assets/")) {
      assert(
        src.startsWith("./assets/"),
        `Script src '${src}' does not start with relative './assets/'`
      )
    }
  }
  
  // Find all link tags with href containing assets
  const linkMatches = [...distHtml.matchAll(/<link[^>]+href=["']([^"']+)["'][^>]*>/gi)]
  assert(linkMatches.length > 0, "No <link href=...> tags found in dist/index.html")
  for (const match of linkMatches) {
    const href = match[1]
    if (href.includes("assets/")) {
      assert(
        href.startsWith("./assets/"),
        `Stylesheet/asset link href '${href}' does not start with relative './assets/'`
      )
    }
  }
})

test("dist/index.html: PWA Manifest and Favicon links use relative './' paths and exist in dist/", () => {
  const distHtml = fs.readFileSync(path.join(rootDir, "dist", "index.html"), "utf8")
  
  const manifestMatches = [...distHtml.matchAll(/<link[^>]+rel=["']manifest["'][^>]+href=["']([^"']+)["']/gi)]
  assert(manifestMatches.length > 0, "No manifest link found in dist/index.html")
  for (const match of manifestMatches) {
    const href = match[1]
    assert(href.startsWith("./"), `Manifest link '${href}' does not start with './'`)
    const resolvedPath = path.join(rootDir, "dist", href.replace(/^\.\//, ""))
    assert(fs.existsSync(resolvedPath), `Linked manifest file '${resolvedPath}' does not exist on disk`)
  }
  
  const iconMatches = [...distHtml.matchAll(/<link[^>]+rel=["'](?:apple-touch-icon|icon|alternate icon)["'][^>]+href=["']([^"']+)["']/gi)]
  assert(iconMatches.length > 0, "No icon links found in dist/index.html")
  for (const match of iconMatches) {
    const href = match[1]
    if (!href.startsWith("http") && !href.startsWith("data:")) {
      assert(href.startsWith("./"), `Icon link '${href}' does not start with './'`)
      const resolvedPath = path.join(rootDir, "dist", href.replace(/^\.\//, ""))
      assert(fs.existsSync(resolvedPath), `Linked icon file '${resolvedPath}' does not exist on disk`)
    }
  }
})

test("Compiled JavaScript bundles in dist/assets contain no broken root-absolute references to local chunks", () => {
  const assetsDir = path.join(rootDir, "dist", "assets")
  const jsFiles = fs.readdirSync(assetsDir).filter(f => f.endsWith(".js"))
  assert(jsFiles.length > 0, "No JS files found in dist/assets")
  
  for (const jsFile of jsFiles) {
    const content = fs.readFileSync(path.join(assetsDir, jsFile), "utf8")
    // Check that import/worker statements do not reference absolute /assets/
    assert(!content.includes('"/assets/'), `Bundle ${jsFile} contains hardcoded "/assets/" string`)
  }
})

// -----------------------------------------------------------------------------
// SUITE 6: Live CI Runner Step Simulation
// -----------------------------------------------------------------------------
console.log("\n--- SUITE 6: Live CI Runner Step Simulation ---")

test("CI Simulation: pnpm install --frozen-lockfile succeeds with 0 lockfile drift", () => {
  try {
    const out = execSync("npx pnpm@10.34.3 install --frozen-lockfile", {
      cwd: rootDir,
      env: { ...process.env, CI: "true" },
      encoding: "utf8",
    })
    assert(
      out.includes("Lockfile is up to date") || out.includes("Done in"),
      `Unexpected pnpm output: ${out}`
    )
  } catch (err) {
    assert.fail(`pnpm install --frozen-lockfile failed: ${err.message}`)
  }
})

test("CI Simulation: pnpm exec tsc --noEmit executes with exit code 0", () => {
  try {
    execSync("npx pnpm@10.34.3 exec tsc --noEmit", {
      cwd: rootDir,
      encoding: "utf8",
    })
  } catch (err) {
    assert.fail(`pnpm exec tsc --noEmit failed: ${err.message}`)
  }
})

test("CI Simulation: Artifact verification script logic succeeds on generated dist/", () => {
  const hasIndex = fs.existsSync(path.join(rootDir, "dist", "index.html"))
  const hasManifest =
    fs.existsSync(path.join(rootDir, "dist", "manifest.webmanifest")) ||
    fs.existsSync(path.join(rootDir, "dist", "manifest.json"))
  assert(hasIndex, "Artifact verification failed: dist/index.html missing")
  assert(hasManifest, "Artifact verification failed: dist manifest missing")
  
  const topLevelAssets = fs.readdirSync(path.join(rootDir, "dist"))
  assert(topLevelAssets.length >= 3, `Expected at least 3 top-level items in dist, found ${topLevelAssets.length}`)
})

// -----------------------------------------------------------------------------
// SUMMARY & EXIT CODE
// -----------------------------------------------------------------------------
console.log("\n==================================================================")
console.log(`  TOTAL TESTS: ${results.total} | PASSED: ${results.passed} | FAILED: ${results.failed}`)
console.log("==================================================================")

if (results.failed > 0) {
  console.error(`\nFAILED TESTS (${results.failed}):`)
  for (const t of results.tests.filter(t => t.status === "FAIL")) {
    console.error(`  - ${t.name}: ${t.error}`)
  }
  process.exit(1)
} else {
  console.log(`\nALL ${results.total} EMPIRICAL STRESS CHECKS PASSED WITH 100% SUCCESS!`)
  process.exit(0)
}
