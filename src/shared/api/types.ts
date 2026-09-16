export interface ApiInstitute {
  id: number
  name: string
  courses?: number[]
}

export interface ApiGroup {
  id: number
  institute_id: number
  name: string
  course: number
  degree: string
}

export interface ApiLesson {
  id: number
  group_id: number
  day_of_week: number
  slot_number: number
  week_type: "all" | "odd" | "even"
  subject_name: string
  lesson_type: string
  subgroup_number?: number | null
  teacher_name?: string
  building?: string
  room?: string
}

export interface ApiScheduleResponse {
  group_id: number | string
  week: "odd" | "even" | "all"
  semester: number
  days: Array<{
    day_of_week: number
    weekday?: string
    lessons: ApiLesson[]
  }>
}
