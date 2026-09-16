export type FoodFilter = "all" | "canteen" | "cafe" | "supermarket" | "open"
export type EventCat =
  | "all"
  | "news"
  | "announcement"
  | "faculty"
  | "science"
  | "sport"
  | "profcom"
  | "career"

export interface FoodSpot {
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

export interface AppEvent {
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

export interface WalkRouteResult {
  mins: number
  meters: number
  text: string
  routeUrl: string
  fromName: string
  toName: string
}
