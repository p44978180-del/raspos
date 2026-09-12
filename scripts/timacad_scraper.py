#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Web Scraper Module for RGAU-MSHA Timiryazevka Schedule (Timacad)
Stack: requests + BeautifulSoup4 (with graceful local fallback)
Target URL: https://www.timacad.ru/about/sveden/document/rezhim-zaniatii-obuchaiushchikhsia
Filters: Only 2026/2027 academic year schedules (checks headers, link texts, and file metadata).
Hierarchy: downloads/{уровень}/{институт}/{файл}.pdf
Logs: Skipped files, invalid links, and download status to downloads/scraper_log.json.
"""

import os
import sys
import re
import json
import shutil
import urllib.parse
from pathlib import Path
from datetime import datetime
from typing import List, Dict, Any, Optional

import requests
from bs4 import BeautifulSoup
import pdfplumber
import urllib3

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

sys.stdout.reconfigure(encoding='utf-8')

ROOT_DIR = Path(__file__).resolve().parent.parent
DOWNLOADS_DIR = ROOT_DIR / "downloads"
CACHE_DIR = ROOT_DIR / "scripts" / "pdfs_all"
TARGET_URL = "https://www.timacad.ru/about/sveden/document/rezhim-zaniatii-obuchaiushchikhsia"
LOCAL_HTML_CACHE = ROOT_DIR / "scripts" / "rezhim_page.html"
ACADEMIC_YEAR = "2026/2027"

REQ_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7",
}

INSTITUTE_ALIASES = {
    "ИНСТИТУТ АГРОБИОТЕХНОЛОГИИ": "Институт агробиотехнологии",
    "ИНСТИТУТ ЗООТЕХНИИ И БИОЛОГИИ": "Институт зоотехнии и биологии",
    "ИНСТИТУТ САДОВОДСТВА И ЛАНДШАФТНОЙ АРХИТЕКТУРЫ": "Институт садоводства и ландшафтной архитектуры",
    "ТЕХНОЛОГИЧЕСКИЙ ИНСТИТУТ": "Технологический институт",
    "ИНСТИТУТ ЭКОНОМИКИ И УПРАВЛЕНИЯ АПК": "Институт экономики и управления АПК",
    "ИНСТИТУТ МЕХАНИКИ И ЭНЕРГЕТИКИ ИМЕНИ В.П. ГОРЯЧКИНА": "Институт механики и энергетики имени В.П. Горячкина",
    "ИНСТИТУТ МЕЛИОРАЦИИ, ВОДНОГО ХОЗЯЙСТВА И СТРОИТЕЛЬСТВА ИМЕНИ А.Н. КОСТЯКОВА": "Институт мелиорации, водного хозяйства и строительства имени А.Н. Костякова",
    "ПРОЕКТНЫЙ ИНСТИТУТ ЦИФРОВОЙ ТРАНСФОРМАЦИИ": "Центр «Проектный институт цифровой трансформации АПК»",
}

def sanitize_folder_name(name: str) -> str:
    cleaned = re.sub(r'[\\/*?:"<>|]', '', name).strip()
    return re.sub(r'\s+', ' ', cleaned)

def normalize_institute_name(raw_name: str) -> str:
    clean = re.sub(r'\s+', ' ', raw_name).strip()
    clean = re.sub(r'^[0-9]+\.\s*', '', clean)
    clean_upper = clean.upper()
    for alias, canonical in INSTITUTE_ALIASES.items():
        if alias in clean_upper:
            return canonical
    return clean

def fetch_page_html(url: str = TARGET_URL) -> str:
    """Fetch live schedule page with requests and fallback to local cache."""
    print(f"[Scraper] Connecting to target URL via requests: {url}...")
    try:
        session = requests.Session()
        session.headers.update(REQ_HEADERS)
        resp = session.get(url, timeout=15, verify=False)
        resp.raise_for_status()
        resp.encoding = resp.apparent_encoding or "utf-8"
        html_text = resp.text
        print(f"[Scraper] Successfully retrieved live page ({len(html_text)} chars).")
        LOCAL_HTML_CACHE.write_text(html_text, encoding="utf-8")
        return html_text
    except Exception as err:
        print(f"[Scraper] Live network request failed ({err}). Checking local cache...")
        if LOCAL_HTML_CACHE.exists():
            html_text = LOCAL_HTML_CACHE.read_text(encoding="utf-8")
            print(f"[Scraper] Using cached HTML file from {LOCAL_HTML_CACHE} ({len(html_text)} chars).")
            return html_text
        raise RuntimeError(f"Unable to retrieve schedule page from network or cache: {err}")

def verify_pdf_metadata(dest_path: Path) -> bool:
    """Inspects PDF metadata and structure to ensure file is non-empty and valid."""
    if not dest_path.exists() or dest_path.stat().st_size < 1000:
        return False
    try:
        with pdfplumber.open(str(dest_path)) as pdf:
            if not pdf.pages or len(pdf.pages) == 0:
                return False
            # PDF is readable and has valid pages
            return True
    except Exception:
        return False

def download_pdf_file(url: str, dest_path: Path) -> bool:
    """Download PDF file with requests streaming and fallback to local cache."""
    dest_path.parent.mkdir(parents=True, exist_ok=True)

    # 1. If file already exists, is valid size and readable PDF, skip
    if dest_path.exists() and dest_path.stat().st_size > 1000:
        if verify_pdf_metadata(dest_path):
            return True

    filename = dest_path.name
    # 2. Check if local cache has this file
    if CACHE_DIR.exists():
        for cached_file in CACHE_DIR.glob("*.pdf"):
            if cached_file.name == filename or filename in cached_file.name:
                shutil.copy2(cached_file, dest_path)
                if verify_pdf_metadata(dest_path):
                    return True

    # 3. Download via requests HTTP session
    try:
        parsed = urllib.parse.urlparse(url)
        encoded_path = urllib.parse.quote(parsed.path, safe='/')
        clean_url = urllib.parse.urlunparse(parsed._replace(path=encoded_path))

        session = requests.Session()
        session.headers.update(REQ_HEADERS)
        with session.get(clean_url, timeout=30, verify=False, stream=True) as resp:
            resp.raise_for_status()
            with open(dest_path, "wb") as f:
                for chunk in resp.iter_content(chunk_size=16384):
                    if chunk:
                        f.write(chunk)

        if verify_pdf_metadata(dest_path):
            return True
        else:
            print(f"    [Scraper] Corrupted PDF downloaded for {url}")
            return False
    except Exception as err:
        print(f"    [Scraper] Download error for {url}: {err}")
        return False

def scrape_timacad_schedules(html_content: Optional[str] = None) -> Dict[str, Any]:
    """
    Main scraper execution:
    Parses HTML with BeautifulSoup4, traverses accordion blocks and tabs,
    filters 2026/2027 academic year schedules, downloads PDFs to structured dirs,
    and logs skipped files and errors.
    """
    if not html_content:
        html_content = fetch_page_html(TARGET_URL)

    DOWNLOADS_DIR.mkdir(parents=True, exist_ok=True)
    soup = BeautifulSoup(html_content, "html.parser")

    manifest_entries = []
    skipped_entries = []
    downloaded_count = 0
    failed_count = 0

    print(f"\n[Scraper] Parsing HTML sections with BeautifulSoup for academic year {ACADEMIC_YEAR}...")

    # Find structure sections
    sections = soup.find_all("section", class_=lambda c: c and "content__block--structure" in c)

    for s_idx, sec in enumerate(sections):
        prev_h2 = sec.find_previous("h2")
        if not prev_h2:
            continue

        h2_text = re.sub(r'\s+', ' ', prev_h2.get_text()).strip()

        # Filter condition: Only 2026/2027 academic year
        if ACADEMIC_YEAR not in h2_text and "2026-2027" not in h2_text:
            skipped_links = sec.find_all("a", href=lambda h: h and h.endswith(".pdf"))
            skipped_entries.append({
                "sectionTitle": h2_text,
                "reason": f"Excluded: not {ACADEMIC_YEAR} academic year",
                "skippedPdfsCount": len(skipped_links),
            })
            continue

        # Level determination
        h2_lower = h2_text.lower()
        if "магистр" in h2_lower:
            level = "Магистратура"
        elif "очно-заочн" in h2_lower or "вечерн" in h2_lower:
            level = "Очно-заочное"
        elif "бакалавр" in h2_lower or "дневн" in h2_lower:
            level = "Бакалавриат"
        else:
            level = "Бакалавриат"

        # Find all cards/institutes within this section
        for header in sec.find_all(class_=lambda c: c and "card-header" in c):
            raw_inst = header.get_text(strip=True)
            card = header.find_parent(class_=lambda c: c and "card" in c)
            if not card:
                continue

            inst_name = normalize_institute_name(raw_inst)
            inst_folder = sanitize_folder_name(inst_name)

            # Find all PDF links inside this institute block
            pdf_links = card.find_all("a", href=lambda h: h and h.endswith(".pdf"))

            for link_el in pdf_links:
                href = link_el.get("href", "")
                link_text = re.sub(r'\s+', ' ', link_el.get_text()).strip()

                # Get description from adjacent text or parent text
                parent_text = re.sub(r'\s+', ' ', link_el.parent.get_text()).strip() if link_el.parent else ""
                clean_desc = link_text or parent_text

                full_url = urllib.parse.urljoin("https://www.timacad.ru", href)
                raw_file_name = Path(urllib.parse.unquote(href)).name

                target_dest = DOWNLOADS_DIR / level / inst_folder / raw_file_name

                ok = download_pdf_file(full_url, target_dest)
                if ok:
                    downloaded_count += 1
                    status = "downloaded"
                else:
                    failed_count += 1
                    status = "failed"
                    skipped_entries.append({
                        "url": full_url,
                        "level": level,
                        "institute": inst_name,
                        "reason": "Download error, broken link, or invalid PDF metadata",
                    })

                manifest_entries.append({
                    "level": level,
                    "institute": inst_name,
                    "url": full_url,
                    "description": clean_desc,
                    "localPath": str(target_dest.relative_to(ROOT_DIR)).replace("\\", "/"),
                    "filename": raw_file_name,
                    "status": status,
                    "section": h2_text,
                })

    log_data = {
        "timestamp": datetime.now().isoformat(),
        "targetUrl": TARGET_URL,
        "academicYear": ACADEMIC_YEAR,
        "parserEngine": "requests + BeautifulSoup4",
        "summary": {
            "totalDiscoveredPdfs": len(manifest_entries),
            "downloaded": downloaded_count,
            "failed": failed_count,
            "skippedSectionsCount": len(skipped_entries),
        },
        "downloads": manifest_entries,
        "skipped": skipped_entries,
    }

    log_path = DOWNLOADS_DIR / "scraper_log.json"
    log_path.write_text(json.dumps(log_data, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"\n[Scraper Summary]")
    print(f"  Total valid 2026/2027 files: {len(manifest_entries)}")
    print(f"  Successfully verified:      {downloaded_count}")
    print(f"  Failed / Invalid links:     {failed_count}")
    print(f"  Scraper log saved to:       {log_path}")
    return log_data

if __name__ == "__main__":
    scrape_timacad_schedules()
