import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// Global DOM mocks for PDF.js inside Node.js
if (typeof globalThis.document === 'undefined') {
  globalThis.document = {
    createElement: () => ({ getContext: () => null, style: {} }),
    getElementsByTagName: () => [],
    head: { appendChild: () => {} },
  };
  globalThis.window = globalThis;
}

const OFFICIAL_URL = 'https://www.timacad.ru/about/sveden/document/rezhim-zaniatii-obuchaiushchikhsia';
const MAIN_URL = 'https://www.timacad.ru/';
const DATA_DIR = 'src/data';
const PUBLIC_DATA_DIR = 'public/data';
const CACHE_DIR = 'cache_pdfs';

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(PUBLIC_DATA_DIR)) fs.mkdirSync(PUBLIC_DATA_DIR, { recursive: true });
if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });

// Ensure CJS versions of legacy PDF.js exist for Node execution
const cjsScriptPath = path.resolve('scripts/pdf.legacy.cjs');
const cjsWorkerPath = path.resolve('scripts/pdf.worker.legacy.cjs');
if (!fs.existsSync(cjsScriptPath) && fs.existsSync('public/vendor/pdf.legacy.js')) {
  fs.copyFileSync('public/vendor/pdf.legacy.js', cjsScriptPath);
}
if (!fs.existsSync(cjsWorkerPath) && fs.existsSync('public/vendor/pdf.worker.legacy.js')) {
  fs.copyFileSync('public/vendor/pdf.worker.legacy.js', cjsWorkerPath);
}

const pdfjsLib = require(cjsScriptPath);
pdfjsLib.GlobalWorkerOptions.workerSrc = cjsWorkerPath;

export const OFFICIAL_BELLS = {
  1: { start: '08:30', end: '10:05' },
  2: { start: '10:20', end: '11:55' },
  3: { start: '12:25', end: '14:00' },
  4: { start: '14:15', end: '15:50' },
  5: { start: '16:05', end: '17:40' },
  6: { start: '17:55', end: '19:30' },
  7: { start: '19:45', end: '21:20' },
};

export const BELL_TIMES = [
  { num: 1, start: '08:30', end: '10:05', label: '1-я пара' },
  { num: 2, start: '10:20', end: '11:55', label: '2-я пара' },
  { num: 3, start: '12:25', end: '14:00', label: '3-я пара' },
  { num: 4, start: '14:15', end: '15:50', label: '4-я пара' },
  { num: 5, start: '16:05', end: '17:40', label: '5-я пара' },
  { num: 6, start: '17:55', end: '19:30', label: '6-я пара' },
  { num: 7, start: '19:45', end: '21:20', label: '7-я пара' },
];

export const BREAKS = [
  { afterNum: 1, durationMin: 15, name: 'Перерыв между 1 и 2 парами' },
  { afterNum: 2, durationMin: 30, name: 'Большой обеденный перерыв (30 мин)' },
  { afterNum: 3, durationMin: 15, name: 'Перерыв между 3 и 4 парами' },
  { afterNum: 4, durationMin: 15, name: 'Перерыв между 4 и 5 парами' },
  { afterNum: 5, durationMin: 15, name: 'Перерыв между 5 и 6 парами' },
  { afterNum: 6, durationMin: 15, name: 'Перерыв между 6 и 7 парами' },
];

export const TIMACAD_INSTITUTES = [
  { id: 'agrobio', name: 'Институт агробиотехнологии', short: 'Агробио' },
  { id: 'zoobio', name: 'Институт зоотехнии и биологии', short: 'Зоовет' },
  { id: 'horticulture', name: 'Институт садоводства и ландшафтной архитектуры', short: 'Садоводство' },
  { id: 'tech', name: 'Технологический институт', short: 'Технолог' },
  { id: 'econ', name: 'Институт экономики и управления АПК', short: 'Эконом' },
  { id: 'mechanics', name: 'Институт механики и энергетики им. В.П. Горячкина', short: 'Инженерия' },
  { id: 'water', name: 'Институт мелиорации, водного хозяйства и строительства им. А.Н. Костякова', short: 'Мелиорация' },
];

