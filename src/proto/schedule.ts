/**
 * Protobuf & Connect-RPC TypeScript Model Definitions
 * Generated from proto/schedule/v1/schedule.proto
 */

export interface Institute {
  id: number
  name: string
  courses: number[]
}

export interface Group {
  id: number
  institute_id: number
  name: string
  course: number
  degree: string
}

export interface SubgroupDetail {
  subgroup: number
  teacher: string
  building: string
  room: string
}

export interface ScheduleItem {
  id: number
  num: number
  start: string
  end: string
  subject: string
  type: "lecture" | "practice" | "lab" | "elective" | string
  weekType: "all" | "odd" | "even" | string
  teacher: string
  building: string
  room: string
  subgroup_number?: number
  subgroups?: number[]
  subgroupDetails?: SubgroupDetail[]
}

export interface DaySchedule {
  day_of_week: number
  weekday: string
  classes: ScheduleItem[]
}

export interface GetScheduleRequest {
  group_id: number
  week?: string
  semester?: number
}

export interface GetScheduleResponse {
  group_id: number
  group_name: string
  institute_name: string
  course: number
  degree: string
  week: string
  semester: number
  schedule: DaySchedule[]
  is_cache_hit?: boolean
}

export interface EmptyClassroomsRequest {
  building: string
  day_of_week: number
  slot_number: number
  week_type?: string
  require_power_sockets?: boolean
  require_quiet_zone?: boolean
}

export interface EmptyClassroomItem {
  classroom_id: number
  building: string
  room: string
  floor: number
  capacity: number
  has_power_sockets: boolean
  is_quiet_zone: boolean
  status: "free_now" | "free_until_next_slot" | string
}

export interface EmptyClassroomsResponse {
  building: string
  day_of_week: number
  slot_number: number
  classrooms: EmptyClassroomItem[]
  total_empty: number
}

export interface MatchWindowsRequest {
  group_ids: number[]
  day_of_week: number
  week_type?: string
}

export interface SharedWindowSlot {
  day_of_week: number
  weekday: string
  slot_number: number
  start_time: string
  end_time: string
  duration_minutes: number
  participating_group_names: string[]
  suggested_meetup_spot: string
  walk_minutes_to_spot: number
}

export interface MatchWindowsResponse {
  shared_windows: SharedWindowSlot[]
  total_shared_windows: number
}

export interface CampusRouteRequest {
  from_building: string
  to_building: string
  available_window_minutes?: number
  consider_weather_protection?: boolean
}

export interface CampusRouteResponse {
  from_building: string
  to_building: string
  walking_duration_minutes: number
  distance_meters: number
  path_waypoints: string[]
  is_tight_window: boolean
  urgent_warning?: string
  weather_advisory?: string
}

export type RoleInGroup = "student" | "deputy_headstudent" | "headstudent"

export interface ProposeScheduleChangeRequest {
  lesson_id: number
  group_id: number
  student_name: string
  student_role: RoleInGroup
  change_type: "cancellation" | "transfer" | "room_change"
  target_day_of_week?: number
  target_slot_number?: number
  target_building?: string
  target_room?: string
  reason: string
}

export interface VoteScheduleChangeRequest {
  proposal_id: number
  group_id: number
  student_name: string
  student_role: RoleInGroup
  vote_confirm: boolean
}

export interface ScheduleChangeProposal {
  id: number
  lesson_id: number
  group_id: number
  student_name: string
  student_role: RoleInGroup
  change_type: "cancellation" | "transfer" | "room_change"
  target_day_of_week?: number
  target_slot_number?: number
  target_building?: string
  target_room?: string
  reason: string
  peer_votes: number
  has_deputy_confirmation: boolean
  has_headstudent_confirmation: boolean
  status: "pending" | "peer_confirmed" | "officially_confirmed" | "rejected"
  display_badge: string
  created_at: string
}

export interface ScheduleEvent {
  event_id: string
  event_type: "PROPOSAL_CREATED" | "PEER_VOTE_ADDED" | "TRANSFER_CONFIRMED" | "SYNC_COMPLETED"
  group_id: number
  payload_json: string
  timestamp: string
}
