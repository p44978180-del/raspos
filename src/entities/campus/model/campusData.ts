import { ALL_CAMPUS_MARKERS } from "../../../components/CampusMapPins"
import { normalizeBldg } from "../../lesson/lib/location"
import { getCachedTimacadFeed } from "../../../utils/timacadAutoSync"
import type { TimacadFeedItem } from "../../../data/timacadFeedData"
import type { FoodSpot, AppEvent, WalkRouteResult, EventCat } from "./types"

export const BUILDING_GPS: Record<string, [number, number]> = {
  corp1: [37.5565, 55.8298],
  corp2: [37.555, 55.8315],
  corp3: [37.5525, 55.8288],
  corp4: [37.5505, 55.8295],
  agrochem: [37.5603, 55.828],
  corp6: [37.551, 55.832],
  corp8: [37.556, 55.832],
  corp9: [37.549, 55.829],
  corp10: [37.5595, 55.834],
  corp11: [37.561, 55.8345],
  corp12: [37.545, 55.835],
  bio16: [37.553, 55.831],
  soil17: [37.542, 55.833],
  meteo18: [37.543, 55.834],
  corp26: [37.555, 55.831],
  ling27: [37.554, 55.8305],
  engineering: [37.5635, 55.8265],
  digital29: [37.541, 55.842],
  biotech37: [37.551, 55.832],
  lib: [37.553, 55.83],
  sport: [37.557, 55.833],
  station: [37.567, 55.825],
  dorms: [37.554, 55.834],
}

export const WALK_TIMES: Record<string, Record<string, number>> = {
  corp1: { corp1: 0, agrochem: 5, engineering: 8, sport: 10, station: 15 },
  agrochem: { corp1: 5, agrochem: 0, engineering: 10, sport: 12, station: 12 },
  engineering: {
    corp1: 8,
    agrochem: 10,
    engineering: 0,
    sport: 6,
    station: 18,
  },
  sport: { corp1: 10, agrochem: 12, engineering: 6, sport: 0, station: 20 },
  station: { corp1: 15, agrochem: 12, engineering: 18, sport: 20, station: 0 },
}

export function getBuildingCoords(name: string): [number, number] | null {
  if (!name) return null
  const bId = normalizeBldg(name)
  if (BUILDING_GPS[bId]) return BUILDING_GPS[bId]
  const found = ALL_CAMPUS_MARKERS.find(
    (m) =>
      m.title.toLowerCase().includes(name.toLowerCase()) ||
      name.toLowerCase().includes(m.title.toLowerCase()) ||
      m.subtitle.toLowerCase().includes(name.toLowerCase())
  )
  if (found) return found.coords
  return [37.552, 55.834]
}

export function calculateWalkBetween(from: string, to: string): WalkRouteResult | null {
  if (!from || !to) return null
  const normA = normalizeBldg(from)
  const normB = normalizeBldg(to)
  if (normA && normB && normA === normB) {
    return {
      mins: 0,
      meters: 0,
      text: "В этом же корпусе",
      routeUrl: "",
      fromName: from,
      toName: to,
    }
  }

  const coordsA = getBuildingCoords(from)
  const coordsB = getBuildingCoords(to)
  if (!coordsA || !coordsB) return null

  const [lng1, lat1] = coordsA
  const [lng2, lat2] = coordsB

  const R = 6371000
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  const straightDist = Math.round(R * c)
  const walkMeters = Math.max(70, Math.round(straightDist * 1.25))
  // 4.5 km/h = 75 m/min + 2 min buffer
  const mins = Math.max(1, Math.round(walkMeters / 75 + 1.5))

  const text = `~${mins} мин`
  const routeUrl = `https://yandex.ru/maps/?rtext=${lat1},${lng1}~${lat2},${lng2}&rtt=pd`

  return { mins, meters: walkMeters, text, routeUrl, fromName: from, toName: to }
}

export function getWalk(a: string, b: string): number | null {
  const res = calculateWalkBetween(a, b)
  return res ? res.mins : null
}

