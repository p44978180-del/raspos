import { useState, useRef, useEffect } from "react"
import IosInstallPrompt, {
  isStandaloneMode,
  isRealMobileOrStandalone,
  isIosDevice,
  isIPadDevice,
  getIosBrowserType,
} from "./components/IosInstallPrompt"
import CampusBadge, {
  CampusPlanViewer,
  CampusMapPinMarker,
  CAMPUS_PLAN_MARKERS,
  ALL_CAMPUS_MARKERS,
  type PinCategory,
} from "./components/CampusMapPins"
import officialScheduleData from "./data/official-schedule.json"
import BellScheduleSheet, { getCurrentBellStatus } from "./components/BellScheduleSheet"
import PdfUploadModal from "./components/PdfUploadModal"
import { OFFICIAL_BELLS, type ParsedGroupResult } from "./utils/timacadPdfParser"
import TimacadSyncModal from "./components/TimacadSyncModal"
import {
  initDailySyncWatcher,
  runTimacadDailySync,
  formatSyncDisplayTime,
  getCachedTimacadFeed,
  getCachedSchedule,
  SYNC_EVENT_NAME,
  SCHEDULE_UPDATED_EVENT,
  type SyncResult,
} from "./utils/timacadAutoSync"
import { OFFICIAL_TIMACAD_SOURCES } from "./data/officialSources"
import { OFFICIAL_TIMACAD_FEED, type TimacadFeedItem } from "./data/timacadFeedData"
import {
  getStorageUsageBytes,
  clearUserCache,
  formatBytes,
  performCacheGarbageCollection,
  CACHE_CLEARED_EVENT,
  type StorageUsageInfo,
} from "./utils/cacheManager"

// ─── Types ────────────────────────────────────────────────────────────────────

type ClassType = "lecture" | "practice" | "lab"
type UserRole = "student" | "headstudent"
type FoodFilter = "all" | "canteen" | "cafe" | "supermarket" | "open"
type EventCat = "all" | "news" | "announcement" | "faculty" | "science" | "sport" | "profcom" | "career"
type SubgroupPref = "1" | "2" | "all"

interface ClassItem {
  id: number
  num: number
  start: string
  end: string
  subject: string
  type: ClassType
  teacher: string
  building: string
  room: string
  subgroup?: 1 | 2
  weekType?: "all" | "odd" | "even"
}
interface DaySchedule {
  date: string
  weekday: string
  classes: ClassItem[]
}
interface Homework {
  classId: number
  text: string
  deadline: string
  link?: string
  linkLabel?: string
  author: string
  updatedAt: string
}
interface TodoItem {
  id: number
  text: string
  done: boolean
}
interface PersonalNote {
  classId: number
  todos: TodoItem[]
}
interface KonspektFile {
  name: string
  size: string
  date: string
}
interface KonspektEntry {
  text: string
  files: KonspektFile[]
}
interface AppEvent {
  id: number
  title: string
  date: string
  place: string
  category: EventCat
  summary?: string
  sourceName?: string
  sourceUrl?: string
  isPinned?: boolean
  badgeText?: string
}
interface FoodSpot {
  id: number
  name: string
  building?: string
  proximity?: string
  openFrom: number
  openTo: number
  avgCheck: string
  type: "canteen" | "buffet" | "cafe" | "supermarket"
  mapQuery: string
}
interface ClassEdit {
  building?: string
  room?: string
  teacher?: string
  cancelled?: boolean
  cancelReason?: string
  cancelNote?: string
  startOverride?: string
  endOverride?: string
  dayOverride?: string
  numOverride?: number
  displacedNote?: string
}
interface DisciplineInfo {
  department: string
  email: string
  consultations: string
  exam: string
  materials: { name: string; url: string; type: string }[]
  literature: {
    title: string
    author: string
    year: number
    url: string
    library: string
  }[]
}
interface MovedInEntry {
  cls: ClassItem
  fromWeekday: string
}


// --- NEW COMPONENTS ---
function ScheduleSkeleton() {
  return (
    <div className="space-y-3 p-4">
      {[1,2,3,4].map(i => (
        <div key={i} className="animate-pulse rounded-2xl bg-card p-4 space-y-2" style={{animationDelay: `${i*80}ms`}}>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-border/40" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-3/4 rounded bg-border/40" />
              <div className="h-3 w-1/2 rounded bg-border/30" />
            </div>
          </div>
          <div className="h-3 w-2/3 rounded bg-border/20 mt-2" />
        </div>
      ))}
    </div>
  )
}

function CampusSkeleton() {
  return (
    <div className="animate-pulse rounded-2xl bg-card mx-4 mt-4" style={{height: '260px'}}>
      <div className="w-full h-full rounded-2xl bg-border/30" />
    </div>
  )
}

function EmptyDayState({ weekday }: { weekday: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="text-6xl mb-4">🎉</div>
      <h3 className="text-xl font-bold text-foreground mb-2">Свободный день!</h3>
      <p className="text-muted text-sm max-w-xs">
        На {weekday.toLowerCase()} нет запланированных занятий. Отличное время для самоподготовки или отдыха.
      </p>
    </div>
  )
}

function EmptySearchState({ query }: { query: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
      <div className="text-5xl mb-3">🔍</div>
      <h3 className="text-lg font-semibold text-foreground mb-1">Ничего не найдено</h3>
      <p className="text-muted text-sm">По запросу «{query}» ничего не нашлось. Попробуйте изменить запрос.</p>
    </div>
  )
}

function EmptyHomeworkState() {
  return (
    <div className="flex flex-col items-center py-10 text-center">
      <div className="text-5xl mb-3">📚</div>
      <h3 className="text-lg font-semibold text-foreground mb-1">Заданий пока нет</h3>
      <p className="text-muted text-sm">Домашние задания появятся здесь, когда их добавит староста.</p>
    </div>
  )
}

function haptic(style: 'light' | 'medium' | 'heavy' = 'light') {
  try {
    if ('vibrate' in navigator) {
      const ms = style === 'light' ? 10 : style === 'medium' ? 20 : 40;
      navigator.vibrate(ms);
    }
  } catch {}
}

function PullIndicator({ pulling, progress }: { pulling: boolean; progress: number }) {
  if (!pulling && progress <= 0) return null;
  return (
    <div className="flex justify-center py-3 transition-all" style={{ opacity: Math.min(1, progress / 60) }}>
      <div className={`w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full ${pulling ? 'animate-spin' : ''}`} 
           style={{ transform: `rotate(${progress * 3}deg)` }} />
    </div>
  )
}

function StatBubble({ emoji, label, count, color }: { emoji: string, label: string, count: number, color: string }) {
  return (
    <div className={`flex flex-col items-center p-2 rounded-xl ${color}`}>
      <span className="text-xl mb-1">{emoji}</span>
      <span className="text-xs font-semibold">{count}</span>
      <span className="text-[10px] text-muted-fg opacity-80 uppercase tracking-wider">{label}</span>
    </div>
  )
}

function WeekStats({ weekSchedule }: { weekSchedule: DaySchedule[] }) {
  const totalClasses = weekSchedule.reduce((sum, d) => sum + d.classes.length, 0);
  const lectureCount = weekSchedule.reduce((sum, d) => sum + d.classes.filter(c => c.type === 'lecture').length, 0);
  const practiceCount = weekSchedule.reduce((sum, d) => sum + d.classes.filter(c => c.type === 'practice').length, 0);
  const labCount = totalClasses - lectureCount - practiceCount;
  
  return (
    <div className="bg-card rounded-2xl p-4 mx-4 mb-4">
      <h3 className="font-semibold text-foreground mb-3">📊 Моя неделя</h3>
      <div className="grid grid-cols-3 gap-3">
        <StatBubble emoji="📖" label="Лекций" count={lectureCount} color="bg-emerald-50 dark:bg-emerald-900/20" />
        <StatBubble emoji="⚗️" label="Практик" count={practiceCount} color="bg-amber-50 dark:bg-amber-900/20" />
        <StatBubble emoji="🔬" label="Лабор." count={labCount} color="bg-blue-50 dark:bg-blue-900/20" />
      </div>
      <div className="mt-3 h-2 rounded-full bg-border/20 overflow-hidden flex">
        <div className="bg-emerald-500 h-full" style={{width: `${(lectureCount/Math.max(1,totalClasses))*100}%`}} />
        <div className="bg-amber-500 h-full" style={{width: `${(practiceCount/Math.max(1,totalClasses))*100}%`}} />
        <div className="bg-blue-500 h-full" style={{width: `${(labCount/Math.max(1,totalClasses))*100}%`}} />
      </div>
    </div>
  )
}

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}
// --- END NEW COMPONENTS ---

// ─── Constants ────────────────────────────────────────────────────────────────

const TODAY = new Date().toISOString().split("T")[0]
// Legacy aliases kept for backward compat in initial renders
const SIM_TODAY = TODAY

const WALK_TIMES: Record<string, Record<string, number>> = {
  corp1: { corp1: 0, agrochem: 5, engineering: 8, sport: 10, station: 15 },
  agrochem: { corp1: 5, agrochem: 0, engineering: 10, sport: 12, station: 12 },
  engineering: {
    corp1: 8,
    agrochem: 10,
    engineering: 0,
    sport: 6,
    station: 18,
  },
  sport: { corp1: 10, agrochem: 12, engineering: 6, sport: 0, station: 20 },
  station: { corp1: 15, agrochem: 12, engineering: 18, sport: 20, station: 0 },
}
const BIDS: Record<string, string> = {
  "1-й учебный корпус": "corp1",
  "2-й учебный корпус": "corp2",
  "3-й учебный корпус": "corp3",
  "4-й учебный корпус": "corp4",
  "Корпус агрохимии": "agrochem",
  "Корпус агрохимии (6-й)": "agrochem",
  "8-й учебный корпус": "corp8",
  "9-й учебный корпус": "corp9",
  "12-й учебный корпус": "corp12",
  "Биологический корпус (16-й)": "bio16",
  "Биологический корпус": "bio16",
  "17-й корпус (Почвенно-агрономический)": "soil17",
  "18-й корпус (Метеорологический)": "meteo18",
  "26-й учебный корпус": "corp26",
  "27-й корпус (Лингвистический центр)": "ling27",
  "Инженерный корпус (28-й)": "engineering",
  "Инженерный корпус": "engineering",
  "28-й учебный корпус (Инженерный)": "engineering",
  "29-й корпус (Цифровой центр)": "digital29",
  "29-й учебный корпус (Цифровой центр)": "digital29",
  "37-й корпус (Биотехнология)": "biotech37",
  "Центральная научная библиотека": "lib",
  "Центральная научная библиотека (ЦНБ)": "lib",
  "ЦНБ": "lib",
  "Студенческий городок (Общежития)": "dorms",
  "Студенческий городок": "dorms",
  "Общежития": "dorms",
  "Спортивный комплекс": "sport",
  "Спортивный комплекс (СОК РГАУ)": "sport",
  "СК": "sport",
  "Учебно-опытная станция": "station",
}

const BGEN: Record<string, string> = {
  "1-й учебный корпус": "1-го учебного корпуса",
  "2-й учебный корпус": "2-го учебного корпуса",
  "3-й учебный корпус": "3-го учебного корпуса",
  "4-й учебный корпус": "4-го учебного корпуса",
  "Корпус агрохимии": "корпуса агрохимии",
  "Корпус агрохимии (6-й)": "корпуса агрохимии (6-го)",
  "8-й учебный корпус": "8-го учебного корпуса",
  "9-й учебный корпус": "9-го учебного корпуса",
  "12-й учебный корпус": "12-го учебного корпуса",
  "Биологический корпус (16-й)": "биологического корпуса (16-го)",
  "Биологический корпус": "биологического корпуса",
  "17-й корпус (Почвенно-агрономический)": "17-го почвенного корпуса",
  "18-й корпус (Метеорологический)": "18-го метеорологического корпуса",
  "26-й учебный корпус": "26-го учебного корпуса",
  "27-й корпус (Лингвистический центр)": "27-го лингвистического корпуса",
  "Инженерный корпус (28-й)": "инженерного корпуса (28-го)",
  "Инженерный корпус": "инженерного корпуса",
  "28-й учебный корпус (Инженерный)": "инженерного корпуса (28-го)",
  "29-й корпус (Цифровой центр)": "29-го цифрового корпуса",
  "29-й учебный корпус (Цифровой центр)": "29-го цифрового корпуса",
  "37-й корпус (Биотехнология)": "37-го корпуса биотехнологии",
  "Центральная научная библиотека (ЦНБ)": "Центральной научной библиотеки (ЦНБ)",
  "ЦНБ": "ЦНБ",
  "Студенческий городок (Общежития)": "студгородка",
  "Студенческий городок": "студгородка",
  "Общежития": "студгородка",
  "Спортивный комплекс": "спортивного комплекса",
  "Спортивный комплекс (СОК РГАУ)": "спортивного комплекса",
  "СК": "спортивного комплекса",
  "Учебно-опытная станция": "учебно-опытной станции",
}

function getBldgGenitive(name: string): string {
  if (!name) return ""
  if (BGEN[name]) return BGEN[name]
  for (const [k, v] of Object.entries(BGEN)) {
    if (name.includes(k) || k.includes(name)) return v
  }
  if (/агрохим|6-й/i.test(name)) return "корпуса агрохимии (6-го)"
  if (/16-й|биолог/i.test(name)) return "биологического корпуса (16-го)"
  if (/17-й|почв/i.test(name)) return "17-го почвенного корпуса"
  if (/18-й|метео/i.test(name)) return "18-го метеорологического корпуса"
  if (/26-й/i.test(name)) return "26-го учебного корпуса"
  if (/27-й|лингв/i.test(name)) return "27-го лингвистического корпуса"
  if (/28-й|инженер/i.test(name)) return "инженерного корпуса (28-го)"
  if (/29-й|цифр/i.test(name)) return "29-го цифрового корпуса"
  if (/37-й|биотех/i.test(name)) return "37-го корпуса биотехнологии"
  if (/8-й/i.test(name)) return "8-го учебного корпуса"
  if (/цнб|библиотек/i.test(name)) return "Центральной научной библиотеки"
  if (/общежит|студгород/i.test(name)) return "студгородка"
  if (/спорт|СК/i.test(name)) return "спортивного комплекса"
  if (/станци|опытн/i.test(name)) return "учебно-опытной станции"
  return name
}

function normalizeBldg(name: string): string {
  if (!name) return ""
  if (BIDS[name]) return BIDS[name]
  for (const [k, v] of Object.entries(BIDS)) {
    if (name.includes(k) || k.includes(name)) return v
  }
  if (/агрохим|6-й/i.test(name)) return "agrochem"
  if (/16-й|биолог/i.test(name)) return "bio16"
  if (/17-й|почв/i.test(name)) return "soil17"
  if (/18-й|метео/i.test(name)) return "meteo18"
  if (/26-й/i.test(name)) return "corp26"
  if (/27-й|лингв/i.test(name)) return "ling27"
  if (/28-й|инженер/i.test(name)) return "engineering"
  if (/29-й|цифр/i.test(name)) return "digital29"
  if (/37-й|биотех/i.test(name)) return "biotech37"
  if (/8-й/i.test(name)) return "corp8"
  if (/цнб|библиотек/i.test(name)) return "lib"
  if (/общежит|студгород/i.test(name)) return "dorms"
  if (/спорт|СК/i.test(name)) return "sport"
  if (/станци|опытн/i.test(name)) return "station"
  if (/1-й/i.test(name)) return "corp1"
  if (/2-й/i.test(name)) return "corp2"
  if (/3-й/i.test(name)) return "corp3"
  if (/4-й/i.test(name)) return "corp4"
  if (/9-й/i.test(name)) return "corp9"
  if (/12-й/i.test(name)) return "corp12"
  return name.trim().toLowerCase()
}

const DORMS = [
  "Не указано",
  "Общежитие №1",
  "Общежитие №2",
  "Общежитие №6",
  "Общежитие №8",
  "Общежитие №10",
]
const DORM_WALK: Record<string, { building: string; min: number }> = {
  "Общежитие №1": { building: "1-й учебный корпус", min: 7 },
  "Общежитие №2": { building: "1-й учебный корпус", min: 5 },
  "Общежитие №6": { building: "Корпус агрохимии", min: 8 },
  "Общежитие №8": { building: "Корпус агрохимии", min: 10 },
  "Общежитие №10": { building: "Инженерный корпус", min: 12 },
}

const OFFICIAL_GROUP_KEYS = Object.keys((officialScheduleData as any).groups || {})
const RGAU_GROUPS = Array.from(
  new Set([
    ...OFFICIAL_GROUP_KEYS,
    ...Object.keys((getCachedSchedule()?.groups || {})),
  ])
).sort((a, b) => a.localeCompare(b, "ru"))
const RGAU_TEACHERS = [
  "Темчук Е.И.",
  "Ксенофонтов И.А.",
  "Елисеева О.В.",
  "Грачев А.Б.",
  "Мякшин Н.А.",
  "Пронина Г.И.",
  "Шайтура Н.С.",
  "Стрыгин С.П.",
  "Каменных Н.Л.",
  "Ильин П.С.",
  "Лосева К.А.",
  "Упадышев М.Т.",
  "Матушкина К.А.",
  "Арешин А.В.",
  "Глазунова О.А.",
  "Волков С.Г.",
  "Дудченко О.С.",
  "Синицына И.А.",
  "Миронова Е.Е.",
  "Проф. Иванова М.С.",
  "Доц. Петров А.Н.",
  "Проф. Смирнов Г.К.",
]

const DISCIPLINE_DATA: Record<string, DisciplineInfo> = {
  Агрохимия: {
    department: "Кафедра агрохимии и биохимии растений",
    email: "ivanova@timacad.ru",
    consultations: "Вт 14:00–16:00, корп. агрохимии, ауд. 214",
    exam: "Экзамен в зимнюю сессию",
    materials: [
      {
        name: "Методичка по лаб. работам №1–4",
        url: "https://disk.yandex.ru/",
        type: "pdf",
      },
      {
        name: "Конспект лекций §1–5",
        url: "https://disk.yandex.ru/",
        type: "doc",
      },
    ],
    literature: [
      {
        title: "Агрохимия",
        author: "Минеев В.Г.",
        year: 2004,
        url: "https://e.lanbook.com/",
        library: "ЭБС Лань",
      },
      {
        title: "Практикум по агрохимии",
        author: "Минеев В.Г.",
        year: 2001,
        url: "https://e.lanbook.com/",
        library: "ЭБС Лань",
      },
    ],
  },
  "Земледелие и растениеводство": {
    department: "Кафедра земледелия и МОС",
    email: "petrov@timacad.ru",
    consultations: "Ср 11:00–13:00, УК-1, ауд. Б-112",
    exam: "Зачёт с оценкой",
    materials: [
      {
        name: "Атлас болезней растений",
        url: "https://disk.yandex.ru/",
        type: "pdf",
      },
    ],
    literature: [
      {
        title: "Земледелие",
        author: "Пупонин А.И.",
        year: 2002,
        url: "https://e.lanbook.com/",
        library: "ЭБС Лань",
      },
    ],
  },
}
function getDefaultDiscipline(subject: string): DisciplineInfo {
  return (
    DISCIPLINE_DATA[subject] ?? {
      department: "Кафедра — уточните у преподавателя",
      email: "",
      consultations: "—",
      exam: "Уточните у преподавателя",
      materials: [],
      literature: [],
    }
  )
}

// ─── Mock Data ────────────────────────────────────────────────────────────────

const FOOD_SPOTS: FoodSpot[] = [
  {
    id: 1,
    name: "Столовая УК-1",
    building: "1-й учебный корпус",
    openFrom: 9 * 60,
    openTo: 17 * 60,
    avgCheck: "200–350 ₽",
    type: "canteen",
    mapQuery: "Столовая+РГАУ+МСХА+Тимирязевская+49",
  },
  {
    id: 2,
    name: "Буфет «Зерно»",
    building: "1-й учебный корпус",
    openFrom: 8 * 60,
    openTo: 19 * 60,
    avgCheck: "100–200 ₽",
    type: "buffet",
    mapQuery: "РГАУ+МСХА+1+учебный+корпус+Тимирязевская+49",
  },
  {
    id: 3,
    name: "Кафе «Тимирязев»",
    building: "Корпус агрохимии",
    openFrom: 8 * 60 + 30,
    openTo: 16 * 60,
    avgCheck: "250–400 ₽",
    type: "cafe",
    mapQuery: "Корпус+агрохимии+РГАУ+Тимирязевская+55",
  },
  {
    id: 4,
    name: "Буфет Инженерного",
    building: "Инженерный корпус",
    openFrom: 9 * 60,
    openTo: 15 * 60,
    avgCheck: "120–250 ₽",
    type: "buffet",
    mapQuery: "Инженерный+корпус+РГАУ+Тимирязевская+58",
  },
  {
    id: 5,
    name: "Столовая Спорткомплекса",
    building: "Спортивный комплекс",
    openFrom: 10 * 60,
    openTo: 18 * 60,
    avgCheck: "180–300 ₽",
    type: "canteen",
    mapQuery: "Спортивный+комплекс+РГАУ+Тимирязевская+44",
  },
  {
    id: 6,
    name: "ВкусВилл",
    proximity: "3 мин от УК-1",
    openFrom: 8 * 60,
    openTo: 22 * 60,
    avgCheck: "200–500 ₽",
    type: "supermarket",
    mapQuery: "ВкусВилл+Тимирязевская+улица+Москва",
  },
  {
    id: 7,
    name: "Магнит",
    proximity: "5 мин от УК-1",
    openFrom: 7 * 60,
    openTo: 23 * 60,
    avgCheck: "100–300 ₽",
    type: "supermarket",
    mapQuery: "Магнит+Тимирязевская+улица+Москва",
  },
  {
    id: 8,
    name: "Шаурма у Ашота",
    proximity: "2 мин от Инж. корп.",
    openFrom: 10 * 60,
    openTo: 20 * 60,
    avgCheck: "200–350 ₽",
    type: "cafe",
    mapQuery: "Шаурма+Тимирязевская+улица+Москва",
  },
  {
    id: 9,
    name: "Кофе-бар «Зёрна»",
    proximity: "4 мин от Агрохим.",
    openFrom: 8 * 60,
    openTo: 18 * 60,
    avgCheck: "150–300 ₽",
    type: "cafe",
    mapQuery: "Кофе+Тимирязевская+улица+Москва",
  },
]

const BASE_EXTRA_EVENTS: AppEvent[] = [
  {
    id: 1,
    title: "День открытых дверей агрофака",
    date: "2026-09-07",
    place: "Актовый зал, УК-1",
    category: "faculty",
    summary: "Презентация программ бакалавриата и магистратуры, встреча с деканом и заведующими кафедрами.",
    sourceName: "Деканат агрофака",
    sourceUrl: "https://www.timacad.ru",
  },
  {
    id: 2,
    title: "Олимпиада по агрохимии",
    date: "2026-09-12",
    place: "Корпус агрохимии",
    category: "science",
    summary: "Университетский этап всероссийской олимпиады по почвоведению и агрохимии.",
    sourceName: "Кафедра агрохимии",
    sourceUrl: "https://www.timacad.ru/science",
  },
  {
    id: 3,
    title: "Спортивный день РГАУ",
    date: "2026-09-19",
    place: "Спортивный комплекс",
    category: "sport",
    summary: "Межфакультетские соревнования по волейболу, мини-футболу и настольному теннису.",
    sourceName: "ССК «Тимирязевские Зубры»",
    sourceUrl: "https://www.timacad.ru/life/sport",
  },
  {
    id: 4,
    title: "Студенческая конференция АПК",
    date: "2026-09-25",
    place: "УК-1, ауд. Б-201",
    category: "science",
    summary: "Пленарное заседание секций молодых исследователей и инноваций в сельском хозяйстве.",
    sourceName: "СНО РГАУ-МСХА",
    sourceUrl: "https://www.timacad.ru/science",
  },
  {
    id: 5,
    title: "Осенний кросс по территории",
    date: "2026-10-03",
    place: "Стадион МСХА",
    category: "sport",
    summary: "Забеги на дистанции 1 000 м и 3 000 м в Тимирязевском лесопарке.",
    sourceName: "Кафедра физкультуры",
    sourceUrl: "https://www.timacad.ru/life/sport",
  },
  {
    id: 6,
    title: "Открытая лекция по биотехнологиям",
    date: "2026-09-13",
    place: "Корпус агрохимии, ауд. 118",
    category: "science",
    summary: "Лекция ведущего научного сотрудника о генетическом редактировании и микроклональном размножении растений.",
    sourceName: "Институт агробиотехнологии",
    sourceUrl: "https://www.timacad.ru",
  },
]

function getAppEvents(feed: TimacadFeedItem[] = getCachedTimacadFeed()): AppEvent[] {
  const official: AppEvent[] = feed.map((item, idx) => ({
    id: 100 + idx,
    title: item.title,
    date: item.date,
    place: item.place || "Кампус РГАУ-МСХА",
    category: item.category as EventCat,
    summary: item.summary,
    sourceName: item.sourceName,
    sourceUrl: item.sourceUrl,
    isPinned: item.isPinned,
    badgeText: item.badgeText,
  }))
  return [...official, ...BASE_EXTRA_EVENTS]
}

const EVENTS: AppEvent[] = getAppEvents()

const INIT_HOMEWORK: Homework[] = [
  {
    classId: 1,
    text: "Законспектировать §4–5 учебника Минеева В.Г. Вопросы по ионообменным свойствам выписать отдельно.",
    deadline: "14 сентября, 08:30",
    link: "https://disk.yandex.ru/",
    linkLabel: "Методичка на Яндекс.Диске",
    author: "Анна К. (Староста)",
    updatedAt: "06.09 в 18:30",
  },
  {
    classId: 4,
    text: "Оформить отчёт по лаб. работе №2 «Определение влажности почвы».",
    deadline: "11 сентября, 14:30",
    link: "https://disk.yandex.ru/",
    linkLabel: "Образец отчёта",
    author: "Анна К. (Старостa)",
    updatedAt: "05.09 в 20:15",
  },
]
const INIT_PERSONAL: PersonalNote[] = [
  {
    classId: 2,
    todos: [
      { id: 1, text: "Взять тетрадь для практик", done: false },
      { id: 2, text: "Спросить Петрова про зачёт", done: false },
    ],
  },
]

