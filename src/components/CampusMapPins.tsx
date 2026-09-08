import React, { useState, useRef, useEffect } from "react"
import campusPlanImg from "@/imports/image.png"

export type PinCategory = "academic" | "dorm" | "department" | "dining" | "sports"

export interface CampusBadgeProps {
  category: PinCategory
  label?: string | number
  size?: "sm" | "md" | "lg" | number
  className?: string
  active?: boolean
  pulse?: boolean
  showIcon?: boolean
}

// ─── SVG Icons matching Timiryazev Cartography ─────────────────────────────────

export function MortarboardIcon({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12 3L1 9L12 15L21 10.09V17H23V9L12 3ZM5 13.18V17.18C5 19.5 8.13 21 12 21C15.87 21 19 19.5 19 17.18V13.18L12 17L5 13.18Z" />
    </svg>
  )
}

export function HouseRoofIcon({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12 3L2 12H5V20H19V12H22L12 3ZM12 7.7L16 11.3V18H8V11.3L12 7.7Z" />
    </svg>
  )
}

export function MicroscopeFlaskIcon({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M9 3H15V5H14V9.5L18.7 17.3C19.4 18.5 18.5 20 17.1 20H6.9C5.5 20 4.6 18.5 5.3 17.3L10 9.5V5H9V3ZM11 5V10.2L8.2 14.8C7.9 15.3 8.3 16 8.9 16H15.1C15.7 16 16.1 15.3 15.8 14.8L13 10.2V5H11Z" />
    </svg>
  )
}

export function ForkKnifeIcon({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M11 9H9V2H7V9H5V2H3V9C3 11.2 4.8 13 7 13V22H9V13C11.2 13 13 11.2 13 9V2H11V9ZM19 2C16.8 2 15 3.8 15 6V13H17V22H19V2H19Z" />
    </svg>
  )
}

export function SportsIcon({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM12 4C13.66 4 15.17 4.54 16.39 5.46L13.88 7.97C13.33 7.67 12.68 7.5 12 7.5C11.32 7.5 10.67 7.67 10.12 7.97L7.61 5.46C8.83 4.54 10.34 4 12 4ZM4.5 12C4.5 9.87 5.4 7.96 6.84 6.61L9.22 8.99C8.47 9.8 8 10.84 8 12C8 13.16 8.47 14.2 9.22 15.01L6.84 17.39C5.4 16.04 4.5 14.13 4.5 12ZM12 20C10.34 20 8.83 19.46 7.61 18.54L10.12 16.03C10.67 16.33 11.32 16.5 12 16.5C12.68 16.5 13.33 16.33 13.88 16.03L16.39 18.54C15.17 19.46 13.66 20 12 20ZM19.5 12C19.5 14.13 18.6 16.04 17.16 17.39L14.78 15.01C15.53 14.2 16 13.16 16 12C16 10.84 15.53 9.8 14.78 8.99L17.16 6.61C18.6 7.96 19.5 9.87 19.5 12Z" />
    </svg>
  )
}

// ─── Authentic Badge Silhouette Component ──────────────────────────────────────