export function isOpen(f: FoodSpot): boolean {
  const d = new Date()
  const m = d.getHours() * 60 + d.getMinutes()
  return m >= f.openFrom && m < f.openTo
}

export function fmtOpenTo(f: FoodSpot): string {
  return `${String(Math.floor(f.openTo / 60)).padStart(2, "0")}:${String(f.openTo % 60).padStart(2, "0")}`
}

export const FOOD_SPOTS: FoodSpot[] = [
  {
    id: 1,
    name: "Столовая УК-1",
    building: "1-й учебный корпус",
    openFrom: 9 * 60,
    openTo: 17 * 60,
    avgCheck: "200–350 ₽",
    type: "canteen",
    mapQuery: "Столовая+РГАУ+МСХА+Тимирязевская+49",
  },
  {
    id: 2,
    name: "Буфет «Зерно»",
    building: "1-й учебный корпус",
    openFrom: 8 * 60,
    openTo: 19 * 60,
    avgCheck: "100–200 ₽",
    type: "buffet",
    mapQuery: "РГАУ+МСХА+1+учебный+корпус+Тимирязевская+49",
  },
  {
    id: 3,
    name: "Кафе «Тимирязев»",
    building: "Корпус агрохимии",
    openFrom: 8 * 60 + 30,
    openTo: 16 * 60,
    avgCheck: "250–400 ₽",
    type: "cafe",
    mapQuery: "Корпус+агрохимии+РГАУ+Тимирязевская+55",
  },
  {
    id: 4,
    name: "Буфет Инженерного",
    building: "Инженерный корпус",
    openFrom: 9 * 60,
    openTo: 15 * 60,
    avgCheck: "120–250 ₽",
    type: "buffet",
    mapQuery: "Инженерный+корпус+РГАУ+Тимирязевская+58",
  },
  {
    id: 5,
    name: "Столовая Спорткомплекса",
    building: "Спортивный комплекс",
    openFrom: 10 * 60,
    openTo: 18 * 60,
    avgCheck: "180–300 ₽",
    type: "canteen",
    mapQuery: "Спортивный+комплекс+РГАУ+Тимирязевская+44",
  },
  {
    id: 6,
    name: "ВкусВилл",
    proximity: "3 мин от УК-1",
    openFrom: 8 * 60,
    openTo: 22 * 60,
    avgCheck: "200–500 ₽",
    type: "supermarket",
    mapQuery: "ВкусВилл+Тимирязевская+улица+Москва",
  },
  {
    id: 7,
    name: "Магнит",
    proximity: "5 мин от УК-1",
    openFrom: 7 * 60,
    openTo: 23 * 60,
    avgCheck: "100–300 ₽",
    type: "supermarket",
    mapQuery: "Магнит+Тимирязевская+улица+Москва",
  },
  {
    id: 8,
    name: "Шаурма у Ашота",
    proximity: "2 мин от Инж. корп.",
    openFrom: 10 * 60,
    openTo: 20 * 60,
    avgCheck: "200–350 ₽",
    type: "cafe",
    mapQuery: "Шаурма+Тимирязевская+улица+Москва",
  },
  {
    id: 9,
    name: "Кофе-бар «Зёрна»",
    proximity: "4 мин от Агрохим.",
    openFrom: 8 * 60,
    openTo: 18 * 60,
    avgCheck: "150–300 ₽",
    type: "cafe",
    mapQuery: "Кофе+Тимирязевская+улица+Москва",
  },
]

