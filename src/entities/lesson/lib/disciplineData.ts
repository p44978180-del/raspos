import officialScheduleData from "../../../data/official-schedule.json"
import { getCachedSchedule } from "../../../utils/timacadAutoSync"
import type { DisciplineInfo } from "../model/types"

export const DORMS = [
  "Не указано",
  "Общежитие №1",
  "Общежитие №2",
  "Общежитие №6",
  "Общежитие №8",
  "Общежитие №10",
]

export const DORM_WALK: Record<string, { building: string; min: number }> = {
  "Общежитие №1": { building: "1-й учебный корпус", min: 7 },
  "Общежитие №2": { building: "1-й учебный корпус", min: 5 },
  "Общежитие №6": { building: "Корпус агрохимии", min: 8 },
  "Общежитие №8": { building: "Корпус агрохимии", min: 10 },
  "Общежитие №10": { building: "Инженерный корпус", min: 12 },
}

export function getRgauGroups(): string[] {
  const officialGroupKeys = Object.keys((officialScheduleData as any).groups || {})
  const cachedGroupKeys = Object.keys(getCachedSchedule()?.groups || {})
  return Array.from(new Set([...officialGroupKeys, ...cachedGroupKeys])).sort((a, b) =>
    a.localeCompare(b, "ru"),
  )
}

export const RGAU_TEACHERS = [
  "Темчук Е.И.",
  "Ксенофонтов И.А.",
  "Елисеева О.В.",
  "Грачев А.Б.",
  "Мякшин Н.А.",
  "Пронина Г.И.",
  "Шайтура Н.С.",
  "Стрыгин С.П.",
  "Каменных Н.Л.",
  "Ильин П.С.",
  "Лосева К.А.",
  "Упадышев М.Т.",
  "Матушкина К.А.",
  "Арешин А.В.",
  "Глазунова О.А.",
  "Волков С.Г.",
  "Дудченко О.С.",
  "Синицына И.А.",
  "Миронова Е.Е.",
  "Проф. Иванова М.С.",
  "Доц. Петров А.Н.",
  "Проф. Смирнов Г.К.",
]

export const DISCIPLINE_DATA: Record<string, DisciplineInfo> = {
  Агрохимия: {
    department: "Кафедра агрохимии и биохимии растений",
    email: "ivanova@timacad.ru",
    consultations: "Вт 14:00–16:00, корп. агрохимии, ауд. 214",
    exam: "Экзамен в зимнюю сессию",
    materials: [
      {
        name: "Методичка по лаб. работам №1–4",
        url: "https://disk.yandex.ru/",
        type: "pdf",
      },
      {
        name: "Конспект лекций §1–5",
        url: "https://disk.yandex.ru/",
        type: "doc",
      },
    ],
    literature: [
      {
        title: "Агрохимия",
        author: "Минеев В.Г.",
        year: 2004,
        url: "https://e.lanbook.com/",
        library: "ЭБС Лань",
      },
      {
        title: "Практикум по агрохимии",
        author: "Минеев В.Г.",
        year: 2001,
        url: "https://e.lanbook.com/",
        library: "ЭБС Лань",
      },
    ],
  },
  "Земледелие и растениеводство": {
    department: "Кафедра земледелия и МОС",
    email: "petrov@timacad.ru",
    consultations: "Ср 11:00–13:00, УК-1, ауд. Б-112",
    exam: "Зачёт с оценкой",
    materials: [
      {
        name: "Атлас болезней растений",
        url: "https://disk.yandex.ru/",
        type: "pdf",
      },
    ],
    literature: [
      {
        title: "Земледелие",
        author: "Пупонин А.И.",
        year: 2002,
        url: "https://e.lanbook.com/",
        library: "ЭБС Лань",
      },
    ],
  },
}

export function getDefaultDiscipline(subject: string): DisciplineInfo {
  return (
    DISCIPLINE_DATA[subject] ?? {
      department: "Кафедра — уточните у преподавателя",
      email: "",
      consultations: "—",
      exam: "Уточните у преподавателя",
      materials: [],
      literature: [],
    }
  )
}
