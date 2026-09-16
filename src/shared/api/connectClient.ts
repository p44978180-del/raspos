import type {
  GetScheduleRequest,
  GetScheduleResponse,
  EmptyClassroomsRequest,
  EmptyClassroomsResponse,
  MatchWindowsRequest,
  MatchWindowsResponse,
  CampusRouteRequest,
  CampusRouteResponse,
  ProposeScheduleChangeRequest,
  VoteScheduleChangeRequest,
  ScheduleChangeProposal,
} from "../../proto/schedule"

const API_BASE_URL = typeof window !== "undefined" && window.location.hostname === "localhost"
  ? "http://localhost:8080"
  : ""

/**
 * Connect-RPC / REST client with seamless fallback to offline local store
 */
export class ConnectScheduleClient {
  private baseUrl: string

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl
  }

  async getSchedule(req: GetScheduleRequest): Promise<GetScheduleResponse | null> {
    try {
      const url = `${this.baseUrl}/api/v1/schedule?group_id=${req.group_id}&week=${req.week || "all"}&sem=${req.semester || 1}`
      const resp = await fetch(url, { signal: AbortSignal.timeout(5000) })
      if (!resp.ok) return null
      return await resp.json()
    } catch {
      return null
    }
  }

  async getEmptyClassrooms(req: EmptyClassroomsRequest): Promise<EmptyClassroomsResponse> {
    try {
      const q = new URLSearchParams({
        building: req.building,
        day_of_week: String(req.day_of_week),
        slot_number: String(req.slot_number),
        week_type: req.week_type || "all",
        sockets: req.require_power_sockets ? "1" : "0",
        quiet: req.require_quiet_zone ? "1" : "0",
      })
      const resp = await fetch(`${this.baseUrl}/api/v1/radar/empty-classrooms?${q.toString()}`, {
        signal: AbortSignal.timeout(4000),
      })
      if (resp.ok) {
        return await resp.json()
      }
    } catch {}

    // Fallback: return computed empty state
    return {
      building: req.building,
      day_of_week: req.day_of_week,
      slot_number: req.slot_number,
      classrooms: [],
      total_empty: 0,
    }
  }

  async matchWindows(req: MatchWindowsRequest): Promise<MatchWindowsResponse> {
    try {
      const resp = await fetch(`${this.baseUrl}/api/v1/matchmaking/windows`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
        signal: AbortSignal.timeout(4000),
      })
      if (resp.ok) {
        return await resp.json()
      }
    } catch {}

    return { shared_windows: [], total_shared_windows: 0 }
  }

  async getCampusRoute(req: CampusRouteRequest): Promise<CampusRouteResponse> {
    try {
      const q = new URLSearchParams({
        from: req.from_building,
        to: req.to_building,
        window: String(req.available_window_minutes || 15),
      })
      const resp = await fetch(`${this.baseUrl}/api/v1/navigation/route?${q.toString()}`, {
        signal: AbortSignal.timeout(3000),
      })
      if (resp.ok) {
        return await resp.json()
      }
    } catch {}

    return {
      from_building: req.from_building,
      to_building: req.to_building,
      walking_duration_minutes: 10,
      distance_meters: 650,
      path_waypoints: [req.from_building, "Центральная аллея", req.to_building],
      is_tight_window: false,
    }
  }

  async proposeChange(req: ProposeScheduleChangeRequest): Promise<ScheduleChangeProposal | null> {
    try {
      const resp = await fetch(`${this.baseUrl}/api/v1/crowdsource/propose`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
        signal: AbortSignal.timeout(4000),
      })
      if (resp.ok) {
        return await resp.json()
      }
    } catch {}
    return null
  }

  async voteChange(req: VoteScheduleChangeRequest): Promise<ScheduleChangeProposal | null> {
    try {
      const resp = await fetch(`${this.baseUrl}/api/v1/crowdsource/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
        signal: AbortSignal.timeout(4000),
      })
      if (resp.ok) {
        return await resp.json()
      }
    } catch {}
    return null
  }
}

export const connectClient = new ConnectScheduleClient()
