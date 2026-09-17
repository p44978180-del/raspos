// --- Campus Graph: Buildings + Dijkstra Pathfinding ---
// GPS normalization: lat_min=55.8250, lat_max=55.8420, lng_min=37.5400, lng_max=37.5660
// Real RGAU-MSHA campus geography coordinates from timacad.ru & Yandex.Maps

export interface BuildingNode {
  id: string
  name: string
  shortName: string
  x: number
  y: number
  lat: number
  lng: number
  category: "academic" | "sport" | "library" | "dorm" | "admin" | "service"
  features: string[]
  color: string
}

export interface GraphEdge {
  from: string
  to: string
  weight: number
  type: "path" | "road" | "covered"
}

function normGps(lat: number, lng: number): { x: number; y: number } {
  const LAT_MIN = 55.8250, LAT_MAX = 55.8420
  const LNG_MIN = 37.5400, LNG_MAX = 37.5660
  const x = 8 + ((lng - LNG_MIN) / (LNG_MAX - LNG_MIN)) * 84
  const y = 8 + ((LAT_MAX - lat) / (LAT_MAX - LAT_MIN)) * 82
  return { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 }
}

const RAW_BUILDINGS = [
  // 🏛 Academic Buildings (Verified RGAU-MSHA)
  { id: "corp1",       name: "1-й учебный корпус (Главный)",             shortName: "УК-1",       lat: 55.8298, lng: 37.5565, category: "academic" as const, features: ["Главный корпус", "Деканаты", "Актовый зал", "Столовая 1к"], color: "#15803D" },
  { id: "corp2",       name: "2-й учебный корпус (Агрономия)",           shortName: "УК-2",       lat: 55.8315, lng: 37.5550, category: "academic" as const, features: ["Кафедры агрономии", "Ботаника", "Физиология"], color: "#16A34A" },
  { id: "corp3",       name: "3-й учебный корпус",                        shortName: "УК-3",       lat: 55.8288, lng: 37.5525, category: "academic" as const, features: ["Кафедры земледелия", "Агрометеорология"], color: "#16A34A" },
  { id: "corp4",       name: "4-й учебный корпус (Информатика)",         shortName: "УК-4",       lat: 55.8295, lng: 37.5505, category: "academic" as const, features: ["Информационные технологии", "Лаборатории"], color: "#16A34A" },
  { id: "corp6",       name: "6-й учебный корпус (Зоотехния)",            shortName: "УК-6",       lat: 55.8320, lng: 37.5510, category: "academic" as const, features: ["Институт зоотехнии и биологии", "Буфет 6к"], color: "#059669" },
  { id: "corp8",       name: "8-й учебный корпус (Лесоводство)",          shortName: "УК-8",       lat: 55.8320, lng: 37.5560, category: "academic" as const, features: ["Лесоводство", "Дендрология", "Кафедры"], color: "#16A34A" },
  { id: "corp9",       name: "9-й учебный корпус (Экономический)",        shortName: "УК-9",       lat: 55.8290, lng: 37.5490, category: "academic" as const, features: ["Институт экономики и управления АПК", "Буфет"], color: "#16A34A" },
  { id: "corp10",      name: "10-й учебный корпус (Мелиорация)",          shortName: "УК-10",      lat: 55.8340, lng: 37.5595, category: "academic" as const, features: ["Мелиорация", "Водное хозяйство"], color: "#16A34A" },
  { id: "corp11",      name: "11-й учебный корпус",                       shortName: "УК-11",      lat: 55.8345, lng: 37.5610, category: "academic" as const, features: ["Лекционные аудитории", "Семинарские залы"], color: "#16A34A" },
  { id: "corp12",      name: "12-й учебный корпус (Теплицы)",             shortName: "УК-12",      lat: 55.8350, lng: 37.5450, category: "academic" as const, features: ["Опытные теплицы", "Планетарий", "Участок"], color: "#16A34A" },
  { id: "corp17",      name: "17-й корпус (Почвенно-агрономический)",     shortName: "Почв-17",    lat: 55.8330, lng: 37.5420, category: "academic" as const, features: ["Почвоведение", "Геология", "Столовая 17к (2 зала)"], color: "#065F46" },
  { id: "corp26",      name: "26-й учебный корпус (Поточные залы)",       shortName: "УК-26",      lat: 55.8310, lng: 37.5550, category: "academic" as const, features: ["Поточные лекционные залы", "Буфет 26к"], color: "#16A34A" },
  { id: "corp28",      name: "28-й корпус (Инженерный им. Горячкина)",   shortName: "Инж-28",    lat: 55.8265, lng: 37.5635, category: "academic" as const, features: ["Инженерия", "Мастерские", "Буфет", "КПП-2"], color: "#1D4ED8" },
  { id: "corp29",      name: "29-й корпус (Цифровой центр АПК)",          shortName: "Цифр-29",   lat: 55.8420, lng: 37.5410, category: "academic" as const, features: ["IT-лаборатории", "Digital Hub", "Кофейня"], color: "#0EA5E9" },
  { id: "agrochem",    name: "Корпус агрохимии (22/23)",                 shortName: "Агрохим-22", lat: 55.8280, lng: 37.5603, category: "academic" as const, features: ["Кафедры агрохимии", "Биохимия", "Защита растений"], color: "#059669" },

  // 🏢 Administration & Library
  { id: "admin",       name: "Ректорат (Главное здание)",                 shortName: "Ректорат",   lat: 55.8305, lng: 37.5480, category: "admin" as const,    features: ["Ректорат", "Приёмная комиссия", "КПП-1"], color: "#92400E" },
  { id: "lib",         name: "ЦНБ им. Железнова (Библиотека)",           shortName: "ЦНБ",        lat: 55.8300, lng: 37.5530, category: "library" as const,  features: ["Читальный зал", "Электронная библиотека", "Коворкинг"], color: "#7C3AED" },

  // ⚽ Sports & Dining
  { id: "sport",       name: "Спортивно-оздоровительный комплекс (СОК)", shortName: "СОК",        lat: 55.8330, lng: 37.5570, category: "sport" as const,    features: ["Бассейн 25м", "Тренажёрный зал", "Залы 1-4"], color: "#DC2626" },
  { id: "stadium",     name: "Стадион Тимирязевец",                       shortName: "Стадион",    lat: 55.8330, lng: 37.5555, category: "sport" as const,    features: ["Беговые дорожки", "Футбольное поле", "Трибуны"], color: "#EF4444" },
  { id: "canteen",     name: "Комбинат питания «Тимирязевская»",          shortName: "Столовая КП", lat: 55.8350, lng: 37.5575, category: "service" as const,  features: ["Большая двухэтажная столовая", "Комплексные обеды", "8:30-20:00"], color: "#D97706" },

  // 🏠 Student Dormitories (Все 13 общежитий с официальными адресами)
  { id: "dorm1",       name: "Общежитие №1",                              shortName: "ОЖ-1",       lat: 55.8340, lng: 37.5520, category: "dorm" as const,     features: ["Лиственничная аллея, 4", "Студенческое общежитие"], color: "#EA580C" },
  { id: "dorm2",       name: "Общежитие №2",                              shortName: "ОЖ-2",       lat: 55.8335, lng: 37.5528, category: "dorm" as const,     features: ["Лиственничная аллея, 4А", "Студенческое общежитие"], color: "#EA580C" },
  { id: "dorm3",       name: "Общежитие №3",                              shortName: "ОЖ-3",       lat: 55.8340, lng: 37.5540, category: "dorm" as const,     features: ["Лиственничная аллея, 6", "Студенческое общежитие"], color: "#EA580C" },
  { id: "dorm4",       name: "Общежитие №4",                              shortName: "ОЖ-4",       lat: 55.8330, lng: 37.5545, category: "dorm" as const,     features: ["Лиственничная аллея, 8", "Студенческое общежитие"], color: "#EA580C" },
  { id: "dorm5",       name: "Общежитие №5",                              shortName: "ОЖ-5",       lat: 55.8338, lng: 37.5555, category: "dorm" as const,     features: ["Лиственничная аллея, 10", "Студенческое общежитие"], color: "#EA580C" },
  { id: "dorm6",       name: "Общежитие №6",                              shortName: "ОЖ-6",       lat: 55.8348, lng: 37.5565, category: "dorm" as const,     features: ["Лиственничная аллея, 12", "Студенческое общежитие"], color: "#EA580C" },
  { id: "dorm7",       name: "Общежитие №7",                              shortName: "ОЖ-7",       lat: 55.8290, lng: 37.5560, category: "dorm" as const,     features: ["Тимирязевская ул., 50", "Студенческое общежитие"], color: "#EA580C" },
  { id: "dorm8",       name: "Общежитие №8",                              shortName: "ОЖ-8",       lat: 55.8352, lng: 37.5572, category: "dorm" as const,     features: ["Лиственничная аллея, 14", "Студенческое общежитие"], color: "#EA580C" },
  { id: "dorm9",       name: "Общежитие №9",                              shortName: "ОЖ-9",       lat: 55.8270, lng: 37.5570, category: "dorm" as const,     features: ["Тимирязевская ул., 52", "Студенческое общежитие"], color: "#EA580C" },
  { id: "dorm10",      name: "Общежитие №10",                             shortName: "ОЖ-10",      lat: 55.8268, lng: 37.5648, category: "dorm" as const,     features: ["Дмитровское шоссе, 11", "Студенческое общежитие"], color: "#EA580C" },
  { id: "dorm11",      name: "Общежитие №11",                             shortName: "ОЖ-11",      lat: 55.8340, lng: 37.5580, category: "dorm" as const,     features: ["Лиственничная аллея, 7", "Студенческое общежитие"], color: "#EA580C" },
  { id: "dorm13",      name: "Общежитие №13",                             shortName: "ОЖ-13",      lat: 55.8360, lng: 37.5590, category: "dorm" as const,     features: ["Лиственничная аллея, 9", "Студенческое общежитие"], color: "#EA580C" },
  { id: "dorm16",      name: "Общежитие №16",                             shortName: "ОЖ-16",      lat: 55.8250, lng: 37.5585, category: "dorm" as const,     features: ["Тимирязевская ул., 58", "Студенческое общежитие"], color: "#EA580C" },
]

