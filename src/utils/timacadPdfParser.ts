// In-Browser PDF schedule parser for RGAU-MSHA Timiryazevka schedules
// Uses 2D spatial grid coordinate reconstruction for authentic Timacad table layouts.

export interface ParsedClassItem {
  id: number
  num: number
  start: string
  end: string
  subject: string
  type: "lecture" | "practice" | "lab"
  teacher: string
  building: string
  room: string
  subgroup?: 1 | 2
  weekType: "odd" | "even" | "all" // odd = верхняя пара (нечётная), even = нижняя пара (чётная), all = каждую неделю
}

export interface ParsedDaySchedule {
  weekday: string
  classes: ParsedClassItem[]
}

export interface ParsedGroupResult {
  groupName: string
  sourceFileName: string
  institute?: string
  totalClasses: number
  availableGroups?: string[]
  days: ParsedDaySchedule[]
}

// Official bell times matching Timiryazevka schedule
export const OFFICIAL_BELLS: Record<number, { start: string; end: string }> = {
  1: { start: "09:00", end: "10:35" },
  2: { start: "10:55", end: "12:30" },
  3: { start: "13:00", end: "14:35" },
  4: { start: "14:55", end: "16:30" },
  5: { start: "16:50", end: "18:25" },
  6: { start: "18:40", end: "20:15" },
}

export const BELL_TIMES = [
  { num: 1, start: "09:00", end: "10:35", label: "1-я пара" },
  { num: 2, start: "10:55", end: "12:30", label: "2-я пара" },
  { num: 3, start: "13:00", end: "14:35", label: "3-я пара" },
  { num: 4, start: "14:55", end: "16:30", label: "4-я пара" },
  { num: 5, start: "16:50", end: "18:25", label: "5-я пара" },
  { num: 6, start: "18:40", end: "20:15", label: "6-я пара" },
]

export const BREAKS = [
  { afterNum: 1, durationMin: 20, name: "Перерыв между 1 и 2 парами" },
  { afterNum: 2, durationMin: 30, name: "Большой обеденный перерыв (30 мин)" },
  { afterNum: 3, durationMin: 20, name: "Перерыв между 3 и 4 парами" },
  { afterNum: 4, durationMin: 20, name: "Перерыв между 4 и 5 парами" },
]

export const BUILDING_NAMES: Record<string, string> = {
  "01": "1-й учебный корпус",
  "02": "2-й учебный корпус",
  "03": "3-й учебный корпус",
  "04": "4-й учебный корпус",
  "06": "Корпус агрохимии (6-й)",
  "09": "9-й учебный корпус",
  "12": "12-й учебный корпус",
  "16": "Биологический корпус (16-й)",
  "17": "17-й корпус (Почвенно-агрономический)",
  "18": "18-й корпус (Метеорологический)",
  "27": "27-й корпус (Лингвистический центр)",
  "28": "Инженерный корпус (28-й)",
  "29": "29-й корпус (Цифровой центр)",
  "37": "37-й корпус (Биотехнология)",
  "СК": "Спортивный комплекс",
}

const WEEKDAYS = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота"]

// Ensure PDF.js script is loaded on page
let pdfjsPromise: Promise<any> | null = null

export function loadPdfJsScript(): Promise<any> {
  if (pdfjsPromise) return pdfjsPromise

  pdfjsPromise = new Promise((resolve, reject) => {
    if (typeof window === "undefined") {
      reject(new Error("PDF.js can only be loaded in a browser environment"))
      return
    }

    if ((window as any).pdfjsLib) {
      resolve((window as any).pdfjsLib)
      return
    }

    const script = document.createElement("script")
    script.src = "/vendor/pdf.min.js"
    script.onload = () => {
      const lib = (window as any).pdfjsLib
      if (lib) {
        lib.GlobalWorkerOptions.workerSrc = "/vendor/pdf.worker.min.js"
        resolve(lib)
      } else {
        reject(new Error("pdfjsLib not found on window after script load"))
      }
    }
    script.onerror = () => {
      // Fallback to CDN if local vendor script fails
      const cdnScript = document.createElement("script")
      cdnScript.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"
      cdnScript.onload = () => {
        const cdnLib = (window as any).pdfjsLib
        if (cdnLib) {
          cdnLib.GlobalWorkerOptions.workerSrc =
            "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js"
          resolve(cdnLib)
        } else {
          reject(new Error("Failed to load PDF.js from CDN"))
        }
      }
      cdnScript.onerror = () => reject(new Error("Failed to load PDF.js"))
      document.head.appendChild(cdnScript)
    }
    document.head.appendChild(script)
  })

  return pdfjsPromise
}

interface RawPdfItem {
  str: string
  x: number
  y: number
  w: number
  h: number
}

