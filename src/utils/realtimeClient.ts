/**
 * Realtime Server-Sent Events (SSE) Client
 * Connects to backend /api/v1/events and delivers instant schedule updates and peer confirmations
 */

import type { ScheduleEvent } from "../proto/schedule"

export const REALTIME_EVENT_NAME = "timacad_realtime_event"

export function initRealtimeScheduleEvents(
  groupId: number,
  onEvent?: (evt: ScheduleEvent) => void
): () => void {
  if (typeof window === "undefined" || !("EventSource" in window)) {
    return () => {}
  }

  const endpoint = window.location.hostname === "localhost"
    ? `http://localhost:8080/api/v1/events?group_id=${groupId}`
    : `/api/v1/events?group_id=${groupId}`

  let es: EventSource | null = null
  let retryTimer: any = null
  let isClosed = false

  function connect() {
    if (isClosed) return
    try {
      es = new EventSource(endpoint)

      es.addEventListener("PROPOSAL_CREATED", (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data)
          window.dispatchEvent(new CustomEvent(REALTIME_EVENT_NAME, { detail: data }))
          onEvent?.(data)
        } catch {}
      })

      es.addEventListener("PEER_VOTE_ADDED", (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data)
          window.dispatchEvent(new CustomEvent(REALTIME_EVENT_NAME, { detail: data }))
          onEvent?.(data)
        } catch {}
      })

      es.addEventListener("SYNC_COMPLETED", (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data)
          window.dispatchEvent(new CustomEvent("rgau_schedule_updated", { detail: data }))
        } catch {}
      })

      es.onerror = () => {
        if (es) {
          es.close()
          es = null
        }
        if (!isClosed) {
          retryTimer = setTimeout(connect, 5000)
        }
      }
    } catch {
      // Fallback
    }
  }

  connect()

  return () => {
    isClosed = true
    if (retryTimer) clearTimeout(retryTimer)
    if (es) es.close()
  }
}
