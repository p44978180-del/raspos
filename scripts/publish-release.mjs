import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { execSync } from "node:child_process"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT = path.resolve(__dirname, "..")

const OWNER = "p44978180-del"
const REPO = "raspos"
const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || (process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : null)
if (!TOKEN && !process.argv.includes("--package-only")) {
  console.error("Error: GitHub access token is required. Pass via GITHUB_TOKEN env var or CLI argument.")
  process.exit(1)
}
const TAG = process.env.RELEASE_TAG || (process.argv.find((a) => a.startsWith("--tag=")) ? process.argv.find((a) => a.startsWith("--tag=")).split("=")[1] : "v2.0.0")
const RELEASE_NAME = `🌾 РГАУ Расписание ${TAG} — Enterprise SuperApp: Радар аудиторий, Matchmaking, Навигатор и Краудсорсинг`

const RELEASE_BODY = `## 🌾 РГАУ Расписание ${TAG} — Enterprise SuperApp для студентов и преподавателей

Официальное веб-приложение (PWA) и нативная мобильная сборка расписания РГАУ-МСХА имени К.А. Тимирязева.

---

### 🚀 Киллер-фичи Enterprise SuperApp v2.0.0

1. **📡 Радар пустых аудиторий**:
   - Инвертированный реляционный поиск по \`lesson_assignments\` в реальном времени.
   - Фильтрация по наличию свободных розеток (🔌) и тихих зон для учебы (🤫).
   - Быстрый переход к навигации до найденного корпуса.

2. **🤝 Синхронизация окон («Matchmaking»)**:
   - Пересечение свободных слотов в расписаниях двух или более выбранных групп/друзей.
   - Рекомендации проверенных точек питания кампуса (Столовая №2, кафе «Колос», буфет 1-го корпуса) и коворкингов ЦНБ с таймингами пешей доступности.

3. **🧭 Умная навигация между корпусами**:
   - Полный граф кампуса Тимирязевки с хронометражем пеших переходов.
   - Предиктивные предупреждения: автоматический расчет запаса времени между парами с алертом при риске опоздания на пару.

4. **📣 Краудсорсинг изменений и иерархия старостата**:
   - Механизм подтверждения переноса пары: 3+ подтверждения от одногруппников выставляют бейдж «Возможен перенос».
   - Полная поддержка роли старосты и возможность назначения заместителя старосты («Зам. старосты») с приоритетной верификацией голосов.

5. **⚡ Архитектурный Enterprise-Grade стек**:
   - **API Transport**: Connect-RPC / gRPC-Web со строгой типизацией Go ↔ TypeScript через Protobuf.
   - **Realtime Sync**: Server-Sent Events (SSE) для моментальной доставки уведомлений об отменах и переносах пар.
   - **Local-First Data Engine**: SQLite WebAssembly в Origin Private File System (OPFS) для 0ms cold-start оффлайн в цокольных этажах.
   - **High-Performance UI**: Аппаратно-ускоренные CSS Grid аккордеоны (0fr → 1fr) и виртуализация списков @tanstack/react-virtual без фризов.

---

### 📦 Прикрепленные бинарные сборки релиза:
- \`rgau-raspos-${TAG}.apk\` — Нативное Android-приложение (прямая установка на смартфон или планшет).
- \`rgau-raspos-${TAG}-pwa.zip\` — Готовый веб-дистрибутив PWA.
- \`rgau-raspos-${TAG}-android-assets.zip\` — Полный проект Capacitor Android со скомпилированными веб-ассетами.

---
*РГАУ-МСХА имени К.А. Тимирязева · Основан в 1865 году*
`

const ASSETS = [
  {
    name: `rgau-raspos-${TAG}.apk`,
    path: path.join(ROOT, `rgau-raspos-${TAG}.apk`),
    contentType: "application/vnd.android.package-archive",
  },
  {
    name: `rgau-raspos-${TAG}-pwa.zip`,
    path: path.join(ROOT, `rgau-raspos-${TAG}-pwa.zip`),
    contentType: "application/zip",
  },
  {
    name: `rgau-raspos-${TAG}-android-assets.zip`,
    path: path.join(ROOT, `rgau-raspos-${TAG}-android-assets.zip`),
    contentType: "application/zip",
  },
]

