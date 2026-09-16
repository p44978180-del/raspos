// ─── Campus Graph: Buildings + Dijkstra Pathfinding ──────────────────────────

export interface BuildingNode {
  id: string
  name: string
  shortName: string
  x: number  // SVG coordinate 0-100
  y: number  // SVG coordinate 0-100
  category: "academic" | "sport" | "library" | "dorm" | "admin" | "service"
  features: string[]
  color: string
}

export interface GraphEdge {
  from: string
  to: string
  weight: number  // walking minutes
  type: "path" | "road" | "covered"
}

export const CAMPUS_BUILDINGS: BuildingNode[] = [
  { id: "corp1", name: "1-й учебный корпус", shortName: "УК-1", x: 38, y: 42, category: "academic", features: ["Главный корпус", "Деканаты", "Актовый зал", "Столовая"], color: "#15803D" },
  { id: "corp2", name: "2-й учебный корпус", shortName: "УК-2", x: 44, y: 38, category: "academic", features: ["Кафедры агрономии", "Лаборатории"], color: "#16A34A" },
  { id: "corp3", name: "3-й учебный корпус", shortName: "УК-3", x: 42, y: 34, category: "academic", features: ["Кафедры зоотехнии"], color: "#16A34A" },
  { id: "corp4", name: "4-й учебный корпус", shortName: "УК-4", x: 48, y: 32, category: "academic", features: ["Лаборатории"], color: "#16A34A" },
  { id: "agrochem", name: "Корпус агрохимии (6-й)", shortName: "Агрохим-6", x: 30, y: 48, category: "academic", features: ["Агрохимия", "Буфет", "БХ-аудитория"], color: "#059669" },
  { id: "corp8", name: "8-й учебный корпус", shortName: "УК-8", x: 55, y: 30, category: "academic", features: ["Кафедры экономики"], color: "#16A34A" },
  { id: "corp9", name: "9-й учебный корпус", shortName: "УК-9", x: 60, y: 28, category: "academic", features: ["Экономический факультет"], color: "#16A34A" },
  { id: "corp12", name: "12-й учебный корпус", shortName: "УК-12", x: 52, y: 44, category: "academic", features: ["Высшая математика", "Физика", "Планетарий"], color: "#16A34A" },
  { id: "bio16", name: "Биологический корпус (16-й)", shortName: "Биол-16", x: 25, y: 36, category: "academic", features: ["Биология", "Экология", "БАн-аудитория"], color: "#065F46" },
  { id: "soil17", name: "17-й корпус (Почвенно-агрономический)", shortName: "Почв-17", x: 33, y: 55, category: "academic", features: ["Почвоведение", "Геология", "БП-аудитория"], color: "#065F46" },
  { id: "meteo18", name: "18-й корпус (Метеорологический)", shortName: "Метео-18", x: 22, y: 44, category: "academic", features: ["Агрометеорология", "Метеостанция"], color: "#0891B2" },
  { id: "corp26", name: "26-й учебный корпус", shortName: "УК-26", x: 65, y: 40, category: "academic", features: ["Гуманитарные науки"], color: "#16A34A" },
  { id: "ling27", name: "27-й корпус (Лингвистический центр)", shortName: "Лингв-27", x: 58, y: 50, category: "academic", features: ["Иностранные языки", "Конференц-зал"], color: "#7C3AED" },
  { id: "engineering", name: "Инженерный корпус (28-й)", shortName: "Инж-28", x: 45, y: 62, category: "academic", features: ["Инженерия", "Мастерские", "Буфет", "КПП-2"], color: "#1D4ED8" },
  { id: "digital29", name: "29-й корпус (Цифровой центр)", shortName: "Цифр-29", x: 54, y: 58, category: "academic", features: ["IT-лаборатории", "Компьютерные классы", "Digital Hub"], color: "#0EA5E9" },
  { id: "biotech37", name: "37-й корпус (Биотехнология)", shortName: "Биотех-37", x: 38, y: 68, category: "academic", features: ["Биотехнологии", "Greenhouse"], color: "#047857" },
  { id: "lib", name: "Центральная научная библиотека (ЦНБ)", shortName: "ЦНБ", x: 48, y: 48, category: "library", features: ["Читальный зал", "Электронная библиотека", "Пн-Пт 8:00–20:00"], color: "#92400E" },
  { id: "sport", name: "Спортивный комплекс (СОК РГАУ)", shortName: "СОК", x: 20, y: 62, category: "sport", features: ["Бассейн", "Тренажёрный зал", "Стадион", "Залы №1-4"], color: "#DC2626" },
  { id: "dorms", name: "Студенческий городок (Общежития)", shortName: "Общежития", x: 72, y: 55, category: "dorm", features: ["Общежитие №1-4, 6, 8, 10", "Прачечная"], color: "#78716C" },
  { id: "admin", name: "Главный административный корпус", shortName: "Ректорат", x: 40, y: 25, category: "admin", features: ["Ректорат", "Приёмная комиссия", "КПП-1"], color: "#92400E" },
]

