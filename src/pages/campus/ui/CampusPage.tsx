import React, { useState, useEffect } from "react"
import { I } from "@/shared/ui/Icons"
import { CampusBadge, CampusPlanViewer } from "@/components/CampusMapPins"
import {
  BUILDING_DETAILS,
  BUILDING_MAP_QUERIES,
  CAMPUS_QUICK_BADGES,
  CAMPUS_OVERVIEW_ITEMS,
  DORM_COORDS,
  DEPT_DATA,
  FOOD_SPOTS,
  buildMapSrc,
  calculateWalkBetween,
} from "@/entities/campus/model/campusData"
import type { FoodSpot, FoodFilter } from "@/entities/campus/model/types"
import type {
  CampusPinLayer,
  CampusQuickPlace,
} from "@/entities/campus/model/campusData"
import type { UserRole } from "@/entities/lesson/model/types"

export interface CampusPageProps {
  initFood?: boolean
  search: string
  role?: UserRole
}

function isOpen(f: FoodSpot) {
  const d = new Date()
  const m = d.getHours() * 60 + d.getMinutes()
  return m >= f.openFrom && m < f.openTo
}

function fmtOpenTo(f: FoodSpot) {
  return `${String(Math.floor(f.openTo / 60)).padStart(2, "0")}:${String(
    f.openTo % 60,
  ).padStart(2, "0")}`
}

