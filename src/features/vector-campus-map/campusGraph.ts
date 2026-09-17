// --- Campus Graph: Buildings + Dijkstra Pathfinding ---
// GPS normalization: lat_min=55.825, lat_max=55.842, lng_min=37.540, lng_max=37.566
// x = (lng - 37.540) / (37.566 - 37.540) * 100
// y = (55.842 - lat) / (55.842 - 55.825) * 100

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
  const LAT_MIN = 55.825, LAT_MAX = 55.842
  const LNG_MIN = 37.540, LNG_MAX = 37.566
  const x = ((lng - LNG_MIN) / (LNG_MAX - LNG_MIN)) * 100
  const y = ((LAT_MAX - lat) / (LAT_MAX - LAT_MIN)) * 100
  return { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 }
}

const RAW_BUILDINGS = [
  { id: "corp1",      name: "1-й учебный корпус (Главный)",             shortName: "УК-1",      lat: 55.8298, lng: 37.5565, category: "academic" as const, features: ["Главный корпус", "Деканаты", "Актовый зал", "Столовая"],       color: "#15803D" },
  { id: "corp2",      name: "2-й учебный корпус",                        shortName: "УК-2",      lat: 55.8315, lng: 37.5550, category: "academic" as const, features: ["Кафедры агрономии", "Лаборатории"],                             color: "#16A34A" },
  { id: "corp3",      name: "3-й учебный корпус",                        shortName: "УК-3",      lat: 55.8288, lng: 37.5525, category: "academic" as const, features: ["Кафедры зоотехнии"],                                            color: "#16A34A" },
  { id: "corp4",      name: "4-й учебный корпус",                        shortName: "УК-4",      lat: 55.8295, lng: 37.5505, category: "academic" as const, features: ["Лаборатории"],                                                   color: "#16A34A" },
  { id: "agrochem",   name: "6-й учебный корпус (Зоотехния)",            shortName: "Агрохим-6", lat: 55.8320, lng: 37.5510, category: "academic" as const, features: ["Агрохимия", "Зоотехния", "Буфет"],                              color: "#059669" },
  { id: "corp8",      name: "8-й учебный корпус (Лесоводство)",          shortName: "УК-8",      lat: 55.8320, lng: 37.5560, category: "academic" as const, features: ["Лесоводство", "Кафедры"],                                       color: "#16A34A" },
  { id: "corp9",      name: "9-й учебный корпус (Экономический)",        shortName: "УК-9",      lat: 55.8290, lng: 37.5490, category: "academic" as const, features: ["Экономический факультет"],                                       color: "#16A34A" },
  { id: "corp10",     name: "10-й учебный корпус (Мелиорация)",          shortName: "УК-10",     lat: 55.8340, lng: 37.5595, category: "academic" as const, features: ["Мелиорация", "Водное хозяйство"],                               color: "#16A34A" },
  { id: "corp11",     name: "11-й учебный корпус",                       shortName: "УК-11",     lat: 55.8345, lng: 37.5610, category: "academic" as const, features: ["Лекционные аудитории"],                                         color: "#16A34A" },
  { id: "corp12",     name: "12-й корпус (Теплицы/Планетарий)",          shortName: "УК-12",     lat: 55.8350, lng: 37.5450, category: "academic" as const, features: ["Планетарий", "Теплицы", "Опытный участок"],                     color: "#16A34A" },
  { id: "soil17",     name: "17-й корпус (Почвенно-агрономический)",     shortName: "Почв-17",   lat: 55.8330, lng: 37.5420, category: "academic" as const, features: ["Почвоведение", "Геология", "БП-аудитория"],                     color: "#065F46" },
  { id: "corp26",     name: "26-й учебный корпус (Поточные залы)",       shortName: "УК-26",     lat: 55.8310, lng: 37.5550, category: "academic" as const, features: ["Поточные залы", "Гуманитарные науки"],                          color: "#16A34A" },
  { id: "engineering", name: "28-й корпус (Инженерный им. Горячкина)",   shortName: "Инж-28",   lat: 55.8265, lng: 37.5635, category: "academic" as const, features: ["Инженерия", "Мастерские", "Буфет", "КПП-2"],                   color: "#1D4ED8" },
  { id: "digital29",  name: "29-й корпус (Цифровой центр АПК)",          shortName: "Цифр-29",  lat: 55.8420, lng: 37.5410, category: "academic" as const, features: ["IT-лаборатории", "Компьютерные классы", "Digital Hub"],          color: "#0EA5E9" },
  { id: "biotech37",  name: "37-й корпус (Биотехнологический)",          shortName: "Биотех-37", lat: 55.8320, lng: 37.5510, category: "academic" as const, features: ["Биотехнологии", "Greenhouse"],                                   color: "#047857" },
  { id: "admin",      name: "Ректорат (Главное здание)",                 shortName: "Ректорат",  lat: 55.8305, lng: 37.5480, category: "admin" as const,    features: ["Ректорат", "Приёмная комиссия", "КПП-1"],                       color: "#92400E" },
  { id: "lib",        name: "ЦНБ им. Железнова (Библиотека)",           shortName: "ЦНБ",       lat: 55.8300, lng: 37.5530, category: "library" as const,   features: ["Читальный зал", "Электронная библиотека", "Пн-Пт 8:00-20:00"],color: "#7C3AED" },
  { id: "sport",      name: "Спортивно-оздоровительный комплекс (СОК)", shortName: "СОК",       lat: 55.8330, lng: 37.5570, category: "sport" as const,     features: ["Бассейн", "Тренажёрный зал", "Залы 1-4"],                      color: "#DC2626" },
  { id: "stadium",    name: "Стадион Тимирязевец",                       shortName: "Стадион",   lat: 55.8330, lng: 37.5555, category: "sport" as const,     features: ["Стадион", "Беговые дорожки", "Футбольное поле"],               color: "#EF4444" },
  { id: "canteen",    name: "Комбинат питания Тимирязевская",            shortName: "Столовая",  lat: 55.8350, lng: 37.5575, category: "service" as const,   features: ["Столовая", "Буфет", "Кафе", "Пн-Сб 8:30-20:00"],             color: "#D97706" },
  { id: "dorm1",      name: "Общежитие 1",                               shortName: "ОЖ-1",      lat: 55.8340, lng: 37.5520, category: "dorm" as const,      features: ["Студенческое общежитие", "Прачечная"],                          color: "#78716C" },
  { id: "dorm2",      name: "Общежитие 2",                               shortName: "ОЖ-2",      lat: 55.8335, lng: 37.5528, category: "dorm" as const,      features: ["Студенческое общежитие"],                                        color: "#78716C" },
  { id: "dorm3",      name: "Общежитие 3",                               shortName: "ОЖ-3",      lat: 55.8340, lng: 37.5540, category: "dorm" as const,      features: ["Студенческое общежитие"],                                        color: "#78716C" },
  { id: "dorm6",      name: "Общежитие 6",                               shortName: "ОЖ-6",      lat: 55.8348, lng: 37.5565, category: "dorm" as const,      features: ["Студенческое общежитие"],                                        color: "#78716C" },
  { id: "dorm10",     name: "Общежитие 10",                              shortName: "ОЖ-10",     lat: 55.8268, lng: 37.5648, category: "dorm" as const,      features: ["Студенческое общежитие"],                                        color: "#78716C" },
]

