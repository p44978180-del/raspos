import { useState, useEffect } from "react"
import { INSTALLED_MINI_APPS, type MiniAppManifest, createSandboxBridge } from "./bridge"

interface Props {
  isOpen: boolean
  onClose: () => void
  group: string
  onNavigateToBuilding?: (b: string) => void
}

export default function MiniAppRuntime({ isOpen, onClose, group, onNavigateToBuilding }: Props) {
  const [selectedApp, setSelectedApp] = useState<MiniAppManifest | null>(null)
  const [activeTab, setActiveTab] = useState<"all" | "service" | "dining" | "student_life">("all")

  // App 1: Campus Pass state
  const [passUnlocked, setPassUnlocked] = useState(false)
  const [passNfcScanning, setPassNfcScanning] = useState(false)
  const [passCode, setPassCode] = useState("2026-9481-7731")

  // App 2: Canteen Live state
  const [canteenBuilding, setCanteenBuilding] = useState("corp1")

  // App 3: Clubs state
  const [joinedClubs, setJoinedClubs] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem("rgau_joined_clubs")
      return saved ? JSON.parse(saved) : ["Зубры (Волейбол)", "СНО Агрономии"]
    } catch {
      return ["СНО Агрономии"]
    }
  })

  if (!isOpen) return null

  const filteredApps = activeTab === "all"
    ? INSTALLED_MINI_APPS
    : INSTALLED_MINI_APPS.filter((a) => a.category === activeTab)

  const handleJoinClub = (clubName: string) => {
    setJoinedClubs((prev) => {
      const next = prev.includes(clubName) ? prev.filter((c) => c !== clubName) : [...prev, clubName]
      try {
        localStorage.setItem("rgau_joined_clubs", JSON.stringify(next))
      } catch {}
      return next
    })
  }

  const triggerNfcTap = () => {
    setPassNfcScanning(true)
    setTimeout(() => {
      setPassNfcScanning(false)
      setPassUnlocked(true)
      setTimeout(() => setPassUnlocked(false), 4000)
    }, 1200)
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative sheet-spring-enter bg-card rounded-t-3xl shadow-2xl max-h-[92vh] flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 flex items-center justify-center text-lg shadow-xs">
              ⚡
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h3 className="text-base font-extrabold text-fg">Песочница мини-аппов</h3>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
                  Micro-Runtime v3.0
                </span>
              </div>
              <p className="text-[11px] text-muted-fg">WASM / QuickJS Sandbox для студенческих сервисов</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-muted text-muted-fg transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {!selectedApp ? (
            <>
              {/* Category Filter */}
              <div className="flex gap-1.5 overflow-x-auto pb-1">
                {[
                  { id: "all", label: "Все мини-аппы" },
                  { id: "service", label: "Сервисы & Пропуска" },
                  { id: "dining", label: "Питание & Столовые" },
                  { id: "student_life", label: "Студсовет & Клубы" },
                ].map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setActiveTab(t.id as any)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                      activeTab === t.id
                        ? "bg-primary text-white shadow-xs"
                        : "bg-muted text-muted-fg hover:text-fg"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {/* Mini-Apps List */}
              <div className="space-y-2.5">
                {filteredApps.map((app) => (
                  <div
                    key={app.id}
                    onClick={() => setSelectedApp(app)}
                    className="p-4 rounded-2xl bg-card border border-border hover:border-primary/40 hover:shadow-md transition-all cursor-pointer flex items-center gap-3.5 group"
                  >
                    <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center text-2xl group-hover:scale-105 transition-transform flex-shrink-0 shadow-xs">
                      {app.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-extrabold text-fg truncate">{app.name}</h4>
                        <span className="text-[9px] font-mono text-muted-fg bg-muted px-1.5 py-0.5 rounded">
                          v{app.version}
                        </span>
                      </div>
                      <p className="text-xs text-muted-fg line-clamp-1 mt-0.5">{app.description}</p>
                      <span className="text-[10px] text-primary font-semibold mt-1 inline-block">
                        {app.author}
                      </span>
                    </div>
                    <button className="p-2 rounded-xl bg-primary/10 text-primary group-hover:bg-primary group-hover:text-white transition-all flex-shrink-0">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6"/></svg>
                    </button>
                  </div>
                ))}
              </div>

              {/* Developer notice */}
              <div className="p-3.5 rounded-2xl bg-muted/60 border border-border/80 text-xs text-muted-fg space-y-1">
                <span className="font-bold text-fg flex items-center gap-1.5">
                  🛠 Для студенческих команд разработчиков
                </span>
                <p className="leading-relaxed">
                  Любой студент Тимирязевки может опубликовать мини-апп. Движок предоставляет изолированный контекст с API биометрии, расписания и кампусной навигации.
                </p>
              </div>
            </>
          ) : (
            /* ── Sandboxed Mini-App Active View ── */
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-border/60">
                <button
                  onClick={() => setSelectedApp(null)}
                  className="flex items-center gap-1 text-xs font-bold text-primary hover:underline cursor-pointer"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
                  Все мини-аппы
                </button>
                <span className="text-[11px] font-bold text-muted-fg">
                  Изолированная песочница • {selectedApp.name}
                </span>
              </div>

              {/* APP 1: CAMPUS PASS */}
              {selectedApp.id === "campus_pass" && (
                <div className="space-y-4 text-center">
                  <div className={`p-6 rounded-3xl border transition-all duration-300 ${
                    passUnlocked 
                      ? "bg-emerald-500/10 border-emerald-500 text-emerald-600" 
                      : "bg-muted/40 border-border text-fg"
                  }`}>
                    <div className="text-5xl mb-2">{passUnlocked ? "🔓" : "🎫"}</div>
                    <h4 className="text-base font-extrabold mb-1">
                      {passUnlocked ? "Турникет открыт!" : "Цифровой пропуск РГАУ-МСХА"}
                    </h4>
                    <p className="text-xs text-muted-fg font-mono mb-4">
                      Студент • Группа {group} • ID {passCode}
                    </p>

                    {/* Barcode representation */}
                    <div className="bg-white p-3 rounded-xl inline-block shadow-xs border border-gray-200">
                      <div className="flex items-center gap-0.5 h-12 w-48 justify-center">
                        {[2,1,3,1,2,4,1,2,3,1,2,3,4,1,2,1,3,2,1,4,2].map((w, i) => (
                          <div
                            key={i}
                            className="bg-black h-full"
                            style={{ width: `${w * 1.5}px` }}
                          />
                        ))}
                      </div>
                      <span className="text-[10px] font-mono font-bold text-gray-700 block mt-1">
                        {passCode}
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={triggerNfcTap}
                    disabled={passNfcScanning}
                    className="w-full py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow-sm active:scale-[0.98] transition-all disabled:opacity-50"
                  >
                    {passNfcScanning ? (
                      <>
                        <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                        <span>Считывание NFC турникета...</span>
                      </>
                    ) : (
                      <>
                        <span>📲 Приложить к турникету (NFC Эмуляция)</span>
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* APP 2: CANTEEN LIVE */}
              {selectedApp.id === "canteen_live" && (
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: "corp1", name: "УК-1 (Главная)", wait: "4 мин", load: "low", color: "text-emerald-500" },
                      { id: "agro", name: "Агрохимия", wait: "12 мин", load: "med", color: "text-amber-500" },
                      { id: "eng", name: "Инженерный", wait: "18 мин", load: "high", color: "text-red-500" },
                    ].map((c) => (
                      <button
                        key={c.id}
                        onClick={() => setCanteenBuilding(c.id)}
                        className={`p-2.5 rounded-2xl border text-left transition-all ${
                          canteenBuilding === c.id
                            ? "border-primary bg-primary/10 shadow-xs"
                            : "border-border bg-card hover:bg-muted"
                        }`}
                      >
                        <span className="text-[10px] font-bold text-muted-fg block truncate">{c.name}</span>
                        <span className={`text-xs font-extrabold ${c.color} block mt-0.5`}>~{c.wait}</span>
                      </button>
                    ))}
                  </div>

                  <div className="p-4 rounded-2xl bg-muted/40 border border-border space-y-2.5">
                    <h5 className="text-xs font-extrabold text-fg uppercase tracking-wider">
                      Комплексный обед студента (280 ₽)
                    </h5>
                    <div className="space-y-1.5 text-xs text-muted-fg">
                      <div className="flex justify-between">
                        <span>• Борщ московский со сметаной</span>
                        <span className="font-mono font-bold text-fg">80 ₽</span>
                      </div>
                      <div className="flex justify-between">
                        <span>• Котлета по-киевски с пюре</span>
                        <span className="font-mono font-bold text-fg">150 ₽</span>
                      </div>
                      <div className="flex justify-between">
                        <span>• Компот из сухофруктов + булочка</span>
                        <span className="font-mono font-bold text-fg">50 ₽</span>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => onNavigateToBuilding?.("1-й учебный корпус")}
                    className="w-full py-3 rounded-xl bg-primary text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-transform active:scale-[0.98]"
                  >
                    <span>🧭 Проложить маршрут до столовой</span>
                  </button>
                </div>
              )}

              {/* APP 3: CLUBS & SNO */}
              {selectedApp.id === "campus_clubs" && (
                <div className="space-y-3">
                  {[
                    { name: "СНО Агрономии & Биотеха", category: "Наука", members: 184, time: "Чт 17:00 • ауд. 214 УК-1" },
                    { name: "Зубры (Спортивный клуб)", category: "Спорт", members: 420, time: "Пн/Ср/Пт • Спорткомплекс" },
                    { name: "Клуб робототехники АПК", category: "Инженерия", members: 92, time: "Вт 18:30 • 28-й корпус" },
                    { name: "Волонтерский центр РГАУ", category: "Активизм", members: 310, time: "Сб 14:00 • Актовый зал" },
                  ].map((club) => {
                    const isJoined = joinedClubs.includes(club.name)
                    return (
                      <div
                        key={club.name}
                        className="p-3.5 rounded-2xl bg-card border border-border flex items-center justify-between gap-3"
                      >
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-extrabold text-fg">{club.name}</span>
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-muted text-muted-fg">
                              {club.category}
                            </span>
                          </div>
                          <p className="text-[11px] text-muted-fg mt-0.5">{club.time}</p>
                          <span className="text-[10px] text-primary font-medium">{club.members} участников</span>
                        </div>
                        <button
                          onClick={() => handleJoinClub(club.name)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                            isJoined
                              ? "bg-emerald-500/15 text-emerald-600 border border-emerald-500/30"
                              : "bg-primary text-white hover:bg-primary-light"
                          }`}
                        >
                          {isJoined ? "✓ Вы в клубе" : "Вступить"}
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