export const BASE_EXTRA_EVENTS: AppEvent[] = [
  {
    id: 1,
    title: "День открытых дверей агрофака",
    date: "2026-09-07",
    place: "Актовый зал, УК-1",
    category: "faculty",
    summary: "Презентация программ бакалавриата и магистратуры, встреча с деканом и заведующими кафедрами.",
    sourceName: "Деканат агрофака",
    sourceUrl: "https://www.timacad.ru",
  },
  {
    id: 2,
    title: "Олимпиада по агрохимии",
    date: "2026-09-12",
    place: "Корпус агрохимии",
    category: "science",
    summary: "Университетский этап всероссийской олимпиады по почвоведению и агрохимии.",
    sourceName: "Кафедра агрохимии",
    sourceUrl: "https://www.timacad.ru/science",
  },
  {
    id: 3,
    title: "Спортивный день РГАУ",
    date: "2026-09-19",
    place: "Спортивный комплекс",
    category: "sport",
    summary: "Межфакультетские соревнования по волейболу, мини-футболу и настольному теннису.",
    sourceName: "ССК «Тимирязевские Зубры»",
    sourceUrl: "https://www.timacad.ru/life/sport",
  },
  {
    id: 4,
    title: "Студенческая конференция АПК",
    date: "2026-09-25",
    place: "УК-1, ауд. Б-201",
    category: "science",
    summary: "Пленарное заседание секций молодых исследователей и инноваций в сельском хозяйстве.",
    sourceName: "СНО РГАУ-МСХА",
    sourceUrl: "https://www.timacad.ru/science",
  },
  {
    id: 5,
    title: "Осенний кросс по территории",
    date: "2026-10-03",
    place: "Стадион МСХА",
    category: "sport",
    summary: "Забеги на дистанции 1 000 м и 3 000 м в Тимирязевском лесопарке.",
    sourceName: "Кафедра физкультуры",
    sourceUrl: "https://www.timacad.ru/life/sport",
  },
  {
    id: 6,
    title: "Открытая лекция по биотехнологиям",
    date: "2026-09-13",
    place: "Корпус агрохимии, ауд. 118",
    category: "science",
    summary: "Лекция ведущего научного сотрудника о генетическом редактировании и микроклональном размножении растений.",
    sourceName: "Институт агробиотехнологии",
    sourceUrl: "https://www.timacad.ru",
  },
]

export function getAppEvents(feed: TimacadFeedItem[] = getCachedTimacadFeed()): AppEvent[] {
  const official: AppEvent[] = feed.map((item, idx) => ({
    id: 100 + idx,
    title: item.title,
    date: item.date,
    place: item.place || "Кампус РГАУ-МСХА",
    category: item.category as EventCat,
    summary: item.summary,
    sourceName: item.sourceName,
    sourceUrl: item.sourceUrl,
    isPinned: item.isPinned,
    badgeText: item.badgeText,
  }))
  return [...official, ...BASE_EXTRA_EVENTS]
}

export const BUILDING_DETAILS: {
  [k: string]: {
    name: string
    short: string
    address: string
    floors: number
    note?: string
    coords: [number, number]
  }
} = {
  corp1: {
    name: "1-й учебный корпус",
    short: "УК-1",
    address: "Тимирязевская, 49",
    floors: 4,
    note: "Главный корпус, деканаты, библиотека",
    coords: [37.5562, 55.83],
  },
  agrochem: {
    name: "Корпус агрохимии",
    short: "Агрохим",
    address: "Тимирязевская, 55",
    floors: 3,
    note: "Кафедры агрохимии и почвоведения",
    coords: [37.5605, 55.8278],
  },
  engineering: {
    name: "Инженерный корпус",
    short: "Инж.",
    address: "Тимирязевская, 58",
    floors: 5,
    note: "Мастерские, лаборатории механизации",
    coords: [37.5638, 55.8263],
  },
  sport: {
    name: "Спортивный комплекс",
    short: "Спорт",
    address: "Тимирязевская, 44",
    floors: 2,
    coords: [37.554, 55.8308],
  },
  station: {
    name: "Учебно-опытная станция",
    short: "УОС",
    address: "Тимирязевская, 42",
    floors: 1,
    note: "Полевые работы, техника, дендрарий",
    coords: [37.553, 55.8315],
  },
}

export const BUILDING_MAP_QUERIES: Record<string, string> = {
  corp1: "РГАУ+МСХА+1+учебный+корпус+Тимирязевская+49",
  agrochem: "РГАУ+МСХА+корпус+агрохимии+Тимирязевская+55",
  engineering: "РГАУ+МСХА+инженерный+корпус+Тимирязевская+58",
  sport: "РГАУ+МСХА+спортивный+комплекс+Тимирязевская+44",
  station: "РГАУ+МСХА+учебно+опытная+станция+Тимирязевская+42",
}

