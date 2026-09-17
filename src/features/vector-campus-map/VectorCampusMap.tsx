import { useState, useRef, useMemo, useEffect } from "react"
import {
  CAMPUS_BUILDINGS,
  CAMPUS_EDGES,
  dijkstra,
  getBuildingById,
  searchBuildings,
  type BuildingNode,
  type DijkstraResult,
} from "./campusGraph"
import { rustCore } from "@/utils/rustCore"

interface Props {
  isOpen?: boolean
  onClose?: () => void
  initialFrom?: string
  initialTo?: string
  embedded?: boolean
  selectedBuildingId?: string
}

type FilterCategory = "all" | "academic" | "dorm" | "sport" | "service"

const CATEGORY_LABELS: Record<FilterCategory, string> = {
  all: "Все объекты",
  academic: "🏛 Корпуса",
  dorm: "🏠 Общежития",
  sport: "⚽ Спорт",
  service: "🍽 Питание",
}

const CATEGORY_ICONS: Record<string, string> = {
  academic: "🏛",
  sport: "⚽",
  library: "📚",
  dorm: "🏠",
  admin: "🏢",
  service: "🍽",
}

const SVG_VB = "0 0 100 100"

export default function VectorCampusMap({
  isOpen = true,
  onClose,
  initialFrom,
  initialTo,
  embedded = false,
  selectedBuildingId,
}: Props) {
  const [fromId, setFromId] = useState<string>(initialFrom || "")
  const [toId, setToId] = useState<string>(initialTo || "")
  const [route, setRoute] = useState<DijkstraResult | null>(null)
  const [selectedBuilding, setSelectedBuilding] = useState<BuildingNode | null>(null)
  const [fromSearch, setFromSearch] = useState("")
  const [toSearch, setToSearch] = useState("")
  const [activeSearch, setActiveSearch] = useState<"from" | "to" | null>(null)
  const [activeCategory, setActiveCategory] = useState<FilterCategory>("all")
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const svgRef = useRef<SVGSVGElement>(null)
  const isDragging = useRef(false)
  const lastPos = useRef({ x: 0, y: 0 })

  useEffect(() => {
    if (selectedBuildingId) {
      const b = CAMPUS_BUILDINGS.find(
        (x) =>
          x.id === selectedBuildingId ||
          x.id === selectedBuildingId.replace("bldg-", "corp") ||
          x.shortName.toLowerCase() === selectedBuildingId.toLowerCase()
      )
      if (b) {
        setSelectedBuilding(b)
        setPan({ x: (50 - b.x) * 1.2, y: (50 - b.y) * 1.2 })
        setZoom(1.3)
      }
    }
  }, [selectedBuildingId])

  useEffect(() => {
    if (initialTo) {
      const b = CAMPUS_BUILDINGS.find(
        (x) =>
          x.shortName.toLowerCase().includes(initialTo.toLowerCase()) ||
          x.name.toLowerCase().includes(initialTo.toLowerCase()) ||
          x.id === initialTo
      )
      if (b) {
        setToId(b.id)
        setToSearch(b.shortName)
        setSelectedBuilding(b)
        setPan({ x: (50 - b.x) * 1.2, y: (50 - b.y) * 1.2 })
        setZoom(1.3)
      }
    }
  }, [initialTo])

  if (!embedded && !isOpen) return null

  function computeRoute() {
    if (fromId && toId) {
      const result = dijkstra(fromId, toId)
      const simdTransit = rustCore.findCampusTransitionSIMD128(fromId, 1, toId, 1, 15)
      if (simdTransit.warningMessage && result) {
        result.instructions = [simdTransit.warningMessage, ...(result.instructions || [])]
      }
      setRoute(result)
    } else {
      setRoute(null)
    }
  }

  function handleBuildingClick(b: BuildingNode, e: React.MouseEvent) {
    e.stopPropagation()
    if (activeSearch === "from") {
      setFromId(b.id)
      setFromSearch(b.shortName)
      setActiveSearch(null)
    } else if (activeSearch === "to") {
      setToId(b.id)
      setToSearch(b.shortName)
      setActiveSearch(null)
    } else {
      setSelectedBuilding((prev) => (prev?.id === b.id ? null : b))
    }
  }

  const fromResults = fromSearch.length >= 1 && activeSearch === "from" ? searchBuildings(fromSearch) : []
  const toResults = toSearch.length >= 1 && activeSearch === "to" ? searchBuildings(toSearch) : []

  const routePathIds = new Set(route?.path || [])
  const routeEdgeSet = new Set((route?.edges || []).map((e) => `${e.from}-${e.to}`))

  function isEdgeOnRoute(edge: typeof CAMPUS_EDGES[0]): boolean {
    return (
      routeEdgeSet.has(`${edge.from}-${edge.to}`) ||
      routeEdgeSet.has(`${edge.to}-${edge.from}`)
    )
  }

  const instructions = route
    ? (() => {
        const steps: string[] = []
        for (let i = 0; i < route.path.length - 1; i++) {
          const from = getBuildingById(route.path[i])
          const to = getBuildingById(route.path[i + 1])
          const edge = route.edges[i]
          steps.push(`${from?.shortName} → ${to?.shortName} (${edge?.weight} мин)`)
        }
        return steps
      })()
    : []

  const filteredBuildings = useMemo(() => {
    if (activeCategory === "all") return CAMPUS_BUILDINGS
    if (activeCategory === "academic") {
      return CAMPUS_BUILDINGS.filter(
        (b) => b.category === "academic" || b.category === "admin" || b.category === "library"
      )
    }
    return CAMPUS_BUILDINGS.filter((b) => b.category === activeCategory)
  }, [activeCategory])

  const content = (
    <div
      className={
        embedded
          ? "relative bg-card w-full rounded-2xl shadow-xs flex flex-col overflow-hidden border border-border"
          : "relative sheet-spring-enter bg-card w-full sm:max-w-2xl sm:rounded-3xl rounded-t-3xl shadow-2xl flex flex-col overflow-hidden border border-border"
      }
      style={{ height: embedded ? "520px" : "92dvh", maxHeight: embedded ? "600px" : "840px" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-3.5 pb-2.5 border-b border-border/70 flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-sm">
            🗺
          </div>
          <div>
            <h2 className="text-sm font-extrabold text-fg leading-tight">Карта кампуса РГАУ-МСХА</h2>
            <p className="text-[10px] text-muted-fg font-medium">
              Географическая схема · {CAMPUS_BUILDINGS.length} проверенных объектов
            </p>
          </div>
        </div>
        {onClose && !embedded && (
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-muted text-muted-fg hover:text-fg transition-colors cursor-pointer"
            title="Закрыть"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </div>

        {/* Route Inputs */}
        <div className="px-4 py-2.5 flex gap-2 flex-shrink-0 border-b border-border/50 bg-muted/20">
          <div className="flex-1 relative">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-card border border-border focus-within:border-primary transition-colors shadow-2xs">
              <div className="w-2.5 h-2.5 rounded-full bg-primary flex-shrink-0" />
              <input
                placeholder="Точка А (откуда)"
                value={fromSearch}
                onChange={(e) => {
                  setFromSearch(e.target.value)
                  setActiveSearch("from")
                }}
                onFocus={() => setActiveSearch("from")}
                className="flex-1 text-xs bg-transparent outline-none text-fg placeholder:text-muted-fg"
              />
              {fromId && (
                <span className="text-[10px] text-primary font-bold">{getBuildingById(fromId)?.shortName}</span>
              )}
            </div>
            {fromResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 z-30 mt-1 bg-card border border-border rounded-xl shadow-xl overflow-hidden max-h-40 overflow-y-auto">
                {fromResults.map((b) => (
                  <button
                    key={b.id}
                    onClick={() => {
                      setFromId(b.id)
                      setFromSearch(b.shortName)
                      setActiveSearch(null)
                    }}
                    className="w-full text-left px-3 py-2 text-xs text-fg hover:bg-muted border-b border-border/40 last:border-0 flex items-center gap-2 cursor-pointer"
                  >
                    <span>{CATEGORY_ICONS[b.category] || "📍"}</span>
                    <span className="font-bold">{b.shortName}</span>
                    <span className="text-muted-fg truncate text-[11px]">{b.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex-1 relative">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-card border border-border focus-within:border-primary transition-colors shadow-2xs">
              <div className="w-2.5 h-2.5 rounded-full bg-red-500 flex-shrink-0" />
              <input
                placeholder="Точка Б (куда)"
                value={toSearch}
                onChange={(e) => {
                  setToSearch(e.target.value)
                  setActiveSearch("to")
                }}
                onFocus={() => setActiveSearch("to")}
                className="flex-1 text-xs bg-transparent outline-none text-fg placeholder:text-muted-fg"
              />
              {toId && (
                <span className="text-[10px] text-red-500 font-bold">{getBuildingById(toId)?.shortName}</span>
              )}
            </div>
            {toResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 z-30 mt-1 bg-card border border-border rounded-xl shadow-xl overflow-hidden max-h-40 overflow-y-auto">
                {toResults.map((b) => (
                  <button
                    key={b.id}
                    onClick={() => {
                      setToId(b.id)
                      setToSearch(b.shortName)
                      setActiveSearch(null)
                    }}
                    className="w-full text-left px-3 py-2 text-xs text-fg hover:bg-muted border-b border-border/40 last:border-0 flex items-center gap-2 cursor-pointer"
                  >
                    <span>{CATEGORY_ICONS[b.category] || "📍"}</span>
                    <span className="font-bold">{b.shortName}</span>
                    <span className="text-muted-fg truncate text-[11px]">{b.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={computeRoute}
            disabled={!fromId || !toId}
            className="px-3.5 py-1.5 rounded-xl bg-primary text-white text-xs font-bold disabled:opacity-35 disabled:cursor-not-allowed cursor-pointer flex-shrink-0 flex items-center gap-1.5 active:scale-95 transition-all shadow-xs"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" /><polyline points="12 8 16 12 12 16" /><line x1="8" y1="12" x2="16" y2="12" />
            </svg>
            <span className="hidden sm:inline">Маршрут</span>
          </button>
        </div>

        {/* Category Filters Pill Strip */}
        <div className="px-4 py-1.5 flex items-center gap-1.5 overflow-x-auto border-b border-border/40 flex-shrink-0 no-scrollbar">
          {(["all", "academic", "dorm", "sport", "service"] as FilterCategory[]).map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold whitespace-nowrap transition-all cursor-pointer ${
                activeCategory === cat
                  ? "bg-primary text-white shadow-2xs"
                  : "bg-muted text-muted-fg hover:text-fg"
              }`}
            >
              {CATEGORY_LABELS[cat]}
            </button>
          ))}
        </div>

        {/* Route result banner */}
        {route && (
          <div className="px-4 py-2 bg-primary/10 border-b border-primary/25 flex-shrink-0">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-extrabold text-primary truncate">
                  {getBuildingById(fromId)?.shortName} → {getBuildingById(toId)?.shortName}
                </p>
                <p className="text-[10px] text-muted-fg">
                  {route.path.length - 1} отрезка пути · ~{route.totalMinutes} мин быстрым шагом
                </p>
              </div>
              {route.totalMinutes >= 15 && (
                <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 rounded-full flex-shrink-0">
                  ⚠️ Выходите заранее
                </span>
              )}
            </div>
          </div>
        )}

        {/* SVG Map Canvas */}
        <div
          className="flex-1 overflow-hidden relative bg-[#F8FAF6] dark:bg-[#0E1510] min-h-0 select-none"
          onClick={() => setSelectedBuilding(null)}
        >
          {/* Zoom controls */}
          <div className="absolute top-3 right-3 z-20 flex flex-col gap-1 shadow-md rounded-xl overflow-hidden">
            <button
              onClick={() => setZoom((z) => Math.min(z + 0.3, 3))}
              className="w-8 h-8 bg-card border border-border flex items-center justify-center text-muted-fg hover:text-fg text-base font-bold transition-colors cursor-pointer"
              title="Приблизить"
            >
              +
            </button>
            <button
              onClick={() => setZoom((z) => Math.max(z - 0.3, 0.7))}
              className="w-8 h-8 bg-card border-x border-b border-border flex items-center justify-center text-muted-fg hover:text-fg text-base font-bold transition-colors cursor-pointer"
              title="Отдалить"
            >
              −
            </button>
            <button
              onClick={() => {
                setZoom(1)
                setPan({ x: 0, y: 0 })
              }}
              className="w-8 h-8 bg-card border-x border-b border-border flex items-center justify-center text-[10px] font-bold text-muted-fg hover:text-fg transition-colors cursor-pointer"
              title="Сброс масштаба"
            >
              1:1
            </button>
          </div>

          <svg
            ref={svgRef}
            viewBox={SVG_VB}
            className="w-full h-full"
            style={{
              transform: `scale(${zoom}) translate(${pan.x}px, ${pan.y}px)`,
              transformOrigin: "center center",
              transition: isDragging.current ? "none" : "transform 0.15s ease",
            }}
            onMouseDown={(e) => {
              isDragging.current = true
              lastPos.current = { x: e.clientX, y: e.clientY }
            }}
            onMouseMove={(e) => {
              if (!isDragging.current) return
              const dx = (e.clientX - lastPos.current.x) / zoom / 4
              const dy = (e.clientY - lastPos.current.y) / zoom / 4
              lastPos.current = { x: e.clientX, y: e.clientY }
              setPan((p) => ({ x: p.x + dx, y: p.y + dy }))
            }}
            onMouseUp={() => {
              isDragging.current = false
            }}
            onMouseLeave={() => {
              isDragging.current = false
            }}
            onTouchStart={(e) => {
              if (e.touches.length === 1) {
                isDragging.current = true
                lastPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
              }
            }}
            onTouchMove={(e) => {
              if (!isDragging.current || e.touches.length !== 1) return
              const dx = (e.touches[0].clientX - lastPos.current.x) / zoom / 4
              const dy = (e.touches[0].clientY - lastPos.current.y) / zoom / 4
              lastPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
              setPan((p) => ({ x: p.x + dx, y: p.y + dy }))
            }}
            onTouchEnd={() => {
              isDragging.current = false
            }}
          >
            <defs>
              <pattern id="cropFieldPattern" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(25)">
                <line x1="0" y1="0" x2="0" y2="6" stroke="#D1FAE5" strokeWidth="0.8" opacity="0.6" />
              </pattern>
            </defs>

            {/* ── Geographic Boundaries: Campus Base ── */}
            <rect x="4" y="4" width="92" height="92" rx="8" fill="currentColor" className="text-emerald-500/5 dark:text-emerald-500/10" />

            {/* 🌲 Historical Park & Arboretum (Тимирязевский лес / Дендросад - Западная сторона) ── */}
            <path
              d="M 4 20 Q 20 18 20 38 Q 18 56 4 58 Z"
              fill="#D1FAE5"
              className="dark:fill-emerald-950/40"
              opacity="0.7"
            />
            <text x="10" y="38" fontSize="2.0" fill="#059669" fontWeight="700" opacity="0.7" className="select-none pointer-events-none">
              Тимирязевский лес
            </text>

            {/* 🎓 Academic Quarter Lawn (Зона учебных корпусов вокруг УК-1, УК-2, УК-26, ЦНБ) ── */}
            <rect x="34" y="52" width="35" height="26" rx="4" fill="#15803D" opacity="0.06" />
            <text x="49" y="76" fontSize="1.4" fill="#15803D" fontWeight="700" opacity="0.4" className="select-none pointer-events-none">
              Учебный городок
            </text>

            {/* 🏠 Dormitory Quarter Quad (Студенческий городок по Лиственничной аллее) ── */}
            <rect x="44" y="34" width="30" height="18" rx="4" fill="#EA580C" opacity="0.05" />
            <text x="56" y="37" fontSize="1.3" fill="#EA580C" fontWeight="700" opacity="0.4" className="select-none pointer-events-none">
              Студгородок
            </text>

            {/* ⚽ Sports Cluster: Stadium Timiryazevets with Running Track & Pitch ── */}
            <g transform="translate(54, 48)">
              {/* Red running track oval */}
              <rect x="0" y="0" width="9" height="6.5" rx="3.2" fill="#DC2626" opacity="0.18" stroke="#DC2626" strokeWidth="0.3" />
              {/* Green soccer field inside */}
              <rect x="1.5" y="1" width="6" height="4.5" rx="0.8" fill="#16A34A" opacity="0.35" stroke="#FFFFFF" strokeWidth="0.15" />
              <line x1="4.5" y1="1" x2="4.5" y2="5.5" stroke="#FFFFFF" strokeWidth="0.15" opacity="0.8" />
              <circle cx="4.5" cy="3.25" r="0.9" fill="none" stroke="#FFFFFF" strokeWidth="0.15" opacity="0.8" />
              <text x="4.5" y="7.5" fontSize="1.0" fill="#DC2626" fontWeight="700" textAnchor="middle" opacity="0.7" className="select-none pointer-events-none">
                Стадион
              </text>
            </g>

            {/* 🌾 Experimental Agricultural Fields (Опытные поля РГАУ и Мичуринский сад - Северо-восток) ── */}
            <rect
              x="72"
              y="6"
              width="22"
              height="25"
              rx="3"
              fill="url(#cropFieldPattern)"
              stroke="#10B981"
              strokeWidth="0.4"
              opacity="0.7"
            />
            <text x="83" y="18" fontSize="1.7" fill="#D97706" fontWeight="700" textAnchor="middle" opacity="0.75" className="select-none pointer-events-none">
              Опытные поля РГАУ
            </text>
            <text x="83" y="21" fontSize="1.2" fill="#059669" fontWeight="600" textAnchor="middle" opacity="0.7" className="select-none pointer-events-none">
              Мичуринский сад
            </text>

            {/* 💧 Ponds (Большой Садовый пруд на юго-западе) ── */}
            <path
              d="M 4 64 Q 14 62 16 70 Q 12 78 4 76 Z"
              fill="#E0F2FE"
              stroke="#BAE6FD"
              strokeWidth="0.5"
              className="dark:fill-sky-950/50 dark:stroke-sky-800"
            />
            <text x="7" y="70" fontSize="1.8" fill="#0284C7" fontWeight="600" opacity="0.8" className="select-none pointer-events-none">
              Пруд
            </text>

            {/* 🛣 Main Arteries & Avenues matching building network ── */}
            {/* Timiryazevskaya street (Север-Юг сквозь кампус мимо Корпусов 1, 2, 8, 10 и общежитий) */}
            <path
              d="M 68 8 L 64 36 Q 60 48 58 56 Q 57 66 61 72 L 67 94"
              stroke="#CBD5E1"
              strokeWidth="2.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
              className="dark:stroke-slate-700"
            />
            <path
              d="M 68 8 L 64 36 Q 60 48 58 56 Q 57 66 61 72 L 67 94"
              stroke="#FFFFFF"
              strokeWidth="0.4"
              strokeDasharray="2,2"
              fill="none"
              className="dark:stroke-slate-500"
            />

            {/* Listvennichnaya alley (Главный бульвар кампуса и студгородка: СОК, Столовая, ОЖ 1..13) */}
            <path
              d="M 32 58 Q 48 54 60 50 Q 72 46 92 42"
              stroke="#A7F3D0"
              strokeWidth="2.8"
              strokeLinecap="round"
              fill="none"
              className="dark:stroke-emerald-900/60"
            />
            <path
              d="M 32 58 Q 48 54 60 50 Q 72 46 92 42"
              stroke="#059669"
              strokeWidth="0.5"
              strokeDasharray="1.5,2"
              fill="none"
              opacity="0.4"
            />

            {/* Pryanishnikova street (Южная артерия кампуса: Агрохимия, Инженерия Горячкина) */}
            <path
              d="M 22 78 Q 44 74 62 73 Q 76 76 94 86"
              stroke="#CBD5E1"
              strokeWidth="2.2"
              strokeLinecap="round"
              fill="none"
              className="dark:stroke-slate-700"
            />

            {/* Pasechnaya street & Verkhnyaya alley (Северо-запад: Теплицы 12к, Цифровой центр 29к) */}
            <path
              d="M 10 12 Q 22 36 38 52 L 48 54"
              stroke="#E2E8F0"
              strokeWidth="1.8"
              strokeLinecap="round"
              fill="none"
              className="dark:stroke-slate-800"
            />

            {/* Pedestrian Campus Walkway Links to Roads */}
            <path
              d="M 61.3 66.8 L 60 62 M 56.5 58.6 L 57 54 M 48.4 71.7 L 46 64 M 43.5 56.2 L 44 54 M 50 65.9 L 52 58 M 62.9 51.4 L 62 50 M 64.5 41.8 L 66 46"
              stroke="#CBD5E1"
              strokeWidth="0.7"
              strokeDasharray="1,1"
              fill="none"
              opacity="0.6"
            />

            {/* Street Names */}
            <text x="64" y="24" fontSize="1.7" fill="#64748B" fontWeight="600" className="select-none pointer-events-none" transform="rotate(82 64 24)">
              Тимирязевская ул.
            </text>
            <text x="66" y="44" fontSize="1.7" fill="#059669" fontWeight="700" className="select-none pointer-events-none" transform="rotate(-7 66 44)">
              Лиственничная аллея
            </text>
            <text x="66" y="77" fontSize="1.6" fill="#64748B" fontWeight="600" className="select-none pointer-events-none" transform="rotate(2 66 77)">
              ул. Прянишникова
            </text>
            <text x="24" y="32" fontSize="1.5" fill="#64748B" fontWeight="600" className="select-none pointer-events-none" transform="rotate(45 24 32)">
              Пасечная ул.
            </text>

            {/* All Campus Graph Edges */}
            {CAMPUS_EDGES.map((edge, i) => {
              const from = getBuildingById(edge.from)
              const to = getBuildingById(edge.to)
              if (!from || !to) return null
              const onRoute = isEdgeOnRoute(edge)
              return (
                <line
                  key={i}
                  x1={from.x}
                  y1={from.y}
                  x2={to.x}
                  y2={to.y}
                  stroke={onRoute ? "#15803D" : "#94A3B8"}
                  strokeWidth={onRoute ? 1.8 : 0.5}
                  strokeDasharray={onRoute ? "none" : "1,1.5"}
                  opacity={onRoute ? 1 : 0.35}
                />
              )
            })}

            {/* Animated Active Route Path */}
            {route && route.path.length > 1 && (
              <polyline
                points={route.path
                  .map((id) => {
                    const b = getBuildingById(id)
                    return b ? `${b.x},${b.y}` : ""
                  })
                  .filter(Boolean)
                  .join(" ")}
                fill="none"
                stroke="#15803D"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <animate attributeName="stroke-dashoffset" from="100" to="0" dur="0.7s" fill="freeze" />
              </polyline>
            )}

            {/* All Campus Buildings & POIs with Architectural Footprints */}
            {filteredBuildings.map((b) => {
              const isFrom = b.id === fromId
              const isTo = b.id === toId
              const isOnRoute = routePathIds.has(b.id)
              const isSelected = selectedBuilding?.id === b.id
              const isHighlighted = isFrom || isTo || isSelected || isOnRoute

              return (
                <g
                  key={b.id}
                  onClick={(e) => handleBuildingClick(b, e)}
                  style={{ cursor: "pointer" }}
                  className="transition-transform duration-150 active:scale-95"
                >
                  {/* Selection / Route Glow Ring */}
                  {isHighlighted && (
                    <circle
                      cx={b.x}
                      cy={b.y}
                      r={b.category === "dorm" ? 4.2 : 5.0}
                      fill={isFrom ? "#15803D" : isTo ? "#DC2626" : b.color}
                      opacity="0.3"
                      className="animate-pulse"
                    />
                  )}

                  {/* Architectural Building Footprint */}
                  {b.category === "dorm" ? (
                    <g>
                      <rect
                        x={b.x - 2.2}
                        y={b.y - 1.8}
                        width={4.4}
                        height={3.6}
                        rx={0.8}
                        fill={isFrom ? "#15803D" : isTo ? "#DC2626" : isSelected ? "#C2410C" : "#EA580C"}
                        stroke="#FFFFFF"
                        strokeWidth="0.4"
                        className="drop-shadow-xs"
                      />
                    </g>
                  ) : (
                    <g>
                      <rect
                        x={b.x - 2.5}
                        y={b.y - 2.0}
                        width={5.0}
                        height={4.0}
                        rx={1.0}
                        fill={isFrom ? "#15803D" : isTo ? "#DC2626" : isSelected ? "#047857" : b.color}
                        stroke="#FFFFFF"
                        strokeWidth={isFrom || isTo ? 0.7 : 0.4}
                        className="drop-shadow-xs"
                      />
                    </g>
                  )}

                  {/* Node Label */}
                  <text
                    x={b.x}
                    y={b.y + (b.category === "dorm" ? 3.8 : 4.4)}
                    textAnchor="middle"
                    fontSize="1.9"
                    fill={isFrom ? "#15803D" : isTo ? "#DC2626" : isSelected ? "#0F172A" : "currentColor"}
                    fontWeight={isHighlighted ? "800" : "600"}
                    className="select-none pointer-events-none text-slate-800 dark:text-slate-200"
                  >
                    {b.shortName}
                  </text>
                </g>
              )
            })}

            {/* North Compass Arrow */}
            <g transform="translate(8, 12)">
              <circle cx="0" cy="0" r="3" fill="currentColor" className="text-card/80" />
              <path d="M 0 -2.4 L 1.2 1.8 L 0 0.8 L -1.2 1.8 Z" fill="#DC2626" />
              <text x="0" y="-3.4" fontSize="2.0" textAnchor="middle" fill="#64748B" fontWeight="800">
                С
              </text>
            </g>
          </svg>
        </div>

        {/* Selected Building Details Drawer */}
        {selectedBuilding && (
          <div className="p-3.5 bg-card border-t border-border flex-shrink-0 space-y-2.5 animate-slide-up">
            <div className="flex items-start justify-between gap-2.5">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="text-base">{CATEGORY_ICONS[selectedBuilding.category] || "📍"}</span>
                  <p className="text-sm font-extrabold text-fg truncate">{selectedBuilding.shortName}</p>
                  <span className="text-[10px] font-mono text-muted-fg bg-muted px-1.5 py-0.5 rounded">
                    {selectedBuilding.lat.toFixed(4)}, {selectedBuilding.lng.toFixed(4)}
                  </span>
                </div>
                <p className="text-xs text-muted-fg leading-tight">{selectedBuilding.name}</p>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {selectedBuilding.features.map((f) => (
                    <span key={f} className="text-[9px] font-semibold px-2 py-0.5 rounded-md bg-muted text-muted-fg">
                      {f}
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex flex-col gap-1.5 flex-shrink-0">
                <button
                  onClick={() => {
                    setFromId(selectedBuilding.id)
                    setFromSearch(selectedBuilding.shortName)
                    setSelectedBuilding(null)
                  }}
                  className="text-[10px] font-bold px-3 py-1.5 rounded-lg bg-primary/10 text-primary border border-primary/25 hover:bg-primary/20 cursor-pointer"
                >
                  Отсюда (А)
                </button>
                <button
                  onClick={() => {
                    setToId(selectedBuilding.id)
                    setToSearch(selectedBuilding.shortName)
                    setSelectedBuilding(null)
                  }}
                  className="text-[10px] font-bold px-3 py-1.5 rounded-lg bg-red-500/10 text-red-600 border border-red-500/25 hover:bg-red-500/20 cursor-pointer"
                >
                  Сюда (Б)
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Turn-by-turn routing steps drawer */}
        {route && instructions.length > 0 && !selectedBuilding && (
          <div className="p-3 bg-card border-t border-border flex-shrink-0 max-h-28 overflow-y-auto">
            <p className="text-[10px] font-extrabold uppercase tracking-wider text-muted-fg mb-1.5">Пошаговый маршрут</p>
            <div className="space-y-1">
              {instructions.map((step, i) => (
                <div key={i} className="flex items-center gap-2 text-xs text-fg">
                  <span className="w-4 h-4 rounded-full bg-primary/15 text-primary text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                    {i + 1}
                  </span>
                  <span>{step}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
  )

  if (embedded) {
    return content
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end sm:justify-center p-0 sm:p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      {content}
    </div>
  )
}
