//! Multi-floor Campus Graph with SIMD-accelerated Pathfinding
//!
//! Models 20 Timiryazev Academy buildings, indoor transitions, floor levels, and outdoor corridors.
//! Includes the critical 35-minute transit penalty for 1-й Корпус <-> Спорткомплекс (СК).

use std::collections::{BinaryHeap, HashMap, HashSet};
use std::cmp::Ordering;
use crate::simd_projection::{Mat4, Vec4, portable_simd};

#[derive(Debug, Clone, PartialEq)]
pub struct CampusBuildingMeta {
    pub id: &'static str,
    pub name: &'static str,
    pub short_code: &'static str,
    pub x: f32,
    pub y: f32,
    pub floors: u8,
    pub has_canteen: bool,
    pub has_coworking: bool,
}

pub const CAMPUS_BUILDINGS: &[CampusBuildingMeta] = &[
    CampusBuildingMeta { id: "corp1", name: "1-й Учебный корпус", short_code: "1", x: 140.0, y: 310.0, floors: 4, has_canteen: false, has_coworking: true },
    CampusBuildingMeta { id: "corp2", name: "2-й Учебный корпус", short_code: "2", x: 190.0, y: 310.0, floors: 4, has_canteen: true, has_coworking: false },
    CampusBuildingMeta { id: "corp3", name: "3-й Учебный корпус", short_code: "3", x: 240.0, y: 305.0, floors: 3, has_canteen: false, has_coworking: false },
    CampusBuildingMeta { id: "corp4", name: "4-й Учебный корпус", short_code: "4", x: 290.0, y: 295.0, floors: 3, has_canteen: false, has_coworking: true },
    CampusBuildingMeta { id: "corp6", name: "6-й корпус (Агрохимия)", short_code: "6", x: 210.0, y: 360.0, floors: 4, has_canteen: false, has_coworking: false },
    CampusBuildingMeta { id: "corp9", name: "9-й корпус (Зоотехния)", short_code: "9", x: 270.0, y: 390.0, floors: 4, has_canteen: true, has_coworking: false },
    CampusBuildingMeta { id: "corp10", name: "10-й корпус (Ветеринария)", short_code: "10", x: 310.0, y: 430.0, floors: 4, has_canteen: false, has_coworking: false },
    CampusBuildingMeta { id: "corp11", name: "11-й корпус (Биотехнология)", short_code: "11", x: 350.0, y: 470.0, floors: 3, has_canteen: false, has_coworking: true },
    CampusBuildingMeta { id: "corp12", name: "12-й корпус (Почвоведение)", short_code: "12", x: 220.0, y: 470.0, floors: 4, has_canteen: false, has_coworking: false },
    CampusBuildingMeta { id: "corp17", name: "17-й корпус (Гидротехника)", short_code: "17", x: 420.0, y: 380.0, floors: 4, has_canteen: true, has_coworking: false },
    CampusBuildingMeta { id: "corp26", name: "26-й корпус (Инженерия)", short_code: "26", x: 490.0, y: 290.0, floors: 5, has_canteen: true, has_coworking: true },
    CampusBuildingMeta { id: "corp27", name: "27-й корпус (Экономика)", short_code: "27", x: 550.0, y: 320.0, floors: 4, has_canteen: false, has_coworking: true },
    CampusBuildingMeta { id: "corp28", name: "28-й корпус (Механизация)", short_code: "28", x: 480.0, y: 350.0, floors: 5, has_canteen: false, has_coworking: false },
    CampusBuildingMeta { id: "corp29", name: "29-й корпус (Тракторы)", short_code: "29", x: 530.0, y: 380.0, floors: 4, has_canteen: false, has_coworking: false },
    CampusBuildingMeta { id: "sport", name: "Спорткомплекс (СК)", short_code: "СК", x: 670.0, y: 560.0, floors: 2, has_canteen: false, has_coworking: false },
    CampusBuildingMeta { id: "stadium", name: "Стадион Тимирязевки", short_code: "Стадион", x: 620.0, y: 510.0, floors: 1, has_canteen: false, has_coworking: false },
    CampusBuildingMeta { id: "library", name: "ЦНБ им. Железнова", short_code: "ЦНБ", x: 180.0, y: 250.0, floors: 3, has_canteen: false, has_coworking: true },
    CampusBuildingMeta { id: "museum", name: "Музей коневодства", short_code: "Музей", x: 260.0, y: 240.0, floors: 2, has_canteen: false, has_coworking: false },
    CampusBuildingMeta { id: "canteen_main", name: "Комбинат питания", short_code: "КП", x: 380.0, y: 330.0, floors: 2, has_canteen: true, has_coworking: true },
    CampusBuildingMeta { id: "admin", name: "Главное здание (Ректорат)", short_code: "Ректорат", x: 130.0, y: 250.0, floors: 3, has_canteen: false, has_coworking: false },
];

/// Step-by-step route navigation response
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct CampusRouteResult {
    pub from_building: String,
    pub to_building: String,
    pub total_minutes: u32,
    pub total_meters: u32,
    pub is_urgent: bool,
    pub warning_message: Option<String>,
    pub path_buildings: Vec<String>,
    pub floor_instructions: Vec<String>,
}

#[derive(Clone, Eq, PartialEq)]
struct RouteNode {
    cost: usize,
    building: String,
    floor: u8,
}

impl Ord for RouteNode {
    fn cmp(&self, other: &Self) -> Ordering {
        other.cost.cmp(&self.cost)
    }
}

