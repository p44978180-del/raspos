import { useState, useRef } from "react"
import { generateBarcodeSVG, generateQRDataURL } from "./barcodeGenerator"

interface Props {
  isOpen: boolean
  onClose: () => void
  group: string
  myMode?: string
}

const INSTITUTE_MAP: Record<string, string> = {
  "ДА": "Институт агробиотехнологии",
  "ДЭ": "Институт экономики и управления АПК",
  "ДИ": "Институт механики и энергетики",
  "ДЗ": "Институт зоотехнии и биологии",
  "ДС": "Институт садоводства и ландшафтной архитектуры",
  "ДВ": "Институт мелиорации и водного хозяйства",
  "ДТ": "Технологический институт",
}

function getInstitute(group: string): string {
  for (const [prefix, name] of Object.entries(INSTITUTE_MAP)) {
    if (group.startsWith(prefix)) return name
  }
  return "РГАУ-МСХА им. К.А. Тимирязева"
}

function getCourse(group: string): string {
  // e.g. "ДА 01-26" → "1 курс (2026)"
  const m = group.match(/(\d+)-(\d{2})/)
  if (!m) return "1 курс"
  const year = 2000 + parseInt(m[2])
  const now = new Date()
  const course = now.getFullYear() - year + 1
  return `${course} курс, ${year}/${year + 1} уч. г.`
}