export const CAMPUS_BUILDINGS: BuildingNode[] = RAW_BUILDINGS.map((b) => ({
  ...b,
  ...normGps(b.lat, b.lng),
}))

// Aliases for backwards compatibility with tests and older views
const ID_ALIASES: Record<string, string> = {
  soil17: "corp17",
  engineering: "corp28",
  digital29: "corp29",
  biotech37: "corp6",
}

export const CAMPUS_EDGES: GraphEdge[] = [
  // Academic corridor
  { from: "corp1",      to: "corp2",        weight: 3,  type: "path" },
  { from: "corp1",      to: "corp26",       weight: 3,  type: "path" },
  { from: "corp1",      to: "lib",          weight: 4,  type: "path" },
  { from: "corp1",      to: "corp8",        weight: 4,  type: "path" },
  { from: "corp1",      to: "sport",        weight: 7,  type: "path" },
  { from: "corp1",      to: "dorm7",        weight: 2,  type: "path" },
  { from: "corp1",      to: "corp28",       weight: 9,  type: "path" },
  { from: "corp2",      to: "corp26",       weight: 2,  type: "path" },
  { from: "corp2",      to: "corp8",        weight: 3,  type: "path" },
  { from: "corp2",      to: "corp10",       weight: 5,  type: "path" },
  { from: "corp3",      to: "corp4",        weight: 3,  type: "path" },
  { from: "corp3",      to: "admin",        weight: 4,  type: "path" },
  { from: "corp3",      to: "lib",          weight: 3,  type: "path" },
  { from: "corp4",      to: "admin",        weight: 3,  type: "path" },
  { from: "corp4",      to: "corp6",        weight: 4,  type: "path" },
  { from: "corp4",      to: "corp9",        weight: 3,  type: "path" },
  { from: "corp6",      to: "corp26",       weight: 4,  type: "path" },
  { from: "corp6",      to: "corp17",       weight: 6,  type: "path" },
  { from: "corp6",      to: "dorm1",        weight: 3,  type: "path" },
  { from: "corp8",      to: "corp10",       weight: 3,  type: "path" },
  { from: "corp8",      to: "sport",        weight: 3,  type: "path" },
  { from: "corp9",      to: "admin",        weight: 3,  type: "path" },
  { from: "corp10",     to: "corp11",       weight: 2,  type: "path" },
  { from: "corp10",     to: "canteen",      weight: 3,  type: "path" },
  { from: "corp11",     to: "canteen",      weight: 2,  type: "path" },
  { from: "corp12",     to: "corp17",       weight: 4,  type: "path" },
  { from: "corp12",     to: "corp29",       weight: 5,  type: "path" },
  { from: "corp17",     to: "corp4",        weight: 6,  type: "path" },
  { from: "corp17",     to: "corp29",       weight: 7,  type: "path" },
  { from: "corp26",     to: "lib",          weight: 3,  type: "path" },
  { from: "corp26",     to: "stadium",      weight: 3,  type: "path" },
  { from: "corp28",     to: "agrochem",     weight: 4,  type: "path" },
  { from: "corp28",     to: "dorm10",       weight: 3,  type: "path" },
  { from: "agrochem",   to: "corp1",        weight: 5,  type: "path" },
  { from: "admin",      to: "corp1",        weight: 4,  type: "path" },
  { from: "admin",      to: "lib",          weight: 3,  type: "path" },
  { from: "lib",        to: "dorm4",        weight: 3,  type: "path" },
  { from: "sport",      to: "stadium",      weight: 2,  type: "path" },
  { from: "sport",      to: "canteen",      weight: 3,  type: "path" },

  // Dormitory cluster connections
  { from: "dorm1",      to: "dorm2",        weight: 1,  type: "path" },
  { from: "dorm2",      to: "dorm3",        weight: 2,  type: "path" },
  { from: "dorm3",      to: "dorm4",        weight: 2,  type: "path" },
  { from: "dorm4",      to: "dorm5",        weight: 2,  type: "path" },
  { from: "dorm5",      to: "dorm6",        weight: 2,  type: "path" },
  { from: "dorm6",      to: "dorm8",        weight: 2,  type: "path" },
  { from: "dorm6",      to: "canteen",      weight: 2,  type: "path" },
  { from: "dorm8",      to: "canteen",      weight: 1,  type: "path" },
  { from: "dorm11",     to: "canteen",      weight: 2,  type: "path" },
  { from: "dorm13",     to: "canteen",      weight: 3,  type: "path" },
  { from: "dorm7",      to: "dorm9",        weight: 3,  type: "path" },
  { from: "dorm9",      to: "dorm16",       weight: 4,  type: "path" },
  { from: "dorm16",     to: "corp28",       weight: 6,  type: "path" },
]

