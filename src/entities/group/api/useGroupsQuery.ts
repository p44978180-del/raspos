import { useQuery } from "@tanstack/react-query"
import { getRgauGroups } from "../../lesson/lib/disciplineData"
import type { GroupMeta } from "../model/types"
import { getGroupMeta } from "../lib/groupMeta"

const API_BASE = import.meta.env.VITE_API_BASE ?? ""

interface ApiGroup {
  id: string
  name: string
  institute_id: number
  course: number
}

async function fetchGroups(instituteId?: number, course?: number): Promise<GroupMeta[]> {
  // Try Go backend
  if (API_BASE) {
    try {
      let url = `${API_BASE}/api/v1/groups`
      const params: string[] = []
      if (instituteId !== undefined) params.push(`institute_id=${instituteId}`)
      if (course !== undefined) params.push(`course=${course}`)
      if (params.length) url += "?" + params.join("&")
      const res = await fetch(url)
      if (res.ok) {
        const json = await res.json()
        return (json.groups as ApiGroup[]).map((g) => ({
          id: g.id,
          name: g.name,
          instId: String(g.institute_id),
          course: g.course,
        }))
      }
    } catch {
      // Fall through
    }
  }

  // Local fallback: derive from official-schedule.json
  const allGroupIds = getRgauGroups()
  return allGroupIds.map((id: string) => {
    const meta = getGroupMeta(id)
    return { id, name: id, ...meta }
  })
}

/**
 * TanStack Query hook for loading group list.
 * Optionally filtered by instituteId / course.
 * Falls back to local official-schedule.json when Go backend unreachable.
 */
export function useGroupsQuery(instituteId?: number, course?: number) {
  return useQuery<GroupMeta[], Error>({
    queryKey: ["groups", instituteId, course],
    queryFn: () => fetchGroups(instituteId, course),
    staleTime: 1000 * 60 * 60, // 1-hour stale (groups rarely change)
    gcTime: 1000 * 60 * 60 * 24 * 7,
    retry: 2,
  })
}
