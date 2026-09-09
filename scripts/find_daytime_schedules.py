import re
from pathlib import Path
import json

html_file = Path(r"C:\Users\egorm\.gemini\antigravity\brain\fb82d27b-481c-4f04-b18a-1fb42aad84ff\.system_generated\steps\1635\content.md")
html = html_file.read_text(encoding="utf-8")

target_title = "Расписание занятий студентов дневного отделения на 1 семестр 2026/2027 учебный год"
idx = html.find(target_title)
end_idx = html.find("<h2", idx + len(target_title))
if end_idx == -1:
    end_idx = idx + 45000

section = html[idx:end_idx]

cards = re.split(r'<div class="card">', section)[1:]
result = []

for c_idx, card in enumerate(cards):
    header_m = re.search(r'<div class="card-header"[^>]*>.*?<a[^>]*>(.*?)</a>', card, re.DOTALL)
    inst_name = re.sub(r'\s+', ' ', header_m.group(1)).strip() if header_m else f"Институт {c_idx+1}"
    
    courses = []
    # Find tab list
    tabs = re.findall(r'<span class="nav-link tabs-type-1__tabs-link[^"]*">(.*?)</span>', card)
    # Find pdf links
    pdf_links = re.findall(r'<a\s+href="(/uploads/files/[^"]+\.pdf)"[^>]*>(.*?)</a>\s*(?:&mdash;|-)?\s*([^<\n]+)?', card, re.DOTALL)
    
    for link, link_text, desc in pdf_links:
        desc_clean = re.sub(r'\s+', ' ', desc).strip() if desc else re.sub(r'\s+', ' ', link_text).strip()
        courses.append({
            "url": "https://www.timacad.ru" + link,
            "desc": desc_clean
        })
    
    result.append({
        "institute": inst_name,
        "courses": courses
    })

Path("scripts/all_daytime_pdfs.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"Extracted {len(result)} institutes with all PDF links to scripts/all_daytime_pdfs.json")
for r in result:
    print(f"- {r['institute']}: {len(r['courses'])} PDFs")
