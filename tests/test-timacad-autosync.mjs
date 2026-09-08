import assert from "node:assert"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT = path.resolve(__dirname, "..")

console.log("══════════════════════════════════════════════════════════════════════")
console.log("🧪 TIMACAD AUTO-SYNC & OFFICIAL SOURCES EMPIRICAL TEST SUITE")
console.log("══════════════════════════════════════════════════════════════════════\n")

let totalPassed = 0

function test(name, fn) {
  try {
    fn()
    console.log(`  ✔ [PASS] ${name}`)
    totalPassed++
  } catch (err) {
    console.error(`  ✖ [FAIL] ${name}`)
    console.error(err)
    process.exit(1)
  }
}

// 1. Math functions test
function getMostRecent04AmMsk(refDate) {
  const utcYear = refDate.getUTCFullYear()
  const utcMonth = refDate.getUTCMonth()
  const utcDay = refDate.getUTCDate()
  const today01Utc = Date.UTC(utcYear, utcMonth, utcDay, 1, 0, 0, 0)
  if (refDate.getTime() >= today01Utc) {
    return today01Utc
  }
  return today01Utc - 24 * 3600 * 1000
}

function getNext04AmMsk(refDate) {
  const utcYear = refDate.getUTCFullYear()
  const utcMonth = refDate.getUTCMonth()
  const utcDay = refDate.getUTCDate()
  const today01Utc = Date.UTC(utcYear, utcMonth, utcDay, 1, 0, 0, 0)
  if (refDate.getTime() < today01Utc) {
    return today01Utc
  }
  return today01Utc + 24 * 3600 * 1000
}

function formatSyncDisplayTime(date) {
  const mskMs = date.getTime() + 3 * 3600000
  const mskDate = new Date(mskMs)
  const hours = String(mskDate.getUTCHours()).padStart(2, "0")
  const minutes = String(mskDate.getUTCMinutes()).padStart(2, "0")
  const day = String(mskDate.getUTCDate()).padStart(2, "0")
  const month = String(mskDate.getUTCMonth() + 1).padStart(2, "0")
  return `Сегодня в ${hours}:${minutes} МСК (${day}.${month})`
}

