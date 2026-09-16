import officialScheduleData from "../../data/official-schedule.json"
import { getCachedSchedule } from "../../utils/timacadAutoSync"
import type { ApiInstitute, ApiGroup, ApiScheduleResponse } from "./types"

const API_BASE = "/api/v1"

export async function fetchInstitutes(): Promise<ApiInstitute[]> {
  try {
    const res = await fetch(`${API_BASE}/institutes`)
    if (res.ok) {
      return await res.json()
    }
  } catch {}

  // Fallback to local data
  return [
    { id: 1, name: "Институт агробиотехнологии", courses: [1, 2, 3, 4, 5] },
    { id: 2, name: "Институт механики и энергетики им. В.П. Горячкина", courses: [1, 2, 3, 4, 5] },
    { id: 3, name: "Институт зоотехнии и биологии", courses: [1, 2, 3, 4, 5] },
    { id: 4, name: "Институт экономики и управления АПК", courses: [1, 2, 3, 4, 5] },
    { id: 5, name: "Институт мелиорации, водного хозяйства и строительства", courses: [1, 2, 3, 4, 5] },
    { id: 6, name: "Институт садоводства и ландшафтной архитектуры", courses: [1, 2, 3, 4, 5] },
    { id: 7, name: "Технологический институт", courses: [1, 2, 3, 4, 5] },
    { id: 8, name: "Центр «Проектный институт цифровой трансформации АПК»", courses: [1, 2, 3, 4, 5] },
  ]
}

export async function fetchGroups(instituteId?: number, course?: number): Promise<ApiGroup[]> {
  try {
    const params = new URLSearchParams()
    if (instituteId) params.append("institute_id", String(instituteId))
    if (course) params.append("course", String(course))
    const res = await fetch(`${API_BASE}/groups?${params.toString()}`)
    if (res.ok) {
      return await res.json()
    }
  } catch {}

  // Fallback to local data
  const groupsObj = (officialScheduleData as any).groups || {}
  const result: ApiGroup[] = Object.keys(groupsObj).map((name, idx) => ({
    id: idx + 1,
    institute_id: 1,
    name,
    course: 1,
    degree: "Бакалавриат",
  }))
  return result
}

export async function fetchSchedule(
  groupId: string | number,
  week: "odd" | "even" | "all" = "all",
): Promise<ApiScheduleResponse | null> {
  try {
    const res = await fetch(`${API_BASE}/schedule?group_id=${encodeURIComponent(groupId)}&week=${week}`)
    if (res.ok) {
      return await res.json()
    }
  } catch {}

  // Fallback to cached/official local JSON
  const cached = getCachedSchedule()
  const gName = String(groupId)
  const gData = ((cached?.groups || {}) as any)[gName] || ((officialScheduleData as any).groups || {})[gName]

  if (gData && Array.isArray(gData.schedule)) {
    return {
      group_id: groupId,
      week,
      semester: 1,
      days: gData.schedule.map((day: any, dIdx: number) => ({
        day_of_week: dIdx + 1,
        weekday: day.weekday,
        lessons: (day.classes || []).map((c: any) => ({
          id: c.id,
          group_id: Number(groupId) || 1,
          day_of_week: dIdx + 1,
          slot_number: c.num,
          week_type: c.weekType || "all",
          subject_name: c.subject,
          lesson_type: c.type,
          subgroup_number: c.subgroup || null,
          teacher_name: c.teacher,
          building: c.building,
          room: c.room,
        })),
      })),
    }
  }

  return null
}