export const BUILDING_NAMES = {
  '01': '1-й учебный корпус',
  '02': '2-й учебный корпус',
  '03': '3-й учебный корпус',
  '04': '4-й учебный корпус',
  '06': 'Корпус агрохимии (6-й)',
  '09': '9-й учебный корпус',
  '12': '12-й учебный корпус',
  '16': 'Биологический корпус (16-й)',
  '17': '17-й корпус (Почвенно-агрономический)',
  '18': '18-й корпус (Метеорологический)',
  '27': '27-й корпус (Лингвистический центр)',
  '28': 'Инженерный корпус (28-й)',
  '29': '29-й корпус (Цифровой центр)',
  '37': '37-й корпус (Биотехнология)',
  'СК': 'Спортивный комплекс',
};

const WEEKDAYS = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];

/**
 * Spatial PDF Parser that reconstructs Timiryazevka table layouts
 */
export async function parsePdfBuffer(buffer, instituteName = 'Институт агробиотехнологии') {
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buffer), disableFontFace: true }).promise;
  const groupsResult = {};

  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    const page = await doc.getPage(pageNum);
    const tc = await page.getTextContent();
    const rawItems = tc.items.map(i => ({
      str: String(i.str || '').trim(),
      x: Number(i.transform?.[4] || 0),
      y: Number(i.transform?.[5] || 0),
      w: Number(i.width || 0),
      h: Number(i.height || 10),
    })).filter(i => i.str.length > 0);

    // 1. Detect Group Header columns (top of table)
    const groupItems = rawItems.filter(i => /^[Дд][А-Яа-я]\s*\d{2}-\d{2}$/.test(i.str) && i.y > 580);
    groupItems.sort((a, b) => a.x - b.x);

    if (groupItems.length === 0) continue;

    // Calculate column horizontal spans
    const columns = [];
    for (let i = 0; i < groupItems.length; i++) {
      const g = groupItems[i];
      const prevX = i > 0 ? groupItems[i - 1].x : g.x - 70;
      const nextX = i < groupItems.length - 1 ? groupItems[i + 1].x : g.x + 78;
      const left = (g.x + prevX) / 2;
      const right = (g.x + nextX) / 2;
      const normName = g.str.replace(/\s+/g, ' ').toUpperCase();
      columns.push({
        groupName: normName,
        centerX: g.x,
        left,
        right,
      });

      if (!groupsResult[normName]) {
        const course = normName.includes('-26') ? 1 : normName.includes('-25') ? 2 : normName.includes('-24') ? 3 : 4;
        groupsResult[normName] = {
          institute: instituteName,
          course,
          schedule: WEEKDAYS.map(w => ({ weekday: w, classes: [] })),
        };
      }
    }

    // 2. Detect Time rows (e.g. "09.00-", "10.55-")
    const timeItems = rawItems.filter(i => /^\d{2}\.\d{2}/.test(i.str));
    const timeRowYs = [];
    for (const t of timeItems) {
      if (!timeRowYs.some(y => Math.abs(y - t.y) <= 5)) {
        timeRowYs.push(t.y);
      }
    }
    timeRowYs.sort((a, b) => b - a);

    const pairsPerDay = 5;
    const timeSlots = [];
    for (let idx = 0; idx < timeRowYs.length; idx++) {
      const y = timeRowYs[idx];
      const dayIdx = Math.floor(idx / pairsPerDay);
      const pairNum = (idx % pairsPerDay) + 1;
      const nextY = idx < timeRowYs.length - 1 ? timeRowYs[idx + 1] : y - 22;
      const rowHeight = Math.max(18, y - nextY);
      timeSlots.push({
        dayIdx,
        pairNum,
        topY: y + 8,
        bottomY: y - rowHeight + 8,
        midY: y - rowHeight / 2 + 8,
      });
    }

    let nextClassId = 1000 + pageNum * 500;

    // 3. Populate cells for each group
    for (const col of columns) {
      const groupData = groupsResult[col.groupName];
      if (!groupData) continue;

      for (const slot of timeSlots) {
        if (slot.dayIdx >= WEEKDAYS.length) continue;
        const weekday = WEEKDAYS[slot.dayIdx];
        const daySchedule = groupData.schedule.find(d => d.weekday === weekday);
        if (!daySchedule) continue;

        const cellItems = rawItems.filter(item => {
          const inY = item.y <= slot.topY && item.y >= slot.bottomY;
          if (!inY) return false;
          const inX = item.x >= col.left && item.x <= col.right;
          const spansOver = (item.w > 80 && item.x <= col.centerX && (item.x + item.w) >= col.centerX);
          return inX || spansOver;
        });

        if (cellItems.length === 0) continue;

        const upperItems = cellItems.filter(i => i.y >= slot.midY);
        const lowerItems = cellItems.filter(i => i.y < slot.midY);

        function buildClass(items, weekType) {
          const textJoined = items.map(i => i.str).join(' ');
          if (textJoined.trim().length < 2) return null;

          let type = 'practice';
          if (/лек\./i.test(textJoined)) type = 'lecture';
          else if (/лаб\./i.test(textJoined)) type = 'lab';
          else if (/пр\./i.test(textJoined) || /КпоВ/i.test(textJoined)) type = 'practice';

          let cleanSubj = textJoined;
          const subjMatch = textJoined.match(/(?:лек\.|пр\.|лаб\.)\s*([^А-ЯЁ\d]{0,4}[А-ЯЁа-яё\s:()\-–—]+?)(?=\s+[А-ЯЁ][а-яё]+\s+[А-ЯЁ]\.|\s+[А-ЯЁ]{2,}\s+[А-ЯЁ]\.|\s+\d{2}-|\s+СК|\s+Стадион|$)/);
          if (subjMatch) {
            cleanSubj = subjMatch[1].trim();
          } else if (/КпоВ/i.test(textJoined)) {
            cleanSubj = 'КпоВ: Базовые виды спорта / Физическая культура';
            type = 'practice';
          }

          cleanSubj = cleanSubj.replace(/^(?:лек\.|пр\.|лаб\.)\s*/i, '').trim();
          if (cleanSubj.length > 55) {
            cleanSubj = cleanSubj.slice(0, 55).trim();
          }
          if (!cleanSubj || cleanSubj.length < 3) cleanSubj = textJoined.slice(0, 30);

          let teacher = 'Преподаватель кафедры';
          const teacherMatch = textJoined.match(/([А-ЯЁ][а-яё]+|[А-ЯЁ]{2,})\s+([А-ЯЁ]\.\s*[А-ЯЁ]\.?)/);
          if (teacherMatch) {
            teacher = `${teacherMatch[1]} ${teacherMatch[2]}`.trim();
          }

          let room = 'Аудитория уточняется';
          let building = '1-й учебный корпус';
          const roomMatch = textJoined.match(/(\d{2}|\d{1,2}\s*\([^)]+\)|СК|Стадион)\s*[-–]\s*([0-9А-Яа-я\s]+|Планетарий\s*\d+|БХ|БАн|БП|ИЦ\s*\d+)/) ||
                            textJoined.match(/\b(\d{2})[-–]([0-9А-Яа-я]+)\b/) ||
                            (textJoined.includes('СК') ? ['СК', 'СК', 'СК Зал'] : null);
          if (roomMatch) {
            const rawBldg = roomMatch[1].trim();
            const rawRoom = roomMatch[2] ? roomMatch[2].trim() : '';
            const bldgCode = rawBldg.match(/\d{2}/)?.[0] || (rawBldg.includes('СК') ? 'СК' : '01');
            building = BUILDING_NAMES[bldgCode] || `${bldgCode}-й учебный корпус`;
            room = rawRoom || rawBldg;
          } else if (textJoined.includes('СК')) {
            building = 'Спортивный комплекс';
            room = 'СК Зал';
          }

          const bells = OFFICIAL_BELLS[slot.pairNum] || { start: '09:00', end: '10:35' };

          return {
            id: nextClassId++,
            num: slot.pairNum,
            start: bells.start,
            end: bells.end,
            subject: cleanSubj,
            type,
            teacher,
            building,
            room,
            weekType,
          };
        }

        const hasUpperType = upperItems.some(i => /(?:лек\.|пр\.|лаб\.|КпоВ)/.test(i.str));
        const hasLowerType = lowerItems.some(i => /(?:лек\.|пр\.|лаб\.|КпоВ)/.test(i.str));

        if (hasUpperType && hasLowerType) {
          const upperCls = buildClass(upperItems, 'odd');
          const lowerCls = buildClass(lowerItems, 'even');
          if (upperCls) daySchedule.classes.push(upperCls);
          if (lowerCls) daySchedule.classes.push(lowerCls);
        } else {
          const singleCls = buildClass(cellItems, 'all');
          if (singleCls) daySchedule.classes.push(singleCls);
        }
      }
    }
  }

  return groupsResult;
}

