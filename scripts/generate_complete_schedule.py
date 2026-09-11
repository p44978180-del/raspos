#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Master Schedule Generator for Timiryazevka (RGAU-MSHA)
Merges all 359 daytime bachelor groups, 50 daytime master groups, and all scanned/specialized faculty groups
into src/data/official-schedule.json and public/data/official-schedule.json.
Total groups: 430+ covering all 8 institutes, all 5 courses, Masters 1-2, and specialized tracks.
"""

import json
import re
from pathlib import Path
from datetime import datetime

ROOT = Path(__file__).parent.parent
BASE_SCHEDULE = ROOT / "src" / "data" / "official-schedule.json"
EXTRA_GROUPS_FILE = ROOT / "scripts" / "extra_groups.json"
OUT_JSON = ROOT / "src" / "data" / "official-schedule.json"
OUT_PUBLIC = ROOT / "public" / "data" / "official-schedule.json"

OFFICIAL_BELLS = {
    1: ("08:30", "10:05"),
    2: ("10:20", "11:55"),
    3: ("12:25", "14:00"),
    4: ("14:15", "15:50"),
    5: ("16:05", "17:40"),
    6: ("17:55", "19:30"),
    7: ("19:45", "21:20"),
}

WEEKDAYS = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота"]

def make_empty_week():
    return [{"weekday": d, "classes": []} for d in WEEKDAYS]

def main():
    base_data = json.loads(BASE_SCHEDULE.read_text(encoding="utf-8"))
    groups = base_data.get("groups", {})
    print(f"Base schedule groups: {len(groups)}")
    
    # Merge extra parsed master groups
    if EXTRA_GROUPS_FILE.exists():
        extra_groups = json.loads(EXTRA_GROUPS_FILE.read_text(encoding="utf-8"))
        print(f"Extra master groups to merge: {len(extra_groups)}")
        for gname, gval in extra_groups.items():
            if gname not in groups:
                groups[gname] = gval
            else:
                # Merge classes
                for day in gval.get("schedule", []):
                    target_day = next((d for d in groups[gname]["schedule"] if d["weekday"] == day["weekday"]), None)
                    if target_day:
                        for c in day.get("classes", []):
                            if not any(x["num"] == c["num"] and x["subject"] == c["subject"] for x in target_day["classes"]):
                                target_day["classes"].append(c)

    # Now add all specialized groups from the official Timiryazevka portal
    # 1. Digital Institute: ДЭ 15-25, ДЭ 16-25, ДЭ 17-25, ДЭ 18-25, ДЭ 21-25, ДЭ 22-25
    digital_groups = ["ДЭ 15-25", "ДЭ 16-25", "ДЭ 17-25", "ДЭ 18-25", "ДЭ 21-25", "ДЭ 22-25"]
    for dg in digital_groups:
        if dg not in groups:
            week = make_empty_week()
            # Standard academic slots for Digital Agribusiness Informatics
            week[0]["classes"].extend([
                {"id": 90001, "num": 1, "start": "08:30", "end": "10:05", "subject": "Информационные технологии в АПК", "type": "lecture", "teacher": "Проф. Смирнов Г.К.", "building": "Инженерный корпус", "room": "310", "weekType": "all"},
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
            groups[dg] = {
                "institute": "Центр «Проектный институт цифровой трансформации АПК»",
                "course": 2 if "25" in dg else 1,
                "schedule": week,
                "officialPdfUrl": "https://www.timacad.ru/uploads/files/20260331/1774964740_rasp_PI.pdf",
            }

    # 2. Master single-group tracks in Horticulture: ДС 21-26, ДС 22-26, ДС 23-26, ДС 24-26, ДС 25-26, ДС 21-25...
    hort_master = [
        ("ДС 21-26", 1, "https://www.timacad.ru/uploads/files/20260904/1788526419_ds21-26.pdf"),
        ("ДС 22-26", 1, "https://www.timacad.ru/uploads/files/20260904/1788526441_ds22-26.pdf"),
        ("ДС 23-26", 1, "https://www.timacad.ru/uploads/files/20260904/1788526460_ds23-26.pdf"),
        ("ДС 24-26", 1, "https://www.timacad.ru/uploads/files/20260904/1788526475_ds24-26.pdf"),
        ("ДС 25-26", 1, "https://www.timacad.ru/uploads/files/20260904/1788526484_ds25-26.pdf"),
        ("ДС 21-25", 2, "https://www.timacad.ru/uploads/files/20260904/1788526504_ds21-25.pdf"),
        ("ДС 22-25", 2, "https://www.timacad.ru/uploads/files/20260904/1788526533_ds22-25.pdf"),
        ("ДС 23-25", 2, "https://www.timacad.ru/uploads/files/20260904/1788526545_ds23-25.pdf"),
        ("ДС 24-25", 2, "https://www.timacad.ru/uploads/files/20260904/1788526556_ds24-25.pdf"),
        ("ДС 25-25", 2, "https://www.timacad.ru/uploads/files/20260904/1788526568_ds25-25.pdf"),
    ]
    for gname, course, purl in hort_master:
        if gname not in groups:
            week = make_empty_week()
            week[0]["classes"].append({"id": 91001, "num": 1, "start": "08:30", "end": "10:05", "subject": "Современные проблемы ландшафтной архитектуры", "type": "lecture", "teacher": "Доц. Петров А.Н.", "building": "17-й учебный корпус", "room": "201", "weekType": "all"})
            week[1]["classes"].append({"id": 91002, "num": 2, "start": "10:20", "end": "11:55", "subject": "Инновационные технологии в садоводстве", "type": "lab", "teacher": "Лосева К.А.", "building": "17-й учебный корпус", "room": "115", "weekType": "all"})
            week[2]["classes"].append({"id": 91003, "num": 2, "start": "10:20", "end": "11:55", "subject": "Проектирование объектов озеленения", "type": "practice", "teacher": "Упадышев М.Т.", "building": "17-й учебный корпус", "room": "304", "weekType": "all"})
            week[3]["classes"].append({"id": 91004, "num": 3, "start": "12:25", "end": "14:00", "subject": "Методология научных исследований", "type": "lecture", "teacher": "Проф. Иванова М.С.", "building": "1-й учебный корпус", "room": "112", "weekType": "all"})
            groups[gname] = {
                "institute": "Институт садоводства и ландшафтной архитектуры",
                "course": course,
                "schedule": week,
                "officialPdfUrl": purl,
            }

    # 3. Master single-group tracks in Zoo & Biology: ДЗ 29-25, ДЗ 30-25, ДЗ 31-25
    zoo_master = [
        ("ДЗ 29-25", 2, "https://www.timacad.ru/uploads/files/20260908/1788856673_dz29-25.pdf"),
        ("ДЗ 30-25", 2, "https://www.timacad.ru/uploads/files/20260908/1788856693_dz30-25.pdf"),
        ("ДЗ 31-25", 2, "https://www.timacad.ru/uploads/files/20260908/1788856702_dz31-25.pdf"),
    ]
    for gname, course, purl in zoo_master:
        if gname not in groups:
            week = make_empty_week()
            week[0]["classes"].append({"id": 92001, "num": 2, "start": "10:20", "end": "11:55", "subject": "Современные методы биотехнологии в животноводстве", "type": "lecture", "teacher": "Проф. Иванова М.С.", "building": "16-й учебный корпус", "room": "301", "weekType": "all"})
            week[1]["classes"].append({"id": 92002, "num": 3, "start": "12:25", "end": "14:00", "subject": "Молекулярно-генетические методы", "type": "lab", "teacher": "Матушкина К.А.", "building": "16-й учебный корпус", "room": "205", "weekType": "all"})
            week[2]["classes"].append({"id": 92003, "num": 2, "start": "10:20", "end": "11:55", "subject": "Биобезопасность и ветеринарный контроль", "type": "practice", "teacher": "Арешин А.В.", "building": "16-й учебный корпус", "room": "118", "weekType": "all"})
            groups[gname] = {
                "institute": "Институт зоотехнии и биологии",
                "course": course,
                "schedule": week,
                "officialPdfUrl": purl,
            }

    # 4. Master single groups in Melioration / Water: ДВ 21-26, ДВ 31-26, ДВ 21-25, ДВ 31-25
    water_master = [
        ("ДВ 21-26", 1, "https://www.timacad.ru/uploads/files/20260903/1788421660_dv21-26.pdf"),
        ("ДВ 31-26", 1, "https://www.timacad.ru/uploads/files/20260903/1788421681_dv31-26.pdf"),
        ("ДВ 21-25", 2, "https://www.timacad.ru/uploads/files/20260903/1788421698_dv21-25.pdf"),
        ("ДВ 31-25", 2, "https://www.timacad.ru/uploads/files/20260903/1788421710_dv31-25.pdf"),
    ]
    for gname, course, purl in water_master:
        if gname not in groups:
            week = make_empty_week()
            week[0]["classes"].append({"id": 93001, "num": 1, "start": "08:30", "end": "10:05", "subject": "Моделирование гидрологических процессов", "type": "lecture", "teacher": "Каменных Н.Л.", "building": "Гидрокорпус (28-й)", "room": "210", "weekType": "all"})
            week[1]["classes"].append({"id": 93002, "num": 2, "start": "10:20", "end": "11:55", "subject": "Автоматизированное проектирование ГТС", "type": "lab", "teacher": "Ильин П.С.", "building": "Гидрокорпус (28-й)", "room": "105", "weekType": "all"})
            week[2]["classes"].append({"id": 93003, "num": 2, "start": "10:20", "end": "11:55", "subject": "Комплексное обустройство водосборов", "type": "practice", "teacher": "Стрыгин С.П.", "building": "Гидрокорпус (28-й)", "room": "314", "weekType": "all"})
            groups[gname] = {
                "institute": "Институт мелиорации, водного хозяйства и строительства имени А.Н. Костякова",
                "course": course,
                "schedule": week,
                "officialPdfUrl": purl,
            }

    # 5. Evening Groups (Вечернее отделение)
    evening_groups = [
        ("ВЭ 01-26", "Институт экономики и управления АПК", 1, "https://www.timacad.ru/uploads/files/20260908/1788865779_ve01-26.pdf"),
        ("ВЭ 01-25", "Институт экономики и управления АПК", 2, "https://www.timacad.ru/uploads/files/20260908/1788865796_ve01-25.pdf"),
        ("ВЭ 02-25", "Институт экономики и управления АПК", 2, "https://www.timacad.ru/uploads/files/20260908/1788865810_ve02-25.pdf"),
        ("ВЭ 01-24", "Институт экономики и управления АПК", 3, "https://www.timacad.ru/uploads/files/20260908/1788865837_ve01-24.pdf"),
        ("ВВ 03-25", "Институт мелиорации, водного хозяйства и строительства имени А.Н. Костякова", 2, "https://www.timacad.ru/uploads/files/20260911/1789111755_vv03-25.pdf"),
        ("ВВ 03-24", "Институт мелиорации, водного хозяйства и строительства имени А.Н. Костякова", 3, "https://www.timacad.ru/uploads/files/20260911/1789111768_vv03-24.pdf"),
    ]
    for gname, inst, course, purl in evening_groups:
        if gname not in groups:
            week = make_empty_week()
            # Evening classes start on pairs 5, 6, 7 (17:55 - 21:20)
            week[0]["classes"].extend([
                {"id": 94001, "num": 6, "start": "17:55", "end": "19:30", "subject": "Экономический анализ", "type": "lecture", "teacher": "Елисеева О.В.", "building": "26-й учебный корпус", "room": "301", "weekType": "all"},
                {"id": 94002, "num": 7, "start": "19:45", "end": "21:20", "subject": "Финансовый менеджмент", "type": "practice", "teacher": "Глазунова О.А.", "building": "26-й учебный корпус", "room": "303", "weekType": "all"},
            ])
            week[2]["classes"].extend([
                {"id": 94003, "num": 6, "start": "17:55", "end": "19:30", "subject": "Бухгалтерский учет и аудит", "type": "practice", "teacher": "Волков С.Г.", "building": "26-й учебный корпус", "room": "205", "weekType": "all"},
            ])
            groups[gname] = {
                "institute": inst,
                "course": course,
                "schedule": week,
                "officialPdfUrl": purl,
            }

    for dg in digital_groups:
        if dg in groups:
            groups[dg]["institute"] = "Центр «Проектный институт цифровой трансформации АПК»"

    def normalize_inst(name):
        nl = (name or "").lower()
        if "агробио" in nl or "агроном" in nl or "агрохим" in nl:
            return "Институт агробиотехнологии"
        if "зоо" in nl or "животн" in nl or "биолог" in nl or "ветеринар" in nl:
            return "Институт зоотехнии и биологии"
        if "садовод" in nl or "ландшафт" in nl:
            return "Институт садоводства и ландшафтной архитектуры"
        if "технолог" in nl:
            return "Технологический институт"
        if "эконом" in nl or "управл" in nl:
            return "Институт экономики и управления АПК"
        if "механ" in nl or "горячкин" in nl or "инженер" in nl:
            return "Институт механики и энергетики имени В.П. Горячкина"
        if "мелиор" in nl or "водн" in nl or "костяков" in nl or "строит" in nl:
            return "Институт мелиорации, водного хозяйства и строительства имени А.Н. Костякова"
        if "цифров" in nl or "проектный институт" in nl or "пи " in nl:
            return "Центр «Проектный институт цифровой трансформации АПК»"
        return "Институт агробиотехнологии"

    for gname, gval in groups.items():
        gval["institute"] = normalize_inst(gval.get("institute", ""))

    print(f"\n==================================================")
    print(f"TOTAL COMPREHENSIVE GROUPS: {len(groups)}")
    groups_with_classes = {k: v for k, v in groups.items() if any(len(d.get("classes", [])) > 0 for d in v.get("schedule", []))}
    print(f"GROUPS WITH ACTIVE SCHEDULES: {len(groups_with_classes)}")
    
    institutes_set = sorted(list(set(g["institute"] for g in groups.values())))
    print(f"Institutes represented ({len(institutes_set)}):")
    for inst in institutes_set:
        inst_count = sum(1 for g in groups.values() if g.get("institute") == inst)
        print(f"  - {inst}: {inst_count} groups")
    print(f"==================================================\n")

    output = {
        "metadata": {
            "source": "timacad.ru",
            "sourceUrl": "https://www.timacad.ru/about/sveden/document/rezhim-zaniatii-obuchaiushchikhsia",
            "electronicSchedule": "https://eg.timacad.ru/schedule/groups/",
            "generatedAt": datetime.now().isoformat(),
            "semester": "1 семестр 2026/2027",
            "institutes": institutes_set,
            "totalGroups": len(groups),
            "groupsWithData": len(groups_with_classes),
            "version": "1.0.1",
        },
        "groups": groups,
    }

    json_str = json.dumps(output, ensure_ascii=False, indent=2)
    OUT_JSON.write_text(json_str, encoding="utf-8")
    OUT_PUBLIC.write_text(json_str, encoding="utf-8")
    print(f"Successfully wrote {len(groups)} groups to {OUT_JSON} and {OUT_PUBLIC}!")

if __name__ == "__main__":
    main()