export function CampusBadge({
  category,
  label,
  size = "md",
  className = "",
  active = false,
  pulse = false,
  showIcon = true,
}: CampusBadgeProps) {
  const numSize = typeof size === "number" ? size : size === "sm" ? 28 : size === "lg" ? 44 : 36

  // 1. Academic Building: Green badge (#4D7C0F / #2D5016) with graduation cap
  if (category === "academic") {
    return (
      <div
        className={`relative inline-flex items-center justify-center select-none transition-transform ${
          active ? "scale-110" : ""
        } ${className}`}
        style={{ width: numSize, height: numSize }}
      >
        {pulse && (
          <span className="absolute -inset-1 rounded-2xl bg-[#4D7C0F]/30 animate-ping pointer-events-none" />
        )}
        <svg
          width={numSize}
          height={numSize}
          viewBox="0 0 40 40"
          className="drop-shadow-sm filter"
          fill="none"
        >
          {/* Authentic dual-border university cartography style */}
          <rect
            x="2"
            y="2"
            width="36"
            height="36"
            rx="9"
            fill="#4D7C0F"
            stroke="#2D5016"
            strokeWidth="2.5"
          />
          <rect
            x="4.5"
            y="4.5"
            width="31"
            height="31"
            rx="7"
            fill="none"
            stroke="#84CC16"
            strokeWidth="1"
            strokeOpacity="0.4"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-white px-0.5">
          {showIcon && (!label || numSize >= 36) && (
            <MortarboardIcon size={numSize <= 30 ? 12 : 14} className="text-white drop-shadow" />
          )}
          {label !== undefined && label !== null && (
            <span
              className={`font-black tracking-tight leading-none text-white ${
                numSize <= 30 ? "text-[10px]" : "text-xs"
              }`}
              style={{ fontFamily: "var(--font-mono)" }}
            >
              {label}
            </span>
          )}
        </div>
      </div>
    )
  }

  // 2. Dormitory: Terracotta Orange house silhouette (#EA580C / #C2410C)
  if (category === "dorm") {
    return (
      <div
        className={`relative inline-flex items-center justify-center select-none transition-transform ${
          active ? "scale-110" : ""
        } ${className}`}
        style={{ width: numSize, height: numSize }}
      >
        {pulse && (
          <span className="absolute -inset-1 rounded-2xl bg-[#EA580C]/30 animate-ping pointer-events-none" />
        )}
        <svg
          width={numSize}
          height={numSize}
          viewBox="0 0 40 40"
          className="drop-shadow-sm filter"
          fill="none"
        >
          {/* Peaked house gable silhouette matching map reference */}
          <path
            d="M20 3L36 15V34C36 36.2 34.2 38 32 38H8C5.8 38 4 36.2 4 34V15L20 3Z"
            fill="#EA580C"
            stroke="#C2410C"
            strokeWidth="2.5"
            strokeLinejoin="round"
          />
          <path
            d="M20 6.5L33.5 16.5V33.5C33.5 34.6 32.6 35.5 31.5 35.5H8.5C7.4 35.5 6.5 34.6 6.5 33.5V16.5L20 6.5Z"
            fill="none"
            stroke="#FDBA74"
            strokeWidth="1"
            strokeOpacity="0.35"
          />
        </svg>
        <div className="absolute inset-0 pt-2 flex flex-col items-center justify-center text-white px-0.5">
          {showIcon && !label && (
            <HouseRoofIcon size={numSize <= 30 ? 12 : 14} className="text-white drop-shadow" />
          )}
          {label !== undefined && label !== null && (
            <span
              className={`font-black tracking-tighter leading-none text-white ${
                numSize <= 30 ? "text-[10px]" : "text-xs"
              }`}
              style={{ fontFamily: "var(--font-mono)" }}
            >
              {typeof label === "string" && label.startsWith("№") ? label : `№${label}`}
            </span>
          )}
        </div>
      </div>
    )
  }

  // 3. Departments / Institutes / Science: Teal/cyan badge (#0D9488 / #0F766E)
  if (category === "department") {
    return (
      <div
        className={`relative inline-flex items-center justify-center select-none transition-transform ${
          active ? "scale-110" : ""
        } ${className}`}
        style={{ width: numSize, height: numSize }}
      >
        {pulse && (
          <span className="absolute -inset-1 rounded-2xl bg-[#0D9488]/30 animate-ping pointer-events-none" />
        )}
        <svg
          width={numSize}
          height={numSize}
          viewBox="0 0 40 40"
          className="drop-shadow-sm filter"
          fill="none"
        >
          {/* Hexagonal/rounded shield badge */}
          <rect
            x="2"
            y="2"
            width="36"
            height="36"
            rx="10"
            fill="#0D9488"
            stroke="#0F766E"
            strokeWidth="2.5"
          />
          <circle cx="20" cy="20" r="14" fill="none" stroke="#5EEAD4" strokeWidth="1" strokeOpacity="0.4" />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-white px-0.5">
          <MicroscopeFlaskIcon size={numSize <= 30 ? 13 : 16} className="text-white drop-shadow" />
          {label && (
            <span className="text-[9px] font-black tracking-tight leading-none text-white mt-0.5">
              {label}
            </span>
          )}
        </div>
      </div>
    )
  }

  // 4. Dining: Burgundy magenta badge (#BE185D / #9D174D)
  if (category === "dining") {
    return (
      <div
        className={`relative inline-flex items-center justify-center select-none transition-transform ${
          active ? "scale-110" : ""
        } ${className}`}
        style={{ width: numSize, height: numSize }}
      >
        {pulse && (
          <span className="absolute -inset-1 rounded-2xl bg-[#BE185D]/30 animate-ping pointer-events-none" />
        )}
        <svg
          width={numSize}
          height={numSize}
          viewBox="0 0 40 40"
          className="drop-shadow-sm filter"
          fill="none"
        >
          <rect
            x="2"
            y="2"
            width="36"
            height="36"
            rx="10"
            fill="#BE185D"
            stroke="#9D174D"
            strokeWidth="2.5"
          />
          <rect
            x="5"
            y="5"
            width="30"
            height="30"
            rx="8"
            fill="none"
            stroke="#F472B6"
            strokeWidth="1"
            strokeOpacity="0.4"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-white px-0.5">
          <ForkKnifeIcon size={numSize <= 30 ? 13 : 16} className="text-white drop-shadow" />
          {label && (
            <span className="text-[9px] font-black tracking-tight leading-none text-white mt-0.5">
              {label}
            </span>
          )}
        </div>
      </div>
    )
  }

  // 5. Sports: Navy Blue badge (#1E40AF / #1E3A8A)
  return (
    <div
      className={`relative inline-flex items-center justify-center select-none transition-transform ${
        active ? "scale-110" : ""
      } ${className}`}
      style={{ width: numSize, height: numSize }}
    >
      {pulse && (
        <span className="absolute -inset-1 rounded-2xl bg-[#1E40AF]/30 animate-ping pointer-events-none" />
      )}
      <svg
        width={numSize}
        height={numSize}
        viewBox="0 0 40 40"
        className="drop-shadow-sm filter"
        fill="none"
      >
        <rect
          x="2"
          y="2"
          width="36"
          height="36"
          rx="10"
          fill="#1E40AF"
          stroke="#1E3A8A"
          strokeWidth="2.5"
        />
        <rect
          x="5"
          y="5"
          width="30"
          height="30"
          rx="8"
          fill="none"
          stroke="#93C5FD"
          strokeWidth="1"
          strokeOpacity="0.4"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-white px-0.5">
        <SportsIcon size={numSize <= 30 ? 12 : 14} className="text-white drop-shadow" />
        <span className="text-[9px] font-black tracking-tight leading-none text-white mt-0.5">
          {label || "СОК"}
        </span>
      </div>
    </div>
  )
}

// ─── Map Pin with Pointer Stem for Map Overlays ────────────────────────────────

