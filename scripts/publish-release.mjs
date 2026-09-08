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
const TAG = "v1.0.0"
const RELEASE_NAME = "🌾 РГАУ Расписание v1.0.0 — Официальный релиз"

const RELEASE_BODY = `## 🌾 РГАУ Расписание v1.0.0 — Официальный релиз для студентов и преподавателей

Официальное веб-приложение (PWA) и нативная мобильная сборка расписания РГАУ-МСХА имени К.А. Тимирязева.

---

### ✨ Ключевые возможности

1. **⚡ Автономный режим и PWA**:
   - Полная оффлайн-работоспособность: расписание, карта, контакты и памятки доступны даже без интернета.
   - Поддержка установки на экран «Домой» для iOS (iPhone / iPad) и Android с нативным UX.

2. **⏰ Ночная синхронизация в 04:00 МСК**:
   - Автоматическая автономная сверка данных с порталом \`timacad.ru\` каждую ночь в 04:00 МСК.
   - 30+ верифицированных официальных источников Тимирязевки (новости, анонсы, институты, кафедры).

3. **🧹 Умная очистка кэша и Garbage Collection**:
   - Политика устаревания данных (TTL): автоматическое удаление событий и новостей старше 45 дней.
   - Очистка кэшей прошедших недель расписания и удаление временных буферов PDF-парсинга.
   - В профиле доступен мониторинг занятой памяти и кнопка **«Очистить кэш»** с подтверждением и строгим сохранением настроек пользователя (группа, роль, тема, общежитие).

4. **🎓 Режим Старосты и парсинг PDF**:
   - Встроенный 2D-анализатор пространственной сетки официальных PDF-расписаний РГАУ.
   - Управление домашними заданиями, отменами, перемещениями пар и заметками.

5. **🗺️ Интерактивная карта и инфраструктура кампуса**:
   - Точные координаты учебных корпусов (1–29, СК), столовых, буфетов, общежитий и памятников.
   - Расписание звонков и перерывов с динамическим статусом текущей пары.

---

### 📦 Прикрепленные бинарные сборки релиза:
- \`rgau-raspos-v1.0.0-pwa.zip\` — Готовый дистрибутив клиентского веб-приложения / PWA (распаковать и раздать через любой HTTP-сервер или GitHub Pages).
- \`rgau-raspos-v1.0.0-android-assets.zip\` — Полный нативный проект Capacitor Android с синхронизированными веб-ассетами для сборки APK в Android Studio.

---
*РГАУ-МСХА имени К.А. Тимирязева · Основан в 1865 году*
`

const ASSETS = [
  {
    name: "rgau-raspos-v1.0.0-pwa.zip",
    path: path.join(ROOT, "rgau-raspos-v1.0.0-pwa.zip"),
  },
  {
    name: "rgau-raspos-v1.0.0-android-assets.zip",
    path: path.join(ROOT, "rgau-raspos-v1.0.0-android-assets.zip"),
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

  console.log("\n📦 3. Compressing PWA distribution (rgau-raspos-v1.0.0-pwa.zip)...")
  execSync(`powershell -Command "Compress-Archive -Path dist/* -DestinationPath '${ASSETS[0].path}' -Force"`, { cwd: ROOT, stdio: "inherit" })

  console.log("\n📦 4. Compressing Android assets distribution (rgau-raspos-v1.0.0-android-assets.zip)...")
  execSync(`powershell -Command "Compress-Archive -Path android/* -DestinationPath '${ASSETS[1].path}' -Force"`, { cwd: ROOT, stdio: "inherit" })
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
  const needsPackaging = !skipPackage && (isPackageOnly || !fs.existsSync(ASSETS[0].path) || !fs.existsSync(ASSETS[1].path))
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
      "application/zip"
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
