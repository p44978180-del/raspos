#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Unified Automation Pipeline for Timacad Schedule.
Runs the Web Scraper, PDF Table Parser, Pydantic Data Validation,
JSON Dataset Generation, and SQLite Database Export.
"""

import sys
import argparse
from pathlib import Path

# Add scripts directory to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent))

from timacad_scraper import scrape_timacad_schedules
from timacad_parser import run_pdf_parser

def main():
    parser = argparse.ArgumentParser(description="Timacad Automated Schedule Pipeline (PDF to JSON/SQLite)")
    parser.add_argument("--scrape-only", action="store_true", help="Run only the web scraper module")
    parser.add_argument("--parse-only", action="store_true", help="Run only the PDF table parser module")
    args = parser.parse_args()

    print("="*70)
    print("🌾 РГАУ-МСХА ИМ. К.А. ТИМИРЯЗЕВА | ПАЙПЛАЙН РАСПИСАНИЯ (2026/2027)")
    print("="*70)

    if args.scrape_only:
        scrape_timacad_schedules()
        return

    if args.parse_only:
        run_pdf_parser()
        return

    # Full pipeline: Scraper -> Parser -> Validation -> JSON / SQLite export
    print("\n[ЭТАП 1/2] Запуск веб-скрапера расписаний timacad.ru...")
    scrape_timacad_schedules()

    print("\n[ЭТАП 2/2] Запуск парсера PDF (двумерная сетка, недели, подгруппы)...")
    run_pdf_parser()

    print("\n✅ Пайплайн успешно завершен!")

if __name__ == "__main__":
    main()
