#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Full downloader and parser for all 8 institutes of RGAU-MSHA Timiryazevka.
Reads scripts/all_daytime_pdfs.json, downloads each PDF, parses tables into groups & classes,
and generates src/data/official-schedule.json & public/data/official-schedule.json.
"""

import json
import os
import re
import urllib.request
import urllib.parse
import urllib.error
from pathlib import Path
from datetime import datetime
import pdfplumber

ROOT = Path(__file__).parent.parent
PDF_DIR = ROOT / "scripts" / "pdfs_all"
PDF_DIR.mkdir(parents=True, exist_ok=True)
OUT_JSON = ROOT / "src" / "data" / "official-schedule.json"
OUT_PUBLIC = ROOT / "public" / "data" / "official-schedule.json"
ALL_PDFS_FILE = ROOT / "scripts" / "all_daytime_pdfs.json"

TIME_TO_BELL = {
    "09.00": 1, "09:00": 1, "8.30": 1, "08.30": 1, "08:30": 1,
    "10.55": 2, "10:55": 2, "10.20": 2, "10:20": 2,
    "13.00": 3, "13:00": 3, "12.25": 3, "12:25": 3,
    "14.55": 4, "14:55": 4, "14.15": 4, "14:15": 4,
    "16.50": 5, "16:50": 5, "16.05": 5, "16:05": 5,
    "18.45": 6, "18:45": 6, "17.55": 6, "17:55": 6,
    "19.45": 7, "19:45": 7,
}

BELLS = {
    1: ("08:30", "10:05"),
    2: ("10:20", "11:55"),
    3: ("12:25", "14:00"),
    4: ("14:15", "15:50"),
    5: ("16:05", "17:40"),
    6: ("17:55", "19:30"),
    7: ("19:45", "21:20"),
}

WEEKDAYS = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота"]

DAY_PATTERNS = [
    ("ПОНЕДЕЛЬНИК", "Понедельник"),
    ("ВТОРНИК", "Вторник"),
    ("СРЕДА", "Среда"),
    ("ЧЕТВЕРГ", "Четверг"),
    ("ПЯТНИЦА", "Пятница"),
    ("СУББОТА", "Суббота"),
]

def identify_day(cell_text):
    if not cell_text:
        return None
    stripped = "".join(cell_text.split()).upper()
    for pattern, day in DAY_PATTERNS:
        if pattern in stripped:
            return day
    prefix = stripped[:3]
    mapping = {
        "ПОН": "Понедельник",
        "ВТО": "Вторник",
        "СРЕ": "Среда",
        "ЧЕТ": "Четверг",
        "ПЯТ": "Пятница",
        "СУБ": "Суббота",
    }
    return mapping.get(prefix, None)

def parse_time(time_str):
    if not time_str:
        return None
    s = "".join(time_str.split())
    if any(x in s for x in ["0190", "09.00", "08.30", "08:30", "09:00", "8.30", "8:30", "9.00"]):
        return 1
    if any(x in s for x in ["1102", "10.55", "10.20", "10:55", "10:20", "11.55"]):
        return 2
    if any(x in s for x in ["1134", "13.00", "12.25", "13:00", "12:25", "14.00"]):
        return 3
    if any(x in s for x in ["1146", "14.55", "14.15", "14:55", "14:15", "15.50"]):
        return 4
    if any(x in s for x in ["1168", "16.50", "16.05", "16:50", "16:05", "17.40"]):
        return 5
    if any(x in s for x in ["1182", "18.45", "17.55", "18:45", "17:55", "19.30"]):
        return 6
    if any(x in s for x in ["19.45", "19:45", "20.20", "21.20"]):
        return 7
    m = re.search(r'(\d{1,2})[.:](\d{2})', time_str)
    if m:
        h = int(m.group(1))
        if h in (8, 9): return 1
        elif h in (10, 11): return 2
        elif h in (12, 13): return 3
        elif h in (14, 15): return 4
        elif h in (16, 17): return 5
        elif h == 18: return 6
        elif h >= 19: return 7
    return None

def parse_class_type(text):
    t = text.lower()
    if any(w in t for w in ["лаб.", "лаб ", "лаборат"]):
        return "lab"
    elif any(w in t for w in ["пр.", "пр ", "практ", "семинар"]):
        return "practice"
    else:
        return "lecture"

def parse_week_type(text):
    t = text.lower()
    if "чет." in t or "чётн" in t or "четн" in t or "н/ч" in t:
        return "even"
    elif "нечет" in t or "нч." in t:
        return "odd"
    return "all"

def parse_class_cell(cell_text, pair_num):
    if not cell_text or len(cell_text.strip()) < 3:
        return None
    text = cell_text.strip()
    if re.match(r'^[-–—\s]*$', text):
        return None
    
    week_type = parse_week_type(text)
    class_type = parse_class_type(text)
    
    clean = re.sub(r'\b(чет\.|нечет\.|чётн\.|четн\.|нч\.|н/ч)\b', '', text, flags=re.IGNORECASE).strip()
    lines = [l.strip() for l in clean.split('\n') if l.strip()]
    if not lines:
        return None
    
    subject_line = lines[0]
    subject = re.sub(r'^(лек\.|пр\.|лаб\.)\s*', '', subject_line, flags=re.IGNORECASE).strip()
    
    teacher = ""
    room = ""
    building = ""
    
    if len(lines) > 1:
        second = lines[1]
        room_m = re.search(r'(\d{1,2}-\d{2,3}[а-яА-Я]?)\s*$', second)
        if room_m:
            room = room_m.group(1)
            teacher = second[:room_m.start()].strip()
            bldg_num = room.split('-')[0] if '-' in room else ''
            if bldg_num:
                building = f"Корпус {bldg_num}"
        else:
            teacher = second
            
    if len(lines) > 2 and not room:
        third = lines[2]
        room_m2 = re.search(r'(\d{1,2}-\d{2,3}[а-яА-Я]?)', third)
        if room_m2:
            room = room_m2.group(1)
            bldg_num = room.split('-')[0] if '-' in room else ''
            if bldg_num:
                building = f"Корпус {bldg_num}"
                
    if not building:
        building = "1-й учебный корпус"
    if not room:
        room = "—"
    if not subject:
        subject = text[:50]
        
    bell = BELLS.get(pair_num, ("08:30", "10:05"))
    return {
        "num": pair_num,
        "start": bell[0],
        "end": bell[1],
        "subject": subject,
        "type": class_type,
        "teacher": teacher or "Преподаватель",
        "building": building,
        "room": room,
        "weekType": week_type,
    }

def download_file(url, dest_path):
    if dest_path.exists() and dest_path.stat().st_size > 1000:
        return True
    parsed = urllib.parse.urlparse(url)
    encoded_path = urllib.parse.quote(parsed.path, safe='/')
    clean_url = urllib.parse.urlunparse(parsed._replace(path=encoded_path))
    
    req = urllib.request.Request(
        clean_url,
        headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = resp.read()
            dest_path.write_bytes(data)
        return True
    except Exception as e:
        print(f"    Download error {url}: {e}")
        return False

def parse_pdf(pdf_path, institute, course_num):
    groups = {}
    class_id_counter = [course_num * 10000]
    
    try:
        with pdfplumber.open(str(pdf_path)) as pdf:
            for page in pdf.pages:
                tables = page.extract_tables({
                    "vertical_strategy": "lines",
                    "horizontal_strategy": "lines",
                })
                if not tables:
                    tables = page.extract_tables()
                    
                for table in tables:
                    if not table or len(table) < 2:
                        continue
                    header = table[0]
                    if not header:
                        continue
                        
                    group_cols = {}
                    group_pattern = re.compile(r'([А-ЯЁ](?:-[А-ЯЁ]|[А-ЯЁ]{1,3})?\s*\d{2,4}(?:[-–]\s*\d{2})?[а-яА-ЯЁ]?)')
                    for col_idx, cell in enumerate(header):
                        if cell:
                            m = group_pattern.search(str(cell).strip())
                            if m:
                                gname = re.sub(r'\s+', ' ', m.group(1).strip())
                                # Filter out false positives like short words
                                if len(gname) >= 4 and any(c.isdigit() for c in gname):
                                    group_cols[col_idx] = gname
                                    if gname not in groups:
                                        groups[gname] = {
                                            "institute": institute,
                                            "course": course_num,
                                            "schedule": [{"weekday": d, "classes": []} for d in WEEKDAYS]
                                        }
                    if not group_cols:
                        continue
                        
                    current_day = None
                    current_pair = None
                    for row in table[1:]:
                        if not row:
                            continue
                        day_cell = row[0] if row else None
                        if day_cell:
                            d = identify_day(str(day_cell))
                            if d:
                                current_day = d
                                current_pair = None
                            
                        time_cell = row[1] if len(row) > 1 else None
                        if time_cell:
                            p_num = parse_time(str(time_cell))
                            if p_num:
                                current_pair = p_num
                        
                        if not current_day or not current_pair:
                            continue
                            
                        for col_idx, gname in group_cols.items():
                            if col_idx >= len(row): continue
                            cell = row[col_idx]
                            if not cell: continue
                            cls = parse_class_cell(str(cell), current_pair)
                            if not cls: continue
                            
                            class_id_counter[0] += 1
                            cls["id"] = class_id_counter[0]
                            
                            day_obj = next((d for d in groups[gname]["schedule"] if d["weekday"] == current_day), None)
                            if day_obj is not None:
                                is_dup = any(
                                    c["num"] == cls["num"] and
                                    c["subject"] == cls["subject"] and
                                    c["weekType"] == cls["weekType"]
                                    for c in day_obj["classes"]
                                )
                                if not is_dup:
                                    day_obj["classes"].append(cls)
    except Exception as e:
        print(f"    Parse error {pdf_path.name}: {e}")
    return groups

def main():
    if not ALL_PDFS_FILE.exists():
        print("all_daytime_pdfs.json not found!")
        return

    data = json.loads(ALL_PDFS_FILE.read_text(encoding="utf-8"))
    all_groups = {}
    institute_list = []
    
    print("=== Downloading & Parsing All 8 Institutes of Timiryazevka ===")
    
    for inst_idx, inst_data in enumerate(data):
        inst_name = inst_data["institute"]
        institute_list.append(inst_name)
        print(f"\n[{inst_idx+1}/{len(data)}] {inst_name}")
        
        for c_idx, c_info in enumerate(inst_data["courses"]):
            url = c_info["url"]
            desc = c_info["desc"]
            
            # infer course number from desc or file
            course_m = re.search(r'(\d)\s*курс', desc)
            course_num = int(course_m.group(1)) if course_m else (c_idx + 1)
            
            safe_name = f"inst_{inst_idx+1}_c{course_num}_{Path(url).name}"
            pdf_path = PDF_DIR / safe_name
            
            print(f"  Downloading: {desc} ({safe_name})...")
            ok = download_file(url, pdf_path)
            if not ok:
                print(f"    Failed to download: {url}")
                continue
                
            groups = parse_pdf(pdf_path, inst_name, course_num)
            print(f"    Parsed {len(groups)} groups from {desc}")
            for gname, gval in groups.items():
                if gname not in all_groups:
                    all_groups[gname] = gval
                else:
                    # Merge days
                    for day in gval["schedule"]:
                        target_day = next((d for d in all_groups[gname]["schedule"] if d["weekday"] == day["weekday"]), None)
                        if target_day:
                            for c in day["classes"]:
                                if not any(x["num"] == c["num"] and x["subject"] == c["subject"] for x in target_day["classes"]):
                                    target_day["classes"].append(c)

    print("\n" + "="*60)
    print(f"TOTAL GROUPS PARSED: {len(all_groups)}")
    groups_with_classes = {k: v for k, v in all_groups.items() if any(len(d["classes"]) > 0 for d in v["schedule"])}
    print(f"GROUPS WITH REAL CLASSES: {len(groups_with_classes)}")
    
    output = {
        "metadata": {
            "source": "timacad.ru",
            "sourceUrl": "https://www.timacad.ru/about/sveden/document/rezhim-zaniatii-obuchaiushchikhsia",
            "electronicSchedule": "https://eg.timacad.ru/schedule/groups/",
            "generatedAt": datetime.now().isoformat(),
            "semester": "1 семестр 2026/2027",
            "institutes": institute_list,
            "totalGroups": len(all_groups),
            "groupsWithData": len(groups_with_classes),
        },
        "groups": all_groups,
    }
    
    json_text = json.dumps(output, ensure_ascii=False, indent=2)
    OUT_JSON.write_text(json_text, encoding="utf-8")
    OUT_PUBLIC.write_text(json_text, encoding="utf-8")
    print(f"Saved to {OUT_JSON} and {OUT_PUBLIC}")

if __name__ == "__main__":
    main()