export const CAMPUS_EDGES: GraphEdge[] = [
  // Main campus paths
  { from: "corp1", to: "corp2", weight: 3, type: "path" },
  { from: "corp1", to: "corp3", weight: 4, type: "path" },
  { from: "corp1", to: "agrochem", weight: 5, type: "path" },
  { from: "corp1", to: "corp12", weight: 6, type: "path" },
  { from: "corp1", to: "lib", weight: 4, type: "path" },
  { from: "corp1", to: "admin", weight: 5, type: "path" },
  { from: "corp2", to: "corp3", weight: 2, type: "path" },
  { from: "corp2", to: "corp4", weight: 3, type: "path" },
  { from: "corp3", to: "corp4", weight: 2, type: "path" },
  { from: "corp3", to: "bio16", weight: 5, type: "path" },
  { from: "corp4", to: "corp8", weight: 6, type: "path" },
  { from: "agrochem", to: "bio16", weight: 6, type: "path" },
  { from: "agrochem", to: "soil17", weight: 5, type: "path" },
  { from: "agrochem", to: "meteo18", weight: 5, type: "path" },
  { from: "bio16", to: "meteo18", weight: 4, type: "path" },
  { from: "soil17", to: "engineering", weight: 8, type: "path" },
  { from: "soil17", to: "biotech37", weight: 7, type: "path" },
  { from: "corp8", to: "corp9", weight: 3, type: "path" },
  { from: "corp8", to: "corp26", weight: 4, type: "path" },
  { from: "corp12", to: "lib", weight: 3, type: "path" },
  { from: "corp12", to: "engineering", weight: 8, type: "path" },
  { from: "lib", to: "engineering", weight: 7, type: "path" },
  { from: "lib", to: "digital29", weight: 5, type: "path" },
  { from: "lib", to: "ling27", weight: 5, type: "path" },
  { from: "engineering", to: "digital29", weight: 5, type: "path" },
  { from: "engineering", to: "biotech37", weight: 6, type: "path" },
  { from: "engineering", to: "sport", weight: 15, type: "road" },
  { from: "digital29", to: "ling27", weight: 5, type: "path" },
  { from: "digital29", to: "biotech37", weight: 7, type: "path" },
  { from: "ling27", to: "corp26", weight: 6, type: "path" },
  { from: "corp26", to: "dorms", weight: 8, type: "path" },
  { from: "dorms", to: "engineering", weight: 10, type: "road" },
  { from: "sport", to: "meteo18", weight: 10, type: "path" },
  { from: "sport", to: "biotech37", weight: 12, type: "path" },
  { from: "admin", to: "corp2", weight: 3, type: "path" },
]

// ─── Dijkstra Algorithm ───────────────────────────────────────────────────────

export interface DijkstraResult {
  path: string[]       // building IDs in order
  totalMinutes: number
  edges: GraphEdge[]   // edges on path for rendering
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
  
  // Reconstruct path
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
  
  return {
    path,
    totalMinutes: dist.get(toId) ?? 0,
    edges,
  }
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