export async function parsePdfArrayBuffer(
  arrayBuffer: ArrayBuffer,
  targetGroup: string = "",
  sourceFileName: string = "schedule.pdf"
): Promise<ParsedGroupResult> {
  const pdfjsLib = await loadPdfJsScript()
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(arrayBuffer),
    disableFontFace: true,
  })
  const pdfDoc = await loadingTask.promise

  const allGroupsResult: Record<
    string,
    {
      groupName: string
      institute: string
      days: ParsedDaySchedule[]
    }
  > = {}

  let nextClassId = 1000

  for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
    const page = await pdfDoc.getPage(pageNum)
    const textContent = await page.getTextContent()

    const rawItems: RawPdfItem[] = textContent.items
      .map((i: any) => ({
        str: String(i.str || "").trim(),
        x: Number(i.transform?.[4] || 0),
        y: Number(i.transform?.[5] || 0),
        w: Number(i.width || 0),
        h: Number(i.height || 10),
      }))
      .filter((i: RawPdfItem) => i.str.length > 0)

    // Detect group column headers (typically located near top y > 600)
    const groupItems = rawItems.filter(
      (i) => /^[Дд][А-Яа-я]\s*\d{2}-\d{2}$/.test(i.str) && i.y > 580
    )
    groupItems.sort((a, b) => a.x - b.x)
    if (groupItems.length === 0) continue

    // Calculate column horizontal spans
    const columns: Array<{
      groupName: string
      centerX: number
      left: number
      right: number
    }> = []

    for (let i = 0; i < groupItems.length; i++) {
      const g = groupItems[i]
      const prevX = i > 0 ? groupItems[i - 1].x : g.x - 70
      const nextX = i < groupItems.length - 1 ? groupItems[i + 1].x : g.x + 78
      const left = (g.x + prevX) / 2
      const right = (g.x + nextX) / 2
      const normName = g.str.replace(/\s+/g, " ").toUpperCase()
      columns.push({
        groupName: normName,
        centerX: g.x,
        left,
        right,
      })

      if (!allGroupsResult[normName]) {
        allGroupsResult[normName] = {
          groupName: normName,
          institute: "РГАУ-МСХА имени К.А. Тимирязева",
          days: WEEKDAYS.map((w) => ({ weekday: w, classes: [] })),
        }
      }
    }

    // Detect time rows (e.g. "09.00-", "10.55-")
    const timeItems = rawItems.filter((i) => /^\d{2}\.\d{2}/.test(i.str))
    const timeRowYs: number[] = []
    for (const t of timeItems) {
      if (!timeRowYs.some((y) => Math.abs(y - t.y) <= 5)) {
        timeRowYs.push(t.y)
      }
    }
    timeRowYs.sort((a, b) => b - a) // Top to bottom

    // Map time rows to weekday and pair number (5 pairs per day)
    const pairsPerDay = 5
    const timeSlots = []
    for (let idx = 0; idx < timeRowYs.length; idx++) {
      const y = timeRowYs[idx]
      const dayIdx = Math.floor(idx / pairsPerDay)
      const pairNum = (idx % pairsPerDay) + 1
      const nextY = idx < timeRowYs.length - 1 ? timeRowYs[idx + 1] : y - 22
      const rowHeight = Math.max(18, y - nextY)
      timeSlots.push({
        dayIdx,
        pairNum,
        topY: y + 8,
        bottomY: y - rowHeight + 8,
        midY: y - rowHeight / 2 + 8,
      })
    }

    // Populate each group cell
    for (const col of columns) {
      const groupData = allGroupsResult[col.groupName]
      if (!groupData) continue

      for (const slot of timeSlots) {
        if (slot.dayIdx >= WEEKDAYS.length) continue
        const weekday = WEEKDAYS[slot.dayIdx]
        const daySchedule = groupData.days.find((d) => d.weekday === weekday)
        if (!daySchedule) continue

        // Filter items falling inside this cell
        const cellItems = rawItems.filter((item) => {
          const inY = item.y <= slot.topY && item.y >= slot.bottomY
          if (!inY) return false
          const inX = item.x >= col.left && item.x <= col.right
          const spansOver =
            item.w > 80 &&
            item.x <= col.centerX &&
            item.x + item.w >= col.centerX
          return inX || spansOver
        })

        if (cellItems.length === 0) continue

        // Split into upper (odd week) and lower (even week) by vertical midpoint
        const upperItems = cellItems.filter((i) => i.y >= slot.midY)
        const lowerItems = cellItems.filter((i) => i.y < slot.midY)

        function buildClass(items: RawPdfItem[], weekType: "odd" | "even" | "all"): ParsedClassItem | null {
          const textJoined = items.map((i) => i.str).join(" ")
          if (textJoined.trim().length < 2) return null

          let type: "lecture" | "practice" | "lab" = "practice"
          if (/лек\./i.test(textJoined)) type = "lecture"
          else if (/лаб\./i.test(textJoined)) type = "lab"
          else if (/пр\./i.test(textJoined) || /КпоВ/i.test(textJoined)) type = "practice"

          let cleanSubj = textJoined
          const subjMatch = textJoined.match(
            /(?:лек\.|пр\.|лаб\.)\s*([^А-ЯЁ\d]{0,4}[А-ЯЁа-яё\s:()\-–—]+?)(?=\s+[А-ЯЁ][а-яё]+\s+[А-ЯЁ]\.|\s+[А-ЯЁ]{2,}\s+[А-ЯЁ]\.|\s+\d{2}-|\s+СК|\s+Стадион|$)/
          )
          if (subjMatch) {
            cleanSubj = subjMatch[1].trim()
          } else if (/КпоВ/i.test(textJoined)) {
            cleanSubj = "КпоВ: Базовые виды спорта / Физическая культура"
            type = "practice"
          }

          cleanSubj = cleanSubj.replace(/^(?:лек\.|пр\.|лаб\.)\s*/i, "").trim()
          if (cleanSubj.length > 55) {
            cleanSubj = cleanSubj.slice(0, 55).trim()
          }
          if (!cleanSubj || cleanSubj.length < 3) cleanSubj = textJoined.slice(0, 30)

          let teacher = "Преподаватель кафедры"
          const teacherMatch = textJoined.match(
            /([А-ЯЁ][а-яё]+|[А-ЯЁ]{2,})\s+([А-ЯЁ]\.\s*[А-ЯЁ]\.?)/
          )
          if (teacherMatch) {
            teacher = `${teacherMatch[1]} ${teacherMatch[2]}`.trim()
          }

          let room = "Аудитория уточняется"
          let building = "1-й учебный корпус"
          const roomMatch =
            textJoined.match(
              /(\d{2}|\d{1,2}\s*\([^)]+\)|СК|Стадион)\s*[-–]\s*([0-9А-Яа-я\s]+|Планетарий\s*\d+|БХ|БАн|БП|ИЦ\s*\d+)/
            ) ||
            textJoined.match(/\b(\d{2})[-–]([0-9А-Яа-я]+)\b/) ||
            (textJoined.includes("СК") ? ["СК", "СК", "СК Зал"] : null)

          if (roomMatch) {
            const rawBldg = roomMatch[1].trim()
            const rawRoom = roomMatch[2] ? roomMatch[2].trim() : ""
            const bldgCode =
              rawBldg.match(/\d{2}/)?.[0] || (rawBldg.includes("СК") ? "СК" : "01")
            building = BUILDING_NAMES[bldgCode] || `${bldgCode}-й учебный корпус`
            room = rawRoom || rawBldg
          } else if (textJoined.includes("СК")) {
            building = "Спортивный комплекс"
            room = "СК Зал"
          }

          const bells = OFFICIAL_BELLS[slot.pairNum] || {
            start: "09:00",
            end: "10:35",
          }

          return {
            id: nextClassId++,
            num: slot.pairNum,
            start: bells.start,
            end: bells.end,
            subject: cleanSubj,
            type,
            teacher,
            building,
            room,
            weekType,
          }
        }

        const hasUpperType = upperItems.some((i) => /(?:лек\.|пр\.|лаб\.|КпоВ)/.test(i.str))
        const hasLowerType = lowerItems.some((i) => /(?:лек\.|пр\.|лаб\.|КпоВ)/.test(i.str))

        if (hasUpperType && hasLowerType) {
          const upperCls = buildClass(upperItems, "odd")
          const lowerCls = buildClass(lowerItems, "even")
          if (upperCls) daySchedule.classes.push(upperCls)
          if (lowerCls) daySchedule.classes.push(lowerCls)
        } else {
          const singleCls = buildClass(cellItems, "all")
          if (singleCls) daySchedule.classes.push(singleCls)
        }
      }
    }
  }

  const detectedGroups = Object.keys(allGroupsResult)
  const normTarget = targetGroup.replace(/\s+/g, " ").trim().toUpperCase()
  const matchedGroupName =
    detectedGroups.find((g) => g === normTarget) ||
    detectedGroups.find((g) => g.replace(/[\s-]/g, "") === normTarget.replace(/[\s-]/g, "")) ||
    detectedGroups[0] ||
    normTarget ||
    "ДА 01-26"

  const selectedGroup = allGroupsResult[matchedGroupName] || {
    groupName: matchedGroupName,
    institute: "РГАУ-МСХА имени К.А. Тимирязева",
    days: WEEKDAYS.map((w) => ({ weekday: w, classes: [] })),
  }

  const totalClasses = selectedGroup.days.reduce(
    (sum, d) => sum + d.classes.length,
    0
  )

  return {
    groupName: matchedGroupName,
    sourceFileName,
    institute: selectedGroup.institute,
    totalClasses,
    availableGroups: detectedGroups,
    days: selectedGroup.days,
  }
}

export async function parsePdfScheduleFile(
  file: File,
  targetGroup: string
): Promise<ParsedGroupResult> {
  const arrayBuffer = await file.arrayBuffer()
  return parsePdfArrayBuffer(arrayBuffer, targetGroup, file.name)
}
