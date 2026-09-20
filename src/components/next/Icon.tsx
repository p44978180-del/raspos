import type { CSSProperties } from "react"

export default function Icon({ name, size = 20, style }: { name: string; size?: number; style?: CSSProperties }) {
  const paths: Record<string, string> = {
    home: "M3 10 12 3l9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z",
    calendar: "M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2Zm2 10h2m4 0h2m-8 4h2",
    map: "m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3Zm6-3v15m6-12v15",
    grid: "M3 3h7v7H3Zm11 0h7v7h-7ZM3 14h7v7H3Zm11 0h7v7h-7Z",
    note: "M5 3h14v18H5Zm4 5h6m-6 4h6m-6 4h3",
    arrow: "M5 12h14m-6-6 6 6-6 6",
    diagonal: "M6 18 18 6M6 6h12v12",
    down: "m7 10 5 5 5-5",
    left: "m14 6-6 6 6 6",
    right: "m10 6 6 6-6 6",
    search: "M21 21l-5-5m2-6a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z",
    plus: "M12 5v14M5 12h14",
    close: "m6 6 12 12M6 18 18 6",
    check: "m5 12 4 4L19 6",
    pin: "M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0ZM12 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z",
    clock: "M12 8v5l3 2m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
    book: "M12 5C8 2 4 3 2 4v15c4-1 7-1 10 2m0-16c4-3 8-2 10-1v15c-4-1-7-1-10 2Zm0 0v16",
    person: "M20 21v-2a7 7 0 0 0-14 0v2M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z",
    link: "m10 14 4-4m-6 1-3 3a4 4 0 0 0 6 6l3-3m-3-9 3-3a4 4 0 1 1 6 6l-3 3",
    shield: "m12 2 9 4v6c0 5-9 10-9 10S3 17 3 12V6Zm-5 10 3 3 7-7",
    refresh: "M20 8a9 9 0 0 0-16-2L2 9m0-6v6h6m-4 7a9 9 0 0 0 16 2l2-3m0 6v-6h-6",
    download: "M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5",
    coffee: "M3 7h13v7a6 6 0 0 1-12 0Zm13 1h2a3 3 0 1 1 0 6h-2M3 21h15M7 2v2m5-2v2",
    globe: "M3 12h18M12 3c6 5 6 13 0 18-6-5-6-13 0-18Zm9 9a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
    settings: "M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.2 2.2m8.4 8.4 2.2 2.2m0-12.8-2.2 2.2m-8.4 8.4-2.2 2.2M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z",
    sun: "M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z",
    bell: "M18 8a6 6 0 0 0-12 0c0 7-3 8-3 8h18s-3-1-3-8M10 21h4",
    trash: "M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7",
    edit: "m15 4 5 5M4 20l5-1L21 7l-5-5L4 14Zm0 0h16",
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={style} aria-hidden="true"><path d={paths[name] || paths.grid} /></svg>
}