export function CampusPage({ initFood, search, role }: CampusPageProps) {
  const [campusMode, setCampusMode] = useState<"plan" | "territory" | "food">(
    initFood ? "food" : "territory",
  )
  const [showFood, setShowFood] = useState(initFood ?? false)
  const [pinLayer, setPinLayer] = useState<CampusPinLayer>("none")
  const [selectedQuickPlace, setSelectedQuickPlace] =
    useState<CampusQuickPlace | null>(null)
  const [mapCenterCoords, setMapCenterCoords] = useState<
    [number, number] | null
  >(null)
  const [foodFilter, setFoodFilter] = useState<FoodFilter>("all")
  const [selBldg, setSelBldg] = useState<string | null>(null)
  const [selFood, setSelFood] = useState<number | null>(null)
  const [mapExpanded, setMapExpanded] = useState(false)
  const [mapKey, setMapKey] = useState(0)

  useEffect(() => {
    if (initFood) {
      setCampusMode("food")
      setShowFood(true)
    }
  }, [initFood])

  const [expandedOverview, setExpandedOverview] = useState<number | null>(null)
  const [editMode, setEditMode] = useState(false)
  const [foodOverrides, setFoodOverrides] = useState<
    Record<number, Partial<FoodSpot>>
  >({})
  const [editingFoodId, setEditingFoodId] = useState<number | null>(null)
  const [editFoodForm, setEditFoodForm] = useState({ name: "", avgCheck: "" })
  const [overviewOverrides, setOverviewOverrides] = useState<
    Record<
      number,
      {
        detail?: string
        title?: string
        sub?: string
      }
    >
  >({})
  const [editingOverviewIdx, setEditingOverviewIdx] = useState<number | null>(
    null,
  )
  const [overviewForm, setOverviewForm] = useState({
    title: "",
    sub: "",
    detail: "",
  })
  const [buildingNotes, setBuildingNotes] = useState<Record<string, string>>({})
  const [editingBldgNote, setEditingBldgNote] = useState<string | null>(null)
  const [bldgNoteForm, setBldgNoteForm] = useState("")

  const foodFilters: [FoodFilter, string][] = [
    ["all", "Все"],
    ["canteen", "Столовые"],
    ["cafe", "Кофе и перекус"],
    ["supermarket", "Магазины"],
    ["open", "Открыто"],
  ]
  const ftChip: Record<string, string> = {
    canteen: "bg-muted text-primary",
    buffet: "bg-amber-bg text-amber",
    cafe: "bg-amber-bg text-amber",
    supermarket: "bg-blue-bg text-blue",
  }
  const ftLabel: Record<string, string> = {
    canteen: "Столовая",
    buffet: "Буфет",
    cafe: "Кафе",
    supermarket: "Магазин",
  }

  const mapSrc = showFood
    ? buildMapSrc(
        "none",
        true,
        mapCenterCoords,
        selectedQuickPlace ? selectedQuickPlace.coords : null,
      )
    : buildMapSrc(
        pinLayer,
        false,
        mapCenterCoords,
        selectedQuickPlace ? selectedQuickPlace.coords : null,
      )

  function handleSelectQuickPlace(place: CampusQuickPlace) {
    if (selectedQuickPlace?.id === place.id) {
      setSelectedQuickPlace(null)
      setMapCenterCoords(null)
      setMapKey((k) => k + 1)
    } else {
      setSelectedQuickPlace(place)
      setMapCenterCoords(place.coords)
      setMapKey((k) => k + 1)
    }
  }

  const q = search.toLowerCase().trim()
  const filteredFood = FOOD_SPOTS.filter((f) => {
    const ms =
      !q ||
      f.name.toLowerCase().includes(q) ||
      (f.building ?? f.proximity ?? "").toLowerCase().includes(q)
    if (!ms) return false
    if (foodFilter === "all") return true
    if (foodFilter === "open") return isOpen(f)
    if (foodFilter === "canteen") return f.type === "canteen"
    if (foodFilter === "cafe") return f.type === "cafe" || f.type === "buffet"
    return f.type === "supermarket"
  })
  const filteredBldg = Object.keys(BUILDING_DETAILS).filter((k) => {
    const b = BUILDING_DETAILS[k]
    return (
      !q ||
      b.name.toLowerCase().includes(q) ||
      b.address.toLowerCase().includes(q) ||
      b.short.toLowerCase().includes(q)
    )
  })

  return (
    <div className="space-y-3 pb-2">
      {/* Top mode switcher: Campus Plan schematic vs Yandex Map vs Food */}
      <div className="px-4">
        <div className="flex items-center gap-2">
          <div className="flex-1 flex bg-muted rounded-xl p-0.5 gap-0.5">
            {([
              ["plan", "Схема кампуса", I.map],
              ["territory", "Карта онлайн", I.cal],
              ["food", "Где поесть", I.fork],
            ] as const).map(([v, l, iconFn]) => (
              <button
                key={v}
                onClick={() => {
                  setCampusMode(v)
                  setShowFood(v === "food")
                  setPinLayer("none")
                  setSelBldg(null)
                  setSelFood(null)
                  setSelectedQuickPlace(null)
                  setMapCenterCoords(null)
                }}
                className={`flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  campusMode === v
                    ? "bg-primary text-white shadow-xs font-extrabold"
                    : "text-muted-fg hover:text-fg"
                }`}
              >
                {iconFn(12, campusMode === v ? "text-white" : "text-muted-fg")}
                <span>{l}</span>
              </button>
            ))}
          </div>
          {role === "headstudent" && (
            <button
              onClick={() => setEditMode((e) => !e)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                editMode
                  ? "bg-primary text-white border-primary shadow-sm"
                  : "bg-card border-border text-muted-fg hover:border-primary/50 hover:text-primary"
              }`}
            >
              {I.pencil(12)} {editMode ? "Редакт." : "Ред."}
            </button>
          )}
        </div>
      </div>

      {/* 1. Official Schematic Plan Viewer */}
      {campusMode === "plan" && (
        <CampusPlanViewer
          selectedMarkerId={selBldg ? `bldg-${selBldg}` : undefined}
          onSelectMarker={(m) => {
            if (m.category === "academic") setPinLayer("buildings")
            else if (m.category === "dorm") setPinLayer("dorms")
            else if (m.category === "department") setPinLayer("departments")
          }}
        />
      )}

      {/* 2. Interactive Yandex Map Widget */}
      {campusMode === "territory" && (
        <div
          className="mx-4 rounded-2xl overflow-hidden border border-border relative"
          style={{
            height: mapExpanded ? 420 : 260,
            transition: "height .3s cubic-bezier(.22,1,.36,1)",
          }}
        >
          <iframe
            key={mapKey}
            src={mapSrc}
            width="100%"
            height="100%"
            frameBorder="0"
            allowFullScreen
            title="Карта РГАУ-МСХА"
            style={{ display: "block" }}
          />
          <div className="absolute bottom-2 right-2 flex gap-1.5">
            <a
              href={`https://yandex.ru/maps/213/moscow/?ll=${
                mapCenterCoords
                  ? `${mapCenterCoords[0]}%2C${mapCenterCoords[1]}`
                  : "37.5565%2C55.8298"
              }&z=16`}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-card/90 border border-border rounded-xl px-2.5 py-1.5 text-xs font-semibold text-primary shadow hover:bg-card transition-colors backdrop-blur-sm flex items-center gap-1"
            >
              {I.map(12)} Яндекс Карты {I.ext(10)}
            </a>
            <button
              onClick={() => {
                setSelectedQuickPlace(null)
                setMapCenterCoords(null)
                setMapKey((k) => k + 1)
              }}
              title="Сбросить вид"
              className="bg-card/90 border border-border rounded-xl p-1.5 text-muted-fg shadow hover:bg-card hover:text-primary transition-colors backdrop-blur-sm cursor-pointer"
            >
              {I.refresh(14)}
            </button>
            <button
              onClick={() => setMapExpanded((e) => !e)}
              className="bg-card/90 border border-border rounded-xl px-2.5 py-1.5 text-xs font-semibold text-fg shadow hover:bg-card transition-colors backdrop-blur-sm cursor-pointer"
            >
              {mapExpanded ? "Свернуть" : "Развернуть"}
            </button>
          </div>
        </div>
      )}

      {/* 3. Horizontal scroll/chips of custom badges & Building card */}
      {campusMode === "territory" && (
        <>
          <div className="px-4 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-muted-fg uppercase tracking-wider">
                Метки корпусов (3D-навигация)
              </span>
              {selectedQuickPlace && (
                <button
                  onClick={() => {
                    setSelectedQuickPlace(null)
                    setMapCenterCoords(null)
                    setMapKey((k) => k + 1)
                  }}
                  className="text-xs font-semibold text-primary hover:underline cursor-pointer"
                >
                  Сбросить выбор
                </button>
              )}
            </div>
            <div
              className="flex gap-2 overflow-x-auto pb-1.5 pt-0.5"
              style={{ scrollbarWidth: "none" }}
            >
              {CAMPUS_QUICK_BADGES.map((place) => {
                const isSel = selectedQuickPlace?.id === place.id
                return (
                  <button
                    key={place.id}
                    onClick={() => handleSelectQuickPlace(place)}
                    className={`flex-shrink-0 flex items-center gap-2 px-3 py-2 rounded-2xl border transition-all duration-150 cursor-pointer ${
                      isSel
                        ? "bg-primary text-white border-primary shadow-md scale-[1.02]"
                        : "bg-card border-border hover:border-primary/40 hover:bg-muted/40 text-fg"
                    }`}
                  >
                    <CampusBadge
                      category={place.category}
                      label={place.badgeLabel}
                      size={28}
                      active={isSel}
                    />
                    <div className="text-left">
                      <p className="text-xs font-bold leading-tight whitespace-nowrap">
                        {place.short}
                      </p>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {selectedQuickPlace && (
            <div className="mx-4 p-4 bg-card border border-primary/40 rounded-2xl shadow-sm space-y-3 animate-slide-up">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <CampusBadge
                    category={selectedQuickPlace.category}
                    label={selectedQuickPlace.badgeLabel}
                    size={38}
                  />
                  <div>
                    <h3 className="text-base font-bold text-fg leading-tight">
                      {selectedQuickPlace.title}
                    </h3>
                    <p className="text-xs text-muted-fg flex items-center gap-1 mt-0.5">
                      {I.map(12)} {selectedQuickPlace.address}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setSelectedQuickPlace(null)
                    setMapCenterCoords(null)
                    setMapKey((k) => k + 1)
                  }}
                  className="p-1 text-muted-fg hover:text-fg rounded-lg hover:bg-muted cursor-pointer transition-colors"
                  title="Закрыть"
                >
                  {I.close(16)}
                </button>
              </div>

              <div className="space-y-2 text-xs">
                {selectedQuickPlace.floors && (
                  <div className="flex items-start gap-2 bg-muted/50 rounded-xl p-2.5">
                    <span className="font-bold text-fg flex-shrink-0">
                      🏢 Этажи:
                    </span>
                    <span className="text-muted-fg">
                      {selectedQuickPlace.floors}
                    </span>
                  </div>
                )}
                {selectedQuickPlace.faculties && (
                  <div className="flex items-start gap-2 bg-muted/50 rounded-xl p-2.5">
                    <span className="font-bold text-fg flex-shrink-0">
                      🎓 Факультеты:
                    </span>
                    <span className="text-muted-fg">
                      {selectedQuickPlace.faculties}
                    </span>
                  </div>
                )}
                {selectedQuickPlace.buffet && (
                  <div className="flex items-start gap-2 bg-amber-bg/50 border border-amber/20 rounded-xl p-2.5">
                    <span className="font-bold text-amber flex-shrink-0">
                      🍽 Питание:
                    </span>
                    <span className="text-fg">{selectedQuickPlace.buffet}</span>
                  </div>
                )}
              </div>

              {(() => {
                const walk = calculateWalkBetween(
                  "1-й учебный корпус",
                  selectedQuickPlace.title,
                )
                const walkUrl =
                  walk?.routeUrl ||
                  `https://yandex.ru/maps/?rtext=~${selectedQuickPlace.coords[1]},${selectedQuickPlace.coords[0]}&rtt=pd`
                return (
                  <div className="pt-1 flex flex-col gap-1.5">
                    {walk && (
                      <p className="text-xs font-semibold text-primary">
                        ~{walk.mins} мин пешком
                      </p>
                    )}
                    <a
                      href={walkUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary/90 shadow-sm transition-all duration-200"
                    >
                      {I.map(14)} Пешеходный маршрут в Яндекс.Картах{" "}
                      {I.ext(12)}
                    </a>
                  </div>
                )
              })()}
            </div>
          )}
        </>
      )}

      {!showFood && (
        <div className="px-4 flex gap-1.5 flex-wrap">
          {(
            [
              ["none", "Все объекты"],
              ["buildings", "Корпуса"],
              ["dorms", "Общежития"],
              ["departments", "Кафедры"],
            ] as [CampusPinLayer, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setPinLayer(id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                pinLayer === id
                  ? "bg-primary text-white border-primary shadow-xs"
                  : "bg-card border-border text-muted-fg hover:border-primary/40 hover:text-fg"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {showFood && (
        <div className="px-4 flex gap-1.5 flex-wrap">
          {foodFilters.map(([id, label]) => (
            <button
              key={id}
              onClick={() => setFoodFilter(id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                foodFilter === id
                  ? "bg-primary text-white border-primary"
                  : "bg-card border-border text-muted-fg hover:border-accent/40 hover:text-fg"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {!showFood ? (
        pinLayer === "none" ? (
          <div className="px-4 space-y-2">
            <p className="text-xs text-muted-fg font-semibold uppercase tracking-wide">
              Полезное на кампусе
            </p>
            {CAMPUS_OVERVIEW_ITEMS.map((item, i) => {
              const isExp = expandedOverview === i
              const ov = overviewOverrides[i] ?? {}
              const displayTitle = ov.title ?? item.title
              const displaySub = ov.sub ?? item.sub
              const displayDetail = ov.detail ?? item.detail
              const isEditingThis = editingOverviewIdx === i
              return (
                <div
                  key={i}
                  className={`bg-card border rounded-2xl overflow-hidden transition-all duration-200 animate-slide-up list-item-${Math.min(
                    i,
                    5,
                  )} ${
                    isExp
                      ? "border-accent shadow-sm"
                      : "border-border hover:border-accent/40"
                  }`}
                >
                  <button
                    onClick={() => setExpandedOverview(isExp ? null : i)}
                    className="w-full flex items-center gap-3 p-3.5 cursor-pointer"
                  >
                    <CampusBadge
                      category={item.category}
                      label={item.badgeLabel}
                      size="md"
                      className="flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0 text-left">
                      <p className="text-sm font-bold text-fg">
                        {displayTitle}
                      </p>
                      <p className="text-xs text-muted-fg">{displaySub}</p>
                    </div>
                    {editMode && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setOverviewForm({
                            title: displayTitle,
                            sub: displaySub,
                            detail: displayDetail,
                          })
                          setEditingOverviewIdx(i)
                          setExpandedOverview(i)
                        }}
                        className="mr-1 p-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors flex-shrink-0 cursor-pointer"
                      >
                        {I.pencil(12)}
                      </button>
                    )}
                    <div
                      className={`flex-shrink-0 transition-transform duration-200 ${
                        isExp ? "rotate-180" : ""
                      }`}
                    >
                      {I.chev("down", 14, "text-muted-fg")}
                    </div>
                  </button>
                  {isExp && (
                    <div className="px-3.5 pb-3.5 space-y-2">
                      {isEditingThis ? (
                        <div
                          className="space-y-2"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            value={overviewForm.title}
                            onChange={(e) =>
                              setOverviewForm((p) => ({
                                ...p,
                                title: e.target.value,
                              }))
                            }
                            placeholder="Название"
                            className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-card text-fg focus:outline-none focus:border-accent"
                          />
                          <input
                            value={overviewForm.sub}
                            onChange={(e) =>
                              setOverviewForm((p) => ({
                                ...p,
                                sub: e.target.value,
                              }))
                            }
                            placeholder="Подзаголовок"
                            className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-card text-fg focus:outline-none focus:border-accent"
                          />
                          <textarea
                            value={overviewForm.detail}
                            onChange={(e) =>
                              setOverviewForm((p) => ({
                                ...p,
                                detail: e.target.value,
                              }))
                            }
                            placeholder="Описание..."
                            className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-card text-fg focus:outline-none focus:border-accent resize-none"
                            rows={3}
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => setEditingOverviewIdx(null)}
                              className="flex-1 py-1.5 rounded-xl border border-border text-xs font-semibold text-muted-fg cursor-pointer"
                            >
                              Отмена
                            </button>
                            <button
                              onClick={() => {
                                setOverviewOverrides((p) => ({
                                  ...p,
                                  [i]: overviewForm,
                                }))
                                setEditingOverviewIdx(null)
                              }}
                              className="flex-1 py-1.5 rounded-xl bg-primary text-white text-xs font-bold cursor-pointer"
                            >
                              Сохранить
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <p className="text-xs text-muted-fg bg-muted rounded-xl px-3 py-2.5 leading-relaxed">
                            {displayDetail}
                          </p>
                          {item.mapQ && (
                            <a
                              href={`https://yandex.ru/maps/?text=${item.mapQ}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-accent transition-colors"
                            >
                              {I.map(12, "flex-shrink-0")} Открыть на Яндекс
                              Картах {I.ext(10, "text-muted-fg")}
                            </a>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ) : pinLayer === "buildings" ? (
          <div className="space-y-2 px-4">
            {filteredBldg.map((key, idx) => {
              const b = BUILDING_DETAILS[key]
              const isSel = selBldg === key
              return (
                <div
                  key={key}
                  className={`stagger-card bg-card border rounded-2xl overflow-hidden transition-all duration-200 ${
                    isSel
                      ? "border-primary shadow-sm"
                      : "border-border hover:border-accent/40"
                  }`}
                  style={{ animationDelay: `${idx * 30}ms` }}
                >
                  <button
                    onClick={() => setSelBldg(isSel ? null : key)}
                    className="w-full text-left p-3.5 cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <CampusBadge
                        category="academic"
                        label={
                          b.short.replace(/[^\d]/g, "") || String(idx + 1)
                        }
                        size="md"
                        className="flex-shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-bold text-fg leading-snug">
                            {b.name}
                          </p>
                          <span
                            className="text-[11px] text-muted-fg bg-muted px-1.5 py-0.5 rounded-md flex-shrink-0"
                            style={{ fontFamily: "var(--font-mono)" }}
                          >
                            {b.short}
                          </span>
                        </div>
                        <p className="text-xs text-muted-fg mt-0.5">
                          {b.address} · {b.floors} эт.
                        </p>
                      </div>
                      <div
                        className={`flex-shrink-0 transition-transform duration-200 ${
                          isSel ? "rotate-180" : ""
                        }`}
                      >
                        {I.chev("down", 14, "text-muted-fg")}
                      </div>
                    </div>
                  </button>
                  {isSel && (
                    <div className="px-3.5 pb-3.5 space-y-2">
                      {editingBldgNote === key ? (
                        <div className="space-y-2">
                          <textarea
                            value={bldgNoteForm}
                            onChange={(e) => setBldgNoteForm(e.target.value)}
                            placeholder="Заметка о корпусе..."
                            className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-card text-fg focus:outline-none focus:border-accent resize-none"
                            rows={2}
                            autoFocus
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => setEditingBldgNote(null)}
                              className="flex-1 py-1.5 rounded-xl border border-border text-xs font-semibold text-muted-fg cursor-pointer"
                            >
                              Отмена
                            </button>
                            <button
                              onClick={() => {
                                setBuildingNotes((p) => ({
                                  ...p,
                                  [key]: bldgNoteForm,
                                }))
                                setEditingBldgNote(null)
                              }}
                              className="flex-1 py-1.5 rounded-xl bg-primary text-white text-xs font-bold cursor-pointer"
                            >
                              Сохранить
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          {(buildingNotes[key] ?? b.note) && (
                            <p className="text-xs text-muted-fg bg-muted rounded-xl px-3 py-2">
                              {buildingNotes[key] ?? b.note}
                            </p>
                          )}
                          {editMode && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                setBldgNoteForm(
                                  buildingNotes[key] ?? b.note ?? "",
                                )
                                setEditingBldgNote(key)
                              }}
                              className="flex items-center gap-1 text-xs font-semibold text-primary cursor-pointer"
                            >
                              {I.pencil(11)}{" "}
                              {buildingNotes[key]
                                ? "Изменить заметку"
                                : "Добавить заметку"}
                            </button>
                          )}
                        </>
                      )}
                      <a
                        href={`https://yandex.ru/maps/?text=${BUILDING_MAP_QUERIES[key]}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="flex items-center gap-2 text-xs font-semibold text-primary hover:text-accent transition-colors"
                      >
                        {I.map(13, "flex-shrink-0")} Открыть на Яндекс Картах{" "}
                        {I.ext(11, "text-muted-fg")}
                      </a>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ) : pinLayer === "dorms" ? (
          <div className="space-y-2 px-4">
            {Object.entries(DORM_COORDS)
              .filter(([name]) => !q || name.toLowerCase().includes(q))
              .map(([name, [lo, la]], idx) => (
                <div
                  key={name}
                  className="stagger-card bg-card border border-border rounded-2xl px-3 py-3 flex items-center gap-3 hover:border-accent/40 transition-colors"
                  style={{ animationDelay: `${idx * 30}ms` }}
                >
                  <CampusBadge
                    category="dorm"
                    label={name.match(/\d+/)?.[0] ?? String(idx + 1)}
                    size="md"
                    className="flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-fg">{name}</p>
                    <p className="text-xs text-muted-fg">
                      Территория РГАУ-МСХА
                    </p>
                  </div>
                  <a
                    href={`https://yandex.ru/maps/?ll=${lo}%2C${la}&z=17`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary font-semibold flex items-center gap-1 flex-shrink-0"
                  >
                    {I.map(12)} Карта
                  </a>
                </div>
              ))}
          </div>
        ) : (
          <div className="space-y-2 px-4">
            {DEPT_DATA.filter(
              (d) =>
                !q ||
                d.name.toLowerCase().includes(q) ||
                d.building.toLowerCase().includes(q),
            ).map((d, idx) => (
              <div
                key={d.name}
                className="stagger-card bg-card border border-border rounded-2xl px-3 py-3 flex items-center gap-3 hover:border-accent/40 transition-colors"
                style={{ animationDelay: `${idx * 30}ms` }}
              >
                <CampusBadge
                  category="department"
                  size="md"
                  className="flex-shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-fg">{d.name}</p>
                  <p className="text-xs text-muted-fg">{d.building}</p>
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        <div className="space-y-2 px-4">
          {filteredFood.length === 0 && (
            <p className="text-center py-6 text-muted-fg text-sm">
              Ничего не найдено
            </p>
          )}
          {filteredFood.map((f, fi) => {
            const open = isOpen(f)
            const isSel = selFood === f.id
            return (
              <div
                key={f.id}
                className={`stagger-card bg-card border rounded-2xl overflow-hidden transition-all duration-200 list-item-${Math.min(
                  fi,
                  12,
                )} ${
                  isSel
                    ? "border-accent shadow-sm"
                    : "border-border hover:border-accent/40"
                }`}
                style={{ animationDelay: `${fi * 30}ms` }}
              >
                <button
                  onClick={() => setSelFood(isSel ? null : f.id)}
                  className="w-full text-left p-3.5 cursor-pointer"
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <CampusBadge
                          category="dining"
                          size="sm"
                          className="flex-shrink-0"
                        />
                        <p className="text-sm font-bold text-fg">
                          {foodOverrides[f.id]?.name ?? f.name}
                        </p>
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded-md font-semibold flex-shrink-0 ${
                            ftChip[f.type]
                          }`}
                        >
                          {ftLabel[f.type]}
                        </span>
                      </div>
                      <p className="text-xs text-muted-fg">
                        {f.building ?? f.proximity}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <div
                        className={`flex items-center gap-1 px-2 py-1 rounded-xl text-[11px] font-bold ${
                          open
                            ? "bg-muted text-primary border border-primary/20"
                            : "bg-muted text-muted-fg"
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            open ? "bg-accent" : "bg-muted-fg"
                          }`}
                        />
                        {open ? `До ${fmtOpenTo(f)}` : "Закрыто"}
                      </div>
                      <div
                        className={`transition-transform duration-200 ${
                          isSel ? "rotate-180" : ""
                        }`}
                      >
                        {I.chev("down", 14, "text-muted-fg")}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-fg">
                      {foodOverrides[f.id]?.avgCheck ?? f.avgCheck}
                    </span>
                    {editMode && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setEditingFoodId(f.id)
                          setEditFoodForm({
                            name: foodOverrides[f.id]?.name ?? f.name,
                            avgCheck:
                              foodOverrides[f.id]?.avgCheck ?? f.avgCheck,
                          })
                        }}
                        className="text-[11px] font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-lg cursor-pointer"
                      >
                        {I.pencil(10)} Ред.
                      </button>
                    )}
                  </div>
                </button>
                {isSel && (
                  <div className="px-3.5 pb-3.5 space-y-2">
                    {editingFoodId === f.id ? (
                      <div
                        className="space-y-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          value={editFoodForm.name}
                          onChange={(e) =>
                            setEditFoodForm((p) => ({
                              ...p,
                              name: e.target.value,
                            }))
                          }
                          placeholder="Название"
                          className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-card text-fg focus:outline-none focus:border-accent"
                        />
                        <input
                          value={editFoodForm.avgCheck}
                          onChange={(e) =>
                            setEditFoodForm((p) => ({
                              ...p,
                              avgCheck: e.target.value,
                            }))
                          }
                          placeholder="Средний чек"
                          className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-card text-fg focus:outline-none focus:border-accent"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              setEditingFoodId(null)
                            }}
                            className="flex-1 py-1.5 rounded-xl border border-border text-xs font-semibold text-muted-fg cursor-pointer"
                          >
                            Отмена
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              setFoodOverrides((p) => ({
                                ...p,
                                [f.id]: { ...p[f.id], ...editFoodForm },
                              }))
                              setEditingFoodId(null)
                            }}
                            className="flex-1 py-1.5 rounded-xl bg-primary text-white text-xs font-bold cursor-pointer"
                          >
                            Сохранить
                          </button>
                        </div>
                      </div>
                    ) : (
                      <a
                        href={`https://yandex.ru/maps/?text=${f.mapQuery}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="flex items-center gap-2 text-xs font-semibold text-primary hover:text-accent transition-colors"
                      >
                        {I.map(13, "flex-shrink-0")} Открыть на Яндекс Картах{" "}
                        {I.ext(11, "text-muted-fg")}
                      </a>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
