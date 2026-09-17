export type ClassType = "lecture" | "practice" | "lab" | "elective"
export type UserRole = "student" | "headstudent" | "deputy_headstudent" | "teacher"
export type SubgroupPref = "1" | "2" | "all"
export type WeekFilterMode = "current" | "odd" | "even" | "all"

export interface ClassItem {
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
  subgroups?: number[]
  subgroupDetails?: Array<{
    subgroup: number
    teacher: string
    building: string
    room: string
  }>
  weekType?: "all" | "odd" | "even"
}

export interface DaySchedule {
  date: string
  weekday: string
  classes: ClassItem[]
}

export interface Homework {
  classId: number
  text: string
  deadline: string
  link?: string
  linkLabel?: string
  author: string
  updatedAt: string
}

export interface TodoItem {
  id: number
  text: string
  done: boolean
}

export interface PersonalNote {
  classId: number
  todos: TodoItem[]
}

export interface KonspektFile {
  name: string
  size: string
  date: string
}

export interface KonspektEntry {
  text: string
  files: KonspektFile[]
}

export interface ClassEdit {
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

export interface DisciplineInfo {
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

export interface MovedInEntry {
  cls: ClassItem
  fromWeekday: string
}

export interface WindowGap {
  startSlot: number
  endSlot: number
  startTime: string
  endTime: string
  durationMinutes: number
  durationFormatted: string
}
