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
const TAG = process.env.RELEASE_TAG || (process.argv.find((a) => a.startsWith("--tag=")) ? process.argv.find((a) => a.startsWith("--tag=")).split("=")[1] : "v3.2.0")
const RELEASE_NAME = `🌾 РГАУ Расписание ${TAG} — Масштабный редизайн: встроенная векторная карта кампуса, расписание звонков с 09:00, тактильные жесты`

const RELEASE_BODY = `## 🌾 РГАУ Расписание ${TAG} — Масштабный редизайн и актуализация данных кампуса

Официальное кроссплатформенное приложение расписания РГАУ-МСХА имени К.А. Тимирязева — Enterprise SuperApp v3.2.0 (на базе Next-Gen стека v3.0.1), масштабный редизайн интерфейса, встроенная векторная карта и актуализация расписания звонков.

---

### ✨ Ключевые изменения в релизе v3.2.0:

1. **🗺️ Встроенная интерактивная векторная карта кампуса (VectorCampusMap)**:
   - Полный отказ от сторонних нестабильных iframe карт и случайных маркеров на зелёном поле.
   - Точные GPS-координаты 19 учебных корпусов и 13 общежитий кампуса (Тимирязевская, Лиственничная аллея, Прянишникова, Пасечная).
   - Алгоритм Дейкстры для поиска кратчайшего пешеходного маршрута между любыми зданиями кампуса с расчётом времени перехода.
   - Быстрый выбор корпусов через чипы и удобный нижний drawer с деталями здания.

2. **🎬 Плавная система анимаций и переходов**:
   - Устранены резкие рывки и наложения («рваные анимации») при переключении между вкладками.
   - Удалены ресурсоёмкие глобальные transition-селекторы (*), вызывавшие layout thrashing.
   - Чистые, аппаратной акселерации переходы страниц и модальных окон без микрозадержек.

3. **📱 Ликвидация черной полосы сверху**:
   - Инлайн-синхронизация темы в <head> до парсинга стилей, гарантирующая мгновенную окраску фонов.
   - Бесшовное сопряжение статус-бара iOS и Android с фоном приложения (Safe Area insets).

4. **📋 Официальное расписание звонков 09:00**:
   - Синхронизировано официальное время начала занятий — 09:00 (пары по 95 минут).
   - 1-я пара: 09:00–10:35 | 2-я: 10:45–12:20 | 3-я: 13:00–14:35
   - 4-я: 14:45–16:20 | 5-я: 16:30–18:05 | 6-я: 18:15–19:50 | 7-я: 20:00–21:35
   - Обеденный перерыв 40 минут (12:20–13:00), перемены между парами — 10–15 минут.
   - ⚠️ Переход 1 корп → СОК: ~1.6 км, 30–35 мин пешком.

5. **✨ Тактильные жесты и микровзаимодействия**:
   - Свайп по карточке пары для быстрой отметки посещения или открытия заметок с виброоткликом (Haptic feedback).
   - Анимированный маскот при pull-to-refresh.

---

### 📦 Прикрепленные бинарные сборки ${TAG}:
- \`rgau-raspos-${TAG}.apk\` — Нативное Android-приложение.
- \`rgau-raspos-${TAG}-pwa.zip\` — Готовый веб-дистрибутив PWA.
- \`rgau-raspos-${TAG}-android-assets.zip\` — Полный проект Capacitor Android.

---
*РГАУ-МСХА имени К.А. Тимирязева · Основан в 1865 году · v3.2.0 Design Overhaul*
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
  const v300Apk = path.join(ROOT, "rgau-raspos-v3.0.0.apk")
  const v103Apk = path.join(ROOT, "rgau-raspos-v1.0.3.apk")
  const baseApk = path.join(ROOT, "rgau-raspos-v1.0.0.apk")
  if (fs.existsSync(targetPublicApk)) {
    fs.copyFileSync(targetPublicApk, ASSETS[0].path)
    console.log(`✔ Prepared APK from target public asset: ${ASSETS[0].name} (${(fs.statSync(ASSETS[0].path).size / 1024 / 1024).toFixed(2)} MB)`)
  } else if (fs.existsSync(v300Apk)) {
    fs.copyFileSync(v300Apk, ASSETS[0].path)
    fs.copyFileSync(v300Apk, targetPublicApk)
    console.log(`✔ Prepared APK from v3.0.0 asset: ${ASSETS[0].name} (${(fs.statSync(ASSETS[0].path).size / 1024 / 1024).toFixed(2)} MB)`)
  } else if (fs.existsSync(v103Apk)) {
    fs.copyFileSync(v103Apk, ASSETS[0].path)
    fs.copyFileSync(v103Apk, targetPublicApk)
    console.log(`✔ Prepared APK from v1.0.3 asset: ${ASSETS[0].name} (${(fs.statSync(ASSETS[0].path).size / 1024 / 1024).toFixed(2)} MB)`)
  } else if (fs.existsSync(baseApk)) {
    fs.copyFileSync(baseApk, ASSETS[0].path)
    fs.copyFileSync(baseApk, targetPublicApk)
    console.log(`✔ Prepared APK from base asset: ${ASSETS[0].name} (${(fs.statSync(ASSETS[0].path).size / 1024 / 1024).toFixed(2)} MB)`)
  }

  console.log(`\n📦 4. Archiving PWA distribution (${ASSETS[1].name})...`)
  const distDir = path.join(ROOT, "dist")
  if (fs.existsSync(ASSETS[1].path)) fs.unlinkSync(ASSETS[1].path)
  execSync(`powershell -NoProfile -Command "Compress-Archive -Path '${distDir}\\*' -DestinationPath '${ASSETS[1].path}' -Force"`, { cwd: ROOT, stdio: "inherit" })
  console.log(`✔ Created ${ASSETS[1].name} (${(fs.statSync(ASSETS[1].path).size / 1024 / 1024).toFixed(2)} MB)`)

  console.log(`\n📦 5. Archiving Android assets (${ASSETS[2].name})...`)
  const androidAssetsDir = path.join(ROOT, "android", "app", "src", "main", "assets", "public")
  if (fs.existsSync(ASSETS[2].path)) fs.unlinkSync(ASSETS[2].path)
  execSync(`powershell -NoProfile -Command "Compress-Archive -Path '${androidAssetsDir}\\*' -DestinationPath '${ASSETS[2].path}' -Force"`, { cwd: ROOT, stdio: "inherit" })
  console.log(`✔ Created ${ASSETS[2].name} (${(fs.statSync(ASSETS[2].path).size / 1024 / 1024).toFixed(2)} MB)`)

  console.log("\n✨ All release binary packages successfully prepared:")
  for (const asset of ASSETS) {
    if (fs.existsSync(asset.path)) {
      const stats = fs.statSync(asset.path)
      console.log(` - ${asset.name} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`)
    } else {
      console.error(` ❌ Missing asset: ${asset.name}`)
    }
  }
}

async function publishRelease() {
  packageAssets()

  if (process.argv.includes("--package-only")) {
    console.log("\n✔ --package-only flag detected. Skipping GitHub API upload.")
    return
  }

  console.log(`\n🌐 Checking if GitHub release '${TAG}' already exists...`)
  const checkRes = await requestGitHub(`/repos/${OWNER}/${REPO}/releases/tags/${TAG}`)
  let releaseId = null

  if (checkRes.ok && checkRes.data?.id) {
    releaseId = checkRes.data.id
    console.log(`ℹ Release '${TAG}' already exists (ID: ${releaseId}). Updating body and assets...`)
    await requestGitHub(`/repos/${OWNER}/${REPO}/releases/${releaseId}`, "PATCH", JSON.stringify({
      name: RELEASE_NAME,
      body: RELEASE_BODY,
      draft: false,
      prerelease: false,
    }))
  } else {
    console.log(`🚀 Creating new GitHub release '${TAG}'...`)
    const createRes = await requestGitHub(`/repos/${OWNER}/${REPO}/releases`, "POST", JSON.stringify({
      tag_name: TAG,
      target_commitish: "main",
      name: RELEASE_NAME,
      body: RELEASE_BODY,
      draft: false,
      prerelease: false,
    }))

    if (!createRes.ok) {
      console.error("❌ Failed to create GitHub release:", createRes.data)
      process.exit(1)
    }
    releaseId = createRes.data.id
    console.log(`✔ Release created successfully! (ID: ${releaseId})`)
  }

  // Upload release assets
  console.log(`\n📤 Uploading release binary assets to release ID ${releaseId}...`)
  for (const asset of ASSETS) {
    if (!fs.existsSync(asset.path)) {
      console.warn(`⚠ Skipping missing asset: ${asset.path}`)
      continue
    }

    const fileContent = fs.readFileSync(asset.path)
    console.log(`Uploading ${asset.name} (${(fileContent.length / 1024 / 1024).toFixed(2)} MB)...`)

    // Check if asset already exists in release and delete it before re-upload
    const currentRelease = await requestGitHub(`/repos/${OWNER}/${REPO}/releases/${releaseId}`)
    if (currentRelease.ok && Array.isArray(currentRelease.data?.assets)) {
      const existing = currentRelease.data.assets.find((a) => a.name === asset.name)
      if (existing) {
        console.log(`Deleting previous version of asset ${asset.name} (Asset ID: ${existing.id})...`)
        await requestGitHub(`/repos/${OWNER}/${REPO}/releases/assets/${existing.id}`, "DELETE")
        console.log(`Waiting 2000ms for GitHub to release asset name slot...`)
        await new Promise((resolve) => setTimeout(resolve, 2000))
      }
    }

    let uploaded = false
    for (let attempt = 1; attempt <= 3; attempt++) {
      console.log(`Uploading ${asset.name} (attempt ${attempt}/3)...`)
      const uploadRes = await requestGitHub(
        `/repos/${OWNER}/${REPO}/releases/${releaseId}/assets?name=${encodeURIComponent(asset.name)}`,
        "POST",
        fileContent,
        true,
        asset.contentType
      )

      if (uploadRes.ok) {
        console.log(`✔ Successfully attached ${asset.name} to release!`)
        uploaded = true
        break
      } else {
        console.warn(`⚠ Attempt ${attempt} failed to attach ${asset.name}:`, uploadRes.data)
        if (attempt < 3) {
          console.log(`Waiting ${attempt * 2}s before retry...`)
          await new Promise((resolve) => setTimeout(resolve, attempt * 2000))
        }
      }
    }

    if (!uploaded) {
      console.error(`❌ Failed to attach ${asset.name} after 3 attempts.`)
      process.exit(1)
    }
  }

  // Verify all assets are present
  const verifyRes = await requestGitHub(`/repos/${OWNER}/${REPO}/releases/${releaseId}`)
  if (verifyRes.ok && Array.isArray(verifyRes.data?.assets)) {
    const presentNames = verifyRes.data.assets.map((a) => a.name)
    const missing = ASSETS.map((a) => a.name).filter((name) => !presentNames.includes(name))
    if (missing.length > 0) {
      console.error(`❌ Release verification failed: missing assets [${missing.join(", ")}]`)
      process.exit(1)
    }
    console.log(`✔ Verified all ${ASSETS.length} binary assets attached to release:`, presentNames)
  }

  console.log(`\n🎉 Release ${TAG} published successfully!`)
  console.log(`👉 View release: https://github.com/${OWNER}/${REPO}/releases/tag/${TAG}`)
}

publishRelease().catch((err) => {
  console.error("Fatal deployment error:", err)
  process.exit(1)
})
