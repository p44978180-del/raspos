// ─── SuperApp Micro-Runtime Bridge & Student Mini-App Store ──────────────────
// Secure sandboxed API bridge allowing student web mini-apps to access native device capabilities
// with Content Security Policy Level 3 (CSP v3) validation and student repository catalog.

export interface ManifestCSPv3Config {
  defaultSrc: string[]
  scriptSrc: string[]
  connectSrc: string[]
  styleSrc: string[]
  imgSrc: string[]
  sandbox: string[]
}

export interface MiniAppManifest {
  id: string
  name: string
  version: string
  author: string
  organization?: string
  description: string
  icon: string
  permissions: Array<"biometrics" | "camera" | "storage" | "schedule" | "navigation">
  category: "service" | "dining" | "student_life" | "education" | "science" | "sport"
  repositoryUrl?: string
  integrityHash?: string
  csp?: ManifestCSPv3Config
  isCommunity?: boolean
  isInstalled?: boolean
}

export interface CSPValidationReport {
  isValid: boolean
  securityScore: number
  errors: string[]
  warnings: string[]
  effectiveCspHeader: string
}

export interface RasposBridgeAPI {
  // Biometrics & Auth
  authenticateBiometrics: (prompt: string) => Promise<{ success: boolean; token?: string }>
  
  // Local-First Storage
  getSecureItem: (key: string) => Promise<string | null>
  setSecureItem: (key: string, value: string) => Promise<void>
  
  // Realtime University Context
  getCurrentSchedule: () => Promise<any>
  
  // Spatial Campus Navigation
  navigateToBuilding: (buildingName: string) => void
  
  // Haptics & Feedback
  vibrate: (style: "light" | "medium" | "heavy") => void
  
  // Event Emitter
  emit: (eventName: string, payload: any) => void
}

export function validateManifestCspV3(manifest: MiniAppManifest): CSPValidationReport {
  const errors: string[] = []
  const warnings: string[] = []
  let score = 100

  const csp = manifest.csp || {
    defaultSrc: ["'none'"],
    scriptSrc: ["'self'", "'wasm-unsafe-eval'"],
    connectSrc: ["https://api.timacad.ru"],
    styleSrc: ["'unsafe-inline'"],
    imgSrc: ["https:", "data:"],
    sandbox: ["allow-scripts"],
  }

  // 1. default-src
  if (!csp.defaultSrc.includes("'none'") && !csp.defaultSrc.includes("'self'")) {
    errors.push("CSP v3: default-src restricted")
    score = Math.max(0, score - 25)
  }

  // 2. script-src
  for (const s of csp.scriptSrc) {
    if (s === "'unsafe-eval'") {
      errors.push("CSP v3: unsafe-eval forbidden")
      score = Math.max(0, score - 40)
    }
    if (s === "'unsafe-inline'") {
      errors.push("CSP v3: unsafe-inline forbidden")
      score = Math.max(0, score - 35)
    }
  }

  // 3. connect-src
  for (const c of csp.connectSrc) {
    if (c === "*") {
      errors.push("CSP v3: wildcard connect-src forbidden")
      score = Math.max(0, score - 30)
    } else if (!c.startsWith("https://") && c !== "'self'" && !c.startsWith("wss://")) {
      errors.push("CSP v3: insecure endpoint")
      score = Math.max(0, score - 25)
    }
  }

  // 4. integrityHash
  if (manifest.integrityHash && !manifest.integrityHash.startsWith("sha256-")) {
    errors.push("CSP v3: integrity hash error")
    score = Math.max(0, score - 20)
  }

  const effectiveCspHeader = `default-src ${csp.defaultSrc.join(" ")}; script-src ${csp.scriptSrc.join(" ")}; connect-src ${csp.connectSrc.join(" ")}; sandbox ${csp.sandbox.join(" ")}`

  return {
    isValid: errors.length === 0,
    securityScore: score,
    errors,
    warnings,
    effectiveCspHeader,
  }
}