export default function WalletPassModal({ isOpen, onClose, group, myMode }: Props) {
  const [name, setName] = useState("")
  const [studentId, setStudentId] = useState("")
  const [downloading, setDownloading] = useState(false)
  const [downloaded, setDownloaded] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)

  if (!isOpen) return null

  const institute = getInstitute(group)
  const course = getCourse(group)
  const displayId = studentId || "XXXXXXXX"
  const barcodeSvg = generateBarcodeSVG(displayId)
  const qrUrl = generateQRDataURL(`RGAU:${displayId}:${group}`)

  function handleDownloadJSON() {
    setDownloading(true)
    
    // Generate a Apple Wallet-compatible pass JSON manifest
    const passJSON = {
      formatVersion: 1,
      passTypeIdentifier: "pass.ru.rgau.student.card",
      serialNumber: displayId || `RGAU-${Date.now()}`,
      teamIdentifier: "RGAUMSHA",
      organizationName: "РГАУ-МСХА им. К.А. Тимирязева",
      description: "Студенческий билет РГАУ-МСХА",
      logoText: "РГАУ-МСХА",
      foregroundColor: "rgb(255, 255, 255)",
      backgroundColor: "rgb(21, 128, 61)",
      labelColor: "rgb(200, 240, 200)",
      generic: {
        primaryFields: [
          { key: "name", label: "ФИО", value: name || "Студент РГАУ" },
        ],
        secondaryFields: [
          { key: "group", label: "Группа", value: group },
          { key: "course", label: "Курс", value: course },
        ],
        auxiliaryFields: [
          { key: "institute", label: "Институт", value: institute },
        ],
        backFields: [
          { key: "studentId", label: "Номер студенческого", value: displayId },
          { key: "university", label: "Университет", value: "ФГБОУ ВО РГАУ-МСХА им. К.А. Тимирязева" },
          { key: "address", label: "Адрес", value: "127434, Москва, ул. Тимирязевская, 49" },
          { key: "app", label: "Создано в", value: "RasPOS v3.0 · raspos.rgau.ru" },
        ],
      },
      barcode: {
        message: displayId,
        format: "PKBarcodeFormatCode128",
        messageEncoding: "iso-8859-1",
        altText: displayId,
      },
    }

    const blob = new Blob([JSON.stringify(passJSON, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `RGAU-StudentCard-${group.replace(/\s/g, "-")}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 5000)
    
    setTimeout(() => {
      setDownloading(false)
      setDownloaded(true)
      setTimeout(() => setDownloaded(false), 3000)
    }, 800)
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative sheet-spring-enter bg-card rounded-t-3xl shadow-2xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-border/60 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/12 border border-primary/25 flex items-center justify-center text-lg">
              🎓
            </div>
            <div>
              <h2 className="text-base font-extrabold text-fg">Студенческий билет</h2>
              <p className="text-[11px] text-muted-fg">Digital Wallet · группа {group}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-muted text-muted-fg cursor-pointer">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Card Preview */}
          <div
            ref={cardRef}
            className="relative rounded-3xl overflow-hidden shadow-xl"
            style={{
              background: "linear-gradient(135deg, #15803D 0%, #064E20 60%, #0D3B19 100%)",
              minHeight: "200px",
            }}
          >
            {/* Card pattern decoration */}
            <div className="absolute inset-0 opacity-10">
              <svg viewBox="0 0 400 200" className="w-full h-full" preserveAspectRatio="xMidYMid slice">
                <circle cx="320" cy="40" r="120" fill="white" />
                <circle cx="20" cy="160" r="80" fill="white" />
                <path d="M0 100 Q200 0 400 100" fill="none" stroke="white" strokeWidth="2"/>
              </svg>
            </div>

            <div className="relative p-5 text-white">
              {/* University logo area */}
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="text-[9px] font-bold uppercase tracking-[0.15em] text-green-300 mb-1">
                    Федеральное государственное бюджетное образовательное учреждение
                  </div>
                  <div className="text-sm font-black leading-tight">
                    РГАУ-МСХА
                  </div>
                  <div className="text-[10px] font-medium text-green-200 leading-tight">
                    им. К.А. Тимирязева
                  </div>
                </div>
                <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center font-black text-lg">
                  🌿
                </div>
              </div>

              {/* Student info */}
              <div className="mb-3">
                <div className="text-[9px] text-green-300 uppercase tracking-wider mb-0.5">ФИО студента</div>
                <div className="text-base font-black tracking-wide">
                  {name || <span className="opacity-60 italic text-sm font-normal">Введите ФИО ниже</span>}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-4">
                <div>
                  <div className="text-[9px] text-green-300 uppercase tracking-wider mb-0.5">Группа</div>
                  <div className="text-sm font-bold">{group}</div>
                </div>
                <div>
                  <div className="text-[9px] text-green-300 uppercase tracking-wider mb-0.5">Курс</div>
                  <div className="text-sm font-bold">{course}</div>
                </div>
              </div>

              {/* Barcode */}
              <div className="bg-white rounded-xl p-3 flex flex-col items-center gap-1">
                <div
                  className="w-full overflow-hidden"
                  style={{ height: "48px" }}
                  dangerouslySetInnerHTML={{ __html: barcodeSvg }}
                />
                <span className="text-xs font-mono font-bold text-gray-800 tracking-widest">
                  {displayId}
                </span>
              </div>
            </div>
          </div>

          {/* Form fields */}
          <div className="space-y-3">
            <div>
              <label className="text-xs font-bold text-muted-fg uppercase tracking-wider mb-1.5 block">
                Ваше ФИО
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Иванов Иван Иванович"
                className="w-full px-3.5 py-3 rounded-xl border border-border bg-card text-sm text-fg placeholder:text-muted-fg focus:outline-none focus:border-primary transition-colors"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-muted-fg uppercase tracking-wider mb-1.5 block">
                Номер студенческого (необязательно)
              </label>
              <input
                value={studentId}
                onChange={(e) => setStudentId(e.target.value.replace(/[^0-9A-Z-]/gi, "").toUpperCase())}
                placeholder="Например: 26001234"
                className="w-full px-3.5 py-3 rounded-xl border border-border bg-card text-sm font-mono text-fg placeholder:text-muted-fg focus:outline-none focus:border-primary transition-colors"
                maxLength={16}
              />
            </div>
          </div>

          {/* QR Code section */}
          <div className="p-4 rounded-2xl bg-muted/60 border border-border/60 flex items-center gap-4">
            <img
              src={qrUrl}
              alt="QR-код студенческого"
              className="w-16 h-16 rounded-xl border border-border/60 bg-white flex-shrink-0"
              loading="lazy"
            />
            <div>
              <p className="text-sm font-bold text-fg mb-0.5">QR-код для входа</p>
              <p className="text-[11px] text-muted-fg leading-relaxed">
                Покажите QR-код на КПП или при входе в библиотеку вместо физического пропуска
              </p>
            </div>
          </div>

          {/* Info */}
          <div className="p-3.5 rounded-xl bg-amber-500/8 border border-amber-500/20">
            <p className="text-[11px] text-amber-700 dark:text-amber-400 leading-relaxed">
              <strong>Примечание:</strong> Это цифровая копия студенческого билета для удобства. Официальная валидация — только физическим документом. JSON-файл совместим с форматом Apple Wallet.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 px-5 py-4 border-t border-border/60 flex gap-3">
          <button
            onClick={handleDownloadJSON}
            disabled={downloading}
            className={`flex-1 py-3.5 rounded-2xl font-bold text-sm transition-all active:scale-[0.98] cursor-pointer shadow-sm ${
              downloaded
                ? "bg-emerald-500 text-white"
                : "bg-primary text-white hover:bg-primary-light"
            }`}
          >
            {downloading ? (
              <span className="flex items-center justify-center gap-2">
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Генерация...
              </span>
            ) : downloaded ? (
              "✓ Готово!"
            ) : (
              <span className="flex items-center justify-center gap-2">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                Скачать Wallet Pass
              </span>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
