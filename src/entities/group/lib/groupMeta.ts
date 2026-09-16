import officialScheduleData from "../../../data/official-schedule.json"
import { getCachedSchedule } from "../../../utils/timacadAutoSync"
import type { GroupMeta } from "../model/types"

export function getGroupMeta(gId: string): GroupMeta {
  const activeSched = getCachedSchedule()
  const g =
    ((activeSched?.groups || {}) as any)[gId] ||
    ((officialScheduleData as any).groups || {})[gId]

  if (g?.institute) {
    const raw = (g.institute as string).toLowerCase()
    let instId = "agrobio"
    if (raw.includes("агробио") || raw.includes("агроном") || raw.includes("агрохим")) instId = "agrobio"
    else if (raw.includes("инженер") || raw.includes("механ") || raw.includes("горячкин")) instId = "mechanics"
    else if (raw.includes("зоо") || raw.includes("животн") || raw.includes("биолог") || raw.includes("ветеринар")) instId = "zoobio"
    else if (raw.includes("цифров") || raw.includes("проектный институт") || raw.includes("пи ")) instId = "digital"
    else if (raw.includes("эконом") || raw.includes("управл")) instId = "econ"
    else if (raw.includes("мелиор") || raw.includes("водн") || raw.includes("строит") || raw.includes("костяков")) instId = "water"
    else if (raw.includes("садовод") || raw.includes("ландшафт")) instId = "horticulture"
    else if (raw.includes("технолог")) instId = "tech"

    const courseNum = Number(g.course) || 1
    return { instId, course: courseNum }
  }

  // Robust fallback heuristic based on group code prefix and digits
  let instId = "agrobio"
  if (/^Д-И|^ДИ|^ТТ|^Д-ЭМ|^Д-ТБ|^Д-ЭТ|^ИЭ/i.test(gId)) instId = "mechanics"
  else if (/^Д-З|^ДЗ|^М-З/i.test(gId)) instId = "zoobio"
  else if (/ДЭ 1[5-8]|ДЭ 2[1-2]/i.test(gId)) instId = "digital"
  else if (/^Д-Э|^ЭК|^ДЭ|^ВЭ/i.test(gId)) instId = "econ"
  else if (/^Д-С|^М-С|^Д-П|^ПА|^Д-ЗМ|^ДВ|^ВВ/i.test(gId)) instId = "water"
  else if (/^Д-ЛА|^М-ЛА|^ЛА|^Д-ПО|^ДС/i.test(gId)) instId = "horticulture"
  else if (/^Д-ТП|^Т-|^Д-СТ|^ДТ/i.test(gId)) instId = "tech"

  let course = 1
  if (/20\d|2-\d| 02-|-25| 2\d-25| 2\d-26/i.test(gId)) course = 2
  else if (/30\d|3-\d| 03-|-24| 3\d-26| 3\d-25/i.test(gId)) course = 3
  else if (/40\d|4-\d| 04-|-23/i.test(gId)) course = 4
  else if (/50\d|5-\d| 05-|-22/i.test(gId)) course = 5

  return { instId, course }
}