export const DORM_COORDS: Record<string, [number, number]> = {
  "Общежитие №1": [37.552, 55.834],
  "Общежитие №2": [37.5528, 55.8335],
  "Общежитие №6": [37.5565, 55.8348],
  "Общежитие №8": [37.5572, 55.8352],
  "Общежитие №10": [37.5648, 55.8268],
}

export const DEPT_DATA: { name: string; building: string; coords: [number, number] }[] = [
  {
    name: "Кафедра агрохимии и биохимии",
    building: "Корпус агрохимии",
    coords: [37.5603, 55.828],
  },
  {
    name: "Кафедра земледелия и МОС",
    building: "1-й учебный корпус",
    coords: [37.5565, 55.8298],
  },
  {
    name: "Кафедра почвоведения",
    building: "1-й учебный корпус",
    coords: [37.5558, 55.8302],
  },
  {
    name: "Кафедра механизации",
    building: "Инженерный корпус",
    coords: [37.5635, 55.8265],
  },
  {
    name: "Кафедра физиологии растений",
    building: "Корпус агрохимии",
    coords: [37.561, 55.8275],
  },
]

export type CampusPinLayer = "none" | "buildings" | "dorms" | "departments"
export const MAP_CENTER = "37.5535%2C55.8330"

export function buildMapSrc(
  layer: CampusPinLayer = "none",
  foodLayer = false,
  center?: [number, number] | null,
  activePin?: [number, number] | null,
): string {
  const ll = center ? `${center[0]}%2C${center[1]}` : MAP_CENTER
  const zoom = center ? 16 : 15
  const base = `https://yandex.ru/map-widget/v1/?ll=${ll}&z=${zoom}&l=map`
  const pts: string[] = []
  if (activePin) {
    pts.push(`${activePin[0]}%2C${activePin[1]}%2Cpm2rdm`)
  }
  if (layer === "buildings") {
    Object.values(BUILDING_DETAILS).forEach((b) =>
      pts.push(`${b.coords[0]}%2C${b.coords[1]}%2Cpm2bll`),
    )
  }
  if (layer === "dorms") {
    Object.values(DORM_COORDS).forEach((c) =>
      pts.push(`${c[0]}%2C${c[1]}%2Cpm2org`),
    )
  }
  if (layer === "departments") {
    DEPT_DATA.forEach((d) => pts.push(`${d.coords[0]}%2C${d.coords[1]}%2Cpm2vvm`))
  }
  if (foodLayer) {
    FOOD_SPOTS.slice(0, 5).forEach((f) => {
      const c = f.building ? getBuildingCoords(f.building) : null
      if (c) pts.push(`${c[0]}%2C${c[1]}%2Cpm2grm`)
    })
  }
  return pts.length > 0 ? `${base}&pt=${pts.join("~")}` : base
}

export type PinCategory = "academic" | "dorm" | "department" | "dining" | "sports"

export interface CampusQuickPlace {
  id: string
  title: string
  short: string
  badgeLabel: string
  category: PinCategory
  coords: [number, number]
  address: string
  floors?: string
  faculties?: string
  buffet?: string
  description?: string
}

