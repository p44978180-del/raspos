import { useQuery } from "@tanstack/react-query"
import type { DaySchedule } from "../model/types"
import { getCachedSchedule } from "../../../utils/timacadAutoSync"
import officialScheduleData from "../../../data/official-schedule.json"

/** Base URL for Go backend when running in production. */
const API_BASE = import.meta.env.VITE_API_BASE ?? ""

async function fetchSchedule(
  groupId: string,
  week: "odd" | "even" | "all" = "all",
  sem = 1,
): Promise<DaySchedule[]> {
  if (!groupId) return []

  // Try Go backend first (production / local backend)
  if (API_BASE) {
    try {
      const res = await fetch(
        `${API_BASE}/api/v1/schedule?group_id=${encodeURIComponent(groupId)}&week=${week}&sem=${sem}`,
      )
      if (res.ok) {
        const json = await res.json()
        // Backend returns { schedule: DaySchedule[] }
        return (json.schedule as DaySchedule[]) ?? []
      }
    } catch {
      // Fall through to local cache
    }
  }

  // Fall back: local JSON cache (offline / development)
  const activeSched = getCachedSchedule()
  const groups =
    (activeSched?.groups as Record<string, { days: DaySchedule[] }>) ??
    ((officialScheduleData as any).groups as Record<string, { days: DaySchedule[] }>)

  return groups?.[groupId]?.days ?? []
}

/**
 * TanStack Query hook for loading per-group schedule with:
 * - 5-minute stale time (fresh data)
 * - 7-day gcTime (offline persistence via IndexedDB persister)
 * - Retry × 2 on network failure
 * - Falls back to local official-schedule.json when Go backend unreachable
 */
export function useLessonQuery(
  groupId: string,
  week: "odd" | "even" | "all" = "all",
  sem = 1,
) {
  return useQuery<DaySchedule[], Error>({
    queryKey: ["schedule", groupId, week, sem],
    queryFn: () => fetchSchedule(groupId, week, sem),
    enabled: !!groupId,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 60 * 24 * 7,
    retry: 2,
  })
}
