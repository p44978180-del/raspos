import officialScheduleData from "../../../data/official-schedule.json"
import { OFFICIAL_BELLS, type ParsedGroupResult } from "../../../utils/timacadPdfParser"
import { getCachedSchedule } from "../../../utils/timacadAutoSync"
import type { DaySchedule } from "../model/types"

export function convertParsedToDaySchedule(parsed: ParsedGroupResult): DaySchedule[] {
  const WEEK_DATES: Record<string, string> = {
    Понедельник: "2026-09-07",
    Вторник: "2026-09-08",
    Среда: "2026-09-09",
    Четверг: "2026-09-10",
    Пятница: "2026-09-11",
    Суббота: "2026-09-12",
    Воскресенье: "2026-09-13",
  }
  const baseWeek: DaySchedule[] = []
  parsed.days.forEach((d) => {
    baseWeek.push({
      date: WEEK_DATES[d.weekday] || "2026-09-07",
      weekday: d.weekday,
      classes: d.classes.map((c) => {
        const bell = OFFICIAL_BELLS[c.num] || { start: c.start, end: c.end }
        return {
          id: c.id,
          num: c.num,
          start: bell.start,
          end: bell.end,
          subject: c.subject,
          type: c.type,
          teacher: c.teacher,
          building: c.building,
          room: c.room,
          subgroup: c.subgroup,
          weekType: c.weekType,
        }
      }),
    })
  })
  if (!baseWeek.some((d) => d.weekday === "Воскресенье")) {
    baseWeek.push({ date: "2026-09-13", weekday: "Воскресенье", classes: [] })
  }
  const result: DaySchedule[] = [...baseWeek]
  for (let w = 1; w <= 24; w++) {
    baseWeek.forEach((day) => {
      const b = new Date(day.date + "T00:00:00")
      b.setDate(b.getDate() + w * 7)
      result.push({
        ...day,
        classes: day.classes.map((c) => ({
          ...c,
          id: c.id + w * 10000,
        })),
        date: `${b.getFullYear()}-${String(b.getMonth() + 1).padStart(2, "0")}-${String(b.getDate()).padStart(2, "0")}`,
      })
    })
  }
  return result
}