function buildSchedule(
  groupId: string = "ДА 01-26",
  customSchedule?: DaySchedule[],
): DaySchedule[] {
  if (customSchedule && customSchedule.length > 0) {
    return customSchedule
  }

  // Check localStorage for custom schedule uploaded by headstudent
  try {
    if (typeof localStorage !== "undefined") {
      const saved = localStorage.getItem(`timacad_custom_sched_${groupId}`)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed
        }
      }
    }
  } catch {}

  const WEEK_DATES: Record<string, string> = {
    Понедельник: "2026-09-07",
    Вторник: "2026-09-08",
    Среда: "2026-09-09",
    Четверг: "2026-09-10",
    Пятница: "2026-09-11",
    Суббота: "2026-09-12",
    Воскресенье: "2026-09-13",
  }

  // Check if official synced schedule from timacad.ru has this group
  const activeSchedule = getCachedSchedule()
  const officialGroup =
    ((activeSchedule?.groups || {}) as Record<string, any>)[groupId] ||
    ((officialScheduleData.groups || {}) as Record<string, any>)[groupId]
  if (officialGroup && Array.isArray(officialGroup.schedule)) {
    const baseWeek: DaySchedule[] = []
    officialGroup.schedule.forEach((day: any) => {
      baseWeek.push({
        date: WEEK_DATES[day.weekday] || "2026-09-07",
        weekday: day.weekday,
        classes: day.classes.map((c: any) => {
          const bell = OFFICIAL_BELLS[c.num] || { start: c.start, end: c.end }
          return {
            id: c.id,
            num: c.num,
            start: bell.start,
            end: bell.end,
            subject: c.subject,
            type: c.type,
            teacher: c.teacher,
            building: c.building,
            room: c.room,
            subgroup: c.subgroup,
            weekType: c.weekType || "all",
          }
        }),
      })
    })
    baseWeek.push({ date: "2026-09-13", weekday: "Воскресенье", classes: [] })

    const result = [...baseWeek]
    for (let w = 1; w <= 24; w++) {
      baseWeek.forEach((day) => {
        const b = new Date(day.date + "T00:00:00")
        b.setDate(b.getDate() + w * 7)
        result.push({
          ...day,
          classes: day.classes.map((c: any) => ({
            ...c,
            id: c.id + w * 10000,
          })),
          date: `${b.getFullYear()}-${String(b.getMonth() + 1).padStart(2, "0")}-${String(b.getDate()).padStart(2, "0")}`,
        })
      })
    }
    return result
  }

  const baseWeek: DaySchedule[] = [
    {
      date: "2026-09-07",
      weekday: "Понедельник",
      classes: [
        {
          id: 1,
          num: 1,
          start: "08:30",
          end: "10:05",
          subject: "ФТД: Информатика",
          type: "practice",
          teacher: "Мякшин Н.А.",
          building: "29-й корпус (Цифровой центр)",
          room: "ИЦ-2",
          subgroup: 1,
          weekType: "odd",
        },
        {
          id: 102,
          num: 1,
          start: "08:30",
          end: "10:05",
          subject: "Основы российской государственности",
          type: "practice",
          teacher: "Темчук Е.И.",
          building: "17-й корпус (Почвенно-агрономический)",
          room: "207",
          subgroup: 1,
          weekType: "even",
        },
        {
          id: 2,
          num: 2,
          start: "10:20",
          end: "11:55",
          subject: "Неорганическая химия",
          type: "lecture",
          teacher: "Елисеева О.В.",
          building: "Корпус агрохимии (6-й)",
          room: "БХ",
          weekType: "all",
        },
        {
          id: 3,
          num: 3,
          start: "12:25",
          end: "14:00",
          subject: "Основы российской государственности",
          type: "lecture",
          teacher: "Темчук Е.И.",
          building: "29-й корпус (Цифровой центр)",
          room: "218",
          weekType: "all",
        },
        {
          id: 4,
          num: 4,
          start: "14:15",
          end: "15:50",
          subject: "История России",
          type: "practice",
          teacher: "Грачев А.Б.",
          building: "1-й учебный корпус",
          room: "411",
          weekType: "odd",
        },
      ],
    },
    {
      date: "2026-09-08",
      weekday: "Вторник",
      classes: [
        {
          id: 5,
          num: 1,
          start: "08:30",
          end: "10:05",
          subject: "Биология с основами экологии",
          type: "lecture",
          teacher: "Пронина Г.И.",
          building: "Биологический корпус (16-й)",
          room: "БАн",
          weekType: "all",
        },
        {
          id: 6,
          num: 2,
          start: "10:20",
          end: "11:55",
          subject: "Высшая математика",
          type: "lecture",
          teacher: "Шайтура Н.С.",
          building: "12-й учебный корпус",
          room: "Планетарий 1",
          weekType: "all",
        },
        {
          id: 7,
          num: 3,
          start: "12:25",
          end: "14:00",
          subject: "Агрометеорология",
          type: "lab",
          teacher: "Ильин П.С.",
          building: "18-й корпус (Метеорологический)",
          room: "201",
          subgroup: 1,
          weekType: "odd",
        },
        {
          id: 702,
          num: 3,
          start: "12:25",
          end: "14:00",
          subject: "Почвоведение с основами геологии",
          type: "lab",
          teacher: "Лосева К.А.",
          building: "17-й корпус (Почвенно-агрономический)",
          room: "218",
          subgroup: 1,
          weekType: "even",
        },
        {
          id: 8,
          num: 4,
          start: "14:15",
          end: "15:50",
          subject: "КпоВ: Базовые виды спорта / Базовая физкультура",
          type: "practice",
          teacher: "Преп. Волков С.Г.",
          building: "Спортивный комплекс",
          room: "СК Зал №1",
          weekType: "all",
        },
      ],
    },
    {
      date: "2026-09-09",
      weekday: "Среда",
      classes: [
        {
          id: 9,
          num: 1,
          start: "08:30",
          end: "10:05",
          subject: "Почвоведение с основами геологии",
          type: "lecture",
          teacher: "Каменных Н.Л.",
          building: "29-й корпус (Цифровой центр)",
          room: "240",
          weekType: "all",
        },
        {
          id: 10,
          num: 2,
          start: "10:20",
          end: "11:55",
          subject: "Неорганическая химия",
          type: "lab",
          teacher: "Елисеева О.В.",
          building: "Корпус агрохимии (6-й)",
          room: "232",
          subgroup: 1,
          weekType: "odd",
        },
        {
          id: 1002,
          num: 2,
          start: "10:20",
          end: "11:55",
          subject: "Введение в биотехнологию",
          type: "practice",
          teacher: "Упадышев М.Т.",
          building: "37-й корпус (Биотехнология)",
          room: "314",
          subgroup: 1,
          weekType: "even",
        },
        {
          id: 11,
          num: 3,
          start: "12:25",
          end: "14:00",
          subject: "Высшая математика",
          type: "practice",
          teacher: "Шайтура Н.С.",
          building: "12-й учебный корпус",
          room: "225",
          weekType: "all",
        },
      ],
    },
    {
      date: "2026-09-10",
      weekday: "Четверг",
      classes: [
        {
          id: 12,
          num: 1,
          start: "08:30",
          end: "10:05",
          subject: "Иностранный язык",
          type: "practice",
          teacher: "Миронова Е.Е. / Синицына И.А.",
          building: "12-й учебный корпус",
          room: "402 / 208",
          subgroup: 1,
          weekType: "all",
        },
        {
          id: 13,
          num: 2,
          start: "10:20",
          end: "11:55",
          subject: "Геология с основами геоморфологии",
          type: "lecture",
          teacher: "Арешин А.В.",
          building: "17-й корпус (Почвенно-агрономический)",
          room: "БП",
          weekType: "all",
        },
        {
          id: 14,
          num: 3,
          start: "12:25",
          end: "14:00",
          subject: "Биохимия растений",
          type: "lecture",
          teacher: "Глазунова О.А.",
          building: "Корпус агрохимии (6-й)",
          room: "БХ",
          weekType: "odd",
        },
        {
          id: 1402,
          num: 3,
          start: "12:25",
          end: "14:00",
          subject: "Почвоведение с основами геологии",
          type: "lab",
          teacher: "Борисов Б.А.",
          building: "17-й корпус (Почвенно-агрономический)",
          room: "221",
          subgroup: 1,
          weekType: "even",
        },
        {
          id: 15,
          num: 4,
          start: "14:15",
          end: "15:50",
          subject: "КпоВ: Базовые виды спорта / Базовая физкультура",
          type: "practice",
          teacher: "Преп. Волков С.Г.",
          building: "Спортивный комплекс",
          room: "Стадион РГАУ",
          weekType: "all",
        },
      ],
    },
    {
      date: "2026-09-11",
      weekday: "Пятница",
      classes: [
        {
          id: 16,
          num: 1,
          start: "08:30",
          end: "10:05",
          subject: "ФТД: Информатика",
          type: "lecture",
          teacher: "Стрыгин С.П.",
          building: "29-й корпус (Цифровой центр)",
          room: "240",
          weekType: "all",
        },
        {
          id: 17,
          num: 2,
          start: "10:20",
          end: "11:55",
          subject: "История России",
          type: "lecture",
          teacher: "Грачев А.Б.",
          building: "1-й учебный корпус",
          room: "416",
          weekType: "all",
        },
        {
          id: 18,
          num: 3,
          start: "12:25",
          end: "14:00",
          subject: "Биохимия растений",
          type: "lab",
          teacher: "Терешенков П.В. / Глазунова О.А.",
          building: "17-й корпус (Почвенно-агрономический)",
          room: "209-210",
          subgroup: 1,
          weekType: "odd",
        },
        {
          id: 1802,
          num: 3,
          start: "12:25",
          end: "14:00",
          subject: "Биология с основами экологии",
          type: "practice",
          teacher: "Сусова Е.Е.",
          building: "Биологический корпус (16-й)",
          room: "219",
          subgroup: 1,
          weekType: "even",
        },
      ],
    },
    {
      date: "2026-09-12",
      weekday: "Суббота",
      classes: [
        {
          id: 19,
          num: 1,
          start: "08:30",
          end: "10:05",
          subject: "КпоВ: Базовые виды спорта / Базовая физкультура",
          type: "practice",
          teacher: "Преп. Волков С.Г.",
          building: "Спортивный комплекс",
          room: "Стадион РГАУ",
          weekType: "all",
        },
      ],
    },
    { date: "2026-09-13", weekday: "Воскресенье", classes: [] },
  ]
  const normalizedBaseWeek = baseWeek.map((day) => ({
    ...day,
    classes: day.classes.map((c) => {
      const bell = OFFICIAL_BELLS[c.num] || { start: c.start, end: c.end }
      return {
        ...c,
        start: bell.start,
        end: bell.end,
      }
    }),
  }))
  const result = [...normalizedBaseWeek]
  for (let w = 1; w <= 24; w++) {
    normalizedBaseWeek.forEach((day) => {
      const b = new Date(day.date + "T00:00:00")
      b.setDate(b.getDate() + w * 7)
      result.push({
        ...day,
        classes: day.classes.map((c) => ({
          ...c,
          id: c.id + w * 10000,
        })),
        date: `${b.getFullYear()}-${String(b.getMonth() + 1).padStart(2, "0")}-${String(b.getDate()).padStart(2, "0")}`,
      })
    })
  }
  return result
}

function convertParsedToDaySchedule(parsed: ParsedGroupResult): DaySchedule[] {
  const WEEK_DATES: Record<string, string> = {
    Понедельник: "2026-09-07",
    Вторник: "2026-09-08",
    Среда: "2026-09-09",
    Четверг: "2026-09-10",
    Пятница: "2026-09-11",
    Суббота: "2026-09-12",
    Воскресенье: "2026-09-13",
  }
  const baseWeek: DaySchedule[] = []
  parsed.days.forEach((d) => {
    baseWeek.push({
      date: WEEK_DATES[d.weekday] || "2026-09-07",
      weekday: d.weekday,
      classes: d.classes.map((c) => {
        const bell = OFFICIAL_BELLS[c.num] || { start: c.start, end: c.end }
        return {
          id: c.id,
          num: c.num,
          start: bell.start,
          end: bell.end,
          subject: c.subject,
          type: c.type,
          teacher: c.teacher,
          building: c.building,
          room: c.room,
          subgroup: c.subgroup,
          weekType: c.weekType,
        }
      }),
    })
  })
  if (!baseWeek.some((d) => d.weekday === "Воскресенье")) {
    baseWeek.push({ date: "2026-09-13", weekday: "Воскресенье", classes: [] })
  }
  const result: DaySchedule[] = [...baseWeek]
  for (let w = 1; w <= 24; w++) {
    baseWeek.forEach((day) => {
      const b = new Date(day.date + "T00:00:00")
      b.setDate(b.getDate() + w * 7)
      result.push({
        ...day,
        classes: day.classes.map((c) => ({
          ...c,
          id: c.id + w * 10000,
        })),
        date: `${b.getFullYear()}-${String(b.getMonth() + 1).padStart(2, "0")}-${String(b.getDate()).padStart(2, "0")}`,
      })
    })
  }
  return result
}

let ALL_DAYS = buildSchedule("ДА 01-26")

// ─── Helpers ──────────────────────────────────────────────────────────────────

const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number)
  return h * 60 + m
}
const fmtDate = (ds: string) =>
  new Date(ds + "T00:00:00").toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  })
function getWeekStart(ds: string) {
  const d = new Date(ds + "T00:00:00")
  d.setDate(d.getDate() - (d.getDay() === 0 ? 6 : d.getDay() - 1))
  return d
}
function fmtYMD(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}
function getStudyWeek(ds: string) {
  const d = new Date(ds + "T00:00:00")
  const sep1 = new Date("2026-09-01T00:00:00")
  const dow = sep1.getDay()
  const back = dow === 0 ? 6 : dow - 1
  const ws = new Date(sep1)
  ws.setDate(ws.getDate() - back)
  return (
    Math.floor((d.getTime() - ws.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1
  )
}
export interface WalkRouteResult {
  mins: number
  meters: number
  text: string
  routeUrl: string
  fromName: string
  toName: string
}

const BUILDING_GPS: Record<string, [number, number]> = {
  corp1: [37.5565, 55.8298],
  corp2: [37.555, 55.8315],
  corp3: [37.5525, 55.8288],
  corp4: [37.5505, 55.8295],
  agrochem: [37.5603, 55.828],
  corp6: [37.551, 55.832],
  corp8: [37.556, 55.832],
  corp9: [37.549, 55.829],
  corp10: [37.5595, 55.834],
  corp11: [37.561, 55.8345],
  corp12: [37.545, 55.835],
  bio16: [37.553, 55.831],
  soil17: [37.542, 55.833],
  meteo18: [37.543, 55.834],
  corp26: [37.555, 55.831],
  ling27: [37.554, 55.8305],
  engineering: [37.5635, 55.8265],
  digital29: [37.541, 55.842],
  biotech37: [37.551, 55.832],
  lib: [37.553, 55.83],
  sport: [37.557, 55.833],
  station: [37.567, 55.825],
  dorms: [37.554, 55.834],
}

function getBuildingCoords(name: string): [number, number] | null {
  if (!name) return null
  const bId = normalizeBldg(name)
  if (BUILDING_GPS[bId]) return BUILDING_GPS[bId]
  const found = ALL_CAMPUS_MARKERS.find(
    (m) =>
      m.title.toLowerCase().includes(name.toLowerCase()) ||
      name.toLowerCase().includes(m.title.toLowerCase()) ||
      m.subtitle.toLowerCase().includes(name.toLowerCase())
  )
  if (found) return found.coords
  return [37.552, 55.834]
}

function calculateWalkBetween(from: string, to: string): WalkRouteResult | null {
  if (!from || !to) return null
  const normA = normalizeBldg(from)
  const normB = normalizeBldg(to)
  if (normA && normB && normA === normB) {
    return {
      mins: 0,
      meters: 0,
      text: "В этом же корпусе",
      routeUrl: "",
      fromName: from,
      toName: to,
    }
  }

  const coordsA = getBuildingCoords(from)
  const coordsB = getBuildingCoords(to)
  if (!coordsA || !coordsB) return null

  const [lng1, lat1] = coordsA
  const [lng2, lat2] = coordsB

  const R = 6371000
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  const straightDist = Math.round(R * c)
  const walkMeters = Math.max(70, Math.round(straightDist * 1.25))
  // 4.5 km/h = 75 m/min + 2 min buffer
  const mins = Math.max(1, Math.round(walkMeters / 75 + 1.5))

  const text = `~${mins} мин`
  const routeUrl = `https://yandex.ru/maps/?rtext=${lat1},${lng1}~${lat2},${lng2}&rtt=pd`

  return { mins, meters: walkMeters, text, routeUrl, fromName: from, toName: to }
}

function getWalk(a: string, b: string): number | null {
  const res = calculateWalkBetween(a, b)
  return res ? res.mins : null
}
function isOpen(f: FoodSpot) {
  const d = new Date()
  const m = d.getHours() * 60 + d.getMinutes()
  return m >= f.openFrom && m < f.openTo
}

function fmtOpenTo(f: FoodSpot) {
  return `${String(Math.floor(f.openTo / 60)).padStart(2, "0")}:${String(f.openTo % 60).padStart(2, "0")}`
}

const TYPE_CFG = {
  lecture: {
    label: "📖 Лекция",
    bar: "bg-primary",
    chip: "bg-muted text-primary border border-primary/20",
  },
  practice: {
    label: "⚗️ Практика",
    bar: "bg-amber-500",
    chip: "bg-amber-bg text-amber",
  },
  lab: {
    label: "🔬 Лаб. работа",
    bar: "bg-blue-500",
    chip: "bg-blue-bg text-blue",
  },
} as const

const WDAY = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"]

// ─── Icons ────────────────────────────────────────────────────────────────────

const I = {
  cal: (s = 20, c = "") => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={c}
    >
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  ),
  map: (s = 16, c = "") => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={c}
    >
      <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0118 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  ),
  user: (s = 20, c = "") => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={c}
    >
      <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  ),
  search: (s = 16, c = "") => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={c}
    >
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  ),
  bell: (s = 20, c = "") => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={c}
    >
      <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 01-3.46 0" />
    </svg>
  ),
  chev: (dir: "up" | "down" | "left" | "right" = "down", s = 16, c = "") => {
    const r = { down: 0, up: 180, left: 90, right: -90 }[dir]
    return (
      <svg
        width={s}
        height={s}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={c}
        style={{ transform: `rotate(${r}deg)`, transition: "transform .15s" }}
      >
        <polyline points="6 9 12 15 18 9" />
      </svg>
    )
  },
  walk: (s = 14, c = "") => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={c}
    >
      <circle cx="12" cy="4" r="2" fill="currentColor" stroke="none" />
      <path d="M9 12l1.5-3.5L14 10l1 3.5" />
      <path d="M7 20l2.5-4L11 18" />
      <path d="M13 18l1.5-4L17 20" />
      <path d="M8 12.5l-2 3" />
      <path d="M16 10.5l2 2.5" />
    </svg>
  ),
  clock: (s = 14, c = "") => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={c}
    >
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  ),
  fork: (s = 15, c = "") => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={c}
    >
      <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 002-2V2" />
      <path d="M7 2v20" />
      <path d="M21 15V2a5 5 0 00-5 5v6c0 1.1.9 2 2 2h3zm0 0v7" />
    </svg>
  ),
  book: (s = 15, c = "") => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={c}
    >
      <path d="M4 19.5A2.5 2.5 0 016.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
    </svg>
  ),
  bldg: (s = 18, c = "") => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={c}
    >
      <rect x="2" y="7" width="20" height="14" rx="2" />
      <path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16" />
    </svg>
  ),
  check: (s = 13, c = "") => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={c}
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  plus: (s = 14, c = "") => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={c}
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  ),
  close: (s = 18, c = "") => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={c}
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
  link: (s = 13, c = "") => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={c}
    >
      <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
    </svg>
  ),
  pencil: (s = 15, c = "") => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={c}
    >
      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  ),
  sun: (s = 18, c = "") => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={c}
    >
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  ),
  moon: (s = 18, c = "") => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={c}
    >
      <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
    </svg>
  ),
  dots: (s = 18, c = "") => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={c}
    >
      <circle cx="5" cy="12" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="19" cy="12" r="2" />
    </svg>
  ),
  settings: (s = 18, c = "") => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={c}
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  ),
  ext: (s = 13, c = "") => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={c}
    >
      <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  ),
  coffee: (s = 16, c = "") => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={c}
    >
      <path d="M18 8h1a4 4 0 010 8h-1" />
      <path d="M2 8h16v9a4 4 0 01-4 4H6a4 4 0 01-4-4V8z" />
      <line x1="6" y1="1" x2="6" y2="4" />
      <line x1="10" y1="1" x2="10" y2="4" />
      <line x1="14" y1="1" x2="14" y2="4" />
    </svg>
  ),
  note: (s = 15, c = "") => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={c}
    >
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  ),
  refresh: (s = 16, c = "") => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={c}
    >
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
    </svg>
  ),
  ban: (s = 14, c = "") => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={c}
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
    </svg>
  ),
  mail: (s = 14, c = "") => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={c}
    >
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
      <polyline points="22,6 12,13 2,6" />
    </svg>
  ),
  route: (s = 16, c = "") => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={c}
    >
      <circle cx="5" cy="6" r="2.5" />
      <circle cx="19" cy="18" r="2.5" />
      <path d="M7.5 6h7A3.5 3.5 0 0118 9.5v5" />
      <path d="M5 8.5v7A3.5 3.5 0 008.5 19H16.5" />
    </svg>
  ),
  home: (s = 16, c = "") => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={c}
    >
      <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  ),
  upload: (s = 14, c = "") => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={c}
    >
      <polyline points="16 16 12 12 8 16" />
      <line x1="12" y1="12" x2="12" y2="21" />
      <path d="M20.39 18.39A5 5 0 0018 9h-1.26A8 8 0 103 16.3" />
    </svg>
  ),
  arrowRight: (s = 14, c = "") => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={c}
    >
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  ),
  trash: (s = 16, c = "") => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={c}
    >
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
    </svg>
  ),
  database: (s = 16, c = "") => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={c}
    >
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
      <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
    </svg>
  ),
}

// ─── Campus Pin Marker ────────────────────────────────────────────────────────

function CampusPin({
  color = "#2D5016",
  category = "academic",
  textColor = "#fff",
  label = "",
  size = 36,
}: {
  color?: string
  category?: PinCategory
  textColor?: string
  label?: string
  size?: number
}) {
  return <CampusBadge category={category} label={label} size={size} />
}

const PIN_COLORS: Record<string, string> = {
  buildings: "#4D7C0F",
  dorms: "#EA580C",
  departments: "#0D9488",
  food: "#BE185D",
  sports: "#1E40AF",
}

// ─── Toast ────────────────────────────────────────────────────────────────────

interface ToastMsg {
  id: number
  text: string
  type: "info" | "success" | "warn"
}

