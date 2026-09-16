import { useState, useRef, useCallback } from "react"
import {
  CAMPUS_BUILDINGS,
  CAMPUS_EDGES,
  dijkstra,
  getBuildingById,
  searchBuildings,
  type BuildingNode,
  type DijkstraResult,
} from "./campusGraph"

interface Props {
  isOpen: boolean
  onClose: () => void
  initialFrom?: string
  initialTo?: string
}

const CATEGORY_ICONS: Record<string, string> = {
  academic: "🏛",
  sport: "🏊",
  library: "📚",
  dorm: "🏠",
  admin: "🏢",
  service: "🔧",
}

// SVG viewBox: 0 0 100 100 → percentage coordinates
const SVG_VB = "0 0 100 100"

export default function VectorCampusMap({ isOpen, onClose, initialFrom, initialTo }: Props) {
  const [fromId, setFromId] = useState<string>(initialFrom || "")
  const [toId, setToId] = useState<string>(initialTo || "")
  const [route, setRoute] = useState<DijkstraResult | null>(null)
  const [selectedBuilding, setSelectedBuilding] = useState<BuildingNode | null>(null)
  const [fromSearch, setFromSearch] = useState("")
  const [toSearch, setToSearch] = useState("")
  const [activeSearch, setActiveSearch] = useState<"from" | "to" | null>(null)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const svgRef = useRef<SVGSVGElement>(null)
  const isDragging = useRef(false)
  const lastPos = useRef({ x: 0, y: 0 })

  if (!isOpen) return null

  function computeRoute() {
    if (fromId && toId) {
      const result = dijkstra(fromId, toId)
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
      setSelectedBuilding((prev) => prev?.id === b.id ? null : b)
    }
  }

  const fromResults = fromSearch.length >= 1 && activeSearch === "from" ? searchBuildings(fromSearch) : []
  const toResults = toSearch.length >= 1 && activeSearch === "to" ? searchBuildings(toSearch) : []

  const routePathIds = new Set(route?.path || [])
  const routeEdgeSet = new Set(
    (route?.edges || []).map((e) => `${e.from}-${e.to}`)
  )

  function isEdgeOnRoute(edge: typeof CAMPUS_EDGES[0]): boolean {
    return routeEdgeSet.has(`${edge.from}-${edge.to}`) || routeEdgeSet.has(`${edge.to}-${edge.from}`)
  }

  const instructions = route ? (() => {
    const steps: string[] = []
    for (let i = 0; i < route.path.length - 1; i++) {
      const from = getBuildingById(route.path[i])
      const to = getBuildingById(route.path[i + 1])
      const edge = route.edges[i]
      steps.push(`${from?.shortName} → ${to?.shortName} (${edge?.weight} мин)`)
    }
    return steps
  })() : []

  return (
    <div className="fixed inset-0 z-50 flex flex-col" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative sheet-spring-enter bg-card m-2 sm:m-4 rounded-3xl shadow-2xl flex flex-col overflow-hidden" style={{ maxHeight: "calc(100dvh - 16px)" }}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-border/60 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/12 border border-emerald-500/25 flex items-center justify-center text-base">
              🗺
            </div>
            <div>
              <h2 className="text-sm font-extrabold text-fg">Карта кампуса РГАУ</h2>
              <p className="text-[10px] text-muted-fg">Маршруты · 20 корпусов</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-muted text-muted-fg cursor-pointer">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Route Inputs */}
        <div className="px-4 py-3 flex gap-2 flex-shrink-0 border-b border-border/40">
          <div className="flex-1 relative">
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-muted/60 border border-border/60 focus-within:border-primary transition-colors">
              <div className="w-2.5 h-2.5 rounded-full bg-primary flex-shrink-0" />
              <input
                placeholder="Откуда"
                value={fromSearch}
                onChange={(e) => { setFromSearch(e.target.value); setActiveSearch("from") }}
                onFocus={() => setActiveSearch("from")}
                className="flex-1 text-xs bg-transparent outline-none text-fg placeholder:text-muted-fg"
              />
              {fromId && <span className="text-[10px] text-primary font-bold">{getBuildingById(fromId)?.shortName}</span>}
            </div>
            {fromResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 z-10 mt-1 bg-card border border-border rounded-xl shadow-lg overflow-hidden max-h-36 overflow-y-auto">
                {fromResults.map((b) => (
                  <button key={b.id} onClick={() => { setFromId(b.id); setFromSearch(b.shortName); setActiveSearch(null) }}
                    className="w-full text-left px-3 py-2 text-xs text-fg hover:bg-muted border-b border-border last:border-0 flex items-center gap-2 cursor-pointer">
                    <span>{CATEGORY_ICONS[b.category]}</span>
                    <span className="font-semibold truncate">{b.shortName}</span>
                    <span className="text-muted-fg truncate">{b.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex-1 relative">
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-muted/60 border border-border/60 focus-within:border-primary transition-colors">
              <div className="w-2.5 h-2.5 rounded-full bg-red-500 flex-shrink-0" />
              <input
                placeholder="Куда"
                value={toSearch}
                onChange={(e) => { setToSearch(e.target.value); setActiveSearch("to") }}
                onFocus={() => setActiveSearch("to")}
                className="flex-1 text-xs bg-transparent outline-none text-fg placeholder:text-muted-fg"
              />
              {toId && <span className="text-[10px] text-red-500 font-bold">{getBuildingById(toId)?.shortName}</span>}
            </div>
            {toResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 z-10 mt-1 bg-card border border-border rounded-xl shadow-lg overflow-hidden max-h-36 overflow-y-auto">
                {toResults.map((b) => (
                  <button key={b.id} onClick={() => { setToId(b.id); setToSearch(b.shortName); setActiveSearch(null) }}
                    className="w-full text-left px-3 py-2 text-xs text-fg hover:bg-muted border-b border-border last:border-0 flex items-center gap-2 cursor-pointer">
                    <span>{CATEGORY_ICONS[b.category]}</span>
                    <span className="font-semibold truncate">{b.shortName}</span>
                    <span className="text-muted-fg truncate">{b.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={computeRoute}
            disabled={!fromId || !toId}
            className="px-3 py-2 rounded-xl bg-primary text-white text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex-shrink-0 flex items-center gap-1.5 active:scale-95 transition-transform"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><polyline points="12 8 16 12 12 16"/><line x1="8" y1="12" x2="16" y2="12"/>
            </svg>
            <span className="hidden sm:inline">Маршрут</span>
          </button>
        </div>

        {/* Route result banner */}
        {route && (
          <div className="px-4 py-2.5 bg-primary/8 border-b border-primary/20 flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <p className="text-xs font-extrabold text-primary">
                  {getBuildingById(fromId)?.shortName} → {getBuildingById(toId)?.shortName}
                </p>
                <p className="text-[10px] text-muted-fg mt-0.5">
                  {route.path.length - 1} участков · ~{route.totalMinutes} минут пешком
                </p>
              </div>
              {route.totalMinutes >= 15 && (
                <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded-full flex-shrink-0">
                  ⚠️ Выходите заранее
                </span>
              )}
            </div>
          </div>
        )}

        {/* SVG Map */}
        <div className="flex-1 overflow-hidden relative bg-muted/30 min-h-0" onClick={() => setSelectedBuilding(null)}>
          {/* Hint overlay */}
          {!fromId && !toId && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 bg-card/90 backdrop-blur-sm border border-border/60 rounded-xl px-3 py-2 text-[10px] text-muted-fg text-center shadow-sm pointer-events-none">
              Нажмите на корпус для информации · выберите маршрут выше
            </div>
          )}

          {/* Zoom controls */}
          <div className="absolute top-3 right-3 z-10 flex flex-col gap-1">
            <button onClick={() => setZoom((z) => Math.min(z + 0.3, 3))}
              className="w-8 h-8 bg-card border border-border rounded-xl flex items-center justify-center text-muted-fg hover:text-fg text-lg font-bold shadow-sm cursor-pointer">
              +
            </button>
            <button onClick={() => setZoom((z) => Math.max(z - 0.3, 0.7))}
              className="w-8 h-8 bg-card border border-border rounded-xl flex items-center justify-center text-muted-fg hover:text-fg text-lg font-bold shadow-sm cursor-pointer">
              −
            </button>
            <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }) }}
              className="w-8 h-8 bg-card border border-border rounded-xl flex items-center justify-center text-[9px] font-bold text-muted-fg hover:text-fg shadow-sm cursor-pointer">
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
              transition: "transform 0.2s ease",
            }}
            onMouseDown={(e) => { isDragging.current = true; lastPos.current = { x: e.clientX, y: e.clientY } }}
            onMouseMove={(e) => {
              if (!isDragging.current) return
              const dx = (e.clientX - lastPos.current.x) / zoom / 5
              const dy = (e.clientY - lastPos.current.y) / zoom / 5
              lastPos.current = { x: e.clientX, y: e.clientY }
              setPan((p) => ({ x: p.x + dx, y: p.y + dy }))
            }}
            onMouseUp={() => { isDragging.current = false }}
            onMouseLeave={() => { isDragging.current = false }}
          >
            {/* Campus outline / grass background */}
            <rect x="5" y="5" width="90" height="90" rx="4" fill="#F0FDF4" opacity="0.6" />
            <rect x="5" y="5" width="90" height="90" rx="4" fill="none" stroke="#D1FAE5" strokeWidth="0.5" />
            
            {/* Green zones */}
            <ellipse cx="50" cy="50" rx="35" ry="30" fill="#DCFCE7" opacity="0.4" />
            
            {/* Main alleys */}
            <line x1="38" y1="15" x2="38" y2="85" stroke="#D1FAE5" strokeWidth="1" />
            <line x1="15" y1="42" x2="85" y2="42" stroke="#D1FAE5" strokeWidth="1" />

            {/* All edges */}
            {CAMPUS_EDGES.map((edge, i) => {
              const from = getBuildingById(edge.from)
              const to = getBuildingById(edge.to)
              if (!from || !to) return null
              const onRoute = isEdgeOnRoute(edge)
              return (
                <line
                  key={i}
                  x1={from.x} y1={from.y}
                  x2={to.x} y2={to.y}
                  stroke={onRoute ? "#15803D" : "#D1D5DB"}
                  strokeWidth={onRoute ? 1.5 : 0.4}
                  strokeDasharray={onRoute ? "none" : "1,1"}
                  opacity={onRoute ? 1 : 0.5}
                  style={{ transition: "stroke 0.3s, stroke-width 0.3s" }}
                />
              )
            })}

            {/* Animated route path */}
            {route && route.path.length > 1 && (() => {
              const points = route.path.map((id) => {
                const b = getBuildingById(id)
                return b ? `${b.x},${b.y}` : ""
              }).filter(Boolean).join(" ")
              return (
                <polyline
                  points={points}
                  fill="none"
                  stroke="#15803D"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray="100"
                  opacity="0.9"
                >
                  <animate attributeName="stroke-dashoffset" from="100" to="0" dur="0.8s" fill="freeze" />
                </polyline>
              )
            })()}

            {/* All buildings */}
            {CAMPUS_BUILDINGS.map((b) => {
              const isFrom = b.id === fromId
              const isTo = b.id === toId
              const isOnRoute = routePathIds.has(b.id)
              const isSelected = selectedBuilding?.id === b.id
              const size = isFrom || isTo ? 4.5 : isOnRoute ? 3.5 : isSelected ? 3.5 : 2.8

              return (
                <g key={b.id} onClick={(e) => handleBuildingClick(b, e)} style={{ cursor: "pointer" }}>
                  {/* Glow for route nodes */}
                  {isOnRoute && (
                    <circle cx={b.x} cy={b.y} r={size + 2} fill={b.color} opacity="0.2" />
                  )}
                  <circle
                    cx={b.x} cy={b.y} r={size}
                    fill={isFrom ? "#15803D" : isTo ? "#DC2626" : isSelected ? b.color : b.color}
                    stroke="white"
                    strokeWidth={isFrom || isTo ? 0.8 : 0.4}
                    opacity={isOnRoute ? 1 : isSelected ? 1 : 0.75}
                    style={{ transition: "r 0.2s, opacity 0.2s" }}
                  />
                  {/* Label */}
                  {(isFrom || isTo || isSelected || isOnRoute || size >= 3.5) && (
                    <text
                      x={b.x} y={b.y + size + 2.5}
                      textAnchor="middle"
                      fontSize="2.2"
                      fill={isFrom ? "#15803D" : isTo ? "#DC2626" : "#374151"}
                      fontWeight={isFrom || isTo ? "700" : "600"}
                      className="select-none pointer-events-none"
                    >
                      {b.shortName}
                    </text>
                  )}
                </g>
              )
            })}

            {/* North indicator */}
            <text x="8" y="12" fontSize="2.5" fill="#9CA3AF" className="select-none">↑ С</text>
          </svg>
        </div>

        {/* Building popup */}
        {selectedBuilding && (
          <div className="absolute bottom-20 left-4 right-4 z-20 bg-card border border-border rounded-2xl shadow-xl p-4 animate-slide-up">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-lg">{CATEGORY_ICONS[selectedBuilding.category]}</span>
                  <p className="text-sm font-extrabold text-fg truncate">{selectedBuilding.shortName}</p>
                </div>
                <p className="text-[11px] text-muted-fg mb-2 leading-relaxed">{selectedBuilding.name}</p>
                <div className="flex flex-wrap gap-1.5">
                  {selectedBuilding.features.map((f) => (
                    <span key={f} className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-muted border border-border/60 text-muted-fg">
                      {f}
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex flex-col gap-1.5 flex-shrink-0">
                <button
                  onClick={() => { setFromId(selectedBuilding.id); setFromSearch(selectedBuilding.shortName); setSelectedBuilding(null) }}
                  className="text-[10px] font-bold px-2.5 py-1.5 rounded-lg bg-primary/10 text-primary border border-primary/25 cursor-pointer whitespace-nowrap"
                >
                  Откуда
                </button>
                <button
                  onClick={() => { setToId(selectedBuilding.id); setToSearch(selectedBuilding.shortName); setSelectedBuilding(null) }}
                  className="text-[10px] font-bold px-2.5 py-1.5 rounded-lg bg-red-500/10 text-red-600 border border-red-500/25 cursor-pointer whitespace-nowrap"
                >
                  Куда
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Turn-by-turn instructions */}
        {route && instructions.length > 0 && (
          <div className="flex-shrink-0 px-4 py-3 border-t border-border/60 max-h-32 overflow-y-auto">
            <p className="text-[10px] font-bold text-muted-fg uppercase tracking-wider mb-2">Пошаговый маршрут</p>
            <div className="space-y-1.5">
              {instructions.map((step, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full bg-primary/10 text-primary text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                    {i + 1}
                  </div>
                  <span className="text-[11px] text-fg">{step}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Legend */}
        <div className="flex-shrink-0 px-4 py-2 border-t border-border/40 flex items-center gap-3 flex-wrap">
          {[
            { color: "#15803D", label: "Точка А" },
            { color: "#DC2626", label: "Точка Б" },
            { color: "#D1FAE5", label: "Зелёный маршрут" },
          ].map((l) => (
            <div key={l.label} className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full" style={{ background: l.color }} />
              <span className="text-[10px] text-muted-fg">{l.label}</span>
            </div>
          ))}
          <span className="text-[10px] text-muted-fg ml-auto">РГАУ-МСХА Тимирязевка</span>
        </div>
      </div>
    </div>
  )
}