export function CampusMapPinMarker({
  category,
  label,
  size = 36,
  active = false,
  pulse = false,
  onClick,
}: {
  category: PinCategory
  label?: string | number
  size?: number
  active?: boolean
  pulse?: boolean
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex flex-col items-center group cursor-pointer select-none transition-transform duration-200 ${
        active ? "scale-125 z-30" : "hover:scale-110 z-20"
      }`}
      style={{ transform: "translate(-50%, -100%)" }}
    >
      <CampusBadge
        category={category}
        label={label}
        size={size}
        active={active}
        pulse={pulse || active}
      />
      {/* Pin pointer triangle */}
      <div
        className="-mt-1 w-0 h-0 border-x-4 border-x-transparent border-t-[6px] drop-shadow-sm"
        style={{
          borderTopColor:
            category === "academic"
              ? "#2D5016"
              : category === "dorm"
                ? "#C2410C"
                : category === "department"
                  ? "#0F766E"
                  : category === "dining"
                    ? "#9D174D"
                    : "#1E3A8A",
        }}
      />
    </button>
  )
}

// ─── University Campus Plan Dataset matching src/imports/image.png ─────────────

export interface CampusPlanMarker {
  id: string
  title: string
  subtitle: string
  category: PinCategory
  badgeLabel: string
  x: number // percentage 0 - 100
  y: number // percentage 0 - 100
  address: string
  description: string
  coords: [number, number] // [lng, lat] for Yandex
}

export const CAMPUS_PLAN_MARKERS: CampusPlanMarker[] = [
  // 🏛 Academic Buildings
  {
    id: "bldg-1",
    title: "1-й учебный корпус",
    subtitle: "Главный учебный корпус",
    category: "academic",
    badgeLabel: "1",
    x: 57.0,
    y: 50.5,
    address: "Тимирязевская ул., 49",
    description: "Агрономия, почвоведение, приёмная комиссия, музей почвоведения.",
    coords: [37.5565, 55.8298],
  },
  {
    id: "bldg-2",
    title: "2-й учебный корпус",
    subtitle: "Учебный корпус",
    category: "academic",
    badgeLabel: "2",
    x: 52.0,
    y: 39.5,
    address: "Тимирязевская ул., 47",
    description: "Лекционные аудитории, ботанические кафедры, лаборатории.",
    coords: [37.555, 55.8315],
  },
  {
    id: "bldg-agrochem",
    title: "Корпус агрохимии (22/23)",
    subtitle: "Институт агробиотехнологии",
    category: "academic",
    badgeLabel: "22",
    x: 54.5,
    y: 27.5,
    address: "Прянишникова ул., 6",
    description: "Кафедры агрохимии, физиологии растений, биохимии и защиты растений.",
    coords: [37.5603, 55.828],
  },
  {
    id: "bldg-6",
    title: "6-й учебный корпус",
    subtitle: "Зоотехния и биология",
    category: "academic",
    badgeLabel: "6",
    x: 40.5,
    y: 36.5,
    address: "Тимирязевская ул., 44",
    description: "Институт зоотехнии и биологии, ветеринарные лаборатории.",
    coords: [37.551, 55.832],
  },
  {
    id: "bldg-9",
    title: "9-й учебный корпус",
    subtitle: "Экономика и управление",
    category: "academic",
    badgeLabel: "9",
    x: 37.5,
    y: 50.0,
    address: "Лиственничная аллея, 2",
    description: "Институт экономики и управления АПК, вычислительный центр.",
    coords: [37.549, 55.829],
  },
  {
    id: "bldg-12",
    title: "12-й учебный корпус",
    subtitle: "Мелиорация и водное хоз-во",
    category: "academic",
    badgeLabel: "12",
    x: 31.0,
    y: 30.5,
    address: "Прянишникова ул., 19",
    description: "Институт мелиорации, водного хозяйства и строительства им. А.Н. Костякова.",
    coords: [37.545, 55.835],
  },
  {
    id: "bldg-17",
    title: "17-й корпус (17к/17с)",
    subtitle: "Гуманитарно-педагогический",
    category: "academic",
    badgeLabel: "17",
    x: 27.0,
    y: 35.0,
    address: "Тимирязевская ул., 54",
    description: "Гуманитарный факультет, лингвистический центр, большая студенческая столовая.",
    coords: [37.542, 55.833],
  },
  {
    id: "bldg-29",
    title: "29-й учебный корпус",
    subtitle: "Северный учебный комплекс",
    category: "academic",
    badgeLabel: "29",
    x: 27.2,
    y: 5.5,
    address: "Лиственничная аллея, 16",
    description: "Инновационные лаборатории генетики и селекции растений.",
    coords: [37.541, 55.842],
  },
  {
    id: "bldg-rectorat",
    title: "Ректорат РГАУ-МСХА",
    subtitle: "Историческое главное здание",
    category: "academic",
    badgeLabel: "🏛",
    x: 34.0,
    y: 46.0,
    address: "Тимирязевская ул., 49",
    description: "Центральная администрация, ректорат и зал заседаний учёного совета.",
    coords: [37.548, 55.8305],
  },
  {
    id: "bldg-eng",
    title: "28-й учебный корпус (Инженерный)",
    subtitle: "Институт механики и энергетики им. В.П. Горячкина",
    category: "academic",
    badgeLabel: "28",
    x: 32.8,
    y: 23.5,
    address: "Лиственничная аллея, 2Д",
    description: "Кафедры тракторов и автомобилей, сельскохозяйственных машин, техносферной безопасности.",
    coords: [37.5635, 55.8265],
  },
  {
    id: "bldg-lib",
    title: "Центральная научная библиотека (ЦНБ)",
    subtitle: "ЦНБ им. Железнова",
    category: "academic",
    badgeLabel: "ЦНБ",
    x: 43.0,
    y: 46.0,
    address: "Лиственничная аллея, 2к1",
    description: "Крупнейшая аграрная библиотека России с читальными залами и коворкингом.",
    coords: [37.553, 55.830],
  },


  // 🏠 Dormitories
  {
    id: "dorm-1",
    title: "Общежитие №1",
    subtitle: "Студенческий городок",
    category: "dorm",
    badgeLabel: "1",
    x: 77.5,
    y: 28.2,
    address: "Лиственничная аллея, 4",
    description: "7 мин пешком до 1-го корпуса. Блочный тип, учебные комнаты, Wi-Fi.",
    coords: [37.552, 55.834],
  },
  {
    id: "dorm-2",
    title: "Общежитие №2",
    subtitle: "Студенческий городок",
    category: "dorm",
    badgeLabel: "2",
    x: 83.2,
    y: 25.4,
    address: "Лиственничная аллея, 4А",
    description: "5 мин пешком до 1-го корпуса. Прачечная, спортивная комната.",
    coords: [37.5528, 55.8335],
  },
  {
    id: "dorm-3",
    title: "Общежитие №3",
    subtitle: "Студенческий городок",
    category: "dorm",
    badgeLabel: "3",
    x: 88.5,
    y: 22.5,
    address: "Лиственничная аллея, 6",
    description: "Рядом со стадионом и СОК. Уютные комнаты, свежий ремонт.",
    coords: [37.554, 55.834],
  },
  {
    id: "dorm-4",
    title: "Общежитие №4",
    subtitle: "Студенческий городок",
    category: "dorm",
    badgeLabel: "4",
    x: 88.2,
    y: 33.0,
    address: "Лиственничная аллея, 6А",
    description: "Коридорный тип, просторные кухни, настольный теннис.",
    coords: [37.5545, 55.833],
  },

  {
    id: "dorm-6",
    title: "Общежитие №6",
    subtitle: "Студенческий городок",
    category: "dorm",
    badgeLabel: "6",
    x: 93.5,
    y: 31.0,
    address: "Лиственничная аллея, 8",
    description: "8 мин пешком до агрохимии. Студенческий совет, тихий двор.",
    coords: [37.5565, 55.8348],
  },
  {
    id: "dorm-7",
    title: "Общежитие №7",
    subtitle: "Центральный кампус",
    category: "dorm",
    badgeLabel: "7",
    x: 48.0,
    y: 52.5,
    address: "Тимирязевская ул., 51",
    description: "Центральное расположение, 3 мин до учебных корпусов.",
    coords: [37.556, 55.829],
  },
  {
    id: "dorm-8",
    title: "Общежитие №8",
    subtitle: "Центральный кампус",
    category: "dorm",
    badgeLabel: "8",
    x: 51.5,
    y: 52.5,
    address: "Тимирязевская ул., 53",
    description: "10 мин до корпуса агрохимии, рядом со столовой.",
    coords: [37.5572, 55.8352],
  },
  {
    id: "dorm-9",
    title: "Общежитие №9",
    subtitle: "Южный кампус",
    category: "dorm",
    badgeLabel: "9",
    x: 47.0,
    y: 59.2,
    address: "Тимирязевская ул., 55",
    description: "Рядом с парком и опытными теплицами.",
    coords: [37.557, 55.827],
  },
  {
    id: "dorm-10",
    title: "Общежитие №10",
    subtitle: "Инженерный городок",
    category: "dorm",
    badgeLabel: "10",
    x: 96.5,
    y: 27.0,
    address: "Верхняя аллея, 1",
    description: "12 мин до Инженерного корпуса. Автобусная остановка в 2 минутах.",
    coords: [37.5648, 55.8268],
  },
  {
    id: "dorm-11",
    title: "Общежитие №11",
    subtitle: "Студенческий городок",
    category: "dorm",
    badgeLabel: "11",
    x: 93.5,
    y: 25.0,
    address: "Лиственничная аллея, 12",
    description: "Блочное общежитие повышенной комфортности.",
    coords: [37.558, 55.834],
  },
  {
    id: "dorm-13",
    title: "Общежитие №13",
    subtitle: "Северо-восточный кампус",
    category: "dorm",
    badgeLabel: "13",
    x: 94.0,
    y: 19.5,
    address: "Лиственничная аллея, 14",
    description: "Комфортные блоки, спортивная площадка во дворе.",
    coords: [37.559, 55.836],
  },
  {
    id: "dorm-16",
    title: "Общежитие №16",
    subtitle: "Южный кампус",
    category: "dorm",
    badgeLabel: "16",
    x: 48.0,
    y: 65.5,
    address: "Тимирязевская ул., 57",
    description: "Аспирантское и студенческое общежитие в зелёной зоне.",
    coords: [37.5585, 55.825],
  },

  // 🍽 Dining
  {
    id: "food-1",
    title: "Большая столовая 1-го корпуса",
    subtitle: "Столовая РГАУ",
    category: "dining",
    badgeLabel: "🍽",
    x: 57.0,
    y: 48.0,
    address: "1-й учебный корпус, 1 этаж",
    description: "Горячие обеды, комплексный студенческий обед, выпечка. 09:00 - 17:00.",
    coords: [37.5565, 55.8298],
  },
  {
    id: "food-17",
    title: "Комбинат питания 17-го корпуса",
    subtitle: "Студенческая столовая",
    category: "dining",
    badgeLabel: "🍽",
    x: 29.0,
    y: 37.0,
    address: "17-й корпус, цокольный этаж",
    description: "Два обеденных зала, свежий кофе, пицца и сэндвичи. 08:30 - 18:00.",
    coords: [37.542, 55.833],
  },
  {
    id: "food-agrochem",
    title: "Буфет корпуса агрохимии",
    subtitle: "Кафе-буфет",
    category: "dining",
    badgeLabel: "🍽",
    x: 55.5,
    y: 21.0,
    address: "Корпус агрохимии, холл",
    description: "Свежая выпечка, чай, кофе, салаты и горячие бутерброды.",
    coords: [37.5603, 55.828],
  },
  {
    id: "food-dorm8",
    title: "Столовая студгородка",
    subtitle: "Кафе при общежитиях",
    category: "dining",
    badgeLabel: "🍽",
    x: 55.0,
    y: 53.5,
    address: "Лиственничная аллея, 5",
    description: "Удобные завтраки и ужины для студентов общежитий.",
    coords: [37.5575, 55.835],
  },


  // ⚽ Sports
  {
    id: "sports-sok",
    title: "Спортивный комплекс (СОК РГАУ-МСХА)",
    subtitle: "Главный спорткомплекс РГАУ",
    category: "sports",
    badgeLabel: "СОК",
    x: 78.0,
    y: 37.2,
    address: "Лиственничная аллея, 12Б",
    description: "Бассейн 25м, тренажёрный зал, волейбол, баскетбол, единоборства.",
    coords: [37.557, 55.833],
  },
  {
    id: "sports-stadium",
    title: "Центральный стадион «Тимирязевец»",
    subtitle: "Футбольное поле и легкоатлетические дорожки",
    category: "sports",
    badgeLabel: "⚽",
    x: 70.5,
    y: 38.5,
    address: "Лиственничная аллея, 12",
    description: "Футбольное поле с искусственным газоном, беговые дорожки, трибуны.",
    coords: [37.5555, 55.833],
  },

  // 🔬 Departments & Institutes
  {
    id: "dept-agro",
    title: "Кафедра агрохимии и биохимии",
    subtitle: "Корпус агрохимии",
    category: "department",
    badgeLabel: "🔬",
    x: 54.0,
    y: 28.5,
    address: "Прянишникова ул., 6, ауд. 315",
    description: "Аналитические лаборатории спектрометрии и хроматографии.",
    coords: [37.5603, 55.828],
  },
  {
    id: "dept-soil",
    title: "Кафедра почвоведения, геологии и ЛАНД",
    subtitle: "1-й учебный корпус",
    category: "department",
    badgeLabel: "🔬",
    x: 56.5,
    y: 49.0,
    address: "1-й учебный корпус, 2 этаж",
    description: "Почвенный музей им. В.Р. Вильямса, монолитная коллекция.",
    coords: [37.5558, 55.8302],
  },
  {
    id: "dept-mech",
    title: "Кафедра механизации сельского хозяйства",
    subtitle: "Инженерный корпус",
    category: "department",
    badgeLabel: "🔬",
    x: 33.5,
    y: 24.5,
    address: "Лиственничная аллея, 2Д",
    description: "Учебные полигоны, стенды диагностики дизельных двигателей.",
    coords: [37.5635, 55.8265],
  },
]

export const ADDITIONAL_CAMPUS_MARKERS: CampusPlanMarker[] = [
  {
    id: "bldg-3",
    title: "3-й учебный корпус",
    subtitle: "Агрономия и агрометеорология",
    category: "academic",
    badgeLabel: "3",
    x: 48.0,
    y: 44.0,
    address: "Тимирязевская ул., 45",
    description: "Кафедры земледелия, растениеводства и агрометеорологии.",
    coords: [37.5525, 55.8288],
  },
  {
    id: "bldg-4",
    title: "4-й учебный корпус",
    subtitle: "Учебный корпус",
    category: "academic",
    badgeLabel: "4",
    x: 45.0,
    y: 43.0,
    address: "Тимирязевская ул., 44",
    description: "Лекционные аудитории, компьютерные классы, кафедры информатики.",
    coords: [37.5505, 55.8295],
  },
  {
    id: "bldg-8",
    title: "8-й учебный корпус",
    subtitle: "Лесоводство и экология",
    category: "academic",
    badgeLabel: "8",
    x: 62.0,
    y: 42.0,
    address: "Лиственничная аллея, 3",
    description: "Кафедры лесоводства, дендрологии и ландшафтного дизайна.",
    coords: [37.556, 55.832],
  },
  {
    id: "bldg-10",
    title: "10-й учебный корпус",
    subtitle: "Мелиорация и гидротехника",
    category: "academic",
    badgeLabel: "10",
    x: 66.0,
    y: 35.0,
    address: "Лиственничная аллея, 9",
    description: "Институт мелиорации и водного хозяйства, лаборатории гидромелиорации.",
    coords: [37.5595, 55.834],
  },
  {
    id: "bldg-11",
    title: "11-й учебный корпус",
    subtitle: "Производственные мастерские",
    category: "academic",
    badgeLabel: "11",
    x: 69.0,
    y: 32.0,
    address: "Лиственничная аллея, 11",
    description: "Учебно-производственные мастерские и испытательные стенды.",
    coords: [37.561, 55.8345],
  },
  {
    id: "bldg-26",
    title: "26-й учебный корпус",
    subtitle: "Учебно-лабораторный комплекс",
    category: "academic",
    badgeLabel: "26",
    x: 55.0,
    y: 45.0,
    address: "Тимирязевская ул., 49",
    description: "Большие поточные лекционные залы, буфет-столовая, деканаты факультетов.",
    coords: [37.555, 55.831],
  },
  {
    id: "bldg-27",
    title: "27-й учебный корпус",
    subtitle: "Лингвистический центр",
    category: "academic",
    badgeLabel: "27",
    x: 53.0,
    y: 47.0,
    address: "Лиственничная аллея, 2",
    description: "Кафедра иностранных и русского языков, лингафонные кабинеты.",
    coords: [37.554, 55.8305],
  },
  {
    id: "dorm-5",
    title: "Общежитие №5",
    subtitle: "Студенческий городок",
    category: "dorm",
    badgeLabel: "5",
    x: 90.5,
    y: 30.0,
    address: "Лиственничная аллея, 6Б",
    description: "Студенческое общежитие, спортивная комната, учебные холлы.",
    coords: [37.5555, 55.8338],
  },
  {
    id: "food-26",
    title: "Буфет-столовая 26-го корпуса",
    subtitle: "Студенческое кафе",
    category: "dining",
    badgeLabel: "🍽",
    x: 56.0,
    y: 45.5,
    address: "26-й учебный корпус, 1 этаж",
    description: "Горячие обеды, кофе, выпечка, свежие салаты. 08:30 - 17:30.",
    coords: [37.555, 55.831],
  },
  {
    id: "food-timacad",
    title: "Столовая «Тимирязевская»",
    subtitle: "Центральный комбинат питания",
    category: "dining",
    badgeLabel: "🍽",
    x: 60.0,
    y: 36.0,
    address: "Лиственничная аллея, 5",
    description: "Большая двухэтажная студенческая столовая, комплексное меню. 08:00 - 18:00.",
    coords: [37.5575, 55.835],
  },
  {
    id: "monument-tim",
    title: "Памятник К.А. Тимирязеву",
    subtitle: "Исторический памятник",
    category: "academic",
    badgeLabel: "🏛",
    x: 53.0,
    y: 49.0,
    address: "Тимирязевская площадь",
    description: "Памятник великому ученому-физиологу, основоположнику русской научной школы физиологии растений.",
    coords: [37.5548, 55.83],
  },
  {
    id: "monument-razumovsky",
    title: "Памятник В.И. Разумовскому",
    subtitle: "Исторический памятник",
    category: "academic",
    badgeLabel: "🏛",
    x: 51.0,
    y: 50.0,
    address: "Исторический парк академии",
    description: "Памятник выдающемуся ученому, профессору академии.",
    coords: [37.5532, 55.8308],
  },
]

export const ALL_CAMPUS_MARKERS: CampusPlanMarker[] = [
  ...CAMPUS_PLAN_MARKERS,
  ...ADDITIONAL_CAMPUS_MARKERS,
]

export function getBuildingExtras(id: string): { faculties?: string; dining?: string } {
  switch (id) {
    case "bldg-1":
      return {
        faculties: "Институт агробиотехнологии (агрономия, почвоведение, экология), ректорат",
        dining: "Большая студенческая столовая 1-го корпуса (1 этаж)",
      }
    case "bldg-2":
      return {
        faculties: "Ботанические кафедры, селекция растений, физиология растений",
      }
    case "bldg-3":
      return {
        faculties: "Кафедры земледелия, растениеводства и агрометеорологии",
      }
    case "bldg-4":
      return {
        faculties: "Компьютерные классы, кафедры информационных технологий",
      }
    case "bldg-agrochem":
      return {
        faculties: "Кафедры агрохимии, биохимии, защиты растений",
        dining: "Буфет корпуса агрохимии (холл)",
      }
    case "bldg-6":
      return {
        faculties: "Институт зоотехнии и биологии, ветеринарные лаборатории",
        dining: "Студенческий буфет 6-го корпуса",
      }
    case "bldg-8":
      return {
        faculties: "Кафедры лесоводства, дендрологии и ландшафтного дизайна",
      }
    case "bldg-9":
      return {
        faculties: "Институт экономики и управления АПК, вычислительный центр",
        dining: "Буфет 9-го корпуса",
      }
    case "bldg-10":
      return {
        faculties: "Институт мелиорации и водного хозяйства, лаборатории гидротехники",
      }
    case "bldg-11":
      return {
        faculties: "Учебно-производственные мастерские и испытательные полигоны",
      }
    case "bldg-12":
      return {
        faculties: "Институт мелиорации, водного хозяйства и строительства им. А.Н. Костякова",
        dining: "Буфет 12-го корпуса",
      }
    case "bldg-17":
      return {
        faculties: "Гуманитарный факультет, лингвистический центр, почвоведение",
        dining: "Комбинат питания 17-го корпуса (два зала, цокольный этаж)",
      }
    case "bldg-26":
      return {
        faculties: "Поточные аудитории, деканаты факультетов, лекционные залы",
        dining: "Буфет-столовая 26-го корпуса (1 этаж)",
      }
    case "bldg-27":
      return {
        faculties: "Кафедра иностранных языков, лингафонные кабинеты",
      }
    case "bldg-eng":
      return {
        faculties: "Инженерный институт им. В.П. Горячкина (тракторы, автомобили, с/х машины, техносферная безопасность)",
        dining: "Буфет инженерного корпуса",
      }
    case "bldg-29":
      return {
        faculties: "Цифровой центр, инновационные лаборатории генетики и биотехнологий",
        dining: "Кофейня 29-го корпуса",
      }
    case "bldg-lib":
      return {
        faculties: "Центральная научная библиотека им. Железнова, коворкинг",
        dining: "Кофе-пойнт в холле ЦНБ",
      }
    case "food-timacad":
      return {
        dining: "Большая двухэтажная столовая «Тимирязевская» (комплексные обеды)",
      }
    default:
      return {}
  }
}

// ─── Interactive Campus Plan & 3D Yandex Map Viewer ────────────────────────────

export function CampusPlanViewer({
  onSelectMarker,
  selectedMarkerId,
}: {
  onSelectMarker?: (marker: CampusPlanMarker) => void
  selectedMarkerId?: string | null
}) {
  const [viewMode, setViewMode] = useState<"yandex" | "schematic">("yandex")
  const [scale, setScale] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [filter, setFilter] = useState<"all" | PinCategory>("all")
  const [activeMarker, setActiveMarker] = useState<CampusPlanMarker | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const isDragging = useRef(false)
  const startPan = useRef({ x: 0, y: 0 })

  useEffect(() => {
    if (selectedMarkerId) {
      const found = ALL_CAMPUS_MARKERS.find((m) => m.id === selectedMarkerId)
      if (found) {
        setActiveMarker(found)
      }
    }
  }, [selectedMarkerId])

  const handleZoom = (delta: number) => {
    setScale((prev) => Math.min(Math.max(0.85, prev + delta), 2.5))
  }

  const handleReset = () => {
    setScale(1)
    setPan({ x: 0, y: 0 })
    setActiveMarker(null)
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    isDragging.current = true
    startPan.current = { x: e.clientX - pan.x, y: e.clientY - pan.y }
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging.current) return
    setPan({
      x: e.clientX - startPan.current.x,
      y: e.clientY - startPan.current.y,
    })
  }

  const handleMouseUp = () => {
    isDragging.current = false
  }

  // Touch handlers for mobile
  const touchStartPos = useRef({ x: 0, y: 0 })
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      isDragging.current = true
      touchStartPos.current = {
        x: e.touches[0].clientX - pan.x,
        y: e.touches[0].clientY - pan.y,
      }
    }
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging.current || e.touches.length !== 1) return
    setPan({
      x: e.touches[0].clientX - touchStartPos.current.x,
      y: e.touches[0].clientY - touchStartPos.current.y,
    })
  }

  const handleTouchEnd = () => {
    isDragging.current = false
  }

  const visibleMarkers = ALL_CAMPUS_MARKERS.filter(
    (m) => filter === "all" || m.category === filter
  )

  const mapCenterLng = activeMarker ? activeMarker.coords[0] : 37.5520
  const mapCenterLat = activeMarker ? activeMarker.coords[1] : 55.8340
  const yandexMapUrl = `https://yandex.ru/map-widget/v1/?ll=${mapCenterLng}%2C${mapCenterLat}&z=16&lang=ru_RU&l=map,skl`

  return (
    <div className="flex flex-col gap-2.5">
      {/* View mode switcher: 3D Yandex Map vs Schematic Plan */}
      <div className="px-4 flex items-center justify-between gap-2">
        <div className="flex bg-muted/80 rounded-xl p-0.5 gap-0.5 border border-border/60 shadow-xs">
          <button
            onClick={() => setViewMode("yandex")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              viewMode === "yandex"
                ? "bg-primary text-white shadow-xs"
                : "text-muted-fg hover:text-fg"
            }`}
          >
            📍 3D Яндекс.Карта
          </button>
          <button
            onClick={() => setViewMode("schematic")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              viewMode === "schematic"
                ? "bg-primary text-white shadow-xs"
                : "text-muted-fg hover:text-fg"
            }`}
          >
            🗺 Схема кампуса
          </button>
        </div>

        <span className="text-[11px] font-semibold text-muted-fg">
          {visibleMarkers.length} объектов
        </span>
      </div>

      {/* Category filter chips */}
      <div className="flex items-center gap-1.5 overflow-x-auto px-4 py-1 no-scrollbar">
        {(
          [
            ["all", "Все метки"],
            ["academic", "🏛 Корпуса"],
            ["dorm", "🏠 Общежития"],
            ["dining", "🍽 Питание"],
            ["sports", "⚽ Спорт и памятники"],
            ["department", "🔬 Кафедры"],
          ] as ["all" | PinCategory, string][]
        ).map(([cat, label]) => (
          <button
            key={cat}
            onClick={() => setFilter(cat)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap border transition-all ${
              filter === cat
                ? "bg-primary text-white border-primary shadow-sm"
                : "bg-card border-border text-muted-fg hover:border-primary/40 hover:text-fg"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Main Viewport Container */}
      {viewMode === "yandex" ? (
        <div className="relative mx-4 h-72 sm:h-96 rounded-2xl overflow-hidden border border-border bg-[#F4F1EB] dark:bg-[#121612] shadow-sm">
          <iframe
            src={yandexMapUrl}
            width="100%"
            height="100%"
            frameBorder="0"
            allowFullScreen
            title="Интерактивная 3D Яндекс.Карта кампуса РГАУ-МСХА"
            className="w-full h-full block"
          />

          {/* Quick External Action Controls */}
          <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5 z-30">
            <a
              href={`https://yandex.ru/maps/?ll=${mapCenterLng}%2C${mapCenterLat}&z=16&l=map,skl`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-2.5 py-1.5 rounded-xl bg-card/90 backdrop-blur-md border border-border shadow-sm text-xs font-bold text-primary hover:bg-card flex items-center gap-1 transition-all"
            >
              Яндекс Карты ↗
            </a>
          </div>

          <div className="absolute bottom-2.5 left-2.5 z-30 bg-card/85 backdrop-blur-sm border border-border rounded-xl px-2.5 py-1 text-[11px] font-semibold text-muted-fg pointer-events-none flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            Векторный 3D-режим · Центр 55.8340, 37.5520
          </div>
        </div>
      ) : (
        <div
          ref={containerRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          className="relative mx-4 h-72 sm:h-96 rounded-2xl overflow-hidden border border-border bg-[#F4F1EB] dark:bg-[#121612] cursor-grab active:cursor-grabbing select-none"
        >
          {/* Transform viewport */}
          <div
            className="absolute inset-0 w-full h-full transition-transform duration-75 ease-out"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
              transformOrigin: "center center",
            }}
          >
            {/* Authentic Schematic Plan Image */}
            <img
              src={campusPlanImg}
              alt="Схема кампуса РГАУ-МСХА им. К.А. Тимирязева"
              className="w-full h-full object-contain pointer-events-none drop-shadow"
              draggable={false}
            />

            {/* Coordinate Map Pins */}
            {visibleMarkers.map((m) => {
              const isSel = activeMarker?.id === m.id
              return (
                <div
                  key={m.id}
                  className="absolute"
                  style={{
                    left: `${m.x}%`,
                    top: `${m.y}%`,
                    transform: "translate(-50%, -100%)",
                  }}
                >
                  <CampusMapPinMarker
                    category={m.category}
                    label={m.badgeLabel}
                    size={scale > 1.3 ? 34 : 28}
                    active={isSel}
                    pulse={isSel}
                    onClick={() => {
                      setActiveMarker(m)
                      if (onSelectMarker) onSelectMarker(m)
                    }}
                  />
                </div>
              )
            })}
          </div>

          {/* Map overlay controls */}
          <div className="absolute top-2.5 right-2.5 flex flex-col gap-1.5 z-40">
            <button
              onClick={() => handleZoom(0.25)}
              title="Приблизить"
              className="w-8 h-8 rounded-xl bg-card/90 backdrop-blur border border-border shadow-sm flex items-center justify-center text-fg font-black hover:bg-card hover:text-primary transition-colors text-base cursor-pointer"
            >
              +
            </button>
            <button
              onClick={() => handleZoom(-0.25)}
              title="Отдалить"
              className="w-8 h-8 rounded-xl bg-card/90 backdrop-blur border border-border shadow-sm flex items-center justify-center text-fg font-black hover:bg-card hover:text-primary transition-colors text-base cursor-pointer"
            >
              -
            </button>
            <button
              onClick={handleReset}
              title="Сбросить масштаб"
              className="w-8 h-8 rounded-xl bg-card/90 backdrop-blur border border-border shadow-sm flex items-center justify-center text-muted-fg font-medium hover:bg-card hover:text-primary transition-colors text-xs cursor-pointer"
            >
              ⟲
            </button>
          </div>

          {/* Hint banner */}
          <div className="absolute bottom-2.5 left-2.5 z-40 bg-card/85 backdrop-blur-sm border border-border rounded-xl px-2.5 py-1 text-[11px] font-semibold text-muted-fg pointer-events-none flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            Официальная схема кампуса · {visibleMarkers.length} меток
          </div>
        </div>
      )}

      {/* Horizontal Interactive SVG Pins Carousel */}
      <div className="px-4">
        <p className="text-[11px] text-muted-fg font-semibold mb-1.5 uppercase tracking-wider">
          Быстрый выбор объекта (кастомные метки Тимирязевки):
        </p>
        <div className="flex gap-2 overflow-x-auto pb-1.5 no-scrollbar">
          {visibleMarkers.map((m) => {
            const isSel = activeMarker?.id === m.id
            return (
              <button
                key={m.id}
                onClick={() => {
                  setActiveMarker(m)
                  if (onSelectMarker) onSelectMarker(m)
                }}
                className={`flex items-center gap-2 px-3 py-2 rounded-2xl border transition-all flex-shrink-0 cursor-pointer text-left ${
                  isSel
                    ? "bg-primary/10 border-primary shadow-xs"
                    : "bg-card border-border hover:border-primary/40"
                }`}
              >
                <CampusBadge
                  category={m.category}
                  label={m.badgeLabel}
                  size="sm"
                  active={isSel}
                />
                <div className="min-w-0">
                  <p className="text-xs font-bold text-fg truncate max-w-[120px]">
                    {m.title}
                  </p>
                  <p className="text-[10px] text-muted-fg truncate max-w-[120px]">
                    {m.address}
                  </p>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Selected Marker Detail Card */}
      {activeMarker && (
        <div className="mx-4 p-4 bg-card border border-primary/40 rounded-2xl shadow-md space-y-3 animate-slide-up">
          <div className="flex items-start gap-3">
            <CampusBadge
              category={activeMarker.category}
              label={activeMarker.badgeLabel}
              size="lg"
              pulse
              className="flex-shrink-0"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-1">
                <h4 className="text-sm font-bold text-fg leading-tight">
                  {activeMarker.title}
                </h4>
                <button
                  onClick={() => setActiveMarker(null)}
                  className="text-muted-fg hover:text-fg p-0.5 cursor-pointer"
                >
                  ✕
                </button>
              </div>
              <p className="text-xs font-semibold text-primary mt-0.5">
                {activeMarker.subtitle}
              </p>
              <p className="text-xs text-muted-fg mt-1">
                {activeMarker.description}
              </p>
            </div>
          </div>

          {/* Extras: Faculties / Departments & Dining */}
          {(() => {
            const extras = getBuildingExtras(activeMarker.id)
            if (!extras.faculties && !extras.dining) return null
            return (
              <div className="space-y-1.5 pt-1">
                {extras.faculties && (
                  <div className="p-2.5 rounded-xl bg-muted/60 border border-border/60 text-xs">
                    <p className="font-bold text-fg flex items-center gap-1.5 mb-0.5">
                      <span>🏛</span> Факультеты и кафедры:
                    </p>
                    <p className="text-muted-fg leading-relaxed">{extras.faculties}</p>
                  </div>
                )}
                {extras.dining && (
                  <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-xs">
                    <p className="font-bold text-amber-700 dark:text-amber-300 flex items-center gap-1.5 mb-0.5">
                      <span>🍽</span> Питание в корпусе:
                    </p>
                    <p className="text-amber-800 dark:text-amber-200">{extras.dining}</p>
                  </div>
                )}
              </div>
            )
          })()}

          <div className="pt-2 border-t border-border/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="flex items-center gap-1.5 text-xs text-muted-fg">
              <span>📍</span>
              <span className="font-medium text-fg">{activeMarker.address}</span>
            </div>

            <div className="flex items-center gap-2">
              <a
                href={`https://yandex.ru/maps/?rtext=~${activeMarker.coords[1]}%2C${activeMarker.coords[0]}&rtt=pd`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary text-white hover:bg-primary-light transition-colors text-xs font-bold shadow-xs cursor-pointer"
              >
                <span>🚶</span>
                Маршрут в Яндекс.Картах ↗
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
export default CampusBadge