/**
 * Main Daily Sync Runner
 */
async function sync() {
  console.log('════════════════════════════════════════════════════════════════════');
  console.log('[Timacad Sync Engine] Starting daily schedule synchronization...');
  console.log(`Source Portal: ${OFFICIAL_URL}`);
  console.log(`Main Site:     ${MAIN_URL}`);
  console.log('════════════════════════════════════════════════════════════════════');

  // Attempt to fetch fresh page HTML from timacad.ru
  let html = '';
  try {
    const res = await fetch(OFFICIAL_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      signal: AbortSignal.timeout(10000),
    });
    if (res.ok) {
      html = await res.text();
      console.log(`[Timacad Sync Engine] Successfully retrieved official schedule page (${html.length} bytes).`);
    } else {
      console.warn(`[Timacad Sync Engine] HTTP ${res.status} from ${OFFICIAL_URL}. Falling back to cached PDFs.`);
    }
  } catch (err) {
    console.warn(`[Timacad Sync Engine] Network fetch warning: ${err.message}. Using cached documents.`);
  }

  // Find all PDF links
  const pdfLinks = [];
  if (html) {
    const hrefRegex = /href="(\/uploads\/files\/[^"]+\.pdf)"/g;
    let match;
    while ((match = hrefRegex.exec(html)) !== null) {
      pdfLinks.push('https://www.timacad.ru' + match[1]);
    }
  }

  // Map of primary PDFs to download or inspect
  const targetPdfs = [
    {
      url: 'https://www.timacad.ru/uploads/files/20260902/1788357517_1%20%D0%BA%D1%83%D1%80%D1%81.pdf',
      fallbackFile: path.join(CACHE_DIR, 'agro_1kurs.pdf'),
      institute: 'Институт агробиотехнологии',
    },
    {
      url: 'https://www.timacad.ru/uploads/files/20260902/1788357544_1%20%D0%BA%D1%83%D1%80%D1%81.pdf',
      fallbackFile: path.join(CACHE_DIR, 'zoo_1kurs.pdf'),
      institute: 'Институт зоотехнии и биологии',
    },
    {
      url: 'https://www.timacad.ru/uploads/files/20260902/1788357523_2%20%D0%BA%D1%83%D1%80%D1%81.pdf',
      fallbackFile: path.join(CACHE_DIR, 'sad_1kurs.pdf'),
      institute: 'Институт садоводства и ландшафтной архитектуры',
    },
  ];

  const allGroups = {};

  for (const item of targetPdfs) {
    let pdfBuffer = null;

    // Try downloading live PDF
    try {
      console.log(`[Timacad Sync Engine] Fetching PDF: ${item.url}`);
      const pdfRes = await fetch(item.url, { signal: AbortSignal.timeout(10000) });
      if (pdfRes.ok) {
        const ab = await pdfRes.arrayBuffer();
        pdfBuffer = Buffer.from(ab);
        fs.writeFileSync(item.fallbackFile, pdfBuffer);
        console.log(`[Timacad Sync Engine] Downloaded & updated ${item.fallbackFile} (${pdfBuffer.length} bytes).`);
      }
    } catch (e) {
      console.warn(`[Timacad Sync Engine] Could not download ${item.url}: ${e.message}`);
    }

    // Use cached fallback if download didn't happen
    if (!pdfBuffer && fs.existsSync(item.fallbackFile)) {
      console.log(`[Timacad Sync Engine] Using cached PDF file: ${item.fallbackFile}`);
      pdfBuffer = fs.readFileSync(item.fallbackFile);
    } else if (!pdfBuffer && fs.existsSync('sample_schedule.pdf')) {
      console.log(`[Timacad Sync Engine] Using sample_schedule.pdf as fallback`);
      pdfBuffer = fs.readFileSync('sample_schedule.pdf');
    }

    if (pdfBuffer) {
      try {
        const parsed = await parsePdfBuffer(pdfBuffer, item.institute);
        const groupCount = Object.keys(parsed).length;
        console.log(`[Timacad Sync Engine] Parsed ${groupCount} groups from ${item.institute}.`);
        Object.assign(allGroups, parsed);
      } catch (err) {
        console.error(`[Timacad Sync Engine] Error parsing PDF for ${item.institute}:`, err);
      }
    }
  }

  // Ensure root sample_schedule.pdf groups are merged if missing
  if (fs.existsSync('sample_schedule.pdf')) {
    try {
      const sampleBuf = fs.readFileSync('sample_schedule.pdf');
      const sampleParsed = await parsePdfBuffer(sampleBuf, 'Институт агробиотехнологии');
      for (const [k, v] of Object.entries(sampleParsed)) {
        if (!allGroups[k] || allGroups[k].schedule.every(d => d.classes.length === 0)) {
          allGroups[k] = v;
        }
      }
    } catch (e) {}
  }

  const groupKeys = Object.keys(allGroups);
  const totalClasses = Object.values(allGroups).reduce((sum, g) => {
    return sum + g.schedule.reduce((s, d) => s + d.classes.length, 0);
  }, 0);

  const finalData = {
    meta: {
      university: 'РГАУ-МСХА имени К.А. Тимирязева',
      sourceUrl: OFFICIAL_URL,
      lastSyncTime: new Date().toISOString(),
      semester: '1 семестр 2026/2027 учебный год',
      syncInterval: 'Daily at 04:00 MSK (01:00 UTC)',
      totalGroups: groupKeys.length,
      totalClasses,
      oddWeekName: 'Верхняя пара · Нечётная неделя (Числитель)',
      evenWeekName: 'Нижняя пара · Чётная неделя (Знаменатель)',
    },
    bellTimes: BELL_TIMES,
    breaks: BREAKS,
    institutes: TIMACAD_INSTITUTES,
    buildingMapping: BUILDING_NAMES,
    groups: allGroups,
  };

  const filePath1 = path.join(DATA_DIR, 'official-schedule.json');
  const filePath2 = path.join(PUBLIC_DATA_DIR, 'official-schedule.json');

  const jsonStr = JSON.stringify(finalData, null, 2);
  fs.writeFileSync(filePath1, jsonStr, 'utf8');
  fs.writeFileSync(filePath2, jsonStr, 'utf8');

  console.log('════════════════════════════════════════════════════════════════════');
  console.log(`[Timacad Sync Engine] SUCCESS: Wrote official schedule to:`);
  console.log(` - ${filePath1}`);
  console.log(` - ${filePath2}`);
  console.log(`Total verified groups:  ${finalData.meta.totalGroups}`);
  console.log(`Total verified classes: ${finalData.meta.totalClasses}`);
  console.log(`Last sync timestamp:   ${finalData.meta.lastSyncTime}`);
  console.log('════════════════════════════════════════════════════════════════════');
}

sync().catch(err => {
  console.error('[Timacad Sync Engine] Fatal synchronization error:', err);
  process.exit(1);
});