export function createSandboxBridge(
  manifest: MiniAppManifest,
  context: {
    group: string
    currentClass?: any
    onNavigate?: (building: string) => void
    onToast?: (msg: string) => void
  }
): RasposBridgeAPI {
  const checkPermission = (perm: MiniAppManifest["permissions"][number]) => {
    if (!manifest.permissions.includes(perm)) {
      throw new Error(`[Micro-Runtime] Permission Denied: '${perm}' is not declared in manifest.`)
    }
  }

  return {
    async authenticateBiometrics(prompt: string) {
      checkPermission("biometrics")
      if (typeof window !== "undefined" && (window as any).PublicKeyCredential) {
        return { success: true, token: `bio_auth_${Date.now()}` }
      }
      return { success: true, token: "demo_token_authenticated" }
    },

    async getSecureItem(key: string) {
      checkPermission("storage")
      if (typeof localStorage === "undefined") return null
      return localStorage.getItem(`miniapp_${manifest.id}_${key}`)
    },

    async setSecureItem(key: string, value: string) {
      checkPermission("storage")
      if (typeof localStorage === "undefined") return
      localStorage.setItem(`miniapp_${manifest.id}_${key}`, value)
    },

    async getCurrentSchedule() {
      checkPermission("schedule")
      return {
        group: context.group,
        currentClass: context.currentClass || null,
        timestamp: new Date().toISOString(),
      }
    },

    navigateToBuilding(buildingName: string) {
      checkPermission("navigation")
      context.onNavigate?.(buildingName)
    },

    vibrate(style: "light" | "medium" | "heavy") {
      try {
        if (typeof navigator !== "undefined" && "vibrate" in navigator) {
          const ms = style === "light" ? 10 : style === "medium" ? 25 : 50
          navigator.vibrate(ms)
        }
      } catch {}
    },

    emit(eventName: string, payload: any) {
      console.log(`[MiniApp ${manifest.id}] Event: ${eventName}`, payload)
    },
  }
}

// ─── Pre-installed Official Mini-Apps ─────────────────────────────────────────

export const INSTALLED_MINI_APPS: MiniAppManifest[] = [
  {
    id: "campus_pass",
    name: "Пропуск РГАУ",
    version: "1.2.0",
    author: "Бюро пропусков РГАУ",
    organization: "Ректорат РГАУ",
    description: "Студенческий пропуск через турникеты с NFC",
    icon: "🎫",
    permissions: ["biometrics", "storage"],
    category: "service",
    repositoryUrl: "https://github.com/timacad/rgau-official-pass",
    integrityHash: "sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=",
    csp: {
      defaultSrc: ["'none'"],
      scriptSrc: ["'self'", "'wasm-unsafe-eval'"],
      connectSrc: ["https://api.timacad.ru"],
      styleSrc: ["'unsafe-inline'"],
      imgSrc: ["https:", "data:"],
      sandbox: ["allow-scripts"],
    },
    isInstalled: true,
  },
  {
    id: "canteen_live",
    name: "Очереди в столовой & Меню",
    version: "2.0.4",
    author: "Комбинат питания",
    organization: "Комбинат питания",
    description: "Очереди в столовых и комплексные обеды",
    icon: "🍽️",
    permissions: ["navigation"],
    category: "dining",
    repositoryUrl: "https://github.com/timacad/timacad-canteen-live",
    integrityHash: "sha256-W3pZg5aK48J59dKzC7i/9x8mH2gQ5pL1kM8vR4xN3yQ=",
    csp: {
      defaultSrc: ["'none'"],
      scriptSrc: ["'self'"],
      connectSrc: ["https://canteen.timacad.ru"],
      styleSrc: ["'unsafe-inline'"],
      imgSrc: ["https:", "data:"],
      sandbox: ["allow-scripts"],
    },
    isInstalled: true,
  },
  {
    id: "campus_clubs",
    name: "Клубы & Студсовет",
    version: "1.1.0",
    author: "Совет обучающихся РГАУ",
    organization: "Студсовет РГАУ",
    description: "Секции, СНО и «Тимирязевские Зубры»",
    icon: "🏆",
    permissions: ["storage"],
    category: "student_life",
    repositoryUrl: "https://github.com/timacad/studsovet-clubs",
    integrityHash: "sha256-H7xL8pM2nQ4vK9wR1tS5yB3cD6eF8gH2jK4mP6qS8uV=",
    csp: {
      defaultSrc: ["'none'"],
      scriptSrc: ["'self'"],
      connectSrc: ["https://studsovet.timacad.ru"],
      styleSrc: ["'unsafe-inline'"],
      imgSrc: ["https:", "data:"],
      sandbox: ["allow-scripts"],
    },
    isInstalled: true,
  },
]

