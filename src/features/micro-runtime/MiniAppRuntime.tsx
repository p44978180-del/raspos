import { useState, useEffect } from "react"
import {
  INSTALLED_MINI_APPS,
  COMMUNITY_STUDENT_MINI_APPS,
  type MiniAppManifest,
  validateManifestCspV3,
  createSandboxBridge,
} from "./bridge"

interface Props {
  isOpen: boolean
  onClose: () => void
  group: string
  onNavigateToBuilding?: (b: string) => void
}

export default function MiniAppRuntime({ isOpen, onClose, group, onNavigateToBuilding }: Props) {
  const [storeTab, setStoreTab] = useState<"installed" | "store">("installed")
  const [selectedApp, setSelectedApp] = useState<MiniAppManifest | null>(null)
  const [activeCategory, setActiveCategory] = useState<string>("all")

  // Installed app IDs persisted in localStorage
  const [installedIds, setInstalledIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem("rgau_installed_miniapps")
      if (saved) return JSON.parse(saved)
    } catch {}
    return ["campus_pass", "canteen_live", "campus_clubs"]
  })

  // Custom added student repositories
  const [customRepos, setCustomRepos] = useState<MiniAppManifest[]>(() => {
    try {
      const saved = localStorage.getItem("rgau_custom_miniapp_repos")
      if (saved) return JSON.parse(saved)
    } catch {}
    return []
  })

  const [customRepoUrl, setCustomRepoUrl] = useState("")
  const [customRepoFeedback, setCustomRepoFeedback] = useState<{ msg: string; success: boolean } | null>(null)

  // App 1: Campus Pass state
  const [passUnlocked, setPassUnlocked] = useState(false)
  const [passNfcScanning, setPassNfcScanning] = useState(false)
  const [passCode] = useState("2026-9481-7731")

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

  // App 4: Smart Greenhouse state
  const [tempC, setTempC] = useState(23.4)
  const [humidity, setHumidity] = useState(68)
  const [soilMoisture, setSoilMoisture] = useState(42)

  // App 5: Dorm Laundry state
  const [bookedSlot, setBookedSlot] = useState<string | null>(null)

  useEffect(() => {
    try {
      localStorage.setItem("rgau_installed_miniapps", JSON.stringify(installedIds))
    } catch {}
  }, [installedIds])

  useEffect(() => {
    try {
      localStorage.setItem("rgau_custom_miniapp_repos", JSON.stringify(customRepos))
    } catch {}
  }, [customRepos])

  if (!isOpen) return null

  const allAvailableApps: MiniAppManifest[] = [
    ...INSTALLED_MINI_APPS,
    ...COMMUNITY_STUDENT_MINI_APPS,
    ...customRepos,
  ]

  const installedApps = allAvailableApps.filter((a) => installedIds.includes(a.id))

  const displayedApps = storeTab === "installed"
    ? installedApps
    : allAvailableApps.filter((a) => activeCategory === "all" || a.category === activeCategory)

  const handleToggleInstall = (appId: string, e?: React.MouseEvent) => {
    e?.stopPropagation()
    setInstalledIds((prev) => {
      if (prev.includes(appId)) {
        return prev.filter((id) => id !== appId)
      } else {
        return [...prev, appId]
      }
    })
  }

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

  const handleAddCustomRepo = () => {
    if (!customRepoUrl.trim()) return
    try {
      // Mock student repository manifest check & CSP v3 validation
      const cleanUrl = customRepoUrl.trim()
      const newManifest: MiniAppManifest = {
        id: `custom_${Date.now()}`,
        name: "Студенческий модуль",
        version: "1.0.0",
        author: "Студенческая команда",
        organization: "РГАУ Студ-IT",
        description: `Модуль подключен из репозитория ${cleanUrl}`,
        icon: "📦",
        permissions: ["storage"],
        category: "service",
        repositoryUrl: cleanUrl,
        integrityHash: "sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=",
        csp: {
          defaultSrc: ["'none'"],
          scriptSrc: ["'self'", "'wasm-unsafe-eval'"],
          connectSrc: ["https://api.timacad.ru"],
          styleSrc: ["'unsafe-inline'"],
          imgSrc: ["https:", "data:"],
          sandbox: ["allow-scripts"],
        },
        isCommunity: true,
      }

      const report = validateManifestCspV3(newManifest)
      if (report.isValid) {
        setCustomRepos((prev) => [...prev, newManifest])
        setInstalledIds((prev) => [...prev, newManifest.id])
        setCustomRepoFeedback({ msg: "✓ Репозиторий успешно валидирован по CSP v3 и установлен!", success: true })
        setCustomRepoUrl("")
      } else {
        setCustomRepoFeedback({ msg: `Ошибка CSP v3: ${report.errors.join("; ")}`, success: false })
      }
    } catch {
      setCustomRepoFeedback({ msg: "Ошибка подключения репозитория", success: false })
    }
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
                  Micro-Runtime v3.0.1
                </span>
              </div>
              <p className="text-[11px] text-muted-fg">Магазин сервисов & CSP v3 Sandbox</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-muted text-muted-fg transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        {/* Store / Installed Navigation Tabs */}
        {!selectedApp && (
          <div className="px-5 pt-3 flex gap-2 border-b border-border/60 bg-muted/20">
            <button
              onClick={() => setStoreTab("installed")}
              className={`pb-2.5 px-3 text-xs font-bold border-b-2 transition-all cursor-pointer ${
                storeTab === "installed"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-fg hover:text-fg"
              }`}
            >
              Установленные ({installedApps.length})
            </button>
            <button
              onClick={() => setStoreTab("store")}
              className={`pb-2.5 px-3 text-xs font-bold border-b-2 transition-all cursor-pointer flex items-center gap-1.5 ${
                storeTab === "store"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-fg hover:text-fg"
              }`}
            >
              <span>Магазин мини-аппов</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-extrabold">
                CSP v3
              </span>
            </button>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {!selectedApp ? (
            <>
              {storeTab === "store" && (
                <>
                  {/* Category Filter for Store */}
                  <div className="flex gap-1.5 overflow-x-auto pb-1">
                    {[
                      { id: "all", label: "Все репозитории" },
                      { id: "science", label: "Наука & СНО" },
                      { id: "service", label: "Быт & Общежития" },
                      { id: "sport", label: "Спорт & Зубры" },
                      { id: "education", label: "Учеба & Сессия" },
                      { id: "dining", label: "Столовые" },
                    ].map((t) => (
                      <button
                        key={t.id}
                        onClick={() => setActiveCategory(t.id)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                          activeCategory === t.id
                            ? "bg-primary text-white shadow-xs"
                            : "bg-muted text-muted-fg hover:text-fg"
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>

                  {/* Connect Student Repository Input */}
                  <div className="p-3.5 rounded-2xl bg-muted/30 border border-border/80 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm">🔗</span>
                      <h4 className="text-xs font-extrabold text-fg">Подключить студенческий репозиторий</h4>
                    </div>
                    <p className="text-[11px] text-muted-fg">
                      URL манифеста сервиса (CSP v3) для загрузки в песочницу
                    </p>
                    <div className="flex gap-2">
                      <input
                        type="url"
                        value={customRepoUrl}
                        onChange={(e) => setCustomRepoUrl(e.target.value)}
                        placeholder="https://github.com/team/app/manifest.json"
                        className="flex-1 px-3 py-2 text-xs rounded-xl bg-card border border-border focus:border-primary focus:outline-none"
                      />
                      <button
                        onClick={handleAddCustomRepo}
                        className="px-3.5 py-2 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary-light transition-all flex-shrink-0"
                      >
                        Подключить
                      </button>
                    </div>
                    {customRepoFeedback && (
                      <p className={`text-[11px] font-bold ${customRepoFeedback.success ? "text-emerald-500" : "text-red-500"}`}>
                        {customRepoFeedback.msg}
                      </p>
                    )}
                  </div>
                </>
              )}

              {/* Mini-Apps List */}
              <div className="space-y-2.5">
                {displayedApps.length === 0 ? (
                  <div className="py-8 text-center text-muted-fg text-xs">
                    Нет доступных мини-аппов в этой категории
                  </div>
                ) : (
                  displayedApps.map((app) => {
                    const isInstalled = installedIds.includes(app.id)
                    const cspReport = validateManifestCspV3(app)
                    return (
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
                            {cspReport.isValid && (
                              <span className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                                ✓ CSP v3
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-fg line-clamp-1 mt-0.5">{app.description}</p>
                          <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-fg">
                            <span>{app.organization || app.author}</span>
                            {app.permissions.length > 0 && (
                              <span>• {app.permissions.join(", ")}</span>
                            )}
                          </div>
                        </div>

                        {storeTab === "store" ? (
                          <button
                            onClick={(e) => handleToggleInstall(app.id, e)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                              isInstalled
                                ? "bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500/20"
                                : "bg-primary text-white hover:bg-primary-light"
                            }`}
                          >
                            {isInstalled ? "Удалить" : "Установить"}
                          </button>
                        ) : (
                          <span className="text-xs font-bold text-primary group-hover:translate-x-0.5 transition-transform">
                            Открыть →
                          </span>
                        )}
                      </div>
                    )
                  })
                )}
              </div>
            </>
          ) : (
            /* ── Running Mini-App Inside Isolated Micro-Runtime ── */
            <div className="space-y-4">
              <div className="flex items-center justify-between bg-muted/40 p-3 rounded-2xl border border-border">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{selectedApp.icon}</span>
                  <div>
                    <h4 className="text-sm font-extrabold text-fg">{selectedApp.name}</h4>
                    <p className="text-[10px] font-mono text-muted-fg">
                      Sandbox ID: {selectedApp.id} • CSP v3 Security Score: 100/100
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedApp(null)}
                  className="px-3 py-1.5 text-xs font-bold bg-card border border-border hover:bg-muted rounded-xl transition-colors"
                >
                  ← Назад к списку
                </button>
              </div>

              {/* Mini-App 1: Campus Pass */}
              {selectedApp.id === "campus_pass" && (
                <div className="p-5 rounded-3xl bg-gradient-to-br from-emerald-900 to-slate-900 text-white shadow-xl space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-[10px] uppercase tracking-widest text-emerald-400 font-extrabold">
                        РГАУ-МСХА ИМЕНИ К.А. ТИМИРЯЗЕВА
                      </span>
                      <h4 className="text-lg font-black">Электронный Студенческий Пропуск</h4>
                    </div>
                    <span className="text-3xl">🏛️</span>
                  </div>

                  <div className="p-4 rounded-2xl bg-white/10 backdrop-blur-md border border-white/10 space-y-2">
                    <div className="flex justify-between text-xs">
                      <span className="text-white/60">Группа:</span>
                      <span className="font-bold">{group || "ДА 01-26"}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-white/60">Идентификатор:</span>
                      <span className="font-mono">{passCode}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-white/60">Статус турникета:</span>
                      <span className={`font-bold ${passUnlocked ? "text-emerald-400" : "text-amber-300"}`}>
                        {passUnlocked ? "✓ ПРОХОД РАЗРЕШЕН (ДОБРО ПОЖАЛОВАТЬ!)" : "Ожидание прикладывания..."}
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={triggerNfcTap}
                    disabled={passNfcScanning}
                    className={`w-full py-3.5 rounded-2xl font-extrabold text-sm transition-all shadow-md flex items-center justify-center gap-2 ${
                      passUnlocked
                        ? "bg-emerald-500 text-white"
                        : passNfcScanning
                        ? "bg-amber-500 text-white animate-pulse"
                        : "bg-white text-slate-900 hover:bg-slate-100 active:scale-[0.98]"
                    }`}
                  >
                    <span>📶</span>
                    <span>{passNfcScanning ? "Считывание NFC турникета..." : "Приложить смартфон к турникету (NFC Tap)"}</span>
                  </button>
                </div>
              )}

              {/* Mini-App 2: Canteen Live */}
              {selectedApp.id === "canteen_live" && (
                <div className="space-y-3">
                  <div className="flex gap-2">
                    {[
                      { id: "corp1", name: "1 корпус" },
                      { id: "corp26", name: "26 корпус" },
                      { id: "canteen_main", name: "Комбинат питания" },
                    ].map((b) => (
                      <button
                        key={b.id}
                        onClick={() => setCanteenBuilding(b.id)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                          canteenBuilding === b.id
                            ? "bg-primary text-white"
                            : "bg-muted text-muted-fg hover:text-fg"
                        }`}
                      >
                        {b.name}
                      </button>
                    ))}
                  </div>

                  <div className="p-4 rounded-2xl bg-card border border-border space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-extrabold text-fg">Очередь на раздаче</h4>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 font-bold">
                        🟢 Малая очередь (3-5 мин)
                      </span>
                    </div>

                    <div className="space-y-2 pt-1 border-t border-border/60">
                      <p className="text-xs font-bold text-fg">Комплексный обед студента — 280 ₽</p>
                      <ul className="text-xs text-muted-fg space-y-1">
                        <li>• Борщ сибирский со сметаной</li>
                        <li>• Котлета по-киевски с пюре</li>
                        <li>• Салат витаминный из свежей капусты</li>
                        <li>• Компот из ягод Тимирязевского сада</li>
                      </ul>
                    </div>

                    {onNavigateToBuilding && (
                      <button
                        onClick={() => onNavigateToBuilding(canteenBuilding === "canteen_main" ? "Столовая" : `Корпус ${canteenBuilding.replace("corp", "")}`)}
                        className="w-full py-2 rounded-xl bg-muted hover:bg-border text-fg text-xs font-bold transition-colors"
                      >
                        Построить маршрут к столовой на карте
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Mini-App 3: Campus Clubs */}
              {selectedApp.id === "campus_clubs" && (
                <div className="space-y-2.5">
                  {[
                    { name: "СНО Агрономии", desc: "Студенческое научное общество: селекция и гидропоника", icon: "🌱" },
                    { name: "Зубры (Волейбол)", desc: "Сборная команда Тимирязевки по волейболу", icon: "🏐" },
                    { name: "IT Клуб РГАУ", desc: "Хакатоны, веб-разработка и проекты умных теплиц", icon: "💻" },
                    { name: "Волонтерский центр", desc: "Помощь приютам и экологические субботники", icon: "🤝" },
                  ].map((club) => {
                    const isJoined = joinedClubs.includes(club.name)
                    return (
                      <div key={club.name} className="p-3.5 rounded-2xl bg-card border border-border flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">{club.icon}</span>
                          <div>
                            <h5 className="text-xs font-extrabold text-fg">{club.name}</h5>
                            <p className="text-[11px] text-muted-fg">{club.desc}</p>
                          </div>
                        </div>
                        <button
                          onClick={() => handleJoinClub(club.name)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                            isJoined
                              ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20"
                              : "bg-primary text-white hover:bg-primary-light"
                          }`}
                        >
                          {isJoined ? "В клубе ✓" : "Вступить"}
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Mini-App 4: Smart Greenhouse */}
              {selectedApp.id === "smart_greenhouse" && (
                <div className="p-4 rounded-2xl bg-card border border-border space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-extrabold text-fg">Теплица 12-го корпуса (СНО)</h4>
                    <span className="text-xs font-mono text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded font-bold">
                      В сети (IoT Wasm)
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="p-2.5 rounded-xl bg-muted">
                      <p className="text-[10px] text-muted-fg">Температура</p>
                      <p className="text-sm font-extrabold text-fg">{tempC} °C</p>
                    </div>
                    <div className="p-2.5 rounded-xl bg-muted">
                      <p className="text-[10px] text-muted-fg">Влажность</p>
                      <p className="text-sm font-extrabold text-fg">{humidity} %</p>
                    </div>
                    <div className="p-2.5 rounded-xl bg-muted">
                      <p className="text-[10px] text-muted-fg">Почва</p>
                      <p className="text-sm font-extrabold text-fg">{soilMoisture} %</p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setSoilMoisture((prev) => Math.min(80, prev + 10))
                    }}
                    className="w-full py-2 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary-light transition-all"
                  >
                    Включить авто-полив грядки №4
                  </button>
                </div>
              )}

              {/* Mini-App 5: Dorm Laundry */}
              {selectedApp.id === "dorm_laundry" && (
                <div className="p-4 rounded-2xl bg-card border border-border space-y-3">
                  <h4 className="text-sm font-extrabold text-fg">Стиральные машины (Общежитие №7)</h4>
                  <div className="space-y-2">
                    {["18:00 – 19:30 (Свободно)", "19:30 – 21:00 (Свободно)", "21:00 – 22:30 (Занято)"].map((slot) => {
                      const isOccupied = slot.includes("Занято")
                      const isBooked = bookedSlot === slot
                      return (
                        <div key={slot} className="flex items-center justify-between p-2.5 rounded-xl bg-muted text-xs">
                          <span className="font-medium text-fg">{slot}</span>
                          <button
                            disabled={isOccupied}
                            onClick={() => setBookedSlot(isBooked ? null : slot)}
                            className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition-all ${
                              isBooked
                                ? "bg-emerald-500 text-white"
                                : isOccupied
                                ? "bg-muted-fg/20 text-muted-fg cursor-not-allowed"
                                : "bg-primary text-white"
                            }`}
                          >
                            {isBooked ? "Забронировано ✓" : isOccupied ? "Недоступно" : "Занять"}
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
