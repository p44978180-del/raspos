import { useState } from "react"
import Icon from "./Icon"

// Positions traced from the campus plan supplied by the user; this is a schematic,
// not a georeferenced navigation network or an accessibility routing guarantee.
const places = [
  { id: "1", name: "Учебный корпус № 1", x: 575, y: 319, category: "study" },
  { id: "2", name: "Учебный корпус № 2", x: 513, y: 241, category: "study" },
  { id: "3", name: "Учебный корпус № 3", x: 443, y: 229, category: "study" },
  { id: "6", name: "Учебный корпус № 6", x: 408, y: 334, category: "study" },
  { id: "9", name: "Учебный корпус № 9", x: 374, y: 308, category: "study" },
  { id: "12", name: "Учебный корпус № 12", x: 480, y: 286, category: "study" },
  { id: "14", name: "Учебный корпус № 14", x: 369, y: 271, category: "study" },
  { id: "16", name: "Учебный корпус № 16", x: 428, y: 406, category: "study" },
  { id: "17", name: "Учебный корпус № 17", x: 281, y: 215, category: "study" },
  { id: "27", name: "Учебный корпус № 27", x: 348, y: 205, category: "study" },
  { id: "28", name: "Учебный корпус № 28", x: 323, y: 139, category: "study" },
  { id: "29", name: "Учебный корпус № 29", x: 554, y: 168, category: "study" },
  { id: "20", name: "Учебный корпус № 20", x: 387, y: 431, category: "study" },
  { id: "Б", name: "Ботанический сад", x: 240, y: 253, category: "garden" },
  { id: "Д", name: "Дендрологический сад", x: 283, y: 419, category: "garden" },
  { id: "М", name: "Мичуринский сад", x: 692, y: 383, category: "garden" },
  { id: "СК", name: "Спортивно-оздоровительный комплекс", x: 731, y: 247, category: "sport" },
  { id: "О1", name: "Общежитие № 1", x: 749, y: 170, category: "dorm" },
  { id: "О2", name: "Общежитие № 2", x: 810, y: 149, category: "dorm" },
  { id: "О3", name: "Общежитие № 3", x: 860, y: 124, category: "dorm" },
] as const
const labels = { all: "Всё", study: "Корпуса", garden: "Сады", sport: "Спорт", dorm: "Общежития" }
export default function CampusMap({ compact = false, onExpand }: { compact?: boolean; onExpand?: () => void }) {
  const [filter, setFilter] = useState("all")
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState(places[0] as typeof places[number])
  const [zoom, setZoom] = useState(1)
  const [original, setOriginal] = useState(false)
  const shown = places.filter(p => (filter === "all" || p.category === filter) && p.name.toLowerCase().includes(query.toLowerCase()))
  return <div className={`campus-map ${compact ? "compact" : ""}`}>
    {!compact && <><div className="map-toolbar"><label className="search-input"><Icon name="search"/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Найти корпус или место" aria-label="Найти место на карте"/></label><button className="button small" onClick={() => setOriginal(!original)}>{original ? "Схема ТИМ" : "Исходный план"}</button></div><div className="chips">{Object.entries(labels).map(([k, v]) => <button key={k} className={filter === k ? "chip active" : "chip"} onClick={() => setFilter(k)}>{v}</button>)}</div></>}
    <div className="map-canvas">
      {original ? <img className="original-map" src={`${import.meta.env.BASE_URL}campus-reference.png`} alt="План кампуса РГАУ-МСХА, предоставленный автором проекта"/> : <svg viewBox={compact ? "190 110 520 380" : `${470 - 470 / zoom} ${290 - 290 / zoom} ${940 / zoom} ${580 / zoom}`} role="img" aria-label="Схематическая карта Тимирязевской академии">
        <defs><pattern id={compact ? "map-grid-small" : "map-grid-full"} width="26" height="26" patternUnits="userSpaceOnUse"><path d="M26 0H0V26" fill="none" stroke="#2c322c" strokeWidth=".6"/></pattern></defs>
        <rect width="940" height="580" fill="#191f1b"/><rect width="940" height="580" fill={`url(#${compact ? "map-grid-small" : "map-grid-full"})`}/>
        <g fill="#283628" stroke="#354b31" strokeWidth="1"><path d="m185 301 115-36 52 108-126 119-69-84Z"/><path d="m609 359 104-54 93 58-34 173-133-15Z"/><path d="m611 89 93-67 153 58-188 122Z"/><path d="m203 242 41-56 59 52-56 51Z"/><path d="m386 480 121-37 75 137H349Z"/></g>
        <g fill="none" stroke="#4b5046" strokeWidth="11"><path d="M202-20 360 281l178 330"/><path d="m447-30 134 323 39 317"/><path d="M32 382 537 366 1000 154"/><path d="m261 212 216 54 127-35"/><path d="m395 505 141-110"/></g>
        <g fill="none" stroke="#83806a" strokeWidth="1" strokeDasharray="3 6"><path d="M202-20 360 281l178 330"/><path d="m447-30 134 323 39 317"/><path d="M32 382 537 366 1000 154"/></g>
        <g fill="#253a3f" stroke="#37545b"><path d="m574 108 17 8 29 201-13 28-15-68Z"/><path d="m3 158 43-5 124 87-15 74-71 2L0 288Z"/></g>
        <g fill="#42463b" stroke="#636954" strokeWidth="1.3">{places.filter(p => p.category === "study").map((p, i) => <path key={p.id} transform={`translate(${p.x - 20} ${p.y - 9}) rotate(-18)`} d={i % 2 ? "M0 0h43v14H28v17H0Z" : "M0 0h48v27H34V12H13v28H0Z"}/>)}{[749,810,860].map((x, i) => <path key={x} transform={`translate(${x - 25} ${181 - i * 25}) rotate(-22)`} d="M0 0h48v19H36v28H22V16H12v20H0Z"/>)}</g>
        <rect x="672" y="190" width="49" height="105" rx="23" fill="#344d31" stroke="#718362" transform="rotate(-18 690 240)"/><rect x="680" y="206" width="32" height="70" fill="none"/>
        <g fill="#89927f" fontFamily="system-ui" fontSize="11" letterSpacing="1"><text x="178" y="347" transform="rotate(-12 178 347)">ИСТОРИЧЕСКИЙ ПАРК</text><text x="644" y="431">МИЧУРИНСКИЙ САД</text><text x="215" y="460">ДЕНДРОСАД</text><text x="625" y="78">ОПЫТНЫЕ ПОЛЯ</text></g>
        <g fill="#a6aa9e" fontFamily="system-ui" fontSize="10"><text transform="translate(371 392) rotate(59)">Тимирязевская улица</text><text transform="translate(659 317) rotate(-25)">Лиственничная аллея</text></g>
        {shown.map(p => <g key={p.id} className={`map-pin ${selected.id === p.id ? "selected" : ""}`} transform={`translate(${p.x} ${p.y})`} onClick={() => compact ? onExpand?.() : setSelected(p)} role="button" tabIndex={0} aria-label={p.name} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); compact ? onExpand?.() : setSelected(p) } }}><circle r={selected.id === p.id ? 23 : 18} className="pin-halo"/><rect x="-15" y="-17" width="30" height="30" rx="9"/><path d="m-5 12 5 6 5-6"/><text textAnchor="middle" y="3" fontSize="11" fontWeight="700" stroke="none">{p.id}</text></g>)}
      </svg>}
      <div className="map-compass"><span>С</span><Icon name="diagonal" size={19}/></div>
      {!compact && !original && <div className="map-zoom"><button aria-label="Приблизить карту" onClick={() => setZoom(z => Math.min(2.5, z + .25))}><Icon name="plus"/></button><button aria-label="Отдалить карту" onClick={() => setZoom(z => Math.max(1, z - .25))}>−</button></div>}
      {compact && <button className="map-open" aria-label="Открыть карту кампуса" onClick={onExpand}><Icon name="diagonal"/></button>}
    </div>
    {!compact && <><div className="place-detail"><div className="place-icon"><Icon name="pin"/></div><div><strong>{selected.name}</strong><p>Расположение по предоставленному плану кампуса</p></div><a className="button small" href={`https://yandex.ru/maps/?text=${encodeURIComponent(selected.name + " РГАУ МСХА Тимирязева Москва")}`} target="_blank" rel="noreferrer">Внешняя карта <Icon name="diagonal" size={16}/></a></div><p className="footnote">Схема без геопривязки. Маршруты между этажами, доступность проходов и занятость аудиторий не подтверждены. <a href="https://www.timacad.ru/student-life/skhema-territorii" target="_blank" rel="noreferrer">Карта университета ↗</a></p><div className="place-list">{shown.map(p => <button key={p.id} className={selected.id === p.id ? "selected" : ""} onClick={() => { setSelected(p); setZoom(1) }}><Icon name="pin" size={16}/>{p.name}<Icon name="right" size={15}/></button>)}{!shown.length && <p className="muted">Мест с таким названием не найдено.</p>}</div></>}
  </div>
}