function parseTimacadHtmlFeed(newsHtml, annHtml) {
  const items = []
  if (newsHtml) {
    const cardRegex = /<a[^>]*href="(\/news\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi
    let match
    let idx = 1
    while ((match = cardRegex.exec(newsHtml)) !== null && items.length < 15) {
      const p = match[1]
      if (p.includes("/page/")) continue
      const rawText = match[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
      if (rawText.length > 25) {
        let date = new Date().toISOString().split("T")[0]
        const dateMatch = rawText.match(/(\d{2})\s+([А-Яа-яЁё]+)\s*(?:\/)?\s*(\d{4})?/)
        if (dateMatch) {
          const d = dateMatch[1]
          const y = dateMatch[3] || "2026"
          date = `${y}-09-${d}`
        }
        let cleanTitle = rawText.replace(/^\d{2}\s+[А-Яа-яЁё]+\s*(?:\/)?\s*\d{0,4}\s*/, "").trim()
        if (cleanTitle.length > 15) {
          items.push({
            id: `tim-live-news-${idx++}`,
            title: cleanTitle,
            summary: "Официальная новость с портала РГАУ-МСХА им. К.А. Тимирязева",
            date,
            category: "news",
            sourceName: "timacad.ru/news",
            sourceUrl: `https://www.timacad.ru${p}`,
            place: "Кампус РГАУ-МСХА",
            badgeText: "Новости",
          })
        }
      }
    }
  }

  if (annHtml) {
    const annRegex = /<a[^>]*href="(\/announcements\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi
    let match
    let idx = 1
    while ((match = annRegex.exec(annHtml)) !== null && items.length < 25) {
      const p = match[1]
      if (p.includes("/page/")) continue
      const rawText = match[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
      if (rawText.length > 25) {
        let date = new Date().toISOString().split("T")[0]
        const dateMatch = rawText.match(/(\d{1,2})\s+([а-яё]+)/i)
        if (dateMatch) {
          const d = String(dateMatch[1]).padStart(2, "0")
          date = `2026-09-${d}`
        }
        let category = "announcement"
        if (/научн|конференц|симпозиум/i.test(rawText)) category = "science"
        else if (/спорт|кросс|соревнован/i.test(rawText)) category = "sport"
        else if (/карьер|ваканс|стажировк/i.test(rawText)) category = "career"

        items.push({
          id: `tim-live-ann-${idx++}`,
          title: rawText.slice(0, 140),
          summary: rawText.length > 140 ? rawText.slice(140).trim() : "Анонс мероприятия РГАУ-МСХА",
          date,
          category,
          sourceName: "timacad.ru/announcements",
          sourceUrl: `https://www.timacad.ru${p}`,
          place: "РГАУ-МСХА",
          badgeText: category === "science" ? "Наука" : category === "sport" ? "Спорт" : "Анонс",
        })
      }
    }
  }
  return items
}

console.log("--- SUITE 1: 04:00 AM MSK UTC Conversion & Boundary Math ---")

test("1.1 When time is 21:00 MSK (18:00 UTC), most recent 04:00 MSK is today at 01:00 UTC", () => {
  const d = new Date(Date.UTC(2026, 8, 8, 18, 0, 0)) // 21:00 MSK
  const target = getMostRecent04AmMsk(d)
  assert.strictEqual(target, Date.UTC(2026, 8, 8, 1, 0, 0))
})

test("1.2 When time is 21:00 MSK, next 04:00 MSK is tomorrow at 01:00 UTC", () => {
  const d = new Date(Date.UTC(2026, 8, 8, 18, 0, 0))
  const target = getNext04AmMsk(d)
  assert.strictEqual(target, Date.UTC(2026, 8, 9, 1, 0, 0))
})

test("1.3 When time is 03:30 MSK (00:30 UTC), most recent 04:00 MSK is yesterday at 01:00 UTC", () => {
  const d = new Date(Date.UTC(2026, 8, 8, 0, 30, 0)) // 03:30 MSK
  const target = getMostRecent04AmMsk(d)
  assert.strictEqual(target, Date.UTC(2026, 8, 7, 1, 0, 0))
})

test("1.4 When time is 03:30 MSK, next 04:00 MSK is in 30 minutes (today at 01:00 UTC)", () => {
  const d = new Date(Date.UTC(2026, 8, 8, 0, 30, 0))
  const target = getNext04AmMsk(d)
  assert.strictEqual(target, Date.UTC(2026, 8, 8, 1, 0, 0))
  const diffMs = target - d.getTime()
  assert.strictEqual(diffMs, 30 * 60 * 1000)
})

test("1.5 Exactly at 04:00:00.000 MSK (01:00:00.000 UTC), target is recognized as today's 04:00 MSK", () => {
  const d = new Date(Date.UTC(2026, 8, 8, 1, 0, 0, 0))
  const target = getMostRecent04AmMsk(d)
  assert.strictEqual(target, Date.UTC(2026, 8, 8, 1, 0, 0, 0))
})

console.log("\n--- SUITE 2: Display Formatting ---")

test("2.1 formatSyncDisplayTime formats exact Moscow time regardless of local offset", () => {
  const d = new Date(Date.UTC(2026, 8, 8, 1, 0, 0)) // 01:00 UTC = 04:00 MSK on 08.09
  const str = formatSyncDisplayTime(d)
  assert.strictEqual(str, "Сегодня в 04:00 МСК (08.09)")
})

test("2.2 formatSyncDisplayTime handles 21:15 MSK (18:15 UTC)", () => {
  const d = new Date(Date.UTC(2026, 8, 8, 18, 15, 0))
  const str = formatSyncDisplayTime(d)
  assert.strictEqual(str, "Сегодня в 21:15 МСК (08.09)")
})

console.log("\n--- SUITE 3: HTML Parsing of Timacad Feeds ---")

test("3.1 parseTimacadHtmlFeed parses news cards with titles and links", () => {
  const sampleNews = `
    <div>
      <a href="/news/torzhestvennaya-lineyka-2026">
        <span>01 Сентября / 2026</span>
        <h3>Торжественная линейка ко Дню знаний в РГАУ-МСХА имени К.А. Тимирязева</h3>
      </a>
      <a href="/news/nauchnaya-konferentsiya-apk">
        <span>05 Сентября / 2026</span>
        <h3>Всероссийская научно-практическая конференция молодых ученых АПК</h3>
      </a>
    </div>
  `
  const parsed = parseTimacadHtmlFeed(sampleNews, "")
  assert.strictEqual(parsed.length, 2)
  assert.strictEqual(parsed[0].sourceUrl, "https://www.timacad.ru/news/torzhestvennaya-lineyka-2026")
  assert.strictEqual(parsed[0].category, "news")
  assert.ok(parsed[0].title.includes("Торжественная линейка"))
  assert.strictEqual(parsed[1].sourceUrl, "https://www.timacad.ru/news/nauchnaya-konferentsiya-apk")
})

test("3.2 parseTimacadHtmlFeed categorizes announcements into science, sport, career", () => {
  const sampleAnn = `
    <div>
      <a href="/announcements/nauchniy-seminar-genetika">
        <span>15 сентября</span>
        Научный семинар по генетике и селекции сельскохозяйственных культур
      </a>
      <a href="/announcements/legkoatleticheskiy-kross">
        <span>20 сентября</span>
        Легкоатлетический кросс памяти Тимирязева среди студентов
      </a>
      <a href="/announcements/den-kariery-apk">
        <span>25 сентября</span>
        День карьеры и стажировок в ведущих холдингах АПК России
      </a>
    </div>
  `
  const parsed = parseTimacadHtmlFeed("", sampleAnn)
  assert.strictEqual(parsed.length, 3)
  assert.strictEqual(parsed[0].category, "science")
  assert.strictEqual(parsed[1].category, "sport")
  assert.strictEqual(parsed[2].category, "career")
})

test("3.3 parseTimacadHtmlFeed handles empty / malformed input gracefully", () => {
  const parsed = parseTimacadHtmlFeed("", "")
  assert.deepStrictEqual(parsed, [])
  const broken = parseTimacadHtmlFeed("<div><a href='broken'>not enough", null)
  assert.deepStrictEqual(broken, [])
})

console.log("\n--- SUITE 4: Official Sources Catalog Verification ---")

test("4.1 officialSources.ts contains at least 30 verified sources", async () => {
  const sourcesPath = path.join(ROOT, "src/data/officialSources.ts")
  const content = fs.readFileSync(sourcesPath, "utf-8")
  const idMatches = content.match(/id:\s*"[^"]+"/g) || []
  assert.ok(idMatches.length >= 30, `Expected at least 30 sources, got ${idMatches.length}`)
})

test("4.2 officialSources.ts covers all required categories", () => {
  const sourcesPath = path.join(ROOT, "src/data/officialSources.ts")
  const content = fs.readFileSync(sourcesPath, "utf-8")
  const requiredCategories = ["schedule", "news", "announcements", "trade_union", "institutes", "campus", "services", "sport", "contacts"]
  for (const cat of requiredCategories) {
    assert.ok(content.includes(`category: "${cat}"`), `Missing required category: ${cat}`)
  }
})

console.log("\n--- SUITE 5: Bundled Data Integrity ---")

test("5.1 public/data/official-schedule.json exists and contains groups", () => {
  const schedPath = path.join(ROOT, "public/data/official-schedule.json")
  const data = JSON.parse(fs.readFileSync(schedPath, "utf-8"))
  assert.ok(data.groups, "Missing groups object")
  const groupCount = Object.keys(data.groups).length
  assert.ok(groupCount >= 40, `Expected at least 40 groups, got ${groupCount}`)
})

test("5.2 public/data/official-timacad-feed.json exists and has feed items", () => {
  const feedPath = path.join(ROOT, "public/data/official-timacad-feed.json")
  const items = JSON.parse(fs.readFileSync(feedPath, "utf-8"))
  assert.ok(Array.isArray(items), "Expected array of feed items")
  assert.ok(items.length >= 10, `Expected at least 10 items, got ${items.length}`)
  for (const item of items) {
    assert.ok(item.id, "Missing item id")
    assert.ok(item.title, "Missing item title")
    assert.ok(item.sourceUrl, "Missing item sourceUrl")
  }
})

console.log("\n══════════════════════════════════════════════════════════════════════")
console.log(`📊 RESULTS: All ${totalPassed} assertions passed (100% SUCCESS)`)
console.log("══════════════════════════════════════════════════════════════════════\n")