export interface DijkstraResult {
  path: string[]
  totalMinutes: number
  edges: GraphEdge[]
  warning?: string
  instructions?: string[]
}

function resolveId(id: string): string {
  return ID_ALIASES[id] || id
}

function buildAdjacency(): Map<string, { to: string; weight: number; edge: GraphEdge }[]> {
  const adj = new Map<string, { to: string; weight: number; edge: GraphEdge }[]>()
  CAMPUS_BUILDINGS.forEach((b) => adj.set(b.id, []))
  CAMPUS_EDGES.forEach((edge) => {
    const from = resolveId(edge.from)
    const to = resolveId(edge.to)
    if (adj.has(from) && adj.has(to)) {
      adj.get(from)?.push({ to, weight: edge.weight, edge })
      adj.get(to)?.push({ to: from, weight: edge.weight, edge })
    }
  })
  return adj
}

export function dijkstra(rawFromId: string, rawToId: string): DijkstraResult | null {
  const fromId = resolveId(rawFromId)
  const toId = resolveId(rawToId)

  if (fromId === toId) return { path: [fromId], totalMinutes: 0, edges: [] }
  const adj = buildAdjacency()
  const dist = new Map<string, number>()
  const prev = new Map<string, string>()
  const prevEdge = new Map<string, GraphEdge>()
  const visited = new Set<string>()

  CAMPUS_BUILDINGS.forEach((b) => dist.set(b.id, Infinity))
  dist.set(fromId, 0)
  const pq: [number, string][] = [[0, fromId]]

  while (pq.length > 0) {
    pq.sort((a, b) => a[0] - b[0])
    const [d, u] = pq.shift()!
    if (visited.has(u)) continue
    visited.add(u)
    if (u === toId) break
    const neighbors = adj.get(u) || []
    for (const { to, weight, edge } of neighbors) {
      if (visited.has(to)) continue
      const newDist = d + weight
      if (newDist < (dist.get(to) ?? Infinity)) {
        dist.set(to, newDist)
        prev.set(to, u)
        prevEdge.set(to, edge)
        pq.push([newDist, to])
      }
    }
  }

  if (!dist.has(toId) || dist.get(toId) === Infinity) return null
  const path: string[] = []
  const edges: GraphEdge[] = []
  let cur = toId
  while (cur !== fromId) {
    path.unshift(cur)
    const e = prevEdge.get(cur)
    if (e) edges.unshift(e)
    cur = prev.get(cur)!
    if (!cur) return null
  }
  path.unshift(fromId)
  return { path, totalMinutes: dist.get(toId) ?? 0, edges }
}

export function getBuildingById(id: string): BuildingNode | undefined {
  const targetId = resolveId(id)
  return CAMPUS_BUILDINGS.find((b) => b.id === targetId || b.id === id)
}

export function searchBuildings(query: string): BuildingNode[] {
  const q = query.toLowerCase().trim()
  if (!q) return CAMPUS_BUILDINGS
  return CAMPUS_BUILDINGS.filter(
    (b) =>
      b.name.toLowerCase().includes(q) ||
      b.shortName.toLowerCase().includes(q) ||
      b.id.toLowerCase().includes(q) ||
      b.features.some((f) => f.toLowerCase().includes(q))
  )
}