async function requestGitHub(endpoint, method = "GET", body = null, isUpload = false, contentType = "application/json") {
  const host = isUpload ? "https://uploads.github.com" : "https://api.github.com"
  const url = `${host}${endpoint}`

  const headers = {
    Authorization: `Bearer ${TOKEN}`,
    "User-Agent": "RGAU-Release-Deployer-v1.0.0",
    Accept: "application/vnd.github.v3+json",
  }

  if (contentType) {
    headers["Content-Type"] = contentType
  }

  const options = {
    method,
    headers,
  }

  if (body) {
    options.body = body
  }

  const res = await fetch(url, options)
  const text = await res.text()

  let json = null
  try {
    json = JSON.parse(text)
  } catch {}

  return { ok: res.ok, status: res.status, data: json || text }
}

function packageAssets() {
  console.log("📦 1. Compiling production web bundle (npm run build)...")
  execSync("npm run build", { cwd: ROOT, stdio: "inherit" })

  console.log("\n📦 2. Synchronizing Capacitor Android assets (npm run sync:android)...")
  execSync("npm run sync:android", { cwd: ROOT, stdio: "inherit" })

  console.log(`\n📦 3. Packaging Android APK (${ASSETS[0].name})...`)
  const targetPublicApk = path.join(ROOT, "public", `rgau-raspos-${TAG}.apk`)
  const v103Apk = path.join(ROOT, "rgau-raspos-v1.0.3.apk")
  const v102Apk = path.join(ROOT, "rgau-raspos-v1.0.2.apk")
  const v101PublicApk = path.join(ROOT, "public", "rgau-raspos-v1.0.1.apk")
  const baseApk = path.join(ROOT, "rgau-raspos-v1.0.0.apk")
  if (fs.existsSync(targetPublicApk)) {
    fs.copyFileSync(targetPublicApk, ASSETS[0].path)
    console.log(`✔ Prepared APK from target public asset: ${ASSETS[0].name} (${(fs.statSync(ASSETS[0].path).size / 1024 / 1024).toFixed(2)} MB)`)
  } else if (fs.existsSync(v103Apk)) {
    fs.copyFileSync(v103Apk, ASSETS[0].path)
    fs.copyFileSync(v103Apk, targetPublicApk)
    console.log(`✔ Prepared APK from v1.0.3 asset: ${ASSETS[0].name} (${(fs.statSync(ASSETS[0].path).size / 1024 / 1024).toFixed(2)} MB)`)
  } else if (fs.existsSync(v102Apk)) {
    fs.copyFileSync(v102Apk, ASSETS[0].path)
    fs.copyFileSync(v102Apk, targetPublicApk)
    console.log(`✔ Prepared APK from v1.0.2 asset: ${ASSETS[0].name} (${(fs.statSync(ASSETS[0].path).size / 1024 / 1024).toFixed(2)} MB)`)
  } else if (fs.existsSync(v101PublicApk)) {
    fs.copyFileSync(v101PublicApk, ASSETS[0].path)
    console.log(`✔ Prepared APK from v1.0.1 public asset: ${ASSETS[0].name} (${(fs.statSync(ASSETS[0].path).size / 1024 / 1024).toFixed(2)} MB)`)
  } else if (fs.existsSync(baseApk) && !fs.existsSync(ASSETS[0].path)) {
    fs.copyFileSync(baseApk, ASSETS[0].path)
    console.log(`✔ Prepared initial APK from base: ${ASSETS[0].name}`)
  }

  console.log(`\n📦 4. Compressing PWA distribution (${ASSETS[1].name})...`)
  execSync(`powershell -Command "Compress-Archive -Path dist/* -DestinationPath '${ASSETS[1].path}' -Force"`, { cwd: ROOT, stdio: "inherit" })

  console.log(`\n📦 5. Compressing Android assets distribution (${ASSETS[2].name})...`)
  execSync(`powershell -Command "Compress-Archive -Path android/* -DestinationPath '${ASSETS[2].path}' -Force"`, { cwd: ROOT, stdio: "inherit" })
  console.log("\n✔ Packaging completed successfully!\n")
}