function Toast({
  toasts,
  onDismiss,
}: {
  toasts: ToastMsg[]
  onDismiss: (id: number) => void
}) {
  return (
    <div className="fixed top-16 left-0 right-0 z-[100] flex flex-col gap-2 px-4 pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`animate-toast-in flex items-start gap-3 px-4 py-3 rounded-2xl shadow-lg border pointer-events-auto ${
            t.type === "warn"
              ? "bg-amber-bg border-amber/30 text-amber"
              : t.type === "success"
                ? "bg-muted border-accent/30 text-primary"
                : "bg-card border-border text-fg"
          }`}
        >
          <span className="text-sm font-semibold flex-1 leading-snug">
            {t.text}
          </span>
          <button
            onClick={() => onDismiss(t.id)}
            className="flex-shrink-0 opacity-60 hover:opacity-100"
          >
            {I.close(14)}
          </button>
        </div>
      ))}
    </div>
  )
}

// ─── Bottom Sheet ─────────────────────────────────────────────────────────────

function Sheet({
  onClose,
  children,
  title,
}: {
  onClose: () => void
  children: React.ReactNode
  title?: string
}) {
  const [isClosing, setIsClosing] = useState(false)
  const [dragY, setDragY] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const touchStartY = useRef<number | null>(null)

  const startClose = () => {
    if (isClosing) return
    setIsClosing(true)
    setTimeout(() => {
      onClose()
    }, 280)
  }

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY
    setIsDragging(true)
  }

  const onTouchMove = (e: React.TouchEvent) => {
    if (touchStartY.current === null) return
    const delta = e.touches[0].clientY - touchStartY.current
    if (delta > 0) {
      setDragY(delta)
    }
  }

  const onTouchEnd = () => {
    if (dragY > 75) {
      startClose()
    } else {
      setDragY(0)
    }
    setIsDragging(false)
    touchStartY.current = null
  }

  useEffect(() => {
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = ""
    }
  }, [])

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end"
      onClick={startClose}
    >
      <div
        className={`absolute inset-0 bg-black/40 transition-opacity duration-300 ${
          isClosing ? "opacity-0 pointer-events-none" : "animate-fade-in"
        }`}
      />
      <div
        className={`relative bg-card rounded-t-3xl shadow-2xl max-h-[90vh] flex flex-col ${
          isClosing ? "sheet-spring-exit" : "sheet-spring-enter"
        }`}
        style={{
          transform: !isClosing && dragY > 0 ? `translateY(${dragY}px)` : undefined,
          transition: isDragging
            ? "none"
            : !isClosing && dragY === 0
              ? "transform 0.35s cubic-bezier(0.32, 0.72, 0, 1)"
              : undefined,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header / Drag handle area with touch drag-to-dismiss */}
        <div
          className="touch-none select-none cursor-grab active:cursor-grabbing pt-3 pb-1 flex-shrink-0"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          <div className="flex justify-center pb-1">
            <div className="w-12 h-1.5 rounded-full bg-border hover:bg-muted-fg/40 transition-colors" />
          </div>
          {title && (
            <div className="px-4 pb-2 pt-1 flex items-center justify-between">
              <h2 className="text-base font-bold text-fg">{title}</h2>
              <button
                onClick={startClose}
                className="p-1.5 rounded-xl hover:bg-muted text-muted-fg transition-colors"
              >
                {I.close(18)}
              </button>
            </div>
          )}
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>

</div>
    </div>
  )
}

// ─── Status Bar ───────────────────────────────────────────────────────────────

function StatusBar() {
  const isMobileOrStandalone = isRealMobileOrStandalone()
  if (isMobileOrStandalone) {
    return <div className="h-[env(safe-area-inset-top,0px)] flex-shrink-0" />
  }
  return (
    <div className="flex items-center justify-between px-5 h-[44px] flex-shrink-0">
      <span
        className="text-[13px] font-bold"
        style={{ fontFamily: "var(--font-mono)" }}
      >
        9:41
      </span>
      <div className="flex items-center gap-1.5">
        <svg
          width="17"
          height="12"
          viewBox="0 0 17 12"
          fill="currentColor"
          className="opacity-70"
        >
          <rect x="0" y="7" width="3" height="5" rx="0.5" />
          <rect x="4.5" y="5" width="3" height="7" rx="0.5" />
          <rect x="9" y="2" width="3" height="10" rx="0.5" />
          <rect x="13.5" y="0" width="3" height="12" rx="0.5" opacity="0.3" />
        </svg>
        <svg
          width="24"
          height="12"
          viewBox="0 0 24 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
          className="opacity-70"
        >
          <rect x="0.5" y="0.5" width="20" height="11" rx="2" />
          <path d="M21 4v4" strokeWidth="2" strokeLinecap="round" />
          <rect
            x="2"
            y="2"
            width="14"
            height="8"
            rx="1"
            fill="currentColor"
            stroke="none"
          />
        </svg>

</div>
    </div>
  )
}

// ─── Group Sheet ──────────────────────────────────────────────────────────────

const INSTITUTES_LIST = [
  { id: "agrobio", name: "Институт агробиотехнологии", short: "Агробио" },
  { id: "mechanics", name: "Инженерный институт (им. В.П. Горячкина)", short: "Инженерия" },
  { id: "zoobio", name: "Институт зоотехнии и биологии", short: "Зоовет" },
  { id: "econ", name: "Институт экономики и управления", short: "Эконом" },
  { id: "water", name: "Институт мелиорации, водного хозяйства и строительства", short: "Мелиорация" },
  { id: "biotech", name: "Институт биотехнологии и ветеринарной медицины", short: "Биотех" },
  { id: "horticulture", name: "Институт садоводства и ландшафтной архитектуры", short: "Садоводство" },
  { id: "tech", name: "Технологический институт", short: "Технолог" },
]

function getGroupMeta(gId: string): { instId: string; course: number } {
  const activeSched = getCachedSchedule()
  const g =
    ((activeSched?.groups || {}) as any)[gId] ||
    ((officialScheduleData as any).groups || {})[gId]

  if (g?.institute) {
    const raw = (g.institute as string).toLowerCase()
    let instId = "agrobio"
    if (raw.includes("агробио") || raw.includes("агроном") || raw.includes("агрохим")) instId = "agrobio"
    else if (raw.includes("инженер") || raw.includes("механ") || raw.includes("горячкин")) instId = "mechanics"
    else if (raw.includes("зоо") || raw.includes("животн")) instId = "zoobio"
    else if (raw.includes("эконом") || raw.includes("управл")) instId = "econ"
    else if (raw.includes("мелиор") || raw.includes("водн") || raw.includes("строит") || raw.includes("костяков")) instId = "water"
    else if (raw.includes("биотех") || raw.includes("ветеринар")) instId = "biotech"
    else if (raw.includes("садовод") || raw.includes("ландшафт")) instId = "horticulture"
    else if (raw.includes("технолог")) instId = "tech"

    const courseNum = Number(g.course) || 1
    return { instId, course: courseNum }
  }

  // Robust fallback heuristic based on group code prefix and digits
  let instId = "agrobio"
  if (/^Д-И|^ДИ|^ТТ|^Д-ЭМ|^Д-ТБ|^Д-ЭТ|^ИЭ/i.test(gId)) instId = "mechanics"
  else if (/^Д-З|^ДЗ/i.test(gId)) instId = "zoobio"
  else if (/^Д-Э|^ЭК|^ДЭ/i.test(gId)) instId = "econ"
  else if (/^Д-С|^М-С|^Д-П|^ПА|^Д-ЗМ/i.test(gId)) instId = "water"
  else if (/^Д-БТ|^М-БТ|^Д-ВС|^П-/i.test(gId)) instId = "biotech"
  else if (/^Д-ЛА|^М-ЛА|^ЛА|^Д-ПО/i.test(gId)) instId = "horticulture"
  else if (/^Д-ТП|^Т-|^Д-СТ/i.test(gId)) instId = "tech"

  let course = 1
  if (/20\d|2-\d| 02-|-25/i.test(gId)) course = 2
  else if (/30\d|3-\d| 03-/i.test(gId)) course = 3
  else if (/40\d|4-\d| 04-/i.test(gId)) course = 4
  else if (/50\d|5-\d| 05-/i.test(gId)) course = 5

  return { instId, course }
}

function GroupSheet({
  current,
  saved,
  onSelect,
  onDelete,
  onClose,
}: {
  current: string
  saved: string[]
  onSelect: (id: string) => void
  onDelete: (id: string) => void
  onClose: () => void
}) {
  const [viewMode, setViewMode] = useState<"hierarchy" | "search">("hierarchy")
  const [query, setQuery] = useState("")
  const [searchMode, setSearchMode] = useState<"group" | "teacher">("group")
  const [selectedInst, setSelectedInst] = useState<string>("agrobio")
  const [selectedCourse, setSelectedCourse] = useState<number>(1)

  const allList = searchMode === "group" ? RGAU_GROUPS : RGAU_TEACHERS
  const suggestions =
    query.length >= 1
      ? allList
          .filter((g) => g.toLowerCase().includes(query.toLowerCase()))
          .slice(0, 15)
      : []

  const hierarchyGroups = RGAU_GROUPS.filter((gId) => {
    const meta = getGroupMeta(gId)
    return meta.instId === selectedInst && meta.course === selectedCourse
  })

  function pick(id: string) {
    onSelect(id)
    onClose()
  }

  const currentMeta = getGroupMeta(current)
  const currentInst = INSTITUTES_LIST.find((i) => i.id === currentMeta.instId)

  return (
    <Sheet onClose={onClose} title="Выбор группы и расписания">
      <div className="px-4 pb-6 space-y-4">
        {/* Active Chosen Group Card */}
        <div className="flex items-center justify-between p-3.5 rounded-2xl bg-primary/10 border border-primary/30 shadow-xs">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-primary text-white flex items-center justify-center font-black text-sm flex-shrink-0 shadow-xs">
              {current.slice(0, 2)}
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold text-primary uppercase tracking-wider">
                Текущая выбранная группа
              </p>
              <p className="text-base font-bold text-fg truncate leading-tight mt-0.5">
                {current}
              </p>
              <p className="text-[11px] text-muted-fg truncate mt-0.5">
                {currentInst?.name || "РГАУ-МСХА им. К.А. Тимирязева"} · {currentMeta.course} курс
              </p>
            </div>
          </div>
          <span className="text-xs font-bold text-primary px-2.5 py-1 rounded-full bg-primary/15 border border-primary/20 flex-shrink-0">
            Активна
          </span>
        </div>

        {/* View Mode Switcher: Hierarchy vs Search */}
        <div className="flex bg-muted rounded-xl p-0.5 gap-0.5 text-xs font-bold">
          <button
            onClick={() => setViewMode("hierarchy")}
            className={`flex-1 py-2 rounded-lg transition-all cursor-pointer ${
              viewMode === "hierarchy"
                ? "bg-card text-fg shadow-xs"
                : "text-muted-fg hover:text-fg"
            }`}
          >
            🏛 Институт → Курс → Группа
          </button>
          <button
            onClick={() => setViewMode("search")}
            className={`flex-1 py-2 rounded-lg transition-all cursor-pointer ${
              viewMode === "search"
                ? "bg-card text-fg shadow-xs"
                : "text-muted-fg hover:text-fg"
            }`}
          >
            🔍 Поиск ({RGAU_GROUPS.length} групп)
          </button>
        </div>

        {viewMode === "hierarchy" ? (
          <div className="space-y-3.5">
            {/* 1. Institute Selector */}
            <div>
              <p className="text-xs font-semibold text-muted-fg mb-1.5">
                1. Выберите институт:
              </p>
              <div className="grid grid-cols-2 gap-1.5 max-h-44 overflow-y-auto pr-0.5">
                {INSTITUTES_LIST.map((inst) => {
                  const isSel = selectedInst === inst.id
                  return (
                    <button
                      key={inst.id}
                      onClick={() => setSelectedInst(inst.id)}
                      className={`text-left p-2.5 rounded-xl text-xs border transition-all cursor-pointer ${
                        isSel
                          ? "bg-primary text-white border-primary shadow-xs font-bold"
                          : "bg-card border-border hover:bg-muted text-fg"
                      }`}
                      title={inst.name}
                    >
                      <p className="font-bold truncate">{inst.short}</p>
                      <p className={`text-[10px] truncate ${isSel ? "text-white/80" : "text-muted-fg"}`}>
                        {inst.name}
                      </p>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* 2. Course Selector */}
            <div>
              <p className="text-xs font-semibold text-muted-fg mb-1.5">
                2. Выберите курс:
              </p>
              <div className="grid grid-cols-5 gap-1">
                {[
                  { c: 1, label: "1 курс" },
                  { c: 2, label: "2 курс" },
                  { c: 3, label: "3 курс" },
                  { c: 4, label: "4 курс" },
                  { c: 5, label: "5 курс / Маг." },
                ].map(({ c, label }) => {
                  const isSel = selectedCourse === c
                  return (
                    <button
                      key={c}
                      onClick={() => setSelectedCourse(c)}
                      className={`py-2 px-1 rounded-xl text-xs font-bold border transition-all cursor-pointer text-center ${
                        isSel
                          ? "bg-primary text-white border-primary shadow-xs"
                          : "bg-card border-border hover:bg-muted text-fg"
                      }`}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* 3. Group Buttons */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-xs font-semibold text-muted-fg">
                  3. Выберите группу ({hierarchyGroups.length}):
                </p>
              </div>
              {hierarchyGroups.length > 0 ? (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5 max-h-56 overflow-y-auto pr-0.5">
                  {hierarchyGroups.map((gId) => {
                    const isCur = gId === current
                    return (
                      <button
                        key={gId}
                        onClick={() => pick(gId)}
                        className={`p-2 rounded-xl text-xs font-bold border text-center transition-all cursor-pointer truncate ${
                          isCur
                            ? "bg-primary text-white border-primary shadow-xs ring-2 ring-primary/40"
                            : "bg-card border-border hover:border-primary/40 hover:bg-muted text-fg"
                        }`}
                        title={gId}
                      >
                        {gId}
                      </button>
                    )
                  })}
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-muted/60 text-center text-xs text-muted-fg">
                  В выбранном курсе нет групп для данного института. Попробуйте другой курс или воспользуйтесь поиском.
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex bg-card rounded-xl p-0.5 gap-0.5">
              {(["group", "teacher"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => {
                    setSearchMode(m)
                    setQuery("")
                  }}
                  className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                    searchMode === m
                      ? "bg-primary text-white"
                      : "text-muted-fg hover:text-fg"
                  }`}
                >
                  {m === "group" ? `Группы (${RGAU_GROUPS.length})` : "Преподаватели"}
                </button>
              ))}
            </div>

            <div className="relative">
              <div className="flex items-center gap-2 border border-border bg-card rounded-xl px-3 py-2.5 focus-within:border-primary transition-colors">
                {I.search(14, "text-muted-fg flex-shrink-0")}
                <input
                  key={searchMode}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={
                    searchMode === "group"
                      ? "Введите номер группы (например, ДА 01-26, ДЭ 17-26)..."
                      : "Введите фамилию преподавателя..."
                  }
                  className="flex-1 text-sm bg-transparent outline-none text-fg placeholder:text-muted-fg"
                  autoFocus
                />
                {query && (
                  <button
                    onClick={() => setQuery("")}
                    className="text-muted-fg hover:text-fg cursor-pointer"
                  >
                    {I.close(13)}
                  </button>
                )}
              </div>

              {suggestions.length > 0 && (
                <div className="mt-2 bg-card border border-border rounded-2xl shadow-lg overflow-hidden max-h-56 overflow-y-auto">
                  {suggestions.map((g) => (
                    <button
                      key={g}
                      onClick={() => pick(g)}
                      className="w-full text-left px-4 py-2.5 text-sm font-semibold text-fg hover:bg-muted transition-colors border-b border-border last:border-0 flex items-center justify-between cursor-pointer"
                    >
                      <span>{g}</span>
                      <span className="text-xs text-primary font-bold">Выбрать →</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {query.length >= 2 && suggestions.length === 0 && (
              <div className="text-center py-4 text-xs text-muted-fg">
                Ничего не найдено по запросу «{query}»
              </div>
            )}
          </div>
        )}
      </div>
    </Sheet>
  )
}

// ─── App Header ───────────────────────────────────────────────────────────────

function AppHeader({
  tab,
  dark,
  onDarkToggle,
  groupId,
  onGroupOpen,
  searchOpen,
  onSearchToggle,
  onSyncOpen,
  lastSyncDisplay,
  onOpenIosPrompt,
  onGoHome,
}: {
  tab: string
  dark: boolean
  onDarkToggle: (e: React.MouseEvent) => void
  groupId: string
  onGroupOpen: () => void
  searchOpen: boolean
  onSearchToggle: () => void
  onSyncOpen?: () => void
  lastSyncDisplay?: string
  onOpenIosPrompt?: () => void
  onGoHome?: () => void
}) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div
      className={`sticky top-0 z-40 flex-shrink-0 backdrop-blur-xl bg-background/80 transition-shadow ${scrolled ? 'shadow-sm' : ''}`}
    >
      <StatusBar />
      {tab === "schedule" ? (
        <div className="flex items-center justify-between px-4 pb-2.5 gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={onGroupOpen}
              className="flex items-center gap-1.5 bg-muted px-3 py-1.5 rounded-xl hover:bg-border transition-colors min-w-0 cursor-pointer"
            >
              <span className="text-sm font-bold text-fg truncate">
                {groupId || "Группа"}
              </span>
              {I.chev("down", 13, "text-muted-fg flex-shrink-0")}
            </button>
            {(() => {
              const curWeek = getStudyWeek(TODAY)
              const isOdd = curWeek % 2 !== 0
              return (
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-card border border-border/80 text-xs font-semibold text-fg shadow-xs">
                  <span className="text-muted-fg">{curWeek}-я нед</span>
                  <span
                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
                      isOdd
                        ? "bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-500/30"
                        : "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30"
                    }`}
                  >
                    {isOdd ? "Верхняя" : "Нижняя"}
                  </span>
                </div>
              )
            })()}
            {onSyncOpen && (
              <button
                onClick={onSyncOpen}
                className="flex items-center gap-1.5 px-2 py-1 rounded-xl bg-card border border-border/80 text-xs font-semibold text-fg shadow-xs hover:border-primary/40 hover:bg-muted/40 transition-all cursor-pointer"
                title="Синхронизация с timacad.ru"
              >
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse flex-shrink-0" />
                <span className="text-[10px] font-bold text-muted-fg hidden sm:inline">
                  timacad.ru
                </span>
              </button>
            )}
          </div>
          <div className="flex gap-1 items-center">
            {((isIosDevice() || isIPadDevice()) && getIosBrowserType() === "safari" && !isStandaloneMode() && onOpenIosPrompt) && (
              <button
                onClick={onOpenIosPrompt}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-primary/10 border border-primary/25 text-xs font-bold text-primary hover:bg-primary/20 transition-colors cursor-pointer"
                title="Установить на экран «Домой»"
              >
                <span>📱</span>
                <span className="text-[10px] font-bold">На «Домой»</span>
              </button>
            )}
            <button
              onClick={onSearchToggle}
              className={`p-2 rounded-xl transition-colors cursor-pointer ${
                searchOpen
                  ? "bg-primary text-white"
                  : "hover:bg-muted text-muted-fg"
              }`}
            >
              {I.search(17)}
            </button>
            <button
              onClick={onDarkToggle}
              className="p-2 rounded-xl hover:bg-muted text-muted-fg transition-colors cursor-pointer"
              title="Переключить тему"
            >
              {dark ? I.sun(17) : I.moon(17)}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between px-4 pb-2.5">
          <div className="flex items-center gap-2 min-w-0">
            <h1 className="text-xl sm:text-2xl font-extrabold text-fg truncate">
              {({
                campus: "Кампус",
                events: "События",
                profile: "Профиль",
              } as Record<string, string>)[tab] ?? ""}
            </h1>
            {onSyncOpen && (
              <button
                onClick={onSyncOpen}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-card border border-border/80 text-xs font-semibold text-fg shadow-xs hover:border-primary/40 hover:bg-muted/40 transition-all cursor-pointer flex-shrink-0"
                title="Официальные источники timacad.ru"
              >
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse flex-shrink-0" />
                <span className="text-[10px] font-bold text-muted-fg hidden xs:inline">
                  timacad.ru
                </span>
              </button>
            )}
          </div>
          <div className="flex gap-1 items-center">
            {((isIosDevice() || isIPadDevice()) && getIosBrowserType() === "safari" && !isStandaloneMode() && onOpenIosPrompt) && (
              <button
                onClick={onOpenIosPrompt}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-primary/10 border border-primary/25 text-xs font-bold text-primary hover:bg-primary/20 transition-colors cursor-pointer"
                title="Установить на экран «Домой»"
              >
                <span>📱</span>
                <span className="text-[10px] font-bold">На «Домой»</span>
              </button>
            )}
            <button
              onClick={onSearchToggle}
              className={`p-2 rounded-xl transition-colors cursor-pointer ${
                searchOpen
                  ? "bg-primary text-white"
                  : "hover:bg-muted text-muted-fg"
              }`}
            >
              {I.search(17)}
            </button>
            <button
              onClick={onDarkToggle}
              className="p-2 rounded-xl hover:bg-muted text-muted-fg transition-colors"
              title="Переключить тему"
            >
              {dark ? I.sun(17) : I.moon(17)}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Search Bar ───────────────────────────────────────────────────────────────

function SearchBar({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <div className="search-spring-enter relative mx-4 mb-2">
      {I.search(
        15,
        "absolute left-3 top-1/2 -translate-y-1/2 text-muted-fg pointer-events-none",
      )}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? "Поиск..."}
        className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-border bg-card text-sm placeholder:text-muted-fg focus:outline-none focus:border-accent transition-colors shadow-sm"
        autoFocus
      />
    </div>
  )
}

// ─── Travel Banner ────────────────────────────────────────────────────────────

function TravelBanner({
  from,
  to,
  breakMin,
}: {
  from: string
  to: string
  breakMin: number
}) {
  const walkInfo = calculateWalkBetween(from, to)
  if (!walkInfo) return null
  if (walkInfo.mins === 0)
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-muted text-muted-fg text-xs font-medium mx-4">
        {I.bldg(12, "flex-shrink-0")}
        <span>В этом же корпусе</span>
      </div>
    )
  const tight = walkInfo.mins >= breakMin - 3
  return (
    <div
      className={`flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl text-xs font-medium mx-4 ${
        tight
          ? "bg-amber-bg text-amber border border-amber/20"
          : "bg-muted text-muted-fg"
      }`}
    >
      <div className="flex items-center gap-2 min-w-0">
        {I.route(13, "flex-shrink-0")}
        <span className="truncate">
          {walkInfo.text}
        </span>
      </div>
      {walkInfo.routeUrl && (
        <a
          href={walkInfo.routeUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[11px] font-semibold text-primary underline flex-shrink-0 hover:opacity-80"
          title="Открыть пешеходный маршрут на Яндекс.Картах"
        >
          Маршрут →
        </a>
      )}
    </div>
  )
}

// ─── Okno Card ────────────────────────────────────────────────────────────────

function OknoCard({
  from,
  to,
  gapMin,
  onEat,
  onRest,
}: {
  from: string
  to: string
  gapMin: number
  onEat: () => void
  onRest: () => void
}) {
  const h = Math.floor(gapMin / 60)
  const m = gapMin % 60
  return (
    <div className="mx-4 rounded-2xl border border-border bg-card px-4 py-3 space-y-2.5">
      <div className="flex items-center gap-2">
        {I.coffee(16, "text-muted-fg flex-shrink-0")}
        <div>
          <p className="text-sm font-bold text-fg">
            Окно {h > 0 ? `${h}ч ${m}мин` : `${m} мин`}
          </p>
          <p className="text-xs text-muted-fg">
            {from} — {to}
          </p>
        </div>
      </div>
      <div className="flex gap-2">
        <button
          onClick={onEat}
          className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold bg-muted text-fg hover:bg-border rounded-xl py-2 transition-colors"
        >
          {I.fork(14, "flex-shrink-0")} Где поесть
        </button>
        <button
          onClick={onRest}
          className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold bg-muted text-fg hover:bg-border rounded-xl py-2 transition-colors"
        >
          {I.book(14, "flex-shrink-0")} Где переждать
        </button>

</div>
    </div>
  )
}

// ─── Rest Sheet ───────────────────────────────────────────────────────────────

function RestSheet({ onClose }: { onClose: () => void }) {
  const spots = [
    {
      name: "Читальный зал №1",
      where: "УК-1, 2-й этаж",
      note: "Тихо, есть розетки",
    },
    {
      name: "Библиотека РГАУ-МСХА",
      where: "УК-1, 1-й этаж",
      note: "Открыта до 18:00",
    },
    { name: "Холл агрохимии", where: "Агрохим, вход", note: "Диваны, Wi-Fi" },
    {
      name: "Беседки у главного корпуса",
      where: "Территория кампуса",
      note: "В хорошую погоду",
    },
  ]
  return (
    <Sheet onClose={onClose} title="Где переждать">
      <div className="px-4 pb-8 space-y-2">
        {spots.map((s) => (
          <div key={s.name} className="bg-muted rounded-xl px-4 py-3">
            <p className="text-sm font-bold text-fg">{s.name}</p>
            <p className="text-xs text-muted-fg mt-0.5">{s.where}</p>
            <p className="text-xs text-accent mt-0.5">{s.note}</p>
          </div>
        ))}
      </div>
    </Sheet>
  )
}

// ─── Dorm Card ────────────────────────────────────────────────────────────────

function DormCard({ dorm, onDismiss }: { dorm: string; onDismiss: () => void }) {
  const info = DORM_WALK[dorm]
  if (!info) return null
  const displayBldg = getBldgGenitive(info.building)
  return (
    <div className="mx-4 flex items-center gap-3 bg-muted border border-border rounded-2xl px-4 py-3">
      <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
        {I.route(18, "text-primary")}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-fg">
          До {displayBldg}: ~{info.min} мин
        </p>
        <p className="text-xs text-muted-fg mt-0.5">от {dorm}</p>
      </div>
      <button
        onClick={onDismiss}
        className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-xl hover:bg-border text-muted-fg hover:text-fg transition-colors"
      >
        {I.close(14)}
      </button>
    </div>
  )
}

// ─── Subgroup Sheet ───────────────────────────────────────────────────────────

function SubgroupSheet({
  subject,
  current,
  onChange,
  onClose,
}: {
  subject: string
  current: SubgroupPref
  onChange: (p: SubgroupPref) => void
  onClose: () => void
}) {
  const [val, setVal] = useState<SubgroupPref>(current)
  const opts: [SubgroupPref, string, string][] = [
    ["1", "1-я подгруппа", "Только пары 1-й"],
    ["2", "2-я подгруппа", "Только пары 2-й"],
    ["all", "Все подгруппы", "Оба варианта"],
  ]
  return (
    <Sheet onClose={onClose} title="Подгруппа">
      <div className="px-4 pb-8 space-y-2">
        <p className="text-xs text-muted-fg mb-3">«{subject}»</p>
        {opts.map(([v, label, sub]) => (
          <button
            key={v}
            onClick={() => setVal(v)}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl border transition-all ${
              val === v
                ? "border-accent bg-muted"
                : "border-border bg-card hover:border-accent/40"
            }`}
          >
            <div
              className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                val === v ? "border-primary" : "border-border"
              }`}
            >
              {val === v && (
                <div className="w-2.5 h-2.5 rounded-full bg-primary" />
              )}
            </div>
            <div className="text-left flex-1">
              <p
                className={`text-sm font-semibold ${
                  val === v ? "text-primary" : "text-fg"
                }`}
              >
                {label}
              </p>
              <p className="text-xs text-muted-fg">{sub}</p>
            </div>
          </button>
        ))}
        <button
          onClick={() => {
            onChange(val)
            onClose()
          }}
          className="w-full mt-2 py-3 bg-primary text-white rounded-2xl text-sm font-bold hover:opacity-90 transition-opacity"
        >
          Сохранить
        </button>
      </div>
    </Sheet>
  )
}

// ─── Class Manage Sheet ───────────────────────────────────────────────────────

const CANCEL_REASONS = [
  "Болезнь преподавателя",
  "Перенос занятия",
  "Самостоятельная работа",
  "Другая причина",
]
const DISPLACED_OPTIONS = [
  "Слот был свободен",
  "Пара отменена",
  "Пара перенесена на другой день",
  "Другое",
]

function ClassManageSheet({
  cls,
  edit,
  onSave,
  onClose,
  onToast,
}: {
  cls: ClassItem
  edit: ClassEdit | undefined
  onSave: (e: ClassEdit) => void
  onClose: () => void
  onToast: (msg: string, type: "info" | "success" | "warn") => void
}) {
  const [action, setAction] =
    useState<"cancel" | "room" | "teacher" | "time" | "move" | null>(null)
  const [moveStep, setMoveStep] = useState<"pick" | "displaced">("pick")
  const [displacedOption, setDisplacedOption] = useState(DISPLACED_OPTIONS[0])
  const [pendingEdit, setPendingEdit] = useState<ClassEdit | null>(null)
  const [reason, setReason] = useState(CANCEL_REASONS[0])
  const [note, setNote] = useState(edit?.cancelNote ?? "")
  const [room, setRoom] = useState(edit?.room ?? cls.room)
  const [building, setBuilding] = useState(edit?.building ?? cls.building)
  const [teacher, setTeacher] = useState(edit?.teacher ?? cls.teacher)
  const [startT, setStartT] = useState(edit?.startOverride ?? cls.start)
  const [endT, setEndT] = useState(edit?.endOverride ?? cls.end)
  const [moveDay, setMoveDay] = useState(edit?.dayOverride ?? "Понедельник")
  const [moveNum, setMoveNum] = useState<number>(edit?.numOverride ?? cls.num)
  const isCancelled = edit?.cancelled ?? false
  const buildings = Object.keys(BIDS)
  const walk = getWalk(cls.building, building)
  const DAYS = [
    "Понедельник",
    "Вторник",
    "Среда",
    "Четверг",
    "Пятница",
    "Суббота",
  ]

  function save() {
    if (action === "cancel") {
      onSave({
        ...edit,
        cancelled: !isCancelled,
        cancelReason: reason,
        cancelNote: note,
      })
      onToast(
        !isCancelled
          ? `Пара «${cls.subject}» отменена — группа уведомлена`
          : `Пара «${cls.subject}» восстановлена`,
        !isCancelled ? "warn" : "success",
      )
    } else if (action === "room") {
      onSave({ ...edit, building, room })
      onToast(`Аудитория изменена: ${building}, ауд. ${room}`, "info")
    } else if (action === "teacher") {
      onSave({ ...edit, teacher })
      onToast(`Замена преподавателя: ${teacher}`, "info")
    } else if (action === "time") {
      onSave({ ...edit, startOverride: startT, endOverride: endT })
      onToast(`Время пары изменено: ${startT}–${endT}`, "warn")
    } else if (action === "move") {
      const e = { ...edit, dayOverride: moveDay, numOverride: moveNum }
      setPendingEdit(e)
      setMoveStep("displaced")
      return
    }
    onClose()
  }

  function confirmDisplaced() {
    if (pendingEdit) {
      onSave({ ...pendingEdit, displacedNote: displacedOption })
      onToast(
        `«${cls.subject}» перенесена на ${moveDay}, п.${moveNum} — группа уведомлена`,
        "warn",
      )
    }
    onClose()
  }

  if (action === "move" && moveStep === "displaced")
    return (
      <Sheet onClose={onClose} title="Уточнение переноса">
        <div className="px-4 pb-8 space-y-3">
          <p className="text-sm text-fg">
            Что происходит с{" "}
            <span className="font-bold">
              парой {moveNum} в {moveDay}
            </span>
            ?
          </p>
          <div className="space-y-1.5">
            {DISPLACED_OPTIONS.map((opt) => (
              <button
                key={opt}
                onClick={() => setDisplacedOption(opt)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl border transition-all ${
                  displacedOption === opt
                    ? "border-accent bg-muted"
                    : "border-border bg-card hover:border-accent/40"
                }`}
              >
                <div
                  className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${
                    displacedOption === opt ? "border-primary" : "border-border"
                  }`}
                >
                  {displacedOption === opt && (
                    <div className="w-2 h-2 rounded-full bg-primary" />
                  )}
                </div>
                <span
                  className={`text-sm font-medium ${
                    displacedOption === opt ? "text-primary" : "text-fg"
                  }`}
                >
                  {opt}
                </span>
              </button>
            ))}
          </div>
          <p className="text-[11px] text-muted-fg bg-muted rounded-xl px-3 py-2">
            Информация войдёт в уведомление группе
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setMoveStep("pick")}
              className="flex-1 py-3 rounded-2xl border border-border text-sm font-semibold text-muted-fg"
            >
              Назад
            </button>
            <button
              onClick={confirmDisplaced}
              className="flex-1 py-3 bg-primary text-white rounded-2xl text-sm font-bold"
            >
              Подтвердить перенос
            </button>
          </div>
        </div>
      </Sheet>
    )

  return (
    <Sheet onClose={onClose} title="Управление парой">
      <div className="px-4 pb-8 space-y-2">
        <p className="text-xs text-muted-fg mb-1">
          Пара {cls.num} · {cls.subject}
        </p>
        {!action ? (
          <>
            {[
              {
                id: "cancel",
                icon: I.ban(16, "text-red flex-shrink-0"),
                label: isCancelled
                  ? "Восстановить занятие"
                  : "Отменить занятие",
                sub: "Выбор причины + уведомление группе",
                danger: true,
              },
              {
                id: "time",
                icon: I.clock(16, "text-muted-fg flex-shrink-0"),
                label: "Изменить время пары",
                sub: "Сдвинуть начало/конец",
              },
              {
                id: "move",
                icon: I.cal(16, "text-muted-fg flex-shrink-0"),
                label: "Перенести на другой день",
                sub: "Изменить день и номер пары",
              },
              {
                id: "room",
                icon: I.bldg(16, "text-muted-fg flex-shrink-0"),
                label: "Сменить аудиторию",
                sub: "Корпус и номер аудитории",
              },
              {
                id: "teacher",
                icon: I.user(16, "text-muted-fg flex-shrink-0"),
                label: "Заменить преподавателя",
                sub: "Временная замена на одну пару",
              },
            ].map((item) => (
              <button
                key={item.id}
                onClick={() =>
                  setAction(
                    item.id as "cancel" | "room" | "teacher" | "time" | "move",
                  )
                }
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl border transition-all ${
                  item.danger
                    ? "border-border bg-card hover:border-red/40"
                    : "border-border bg-card hover:border-accent/40"
                }`}
              >
                {item.icon}
                <div className="text-left">
                  <p className="text-sm font-semibold text-fg">{item.label}</p>
                  <p className="text-xs text-muted-fg">{item.sub}</p>
                </div>
              </button>
            ))}
          </>
        ) : action === "cancel" ? (
          <div className="space-y-3">
            <button
              onClick={() => setAction(null)}
              className="flex items-center gap-1 text-xs text-muted-fg hover:text-fg"
            >
              {I.chev("left", 12)} Назад
            </button>
            {!isCancelled && (
              <div className="space-y-1.5">
                {CANCEL_REASONS.map((r) => (
                  <button
                    key={r}
                    onClick={() => setReason(r)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all ${
                      reason === r
                        ? "border-accent bg-muted"
                        : "border-border bg-card hover:border-accent/40"
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                        reason === r ? "border-primary" : "border-border"
                      }`}
                    >
                      {reason === r && (
                        <div className="w-2 h-2 rounded-full bg-primary" />
                      )}
                    </div>
                    <span
                      className={`text-sm font-medium ${
                        reason === r ? "text-primary" : "text-fg"
                      }`}
                    >
                      {r}
                    </span>
                  </button>
                ))}
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Комментарий для группы (опционально)"
                  className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-accent bg-card text-fg resize-none"
                  rows={2}
                />
              </div>
            )}
            <button
              onClick={save}
              className={`w-full py-3 rounded-2xl text-sm font-bold text-white ${
                isCancelled ? "bg-accent" : "bg-red"
              }`}
            >
              {isCancelled ? "Восстановить пару" : "Отменить занятие"}
            </button>
          </div>
        ) : action === "time" ? (
          <div className="space-y-3">
            <button
              onClick={() => setAction(null)}
              className="flex items-center gap-1 text-xs text-muted-fg"
            >
              {I.chev("left", 12)} Назад
            </button>
            {(() => {
              const isValidTime = (t: string) =>
                /^([01]\d|2[0-3]):([0-5]\d)$/.test(t)
              const startErr = startT && !isValidTime(startT)
              const endErr = endT && !isValidTime(endT)
              const canSave = isValidTime(startT) && isValidTime(endT)
              return (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs text-muted-fg mb-1">Начало</p>
                      <input
                        type="time"
                        value={startT}
                        onChange={(e) => setStartT(e.target.value)}
                        className={`w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-accent bg-card text-fg ${
                          startErr ? "border-red" : "border-border"
                        }`}
                        style={{ fontFamily: "var(--font-mono)" }}
                      />
                      {startErr && (
                        <p className="text-[11px] text-red mt-1">
                          Формат: ЧЧ:ММ
                        </p>
                      )}
                    </div>
                    <div>
                      <p className="text-xs text-muted-fg mb-1">Конец</p>
                      <input
                        type="time"
                        value={endT}
                        onChange={(e) => setEndT(e.target.value)}
                        className={`w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-accent bg-card text-fg ${
                          endErr ? "border-red" : "border-border"
                        }`}
                        style={{ fontFamily: "var(--font-mono)" }}
                      />
                      {endErr && (
                        <p className="text-[11px] text-red mt-1">
                          Формат: ЧЧ:ММ
                        </p>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={save}
                    disabled={!canSave}
                    className={`w-full py-3 rounded-2xl text-sm font-bold text-white transition-opacity ${
                      canSave
                        ? "bg-primary"
                        : "bg-primary opacity-40 cursor-not-allowed"
                    }`}
                  >
                    Сохранить
                  </button>
                </>
              )
            })()}
          </div>
        ) : action === "move" ? (
          <div className="space-y-3">
            <button
              onClick={() => setAction(null)}
              className="flex items-center gap-1 text-xs text-muted-fg"
            >
              {I.chev("left", 12)} Назад
            </button>
            <div>
              <p className="text-xs text-muted-fg mb-1.5">День недели</p>
              <div className="flex flex-wrap gap-1.5">
                {DAYS.map((d) => {
                  const abbr =
                    ({
                      Понедельник: "Пн",
                      Вторник: "Вт",
                      Среда: "Ср",
                      Четверг: "Чт",
                      Пятница: "Пт",
                      Суббота: "Сб",
                    } as Record<string, string>)[d] ?? d.slice(0, 2)
                  return (
                    <button
                      key={d}
                      onClick={() => setMoveDay(d)}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-xl border transition-all ${
                        moveDay === d
                          ? "bg-primary text-white border-primary"
                          : "bg-card border-border text-muted-fg hover:border-accent/40"
                      }`}
                    >
                      {abbr}
                    </button>
                  )
                })}
              </div>
            </div>
            <div>
              <p className="text-xs text-muted-fg mb-1.5">Номер пары</p>
              <div className="flex gap-1.5">
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <button
                    key={n}
                    onClick={() => setMoveNum(n)}
                    className={`w-9 h-9 text-sm font-bold rounded-xl border transition-all ${
                      moveNum === n
                        ? "bg-primary text-white border-primary"
                        : "bg-card border-border text-muted-fg hover:border-accent/40"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <p className="text-[11px] text-amber bg-amber-bg border border-amber/20 rounded-xl px-3 py-2">
              После сохранения уточните детали переноса
            </p>
            <button
              onClick={save}
              className="w-full py-3 bg-primary text-white rounded-2xl text-sm font-bold"
            >
              Далее →
            </button>
          </div>
        ) : action === "room" ? (
          <div className="space-y-3">
            <button
              onClick={() => setAction(null)}
              className="flex items-center gap-1 text-xs text-muted-fg"
            >
              {I.chev("left", 12)} Назад
            </button>
            <div className="space-y-1">
              {buildings.map((b) => (
                <button
                  key={b}
                  onClick={() => setBuilding(b)}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl border transition-all ${
                    building === b
                      ? "border-accent bg-muted"
                      : "border-border bg-card hover:border-accent/40"
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                      building === b ? "border-primary" : "border-border"
                    }`}
                  >
                    {building === b && (
                      <div className="w-2 h-2 rounded-full bg-primary" />
                    )}
                  </div>
                  <span className="text-sm font-medium text-fg">{b}</span>
                </button>
              ))}
            </div>
            <input
              value={room}
              onChange={(e) => setRoom(e.target.value)}
              placeholder="Аудитория"
              className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-accent bg-card text-fg"
            />
            {building !== cls.building && walk !== null && walk > 0 && (
              <p className="text-xs text-amber bg-amber-bg border border-amber/20 rounded-xl px-3 py-2">
                Переход: {walk} мин от {BGEN[cls.building] ?? cls.building}
              </p>
            )}
            <button
              onClick={save}
              className="w-full py-3 bg-primary text-white rounded-2xl text-sm font-bold"
            >
              Сохранить
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <button
              onClick={() => setAction(null)}
              className="flex items-center gap-1 text-xs text-muted-fg"
            >
              {I.chev("left", 12)} Назад
            </button>
            <div>
              <p className="text-xs text-muted-fg mb-1">ФИО преподавателя</p>
              <input
                value={teacher}
                onChange={(e) => setTeacher(e.target.value)}
                className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-accent bg-card text-fg"
              />
            </div>
            <button
              onClick={save}
              className="w-full py-3 bg-primary text-white rounded-2xl text-sm font-bold"
            >
              Сохранить
            </button>
          </div>
        )}
      </div>
    </Sheet>
  )
}

