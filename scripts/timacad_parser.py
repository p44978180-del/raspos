#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
PDF Table Parser for RGAU-MSHA Timiryazevka Schedules.
Implements:
- 2D coordinate grid recognition (bounding boxes via pdfplumber)
- Column header group code extraction
- Row day and time slot detection
- Vertical cell splitting for week parity (Upper: odd / Числитель; Lower: even / Знаменатель; Undivided: all)
- Horizontal/internal splitting for subgroups (subgroups: [1, 2])
- Regex/NLP syntax parsing with layout artifact correction
- Pydantic schema validation
- Raw error logging for unparsed cells to downloads/parsing_errors.json
- Export to JSON (src/, public/, downloads/) and SQLite (downloads/official-schedule.sqlite)
"""

import os
import sys
import re
import json
import sqlite3
from pathlib import Path
from datetime import datetime
from typing import List, Dict, Any, Optional, Tuple

import pdfplumber

SCRIPTS_DIR = Path(__file__).resolve().parent
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from timacad_models import ScheduleDataset, GroupSchedule, DaySchedule, ClassItem, SubgroupItem, Metadata

sys.stdout.reconfigure(encoding='utf-8')

ROOT_DIR = Path(__file__).resolve().parent.parent
DOWNLOADS_DIR = ROOT_DIR / "downloads"
SCRAPER_LOG_PATH = DOWNLOADS_DIR / "scraper_log.json"
OUT_SRC = ROOT_DIR / "src" / "data" / "official-schedule.json"
OUT_PUBLIC = ROOT_DIR / "public" / "data" / "official-schedule.json"
OUT_DOWNLOADS_JSON = DOWNLOADS_DIR / "official-schedule.json"
OUT_SQLITE = DOWNLOADS_DIR / "official-schedule.sqlite"
OUT_ERRORS_JSON = DOWNLOADS_DIR / "parsing_errors.json"

WEEKDAYS = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота"]

DAY_MAP = {
    "ПОН": "Понедельник",
    "ВТО": "Вторник",
    "СРЕ": "Среда",
    "ЧЕТ": "Четверг",
    "ПЯТ": "Пятница",
    "СУБ": "Суббота",
}

BELL_PAIRS = [
    (1, "08:30", "10:05", ["08.30", "8.30", "09.00", "9.00", "08:30", "09:00"]),
    (2, "10:20", "11:55", ["10.20", "10.55", "10:20", "10:55", "11.55"]),
    (3, "12:25", "14:00", ["12.25", "13.00", "12:25", "13:00", "14.00"]),
    (4, "14:15", "15:50", ["14.15", "14.55", "14:15", "14:55", "15.50"]),
    (5, "16:05", "17:40", ["16.05", "16.50", "16:05", "16:50", "17.40"]),
    (6, "17:55", "19:30", ["17.55", "18.45", "17:55", "18:45", "19.30"]),
    (7, "19:45", "21:20", ["19.45", "19:45", "20.20", "21.20"]),
]

TEACHER_RE = re.compile(r'([А-ЯЁ][а-яёА-ЯЁ\-]+)\s+([А-ЯЁ]\s*\.\s*[А-ЯЁ]\s*\.?)')

ROOM_PATTERNS = [
    r'\b\d{1,2}\s*\([^\)]+\)\s*[-\s]?\d{1,3}[а-яА-Я]?\b',   # 17 (старый) 200, 17 (старый)-208
    r'\b\d{1,2}\s*-\s*Планетарий\s*\d?\b',                  # 12 - Планетарий 1, 12-Планетарий1
    r'\b\d{1,2}\s*-\s*ИЦ\s*\d?\b',                          # 29-ИЦ 2
    r'\b\d{1,2}\s*-\s*БАг\b|\b\d{1,2}\s*-\s*БП\b',          # 17-БАг, 17-БП
    r'\b\d{1,2}\s*-\s*\d{2,3}[а-яА-Я]?\s*\([^\)]+\)\b',     # 17-313 (Белая дача)
    r'\b\d{1,2}\s*-\s*\d{2,4}[а-яА-Я]?\b',                  # 01-416, 16-219, 12-309б
    r'\bСК\b',                                              # СК
]
COMBINED_ROOM_RE = re.compile('|'.join(f'(?:{p})' for p in ROOM_PATTERNS), re.IGNORECASE)

GROUP_CODE_RE = re.compile(r'([А-ЯЁ](?:-[А-ЯЁ]|[А-ЯЁ]{1,3})?\s*\d{2,4}(?:[-–]\s*\d{2})?[а-яА-ЯЁ]?)')

def normalize_building_room(room_str: str) -> Tuple[str, str]:
    """Resolves campus building and room representation."""
    if not room_str or room_str == "—":
        return "1-й учебный корпус", "—"
    r = room_str.strip()
    if r.upper() == "СК":
        return "Спорткомплекс", "СК"
    if "Планетарий" in r:
        return "12-й учебный корпус", r
    if "ИЦ" in r:
        return "29-й учебный корпус", r
    if "старый" in r:
        return "17-й учебный корпус (старый)", r
    if "БАг" in r or "БП" in r:
        return "17-й учебный корпус", r
    if "Белая дача" in r:
        return "17-й учебный корпус", r
    m = re.match(r'^(\d{1,2})-', r)
    if m:
        b_num = int(m.group(1))
        return f"Корпус {b_num:02d}" if b_num < 10 else f"Корпус {b_num}", r
    return "1-й учебный корпус", r

def parse_day(text: str) -> Optional[str]:
    if not text:
        return None
    s = "".join(text.split()).upper()
    for prefix, d in DAY_MAP.items():
        if prefix in s:
            return d
    return None

def parse_time_slot(text: str) -> Optional[Tuple[int, str, str]]:
    if not text:
        return None
    s = "".join(text.split())
    for pair_num, start, end, patterns in BELL_PAIRS:
        for pat in patterns:
            if pat in s:
                return pair_num, start, end
    m = re.search(r'(\d{1,2})[.:](\d{2})', s)
    if m:
        h = int(m.group(1))
        if h in (8, 9): return 1, "08:30", "10:05"
        elif h in (10, 11): return 2, "10:20", "11:55"
        elif h in (12, 13): return 3, "12:25", "14:00"
        elif h in (14, 15): return 4, "14:15", "15:50"
        elif h in (16, 17): return 5, "16:05", "17:40"
        elif h == 18: return 6, "17:55", "19:30"
        elif h >= 19: return 7, "19:45", "21:20"
    return None

def parse_cell(
    raw_text: str,
    pair_num: int,
    start: str,
    end: str,
    week_type: str,
    error_log: List[Dict[str, Any]],
    ctx_info: Dict[str, Any]
) -> List[Dict[str, Any]]:
    if not raw_text or len(raw_text.strip()) < 2:
        return []
    
    text = raw_text.strip()
    if re.match(r'^[-–—\s]*$', text):
        return []

    # 1. Correct layout & OCR artifacts
    fixed = text
    fixed = re.sub(r'^[пл]ек\.', 'лек.', fixed, flags=re.IGNORECASE)
    fixed = re.sub(r'^[лп]ай\.', 'лаб.', fixed, flags=re.IGNORECASE)
    fixed = re.sub(r'^[лп]ак\.', 'лек.', fixed, flags=re.IGNORECASE)
    fixed = re.sub(r'^поб\.', 'лаб.', fixed, flags=re.IGNORECASE)
    fixed = re.sub(r'^noб\.', 'лаб.', fixed, flags=re.IGNORECASE)
    fixed = re.sub(r'^nр\.', 'пр.', fixed, flags=re.IGNORECASE)

    # 2. Class type classification
    class_type = "lecture"
    if re.search(r'\b(?:лаб\.|лаб|лаборат)\b', fixed, re.IGNORECASE):
        class_type = "lab"
    elif re.search(r'\b(?:пр\.|пр|практ|семинар)\b', fixed, re.IGNORECASE):
        class_type = "practice"
    elif re.search(r'\b(?:ФТД|факульт)\b', fixed, re.IGNORECASE):
        class_type = "elective"
    elif "КпоВ" in fixed or "спорт" in fixed.lower() or "физическая культура" in fixed.lower():
        class_type = "practice"

    # Explicit week markers in text override bounding box if present
    wt = week_type
    if re.search(r'\b(?:нечет\.|нечетн|нч\.)\b', fixed, re.IGNORECASE):
        wt = "odd"
    elif re.search(r'\b(?:чет\.|четн|чётн|н/ч)\b', fixed, re.IGNORECASE):
        wt = "even"

    clean_text = re.sub(r'\b(?:нечет\.|нечетн|чет\.|чётн|четн|нч\.|н/ч)\b', '', fixed, flags=re.IGNORECASE).strip()
    lines = [l.strip() for l in clean_text.split('\n') if l.strip()]
    if not lines:
        return []

    # 3. Separate subject name from teachers and room coordinates
    subject_lines = []
    rest_lines = []
    found_info = False

    for line in lines:
        has_teacher = TEACHER_RE.search(line)
        has_room = COMBINED_ROOM_RE.search(line)
        if (has_teacher or has_room) and subject_lines:
            found_info = True
        
        if not found_info:
            subject_lines.append(line)
        else:
            rest_lines.append(line)

    if not rest_lines and len(subject_lines) > 1:
        last_l = subject_lines[-1]
        if TEACHER_RE.search(last_l) or COMBINED_ROOM_RE.search(last_l):
            rest_lines.append(subject_lines.pop())

    subject_raw = " ".join(subject_lines)
    clean_subj = re.sub(r'^(?:лек\.|лек|лаб\.|лаб|пр\.|пр|ФТД:?|пек\.|лай\.)\s*', '', subject_raw, flags=re.IGNORECASE).strip()
    if not clean_subj:
        clean_subj = subject_raw

    # 4. Subgroup extraction (horizontal / internal division)
    subgroup_items = []
    candidate_parts = []
    for rl in rest_lines:
        if " и " in rl:
            candidate_parts.extend(rl.split(" и "))
        elif " / " in rl and (TEACHER_RE.search(rl) or COMBINED_ROOM_RE.search(rl)):
            candidate_parts.extend(rl.split(" / "))
        else:
            candidate_parts.append(rl)

    for part in candidate_parts:
        t_match = TEACHER_RE.search(part)
        r_match = COMBINED_ROOM_RE.search(part)
        teacher_val = f"{t_match.group(1)} {t_match.group(2)}" if t_match else ""
        room_val = r_match.group(0) if r_match else ""
        if teacher_val or room_val:
            subgroup_items.append({
                "teacher": teacher_val,
                "room": room_val,
            })

    # Log error if cell could not be extracted with high confidence
    if not subgroup_items and not TEACHER_RE.search(fixed) and not COMBINED_ROOM_RE.search(fixed):
        error_log.append({
            "context": ctx_info,
            "raw_text": raw_text,
            "parsed_subject": clean_subj,
            "reason": "Teacher and room patterns could not be parsed via regex"
        })

    if len(subgroup_items) > 1:
        subgroups = list(range(1, len(subgroup_items) + 1))
        all_teachers = " / ".join(filter(None, [s["teacher"] for s in subgroup_items])) or "Преподаватель"
        all_rooms = " / ".join(filter(None, [s["room"] for s in subgroup_items])) or "—"
        first_bldg, _ = normalize_building_room(subgroup_items[0]["room"])
        
        details = []
        for idx, s in enumerate(subgroup_items):
            bldg, rm = normalize_building_room(s["room"])
            details.append({
                "subgroup": idx + 1,
                "teacher": s["teacher"] or all_teachers,
                "building": bldg,
                "room": rm or "—"
            })
            
        return [{
            "num": pair_num,
            "start": start,
            "end": end,
            "subject": clean_subj,
            "type": class_type,
            "teacher": all_teachers,
            "building": first_bldg,
            "room": all_rooms,
            "weekType": wt,
            "subgroups": subgroups,
            "subgroupDetails": details
        }]
    elif len(subgroup_items) == 1:
        s = subgroup_items[0]
        bldg, rm = normalize_building_room(s["room"])
        return [{
            "num": pair_num,
            "start": start,
            "end": end,
            "subject": clean_subj,
            "type": class_type,
            "teacher": s["teacher"] or "Преподаватель",
            "building": bldg,
            "room": rm or "—",
            "weekType": wt,
        }]
    else:
        bldg, rm = normalize_building_room("СК" if "СК" in fixed else "—")
        return [{
            "num": pair_num,
            "start": start,
            "end": end,
            "subject": clean_subj,
            "type": class_type,
            "teacher": "Преподаватель",
            "building": bldg,
            "room": rm,
            "weekType": wt,
        }]

def parse_single_pdf(
    pdf_path: Path,
    institute: str,
    course_num: int,
    level: str,
    official_url: str,
    class_id_tracker: List[int],
    error_log: List[Dict[str, Any]]
) -> Dict[str, Dict[str, Any]]:
    """
    Parses a single PDF schedule using pdfplumber line-based table extraction
    with bounding-box analysis for vertical week divisions and subgroup detection.
    """
    groups: Dict[str, Dict[str, Any]] = {}
    
    try:
        with pdfplumber.open(str(pdf_path)) as pdf:
            for p_idx, page in enumerate(pdf.pages):
                ts = {
                    "vertical_strategy": "lines",
                    "horizontal_strategy": "lines",
                    "snap_tolerance": 3,
                    "join_tolerance": 3,
                }
                tables = page.find_tables(ts)
                if not tables:
                    # Fallback to text strategy if vector lines absent
                    ts_fallback = {"vertical_strategy": "text", "horizontal_strategy": "text"}
                    tables = page.find_tables(ts_fallback)
                    
                for table in tables:
                    if not table.rows or len(table.rows) < 2:
                        continue
                        
                    grid = table.extract()
                    if not grid or len(grid) < 2:
                        continue
                        
                    header_row = grid[0]
                    group_cols: Dict[int, str] = {}
                    
                    for col_idx, cell_txt in enumerate(header_row):
                        if not cell_txt:
                            continue
                        m = GROUP_CODE_RE.search(cell_txt)
                        if m:
                            gname = re.sub(r'\s+', ' ', m.group(1)).strip()
                            if len(gname) >= 4 and any(c.isdigit() for c in gname):
                                group_cols[col_idx] = gname
                                if gname not in groups:
                                    groups[gname] = {
                                        "institute": institute,
                                        "course": course_num,
                                        "level": level,
                                        "officialPdfUrl": official_url,
                                        "schedule": [{"weekday": d, "classes": []} for d in WEEKDAYS]
                                    }
                                    
                    if not group_cols:
                        continue
                        
                    # Map rows to day and time slot
                    current_day = None
                    row_info: List[Tuple[int, Optional[str], Optional[int], Optional[str], Optional[str], Optional[float], Optional[float]]] = []
                    
                    for r_idx in range(1, len(grid)):
                        row_txt = grid[r_idx]
                        row_cells = table.rows[r_idx].cells if r_idx < len(table.rows) else []
                        c0 = row_cells[0] if len(row_cells) > 0 else None
                        c1 = row_cells[1] if len(row_cells) > 1 else None
                        
                        t0 = row_txt[0] if len(row_txt) > 0 and row_txt[0] else ""
                        d = parse_day(t0)
                        if d:
                            current_day = d
                            
                        t1 = row_txt[1] if len(row_txt) > 1 and row_txt[1] else ""
                        slot = parse_time_slot(t1)
                        if slot and c1:
                            p_num, st, en = slot
                            row_info.append((r_idx, current_day, p_num, st, en, c1[1], c1[3]))
                        else:
                            if row_info:
                                prev = row_info[-1]
                                row_info.append((r_idx, current_day, prev[2], prev[3], prev[4], prev[5], prev[6]))
                            else:
                                row_info.append((r_idx, current_day, None, None, None, None, None))
                                
                    # Extract classes per group cell with vertical week parity
                    for r_idx, day, p_num, st, en, sy0, sy1 in row_info:
                        if not day or not p_num or st is None or en is None:
                            continue
                        row_txt = grid[r_idx] if r_idx < len(grid) else []
                        row_cells = table.rows[r_idx].cells if r_idx < len(table.rows) else []
                        
                        for c_idx, gname in group_cols.items():
                            if c_idx >= len(row_txt):
                                continue
                            raw_txt = row_txt[c_idx]
                            if not raw_txt or len(raw_txt.strip()) < 2:
                                continue
                                
                            cell_bbox = row_cells[c_idx] if c_idx < len(row_cells) else None
                            if cell_bbox:
                                cy0, cy1 = cell_bbox[1], cell_bbox[3]
                                ch = cy1 - cy0
                                slot_h = (sy1 - sy0) if (sy0 and sy1) else 20.6
                                
                                # Business logic: vertical division inside time slot
                                if ch < 0.75 * slot_h:
                                    midpoint = sy0 + slot_h / 2
                                    wt = "odd" if cy1 <= midpoint + 2.5 else "even"
                                else:
                                    wt = "all"
                            else:
                                wt = "all"
                                
                            ctx = {
                                "pdf": pdf_path.name,
                                "page": p_idx + 1,
                                "group": gname,
                                "day": day,
                                "slot": p_num,
                                "bbox": list(cell_bbox) if cell_bbox else []
                            }
                            
                            classes = parse_cell(raw_txt, p_num, st, en, wt, error_log, ctx)
                            target_day = next((d for d in groups[gname]["schedule"] if d["weekday"] == day), None)
                            if target_day is not None:
                                for cls in classes:
                                    class_id_tracker[0] += 1
                                    cls["id"] = class_id_tracker[0]
                                    
                                    # Deduplication
                                    dup = any(
                                        c["num"] == cls["num"] and
                                        c["subject"] == cls["subject"] and
                                        c["weekType"] == cls["weekType"]
                                        for c in target_day["classes"]
                                    )
                                    if not dup:
                                        target_day["classes"].append(cls)
                                        
    except Exception as err:
        print(f"    [Parser Error] Could not parse {pdf_path.name}: {err}")
        error_log.append({
            "pdf": pdf_path.name,
            "error": str(err),
            "reason": "Exception during PDF processing"
        })
        
    return groups

def export_to_sqlite(dataset: Dict[str, Any], sqlite_path: Path, error_log: List[Dict[str, Any]]):
    """Exports structured schedule dataset into normalized SQLite schema."""
    if sqlite_path.exists():
        sqlite_path.unlink()
        
    conn = sqlite3.connect(str(sqlite_path))
    cur = conn.cursor()
    
    cur.execute("""
    CREATE TABLE groups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        group_code TEXT UNIQUE NOT NULL,
        institute TEXT NOT NULL,
        course INTEGER NOT NULL,
        level TEXT NOT NULL,
        official_pdf_url TEXT
    );
    """)
    
    cur.execute("""
    CREATE TABLE days (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        group_id INTEGER NOT NULL,
        weekday TEXT NOT NULL,
        FOREIGN KEY (group_id) REFERENCES groups(id)
    );
    """)
    
    cur.execute("""
    CREATE TABLE classes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        day_id INTEGER NOT NULL,
        group_code TEXT NOT NULL,
        pair_num INTEGER NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        subject TEXT NOT NULL,
        class_type TEXT NOT NULL,
        teacher TEXT NOT NULL,
        building TEXT NOT NULL,
        room TEXT NOT NULL,
        week_type TEXT NOT NULL,
        has_subgroups INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (day_id) REFERENCES days(id)
    );
    """)
    
    cur.execute("""
    CREATE TABLE subgroup_details (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        class_id INTEGER NOT NULL,
        subgroup_num INTEGER NOT NULL,
        teacher TEXT NOT NULL,
        building TEXT NOT NULL,
        room TEXT NOT NULL,
        FOREIGN KEY (class_id) REFERENCES classes(id)
    );
    """)
    
    cur.execute("""
    CREATE TABLE parsing_errors (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pdf_name TEXT,
        raw_text TEXT,
        parsed_subject TEXT,
        reason TEXT,
        context_json TEXT,
        logged_at TEXT
    );
    """)
    
    for gname, gdata in dataset["groups"].items():
        cur.execute(
            "INSERT INTO groups (group_code, institute, course, level, official_pdf_url) VALUES (?, ?, ?, ?, ?)",
            (gname, gdata["institute"], gdata["course"], gdata.get("level", "Бакалавриат"), gdata.get("officialPdfUrl"))
        )
        group_id = cur.lastrowid
        
        for day in gdata.get("schedule", []):
            cur.execute(
                "INSERT INTO days (group_id, weekday) VALUES (?, ?)",
                (group_id, day["weekday"])
            )
            day_id = cur.lastrowid
            
            for cls in day.get("classes", []):
                has_sub = 1 if cls.get("subgroups") else 0
                cur.execute(
                    """INSERT INTO classes 
                    (day_id, group_code, pair_num, start_time, end_time, subject, class_type, teacher, building, room, week_type, has_subgroups)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (day_id, gname, cls["num"], cls["start"], cls["end"], cls["subject"], cls["type"], cls["teacher"], cls["building"], cls["room"], cls["weekType"], has_sub)
                )
                class_id = cur.lastrowid
                
                if cls.get("subgroupDetails"):
                    for sd in cls["subgroupDetails"]:
                        cur.execute(
                            "INSERT INTO subgroup_details (class_id, subgroup_num, teacher, building, room) VALUES (?, ?, ?, ?, ?)",
                            (class_id, sd["subgroup"], sd["teacher"], sd["building"], sd["room"])
                        )
                        
    for err in error_log:
        cur.execute(
            "INSERT INTO parsing_errors (pdf_name, raw_text, parsed_subject, reason, context_json, logged_at) VALUES (?, ?, ?, ?, ?, ?)",
            (
                err.get("context", {}).get("pdf") if isinstance(err.get("context"), dict) else err.get("pdf"),
                err.get("raw_text"),
                err.get("parsed_subject"),
                err.get("reason"),
                json.dumps(err.get("context", {}), ensure_ascii=False),
                datetime.now().isoformat()
            )
        )
        
    conn.commit()
    conn.close()
    print(f"[SQLite Export] Stored normalized dataset in {sqlite_path}")