export const CAMPUS_QUICK_BADGES: CampusQuickPlace[] = [
  {
    id: "bldg-1",
    title: "1-й учебный корпус",
    short: "Корпус 1",
    badgeLabel: "1",
    category: "academic",
    coords: [37.5565, 55.8298],
    address: "Тимирязевская ул., 49",
    floors: "4 этажа",
    faculties: "Институт агробиотехнологии (агрономия, почвоведение, экология), ректорат, почвенный музей им. Вильямса",
    buffet: "Большая студенческая столовая 1-го корпуса (1 этаж)",
    description: "Главный учебный корпус академии",
  },
  {
    id: "bldg-2",
    title: "2-й учебный корпус",
    short: "Корпус 2",
    badgeLabel: "2",
    category: "academic",
    coords: [37.555, 55.8315],
    address: "Тимирязевская ул., 47",
    floors: "3 этажа",
    faculties: "Ботанические кафедры, селекция растений, физиология растений",
    buffet: "Студенческий буфет (1 этаж)",
    description: "Лекционные аудитории и лаборатории физиологии растений",
  },
  {
    id: "bldg-4",
    title: "4-й учебный корпус",
    short: "Корпус 4",
    badgeLabel: "4",
    category: "academic",
    coords: [37.5505, 55.8295],
    address: "Тимирязевская ул., 44",
    floors: "3 этажа",
    faculties: "Кафедры информационных технологий, высшая математика, компьютерные классы",
    buffet: "Буфет 4-го корпуса",
    description: "Компьютерные классы и лекционные залы",
  },
  {
    id: "bldg-6",
    title: "6-й учебный корпус (Зоотехния)",
    short: "Корпус 6",
    badgeLabel: "6",
    category: "academic",
    coords: [37.551, 55.832],
    address: "Тимирязевская ул., 44",
    floors: "4 этажа",
    faculties: "Институт зоотехнии и биологии, ветеринарные лаборатории",
    buffet: "Студенческий буфет 6-го корпуса (1 этаж)",
    description: "Институт зоотехнии и биологии",
  },
  {
    id: "bldg-8",
    title: "8-й учебный корпус",
    short: "Корпус 8",
    badgeLabel: "8",
    category: "academic",
    coords: [37.556, 55.832],
    address: "Лиственничная аллея, 3",
    floors: "3 этажа",
    faculties: "Кафедры лесоводства, дендрологии и ландшафтного дизайна",
    buffet: "Буфет (холл)",
    description: "Лесоводство, экология и садово-парковое хозяйство",
  },
  {
    id: "bldg-17",
    title: "17-й корпус (Почвенно-агрономический)",
    short: "Корпус 17",
    badgeLabel: "17",
    category: "academic",
    coords: [37.542, 55.833],
    address: "Тимирязевская ул., 54",
    floors: "4 этажа",
    faculties: "Почвоведение, агрохимия, геология, гуманитарно-педагогический факультет",
    buffet: "Комбинат питания 17-го корпуса (цокольный этаж, два обеденных зала)",
    description: "Почвенно-агрономический комплекс и столовая",
  },
  {
    id: "bldg-26",
    title: "26-й учебный корпус",
    short: "Корпус 26",
    badgeLabel: "26",
    category: "academic",
    coords: [37.555, 55.831],
    address: "Тимирязевская ул., 49",
    floors: "4 этажа",
    faculties: "Большие поточные лекционные залы, деканаты факультетов",
    buffet: "Буфет-столовая 26-го корпуса (1 этаж)",
    description: "Поточные аудитории и учебно-лабораторный комплекс",
  },
  {
    id: "bldg-eng",
    title: "28-й учебный корпус (Инженерный)",
    short: "Корпус 28",
    badgeLabel: "28",
    category: "academic",
    coords: [37.5635, 55.8265],
    address: "Лиственничная аллея, 2Д",
    floors: "4 этажа",
    faculties: "Инженерный институт им. В.П. Горячкина (тракторы, с/х машины, техносферная безопасность)",
    buffet: "Буфет инженерного корпуса (1 этаж)",
    description: "Инженерный институт им. Горячкина",
  },
  {
    id: "bldg-29",
    title: "29-й учебный корпус (Цифровой центр)",
    short: "Корпус 29",
    badgeLabel: "29",
    category: "academic",
    coords: [37.541, 55.842],
    address: "Лиственничная аллея, 16",
    floors: "3 этажа",
    faculties: "Цифровой центр, компьютерные классы ИЦ, селекция и биотехнологии",
    buffet: "Кофе-пойнт и снек-автоматы",
    description: "Инновационный цифровой учебный комплекс",
  },
  {
    id: "bldg-lib",
    title: "Центральная научная библиотека (ЦНБ)",
    short: "ЦНБ",
    badgeLabel: "ЦНБ",
    category: "academic",
    coords: [37.553, 55.830],
    address: "Лиственничная аллея, 2к1",
    floors: "3 этажа",
    faculties: "Читальные залы, электронная библиотека, коворкинг, редкий фонд",
    buffet: "Кофейня в фойе ЦНБ",
    description: "ЦНБ им. Железнова — крупнейшая аграрная библиотека",
  },
  {
    id: "dorms-campus",
    title: "Студенческий городок (Общежития)",
    short: "Общежития",
    badgeLabel: "🏠",
    category: "dorm",
    coords: [37.554, 55.834],
    address: "Лиственничная аллея / Тимирязевская ул.",
    floors: "5–16 этажей",
    faculties: "Общежития №1–16, студенческий совет, медпункт, прачечные",
    buffet: "Столовая студгородка (Лиственничная аллея, 5)",
    description: "Комплекс общежитий студгородка РГАУ-МСХА",
  },
  {
    id: "sports-sok",
    title: "Спортивный комплекс (СОК РГАУ)",
    short: "Спорткомплекс",
    badgeLabel: "СОК",
    category: "sports",
    coords: [37.557, 55.833],
    address: "Лиственничная аллея, 12Б",
    floors: "2 этажа",
    faculties: "Бассейн 25м, тренажерные залы, секции, стадион «Тимирязевец»",
    buffet: "Фитнес-бар и буфет",
    description: "Главный физкультурно-оздоровительный комплекс академии",
  },
]