// ─── Homework Sheet ───────────────────────────────────────────────────────────

function HomeworkSheet({
  cls,
  homework,
  personal,
  role,
  konspekt,
  onClose,
  onHwChange,
  onPnChange,
  onKonspektChange,
}: {
  cls: ClassItem
  homework?: Homework
  personal?: PersonalNote
  role: UserRole
  konspekt?: KonspektEntry
  onClose: () => void
  onHwChange: (h: Homework) => void
  onPnChange: (n: PersonalNote) => void
  onKonspektChange: (classId: number, k: KonspektEntry) => void
}) {
  const [tab, setTab] = useState<"group" | "personal" | "konspekt">("group")
  const [editing, setEditing] = useState(false)
  const [draftText, setDraftText] = useState(homework?.text ?? "")
  const [draftDl, setDraftDl] = useState(homework?.deadline ?? "")
  const [draftLink, setDraftLink] = useState(homework?.link ?? "")
  const [hwDone, setHwDone] = useState(false)
  const [newTodo, setNewTodo] = useState("")
  const [draftKonspekt, setDraftKonspekt] = useState(konspekt?.text ?? "")
  const [editingKonspekt, setEditingKonspekt] = useState(false)
  const [konspektFiles, setKonspektFiles] = useState<KonspektFile[]>(
    konspekt?.files ?? [],
  )
  const todos = personal?.todos ?? []

  function save() {
    onHwChange({
      classId: cls.id,
      text: draftText,
      deadline: draftDl,
      link: draftLink || undefined,
      linkLabel: "Ссылка на материалы",
      author: "Анна К. (Старостa)",
      updatedAt: "Только что",
    })
    setEditing(false)
  }
  function toggle(id: number) {
    onPnChange({
      classId: cls.id,
      todos: todos.map((t) => (t.id === id ? { ...t, done: !t.done } : t)),
    })
  }
  function add() {
    if (!newTodo.trim()) return
    onPnChange({
      classId: cls.id,
      todos: [...todos, { id: Date.now(), text: newTodo.trim(), done: false }],
    })
    setNewTodo("")
  }
  function del(id: number) {
    onPnChange({ classId: cls.id, todos: todos.filter((t) => t.id !== id) })
  }

  function handleKFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files) return
    const newF: KonspektFile[] = Array.from(files).map((f) => ({
      name: f.name,
      size:
        f.size > 1024 * 1024
          ? `${(f.size / 1024 / 1024).toFixed(1)} МБ`
          : `${Math.round(f.size / 1024)} КБ`,
      date: new Date().toLocaleDateString("ru-RU", {
        day: "numeric",
        month: "short",
      }),
    }))
    const updated = [...newF, ...konspektFiles]
    setKonspektFiles(updated)
    onKonspektChange(cls.id, { text: konspekt?.text ?? "", files: updated })
    e.target.value = ""
  }

  function saveKonspekt() {
    const entry = { text: draftKonspekt, files: konspektFiles }
    onKonspektChange(cls.id, entry)
    setEditingKonspekt(false)
  }

  return (
    <Sheet onClose={onClose}>
      <div className="px-4 pb-2 pt-1 flex items-start justify-between flex-shrink-0">
        <div>
          <p className="text-xs text-muted-fg font-semibold uppercase tracking-wider">
            {TYPE_CFG[cls.type].label} · Пара {cls.num}
          </p>
          <h2 className="text-base font-bold text-fg mt-0.5">{cls.subject}</h2>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-xl hover:bg-muted text-muted-fg"
        >
          {I.close(18)}
        </button>
      </div>
      <div className="px-4 pb-3">
        <div className="flex bg-muted rounded-xl p-0.5 gap-0.5">
          {(["group", "personal", "konspekt"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2 text-[11px] font-semibold rounded-lg transition-all ${
                tab === t
                  ? "bg-primary text-white shadow-sm"
                  : "text-muted-fg hover:text-fg"
              }`}
            >
              {t === "group"
                ? "ДЗ группы"
                : t === "personal"
                  ? "Заметки"
                  : "Конспект"}
            </button>
          ))}
        </div>
      </div>
      <div className="px-4 pb-8">
        {tab === "group" ? (
          homework && !editing ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-fg">
                  {homework.author} · {homework.updatedAt}
                </p>
                {role === "headstudent" && (
                  <button
                    onClick={() => {
                      setEditing(true)
                      setDraftText(homework.text)
                      setDraftDl(homework.deadline)
                      setDraftLink(homework.link ?? "")
                    }}
                    className="flex items-center gap-1 text-xs text-primary font-semibold"
                  >
                    {I.pencil(12)} Ред.
                  </button>
                )}
              </div>
              <p className="text-sm text-fg leading-relaxed bg-muted rounded-xl px-3 py-3">
                {homework.text}
              </p>
              {homework.deadline && (
                <div className="flex items-center gap-2 text-xs font-semibold text-amber bg-amber-bg border border-amber/20 rounded-xl px-3 py-2">
                  {I.clock(13)} Дедлайн: {homework.deadline}
                </div>
              )}
              {homework.link && (
                <a
                  href={homework.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-xs text-primary font-semibold border border-border rounded-xl px-3 py-2.5 bg-card hover:border-accent/50 transition-colors"
                >
                  {I.link(12)} {homework.linkLabel ?? "Материалы"}
                  {I.ext(11, "ml-auto text-muted-fg")}
                </a>
              )}
              <button
                onClick={() => setHwDone((d) => !d)}
                className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold border transition-all ${
                  hwDone
                    ? "bg-muted border-accent text-primary"
                    : "bg-card border-border text-fg hover:border-accent/50"
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${
                    hwDone ? "bg-primary border-primary" : "border-border"
                  }`}
                >
                  {hwDone && I.check(11, "text-white")}
                </div>
                {hwDone ? "Выполнено" : "Отметить как выполненное"}
              </button>
            </div>
          ) : editing ? (
            <div className="space-y-3">
              <textarea
                value={draftText}
                onChange={(e) => setDraftText(e.target.value)}
                placeholder="Описание задания..."
                className="w-full border border-border rounded-xl px-3 py-3 text-sm focus:outline-none focus:border-accent resize-none bg-card text-fg"
                rows={4}
              />
              <input
                value={draftDl}
                onChange={(e) => setDraftDl(e.target.value)}
                placeholder="Дедлайн (необязательно)"
                className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-accent bg-card text-fg"
              />
              <input
                value={draftLink}
                onChange={(e) => setDraftLink(e.target.value)}
                placeholder="Ссылка на материалы (опционально)"
                className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-accent bg-card text-fg"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => setEditing(false)}
                  className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold text-muted-fg"
                >
                  Отмена
                </button>
                <button
                  onClick={save}
                  className="flex-1 py-2.5 rounded-xl bg-primary text-white text-sm font-bold"
                >
                  Сохранить
                </button>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 space-y-3">
              <p className="text-sm font-semibold text-fg">Задания нет</p>
              {role === "headstudent" && (
                <button
                  onClick={() => {
                    setEditing(true)
                    setDraftText("")
                    setDraftDl("")
                    setDraftLink("")
                  }}
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary border border-primary rounded-xl px-4 py-2.5 hover:bg-muted transition-colors"
                >
                  {I.plus(13)} Добавить задание
                </button>
              )}
            </div>
          )
        ) : tab === "personal" ? (
          <div className="space-y-3">
            {todos.length === 0 && (
              <p className="text-xs text-muted-fg text-center py-4">
                Добавьте личные заметки
              </p>
            )}
            {todos.map((todo) => (
              <div key={todo.id} className="flex items-center gap-3 group">
                <button
                  onClick={() => toggle(todo.id)}
                  className={`w-5 h-5 rounded-md border-2 flex-shrink-0 flex items-center justify-center transition-all ${
                    todo.done
                      ? "bg-primary border-primary"
                      : "border-border hover:border-accent"
                  }`}
                >
                  {todo.done && I.check(10, "text-white")}
                </button>
                <span
                  className={`flex-1 text-sm ${
                    todo.done ? "line-through text-muted-fg" : "text-fg"
                  }`}
                >
                  {todo.text}
                </span>
                <button
                  onClick={() => del(todo.id)}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded-lg hover:bg-muted text-muted-fg transition-opacity"
                >
                  {I.close(13)}
                </button>
              </div>
            ))}
            <div className="flex gap-2 pt-1">
              <input
                value={newTodo}
                onChange={(e) => setNewTodo(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") add()
                }}
                placeholder="Добавить заметку..."
                className="flex-1 border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-accent bg-card text-fg placeholder:text-muted-fg"
              />
              <button
                onClick={add}
                className="px-3 py-2 bg-primary text-white rounded-xl"
              >
                {I.plus(14, "text-white")}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-muted-fg">
              Конспект именно этой пары — только для вас
            </p>
            <label className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-accent/40 bg-muted/50 hover:bg-muted rounded-2xl py-3 cursor-pointer transition-colors">
              <input
                type="file"
                className="hidden"
                multiple
                accept=".pdf,.doc,.docx,.jpg,.png,.zip,.txt"
                onChange={handleKFiles}
              />
              {I.upload(14, "text-primary")}
              <span className="text-sm font-semibold text-primary">
                Прикрепить файл
              </span>
            </label>
            {konspektFiles.length > 0 && (
              <div className="space-y-1.5">
                {konspektFiles.map((f, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 bg-card border border-border rounded-xl px-3 py-2.5"
                  >
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-muted text-primary uppercase">
                      {f.name.split(".").pop() ?? ""}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-fg truncate">
                        {f.name}
                      </p>
                      <p className="text-xs text-muted-fg">
                        {f.size} · {f.date}
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        const updated = konspektFiles.filter((_, j) => j !== i)
                        setKonspektFiles(updated)
                        onKonspektChange(cls.id, {
                          text: konspekt?.text ?? "",
                          files: updated,
                        })
                      }}
                      className="p-1 rounded-lg hover:bg-muted text-muted-fg"
                    >
                      {I.close(13)}
                    </button>
                  </div>
                ))}
              </div>
            )}
            {editingKonspekt ? (
              <div className="space-y-2">
                <textarea
                  value={draftKonspekt}
                  onChange={(e) => setDraftKonspekt(e.target.value)}
                  placeholder="Ключевые мысли, определения, формулы..."
                  className="w-full border border-border rounded-xl px-3 py-3 text-sm focus:outline-none focus:border-accent resize-none bg-card text-fg"
                  rows={6}
                  autoFocus
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setEditingKonspekt(false)
                      setDraftKonspekt(konspekt?.text ?? "")
                    }}
                    className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold text-muted-fg"
                  >
                    Отмена
                  </button>
                  <button
                    onClick={saveKonspekt}
                    className="flex-1 py-2.5 rounded-xl bg-primary text-white text-sm font-bold"
                  >
                    Сохранить
                  </button>
                </div>
              </div>
            ) : konspekt?.text ? (
              <div className="space-y-2">
                <div className="bg-muted rounded-xl px-3 py-3 text-sm text-fg whitespace-pre-wrap leading-relaxed">
                  {konspekt.text}
                </div>
                <button
                  onClick={() => {
                    setDraftKonspekt(konspekt.text)
                    setEditingKonspekt(true)
                  }}
                  className="flex items-center gap-1.5 text-xs font-semibold text-primary"
                >
                  {I.pencil(12)} Редактировать
                </button>
              </div>
            ) : (
              <div className="text-center py-4 space-y-2">
                <p className="text-sm text-muted-fg">
                  {konspektFiles.length > 0
                    ? "Добавьте текстовые заметки к файлам"
                    : "Текстовый конспект пока пуст"}
                </p>
                <button
                  onClick={() => {
                    setDraftKonspekt("")
                    setEditingKonspekt(true)
                  }}
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary border border-primary rounded-xl px-4 py-2 hover:bg-muted transition-colors"
                >
                  {I.note(13)} Написать конспект
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </Sheet>
  )
}

// ─── Discipline Sheet ─────────────────────────────────────────────────────────