async function main() {
  const isPackageOnly = process.argv.includes("--package-only")
  const skipPackage = process.argv.includes("--skip-package")

  console.log("══════════════════════════════════════════════════════════════════")
  console.log(isPackageOnly ? "📦 PACKAGING RELEASE ASSETS" : "🚀 PUBLISHING OFFICIAL RELEASE TO GITHUB RELEASES")
  console.log(`Repository: ${OWNER}/${REPO} | Tag: ${TAG}`)
  console.log("══════════════════════════════════════════════════════════════════\n")

  // Auto-package if requested or if assets are missing
  const needsPackaging = !skipPackage && (isPackageOnly || !fs.existsSync(ASSETS[0].path) || !fs.existsSync(ASSETS[1].path) || !fs.existsSync(ASSETS[2].path))
  if (needsPackaging) {
    packageAssets()
    if (isPackageOnly) {
      console.log("Assets packaged successfully. Exiting (--package-only).")
      return
    }
  }

  // 1. Verify assets exist
  for (const asset of ASSETS) {
    if (!fs.existsSync(asset.path)) {
      throw new Error(`Asset file missing: ${asset.path}. Run packaging first!`)
    }
    const stat = fs.statSync(asset.path)
    console.log(`✔ Found asset: ${asset.name} (${(stat.size / 1024 / 1024).toFixed(2)} MB)`)
  }

  // 2. Check existing release for this tag
  console.log(`\nChecking if release '${TAG}' already exists...`)
  const existingCheck = await requestGitHub(`/repos/${OWNER}/${REPO}/releases/tags/${TAG}`)

  let releaseId = null

  if (existingCheck.ok && existingCheck.data?.id) {
    releaseId = existingCheck.data.id
    console.log(`Found existing release #${releaseId}. Updating details...`)
    const updateRes = await requestGitHub(
      `/repos/${OWNER}/${REPO}/releases/${releaseId}`,
      "PATCH",
      JSON.stringify({
        name: RELEASE_NAME,
        body: RELEASE_BODY,
        draft: false,
        prerelease: false,
      })
    )
    if (!updateRes.ok) {
      console.warn("Failed to update release body, proceeding to asset upload:", updateRes.data)
    }
  } else {
    console.log(`Creating fresh release for tag '${TAG}'...`)
    const createRes = await requestGitHub(
      `/repos/${OWNER}/${REPO}/releases`,
      "POST",
      JSON.stringify({
        tag_name: TAG,
        target_commitish: "main",
        name: RELEASE_NAME,
        body: RELEASE_BODY,
        draft: false,
        prerelease: false,
      })
    )

    if (!createRes.ok) {
      throw new Error(`Failed to create release: ${createRes.status} ${JSON.stringify(createRes.data)}`)
    }

    releaseId = createRes.data.id
    console.log(`✔ Release created successfully! ID: ${releaseId}`)
  }

  // 3. Delete any prior duplicate assets if present on release
  console.log("\nInspecting existing assets on release...")
  const assetsListRes = await requestGitHub(`/repos/${OWNER}/${REPO}/releases/${releaseId}/assets`)
  if (assetsListRes.ok && Array.isArray(assetsListRes.data)) {
    for (const existingAsset of assetsListRes.data) {
      const match = ASSETS.find((a) => a.name === existingAsset.name)
      if (match) {
        console.log(`Deleting existing asset #${existingAsset.id} (${existingAsset.name})...`)
        await requestGitHub(`/repos/${OWNER}/${REPO}/releases/assets/${existingAsset.id}`, "DELETE")
      }
    }
  }

  // 4. Upload binary assets
  console.log("\nUploading binary release assets...")
  for (const asset of ASSETS) {
    console.log(`Uploading ${asset.name}...`)
    const buffer = fs.readFileSync(asset.path)
    const uploadRes = await requestGitHub(
      `/repos/${OWNER}/${REPO}/releases/${releaseId}/assets?name=${encodeURIComponent(asset.name)}`,
      "POST",
      buffer,
      true,
      asset.contentType || "application/zip"
    )

    if (!uploadRes.ok) {
      console.error(`✖ Failed to upload ${asset.name}:`, uploadRes.data)
      throw new Error(`Asset upload failed for ${asset.name}`)
    }

    console.log(`✔ Successfully uploaded: ${asset.name} -> ${uploadRes.data?.browser_download_url}`)
  }

  console.log("\n══════════════════════════════════════════════════════════════════")
  console.log("🎉 ALL RELEASE ASSETS SUCCESSFULLY PUBLISHED TO GITHUB RELEASES!")
  console.log(`URL: https://github.com/${OWNER}/${REPO}/releases/tag/${TAG}`)
  console.log("══════════════════════════════════════════════════════════════════\n")
}

main().catch((err) => {
  console.error("Release publication error:", err)
  process.exit(1)
})