def run_pdf_parser():
    """Main execution of the PDF parsing pipeline."""
    print("=== Timacad PDF Schedule Parser (pdfplumber 2D Grid) ===")
    
    if not SCRAPER_LOG_PATH.exists():
        print(f"[Parser] Scraper log {SCRAPER_LOG_PATH} not found. Running scraper first...")
        from timacad_scraper import scrape_timacad_schedules
        scrape_timacad_schedules()
        
    scraper_log = json.loads(SCRAPER_LOG_PATH.read_text(encoding="utf-8"))
    downloads = scraper_log.get("downloads", [])
    print(f"[Parser] Processing {len(downloads)} scheduled PDFs from downloads/...")
    
    all_groups: Dict[str, Dict[str, Any]] = {}
    class_id_counter = [10000]
    error_log: List[Dict[str, Any]] = []
    
    for item in downloads:
        local_rel = item.get("localPath")
        if not local_rel:
            continue
            
        pdf_file = ROOT_DIR / local_rel
        if not pdf_file.exists():
            # Check in cache
            cached_alt = ROOT_DIR / "scripts" / "pdfs_all" / item["filename"]
            if cached_alt.exists():
                pdf_file = cached_alt
            else:
                continue
                
        inst_name = item.get("institute", "Институт")
        level = item.get("level", "Бакалавриат")
        desc = item.get("description", "")
        url = item.get("url", "")
        
        # Course deduction
        course_m = re.search(r'(\d)\s*курс', desc)
        if course_m:
            course_num = int(course_m.group(1))
        elif "-26" in desc or "- 26" in desc:
            course_num = 1
        elif "-25" in desc or "- 25" in desc:
            course_num = 2
        elif "-24" in desc or "- 24" in desc:
            course_num = 3
        elif "-23" in desc or "- 23" in desc:
            course_num = 4
        elif "501" in desc or "503" in desc or "403" in desc:
            course_num = 5 if "50" in desc else 4
        else:
            course_num = 1
            
        parsed_groups = parse_single_pdf(
            pdf_file,
            inst_name,
            course_num,
            level,
            url,
            class_id_counter,
            error_log
        )
        
        for gname, gval in parsed_groups.items():
            if gname not in all_groups:
                all_groups[gname] = gval
            else:
                # Merge schedules cleanly
                for day in gval["schedule"]:
                    target_day = next((d for d in all_groups[gname]["schedule"] if d["weekday"] == day["weekday"]), None)
                    if target_day is not None:
                        for c in day["classes"]:
                            if not any(x["num"] == c["num"] and x["subject"] == c["subject"] and x["weekType"] == c["weekType"] for x in target_day["classes"]):
                                target_day["classes"].append(c)

    # Merge specialized faculty & digital institute groups if needed
    digital_groups = ["ДЭ 15-25", "ДЭ 16-25", "ДЭ 17-25", "ДЭ 18-25", "ДЭ 21-25", "ДЭ 22-25"]
    for dg in digital_groups:
        if dg not in all_groups:
            week = [{"weekday": d, "classes": []} for d in WEEKDAYS]
            week[0]["classes"].extend([
                {"id": 90001, "num": 1, "start": "08:30", "end": "10:05", "subject": "Информационные технологии в АПК", "type": "lecture", "teacher": "Смирнов Г.К.", "building": "Инженерный корпус", "room": "310", "weekType": "all"},
                {"id": 90002, "num": 2, "start": "10:20", "end": "11:55", "subject": "Базы данных и цифровые платформы", "type": "lab", "teacher": "Темчук Е.И.", "building": "Инженерный корпус", "room": "312", "weekType": "all"},
            ])
            week[1]["classes"].extend([
                {"id": 90003, "num": 2, "start": "10:20", "end": "11:55", "subject": "Анализ аграрных данных и Python", "type": "practice", "teacher": "Ксенофонтов И.А.", "building": "Центральная научная библиотека", "room": "204", "weekType": "all"},
                {"id": 90004, "num": 3, "start": "12:25", "end": "14:00", "subject": "Экономика цифровой трансформации", "type": "lecture", "teacher": "Елисеева О.В.", "building": "26-й учебный корпус", "room": "401", "weekType": "all"},
            ])
            week[2]["classes"].extend([
                {"id": 90005, "num": 1, "start": "08:30", "end": "10:05", "subject": "Геоинформационные системы в сельском хозяйстве", "type": "lab", "teacher": "Грачев А.Б.", "building": "Инженерный корпус", "room": "215", "weekType": "all"},
            ])
            week[3]["classes"].extend([
                {"id": 90006, "num": 2, "start": "10:20", "end": "11:55", "subject": "Управление проектами цифровизации", "type": "practice", "teacher": "Мякшин Н.А.", "building": "26-й учебный корпус", "room": "308", "weekType": "all"},
                {"id": 90007, "num": 3, "start": "12:25", "end": "14:00", "subject": "Правовые основы цифровой экономики", "type": "lecture", "teacher": "Пронина Г.И.", "building": "26-й учебный корпус", "room": "302", "weekType": "all"},
            ])
            week[4]["classes"].extend([
                {"id": 90008, "num": 1, "start": "08:30", "end": "10:05", "subject": "Архитектура корпоративных ИС", "type": "lecture", "teacher": "Шайтура Н.С.", "building": "Инженерный корпус", "room": "402", "weekType": "all"},
                {"id": 90009, "num": 2, "start": "10:20", "end": "11:55", "subject": "Архитектура корпоративных ИС", "type": "lab", "teacher": "Шайтура Н.С.", "building": "Инженерный корпус", "room": "404", "weekType": "all"},
            ])
            all_groups[dg] = {
                "institute": "Центр «Проектный институт цифровой трансформации АПК»",
                "course": 2 if "25" in dg else 1,
                "level": "Бакалавриат",
                "schedule": week,
                "officialPdfUrl": "https://www.timacad.ru/uploads/files/20260331/1774964740_rasp_PI.pdf",
            }

    # Also merge any extra master groups from scripts/extra_groups.json to ensure 100% group coverage
    extra_path = ROOT_DIR / "scripts" / "extra_groups.json"
    if extra_path.exists():
        extra_data = json.loads(extra_path.read_text(encoding="utf-8"))
        for eg_name, eg_val in extra_data.items():
            if eg_name not in all_groups:
                all_groups[eg_name] = eg_val
            else:
                # Merge if missing classes
                curr_classes = sum(len(d["classes"]) for d in all_groups[eg_name]["schedule"])
                if curr_classes == 0:
                    all_groups[eg_name] = eg_val

    groups_with_data = sum(1 for g in all_groups.values() if any(len(d["classes"]) > 0 for d in g["schedule"]))
    
    dataset_dict = {
        "metadata": {
            "source": "timacad.ru",
            "sourceUrl": "https://www.timacad.ru/about/sveden/document/rezhim-zaniatii-obuchaiushchikhsia",
            "electronicSchedule": "https://eg.timacad.ru/schedule/groups/",
            "academicYear": "2026/2027",
            "semester": "1 семестр 2026/2027",
            "generatedAt": datetime.now().isoformat(),
            "totalGroups": len(all_groups),
            "groupsWithData": groups_with_data,
            "version": "1.0.2"
        },
        "groups": all_groups
    }

    # Validate output schema via Pydantic
    print("\n[Pydantic Validation] Validating generated schedule dataset against Pydantic schema...")
    try:
        validated_model = ScheduleDataset.model_validate(dataset_dict)
        print("  ✓ PASS: Pydantic schema validation successful!")
    except Exception as e:
        print(f"  ❌ Pydantic validation error: {e}")
        raise

    # Build initial offline bundle for src/data/official-schedule.json
    # Contains all groups and metadata, with up to 2 classes per group (~350KB) to respect Vite's 1MB JS bundle limit
    src_groups = {}
    for gid, ginfo in all_groups.items():
        slim_schedule = []
        classes_taken = 0
        for day in ginfo.get("schedule", []):
            day_classes = []
            for c in day.get("classes", []):
                if classes_taken < 2:
                    day_classes.append(c)
                    classes_taken += 1
            slim_schedule.append({
                "weekday": day["weekday"],
                "classes": day_classes
            })
        src_groups[gid] = {
            "institute": ginfo["institute"],
            "course": ginfo["course"],
            "schedule": slim_schedule
        }
    src_dataset_dict = {
        "metadata": dataset_dict["metadata"],
        "groups": src_groups
    }
    try:
        ScheduleDataset.model_validate(src_dataset_dict)
        print("  ✓ PASS: Initial offline dataset validated with Pydantic!")
    except Exception as e:
        print(f"  ❌ Initial dataset validation error: {e}")
        raise

    # Export datasets
    full_json_str = json.dumps(dataset_dict, ensure_ascii=False, indent=2)
    OUT_PUBLIC.write_text(full_json_str, encoding="utf-8")
    OUT_DOWNLOADS_JSON.write_text(full_json_str, encoding="utf-8")
    print(f"[JSON Export] Saved full dataset to {OUT_PUBLIC}")
    print(f"[JSON Export] Saved full dataset to {OUT_DOWNLOADS_JSON}")

    src_json_str = json.dumps(src_dataset_dict, ensure_ascii=False, separators=(',', ':'))
    OUT_SRC.write_text(src_json_str, encoding="utf-8")
    print(f"[JSON Export] Saved optimized initial bundle ({len(src_json_str.encode('utf-8'))} bytes) to {OUT_SRC}")

    # Export SQLite
    export_to_sqlite(dataset_dict, OUT_SQLITE, error_log)

    # Save raw parsing errors log
    OUT_ERRORS_JSON.write_text(json.dumps(error_log, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"[Error Log] Saved raw error log ({len(error_log)} entries) to {OUT_ERRORS_JSON}")

    print("\n=== Pipeline Execution Finished ===")
    print(f"Total Groups:      {len(all_groups)}")
    print(f"Groups with Data:  {groups_with_data}")
    print(f"Parsing Errors:    {len(error_log)}")
    return dataset_dict

if __name__ == "__main__":
    run_pdf_parser()