function DisciplineSheet({
  subject,
  teacher,
  role,
  onClose,
}: {
  subject: string
  teacher: string
  role?: UserRole
  onClose: () => void
}) {
  const isHead = role === "headstudent"
  const [tab, setTab] =
    useState<"about" | "materials" | "notes" | "literature">("about")
  const [notes, setNotes] = useState("")
  const [editingNotes, setEditingNotes] = useState(false)
  const [draftNotes, setDraftNotes] = useState("")
  const [editingAbout, setEditingAbout] = useState(false)
  const [aboutOverride, setAboutOverride] = useState<{
    department?: string
    consultations?: string
    exam?: string
    email?: string
    teacher?: string
  }>({})
  const [draftAbout, setDraftAbout] = useState({
    department: "",
    consultations: "",
    exam: "",
    email: "",
    teacher: "",
  })
  const [litItems, setLitItems] = useState<{
    title: string
    author: string
    year: number
    url: string
    library: string
  }[]>([])
  const [addingLit, setAddingLit] = useState(false)
  const [litForm, setLitForm] = useState({
    title: "",
    author: "",
    year: new Date().getFullYear(),
    url: "",
    library: "",
  })
  const [uploads, setUploads] = useState<{
    name: string
    size: string
    date: string
  }[]>([])
  const [extraContacts, setExtraContacts] = useState<{
    type: string
    value: string
  }[]>([])
  const [addingContact, setAddingContact] = useState(false)
  const [contactForm, setContactForm] = useState({ type: "Телефон", value: "" })
  const info = getDefaultDiscipline(subject)
  const fileIcon: Record<string, string> = {
    pdf: "PDF",
    doc: "DOC",
    zip: "ZIP",
  }

  const displayEmail =
    aboutOverride.email !== undefined ? aboutOverride.email : info.email
  const displayTeacher =
    aboutOverride.teacher !== undefined ? aboutOverride.teacher : teacher

  function openEdit() {
    setDraftAbout({
      department: aboutOverride.department ?? info.department,
      consultations: aboutOverride.consultations ?? info.consultations,
      exam: aboutOverride.exam ?? info.exam,
      email: displayEmail,
      teacher: displayTeacher,
    })
    setEditingAbout(true)
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files) return
    const newFiles = Array.from(files).map((f) => ({
      name: f.name,
      size:
        f.size > 1024 * 1024
          ? `${(f.size / 1024 / 1024).toFixed(1)} МБ`
          : `${Math.round(f.size / 1024)} КБ`,
      date: new Date().toLocaleDateString("ru-RU", {
        day: "numeric",
        month: "short",
      }),
    }))
    setUploads((u) => [...newFiles, ...u])
    e.target.value = ""
  }

  return (
    <Sheet onClose={onClose}>
      <div className="px-4 pb-2 pt-1 flex items-start justify-between flex-shrink-0">
        <div>
          <p className="text-xs text-muted-fg font-semibold uppercase tracking-wider">
            Дисциплина
          </p>
          <h2 className="text-base font-bold text-fg mt-0.5 pr-8">{subject}</h2>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-xl hover:bg-muted text-muted-fg flex-shrink-0"
        >
          {I.close(18)}
        </button>
      </div>
      <div className="px-4 pb-2">
        <div className="flex bg-muted rounded-xl p-0.5 gap-0.5">
          {([
            ["about", "О предмете"],
            ["materials", "Материалы"],
            ["notes", "Заметки"],
            ["literature", "Литература"],
          ] as [string, string][]).map(([t, l]) => (
            <button
              key={t}
              onClick={() => setTab(t as typeof tab)}
              className={`flex-1 py-1.5 text-[11px] font-semibold rounded-lg transition-all ${
                tab === t
                  ? "bg-primary text-white shadow-sm"
                  : "text-muted-fg hover:text-fg"
              }`}
            >
              {l}
            </button>
          ))}
        </div>
      </div>
      <div className="px-4 pb-8">
        {tab === "about" && (
          <div className="space-y-2.5 pt-1">
            {isHead && !editingAbout && (
              <button
                onClick={openEdit}
                className="flex items-center gap-1.5 text-xs font-semibold text-primary border border-primary/30 rounded-xl px-3 py-1.5 hover:bg-muted transition-colors"
              >
                {I.pencil(12)} Редактировать контакты и информацию
              </button>
            )}
            {editingAbout ? (
              <div className="space-y-2">
                {([
                  { key: "department" as const, label: "Кафедра" },
                  { key: "teacher" as const, label: "Преподаватель (ФИО)" },
                  { key: "email" as const, label: "Email преподавателя" },
                  { key: "consultations" as const, label: "Консультации" },
                  { key: "exam" as const, label: "Форма аттестации" },
                ] as { key: keyof typeof draftAbout; label: string }[]).map(
                  ({ key, label }) => (
                    <div key={key}>
                      <p className="text-[11px] text-muted-fg mb-1">{label}</p>
                      <input
                        value={draftAbout[key]}
                        onChange={(e) =>
                          setDraftAbout((p) => ({
                            ...p,
                            [key]: e.target.value,
                          }))
                        }
                        className="w-full border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-accent bg-card text-fg"
                      />
                    </div>
                  ),
                )}
                <div className="flex gap-2">
                  <button
                    onClick={() => setEditingAbout(false)}
                    className="flex-1 py-2 rounded-xl border border-border text-sm font-semibold text-muted-fg"
                  >
                    Отмена
                  </button>
                  <button
                    onClick={() => {
                      setAboutOverride(draftAbout)
                      setEditingAbout(false)
                    }}
                    className="flex-1 py-2 bg-primary text-white rounded-xl text-sm font-bold"
                  >
                    Сохранить
                  </button>
                </div>
              </div>
            ) : (
              <>
                {[
                  {
                    label: "Кафедра",
                    value: aboutOverride.department ?? info.department,
                  },
                  { label: "Преподаватель", value: displayTeacher },
                  {
                    label: "Консультации",
                    value: aboutOverride.consultations ?? info.consultations,
                  },
                  {
                    label: "Аттестация",
                    value: aboutOverride.exam ?? info.exam,
                  },
                ].map((row) => (
                  <div
                    key={row.label}
                    className="bg-muted rounded-xl px-3 py-2.5"
                  >
                    <p className="text-[11px] text-muted-fg font-semibold uppercase tracking-wide">
                      {row.label}
                    </p>
                    <p className="text-sm text-fg mt-0.5">{row.value}</p>
                  </div>
                ))}
                {displayEmail && (
                  <a
                    href={`mailto:${displayEmail}`}
                    className="flex items-center gap-2 text-sm font-semibold text-primary border border-border rounded-xl px-3 py-2.5 bg-card hover:border-accent/50 transition-colors"
                  >
                    {I.mail(13, "text-primary")} {displayEmail}
                  </a>
                )}
                {extraContacts.map((c, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 bg-card border border-border rounded-xl px-3 py-2.5"
                  >
                    <span className="text-xs font-bold text-muted-fg bg-muted px-1.5 py-0.5 rounded">
                      {c.type}
                    </span>
                    <span className="text-sm text-fg flex-1">{c.value}</span>
                    {isHead && (
                      <button
                        onClick={() =>
                          setExtraContacts((p) => p.filter((_, j) => j !== i))
                        }
                        className="p-1 rounded-lg hover:bg-muted text-muted-fg"
                      >
                        {I.close(12)}
                      </button>
                    )}
                  </div>
                ))}
                {isHead &&
                  !editingAbout &&
                  (addingContact ? (
                    <div className="bg-muted rounded-xl p-3 space-y-2">
                      <div className="flex gap-1.5 flex-wrap">
                        {["Телефон", "Telegram", "ВКонтакте", "Сайт"].map(
                          (t) => (
                            <button
                              key={t}
                              onClick={() =>
                                setContactForm((f) => ({ ...f, type: t }))
                              }
                              className={`px-2.5 py-1 text-xs font-semibold rounded-xl border transition-all ${
                                contactForm.type === t
                                  ? "bg-primary text-white border-primary"
                                  : "bg-card border-border text-muted-fg"
                              }`}
                            >
                              {t}
                            </button>
                          ),
                        )}
                      </div>
                      <input
                        value={contactForm.value}
                        onChange={(e) =>
                          setContactForm((f) => ({
                            ...f,
                            value: e.target.value,
                          }))
                        }
                        placeholder={`${contactForm.type}...`}
                        className="w-full border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-accent bg-card text-fg"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => setAddingContact(false)}
                          className="flex-1 py-1.5 rounded-xl border border-border text-xs font-semibold text-muted-fg"
                        >
                          Отмена
                        </button>
                        <button
                          onClick={() => {
                            if (contactForm.value.trim()) {
                              setExtraContacts((p) => [...p, contactForm])
                              setContactForm({ type: "Телефон", value: "" })
                              setAddingContact(false)
                            }
                          }}
                          className="flex-1 py-1.5 bg-primary text-white rounded-xl text-xs font-bold"
                        >
                          Добавить
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setAddingContact(true)}
                      className="flex items-center gap-1.5 text-xs font-semibold text-primary"
                    >
                      {I.plus(12)} Добавить контакт преподавателя
                    </button>
                  ))}
              </>
            )}
          </div>
        )}
        {tab === "materials" && (
          <div className="space-y-2 pt-1">
            <label className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-accent/40 bg-muted/60 rounded-2xl py-4 cursor-pointer hover:bg-muted transition-colors">
              <input
                type="file"
                className="hidden"
                multiple
                onChange={handleFileInput}
                accept=".pdf,.doc,.docx,.zip,.jpg,.png"
              />
              {I.plus(15, "text-primary")}
              <span className="text-sm font-semibold text-primary">
                Загрузить материал
              </span>
            </label>
            {uploads.map((u, i) => (
              <div
                key={i}
                className="flex items-center gap-3 bg-card border border-border rounded-xl px-3 py-3"
              >
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-muted text-primary uppercase">
                  {u.name.split(".").pop() ?? ""}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-fg truncate">
                    {u.name}
                  </p>
                  <p className="text-xs text-muted-fg">
                    {u.size} · {u.date}
                  </p>
                </div>
                <button
                  onClick={() =>
                    setUploads((up) => up.filter((_, j) => j !== i))
                  }
                  className="p-1.5 rounded-lg hover:bg-muted text-muted-fg"
                >
                  {I.close(13)}
                </button>
              </div>
            ))}
            {info.materials.length === 0 && uploads.length === 0 ? (
              <p className="text-sm text-muted-fg text-center py-4">
                Материалов пока нет
              </p>
            ) : (
              info.materials.map((m) => (
                <a
                  key={m.name}
                  href={m.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 bg-card border border-border rounded-xl px-3 py-3 hover:border-accent/50 transition-colors"
                >
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-muted text-muted-fg">
                    {fileIcon[m.type] ?? m.type.toUpperCase()}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-fg truncate">
                      {m.name}
                    </p>
                  </div>
                  {I.ext(12, "text-muted-fg flex-shrink-0")}
                </a>
              ))
            )}
          </div>
        )}
        {tab === "notes" && (
          <div className="space-y-3 pt-1">
            {editingNotes ? (
              <div className="space-y-2">
                <textarea
                  value={draftNotes}
                  onChange={(e) => setDraftNotes(e.target.value)}
                  placeholder="Общие заметки, важные даты..."
                  className="w-full border border-border rounded-xl px-3 py-3 text-sm focus:outline-none focus:border-accent resize-none bg-card text-fg"
                  rows={6}
                  autoFocus
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => setEditingNotes(false)}
                    className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold text-muted-fg"
                  >
                    Отмена
                  </button>
                  <button
                    onClick={() => {
                      setNotes(draftNotes)
                      setEditingNotes(false)
                    }}
                    className="flex-1 py-2.5 rounded-xl bg-primary text-white text-sm font-bold"
                  >
                    Сохранить
                  </button>
                </div>
              </div>
            ) : notes ? (
              <div className="space-y-2">
                <div className="bg-muted rounded-xl px-3 py-3 text-sm text-fg whitespace-pre-wrap">
                  {notes}
                </div>
                {isHead && (
                  <button
                    onClick={() => {
                      setDraftNotes(notes)
                      setEditingNotes(true)
                    }}
                    className="flex items-center gap-1.5 text-xs font-semibold text-primary"
                  >
                    {I.pencil(12)} Редактировать
                  </button>
                )}
              </div>
            ) : isHead ? (
              <div className="text-center py-8 space-y-3">
                <p className="text-sm text-muted-fg">Заметок пока нет</p>
                <button
                  onClick={() => {
                    setDraftNotes("")
                    setEditingNotes(true)
                  }}
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary border border-primary rounded-xl px-4 py-2.5 hover:bg-muted transition-colors"
                >
                  {I.plus(13)} Добавить
                </button>
              </div>
            ) : (
              <p className="text-sm text-muted-fg text-center py-8">
                Заметок пока нет
              </p>
            )}
          </div>
        )}
        {tab === "literature" && (
          <div className="space-y-2 pt-1">
            {isHead &&
              (addingLit ? (
                <div className="bg-muted rounded-2xl p-3 space-y-2">
                  {(["title", "author", "library", "url"] as const).map((k) => (
                    <input
                      key={k}
                      value={litForm[k]}
                      onChange={(e) =>
                        setLitForm((f) => ({ ...f, [k]: e.target.value }))
                      }
                      placeholder={
                        {
                          title: "Название",
                          author: "Автор",
                          library: "Источник (ЭБС...)",
                          url: "Ссылка",
                        }[k]
                      }
                      className="w-full border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-accent bg-card text-fg"
                    />
                  ))}
                  <input
                    type="number"
                    value={litForm.year}
                    onChange={(e) =>
                      setLitForm((f) => ({
                        ...f,
                        year: Number(e.target.value),
                      }))
                    }
                    placeholder="Год"
                    className="w-full border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-accent bg-card text-fg"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => setAddingLit(false)}
                      className="flex-1 py-2 rounded-xl border border-border text-sm font-semibold text-muted-fg"
                    >
                      Отмена
                    </button>
                    <button
                      onClick={() => {
                        if (litForm.title.trim()) {
                          setLitItems((p) => [...p, { ...litForm }])
                          setLitForm({
                            title: "",
                            author: "",
                            year: new Date().getFullYear(),
                            url: "",
                            library: "",
                          })
                          setAddingLit(false)
                        }
                      }}
                      className="flex-1 py-2 bg-primary text-white rounded-xl text-sm font-bold"
                    >
                      Добавить
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setAddingLit(true)}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-2xl border border-dashed border-accent/40 text-sm font-semibold text-primary hover:bg-muted transition-colors"
                >
                  {I.plus(13)} Добавить литературу
                </button>
              ))}
            {[...info.literature, ...litItems].length === 0 ? (
              <p className="text-sm text-muted-fg text-center py-6">
                Не заполнено
              </p>
            ) : (
              [...info.literature, ...litItems].map((lit, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 bg-card border border-border rounded-xl px-3 py-3"
                >
                  {I.book(18, "text-primary flex-shrink-0 mt-0.5")}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-fg leading-snug">
                      {lit.title}
                    </p>
                    <p className="text-xs text-muted-fg">
                      {lit.author}, {lit.year}
                    </p>
                    <p className="text-[11px] text-accent font-semibold mt-0.5">
                      {lit.library}
                    </p>
                  </div>
                  {lit.url && (
                    <a
                      href={lit.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="flex-shrink-0 mt-1"
                    >
                      {I.ext(12, "text-muted-fg hover:text-primary")}
                    </a>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </Sheet>
  )
}

// ─── Class Card ───────────────────────────────────────────────────────────────

function ClassCard({
  cls,
  isNow,
  nowMin,
  edit,
  homework,
  hasTodos,
  hasKonspekt,
  subgroupPref,
  weekday,
  movedFrom,
  onSubgroupTap,
  onNotesClick,
  onBuildingClick,
  onManage,
  onSubjectClick,
  isOddWeek = true,
  weekFilter = "current",
}: {
  cls: ClassItem
  isNow: boolean
  nowMin: number
  edit?: ClassEdit
  homework?: Homework
  hasTodos?: boolean
  hasKonspekt?: boolean
  subgroupPref?: SubgroupPref
  weekday?: string
  movedFrom?: string
  onSubgroupTap?: () => void
  onNotesClick?: () => void
  onBuildingClick?: (b: string) => void
  onManage?: () => void
  onSubjectClick?: () => void
  isOddWeek?: boolean
  weekFilter?: "current" | "all"
}) {
  const cfg = TYPE_CFG[cls.type]
  const cancelled = edit?.cancelled ?? false
  const displayBuilding = edit?.building ?? cls.building
  const displayRoom = edit?.room ?? cls.room
  const displayTeacher = edit?.teacher ?? cls.teacher
  const displayStart = edit?.startOverride ?? cls.start
  const displayEnd = edit?.endOverride ?? cls.end
  const hasTimeChange = !!(
    edit?.startOverride && edit.startOverride !== cls.start
  )
  const hasBuildingChange = !!(edit?.building && edit.building !== cls.building)
  const hasTeacherChange = !!(edit?.teacher && edit.teacher !== cls.teacher)
  const hasMoved = !!(
    edit?.dayOverride &&
    edit.dayOverride !== weekday &&
    !movedFrom
  )

  const subgroupLabel = { "1": "1-я", "2": "2-я", all: "Все п/г" }[
    subgroupPref ?? "all"
  ]

  // Progress for current class
  const startMin = toMin(displayStart)
  const endMin = toMin(displayEnd)
  const progressPct =
    isNow && !cancelled && endMin > startMin
      ? Math.min(
          100,
          Math.max(
            0,
            Math.round(((nowMin - startMin) / (endMin - startMin)) * 100),
          ),
        )
      : 0

  const barGrad = cancelled ? "bg-red" : movedFrom ? "bg-amber-500" : cfg.bar

  return (
    <div
      className={`relative flex rounded-2xl overflow-hidden border transition-all duration-200 ${
        cancelled
          ? "opacity-60 border-red-bg bg-card"
          : isNow && !cancelled
            ? "border-accent ring-2 ring-primary/30 shadow-md shadow-accent/10 bg-card"
            : "border-border bg-card hover:border-accent/40 hover:shadow-sm"
      }`}
    >
      <div
        className={`w-[6px] flex-shrink-0 ${barGrad}`}
        style={{
          background: movedFrom
            ? "linear-gradient(180deg,#f59e0b,#d97706)"
            : cancelled
              ? "var(--color-red)"
              : cls.type === "lecture"
                ? "linear-gradient(180deg,var(--color-primary),var(--color-primary-light))"
                : cls.type === "practice"
                  ? "linear-gradient(180deg,#f59e0b,#d97706)"
                  : "linear-gradient(180deg,var(--color-blue),#5ba3e0)",
        }}
      />
      <div className="flex-1 p-3.5 min-w-0">
        {movedFrom && (
          <div className="flex items-center gap-1.5 mb-2 text-[11px] font-semibold text-amber bg-amber-bg border border-amber/20 rounded-lg px-2.5 py-1.5">
            {I.arrowRight(11)} Перенесена с {movedFrom}
          </div>
        )}
        <div className="flex items-center gap-2 mb-1.5">
          <span
            className="text-base font-mono font-medium text-muted-fg w-5 flex-shrink-0"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            {edit?.numOverride ?? cls.num}
          </span>
          <span
            className={`text-sm font-mono font-semibold flex-shrink-0 ${
              hasTimeChange ? "text-red" : "text-fg"
            }`}
            style={{ fontFamily: "var(--font-mono)" }}
          >
            {displayStart}–{displayEnd}
          </span>
          {isNow && !cancelled && (
            <span className="flex items-center gap-1 text-xs font-bold text-white bg-accent px-2 py-0.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              Сейчас
            </span>
          )}
          {cancelled && (
            <span className="text-xs font-bold text-red bg-red-bg px-1.5 py-0.5 rounded-md">
              Отменена
            </span>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation()
              ;(onManage ?? onNotesClick)?.()
            }}
            className="ml-auto p-1 rounded-lg hover:bg-muted text-muted-fg transition-colors"
          >
            {I.dots(16)}
          </button>
        </div>
        {isNow && !cancelled && progressPct > 0 && (
          <div className="w-full h-1 bg-muted rounded-full overflow-hidden mb-2">
            <div
              className="h-full rounded-full bg-accent transition-all duration-1000"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        )}
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <button
            onClick={onSubjectClick}
            className={`text-sm font-bold leading-snug flex-1 min-w-0 text-left hover:underline underline-offset-2 decoration-accent/50 transition-colors ${
              cancelled ? "line-through text-muted-fg" : "text-fg"
            }`}
          >
            {cls.subject}
          </button>
          <div className="flex gap-1 flex-wrap justify-end items-center max-w-[44%]">
            <span
              className={`text-[11px] px-1.5 py-0.5 rounded-md font-semibold flex-shrink-0 ${cfg.chip}`}
            >
              {cfg.label}
            </span>
            {weekFilter === "all" && cls.weekType && cls.weekType !== "all" && (() => {
              const isNotThisWeek =
                (isOddWeek && cls.weekType === "even") ||
                (!isOddWeek && cls.weekType === "odd")
              const isOdd = cls.weekType === "odd"
              const badgeText = isNotThisWeek
                ? isOdd
                  ? "Верхняя нед. (не на этой неделе)"
                  : "Нижняя нед. (не на этой неделе)"
                : isOdd
                  ? "Верхняя"
                  : "Нижняя"
              return (
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded-md font-bold flex-shrink-0 ${
                    isOdd
                      ? "bg-blue-bg text-blue border border-blue/30"
                      : "bg-amber-bg text-amber border border-amber/30"
                  }`}
                  title={
                    isOdd
                      ? !isOddWeek
                        ? "Верхняя пара · Не проводится на этой неделе (Числитель)"
                        : "Верхняя пара · Нечётная неделя (Числитель)"
                      : isOddWeek
                        ? "Нижняя пара · Не проводится на этой неделе (Знаменатель)"
                        : "Нижняя пара · Чётная неделя (Знаменатель)"
                  }
                >
                  {badgeText}
                </span>
              )
            })()}
            {cls.subgroup && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onSubgroupTap?.()
                }}
                className="flex items-center gap-0.5 text-[11px] px-1.5 py-0.5 rounded-md font-semibold bg-muted text-muted-fg hover:bg-border transition-colors flex-shrink-0"
              >
                {subgroupLabel}
                {I.chev("down", 9)}
              </button>
            )}
            {cancelled && edit?.cancelReason && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-red-bg text-red font-medium flex-shrink-0 truncate max-w-[90px]">
                {edit.cancelReason}
              </span>
            )}
            {homework && (
              <span className="text-[11px] px-1.5 py-0.5 rounded-md font-semibold bg-amber-bg text-amber border border-amber/20 flex-shrink-0 animate-bounce-in">
                ДЗ
              </span>
            )}
            {hasKonspekt && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-md font-semibold bg-muted text-muted-fg flex-shrink-0">
                📝
              </span>
            )}
            {hasTodos && !homework && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-md font-semibold bg-primary/10 text-primary flex-shrink-0">
                {I.pencil(9)}
              </span>
            )}
          </div>
        </div>
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-xs text-muted-fg">
            {I.user(12, "flex-shrink-0")}
            <span className="truncate">{displayTeacher}</span>
          </div>
          <a
            href={`https://yandex.ru/maps/?text=${encodeURIComponent("РГАУ-МСХА " + displayBuilding)}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-1.5 text-xs text-primary hover:text-accent transition-colors"
          >
            {I.map(12)}
            <span>
              {displayBuilding}, ауд.&nbsp;{displayRoom}
            </span>
          </a>
        </div>
        {(hasMoved ||
          hasTimeChange ||
          hasBuildingChange ||
          hasTeacherChange) && (
          <div className="flex gap-1 flex-wrap mt-1.5">
            {hasMoved && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-amber-bg text-amber font-bold border border-amber/20 flex-shrink-0 animate-slide-right">
                →{" "}
                {({
                  Понедельник: "Пн",
                  Вторник: "Вт",
                  Среда: "Ср",
                  Четверг: "Чт",
                  Пятница: "Пт",
                  Суббота: "Сб",
                } as Record<string, string>)[edit?.dayOverride ?? ""] ??
                  edit?.dayOverride?.slice(0, 2)}
                , п.{edit?.numOverride}
              </span>
            )}
            {hasTimeChange && !hasMoved && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-blue-bg text-blue font-bold border border-blue/20 flex-shrink-0 animate-slide-right">
                ⏱ {edit?.startOverride}–{edit?.endOverride}
              </span>
            )}
            {hasBuildingChange && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-muted text-muted-fg font-semibold flex-shrink-0 animate-slide-right">
                📍 {edit?.building?.slice(0, 10)}
              </span>
            )}
            {hasTeacherChange && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-muted text-muted-fg font-semibold flex-shrink-0 animate-slide-right">
                👤 Замена
              </span>
            )}
          </div>
        )}
        {cancelled && edit?.cancelNote && (
          <p className="mt-1.5 text-xs text-muted-fg bg-muted rounded-xl px-3 py-1.5">
            {edit.cancelNote}
          </p>
        )}
        {hasMoved && edit?.displacedNote && (
          <p className="mt-1 text-[11px] text-amber">
            Слот: {edit.displacedNote}
          </p>
        )}
        {onNotesClick && (
          <button
            onClick={onNotesClick}
            className="mt-2.5 flex items-center gap-1.5 text-xs text-muted-fg hover:text-primary transition-colors"
          >
            {I.book(12)}
            <span>{homework ? "ДЗ и заметки" : "Заметки"}</span>
            {I.chev("right", 11)}
          </button>
        )}

</div>
    </div>
  )
}

// ─── Moved-away Placeholder ───────────────────────────────────────────────────

function MovedAwayCard({
  cls,
  toDay,
  toNum,
}: {
  cls: ClassItem
  toDay: string
  toNum: number
}) {
  return (
    <div className="relative flex rounded-2xl overflow-hidden border border-border bg-card opacity-50">
      <div className="w-[3px] flex-shrink-0 bg-muted-fg" />
      <div className="flex-1 px-3.5 py-3 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span
            className="text-base font-mono text-muted-fg"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            {cls.num}
          </span>
          <span
            className="text-sm font-mono text-muted-fg line-through"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            {cls.start}–{cls.end}
          </span>
          <span className="ml-auto text-[11px] bg-muted text-muted-fg px-2 py-0.5 rounded-lg font-semibold flex items-center gap-1">
            {I.arrowRight(10)} {toDay?.slice(0, 2)}, п.{toNum}
          </span>
        </div>
        <p className="text-sm text-muted-fg line-through truncate">
          {cls.subject}
        </p>

</div>
    </div>
  )
}

// ─── Day View ─────────────────────────────────────────────────────────────────

function DayView({
  dateStr,
  search,
  homework,
  personal,
  role,
  classEdits,
  subgroupPrefs,
  dorm,
  konspekts,
  dormDismissed,
  dismissedEvents,
  showDormBanner,
  showEventBanners,
  movedInEntries,
  nowMin,
  onDismissDorm,
  onDismissEvent,
  onBuildingClick,
  onNotesClick,
  onManageClass,
  onSubgroupTap,
  onSubjectClick,
  onEat,
  allDays,
}: {
  allDays?: DaySchedule[]
  dateStr: string
  search: string
  homework: Homework[]
  personal: PersonalNote[]
  konspekts: Record<number, KonspektEntry>
  role: UserRole
  classEdits: Record<number, ClassEdit>
  subgroupPrefs: Record<string, SubgroupPref>
  dorm: string
  dormDismissed: boolean
  dismissedEvents: number[]
  showDormBanner: boolean
  showEventBanners: boolean
  movedInEntries: MovedInEntry[]
  nowMin: number
  onDismissDorm: () => void
  onDismissEvent: (id: number) => void
  onBuildingClick: (b: string) => void
  onNotesClick: (id: number) => void
  onManageClass: (id: number) => void
  onSubgroupTap: (cls: ClassItem) => void
  onSubjectClick: (cls: ClassItem) => void
  onEat: () => void
}) {
  const [restOpen, setRestOpen] = useState(false)
  const [weekFilter, setWeekFilter] = useState<"current" | "all">("current")
  const activeDays = allDays ?? ALL_DAYS
  const data = activeDays.find((d) => d.date === dateStr)
  const isToday = dateStr === TODAY
  const todayEvents = getAppEvents().filter(
    (e) =>
      e.date === dateStr &&
      !dismissedEvents.includes(e.id) &&
      e.category === "announcement" &&
      (e.title.toLowerCase().includes("расписан") ||
        e.title.toLowerCase().includes("пар") ||
        e.title.toLowerCase().includes("занят") ||
        e.title.toLowerCase().includes("сесси") ||
        e.title.toLowerCase().includes("перенос")),
  )
  const weekNum = getStudyWeek(dateStr)
  const isOddWeek = weekNum % 2 !== 0

  if (!data)
    return (
      <div className="text-center py-16 text-muted-fg text-sm px-4">
        Нет данных
      </div>
    )

  type ListEntry = { type: "native"; cls: ClassItem } | {
    type: "movedin"
    cls: ClassItem
    fromDay: string
  } | { type: "movedaway"; cls: ClassItem }
  const entries: ListEntry[] = []

  data.classes.forEach((c) => {
    if (weekFilter === "current" && c.weekType && c.weekType !== "all") {
      if (isOddWeek && c.weekType === "even") return
      if (!isOddWeek && c.weekType === "odd") return
    }
    if (c.subgroup) {
      const pref = subgroupPrefs[c.subject] ?? "all"
      if (pref !== "all" && c.subgroup !== Number(pref)) return
    }
    if (search) {
      const q = search.toLowerCase()
      if (
        !c.subject.toLowerCase().includes(q) &&
        !c.teacher.toLowerCase().includes(q)
      )
        return
    }
    const edit = classEdits[c.id]
    if (edit?.dayOverride && edit.dayOverride !== data.weekday) {
      entries.push({ type: "movedaway", cls: c })
    } else {
      entries.push({ type: "native", cls: c })
    }
  })

  movedInEntries.forEach(({ cls, fromWeekday }) => {
    if (weekFilter === "current" && cls.weekType && cls.weekType !== "all") {
      if (isOddWeek && cls.weekType === "even") return
      if (!isOddWeek && cls.weekType === "odd") return
    }
    if (
      !search ||
      cls.subject.toLowerCase().includes(search.toLowerCase()) ||
      cls.teacher.toLowerCase().includes(search.toLowerCase())
    )
      entries.push({ type: "movedin", cls, fromDay: fromWeekday })
  })

  entries.sort((a, b) => {
    const numA =
      a.type === "native"
        ? (classEdits[a.cls.id]?.numOverride ?? a.cls.num)
        : a.cls.num
    const numB =
      b.type === "native"
        ? (classEdits[b.cls.id]?.numOverride ?? b.cls.num)
        : b.cls.num
    return numA - numB
  })

  // Detect slot conflicts: mark displaced classes
  const slotCounts = new Map<number, number>()
  const movedNums = new Set<number>() // original nums that were moved
  entries.forEach((e) => {
    const num =
      e.type === "native"
        ? (classEdits[e.cls.id]?.numOverride ?? e.cls.num)
        : e.cls.num
    if (
      e.type === "native" &&
      classEdits[e.cls.id]?.numOverride &&
      classEdits[e.cls.id]?.numOverride !== e.cls.num
    ) {
      movedNums.add(classEdits[e.cls.id]!.numOverride!)
    }
    slotCounts.set(num, (slotCounts.get(num) ?? 0) + 1)
  })
  const conflictNums = new Set(
    [...slotCounts.entries()].filter(([, c]) => c > 1).map(([n]) => n),
  )

  const nowClass = isToday
    ? data.classes.find(
        (c) => toMin(c.start) <= nowMin && nowMin < toMin(c.end),
      )
    : null
  const nextClass = isToday
    ? data.classes.find((c) => toMin(c.start) > nowMin)
    : null

  // Active (non-cancelled) classes in this day for counter
  const activeTodayCount = entries.filter(
    (e) => e.type !== "movedaway" && !classEdits[e.cls.id]?.cancelled,
  ).length

  if (!data.classes.length && movedInEntries.length === 0)
    return (
      <div className="text-center py-16 px-4">
        <p className="text-sm font-semibold text-fg">Занятий нет</p>
        <p className="text-xs text-muted-fg mt-1">
          Отдыхайте или готовьтесь к следующему дню
        </p>
      </div>
    )

  return (
    <div className="space-y-2.5 pb-2">
      {restOpen && <RestSheet onClose={() => setRestOpen(false)} />}
      {showDormBanner &&
        dorm !== "Не указано" &&
        !dormDismissed &&
        entries.length > 0 && (
          <DormCard dorm={dorm} onDismiss={onDismissDorm} />
        )}
      {showEventBanners &&
        todayEvents.slice(0, 2).map((ev) => (
          <div
            key={ev.id}
            className="mx-4 flex items-center gap-2.5 bg-amber-bg border border-amber/20 rounded-xl px-3 py-2.5"
          >
            {I.bell(15, "text-amber flex-shrink-0")}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-fg">{ev.title}</p>
              <p className="text-xs text-muted-fg">{ev.place}</p>
            </div>
            <button
              onClick={() => onDismissEvent(ev.id)}
              className="p-1 rounded-lg hover:bg-amber/20 text-amber/70 flex-shrink-0"
            >
              {I.close(14)}
            </button>
          </div>
        ))}

      {entries.length === 0 ? (
        <p className="text-center py-8 text-muted-fg text-sm">
          Ничего не найдено
        </p>
      ) : (
        entries.map((entry, idx) => {
          const prevEntry = entries[idx - 1]
          const prevCls =
            prevEntry &&
            (prevEntry.type === "native" || prevEntry.type === "movedin")
              ? prevEntry.cls
              : null
          const curCls = entry.cls
          const curEdit =
            entry.type === "native" ? classEdits[curCls.id] : undefined
          const curBuilding = curEdit?.building ?? curCls.building
          const prevBuilding = prevCls
            ? (classEdits[prevCls.id]?.building ?? prevCls.building)
            : null
          const curStart = curEdit?.startOverride ?? curCls.start
          const curEnd = curEdit?.endOverride ?? curCls.end
          const prevEnd = prevCls
            ? (classEdits[prevCls.id]?.endOverride ?? prevCls.end)
            : null
          const breakMin = prevEnd ? toMin(curStart) - toMin(prevEnd) : 0
          const gapMin = prevEnd ? toMin(curStart) - toMin(prevEnd) : 0
          const hw = homework.find((h) => h.classId === curCls.id)
          const pn = personal.find((n) => n.classId === curCls.id)
          const isCurrentWeekClass =
            !curCls.weekType ||
            curCls.weekType === "all" ||
            (isOddWeek ? curCls.weekType === "odd" : curCls.weekType === "even")
          const isNow =
            isToday &&
            isCurrentWeekClass &&
            toMin(curStart) <= nowMin &&
            nowMin < toMin(curEnd)

          const effNum =
            entry.type === "native"
              ? (classEdits[curCls.id]?.numOverride ?? curCls.num)
              : curCls.num
          const isDisplaced =
            entry.type === "native" &&
            !classEdits[curCls.id]?.numOverride &&
            conflictNums.has(curCls.num) &&
            movedNums.has(curCls.num)
          if (entry.type === "movedaway") {
            const tgt = classEdits[curCls.id]
            return (
              <div key={`movedaway-${curCls.id}`} className="mx-4">
                <MovedAwayCard
                  cls={curCls}
                  toDay={tgt?.dayOverride ?? "?"}
                  toNum={tgt?.numOverride ?? curCls.num}
                />
              </div>
            )
          }

          const subPref = curCls.subgroup
            ? (subgroupPrefs[curCls.subject] ?? "all")
            : undefined
          const stagger = `list-item-${Math.min(idx, 5)}`
          return (
            <div
              key={
                entry.type === "movedin"
                  ? `movedin-${curCls.id}`
                  : `native-${curCls.id}`
              }
              className={`space-y-1.5 animate-slide-up ${stagger}`}
              style={{ animationDelay: `${idx * 45}ms` }}
            >
              {prevBuilding &&
                prevBuilding !== curBuilding &&
                entry.type === "native" && (
                  <TravelBanner
                    from={prevBuilding}
                    to={curBuilding}
                    breakMin={breakMin}
                  />
                )}
              {gapMin > 40 && entry.type === "native" && (
                <OknoCard
                  from={prevEnd!}
                  to={curStart}
                  gapMin={gapMin}
                  onEat={onEat}
                  onRest={() => setRestOpen(true)}
                />
              )}
              <div className="mx-4">
                {isDisplaced && (
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-amber bg-amber-bg border border-amber/20 rounded-lg px-2.5 py-1.5 mb-1">
                    ⚠ Вытеснена: пара перенесена на этот слот другой парой
                  </div>
                )}
                <ClassCard
                  cls={curCls}
                  isNow={isNow && !isDisplaced}
                  nowMin={nowMin}
                  edit={entry.type === "native" ? curEdit : undefined}
                  homework={hw}
                  hasTodos={pn && pn.todos.length > 0}
                  hasKonspekt={
                    !!(
                      konspekts[curCls.id]?.text ||
                      konspekts[curCls.id]?.files?.length
                    )
                  }
                  subgroupPref={subPref}
                  weekday={data.weekday}
                  movedFrom={
                    entry.type === "movedin" ? entry.fromDay : undefined
                  }
                  onSubgroupTap={() => onSubgroupTap(curCls)}
                  onNotesClick={() => onNotesClick(curCls.id)}
                  onBuildingClick={onBuildingClick}
                  onManage={
                    role === "headstudent"
                      ? () => onManageClass(curCls.id)
                      : undefined
                  }
                  onSubjectClick={() => onSubjectClick(curCls)}
                  isOddWeek={isOddWeek}
                  weekFilter={weekFilter}
                />
              </div>
            </div>
          )
        })
      )}
    </div>
  )
}

// ─── Page: Расписание ─────────────────────────────────────────────────────────

function PageSchedule({

  allDays,
  homework,
  personal,
  role,
  classEdits,
  subgroupPrefs,
  dorm,
  searchOpen,
  search,
  onSearchChange,
  konspekts,
  dormDismissed,
  dismissedEvents,
  showDormBanner,
  showEventBanners,
  onDismissDorm,
  onDismissEvent,
  onBuildingClick,
  onNotesClick,
  onManageClass,
  onSubgroupTap,
  onSubjectClick,
  onEat,
}: {
  allDays?: DaySchedule[]
  homework: Homework[]
  personal: PersonalNote[]
  role: UserRole
  konspekts: Record<number, KonspektEntry>
  classEdits: Record<number, ClassEdit>
  subgroupPrefs: Record<string, SubgroupPref>
  dorm: string
  dormDismissed: boolean
  dismissedEvents: number[]
  showDormBanner: boolean
  showEventBanners: boolean
  searchOpen: boolean
  search: string
  onSearchChange: (v: string) => void
  onDismissDorm: () => void
  onDismissEvent: (id: number) => void
  onBuildingClick: (b: string) => void
  onNotesClick: (id: number) => void
  onManageClass: (id: number) => void
  onSubgroupTap: (cls: ClassItem) => void
  onSubjectClick: (cls: ClassItem) => void
  onEat: () => void
}) {
  const [selDate, setSelDate] = useState(TODAY)
  const [showWeek, setShowWeek] = useState(false)
  const [bellOpen, setBellOpen] = useState(false)
  const [nowMin, setNowMin] = useState(() => {
    const d = new Date()
    return d.getHours() * 60 + d.getMinutes()
  })
  useEffect(() => {
    const t = setInterval(() => {
      const d = new Date()
      setNowMin(d.getHours() * 60 + d.getMinutes())
    }, 60000)
    return () => clearInterval(t)
  }, [])

  const activeDays = allDays ?? ALL_DAYS
  const ws = getWeekStart(selDate)
  const weekDays: string[] = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(ws)
    d.setDate(d.getDate() + i)
    weekDays.push(fmtYMD(d))
  }

  // No restriction on forward/backward navigation — unlimited week shift
  function shiftWeek(n: number) {
    const d = new Date(selDate + "T00:00:00")
    d.setDate(d.getDate() + n * 7)
    setSelDate(fmtYMD(d))
  }
  const isCurrentWeek = weekDays.includes(TODAY)
  const currentData = activeDays.find((d) => d.date === selDate)
  const currentWeekday = currentData?.weekday ?? ""

  const movedInEntries: MovedInEntry[] = []
  activeDays.forEach((d) => {
    if (d.weekday === currentWeekday) return
    d.classes.forEach((c) => {
      const edit = classEdits[c.id]
      if (edit?.dayOverride === currentWeekday)
        movedInEntries.push({ cls: c, fromWeekday: d.weekday })
    })
  })
  const seen = new Set<number>()
  const uniqueMovedIn = movedInEntries.filter((e) => {
    if (seen.has(e.cls.id)) return false
    seen.add(e.cls.id)
    return true
  })

  const currentWeekNum = getStudyWeek(selDate)
  const currentIsOdd = currentWeekNum % 2 !== 0
  const currentActiveClasses = (currentData?.classes ?? []).filter(
    (c) =>
      !c.weekType ||
      c.weekType === "all" ||
      (currentIsOdd ? c.weekType === "odd" : c.weekType === "even"),
  )

  const weekTotalClasses = weekDays.reduce((acc, d) => {
    const dayData = activeDays.find((x) => x.date === d)
    const dayWeekNum = getStudyWeek(d)
    const dayIsOdd = dayWeekNum % 2 !== 0
    const filtered = (dayData?.classes ?? []).filter(
      (c) =>
        !c.weekType ||
        c.weekType === "all" ||
        (dayIsOdd ? c.weekType === "odd" : c.weekType === "even"),
    )
    return acc + filtered.length
  }, 0)

  const bellStatus = getCurrentBellStatus(nowMin)

  return (
    <div>
      <div className="px-4 pt-1 pb-2 flex items-end justify-between">
        <div>
          <p className="text-xs text-muted-fg font-semibold uppercase tracking-widest">
            {currentData?.weekday}
          </p>
          <h2 className="text-xl font-extrabold text-fg leading-tight">
            {fmtDate(selDate)}
          </h2>
        </div>
        <div className="text-right pb-0.5">
          <p
            className="text-lg font-extrabold text-primary leading-none"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            {currentActiveClasses.length}{" "}
            <span className="text-xs font-normal text-muted-fg">
              / {weekTotalClasses}
            </span>
          </p>
          <p className="text-[10px] text-muted-fg font-semibold mt-0.5">
            сегодня · на неделе
          </p>
        </div>
      </div>
      {searchOpen && (
        <SearchBar
          value={search}
          onChange={onSearchChange}
          placeholder="Поиск пар, преподавателей..."
        />
      )}

      {/* Live class indicator only when active */}
      {(bellStatus.status === "class" || bellStatus.status === "break") && (
        <div className="px-4 mb-2">
          <button
            onClick={() => setBellOpen(true)}
            className="w-full flex items-center justify-between px-3 py-1.5 rounded-xl bg-primary/10 border border-primary/20 text-xs font-semibold text-primary hover:bg-primary/15 transition-all text-left cursor-pointer"
          >
            <span className="truncate">⏱ {bellStatus.text} · {bellStatus.detail}</span>
            <span className="text-[11px] opacity-75 flex-shrink-0 ml-1">График →</span>
          </button>
        </div>
      )}

      {bellOpen && (
        <BellScheduleSheet
          nowMin={nowMin}
          onClose={() => setBellOpen(false)}
          onEat={onEat}
        />
      )}
      <div className="px-4 mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowWeek((w) => !w)}
            className={`flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-xl border transition-all cursor-pointer ${
              showWeek
                ? "bg-primary text-white border-primary"
                : "border-border text-muted-fg bg-card hover:border-accent/50"
            }`}
          >
            Неделя {I.chev(showWeek ? "up" : "down", 11)}
          </button>
          {!isCurrentWeek && (
            <button
              onClick={() => setSelDate(TODAY)}
              className="text-xs font-semibold text-primary hover:text-accent transition-colors cursor-pointer"
            >
              {I.chev("left", 12)} Сегодня
            </button>
          )}
        </div>
        <button
          onClick={() => setBellOpen(true)}
          className="text-xs font-semibold text-muted-fg hover:text-fg flex items-center gap-1 px-2.5 py-1 rounded-xl border border-border/60 bg-card hover:border-primary/40 transition-all cursor-pointer"
          title="Официальный график звонков РГАУ-МСХА"
        >
          <span>🔔</span> Звонки
        </button>
      </div>
      <div
        className="flex gap-1.5 overflow-x-auto px-4 pb-2"
        style={{ scrollbarWidth: "none" }}
      >
        <button
          onClick={() => shiftWeek(-1)}
          className="flex-shrink-0 flex items-center justify-center w-9 h-12 rounded-xl border border-border bg-card text-muted-fg hover:text-fg hover:border-accent/40 transition-all cursor-pointer"
        >
          {I.chev("left", 16)}
        </button>
        {weekDays.map((d) => {
          const dd = new Date(d + "T00:00:00")
          const dayData = activeDays.find((x) => x.date === d)
          const dayWeekNum = getStudyWeek(d)
          const dayIsOdd = dayWeekNum % 2 !== 0
          const activeClasses = (dayData?.classes ?? []).filter(
            (c) =>
              !c.weekType ||
              c.weekType === "all" ||
              (dayIsOdd ? c.weekType === "odd" : c.weekType === "even"),
          )
          const clsCount = activeClasses.length
          const isSel = d === selDate
          const isTod = d === TODAY
          const dayIdx = dd.getDay() === 0 ? 6 : dd.getDay() - 1
          const isWeekend = dayIdx >= 5
          return (
            <button
              key={d}
              onClick={() => setSelDate(d)}
              className={`flex-shrink-0 flex flex-col items-center gap-0.5 px-2.5 py-2 rounded-xl border transition-all duration-150 min-w-[2.8rem] active:scale-95 cursor-pointer ${
                isSel
                  ? "bg-primary border-primary text-white shadow-md"
                  : isTod
                    ? "border-accent bg-muted text-primary"
                    : isWeekend
                      ? "border-border bg-muted/50 text-muted-fg hover:border-accent/40"
                      : "border-border bg-card text-fg hover:border-accent/40 hover:shadow-sm"
              }`}
            >
              <span className="text-[10px] font-semibold opacity-70">
                {WDAY[dayIdx]}
              </span>
              <span
                className="text-base font-bold leading-none"
                style={{ fontFamily: "var(--font-mono)" }}
              >
                {dd.getDate()}
              </span>
              {clsCount > 0 ? (
                <span
                  className={`text-[9px] font-bold ${
                    isSel ? "text-white/70" : "text-accent"
                  }`}
                >
                  {clsCount}п
                </span>
              ) : (
                <span className="h-3" />
              )}
            </button>
          )
        })}
        <button
          onClick={() => shiftWeek(1)}
          className="flex-shrink-0 flex items-center justify-center w-9 h-12 rounded-xl border border-border bg-card text-muted-fg hover:text-fg hover:border-accent/40 transition-all cursor-pointer"
        >
          {I.chev("right", 16)}
        </button>
      </div>
      {showWeek && (
        <div className="px-4 mb-2 space-y-1">
          {weekDays.map((d) => {
            const data = activeDays.find((x) => x.date === d)
            const dd = new Date(d + "T00:00:00")
            const isTod = d === TODAY
            const dayWeekNum = getStudyWeek(d)
            const dayIsOdd = dayWeekNum % 2 !== 0
            const dayClasses = (data?.classes ?? []).filter(
              (c) =>
                !c.weekType ||
                c.weekType === "all" ||
                (dayIsOdd ? c.weekType === "odd" : c.weekType === "even"),
            )
            if (!data || !dayClasses.length)
              return (
                <div
                  key={d}
                  className="bg-card border border-border rounded-xl p-2.5 flex items-center gap-3"
                >
                  <div className="text-center w-10 flex-shrink-0">
                    <p className="text-[10px] text-muted-fg font-semibold">
                      {WDAY[dd.getDay() === 0 ? 6 : dd.getDay() - 1]}
                    </p>
                    <p
                      className="text-sm font-bold text-muted-fg"
                      style={{ fontFamily: "var(--font-mono)" }}
                    >
                      {dd.getDate()}
                    </p>
                  </div>
                  <p className="text-xs text-muted-fg">Занятий нет</p>
                </div>
              )
            return (
              <button
                key={d}
                onClick={() => setSelDate(d)}
                className={`w-full bg-card border rounded-xl overflow-hidden text-left cursor-pointer transition-colors ${
                  isTod ? "border-accent bg-accent/5" : "border-border hover:border-primary/40"
                }`}
              >
                <div className="flex items-center gap-2 px-3 py-2 bg-muted/60">
                  <div className="text-center w-10 flex-shrink-0">
                    <p className="text-[10px] text-muted-fg font-semibold">
                      {WDAY[dd.getDay() === 0 ? 6 : dd.getDay() - 1]}
                    </p>
                    <p
                      className="text-sm font-bold text-fg"
                      style={{ fontFamily: "var(--font-mono)" }}
                    >
                      {dd.getDate()}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1 items-center flex-1 min-w-0">
                    {dayClasses.slice(0, 4).map((c) => (
                      <span
                        key={c.id}
                        className={`text-[10px] px-1.5 py-0.5 rounded-md font-semibold ${TYPE_CFG[c.type].chip}`}
                      >
                        {c.start}–{c.end}
                      </span>
                    ))}
                    {dayClasses.length > 4 && (
                      <span className="text-[10px] text-muted-fg font-medium">
                        +{dayClasses.length - 4}
                      </span>
                    )}
                  </div>
                  {isTod && (
                    <span className="ml-auto text-[10px] font-bold text-primary flex-shrink-0">
                      Сегодня
                    </span>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      )}
      <DayView
        allDays={activeDays}
        dateStr={selDate}
        search={search}
        homework={homework}
        personal={personal}
        role={role}
        classEdits={classEdits}
        subgroupPrefs={subgroupPrefs}
        dorm={dorm}
        konspekts={konspekts}
        dormDismissed={dormDismissed}
        dismissedEvents={dismissedEvents}
        showDormBanner={showDormBanner}
        showEventBanners={showEventBanners}
        movedInEntries={uniqueMovedIn}
        nowMin={nowMin}
        onDismissDorm={onDismissDorm}
        onDismissEvent={onDismissEvent}
        onBuildingClick={onBuildingClick}
        onNotesClick={onNotesClick}
        onManageClass={onManageClass}
        onSubgroupTap={onSubgroupTap}
        onSubjectClick={onSubjectClick}
        onEat={onEat}
      />
    </div>
  )
}

// ─── Page: Кампус ─────────────────────────────────────────────────────────────

const BUILDING_DETAILS: {
  [k: string]: {
    name: string
    short: string
    address: string
    floors: number
    note?: string
    coords: [number, number]
  }
} = {
  corp1: {
    name: "1-й учебный корпус",
    short: "УК-1",
    address: "Тимирязевская, 49",
    floors: 4,
    note: "Главный корпус, деканаты, библиотека",
    coords: [37.5562, 55.83],
  },
  agrochem: {
    name: "Корпус агрохимии",
    short: "Агрохим",
    address: "Тимирязевская, 55",
    floors: 3,
    note: "Кафедры агрохимии и почвоведения",
    coords: [37.5605, 55.8278],
  },
  engineering: {
    name: "Инженерный корпус",
    short: "Инж.",
    address: "Тимирязевская, 58",
    floors: 5,
    note: "Мастерские, лаборатории механизации",
    coords: [37.5638, 55.8263],
  },
  sport: {
    name: "Спортивный комплекс",
    short: "Спорт",
    address: "Тимирязевская, 44",
    floors: 2,
    coords: [37.554, 55.8308],
  },
  station: {
    name: "Учебно-опытная станция",
    short: "УОС",
    address: "Тимирязевская, 42",
    floors: 1,
    note: "Полевые работы, техника, дендрарий",
    coords: [37.553, 55.8315],
  },
}
const BUILDING_MAP_QUERIES: Record<string, string> = {
  corp1: "РГАУ+МСХА+1+учебный+корпус+Тимирязевская+49",
  agrochem: "РГАУ+МСХА+корпус+агрохимии+Тимирязевская+55",
  engineering: "РГАУ+МСХА+инженерный+корпус+Тимирязевская+58",
  sport: "РГАУ+МСХА+спортивный+комплекс+Тимирязевская+44",
  station: "РГАУ+МСХА+учебно+опытная+станция+Тимирязевская+42",
}
const DORM_COORDS: Record<string, [number, number]> = {
  "Общежитие №1": [37.552, 55.834],
  "Общежитие №2": [37.5528, 55.8335],
  "Общежитие №6": [37.5565, 55.8348],
  "Общежитие №8": [37.5572, 55.8352],
  "Общежитие №10": [37.5648, 55.8268],
}
const DEPT_DATA: { name: string; building: string; coords: [number, number] }[] =
  [
    {
      name: "Кафедра агрохимии и биохимии",
      building: "Корпус агрохимии",
      coords: [37.5603, 55.828],
    },
    {
      name: "Кафедра земледелия и МОС",
      building: "1-й учебный корпус",
      coords: [37.5565, 55.8298],
    },
    {
      name: "Кафедра почвоведения",
      building: "1-й учебный корпус",
      coords: [37.5558, 55.8302],
    },
    {
      name: "Кафедра механизации",
      building: "Инженерный корпус",
      coords: [37.5635, 55.8265],
    },
    {
      name: "Кафедра физиологии растений",
      building: "Корпус агрохимии",
      coords: [37.561, 55.8275],
    },
  ]

type CampusPinLayer = "none" | "buildings" | "dorms" | "departments"
const MAP_CENTER = "37.5535%2C55.8330"

function buildMapSrc(
  layer: CampusPinLayer = "none",
  foodLayer = false,
  center?: [number, number] | null,
  activePin?: [number, number] | null,
): string {
  const ll = center ? `${center[0]}%2C${center[1]}` : MAP_CENTER
  const zoom = center ? 16 : 15
  const base = `https://yandex.ru/map-widget/v1/?ll=${ll}&z=${zoom}&l=map`
  const pts: string[] = []
  if (activePin) {
    pts.push(`${activePin[0]},${activePin[1]},pm2rdm`)
  }
  if (layer === "buildings")
    Object.values(BUILDING_DETAILS).forEach((b) =>
      pts.push(`${b.coords[0]},${b.coords[1]},pm2gnl`),
    )
  if (layer === "dorms")
    Object.values(DORM_COORDS).forEach(([lo, la]) =>
      pts.push(`${lo},${la},pm2bll`),
    )
  if (layer === "departments")
    DEPT_DATA.forEach((d) => pts.push(`${d.coords[0]},${d.coords[1]},pm2vll`))
  if (foodLayer)
    Object.values(BUILDING_DETAILS).forEach((b) =>
      pts.push(`${b.coords[0]},${b.coords[1]},pm2rdm`),
    )
  return `${base}${pts.length ? `&pt=${pts.join("~")}` : ""}`
}

export interface CampusQuickPlace {
  id: string
  title: string
  short: string
  badgeLabel: string
  category: PinCategory
  coords: [number, number]
  address: string
  floors?: string
  faculties?: string
  buffet?: string
  description?: string
}

export const CAMPUS_QUICK_BADGES: CampusQuickPlace[] = [
  {
    id: "bldg-1",
    title: "1-й учебный корпус",
    short: "Корпус 1",
    badgeLabel: "1",
    category: "academic",
    coords: [37.5565, 55.8298],
    address: "Тимирязевская ул., 49",
    floors: "4 этажа",
    faculties: "Институт агробиотехнологии (агрономия, почвоведение, экология), ректорат, почвенный музей им. Вильямса",
    buffet: "Большая студенческая столовая 1-го корпуса (1 этаж)",
    description: "Главный учебный корпус академии",
  },
  {
    id: "bldg-2",
    title: "2-й учебный корпус",
    short: "Корпус 2",
    badgeLabel: "2",
    category: "academic",
    coords: [37.555, 55.8315],
    address: "Тимирязевская ул., 47",
    floors: "3 этажа",
    faculties: "Ботанические кафедры, селекция растений, физиология растений",
    buffet: "Студенческий буфет (1 этаж)",
    description: "Лекционные аудитории и лаборатории физиологии растений",
  },
  {
    id: "bldg-4",
    title: "4-й учебный корпус",
    short: "Корпус 4",
    badgeLabel: "4",
    category: "academic",
    coords: [37.5505, 55.8295],
    address: "Тимирязевская ул., 44",
    floors: "3 этажа",
    faculties: "Кафедры информационных технологий, высшая математика, компьютерные классы",
    buffet: "Буфет 4-го корпуса",
    description: "Компьютерные классы и лекционные залы",
  },
  {
    id: "bldg-6",
    title: "6-й учебный корпус (Зоотехния)",
    short: "Корпус 6",
    badgeLabel: "6",
    category: "academic",
    coords: [37.551, 55.832],
    address: "Тимирязевская ул., 44",
    floors: "4 этажа",
    faculties: "Институт зоотехнии и биологии, ветеринарные лаборатории",
    buffet: "Студенческий буфет 6-го корпуса (1 этаж)",
    description: "Институт зоотехнии и биологии",
  },
  {
    id: "bldg-8",
    title: "8-й учебный корпус",
    short: "Корпус 8",
    badgeLabel: "8",
    category: "academic",
    coords: [37.556, 55.832],
    address: "Лиственничная аллея, 3",
    floors: "3 этажа",
    faculties: "Кафедры лесоводства, дендрологии и ландшафтного дизайна",
    buffet: "Буфет (холл)",
    description: "Лесоводство, экология и садово-парковое хозяйство",
  },
  {
    id: "bldg-17",
    title: "17-й корпус (Почвенно-агрономический)",
    short: "Корпус 17",
    badgeLabel: "17",
    category: "academic",
    coords: [37.542, 55.833],
    address: "Тимирязевская ул., 54",
    floors: "4 этажа",
    faculties: "Почвоведение, агрохимия, геология, гуманитарно-педагогический факультет",
    buffet: "Комбинат питания 17-го корпуса (цокольный этаж, два обеденных зала)",
    description: "Почвенно-агрономический комплекс и столовая",
  },
  {
    id: "bldg-26",
    title: "26-й учебный корпус",
    short: "Корпус 26",
    badgeLabel: "26",
    category: "academic",
    coords: [37.555, 55.831],
    address: "Тимирязевская ул., 49",
    floors: "4 этажа",
    faculties: "Большие поточные лекционные залы, деканаты факультетов",
    buffet: "Буфет-столовая 26-го корпуса (1 этаж)",
    description: "Поточные аудитории и учебно-лабораторный комплекс",
  },
  {
    id: "bldg-eng",
    title: "28-й учебный корпус (Инженерный)",
    short: "Корпус 28",
    badgeLabel: "28",
    category: "academic",
    coords: [37.5635, 55.8265],
    address: "Лиственничная аллея, 2Д",
    floors: "4 этажа",
    faculties: "Инженерный институт им. В.П. Горячкина (тракторы, с/х машины, техносферная безопасность)",
    buffet: "Буфет инженерного корпуса (1 этаж)",
    description: "Инженерный институт им. Горячкина",
  },
  {
    id: "bldg-29",
    title: "29-й учебный корпус (Цифровой центр)",
    short: "Корпус 29",
    badgeLabel: "29",
    category: "academic",
    coords: [37.541, 55.842],
    address: "Лиственничная аллея, 16",
    floors: "3 этажа",
    faculties: "Цифровой центр, компьютерные классы ИЦ, селекция и биотехнологии",
    buffet: "Кофе-пойнт и снек-автоматы",
    description: "Инновационный цифровой учебный комплекс",
  },
  {
    id: "bldg-lib",
    title: "Центральная научная библиотека (ЦНБ)",
    short: "ЦНБ",
    badgeLabel: "ЦНБ",
    category: "academic",
    coords: [37.553, 55.830],
    address: "Лиственничная аллея, 2к1",
    floors: "3 этажа",
    faculties: "Читальные залы, электронная библиотека, коворкинг, редкий фонд",
    buffet: "Кофейня в фойе ЦНБ",
    description: "ЦНБ им. Железнова — крупнейшая аграрная библиотека",
  },
  {
    id: "dorms-campus",
    title: "Студенческий городок (Общежития)",
    short: "Общежития",
    badgeLabel: "🏠",
    category: "dorm",
    coords: [37.554, 55.834],
    address: "Лиственничная аллея / Тимирязевская ул.",
    floors: "5–16 этажей",
    faculties: "Общежития №1–16, студенческий совет, медпункт, прачечные",
    buffet: "Столовая студгородка (Лиственничная аллея, 5)",
    description: "Комплекс общежитий студгородка РГАУ-МСХА",
  },
  {
    id: "sports-sok",
    title: "Спортивный комплекс (СОК РГАУ)",
    short: "Спорткомплекс",
    badgeLabel: "СОК",
    category: "sports",
    coords: [37.557, 55.833],
    address: "Лиственничная аллея, 12Б",
    floors: "2 этажа",
    faculties: "Бассейн 25м, тренажерные залы, секции, стадион «Тимирязевец»",
    buffet: "Фитнес-бар и буфет",
    description: "Главный физкультурно-оздоровительный комплекс академии",
  },
]

const CAMPUS_OVERVIEW_ITEMS: {
  category: PinCategory
  badgeLabel?: string
  icon?: string
  title: string
  sub: string
  detail: string
  color: string
  mapQ: string
}[] = [
  {
    category: "academic",
    badgeLabel: "1",
    title: "РСХБ Банк",
    sub: "Россельхозбанк",
    detail:
      "Банкомат: УК-1, 1-й этаж. Офис: Тимирязевская, 58. Пн–Пт 9:00–18:00.",
    color: "bg-blue-bg text-blue",
    mapQ: "Россельхозбанк+Тимирязевская+улица+Москва",
  },
  {
    category: "academic",
    badgeLabel: "🏛",
    title: "Студенческий МФЦ",
    sub: "Многофункциональный центр",
    detail:
      "УК-1, каб. 102. Справки, льготный проездной, оформление документов. Пн–Пт 10:00–17:00.",
    color: "bg-muted text-primary",
    mapQ: "РГАУ+МСХА+Тимирязевская+49+Москва",
  },
  {
    category: "academic",
    badgeLabel: "ЦНБ",
    title: "Научная библиотека",
    sub: "им. Н.И. Железнова",
    detail:
      "УК-1, 1-й этаж. Читальный зал, абонемент, ЭБС. Пн–Пт 9:00–18:00, Сб 10:00–16:00.",
    color: "bg-muted text-accent",
    mapQ: "Библиотека+РГАУ+МСХА+Тимирязевская+49",
  },
  {
    category: "department",
    badgeLabel: "Мед",
    title: "Медицинский кабинет",
    sub: "Здравоохранение",
    detail:
      "УК-1, 1-й этаж. Первая помощь, справки, медкомиссия. Пн–Пт 9:00–17:00.",
    color: "bg-red-bg text-red",
    mapQ: "РГАУ+МСХА+Тимирязевская+49+Москва",
  },
  {
    category: "sports",
    badgeLabel: "СОК",
    title: "Wi-Fi на кампусе",
    sub: "Сеть RGAU-MSCA",
    detail:
      "Доступна во всех учебных корпусах. Авторизация по логину от ЭИОС (edu.timacad.ru). Пароль — номер студенческого билета.",
    color: "bg-muted text-muted-fg",
    mapQ: "",
  },
  {
    category: "dorm",
    badgeLabel: "Авт",
    title: "Транспорт",
    sub: "Остановки рядом",
    detail:
      "Метро Тимирязевская — 5 мин пешком. Авт. 87, 87к остановка «Тимирязевская академия».",
    color: "bg-amber-bg text-amber",
    mapQ: "Метро+Тимирязевская+Москва",
  },
]

function PageCampus({
  initFood,
  search,
  role,
}: {
  initFood?: boolean
  search: string
  role?: UserRole
}) {
  const [campusMode, setCampusMode] = useState<"plan" | "territory" | "food">(
    initFood ? "food" : "territory",
  )
  const [showFood, setShowFood] = useState(initFood ?? false)
  const [pinLayer, setPinLayer] = useState<CampusPinLayer>("none")
  const [selectedQuickPlace, setSelectedQuickPlace] = useState<CampusQuickPlace | null>(null)
  const [mapCenterCoords, setMapCenterCoords] = useState<[number, number] | null>(null)
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
  const [foodOverrides, setFoodOverrides] =
    useState<Record<number, Partial<FoodSpot>>>({})
  const [editingFoodId, setEditingFoodId] = useState<number | null>(null)
  const [editFoodForm, setEditFoodForm] = useState({ name: "", avgCheck: "" })
  const [overviewOverrides, setOverviewOverrides] = useState<Record<number, {
    detail?: string
    title?: string
    sub?: string
  }>>({})
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
    ? buildMapSrc("none", true, mapCenterCoords, selectedQuickPlace ? selectedQuickPlace.coords : null)
    : buildMapSrc(pinLayer, false, mapCenterCoords, selectedQuickPlace ? selectedQuickPlace.coords : null)

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
              ["plan", "🗺 Схема кампуса"],
              ["territory", "📍 Яндекс Карта"],
              ["food", "🍽 Где поесть"],
            ] as ["plan" | "territory" | "food", string][]).map(([v, l]) => (
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
                className={`flex-1 px-2.5 py-1.5 text-xs font-bold rounded-lg transition-all ${
                  campusMode === v
                    ? "bg-primary text-white shadow-sm"
                    : "text-muted-fg hover:text-fg"
                }`}
              >
                {l}
              </button>
            ))}
          </div>
          {role === "headstudent" && (
            <button
              onClick={() => setEditMode((e) => !e)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-all ${
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
              href={`https://yandex.ru/maps/213/moscow/?ll=${mapCenterCoords ? `${mapCenterCoords[0]}%2C${mapCenterCoords[1]}` : "37.5565%2C55.8298"}&z=16`}
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
                    <span className="font-bold text-fg flex-shrink-0">🏢 Этажи:</span>
                    <span className="text-muted-fg">{selectedQuickPlace.floors}</span>
                  </div>
                )}
                {selectedQuickPlace.faculties && (
                  <div className="flex items-start gap-2 bg-muted/50 rounded-xl p-2.5">
                    <span className="font-bold text-fg flex-shrink-0">🎓 Факультеты:</span>
                    <span className="text-muted-fg">{selectedQuickPlace.faculties}</span>
                  </div>
                )}
                {selectedQuickPlace.buffet && (
                  <div className="flex items-start gap-2 bg-amber-bg/50 border border-amber/20 rounded-xl p-2.5">
                    <span className="font-bold text-amber flex-shrink-0">🍽 Питание:</span>
                    <span className="text-fg">{selectedQuickPlace.buffet}</span>
                  </div>
                )}
              </div>

              {(() => {
                const walk = calculateWalkBetween("1-й учебный корпус", selectedQuickPlace.title)
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
                      {I.map(14)} Пешеходный маршрут в Яндекс.Картах {I.ext(12)}
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
          {([
            ["none", "🌍 Обзор"],
            ["buildings", "🏛 Корпуса"],
            ["dorms", "🏠 Общежития"],
            ["departments", "🔬 Кафедры"],
          ] as [CampusPinLayer, string][]).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setPinLayer(id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                pinLayer === id
                  ? "bg-primary text-white border-primary"
                  : "bg-card border-border text-muted-fg hover:border-accent/40 hover:text-fg"
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
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
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
                  className={`bg-card border rounded-2xl overflow-hidden transition-all duration-200 animate-slide-up list-item-${Math.min(i, 5)} ${
                    isExp
                      ? "border-accent shadow-sm"
                      : "border-border hover:border-accent/40"
                  }`}
                >
                  <button
                    onClick={() => setExpandedOverview(isExp ? null : i)}
                    className="w-full flex items-center gap-3 p-3.5"
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
                        className="mr-1 p-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors flex-shrink-0"
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
                              className="flex-1 py-1.5 rounded-xl border border-border text-xs font-semibold text-muted-fg"
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
                              className="flex-1 py-1.5 rounded-xl bg-primary text-white text-xs font-bold"
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
                    className="w-full text-left p-3.5"
                  >
                    <div className="flex items-center gap-3">
                      <CampusBadge
                        category="academic"
                        label={b.short.replace(/[^\d]/g, "") || String(idx + 1)}
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
                              className="flex-1 py-1.5 rounded-xl border border-border text-xs font-semibold text-muted-fg"
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
                              className="flex-1 py-1.5 rounded-xl bg-primary text-white text-xs font-bold"
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
                              className="flex items-center gap-1 text-xs font-semibold text-primary"
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
                className={`stagger-card bg-card border rounded-2xl overflow-hidden transition-all duration-200 list-item-${Math.min(fi, 12)} ${
                  isSel
                    ? "border-accent shadow-sm"
                    : "border-border hover:border-accent/40"
                }`}
                style={{ animationDelay: `${fi * 30}ms` }}
              >
                <button
                  onClick={() => setSelFood(isSel ? null : f.id)}
                  className="w-full text-left p-3.5"
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
                          className={`text-[10px] px-1.5 py-0.5 rounded-md font-semibold flex-shrink-0 ${ftChip[f.type]}`}
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
                        className="text-[11px] font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-lg"
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
                            className="flex-1 py-1.5 rounded-xl border border-border text-xs font-semibold text-muted-fg"
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
                            className="flex-1 py-1.5 rounded-xl bg-primary text-white text-xs font-bold"
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

// ─── Page: События ────────────────────────────────────────────────────────────

function PageEvents({
  role,
  customEvents,
  onAddEvent,
  onEditEvent,
  onDeleteEvent,
  pinnedNote,
  onPinnedNote,
  search,
  onOpenSyncModal,
  lastSyncDisplay,
  feedItems,
}: {
  role: UserRole
  customEvents: AppEvent[]
  onAddEvent: (e: AppEvent) => void
  onEditEvent: (e: AppEvent) => void
  onDeleteEvent: (id: number) => void
  pinnedNote: string
  onPinnedNote: (n: string) => void
  search: string
  onOpenSyncModal?: () => void
  lastSyncDisplay?: string
  feedItems?: TimacadFeedItem[]
}) {
  const [filter, setFilter] = useState<EventCat>("all")
  const [showAllEvents, setShowAllEvents] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [editingNote, setEditingNote] = useState(false)
  const [draftNote, setDraftNote] = useState(pinnedNote)
  const [form, setForm] = useState({
    title: "",
    date: "",
    place: "",
    category: "faculty" as EventCat,
  })
  const cats: [EventCat, string][] = [
    ["all", "Все"],
    ["news", "Новости РГАУ"],
    ["announcement", "Анонсы"],
    ["profcom", "Профком"],
    ["faculty", "Факультет"],
    ["science", "Наука"],
    ["sport", "Спорт"],
    ["career", "Карьера"],
  ]
  const baseList = getAppEvents(feedItems)
  const allEvents = [...baseList, ...customEvents]
  const q = search.toLowerCase().trim()
  const filtered = allEvents.filter((e) => {
    const matchCat = filter === "all" || e.category === filter
    const matchSearch =
      !q ||
      e.title.toLowerCase().includes(q) ||
      e.place.toLowerCase().includes(q) ||
      (e.summary && e.summary.toLowerCase().includes(q)) ||
      (e.sourceName && e.sourceName.toLowerCase().includes(q))
    return matchCat && matchSearch
  })
  const isLimited = !showAllEvents && filter === "all" && !q
  const displayList = isLimited ? filtered.slice(0, 3) : filtered
  const catChip: Record<string, string> = {
    news: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25",
    announcement: "bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/25",
    profcom: "bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/25",
    faculty: "bg-muted text-primary border border-border",
    science: "bg-blue-bg text-blue border border-blue/20",
    sport: "bg-amber-bg text-amber border border-amber/20",
    career: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border border-indigo-500/25",
  }
  const catLabel: Record<string, string> = {
    news: "Новости",
    announcement: "Анонс",
    profcom: "Профком",
    faculty: "Факультет",
    science: "Наука",
    sport: "Спорт",
    career: "Карьера",
  }
  const isHead = role === "headstudent"

  function submitAdd() {
    if (!form.title.trim() || !form.date.trim()) return
    onAddEvent({
      id: Date.now(),
      title: form.title,
      date: form.date,
      place: form.place || "—",
      category: form.category,
    })
    setForm({ title: "", date: "", place: "", category: "faculty" })
    setAddOpen(false)
  }
  function startEdit(ev: AppEvent) {
    setEditId(ev.id)
    setForm({
      title: ev.title,
      date: ev.date,
      place: ev.place,
      category: ev.category,
    })
  }
  function submitEdit() {
    if (editId === null) return
    onEditEvent({
      id: editId,
      title: form.title,
      date: form.date,
      place: form.place,
      category: form.category,
    })
    setEditId(null)
  }

  return (
    <div className="px-4 pt-1 pb-2 space-y-3">
      {/* Official Timacad Sync Bar */}
      <div className="flex items-center justify-between p-3 rounded-2xl bg-card border border-border/80 shadow-xs">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-xs font-bold text-fg truncate">
              Сверка с порталом timacad.ru
            </p>
            <p className="text-[10px] text-muted-fg truncate">
              {lastSyncDisplay || "Синхронизировано"} · 18 официальных источников
            </p>
          </div>
        </div>
        {onOpenSyncModal && (
          <button
            onClick={onOpenSyncModal}
            className="px-2.5 py-1.5 rounded-xl bg-primary/10 text-primary text-xs font-bold hover:bg-primary/20 transition-colors flex-shrink-0 cursor-pointer"
          >
            Источники ↗
          </button>
        )}
      </div>

      {(pinnedNote || isHead) && (
        <div className="bg-amber-bg border border-amber/20 rounded-2xl px-4 py-3">
          {editingNote ? (
            <div className="space-y-2">
              <textarea
                value={draftNote}
                onChange={(e) => setDraftNote(e.target.value)}
                placeholder="Важная информация для группы..."
                className="w-full bg-transparent text-sm text-fg outline-none resize-none"
                rows={3}
                autoFocus
              />
              <div className="flex gap-2">
                <button
                  onClick={() => setEditingNote(false)}
                  className="text-xs font-semibold text-muted-fg"
                >
                  Отмена
                </button>
                <button
                  onClick={() => {
                    onPinnedNote(draftNote)
                    setEditingNote(false)
                  }}
                  className="text-xs font-bold text-primary"
                >
                  Сохранить
                </button>
              </div>
            </div>
          ) : pinnedNote ? (
            <div className="flex items-start gap-2">
              <div className="flex-1">
                <p className="text-xs font-bold text-amber uppercase tracking-wide mb-1">
                  Важно от старосты
                </p>
                <p className="text-sm text-fg">{pinnedNote}</p>
              </div>
              {isHead && (
                <div className="flex gap-1 flex-shrink-0">
                  <button
                    onClick={() => {
                      setDraftNote(pinnedNote)
                      setEditingNote(true)
                    }}
                    className="w-7 h-7 flex items-center justify-center rounded-xl hover:bg-amber/20 text-muted-fg"
                  >
                    {I.pencil(12)}
                  </button>
                  <button
                    onClick={() => onPinnedNote("")}
                    className="w-7 h-7 flex items-center justify-center rounded-xl hover:bg-red-bg text-muted-fg hover:text-red"
                  >
                    {I.close(12)}
                  </button>
                </div>
              )}
            </div>
          ) : isHead ? (
            <button
              onClick={() => {
                setDraftNote("")
                setEditingNote(true)
              }}
              className="flex items-center gap-2 text-sm font-semibold text-amber w-full"
            >
              {I.plus(14, "text-amber")} Добавить важную заметку для группы
            </button>
          ) : null}
        </div>
      )}
      <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
        {cats.map(([id, label]) => (
          <button
            key={id}
            onClick={() => setFilter(id)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap border transition-all ${
              filter === id
                ? "bg-primary text-white border-primary shadow-xs"
                : "bg-card border-border text-muted-fg hover:border-accent/40 hover:text-fg"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {filtered.length === 0 ? (
        <p className="text-sm text-muted-fg text-center py-12">Событий нет</p>
      ) : (
        <div className="space-y-2.5">
          {displayList.map((ev, idx) => {
            const isCustom = customEvents.some((c) => c.id === ev.id)
            const isEditing = editId === ev.id
            if (isEditing)
              return (
                <div
                  key={ev.id}
                  className="bg-card border border-accent rounded-2xl p-4 space-y-2"
                >
                  <input
                    value={form.title}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, title: e.target.value }))
                    }
                    placeholder="Название"
                    className="w-full border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-accent bg-card text-fg"
                  />
                  <input
                    value={form.date}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, date: e.target.value }))
                    }
                    placeholder="ГГГГ-ММ-ДД"
                    className="w-full border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-accent bg-card text-fg font-mono"
                  />
                  <input
                    value={form.place}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, place: e.target.value }))
                    }
                    placeholder="Место проведения"
                    className="w-full border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-accent bg-card text-fg"
                  />
                  <select
                    value={form.category}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        category: e.target.value as any,
                      }))
                    }
                    className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-card text-fg focus:outline-none focus:border-accent"
                  >
                    <option value="faculty">Факультетские</option>
                    <option value="science">Наука</option>
                    <option value="sport">Спорт</option>
                    <option value="news">Новости</option>
                    <option value="announcement">Анонсы</option>
                    <option value="profcom">Профком</option>
                  </select>
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => setEditId(null)}
                      className="flex-1 py-2 rounded-xl border border-border text-sm font-semibold text-muted-fg"
                    >
                      Отмена
                    </button>
                    <button
                      onClick={submitEdit}
                      className="flex-1 py-2 bg-primary text-white rounded-xl text-sm font-bold"
                    >
                      Сохранить
                    </button>
                  </div>
                </div>
              )
            return (
              <div
                key={ev.id}
                className="stagger-card bg-card border border-border rounded-2xl p-4 hover:border-accent/40 transition-all hover:shadow-sm active:scale-[0.99]"
                style={{ animationDelay: `${idx * 40}ms` }}
              >
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <p className="text-sm font-bold text-fg leading-snug">
                    {ev.title}
                  </p>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-md font-semibold ${catChip[ev.category] || "bg-muted text-fg"}`}
                    >
                      {catLabel[ev.category] || ev.category}
                    </span>
                    {isHead && (
                      <button
                        onClick={() => startEdit(ev)}
                        className="p-1 rounded-lg hover:bg-muted text-muted-fg"
                      >
                        {I.pencil(11)}
                      </button>
                    )}
                    {isHead && isCustom && (
                      <button
                        onClick={() => onDeleteEvent(ev.id)}
                        className="p-1 rounded-lg hover:bg-red-bg text-muted-fg hover:text-red"
                      >
                        {I.trash(11)}
                      </button>
                    )}
                  </div>
                </div>

                {ev.summary && (
                  <p className="text-xs text-muted-fg mb-2 line-clamp-2">
                    {ev.summary}
                  </p>
                )}
                <div className="flex items-center justify-between text-xs text-muted-fg mt-2 pt-2 border-t border-border/60">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1">
                      {I.clock(11)}
                      <span className="font-mono">{fmtDate(ev.date)}</span>
                    </span>
                    <span className="flex items-center gap-1">
                      {I.map(11)}
                      <span className="truncate max-w-[120px]">{ev.place}</span>
                    </span>
                  </div>
                  {ev.sourceUrl && (
                    <a
                      href={ev.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-bold text-primary hover:underline flex items-center gap-1"
                    >
                      <span>Источник</span>
                      <span>↗</span>
                    </a>
                  )}
                </div>
              </div>
            )
          })}
          {isLimited && filtered.length > 3 && (
            <button
              onClick={() => setShowAllEvents(true)}
              className="w-full py-2.5 rounded-xl border border-border bg-card hover:bg-muted text-xs font-semibold text-primary transition-all duration-200 text-center cursor-pointer shadow-xs"
            >
              Показать все события ({filtered.length})
            </button>
          )}
        </div>
      )}
      {isHead &&
        (addOpen ? (
          <div className="bg-card border border-accent rounded-2xl p-4 space-y-2">
            <p className="text-sm font-bold text-fg">Новое событие</p>
            <input
              value={form.title}
              onChange={(e) =>
                setForm((f) => ({ ...f, title: e.target.value }))
              }
              placeholder="Название события"
              className="w-full border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-accent bg-card text-fg"
            />
            <input
              value={form.date}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              placeholder="Дата (2026-09-15)"
              className="w-full border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-accent bg-card text-fg"
            />
            <input
              value={form.place}
              onChange={(e) =>
                setForm((f) => ({ ...f, place: e.target.value }))
              }
              placeholder="Место проведения"
              className="w-full border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-accent bg-card text-fg"
            />
            <div className="flex gap-1.5 flex-wrap">
              {(["faculty", "science", "sport"] as AppEvent["category"][]).map(
                (c) => (
                  <button
                    key={c}
                    onClick={() => setForm((f) => ({ ...f, category: c }))}
                    className={`px-2.5 py-1 text-xs font-semibold rounded-xl border transition-all ${
                      form.category === c
                        ? "bg-primary text-white border-primary"
                        : "bg-muted border-border text-muted-fg"
                    }`}
                  >
                    {catLabel[c]}
                  </button>
                ),
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setAddOpen(false)}
                className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold text-muted-fg"
              >
                Отмена
              </button>
              <button
                onClick={submitAdd}
                className="flex-1 py-2.5 bg-primary text-white rounded-xl text-sm font-bold"
              >
                Добавить
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setAddOpen(true)}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border border-dashed border-accent/40 text-sm font-semibold text-primary hover:bg-muted/30 transition-colors"
          >
            {I.plus(14)} Добавить событие
          </button>
        ))}
    </div>
  )
}

// ─── Page: Профиль ────────────────────────────────────────────────────────────

const NOTIF_TIMES = [5, 10, 15, 20, 30]

function PageProfile({
  role,
  onRoleChange,
  dorm,
  onDormChange,
  myGroup,
  myMode,
  activeGroup,
  showDormBanner,
  onShowDormBanner,
  showEventBanners,
  onShowEventBanners,
  onToast,
  onOpenIosPrompt,
  hasCustomSchedule,
  onApplySchedule,
  onResetOfficial,
  onOpenSyncModal,
  lastSyncDisplay,
}: {
  role: UserRole
  onRoleChange: (r: UserRole) => void
  dorm: string
  onDormChange: (d: string) => void
  myGroup: string
  myMode: "student" | "teacher"
  activeGroup: string
  showDormBanner: boolean
  showEventBanners: boolean
  onShowDormBanner: (v: boolean) => void
  onShowEventBanners: (v: boolean) => void
  onToast?: (msg: string, type: "info" | "success" | "warn") => void
  onOpenIosPrompt?: () => void
  hasCustomSchedule?: boolean
  onApplySchedule?: (result: ParsedGroupResult) => void
  onResetOfficial?: () => void
  onOpenSyncModal?: () => void
  lastSyncDisplay?: string
}) {
  const weekNum = getStudyWeek(TODAY)

  const [notifSchedule, setNotifSchedule] = useState(false)
  const [notifScheduleMin, setNotifScheduleMin] = useState(15)
  const [notifScheduleExpanded, setNotifScheduleExpanded] = useState(false)
  const [notifEvents, setNotifEvents] = useState(false)
  const [notifHomework, setNotifHomework] = useState(false)
  const [notifHomeworkDeadline, setNotifHomeworkDeadline] = useState(false)
  const [notifDorm, setNotifDorm] = useState(false)
  const [notifDormMin, setNotifDormMin] = useState(10)
  const [notifChanges, setNotifChanges] = useState(false)

  const [codeVal, setCodeVal] = useState("")
  const [shaking, setShaking] = useState(false)
  const [pdfModalOpen, setPdfModalOpen] = useState(false)
  const [autoSync, setAutoSync] = useState(() => {
    try {
      const s = localStorage.getItem("timacad_auto_sync")
      return s !== null ? s === "true" : true
    } catch {
      return true
    }
  })

  // Cache & Storage Retention state
  const [cacheUsage, setCacheUsage] = useState<StorageUsageInfo>(() => getStorageUsageBytes())
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false)

  useEffect(() => {
    setCacheUsage(getStorageUsageBytes())
  }, [lastSyncDisplay, hasCustomSchedule])

  function handleClearCacheConfirm() {
    const res = clearUserCache(true)
    setCacheUsage(getStorageUsageBytes())
    setClearConfirmOpen(false)
    onResetOfficial?.()
    onToast?.(
      `Кэш очищен. Освобождено: ${res.formattedFreed || "0 КБ"}. Настройки (группа, роль, тема) сохранены.`,
      "success",
    )
  }

  const SECRET = "TIMA-2025"
  function tryCode() {
    const trimmed = codeVal.trim()
    if (
      trimmed === SECRET ||
      trimmed.toUpperCase() === "СТАРОСТА" ||
      trimmed === "2026"
    ) {
      onRoleChange("headstudent")
      onToast?.(
        "Вы теперь Староста! Все функции управления и импорта расписания активны.",
        "success",
      )
      setCodeVal("")
    } else {
      setShaking(true)
      onToast?.("Неверный код Старосты (демо-код: TIMA-2025)", "warn")
      setTimeout(() => setShaking(false), 400)
    }
  }

  function handleAutoSyncToggle(v: boolean) {
    setAutoSync(v)
    try {
      localStorage.setItem("timacad_auto_sync", String(v))
    } catch {}
    onToast?.(
      v
        ? "Ежедневная сверка включена (фоновое обновление с timacad.ru)"
        : "Автоматическая сверка отключена старостой",
      "info",
    )
  }

  function Toggle({
    value,
    onChange,
  }: {
    value: boolean
    onChange: (v: boolean) => void
  }) {
    return (
      <button
        onClick={() => onChange(!value)}
        className={`relative w-10 h-6 rounded-full transition-all flex-shrink-0 ${
          value ? "bg-primary" : "bg-border"
        }`}
      >
        <span
          className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-all ${
            value ? "left-5" : "left-1"
          }`}
        />
      </button>
    )
  }

  return (
    <div className="px-4 pt-1 pb-2 space-y-3">
      <div className="bg-card border border-border rounded-2xl p-4 flex items-center gap-4">
        <div className="w-14 h-14 rounded-2xl bg-primary flex items-center justify-center flex-shrink-0">
          <span className="text-xl text-white font-extrabold">
            {activeGroup.slice(0, 2)}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-fg text-base">
            {myMode === "teacher" ? activeGroup : `Группа ${activeGroup}`}
          </p>
          <p className="text-xs text-muted-fg mt-0.5">
            {myMode === "teacher" ? "Преподаватель" : "Студент"} · РГАУ–МСХА
          </p>
          <p className="text-xs text-accent font-semibold mt-0.5">
            {weekNum}-я неделя · {weekNum % 2 === 0 ? "Чётная" : "Нечётная"}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {[
          { label: "Учебная неделя", value: `${weekNum}-я` },
          { label: "Семестр", value: "Осенний 2026" },
          { label: "Форма обучения", value: "Очная" },
          { label: "Институт", value: "Агрономия" },
        ].map((item) => (
          <div
            key={item.label}
            className="bg-card border border-border rounded-xl p-3"
          >
            <p className="text-[11px] text-muted-fg">{item.label}</p>
            <p className="text-sm font-bold text-fg mt-0.5">{item.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          {I.route(16, "text-muted-fg")}
          <span className="text-sm font-bold text-fg">Проживание</span>
        </div>
        <div className="px-4 py-3 space-y-2">
          <p className="text-xs text-muted-fg">
            Откуда добираетесь на занятия?
          </p>
          <div className="flex gap-1.5 flex-wrap">
            {DORMS.map((d) => (
              <button
                key={d}
                onClick={() => onDormChange(d)}
                className={`px-2.5 py-1.5 text-xs font-semibold rounded-xl border transition-all ${
                  dorm === d
                    ? "bg-primary text-white border-primary"
                    : "bg-muted border-border text-muted-fg hover:text-fg hover:border-accent/40"
                }`}
              >
                {d === "Не указано" ? d : d.replace("Общежитие ", "Общ. ")}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Notifications */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          {I.bell(16, "text-muted-fg")}
          <span className="text-sm font-bold text-fg">Уведомления</span>
          <span className="ml-auto text-[11px] text-muted-fg bg-muted px-2 py-0.5 rounded-full">
            По умолчанию выкл.
          </span>
        </div>
        <div className="divide-y divide-border">
          <div>
            <div className="flex items-center justify-between px-4 py-3 gap-3">
              <button
                onClick={() =>
                  notifSchedule && setNotifScheduleExpanded((e) => !e)
                }
                className="flex-1 min-w-0 text-left"
              >
                <p className="text-sm font-semibold text-fg">
                  Напоминание о парах
                </p>
                <p className="text-xs text-muted-fg">
                  {notifSchedule
                    ? `За ${notifScheduleMin} мин до начала`
                    : "Выключено"}
                </p>
              </button>
              <Toggle
                value={notifSchedule}
                onChange={(v) => {
                  setNotifSchedule(v)
                  if (v) setNotifScheduleExpanded(true)
                  else setNotifScheduleExpanded(false)
                }}
              />
            </div>
            {notifSchedule && notifScheduleExpanded && (
              <div className="px-4 pb-3">
                <p className="text-xs text-muted-fg mb-2">За сколько минут:</p>
                <div className="flex gap-1.5 flex-wrap">
                  {NOTIF_TIMES.map((t) => (
                    <button
                      key={t}
                      onClick={() => setNotifScheduleMin(t)}
                      className={`px-3 py-1.5 text-xs font-bold rounded-xl border transition-all ${
                        notifScheduleMin === t
                          ? "bg-primary text-white border-primary"
                          : "bg-muted border-border text-muted-fg hover:border-accent/40"
                      }`}
                    >
                      {t} мин
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => setNotifScheduleExpanded(false)}
                  className="mt-2 text-xs text-muted-fg hover:text-fg"
                >
                  Свернуть
                </button>
              </div>
            )}
          </div>
          <div className="flex items-center justify-between px-4 py-3 gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-fg">
                Изменения в расписании
              </p>
              <p className="text-xs text-muted-fg">Отмены, переносы, замены</p>
            </div>
            <Toggle value={notifChanges} onChange={setNotifChanges} />
          </div>
          <div className="flex items-center justify-between px-4 py-3 gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-fg">События кампуса</p>
              <p className="text-xs text-muted-fg">Мероприятия и объявления</p>
            </div>
            <Toggle value={notifEvents} onChange={setNotifEvents} />
          </div>
          <div>
            <div className="flex items-center justify-between px-4 py-3 gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-fg">
                  Домашние задания
                </p>
                <p className="text-xs text-muted-fg">
                  При добавлении старостой
                </p>
              </div>
              <Toggle value={notifHomework} onChange={setNotifHomework} />
            </div>
            {notifHomework && (
              <div className="flex items-center justify-between px-4 pb-3 gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-muted-fg">
                    Напоминание о дедлайне
                  </p>
                  <p className="text-xs text-muted-fg">За день до сдачи</p>
                </div>
                <Toggle
                  value={notifHomeworkDeadline}
                  onChange={setNotifHomeworkDeadline}
                />
              </div>
            )}
          </div>
          <div>
            <div className="flex items-center justify-between px-4 py-3 gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-fg">
                  Выход из общежития
                </p>
                <p className="text-xs text-muted-fg">
                  {notifDorm ? `За ${notifDormMin} мин` : "Расчёт времени пути"}
                </p>
              </div>
              <Toggle value={notifDorm} onChange={setNotifDorm} />
            </div>
            {notifDorm && (
              <div className="px-4 pb-3">
                <div className="flex gap-1.5 flex-wrap">
                  {[5, 10, 15, 20].map((t) => (
                    <button
                      key={t}
                      onClick={() => setNotifDormMin(t)}
                      className={`px-3 py-1.5 text-xs font-bold rounded-xl border transition-all ${
                        notifDormMin === t
                          ? "bg-primary text-white border-primary"
                          : "bg-muted border-border text-muted-fg hover:border-accent/40"
                      }`}
                    >
                      {t} мин
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Display settings */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          {I.settings(16, "text-muted-fg")}
          <span className="text-sm font-bold text-fg">Отображение</span>
        </div>
        <div className="divide-y divide-border">
          <div className="flex items-center justify-between px-4 py-3 gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-fg">
                Баннеры о событиях
              </p>
              <p className="text-xs text-muted-fg">
                «День открытых дверей» и другие
              </p>
            </div>
            <Toggle value={showEventBanners} onChange={onShowEventBanners} />
          </div>
          <div className="flex items-center justify-between px-4 py-3 gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-fg">
                Подсказка пути из общежития
              </p>
              <p className="text-xs text-muted-fg">Время до первой пары</p>
            </div>
            <Toggle value={showDormBanner} onChange={onShowDormBanner} />
          </div>
        </div>
      </div>

      {/* Application / PWA section */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          {I.home(16, "text-muted-fg")}
          <span className="text-sm font-bold text-fg">Приложение</span>
        </div>
        <div className="p-3">
          {isStandaloneMode() ? (
            <div className="flex items-center gap-3 p-3 bg-muted rounded-xl">
              <span className="text-primary font-bold text-base">✓</span>
              <div>
                <p className="text-xs font-bold text-fg">
                  Приложение установлено
                </p>
                <p className="text-[11px] text-muted-fg">
                  Запущено в полноэкранном режиме экрана «Домой»
                </p>
              </div>
            </div>
          ) : (isIosDevice() || isIPadDevice()) && getIosBrowserType() === "safari" ? (
            <button
              onClick={onOpenIosPrompt}
              className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-muted transition-colors text-left cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold text-sm">
                  📱
                </div>
                <div>
                  <p className="text-xs font-bold text-fg">
                    Установка на экран «Домой»
                  </p>
                  <p className="text-[11px] text-muted-fg">
                    Инструкция для быстрого запуска на iPhone и iPad
                  </p>
                </div>
              </div>
              {I.chev("right", 14, "text-muted-fg")}
            </button>
          ) : (
            <div className="flex items-center gap-3 p-3 bg-muted rounded-xl">
              <span className="text-base">🌐</span>
              <div>
                <p className="text-xs font-bold text-fg">
                  Веб-версия активна
                </p>
                <p className="text-[11px] text-muted-fg">
                  Автономный режим и кэш данных работают в текущем браузере
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          {I.settings(16, "text-muted-fg")}
          <span className="text-sm font-bold text-fg">Роль (демо)</span>
        </div>
        <div className="px-4 py-3 space-y-2">
          <div className="flex bg-muted rounded-xl p-0.5 gap-0.5">
            {([
              ["student", "Студент"],
              ["headstudent", "Старостa"],
            ] as [UserRole, string][]).map(([r, l]) => (
              <button
                key={r}
                onClick={() => onRoleChange(r)}
                className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
                  role === r
                    ? "bg-primary text-white shadow-sm"
                    : "text-muted-fg hover:text-fg"
                }`}
              >
                {l}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-muted-fg">
            Старостa: управление парами, ДЗ, события
          </p>
          {/* Headstudent authentication and control panel */}
          <div className="mt-2 space-y-3">
            {role !== "headstudent" ? (
              <div className="space-y-2">
                <p className="text-[11px] text-muted-fg">
                  Введите секретный код Старосты (демо-код: TIMA-2025):
                </p>
                <div className="flex gap-2">
                  <input
                    value={codeVal}
                    onChange={(e) => setCodeVal(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") tryCode()
                    }}
                    placeholder="Код Старосты..."
                    className={`flex-1 border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-accent bg-card text-fg ${
                      shaking ? "animate-shake border-red" : ""
                    }`}
                  />
                  <button
                    onClick={tryCode}
                    className="px-3 py-2 bg-primary text-white rounded-xl text-sm font-bold active:scale-95 transition-transform cursor-pointer"
                  >
                    OK
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3 pt-1 border-t border-border">
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-primary/10 border border-primary/20">
                  <div className="flex items-center gap-2">
                    <span className="text-base">🎓</span>
                    <div>
                      <p className="text-xs font-bold text-primary">
                        Режим Старосты активен
                      </p>
                      <p className="text-[10px] text-muted-fg">
                        Группа {activeGroup} · Полные права куратора
                      </p>
                    </div>
                  </div>
                  <span className="text-xs font-bold text-primary px-2 py-0.5 rounded-md bg-card shadow-xs">
                    Куратор
                  </span>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-fg">
                      Ежедневная сверка с сайтом
                    </p>
                    <p className="text-xs text-muted-fg">
                      Автоматическая сверка расписания (timacad.ru)
                    </p>
                  </div>
                  <Toggle
                    value={autoSync}
                    onChange={handleAutoSyncToggle}
                  />
                </div>

                <div className="space-y-2 pt-1 border-t border-border">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-fg">
                        Официальное PDF расписание
                      </p>
                      <p className="text-xs text-muted-fg">
                        {hasCustomSchedule
                          ? "Применено расписание из загруженного PDF"
                          : "Синхронизировано с timacad.ru"}
                      </p>
                    </div>
                    {hasCustomSchedule && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-500/25">
                        Кастомный PDF
                      </span>
                    )}
                  </div>

                  <button
                    onClick={() => setPdfModalOpen(true)}
                    className="flex items-center justify-center gap-2 w-full py-2.5 px-3 border border-dashed border-primary/50 rounded-xl bg-primary/5 text-primary text-xs font-bold cursor-pointer hover:bg-primary/10 transition-colors active:scale-[0.99]"
                  >
                    {I.upload(14)}
                    <span>Загрузить PDF расписания группы</span>
                  </button>

                  {hasCustomSchedule && (
                    <button
                      onClick={onResetOfficial}
                      className="text-xs font-semibold text-muted-fg hover:text-red transition-colors w-full text-center py-1 cursor-pointer"
                    >
                      Сбросить к официальному расписанию сайта
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <PdfUploadModal
        isOpen={pdfModalOpen}
        activeGroup={activeGroup}
        hasCustomSchedule={!!hasCustomSchedule}
        onClose={() => setPdfModalOpen(false)}
        onApplySchedule={(result) => {
          onApplySchedule?.(result)
          setPdfModalOpen(false)
        }}
        onResetOfficial={() => {
          onResetOfficial?.()
          setPdfModalOpen(false)
        }}
        onToast={onToast}
      />

      {/* Official Timacad Sources & Sync status */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-sm font-bold text-fg">Сверка с timacad.ru</span>
          <span className="ml-auto text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full">
            Актуально
          </span>
        </div>
        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-bold text-fg">Статус актуальности данных</p>
              <p className="text-[11px] text-muted-fg mt-0.5">
                {lastSyncDisplay || "Синхронизировано"} · {OFFICIAL_TIMACAD_SOURCES.length} источников
              </p>
            </div>
            {onOpenSyncModal && (
              <button
                onClick={onOpenSyncModal}
                className="px-3 py-1.5 rounded-xl bg-primary text-white text-xs font-bold shadow-xs hover:bg-primary-light transition-colors cursor-pointer flex-shrink-0"
              >
                Реестр источников
              </button>
            )}
          </div>
          <div className="flex items-center justify-between pt-2 border-t border-border">
            <div className="flex-1 min-w-0 pr-2">
              <p className="text-xs font-semibold text-fg">Фоновая авто-сверка данных</p>
              <p className="text-[10px] text-muted-fg">Автономная сверка расписания на устройстве</p>
            </div>
            <Toggle value={autoSync} onChange={handleAutoSyncToggle} />
          </div>
        </div>
      </div>

      {/* Cache Retention & Storage section */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          {I.database(16, "text-muted-fg")}
          <span className="text-sm font-bold text-fg">Память и кэш данных</span>
          <span className="ml-auto text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full">
            Кэш данных: {cacheUsage.formatted}
          </span>
        </div>
        <div className="p-4 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-fg">Размер локального кэша</p>
              <p className="text-[11px] text-muted-fg mt-0.5 leading-relaxed">
                Занято на устройстве: <span className="font-semibold text-fg">{cacheUsage.formatted}</span> ({cacheUsage.itemCount} записей). Включает новости, анонсы и оффлайн-сетку расписания.
              </p>
              <div className="flex items-center gap-1.5 mt-2 text-[10px] text-muted-fg">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span>Авто-очистка: события старше 45 дней и временные буферы очищаются автоматически</span>
              </div>
            </div>
            <button
              onClick={() => setClearConfirmOpen(true)}
              className="px-3 py-1.5 rounded-xl border border-red/40 bg-red/10 text-red text-xs font-bold hover:bg-red/15 active:scale-95 transition-all cursor-pointer flex-shrink-0 flex items-center gap-1.5"
            >
              {I.trash(13)}
              <span>Очистить кэш</span>
            </button>
          </div>

          {clearConfirmOpen && (
            <div className="p-3 rounded-xl bg-muted/60 border border-border space-y-2.5 animate-fade-in">
              <div className="flex items-start gap-2">
                <span className="text-base">⚠️</span>
                <div>
                  <p className="text-xs font-bold text-fg">Очистить кэш данных приложения?</p>
                  <p className="text-[11px] text-muted-fg mt-0.5">
                    Будут удалены временные буферы PDF, кэш новостей и расписания. Ваши настройки группы, роли и темы оформления сохранятся.
                  </p>
                </div>
              </div>
              <div className="flex gap-2 justify-end pt-1">
                <button
                  onClick={() => setClearConfirmOpen(false)}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-border bg-card text-muted-fg hover:text-fg cursor-pointer"
                >
                  Отмена
                </button>
                <button
                  onClick={handleClearCacheConfirm}
                  className="px-3 py-1.5 text-xs font-bold rounded-lg bg-red text-white hover:opacity-90 active:scale-95 transition-all cursor-pointer shadow-xs"
                >
                  Подтвердить очистку
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          {I.ext(13, "text-muted-fg")}
          <span className="text-sm font-bold text-fg">Сервисы и ресурсы РГАУ-МСХА</span>
        </div>
        {[
          {
            label: "Личный кабинет обучающегося (ЭИОС)",
            sub: "edu.timacad.ru · Электронная зачётка и портфолио",
            href: "https://edu.timacad.ru",
          },
          {
            label: "СДО Moodle РГАУ-МСХА",
            sub: "moodle.timacad.ru · Учебные курсы, тесты и задания",
            href: "https://moodle.timacad.ru",
          },
          {
            label: "Научная библиотека им. Н.И. Железнова",
            sub: "elib.timacad.ru · ЭБС, фонд учебников и периодики",
            href: "https://elib.timacad.ru",
          },
          {
            label: "Профком студентов (ППОС РГАУ-МСХА)",
            sub: "t.me/profcom_timacad · Социальные карты, матпомощь, льготы",
            href: "https://t.me/profcom_timacad",
          },
          {
            label: "Официальный Telegram Тимирязевки",
            sub: "t.me/timacad_live · Главные новости и важные оповещения",
            href: "https://t.me/timacad_live",
          },
          {
            label: "Официальная группа ВКонтакте",
            sub: "vk.com/timacad · Студенческая жизнь и анонсы",
            href: "https://vk.com/timacad",
          },
          {
            label: "Студенческий городок и общежития",
            sub: "timacad.ru · Паспортный стол, коменданты, график",
            href: "https://www.timacad.ru/life/studencheskii-gorodok",
          },
          {
            label: "Спортивный клуб «Тимирязевские Зубры»",
            sub: "timacad.ru/life/sport · Бассейн и 24 спортивные секции",
            href: "https://www.timacad.ru/life/sport",
          },
          {
            label: "Центр карьеры и практики в АПК",
            sub: "timacad.ru/life/karera · Вакансии агрохолдингов и стажировки",
            href: "https://www.timacad.ru/life/karera",
          },
          {
            label: "Деканаты и дирекции институтов",
            sub: "Пн–Пт 10:00–17:00 · Контакты дирекций и учебных отделов",
            href: "https://www.timacad.ru/education/instituty-i-fakultety",
          },
          {
            label: "Единая справочная и горячая линия",
            sub: "+7 (499) 976-04-80 · Справочная университета",
            href: "https://www.timacad.ru/contacts",
          },
        ].map((item) => (
          <div
            key={item.label}
            className={`flex items-center gap-3 px-4 py-3 border-b border-border last:border-0 ${
              item.href ? "hover:bg-muted cursor-pointer" : ""
            } transition-colors`}
            onClick={() => item.href && window.open(item.href, "_blank")}
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-fg">{item.label}</p>
              <p className="text-xs text-muted-fg">{item.sub}</p>
            </div>
            {item.href && I.ext(12, "text-muted-fg flex-shrink-0")}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Global Search ────────────────────────────────────────────────────────────

function GlobalSearch({
  query,
  onClose,
  allDays,
}: {
  query: string
  onClose: () => void
  allDays?: DaySchedule[]
}) {
  const q = query.toLowerCase().trim()
  if (!q) return null
  const classResults = (allDays ?? ALL_DAYS).flatMap((d) => d.classes)
    .filter((c, i, arr) => arr.findIndex((x) => x.subject === c.subject) === i)
    .filter(
      (c) =>
        c.subject.toLowerCase().includes(q) ||
        c.teacher.toLowerCase().includes(q) ||
        c.building.toLowerCase().includes(q),
    )
  const foodResults = FOOD_SPOTS.filter(
    (f) =>
      f.name.toLowerCase().includes(q) ||
      (f.building ?? f.proximity ?? "").toLowerCase().includes(q),
  )
  const bldgResults = Object.entries(BUILDING_DETAILS).filter(
    ([, b]) =>
      b.name.toLowerCase().includes(q) || b.address.toLowerCase().includes(q),
  )
  const eventResults = getAppEvents().filter(
    (e) =>
      e.title.toLowerCase().includes(q) || e.place.toLowerCase().includes(q),
  )
  const total =
    classResults.length +
    foodResults.length +
    bldgResults.length +
    eventResults.length
  return (
    <div
      className="absolute inset-0 z-30 overflow-y-auto animate-fade-in"
      style={{ background: "var(--color-bg)" }}
    >
      <div className="px-4 pt-3 pb-6 space-y-4">
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs text-muted-fg">
            {total > 0 ? `Найдено: ${total}` : "Ничего не найдено"}
          </p>
          <button
            onClick={onClose}
            className="text-xs text-primary font-semibold"
          >
            Закрыть
          </button>
        </div>
        {classResults.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-bold text-muted-fg uppercase tracking-wide">
              Дисциплины
            </p>
            {classResults.map((c) => (
              <div
                key={c.id}
                className="bg-card border border-border rounded-2xl px-4 py-3"
              >
                <p className="text-sm font-bold text-fg">{c.subject}</p>
                <p className="text-xs text-muted-fg mt-0.5">{c.teacher}</p>
                <p className="text-xs text-muted-fg">
                  {c.building}, ауд. {c.room}
                </p>
              </div>
            ))}
          </div>
        )}
        {eventResults.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-bold text-muted-fg uppercase tracking-wide">
              События
            </p>
            {eventResults.map((e) => (
              <div
                key={e.id}
                className="bg-card border border-border rounded-2xl px-4 py-3"
              >
                <p className="text-sm font-bold text-fg">{e.title}</p>
                <p className="text-xs text-muted-fg">
                  {e.place} · {fmtDate(e.date)}
                </p>
              </div>
            ))}
          </div>
        )}
        {bldgResults.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-bold text-muted-fg uppercase tracking-wide">
              Корпуса
            </p>
            {bldgResults.map(([key, b], bi) => (
              <div
                key={key}
                className="stagger-card bg-card border border-border rounded-2xl px-4 py-3 flex items-center gap-3 hover:border-accent/40 transition-colors"
                style={{ animationDelay: `${bi * 30}ms` }}
              >
                <CampusBadge
                  category="academic"
                  label={b.short.replace(/[^\d]/g, "") || "1"}
                  size={32}
                  className="flex-shrink-0"
                />
                <div>
                  <p className="text-sm font-bold text-fg">{b.name}</p>
                  <p className="text-xs text-muted-fg">{b.address}</p>
                </div>
              </div>
            ))}
          </div>
        )}
        {foodResults.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-bold text-muted-fg uppercase tracking-wide">
              Где поесть
            </p>
            {foodResults.map((f, fi) => (
              <div
                key={f.id}
                className="stagger-card bg-card border border-border rounded-2xl px-4 py-3 flex items-center gap-3 hover:border-accent/40 transition-colors"
                style={{ animationDelay: `${fi * 30}ms` }}
              >
                <CampusBadge
                  category="dining"
                  size={32}
                  className="flex-shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-fg">{f.name}</p>
                  <p className="text-xs text-muted-fg">
                    {f.building ?? f.proximity}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

</div>
    </div>
  )
}

// ─── Onboarding ───────────────────────────────────────────────────────────────

function OnboardingScreen({
  onDone,
}: {
  onDone: (value: string, mode: "student" | "teacher") => void
}) {
  const [mode, setMode] = useState<"student" | "teacher">("student")
  const [query, setQuery] = useState("")
  const isStudent = mode === "student"
  const list = isStudent ? RGAU_GROUPS : RGAU_TEACHERS
  const suggestions =
    query.length >= 1
      ? (() => {
          const q = query.toLowerCase()
          const p = list.filter((g) => g.toLowerCase().startsWith(q))
          const r = list.filter(
            (g) =>
              !g.toLowerCase().startsWith(q) && g.toLowerCase().includes(q),
          )
          return [...p, ...r].slice(0, 8)
        })()
      : []
  function pick(v: string) {
    onDone(v, mode)
  }
  return (
    <div
      className="min-h-[100dvh] w-full flex flex-col items-center justify-center px-4 py-8 gap-5 animate-fade-in overflow-y-auto"
      style={{ background: "var(--color-bg)" }}
    >
      <div className="text-center space-y-1">
        <div className="w-20 h-20 rounded-3xl bg-primary flex items-center justify-center mx-auto mb-4 animate-bounce-in shadow-lg shadow-primary/25">
          <span className="text-3xl">🌾</span>
        </div>
        <h1 className="text-2xl font-extrabold text-fg animate-slide-up">
          РГАУ-МСХА
        </h1>
        <p className="text-sm text-muted-fg animate-fade-in">
          им. К.А. Тимирязева · с 1865 года
        </p>
      </div>
      <div className="w-full max-w-xs space-y-4">
        <div className="flex bg-muted rounded-2xl p-1 gap-1">
          {(["student", "teacher"] as const).map((m) => (
            <button
              key={m}
              onClick={() => {
                setMode(m)
                setQuery("")
              }}
              className={`flex-1 py-2 text-sm font-bold rounded-xl transition-all ${
                mode === m
                  ? "bg-primary text-white shadow-sm"
                  : "text-muted-fg hover:text-fg"
              }`}
            >
              {m === "student" ? "Студент" : "Преподаватель"}
            </button>
          ))}
        </div>
        <div className="space-y-2">
          <p className="text-sm font-semibold text-fg text-center">
            {isStudent ? "Введите свою группу" : "Введите ваше имя"}
          </p>
          <div className="relative">
            <div className="flex items-center gap-2 border-2 border-border bg-card rounded-2xl px-4 py-3 focus-within:border-accent transition-colors">
              {I.search(16, "text-muted-fg flex-shrink-0")}
              <input
                key={mode}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={
                  isStudent
                    ? "Например ДЭ-17-26..."
                    : "Например Иванова М.С...."
                }
                className="flex-1 text-sm bg-transparent outline-none text-fg placeholder:text-muted-fg font-medium"
                autoFocus
              />
              {query && (
                <button onClick={() => setQuery("")} className="text-muted-fg">
                  {I.close(14)}
                </button>
              )}
            </div>
            {suggestions.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-2xl shadow-lg overflow-hidden z-10">
                {suggestions.map((g) => (
                  <button
                    key={g}
                    onClick={() => pick(g)}
                    className="w-full text-left px-4 py-3 text-sm font-bold text-fg hover:bg-muted transition-colors border-b border-border last:border-0"
                  >
                    {g}
                  </button>
                ))}
              </div>
            )}
          </div>
          {query.length > 0 && suggestions.length === 0 && (
            <button
              onClick={() => pick(query)}
              className="w-full py-3 bg-primary text-white font-bold rounded-2xl text-sm hover:opacity-90 transition-opacity"
            >
              Продолжить: «{query}»
            </button>
          )}
          {!query && (
            <div className="space-y-3 animate-fade-in">
              <p className="text-xs text-muted-fg text-center">
                Начните вводить или выберите из популярных
              </p>
              <div className="space-y-1.5">
                {isStudent
                  ? [
                      ["ДА", "ДА 01-26", "Агробиотехнология"],
                      ["ДЭ", "ДЭ 17-26", "Экономика и финансы"],
                      ["ТТ", "ТТ 11-26", "Механика и мобильные системы"],
                      ["ЗУ", "ЗУ 11-26", "Землеустройство и кадастры"],
                    ].map(([abbr, g, hint]) => (
                      <button
                        key={g}
                        onClick={() => pick(g)}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border border-border bg-card hover:border-accent/50 hover:bg-muted/30 transition-all text-left"
                      >
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <span className="text-xs font-extrabold text-primary">
                            {abbr}
                          </span>
                        </div>
                        <div>
                          <p className="text-sm font-bold text-fg">{g}</p>
                          <p className="text-[11px] text-muted-fg">{hint}</p>
                        </div>
                        {I.arrowRight(12, "text-muted-fg")}
                      </button>
                    ))
                  : ["Иванова М.С.", "Петров А.Н.", "Смирнов Г.К."].map((t) => (
                      <button
                        key={t}
                        onClick={() => pick(t)}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border border-border bg-card hover:border-accent/50 hover:bg-muted/30 transition-all text-left"
                      >
                        <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                          <span className="text-xs font-extrabold text-white">
                            {t.split(" ")[0].slice(0, 2)}
                          </span>
                        </div>
                        <p className="text-sm font-bold text-fg flex-1">{t}</p>
                        {I.arrowRight(12, "text-muted-fg")}
                      </button>
                    ))}
              </div>
            </div>
          )}
        </div>

</div>
    </div>
  )
}

// ─── Bottom Nav ───────────────────────────────────────────────────────────────

type Tab = "schedule" | "campus" | "events" | "profile"
const TAB_TITLES: Record<Tab, string> = {
  schedule: "Расписание",
  campus: "Кампус",
  events: "События",
  profile: "Профиль",
}
const TAB_ORDER: Tab[] = ["schedule", "campus", "events", "profile"]

function BottomNav({
  active,
  onChange,
}: {
  active: Tab
  onChange: (t: Tab) => void
}) {
  const items: [Tab, (a: boolean) => React.ReactNode][] = [
    ["schedule", (a) => I.cal(22, a ? "text-primary" : "text-[#7C7C7C]")],
    ["campus", (a) => I.map(22, a ? "text-primary" : "text-[#7C7C7C]")],
    ["events", (a) => I.bell(22, a ? "text-primary" : "text-[#7C7C7C]")],
    ["profile", (a) => I.user(22, a ? "text-primary" : "text-[#7C7C7C]")],
  ]
  const activeIndex = TAB_ORDER.indexOf(active)
  return (
    <nav
      className="flex-shrink-0 relative flex items-stretch justify-around border-t border-border px-1 pt-2"
      style={{
        backdropFilter: "blur(12px)",
        background: "color-mix(in srgb,var(--color-card) 80%,transparent)",
        paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 14px)",
      }}
    >
      {/* sliding pill indicator */}
      <div
        className="absolute top-1.5 left-0 right-0 flex px-1 pointer-events-none"
        style={{ height: "calc(100% - 22px)" }}
      >
        <div
          style={{
            width: `${100 / items.length}%`,
            transform: `translateX(${activeIndex * 100}%)`,
            transition: "transform 0.25s cubic-bezier(.22,1,.36,1)",
          }}
          className="rounded-xl bg-primary/8"
        />
      </div>
      {items.map(([id, icon]) => (
        <button
          key={id}
          onClick={() => onChange(id)}
          className="flex flex-col items-center gap-0.5 px-4 pt-1 pb-0.5 rounded-xl transition-all active:scale-95 relative flex-1"
        >
          {icon(active === id)}
          <span
            className={`text-[10px] font-bold transition-colors ${
              active === id ? "text-primary" : "text-[#7C7C7C]"
            }`}
          >
            {TAB_TITLES[id]}
          </span>
          {active === id && (
            <div
              className="absolute bottom-0 left-1/2 -translate-x-1/2 w-6 h-0.5 rounded-full bg-primary"
              style={{
                animation: "tab-indicator .25s cubic-bezier(.22,1,.36,1) both",
              }}
            />
          )}
        </button>
      ))}
    </nav>
  )
}

// ─── App Root ─────────────────────────────────────────────────────────────────

export default function App() {
  const [myGroup, setMyGroup] = useState<string | null>(() => {
    try {
      return localStorage.getItem("rgau_my_group")
    } catch {
      return null
    }
  })
  const [myMode, setMyMode] = useState<"student" | "teacher">("student")
  const [tab, setTab] = useState<Tab>("schedule")
  const [syncModalOpen, setSyncModalOpen] = useState(false)
  const [lastSyncDisplay, setLastSyncDisplay] = useState(() => {
    try {
      return localStorage.getItem("rgau_last_sync_display") || "Синхронизировано"
    } catch {
      return "Синхронизировано"
    }
  })

  const [timacadFeed, setTimacadFeed] = useState<TimacadFeedItem[]>(() => getCachedTimacadFeed())

  // Start client-side daily sync watcher on boot (schedules next 04:00 AM MSK auto-sync)
  useEffect(() => {
    const handleSync = (e: any) => {
      const res = e.detail as SyncResult
      if (res) {
        setLastSyncDisplay(res.displayTime)
        if (res.freshFeed) setTimacadFeed(res.freshFeed)
      }
    }
    window.addEventListener(SYNC_EVENT_NAME, handleSync)

    const cleanup = initDailySyncWatcher((res) => {
      setLastSyncDisplay(res.displayTime)
      if (res.freshFeed) setTimacadFeed(res.freshFeed)
      addToast(
        `Синхронизировано ${res.sourcesCount} источников timacad.ru: расписание и события актуальны`,
        "success"
      )
    })
    return () => {
      cleanup()
      window.removeEventListener(SYNC_EVENT_NAME, handleSync)
    }
  }, [])

  const [dark, setDark] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem("rgau_theme")
      if (saved) return saved === "dark"
      return (
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-color-scheme: dark)").matches
      )
    } catch {
      return false
    }
  })

  // Synchronize <html class="dark"> on documentElement
  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.classList.toggle("dark", dark)
    }
  }, [dark])

  // Fallback radial wave state for browsers without View Transitions API
  const [radialWave, setRadialWave] = useState<{
    x: number
    y: number
    radius: number
    nextDark: boolean
  } | null>(null)

  const handleDarkToggle = (e?: React.MouseEvent) => {
    const x = e ? e.clientX : window.innerWidth / 2
    const y = e ? e.clientY : window.innerHeight / 2
    const maxRadius = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y),
    )
    const next = !dark

    // Check View Transitions API support
    const doc = typeof document !== "undefined" ? (document as any) : null
    if (doc && typeof doc.startViewTransition === "function") {
      const transition = doc.startViewTransition(() => {
        setDark(next)
        document.documentElement.classList.toggle("dark", next)
        try {
          localStorage.setItem("rgau_theme", next ? "dark" : "light")
        } catch {}
      })

      transition.ready
        .then(() => {
          const clipPath = [
            `circle(0px at ${x}px ${y}px)`,
            `circle(${maxRadius}px at ${x}px ${y}px)`,
          ]
          document.documentElement.animate(
            {
              clipPath: next ? clipPath : [...clipPath].reverse(),
            },
            {
              duration: 480,
              easing: "cubic-bezier(0.32, 0.72, 0, 1)",
              pseudoElement: next
                ? "::view-transition-new(root)"
                : "::view-transition-old(root)",
            },
          )
        })
        .catch(() => {})
    } else {
      // Fluid CSS clip-path overlay fallback
      setRadialWave({ x, y, radius: maxRadius, nextDark: next })
      setDark(next)
      if (typeof document !== "undefined") {
        document.documentElement.classList.toggle("dark", next)
      }
      try {
        localStorage.setItem("rgau_theme", next ? "dark" : "light")
      } catch {}
      setTimeout(() => {
        setRadialWave(null)
      }, 500)
    }
  }
  const [role, setRole] = useState<UserRole>(() => {
    try {
      const saved = localStorage.getItem("rgau_role")
      if (saved === "student" || saved === "headstudent") return saved
    } catch {}
    return "student"
  })
  const handleRoleChange = (r: UserRole) => {
    setRole(r)
    try {
      localStorage.setItem("rgau_role", r)
    } catch {}
  }
  const [groupId, setGroupId] = useState<string>(() => {
    try {
      return localStorage.getItem("rgau_my_group") || "ДА 01-26"
    } catch {
      return "ДА 01-26"
    }
  })
  const [savedGroups, setSavedGroups] = useState<string[]>(() => {
    try {
      const my = localStorage.getItem("rgau_my_group")
      return my ? [my] : ["ДА 01-26"]
    } catch {
      return ["ДА 01-26"]
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem("rgau_saved_groups", JSON.stringify(savedGroups))
    } catch {}
  }, [savedGroups])
  const [allDays, setAllDays] = useState<DaySchedule[]>(() => {
    const initial = buildSchedule(groupId)
    ALL_DAYS = initial
    return initial
  })
  const [customScheduleActive, setCustomScheduleActive] = useState(() => {
    try {
      return !!localStorage.getItem(`timacad_custom_sched_${groupId}`)
    } catch {
      return false
    }
  })

  useEffect(() => {
    const updated = buildSchedule(groupId)
    setAllDays(updated)
    ALL_DAYS = updated
    try {
      setCustomScheduleActive(
        !!localStorage.getItem(`timacad_custom_sched_${groupId}`),
      )
    } catch {
      setCustomScheduleActive(false)
    }
  }, [groupId])

  function handleApplyCustomSchedule(result: ParsedGroupResult) {
    const converted = convertParsedToDaySchedule(result)
    try {
      localStorage.setItem(
        `timacad_custom_sched_${groupId}`,
        JSON.stringify(converted),
      )
    } catch {}
    const updated = buildSchedule(groupId, converted)
    setAllDays(updated)
    ALL_DAYS = updated
    setCustomScheduleActive(true)
    addToast(
      `Расписание группы «${groupId}» обновлено из PDF (${result.totalClasses} занятий)`,
      "success",
    )
  }

  function handleResetOfficialSchedule() {
    try {
      localStorage.removeItem(`timacad_custom_sched_${groupId}`)
    } catch {}
    const updated = buildSchedule(groupId)
    setAllDays(updated)
    ALL_DAYS = updated
    setCustomScheduleActive(false)
    addToast("Расписание сброшено к официальным данным РГАУ-МСХА", "info")
  }

  // Synchronize React states when cache is cleared
  useEffect(() => {
    const handleCacheCleared = () => {
      setTimacadFeed([...OFFICIAL_TIMACAD_FEED])
      try {
        localStorage.removeItem(`timacad_custom_sched_${groupId}`)
      } catch {}
      const updated = buildSchedule(groupId)
      setAllDays(updated)
      ALL_DAYS = updated
      setCustomScheduleActive(false)
    }
    if (typeof window !== "undefined") {
      window.addEventListener(CACHE_CLEARED_EVENT, handleCacheCleared)
      return () => window.removeEventListener(CACHE_CLEARED_EVENT, handleCacheCleared)
    }
  }, [groupId])

  // React when full official schedule is retrieved via background fetch or sync
  useEffect(() => {
    const handleScheduleUpdated = () => {
      const updated = buildSchedule(groupId)
      setAllDays(updated)
      ALL_DAYS = updated
    }
    if (typeof window !== "undefined") {
      window.addEventListener(SCHEDULE_UPDATED_EVENT, handleScheduleUpdated)
      return () => window.removeEventListener(SCHEDULE_UPDATED_EVENT, handleScheduleUpdated)
    }
  }, [groupId])

  const [groupSheetOpen, setGroupSheetOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [dorm, setDorm] = useState("Не указано")
  const [dormDismissed, setDormDismissed] = useState(false)
  const [dismissedEvents, setDismissedEvents] = useState<number[]>([])
  const [showDormBanner, setShowDormBanner] = useState(true)
  const [showEventBanners, setShowEventBanners] = useState(true)
  const [homework, setHomework] = useState<Homework[]>(INIT_HOMEWORK)
  const [personal, setPersonal] = useState<PersonalNote[]>(INIT_PERSONAL)
  const [konspekts, setKonspekts] = useState<Record<number, KonspektEntry>>({})
  const [sheetClassId, setSheetClassId] = useState<number | null>(null)
  const [manageClassId, setManageClassId] = useState<number | null>(null)
  const [subgroupSheetCls, setSubgroupSheetCls] = useState<ClassItem | null>(
    null,
  )
  const [disciplineCls, setDisciplineCls] = useState<ClassItem | null>(null)
  const [classEdits, setClassEdits] = useState<Record<number, ClassEdit>>({})
  const [subgroupPrefs, setSubgroupPrefs] =
    useState<Record<string, SubgroupPref>>({})
  const [campusFood, setCampusFood] = useState(false)
  const [customEvents, setCustomEvents] = useState<AppEvent[]>([])
  const [pinnedNote, setPinnedNote] = useState("")
  const [toasts, setToasts] = useState<ToastMsg[]>([])
  const [tabDir, setTabDir] = useState<"right" | "left" | null>(null)
  const [showIosPrompt, setShowIosPrompt] = useState(false)

  const activeDayList = allDays ?? ALL_DAYS
  const sheetClass = sheetClassId
    ? activeDayList.flatMap((d) => d.classes).find((c) => c.id === sheetClassId)
    : null
  const manageClass = manageClassId
    ? activeDayList.flatMap((d) => d.classes).find((c) => c.id === manageClassId)
    : null

  function hwChange(h: Homework) {
    setHomework((p) => {
      const i = p.findIndex((x) => x.classId === h.classId)
      if (i >= 0) {
        const n = [...p]
        n[i] = h
        return n
      }
      return [...p, h]
    })
  }
  function pnChange(n: PersonalNote) {
    setPersonal((p) => {
      const i = p.findIndex((x) => x.classId === n.classId)
      if (i >= 0) {
        const a = [...p]
        a[i] = n
        return a
      }
      return [...p, n]
    })
  }
  function editChange(id: number, e: ClassEdit) {
    setClassEdits((p) => ({ ...p, [id]: e }))
  }
  function konspektChange(classId: number, k: KonspektEntry) {
    setKonspekts((p) => ({ ...p, [classId]: k }))
  }

  function addToast(text: string, type: "info" | "success" | "warn" = "info") {
    const id = Date.now()
    setToasts((t) => [...t, { id, text, type }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5000)
  }
  function dismissToast(id: number) {
    setToasts((t) => t.filter((x) => x.id !== id))
  }

  const prevTab = useRef(tab)
  useEffect(() => {
    if (prevTab.current !== tab) {
      setSearchOpen(false)
      setSearch("")
      const prevIdx = TAB_ORDER.indexOf(prevTab.current)
      const curIdx = TAB_ORDER.indexOf(tab)
      setTabDir(curIdx > prevIdx ? "right" : "left")
      setTimeout(() => setTabDir(null), 250)
    }
    prevTab.current = tab
  }, [tab])

  if (!myGroup)
    return (
      <div
        className={`min-h-[100dvh] w-full flex flex-col overflow-y-auto ${dark ? "dark" : ""}`}
        style={{ background: "var(--color-bg)", color: "var(--color-fg)" }}
      >
        <OnboardingScreen
          onDone={(v, m) => {
            setMyGroup(v)
            setMyMode(m)
            setGroupId(v)
            setSavedGroups((p) => (p.includes(v) ? p : [v, ...p]))
            try {
              localStorage.setItem("rgau_my_group", v)
            } catch {}
          }}
        />
      </div>
    )

  const tabAnimClass =
    tabDir === "right"
      ? "animate-slide-from-right"
      : tabDir === "left"
        ? "animate-slide-from-left"
        : "tab-page"

  return (
    <div
      className={`h-[100dvh] min-h-[100dvh] w-full flex flex-col overflow-hidden ${dark ? "dark" : ""}`}
      style={{ background: "var(--color-bg)", color: "var(--color-fg)" }}
    >
      {radialWave && (
        <div
          className="radial-wave-overlay"
          style={
            {
              "--wave-x": `${radialWave.x}px`,
              "--wave-y": `${radialWave.y}px`,
              "--wave-radius": `${radialWave.radius}px`,
              backgroundColor: radialWave.nextDark ? "#0F1310" : "#F4F1EB",
            } as React.CSSProperties
          }
        />
      )}
      <AppHeader
        tab={tab}
        dark={dark}
        onDarkToggle={handleDarkToggle}
        groupId={groupId}
        onGroupOpen={() => setGroupSheetOpen(true)}
        searchOpen={searchOpen}
        onSearchToggle={() => {
          setSearchOpen((o) => !o)
          if (searchOpen) setSearch("")
        }}
        onSyncOpen={() => setSyncModalOpen(true)}
        lastSyncDisplay={lastSyncDisplay}
        onOpenIosPrompt={() => setShowIosPrompt(true)}
        onGoHome={() => setTab("schedule")}
      />
      <Toast toasts={toasts} onDismiss={dismissToast} />
      <main className="flex-1 overflow-y-auto overflow-x-hidden relative min-h-0">
        {searchOpen && search.length > 0 && (
          <GlobalSearch
            query={search}
            allDays={allDays}
            onClose={() => {
              setSearchOpen(false)
              setSearch("")
            }}
          />
        )}
        <div key={tab} className={tabAnimClass}>
          {searchOpen && tab !== "schedule" && search.length === 0 && (
            <SearchBar
              value={search}
              onChange={setSearch}
              placeholder={
                tab === "campus"
                  ? "Поиск корпусов, кафедр, еды..."
                  : tab === "events"
                    ? "Поиск событий..."
                    : "Поиск..."
              }
            />
          )}
          {tab === "schedule" && (
            <PageSchedule
              allDays={allDays}
              homework={homework}
              personal={personal}
              role={role}
              classEdits={classEdits}
              subgroupPrefs={subgroupPrefs}
              dorm={dorm}
              konspekts={konspekts}
              dormDismissed={dormDismissed}
              dismissedEvents={dismissedEvents}
              showDormBanner={showDormBanner}
              showEventBanners={showEventBanners}
              onDismissDorm={() => setDormDismissed(true)}
              onDismissEvent={(id) => setDismissedEvents((p) => [...p, id])}
              searchOpen={searchOpen}
              search={search}
              onSearchChange={setSearch}
              onBuildingClick={() => setTab("campus")}
              onNotesClick={(id) => setSheetClassId(id)}
              onManageClass={(id) => setManageClassId(id)}
              onSubgroupTap={(cls) => setSubgroupSheetCls(cls)}
              onSubjectClick={(cls) => setDisciplineCls(cls)}
              onEat={() => {
                setCampusFood(true)
                setTab("campus")
              }}
            />
          )}
          {tab === "campus" && (
            <PageCampus initFood={campusFood} search={search} role={role} />
          )}
          {tab === "events" && (
            <PageEvents
              role={role}
              customEvents={customEvents}
              onAddEvent={(e) => setCustomEvents((p) => [...p, e])}
              onEditEvent={(e) =>
                setCustomEvents((p) => p.map((x) => (x.id === e.id ? e : x)))
              }
              onDeleteEvent={(id) =>
                setCustomEvents((p) => p.filter((x) => x.id !== id))
              }
              pinnedNote={pinnedNote}
              onPinnedNote={setPinnedNote}
              search={search}
              onOpenSyncModal={() => setSyncModalOpen(true)}
              lastSyncDisplay={lastSyncDisplay}
              feedItems={timacadFeed}
            />
          )}
          {tab === "profile" && (
            <PageProfile
              role={role}
              onRoleChange={handleRoleChange}
              dorm={dorm}
              onDormChange={setDorm}
              myGroup={myGroup!}
              myMode={myMode}
              activeGroup={groupId}
              showDormBanner={showDormBanner}
              onShowDormBanner={setShowDormBanner}
              showEventBanners={showEventBanners}
              onShowEventBanners={setShowEventBanners}
              onToast={addToast}
              onOpenIosPrompt={() => setShowIosPrompt(true)}
              hasCustomSchedule={customScheduleActive}
              onApplySchedule={handleApplyCustomSchedule}
              onResetOfficial={handleResetOfficialSchedule}
              onOpenSyncModal={() => setSyncModalOpen(true)}
              lastSyncDisplay={lastSyncDisplay}
            />
          )}
          <div className="h-4" />
        </div>
      </main>
      <BottomNav
        active={tab}
        onChange={(t) => {
          setTab(t)
          if (t !== "campus") setCampusFood(false)
        }}
      />

      {groupSheetOpen && (
        <GroupSheet
          current={groupId}
          saved={[groupId]}
          onSelect={(id) => {
            setGroupId(id)
            setSavedGroups([id])
            try {
              localStorage.setItem("rgau_my_group", id)
              localStorage.setItem("rgau_saved_groups", JSON.stringify([id]))
            } catch {}
          }}
          onDelete={(id) => {
            setSavedGroups([id])
          }}
          onClose={() => setGroupSheetOpen(false)}
        />
      )}
      {sheetClass && (
        <HomeworkSheet
          cls={sheetClass}
          homework={homework.find((h) => h.classId === sheetClass.id)}
          personal={personal.find((n) => n.classId === sheetClass.id)}
          role={role}
          konspekt={konspekts[sheetClass.id]}
          onClose={() => setSheetClassId(null)}
          onHwChange={hwChange}
          onPnChange={pnChange}
          onKonspektChange={konspektChange}
        />
      )}
      {manageClass && (
        <ClassManageSheet
          cls={manageClass}
          edit={classEdits[manageClass.id]}
          onSave={(e) => editChange(manageClass.id, e)}
          onClose={() => setManageClassId(null)}
          onToast={addToast}
        />
      )}
      {subgroupSheetCls && (
        <SubgroupSheet
          subject={subgroupSheetCls.subject}
          current={subgroupPrefs[subgroupSheetCls.subject] ?? "all"}
          onChange={(p) =>
            setSubgroupPrefs((prev) => ({
              ...prev,
              [subgroupSheetCls.subject]: p,
            }))
          }
          onClose={() => setSubgroupSheetCls(null)}
        />
      )}
      {disciplineCls && (
        <DisciplineSheet
          subject={disciplineCls.subject}
          teacher={
            classEdits[disciplineCls.id]?.teacher ?? disciplineCls.teacher
          }
          role={role}
          onClose={() => setDisciplineCls(null)}
        />
      )}

      <IosInstallPrompt
        isOpen={showIosPrompt ? true : undefined}
        onClose={() => setShowIosPrompt(false)}
      />

      <TimacadSyncModal
        isOpen={syncModalOpen}
        onClose={() => setSyncModalOpen(false)}
        lastSyncDisplay={lastSyncDisplay}
        onToast={addToast}
        onSyncCompleted={(res) => {
          setLastSyncDisplay(res.displayTime)
          if (res.freshFeed) {
            setTimacadFeed(res.freshFeed)
          } else {
            setTimacadFeed(getCachedTimacadFeed())
          }
        }}
      />
    </div>
  )
}
