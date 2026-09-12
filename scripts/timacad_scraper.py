#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Web Scraper Module for RGAU-MSHA Timiryazevka Schedule (Timacad)
Target URL: https://www.timacad.ru/about/sveden/document/rezhim-zaniatii-obuchaiushchikhsia
Filters: Only 2026/2027 academic year schedules.
Hierarchy: downloads/{уровень}/{институт}/{файл}.pdf
Logs: Skipped files, invalid links, and download status to downloads/scraper_log.json.
"""

import os
import sys
import re
import json
import ssl
import urllib.request
import urllib.parse
import urllib.error
import shutil
from pathlib import Path
from datetime import datetime
from typing import List, Dict, Any, Optional

sys.stdout.reconfigure(encoding='utf-8')

ROOT_DIR = Path(__file__).resolve().parent.parent
DOWNLOADS_DIR = ROOT_DIR / "downloads"
CACHE_DIR = ROOT_DIR / "scripts" / "pdfs_all"
TARGET_URL = "https://www.timacad.ru/about/sveden/document/rezhim-zaniatii-obuchaiushchikhsia"
LOCAL_HTML_CACHE = ROOT_DIR / "scripts" / "rezhim_page.html"
ACADEMIC_YEAR = "2026/2027"

# Standard headers to avoid blocking
REQ_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7",
}

# Canonical institute names
INSTITUTE_ALIASES = {
    "ИНСТИТУТ АГРОБИОТЕХНОЛОГИИ": "Институт агробиотехнологии",
    "ИНСТИТУТ ЗООТЕХНИИ И БИОЛОГИИ": "Институт зоотехнии и биологии",
    "ИНСТИТУТ САДОВОДСТВА И ЛАНДШАФТНОЙ АРХИТЕКТУРЫ": "Институт садоводства и ландшафтной архитектуры",
    "ТЕХНОЛОГИЧЕСКИЙ ИНСТИТУТ": "Технологический институт",
    "ИНСТИТУТ ЭКОНОМИКИ И УПРАВЛЕНИЯ АПК": "Институт экономики и управления АПК",
    "ИНСТИТУТ МЕХАНИКИ И ЭНЕРГЕТИКИ ИМЕНИ В.П. ГОРЯЧКИНА": "Институт механики и энергетики имени В.П. Горячкина",
    "ИНСТИТУТ МЕЛИОРАЦИИ, ВОДНОГО ХОЗЯЙСТВА И СТРОИТЕЛЬСТВА ИМЕНИ А.Н. КОСТЯКОВА": "Институт мелиорации, водного хозяйства и строительства имени А.Н. Костякова",
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
    """Fetch live schedule page with fallback to local cache."""
    print(f"[Scraper] Connecting to target URL: {url}...")
    try:
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        req = urllib.request.Request(url, headers=REQ_HEADERS)
        with urllib.request.urlopen(req, timeout=15, context=ctx) as resp:
            content = resp.read()
            html_text = content.decode("utf-8", errors="replace")
            print(f"[Scraper] Successfully retrieved live page ({len(html_text)} chars).")
            # Cache locally
            LOCAL_HTML_CACHE.write_text(html_text, encoding="utf-8")
            return html_text
    except Exception as err:
        print(f"[Scraper] Live network request failed ({err}). Checking local cache...")
        if LOCAL_HTML_CACHE.exists():
            html_text = LOCAL_HTML_CACHE.read_text(encoding="utf-8")
            print(f"[Scraper] Using cached HTML file from {LOCAL_HTML_CACHE} ({len(html_text)} chars).")
            return html_text
        raise RuntimeError(f"Unable to retrieve schedule page from network or cache: {err}")

def download_pdf_file(url: str, dest_path: Path) -> bool:
    """Download PDF file with streaming and fallback to local cache."""
    dest_path.parent.mkdir(parents=True, exist_ok=True)
    
    # 1. If file already exists and valid size (> 1KB), skip
    if dest_path.exists() and dest_path.stat().st_size > 1000:
        return True
        
    filename = dest_path.name
    # 2. Check if local cache has this file
    if CACHE_DIR.exists():
        for cached_file in CACHE_DIR.glob("*.pdf"):
            if cached_file.name == filename or filename in cached_file.name:
                shutil.copy2(cached_file, dest_path)
                return True
                
    # 3. Download via HTTP
    try:
        parsed = urllib.parse.urlparse(url)
        encoded_path = urllib.parse.quote(parsed.path, safe='/')
        clean_url = urllib.parse.urlunparse(parsed._replace(path=encoded_path))
        
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        req = urllib.request.Request(clean_url, headers=REQ_HEADERS)
        with urllib.request.urlopen(req, timeout=30, context=ctx) as resp:
            data = resp.read()
            if len(data) > 500:
                dest_path.write_bytes(data)
                return True
    except Exception as err:
        print(f"    [Scraper] Download error for {url}: {err}")
        return False
    return False

def scrape_timacad_schedules(html_content: Optional[str] = None) -> Dict[str, Any]:
    """
    Main scraper execution:
    Parses HTML, applies academic year filters, downloads PDFs to structured dirs.
    """
    if not html_content:
        html_content = fetch_page_html(TARGET_URL)
        
    DOWNLOADS_DIR.mkdir(parents=True, exist_ok=True)
    
    # Parse section blocks
    h2_splits = re.split(r'(?=<h2)', html_content)
    
    manifest_entries = []
    skipped_entries = []
    downloaded_count = 0
    failed_count = 0
    
    print(f"\n[Scraper] Parsing HTML sections for academic year {ACADEMIC_YEAR}...")
    
    for s_idx, sec in enumerate(h2_splits):
        h2_m = re.search(r'<h2[^>]*>(.*?)</h2>', sec, re.DOTALL)
        if not h2_m:
            continue
            
        h2_text = re.sub(r'\s+', ' ', h2_m.group(1)).strip()
        
        # Filter condition: Only 2026/2027
        if ACADEMIC_YEAR not in h2_text and "2026-2027" not in h2_text:
            links_in_skipped = re.findall(r'<a\s+href="([^"]+\.pdf)"[^>]*>(.*?)</a>', sec, re.DOTALL)
            skipped_entries.append({
                "sectionTitle": h2_text,
                "reason": f"Excluded: not {ACADEMIC_YEAR} academic year",
                "skippedPdfsCount": len(links_in_skipped)
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

        # Find accordion cards / institute blocks
        cards = re.split(r'<div class="card">', sec)[1:]
        if not cards:
            cards = [sec]
            
        for c_idx, card in enumerate(cards):
            header_m = re.search(r'<div class="card-header"[^>]*>.*?<a[^>]*>(.*?)</a>', card, re.DOTALL)
            if header_m:
                raw_inst = re.sub(r'\s+', ' ', header_m.group(1)).strip()
            else:
                h_sub = re.search(r'<h[34][^>]*>(.*?)</h[34]>', card, re.DOTALL)
                raw_inst = re.sub(r'\s+', ' ', h_sub.group(1)).strip() if h_sub else f"Институт_{c_idx+1}"
                
            inst_name = normalize_institute_name(raw_inst)
            inst_folder = sanitize_folder_name(inst_name)
            
            # Find PDF links
            pdf_links = re.findall(r'<a\s+href="([^"]+\.pdf)"[^>]*>(.*?)</a>\s*(?:&mdash;|-)?\s*([^<\n]+)?', card, re.DOTALL)
            
            for link, link_text, desc in pdf_links:
                clean_link_text = re.sub(r'\s+', ' ', link_text).strip()
                clean_desc = re.sub(r'\s+', ' ', desc).strip() if desc else clean_link_text
                
                full_url = urllib.parse.urljoin("https://www.timacad.ru", link)
                raw_file_name = Path(urllib.parse.unquote(link)).name
                
                # Target path: downloads/{уровень}/{институт}/{файл}.pdf
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
                        "reason": "Download error or broken link"
                    })
                    
                manifest_entries.append({
                    "level": level,
                    "institute": inst_name,
                    "url": full_url,
                    "description": clean_desc,
                    "localPath": str(target_dest.relative_to(ROOT_DIR)).replace("\\", "/"),
                    "filename": raw_file_name,
                    "status": status,
                    "section": h2_text
                })

    log_data = {
        "timestamp": datetime.now().isoformat(),
        "targetUrl": TARGET_URL,
        "academicYear": ACADEMIC_YEAR,
        "summary": {
            "totalDiscoveredPdfs": len(manifest_entries),
            "downloaded": downloaded_count,
            "failed": failed_count,
            "skippedSectionsCount": len(skipped_entries)
        },
        "downloads": manifest_entries,
        "skipped": skipped_entries
    }
    
    log_path = DOWNLOADS_DIR / "scraper_log.json"
    log_path.write_text(json.dumps(log_data, ensure_ascii=False, indent=2), encoding="utf-8")
    
    print(f"\n[Scraper Summary]")
    print(f"  Total valid 2026/2027 files: {len(manifest_entries)}")
    print(f"  Successfully saved:         {downloaded_count}")
    print(f"  Failed / Invalid links:     {failed_count}")
    print(f"  Scraper log saved to:       {log_path}")
    return log_data

if __name__ == "__main__":
    scrape_timacad_schedules()