export const CAMPUS_OVERVIEW_ITEMS: {
  category: PinCategory
  badgeLabel?: string
  icon?: string
  title: string
  sub: string
  detail: string
  color: string
  mapQ: string
}[] = [
  {
    category: "academic",
    badgeLabel: "1",
    title: "РСХБ Банк",
    sub: "Россельхозбанк",
    detail: "Банкомат: УК-1, 1-й этаж. Офис: Тимирязевская, 58. Пн–Пт 9:00–18:00.",
    color: "bg-blue-bg text-blue",
    mapQ: "Россельхозбанк+Тимирязевская+улица+Москва",
  },
  {
    category: "academic",
    badgeLabel: "🏛",
    title: "Студенческий МФЦ",
    sub: "Многофункциональный центр",
    detail: "УК-1, каб. 102. Справки, льготный проездной, оформление документов. Пн–Пт 10:00–17:00.",
    color: "bg-muted text-primary",
    mapQ: "РГАУ+МСХА+Тимирязевская+49+Москва",
  },
  {
    category: "academic",
    badgeLabel: "ЦНБ",
    title: "Научная библиотека",
    sub: "им. Н.И. Железнова",
    detail: "УК-1, 1-й этаж. Читальный зал, абонемент, ЭБС. Пн–Пт 9:00–18:00, Сб 10:00–16:00.",
    color: "bg-muted text-accent",
    mapQ: "Библиотека+РГАУ+МСХА+Тимирязевская+49",
  },
  {
    category: "department",
    badgeLabel: "Мед",
    title: "Медицинский кабинет",
    sub: "Здравоохранение",
    detail: "УК-1, 1-й этаж. Первая помощь, справки, медкомиссия. Пн–Пт 9:00–17:00.",
    color: "bg-red-bg text-red",
    mapQ: "РГАУ+МСХА+Тимирязевская+49+Москва",
  },
  {
    category: "sports",
    badgeLabel: "СОК",
    title: "Wi-Fi на кампусе",
    sub: "Сеть RGAU-MSCA",
    detail: "Доступна во всех учебных корпусах. Авторизация по логину от ЭИОС (edu.timacad.ru). Пароль — номер студенческого билета.",
    color: "bg-muted text-muted-fg",
    mapQ: "",
  },
  {
    category: "dorm",
    badgeLabel: "Авт",
    title: "Транспорт",
    sub: "Остановки рядом",
    detail: "Метро Тимирязевская — 5 мин пешком. Авт. 87, 87к остановка «Тимирязевская академия».",
    color: "bg-amber-bg text-amber",
    mapQ: "Метро+Тимирязевская+Москва",
  },
]