export const CAMPUS_BUILDINGS: BuildingNode[] = RAW_BUILDINGS.map((b) => ({
  ...b,
  ...normGps(b.lat, b.lng),
}))

export const CAMPUS_EDGES: GraphEdge[] = [
  { from: "corp1",     to: "corp2",       weight: 3,  type: "path" },
  { from: "corp1",     to: "corp26",      weight: 4,  type: "path" },
  { from: "corp1",     to: "lib",         weight: 4,  type: "path" },
  { from: "corp1",     to: "corp8",       weight: 5,  type: "path" },
  { from: "corp1",     to: "sport",       weight: 6,  type: "path" },
  { from: "corp2",     to: "corp8",       weight: 4,  type: "path" },
  { from: "corp2",     to: "corp10",      weight: 5,  type: "path" },
  { from: "corp3",     to: "corp4",       weight: 3,  type: "path" },
  { from: "corp3",     to: "admin",       weight: 4,  type: "path" },
  { from: "corp4",     to: "admin",       weight: 3,  type: "path" },
  { from: "corp4",     to: "agrochem",    weight: 3,  type: "path" },
  { from: "admin",     to: "corp1",       weight: 4,  type: "path" },
  { from: "admin",     to: "lib",         weight: 3,  type: "path" },
  { from: "agrochem",  to: "corp26",      weight: 4,  type: "path" },
  { from: "agrochem",  to: "soil17",      weight: 6,  type: "path" },
  { from: "lib",       to: "corp26",      weight: 3,  type: "path" },
  { from: "corp8",     to: "corp10",      weight: 3,  type: "path" },
  { from: "corp8",     to: "sport",       weight: 4,  type: "path" },
  { from: "corp10",    to: "corp11",      weight: 2,  type: "path" },
  { from: "corp10",    to: "canteen",     weight: 3,  type: "path" },
  { from: "corp11",    to: "canteen",     weight: 3,  type: "path" },
  { from: "sport",     to: "stadium",     weight: 2,  type: "path" },
  { from: "sport",     to: "canteen",     weight: 4,  type: "path" },
  { from: "dorm1",     to: "dorm2",       weight: 2,  type: "path" },
  { from: "dorm2",     to: "dorm3",       weight: 2,  type: "path" },
  { from: "dorm3",     to: "dorm6",       weight: 3,  type: "path" },
  { from: "dorm1",     to: "corp2",       weight: 4,  type: "path" },
  { from: "dorm6",     to: "canteen",     weight: 3,  type: "path" },
  { from: "dorm10",    to: "engineering", weight: 5,  type: "path" },
  { from: "engineering", to: "corp1",     weight: 12, type: "road" },
  { from: "digital29", to: "soil17",      weight: 7,  type: "path" },
  { from: "digital29", to: "corp12",      weight: 4,  type: "path" },
  { from: "corp12",    to: "soil17",      weight: 4,  type: "path" },
  { from: "soil17",    to: "corp4",       weight: 7,  type: "path" },
  { from: "biotech37", to: "agrochem",    weight: 2,  type: "path" },
  { from: "biotech37", to: "corp26",      weight: 3,  type: "path" },
]

export interface DijkstraResult {
  path: string[]
  totalMinutes: number
  edges: GraphEdge[]
  warning?: string
  instructions?: string[]
}

function buildAdjacency(): Map<string, { to: string; weight: number; edge: GraphEdge }[]> {
  const adj = new Map<string, { to: string; weight: number; edge: GraphEdge }[]>()
  CAMPUS_BUILDINGS.forEach((b) => adj.set(b.id, []))
  CAMPUS_EDGES.forEach((edge) => {
    adj.get(edge.from)?.push({ to: edge.to, weight: edge.weight, edge })
    adj.get(edge.to)?.push({ to: edge.from, weight: edge.weight, edge })
  })
  return adj
}

export function dijkstra(fromId: string, toId: string): DijkstraResult | null {
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
  return CAMPUS_BUILDINGS.find((b) => b.id === id)
}

export function searchBuildings(query: string): BuildingNode[] {
  const q = query.toLowerCase()
  return CAMPUS_BUILDINGS.filter(
    (b) => b.name.toLowerCase().includes(q) || b.shortName.toLowerCase().includes(q) || b.id.includes(q)
  )
}