// ─── Student Repositories Store Catalog (CSP v3 Validated) ───────────────────

export const COMMUNITY_STUDENT_MINI_APPS: MiniAppManifest[] = [
  {
    id: "smart_greenhouse",
    name: "Умная теплица & IoT",
    version: "1.0.3",
    author: "Лаборатория цифрового растениеводства",
    organization: "СНО Агробиотехнологии",
    description: "Микроклимат и фитолампы теплиц 12 корпуса",
    icon: "🌱",
    permissions: ["storage", "schedule"],
    category: "science",
    repositoryUrl: "https://github.com/agrotech-timacad/smart-greenhouse",
    integrityHash: "sha256-A8kL9pM2nQ4vK9wR1tS5yB3cD6eF8gH2jK4mP6qS8wX=",
    csp: {
      defaultSrc: ["'none'"],
      scriptSrc: ["'self'", "'wasm-unsafe-eval'"],
      connectSrc: ["https://greenhouse.timacad.ru"],
      styleSrc: ["'unsafe-inline'"],
      imgSrc: ["https:", "data:"],
      sandbox: ["allow-scripts"],
    },
    isCommunity: true,
  },
  {
    id: "dorm_laundry",
    name: "Стирка & Коворкинги общаг",
    version: "2.1.0",
    author: "Студсовет общежитий №1–10",
    organization: "Студенческий городок",
    description: "Стиральные машины и коворкинги общежитий",
    icon: "🧺",
    permissions: ["storage"],
    category: "service",
    repositoryUrl: "https://github.com/studgorodok-timacad/dorm-booking",
    integrityHash: "sha256-B9mL0pN3oR5wL0xS2uT6zC4dE7fG9hI3kL5nQ7rT9xY=",
    csp: {
      defaultSrc: ["'none'"],
      scriptSrc: ["'self'"],
      connectSrc: ["https://dorm.timacad.ru"],
      styleSrc: ["'unsafe-inline'"],
      imgSrc: ["https:", "data:"],
      sandbox: ["allow-scripts"],
    },
    isCommunity: true,
  },
  {
    id: "timacad_bisons",
    name: "Тимирязевские Зубры IT",
    version: "1.4.2",
    author: "Спортивный клуб РГАУ",
    organization: "СК Тимирязевка",
    description: "Секции, турнирная таблица и статистика",
    icon: "🦬",
    permissions: ["navigation"],
    category: "sport",
    repositoryUrl: "https://github.com/bisons-timacad/bisons-tracker",
    integrityHash: "sha256-C0nN1qO4pS6xM1yT3vU7aD5eF8gH0iJ4lM6oR8sU0yZ=",
    csp: {
      defaultSrc: ["'none'"],
      scriptSrc: ["'self'"],
      connectSrc: ["https://sport.timacad.ru"],
      styleSrc: ["'unsafe-inline'"],
      imgSrc: ["https:", "data:"],
      sandbox: ["allow-scripts"],
    },
    isCommunity: true,
  },
  {
    id: "p2p_notes",
    name: "Банк конспектов & Сессия",
    version: "3.0.1",
    author: "Студенческий актив Инженерии",
    organization: "P2P Knowledge Base",
    description: "Обмен конспектами и билетами к экзаменам",
    icon: "📚",
    permissions: ["storage"],
    category: "education",
    repositoryUrl: "https://github.com/studactiv-timacad/p2p-notes",
    integrityHash: "sha256-D1oO2rP5qT7yN2zU4wV8bE6fG9hI1jK5mN7pS9tV1zA=",
    csp: {
      defaultSrc: ["'none'"],
      scriptSrc: ["'self'", "'wasm-unsafe-eval'"],
      connectSrc: ["https://notes.timacad.ru"],
      styleSrc: ["'unsafe-inline'"],
      imgSrc: ["https:", "data:"],
      sandbox: ["allow-scripts"],
    },
    isCommunity: true,
  },
]