export function buildSchedule(
  groupId: string = "ДА 01-26",
  customSchedule?: DaySchedule[],
): DaySchedule[] {
  if (customSchedule && customSchedule.length > 0) {
    return customSchedule
  }

  // Check localStorage for custom schedule uploaded by headstudent
  try {
    if (typeof localStorage !== "undefined") {
      const saved = localStorage.getItem(`timacad_custom_sched_${groupId}`)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed
        }
      }
    }
  } catch {}

  const WEEK_DATES: Record<string, string> = {
    Понедельник: "2026-09-07",
    Вторник: "2026-09-08",
    Среда: "2026-09-09",
    Четверг: "2026-09-10",
    Пятница: "2026-09-11",
    Суббота: "2026-09-12",
    Воскресенье: "2026-09-13",
  }

  // Check if official synced schedule from timacad.ru has this group
  const activeSchedule = getCachedSchedule()
  const officialGroup =
    ((activeSchedule?.groups || {}) as Record<string, any>)[groupId] ||
    ((officialScheduleData.groups || {}) as Record<string, any>)[groupId]
  if (officialGroup && Array.isArray(officialGroup.schedule)) {
    const baseWeek: DaySchedule[] = []
    officialGroup.schedule.forEach((day: any) => {
      baseWeek.push({
        date: WEEK_DATES[day.weekday] || "2026-09-07",
        weekday: day.weekday,
        classes: (day.classes || []).map((c: any) => {
          const bell = OFFICIAL_BELLS[c.num] || { start: c.start, end: c.end }
          return {
            id: c.id,
            num: c.num,
            start: bell.start,
            end: bell.end,
            subject: c.subject,
            type: c.type,
            teacher: c.teacher,
            building: c.building,
            room: c.room,
            subgroup: c.subgroup,
            subgroups: c.subgroups,
            subgroupDetails: c.subgroupDetails,
            weekType: c.weekType || "all",
          }
        }),
      })
    })

    // Ensure all 7 days of the week are present in baseWeek
    const presentWeekdays = new Set(baseWeek.map((d) => d.weekday))
    const ALL_DAYS_ORDER = [
      "Понедельник",
      "Вторник",
      "Среда",
      "Четверг",
      "Пятница",
      "Суббота",
      "Воскресенье",
    ]
    ALL_DAYS_ORDER.forEach((wday) => {
      if (!presentWeekdays.has(wday)) {
        baseWeek.push({
          date: WEEK_DATES[wday] || "2026-09-07",
          weekday: wday,
          classes: [],
        })
      }
    })
    baseWeek.sort(
      (a, b) =>
        (WEEK_DATES[a.weekday] || "").localeCompare(WEEK_DATES[b.weekday] || ""),
    )

    const result = [...baseWeek]
    for (let w = 1; w <= 24; w++) {
      baseWeek.forEach((day) => {
        const b = new Date(day.date + "T00:00:00")
        b.setDate(b.getDate() + w * 7)
        result.push({
          ...day,
          classes: day.classes.map((c: any) => ({
            ...c,
            id: c.id + w * 10000,
          })),
          date: `${b.getFullYear()}-${String(b.getMonth() + 1).padStart(2, "0")}-${String(b.getDate()).padStart(2, "0")}`,
        })
      })
    }
    return result
  }

  const baseWeek: DaySchedule[] = [
    {
      date: "2026-09-07",
      weekday: "Понедельник",
      classes: [
        {
          id: 1,
          num: 1,
          start: "09:00",
          end: "10:35",
          subject: "ФТД: Информатика",
          type: "practice",
          teacher: "Мякшин Н.А.",
          building: "29-й корпус (Цифровой центр)",
          room: "ИЦ-2",
          subgroup: 1,
          weekType: "odd",
        },
        {
          id: 102,
          num: 1,
          start: "09:00",
          end: "10:35",
          subject: "Основы российской государственности",
          type: "practice",
          teacher: "Темчук Е.И.",
          building: "17-й корпус (Почвенно-агрономический)",
          room: "207",
          subgroup: 1,
          weekType: "even",
        },
        {
          id: 2,
          num: 2,
          start: "10:45",
          end: "12:20",
          subject: "Неорганическая химия",
          type: "lecture",
          teacher: "Елисеева О.В.",
          building: "Корпус агрохимии (6-й)",
          room: "БХ",
          weekType: "all",
        },
        {
          id: 3,
          num: 3,
          start: "13:00",
          end: "14:35",
          subject: "Основы российской государственности",
          type: "lecture",
          teacher: "Темчук Е.И.",
          building: "17-й корпус (Почвенно-агрономический)",
          room: "207",
          weekType: "all",
        },
      ],
    },
    {
      date: "2026-09-08",
      weekday: "Вторник",
      classes: [
        {
          id: 4,
          num: 1,
          start: "09:00",
          end: "10:35",
          subject: "Иностранный язык",
          type: "practice",
          teacher: "Касаткина Н.Н.",
          building: "27-й корпус (Лингвистический центр)",
          room: "204",
          subgroup: 1,
          weekType: "all",
        },
        {
          id: 5,
          num: 2,
          start: "10:45",
          end: "12:20",
          subject: "Ботаника",
          type: "lab",
          teacher: "Малахов А.С.",
          building: "Биологический корпус (16-й)",
          room: "215",
          weekType: "all",
        },
      ],
    },
    {
      date: "2026-09-09",
      weekday: "Среда",
      classes: [
        {
          id: 6,
          num: 2,
          start: "10:45",
          end: "12:20",
          subject: "Высшая математика",
          type: "practice",
          teacher: "Гришин К.В.",
          building: "28-й учебный корпус (Инженерный)",
          room: "312",
          weekType: "all",
        },
      ],
    },
    {
      date: "2026-09-10",
      weekday: "Четверг",
      classes: [
        {
          id: 7,
          num: 1,
          start: "09:00",
          end: "10:35",
          subject: "Физическая культура",
          type: "practice",
          teacher: "Кафедра физвоспитания",
          building: "Спортивный комплекс",
          room: "СК",
          weekType: "all",
        },
      ],
    },
    {
      date: "2026-09-11",
      weekday: "Пятница",
      classes: [],
    },
    {
      date: "2026-09-12",
      weekday: "Суббота",
      classes: [],
    },
    {
      date: "2026-09-13",
      weekday: "Воскресенье",
      classes: [],
    },
  ]

  const result = [...baseWeek]
  for (let w = 1; w <= 24; w++) {
    baseWeek.forEach((day) => {
      const b = new Date(day.date + "T00:00:00")
      b.setDate(b.getDate() + w * 7)
      result.push({
        ...day,
        classes: day.classes.map((c) => ({
          ...c,
          id: c.id + w * 10000,
        })),
        date: `${b.getFullYear()}-${String(b.getMonth() + 1).padStart(2, "0")}-${String(b.getDate()).padStart(2, "0")}`,
      })
    })
  }
  return result
}