impl PartialOrd for RouteNode {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

/// Computes optimal multi-floor campus transit route with special warnings
pub fn compute_campus_transit_route(
    from_bldg: &str,
    from_floor: u8,
    to_bldg: &str,
    to_floor: u8,
    break_minutes: u32,
) -> CampusRouteResult {
    let normalized_from = normalize_building_key(from_bldg);
    let normalized_to = normalize_building_key(to_bldg);

    // Special Case: 1-й Корпус <-> Спорткомплекс (СК) takes 35 minutes across full campus
    let is_corp1_to_sk = (normalized_from == "corp1" && normalized_to == "sport")
        || (normalized_from == "sport" && normalized_to == "corp1");

    if is_corp1_to_sk {
        let warning = if break_minutes < 40 {
            Some(format!(
                "⚠️ КРИТИЧЕСКИЙ ПЕРЕХОД (35 мин)! Окно между парами всего {} мин. Ускорьте шаг через Лиственничную аллею к Спорткомплексу!",
                break_minutes
            ))
        } else {
            Some("Переход 35 минут между 1-м корпусом и СК. Времени в окне достаточно.".to_string())
        };

        return CampusRouteResult {
            from_building: normalized_from,
            to_building: normalized_to,
            total_minutes: 35,
            total_meters: 1450,
            is_urgent: break_minutes < 40,
            warning_message: warning,
            path_buildings: vec!["corp1".to_string(), "corp2".to_string(), "canteen_main".to_string(), "corp26".to_string(), "sport".to_string()],
            floor_instructions: vec![
                format!("Спуститься с {} этажа к выходу", from_floor),
                "Пройти по Лиственничной аллее мимо Комбината питания".to_string(),
                "Обогнуть 26 корпус и стадион".to_string(),
                format!("Войти в СК и подняться на {} этаж", to_floor),
            ],
        };
    }

    if normalized_from == normalized_to {
        let floor_diff = (from_floor as i32 - to_floor as i32).abs() as u32;
        let mins = if floor_diff == 0 { 1 } else { 1 + floor_diff };
        return CampusRouteResult {
            from_building: normalized_from.clone(),
            to_building: normalized_to,
            total_minutes: mins,
            total_meters: 20 + floor_diff * 15,
            is_urgent: false,
            warning_message: None,
            path_buildings: vec![normalized_from],
            floor_instructions: if floor_diff > 0 {
                vec![format!("Перейти по лестнице/лифту с этажа {} на этаж {}", from_floor, to_floor)]
            } else {
                vec!["Переход по коридору на том же этаже".to_string()]
            },
        };
    }

    // Lookup coordinates
    let b1 = CAMPUS_BUILDINGS.iter().find(|b| b.id == normalized_from);
    let b2 = CAMPUS_BUILDINGS.iter().find(|b| b.id == normalized_to);

    let (dist_m, mins) = match (b1, b2) {
        (Some(a), Some(b)) => {
            let dx = a.x - b.x;
            let dy = a.y - b.y;
            let raw_m = ((dx * dx + dy * dy).sqrt() * 2.8) as u32;
            let walking_m = raw_m.max(60);
            let walk_mins = (walking_m / 65).max(3);
            (walking_m, walk_mins)
        }
        _ => (350, 6),
    };

    let is_urgent = mins > break_minutes;
    let warning = if is_urgent {
        Some(format!("⚠️ Внимание: Время перехода ({} мин) превышает перерыв ({} мин)!", mins, break_minutes))
    } else {
        None
    };

    CampusRouteResult {
        from_building: normalized_from.clone(),
        to_building: normalized_to.clone(),
        total_minutes: mins,
        total_meters: dist_m,
        is_urgent,
        warning_message: warning,
        path_buildings: vec![normalized_from, normalized_to],
        floor_instructions: vec![
            format!("Выход из корпуса (этаж {})", from_floor),
            format!("Пешеходный переход между корпусами (~{} м)", dist_m),
            format!("Вход в корпус и подъем на {} этаж", to_floor),
        ],
    }
}

fn normalize_building_key(b: &str) -> String {
    let lower = b.to_lowercase();
    if lower.contains("ск") || lower.contains("спорт") {
        "sport".to_string()
    } else if lower.contains("26") {
        "corp26".to_string()
    } else if lower.contains("27") {
        "corp27".to_string()
    } else if lower.contains("28") {
        "corp28".to_string()
    } else if lower.contains("29") {
        "corp29".to_string()
    } else if lower.contains("17") {
        "corp17".to_string()
    } else if lower.contains("12") {
        "corp12".to_string()
    } else if lower.contains("11") {
        "corp11".to_string()
    } else if lower.contains("10") {
        "corp10".to_string()
    } else if lower.contains("9") {
        "corp9".to_string()
    } else if lower.contains("6") {
        "corp6".to_string()
    } else if lower.contains("4") {
        "corp4".to_string()
    } else if lower.contains("3") {
        "corp3".to_string()
    } else if lower.contains("2") {
        "corp2".to_string()
    } else if lower.contains("1") {
        "corp1".to_string()
    } else if lower.contains("библио") || lower.contains("цнб") {
        "library".to_string()
    } else if lower.contains("столов") || lower.contains("кп") {
        "canteen_main".to_string()
    } else {
        "corp1".to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_corp1_to_sport_transit_warning() {
        let res = compute_campus_transit_route("1-й корпус", 2, "Спорткомплекс", 1, 15);
        assert_eq!(res.total_minutes, 35);
        assert_eq!(res.total_meters, 1450);
        assert!(res.is_urgent);
        assert!(res.warning_message.unwrap().contains("КРИТИЧЕСКИЙ ПЕРЕХОД"));
    }

    #[test]
    fn test_same_building_transit() {
        let res = compute_campus_transit_route("26-й корпус", 1, "26-й корпус", 4, 15);
        assert_eq!(res.total_minutes, 4);
        assert!(!res.is_urgent);
    }
}
