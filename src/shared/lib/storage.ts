import { create } from "zustand"
import { persist, createJSONStorage } from "zustand/middleware"
import type {
  UserRole,
  WeekFilterMode,
  SubgroupPref,
  ClassEdit,
  Homework,
  PersonalNote,
  KonspektEntry,
} from "../../entities/lesson/model/types"

const TODAY = new Date().toISOString().split("T")[0]

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
    author: "Анна К. (Староста)",
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

export interface AppState {
  activeGroupId: string
  savedGroups: string[]
  role: UserRole
  theme: "light" | "dark"
  activeTab: "schedule" | "campus" | "events" | "profile"
  selectedDate: string
  weekFilter: WeekFilterMode
  subgroupPrefs: Record<string, SubgroupPref>
  classEdits: Record<number, ClassEdit>
  homework: Homework[]
  personalNotes: PersonalNote[]
  konspekts: Record<number, KonspektEntry>
  dorm: string
  dormDismissed: boolean
  showDormBanner: boolean
  showEventBanners: boolean
  pinnedNote: string

  // Actions
  setActiveGroupId: (id: string) => void
  setSavedGroups: (groups: string[]) => void
  setRole: (role: UserRole) => void
  setTheme: (theme: "light" | "dark") => void
  setActiveTab: (tab: "schedule" | "campus" | "events" | "profile") => void
  setSelectedDate: (date: string) => void
  setWeekFilter: (filter: WeekFilterMode) => void
  setSubgroupPref: (subject: string, pref: SubgroupPref) => void
  setClassEdit: (classId: number, edit: ClassEdit) => void
  setHomework: (hw: Homework[] | ((prev: Homework[]) => Homework[])) => void
  setPersonalNotes: (notes: PersonalNote[] | ((prev: PersonalNote[]) => PersonalNote[])) => void
  setKonspekt: (classId: number, entry: KonspektEntry) => void
  setDorm: (dorm: string) => void
  setDormDismissed: (dismissed: boolean) => void
  setShowDormBanner: (show: boolean) => void
  setShowEventBanners: (show: boolean) => void
  setPinnedNote: (note: string) => void
}

function getInitialGroup(): string {
  try {
    return localStorage.getItem("rgau_my_group") || "ДА 01-26"
  } catch {
    return "ДА 01-26"
  }
}

function getInitialRole(): UserRole {
  try {
    const saved = localStorage.getItem("rgau_role")
    if (saved === "student" || saved === "headstudent") return saved
  } catch {}
  return "student"
}

function getInitialTheme(): "light" | "dark" {
  try {
    const saved = localStorage.getItem("rgau_theme")
    if (saved === "dark" || saved === "light") return saved
    if (typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches) {
      return "dark"
    }
  } catch {}
  return "light"
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      activeGroupId: getInitialGroup(),
      savedGroups: [getInitialGroup()],
      role: getInitialRole(),
      theme: getInitialTheme(),
      activeTab: "schedule",
      selectedDate: TODAY,
      weekFilter: "current",
      subgroupPrefs: {},
      classEdits: {},
      homework: INIT_HOMEWORK,
      personalNotes: INIT_PERSONAL,
      konspekts: {},
      dorm: "Не указано",
      dormDismissed: false,
      showDormBanner: true,
      showEventBanners: true,
      pinnedNote: "",

      setActiveGroupId: (id: string) => {
        try {
          localStorage.setItem("rgau_my_group", id)
          localStorage.setItem("rgau_saved_groups", JSON.stringify([id]))
        } catch {}
        set({ activeGroupId: id, savedGroups: [id] })
      },
      setSavedGroups: (groups: string[]) => {
        try {
          localStorage.setItem("rgau_saved_groups", JSON.stringify(groups))
        } catch {}
        set({ savedGroups: groups })
      },
      setRole: (role: UserRole) => {
        try {
          localStorage.setItem("rgau_role", role)
        } catch {}
        set({ role })
      },
      setTheme: (theme: "light" | "dark") => {
        try {
          localStorage.setItem("rgau_theme", theme)
        } catch {}
        set({ theme })
      },
      setActiveTab: (activeTab) => set({ activeTab }),
      setSelectedDate: (selectedDate) => set({ selectedDate }),
      setWeekFilter: (weekFilter) => set({ weekFilter }),
      setSubgroupPref: (subject, pref) =>
        set((state) => ({
          subgroupPrefs: { ...state.subgroupPrefs, [subject]: pref },
        })),
      setClassEdit: (classId, edit) =>
        set((state) => ({
          classEdits: { ...state.classEdits, [classId]: edit },
        })),
      setHomework: (hwOrFn) =>
        set((state) => ({
          homework: typeof hwOrFn === "function" ? hwOrFn(state.homework) : hwOrFn,
        })),
      setPersonalNotes: (notesOrFn) =>
        set((state) => ({
          personalNotes: typeof notesOrFn === "function" ? notesOrFn(state.personalNotes) : notesOrFn,
        })),
      setKonspekt: (classId, entry) =>
        set((state) => ({
          konspekts: { ...state.konspekts, [classId]: entry },
        })),
      setDorm: (dorm) => set({ dorm }),
      setDormDismissed: (dormDismissed) => set({ dormDismissed }),
      setShowDormBanner: (showDormBanner) => set({ showDormBanner }),
      setShowEventBanners: (showEventBanners) => set({ showEventBanners }),
      setPinnedNote: (pinnedNote) => set({ pinnedNote }),
    }),
    {
      name: "rgau_app_store",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        activeGroupId: state.activeGroupId,
        savedGroups: state.savedGroups,
        role: state.role,
        theme: state.theme,
        subgroupPrefs: state.subgroupPrefs,
        classEdits: state.classEdits,
        dorm: state.dorm,
        dormDismissed: state.dormDismissed,
        showDormBanner: state.showDormBanner,
        showEventBanners: state.showEventBanners,
        pinnedNote: state.pinnedNote,
      }),
    },
  ),
)
