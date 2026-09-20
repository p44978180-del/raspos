import { createHash } from 'node:crypto';

export const OFFICIAL_URL = 'https://www.timacad.ru/about/sveden/document/rezhim-zaniatii-obuchaiushchikhsia';
export const ELECTRONIC_URL = 'https://eg.timacad.ru/schedule/groups/';
export const INSTITUTES = [
  { id: 'agrobio', name: 'Институт агробиотехнологии', short: 'Агробиотехнологии' },
  { id: 'zoobio', name: 'Институт зоотехнии и биологии', short: 'Зоотехния и биология' },
  { id: 'horticulture', name: 'Институт садоводства и ландшафтной архитектуры', short: 'Садоводство' },
  { id: 'tech', name: 'Технологический институт', short: 'Технологический' },
  { id: 'econ', name: 'Институт экономики и управления АПК', short: 'Экономика и управление' },
  { id: 'mechanics', name: 'Институт механики и энергетики имени В.П. Горячкина', short: 'Механика и энергетика' },
  { id: 'water', name: 'Институт мелиорации, водного хозяйства и строительства имени А.Н. Костякова', short: 'Мелиорация и строительство' },
];
const COURSE = { Первый: 1, Второй: 2, Третий: 3, Четвертый: 4, Четвёртый: 4, Пятый: 5, Шестой: 6 };
const DAYS = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];
export const digest = (s) => createHash('sha256').update(s).digest('hex');
export const normalize = (s) => String(s || '').replace(/\s+/g, ' ').trim();
export function decodeHtml(s) {
  const named = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ', mdash: '—', ndash: '–', laquo: '«', raquo: '»' };
  return String(s).replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (m, entity) => {
    if (entity[0] !== '#') return named[entity] ?? m;
    const code = entity[1]?.toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
  });
}

// A small non-executing HTML tree reader. No script, style or external resource is evaluated.
export function htmlTree(html) {
  const root = { tag: 'root', attrs: {}, children: [] };
  const stack = [root];
  const safe = html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '');
  const voids = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
  for (const match of safe.matchAll(/<!--[\s\S]*?-->|<![^>]*>|<\/?[a-z][^>]*>|[^<]+/gi)) {
    const token = match[0];
    if (token.startsWith('<!')) continue;
    if (token.startsWith('</')) {
      const name = token.slice(2).match(/^[\w-]+/)?.[0].toLowerCase();
      for (let i = stack.length - 1; i > 0; i--) if (stack[i].tag === name) { stack.length = i; break; }
    } else if (token.startsWith('<')) {
      const tag = token.slice(1).match(/^[\w-]+/)?.[0].toLowerCase();
      const attrs = {};
      for (const a of token.slice(tag.length + 1).matchAll(/([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) attrs[a[1].toLowerCase()] = decodeHtml(a[2] ?? a[3] ?? a[4] ?? '');
      const node = { tag, attrs, children: [] };
      stack.at(-1).children.push(node);
      if (!voids.has(tag) && !token.endsWith('/>')) stack.push(node);
    } else stack.at(-1).children.push(decodeHtml(token));
  }
  return root;
}
export const nodeText = (n) => typeof n === 'string' ? n : normalize(n.children.map(nodeText).join(' '));
export const hasClass = (n, c) => typeof n !== 'string' && (n.attrs.class || '').split(/\s+/).includes(c);
export function findAll(n, predicate) {
  if (typeof n === 'string') return [];
  return [...(predicate(n) ? [n] : []), ...n.children.flatMap(c => findAll(c, predicate))];
}
const firstClass = (n, c) => findAll(n, x => hasClass(x, c))[0];

export function currentTerm(date = new Date()) {
  const msk = new Date(date.getTime() + 3 * 3600_000);
  const y = msk.getUTCFullYear();
  const month = msk.getUTCMonth() + 1;
  const academicStart = month >= 9 ? y : y - 1;
  const semester = month >= 2 && month <= 8 ? 2 : 1;
  return { academicYear: `${academicStart}/${academicStart + 1}`, semester,
    startDate: semester === 1 ? `${academicStart}-09-01` : `${academicStart + 1}-02-01`,
    endDate: semester === 1 ? `${academicStart + 1}-01-31` : `${academicStart + 1}-08-31` };
}

export function parseGroupIndex(html) {
  const match = html.match(/<script\b[^>]*id=["']group-filter-data["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!match) throw new Error('Official group index markup changed: group-filter-data is missing');
  const rows = JSON.parse(match[1]);
  if (!Array.isArray(rows)) throw new Error('Official group index is not an array');
  const institutes = new Map(INSTITUTES.map(i => [i.name.toLocaleLowerCase('ru'), i]));
  return rows.flatMap(row => {
    const department = normalize(row.department_name);
    const inst = institutes.get(department.toLocaleLowerCase('ru')) || { id: `department-${row.department_id}`, name: department, short: department };
    const name = normalize(row.group_name);
    if (!department || /demo|rustore|__|test/i.test(name + ' ' + department) || !Number.isSafeInteger(row.group_id)) return [];
    return [{ id: row.group_id, name, institute: inst.name, instituteId: inst.id, course: COURSE[row.course_label] || 0,
      studyForm: normalize(row.study_form), educationLevel: normalize(row.education_level),
      specialty: normalize(row.specialty_name), sourceUrl: `${ELECTRONIC_URL}?group=${row.group_id}` }];
  });
}

export function parseDocumentCatalog(html, term, checkedAt) {
  let section = '', institute = '', semester = null, academicYear = null;
  const documents = [], archived = [], terms = new Set();
  for (const match of html.matchAll(/<h([25])\b[^>]*>([\s\S]*?)<\/h\1>|<a\b([^>]*\bhref\s*=\s*["'][^"']+\.pdf(?:\?[^"']*)?["'][^>]*)>([\s\S]*?)<\/a>/gi)) {
    if (match[1]) {
      const t = nodeText(htmlTree(match[2]));
      if (match[1] === '2') {
        section = t; institute = '';
        const year = t.match(/(\d{4})\s*[/-]\s*(\d{4})/);
        academicYear = year ? `${year[1]}/${year[2]}` : null;
        semester = Number(t.match(/([12])\s*семестр/i)?.[1]) || null;
        if (academicYear && semester) terms.add(`${semester} семестр ${academicYear}`);
      } else institute = INSTITUTES.find(i => i.name.toLocaleLowerCase('ru') === t.toLocaleLowerCase('ru'))?.name || t;
      continue;
    }
    const link = htmlTree(`<a ${match[3]}>${match[4]}</a>`).children.find(x => typeof x !== 'string');
    let url;
    try { url = new URL(link.attrs.href, OFFICIAL_URL); } catch { continue; }
    if (url.protocol !== 'https:' || url.hostname !== 'www.timacad.ru' || !url.pathname.startsWith('/uploads/files/')) continue;
    const title = normalize(link.attrs.title || nodeText(link));
    const doc = { id: digest(url.href).slice(0, 16), title, url: url.href, institute,
      instituteId: INSTITUTES.find(i => i.name === institute)?.id || 'digital',
      course: Number(title.match(/(\d)\s*курс/)?.[1]) || null,
      studyForm: /очно-заочн/i.test(section) ? 'Очно-заочная' : /заочн/i.test(section) ? 'Заочная' : 'Очная',
      educationLevel: /магистрант/i.test(section) ? 'Магистратура' : 'Бакалавриат / специалитет',
      academicYear, semester, checkedAt, sourceUrl: OFFICIAL_URL };
    if (!academicYear || !semester) continue;
    if (academicYear === term.academicYear && semester === term.semester) documents.push({ ...doc, status: 'current' });
    else archived.push({ ...doc, status: 'archived' });
  }
  const unique = arr => [...new Map(arr.map(d => [d.id, d])).values()];
  return { documents: unique(documents), archivedCount: unique(archived).length, publishedTerms: [...terms] };
}

function parseDate(value) {
  const m = value.match(/\b(\d{2})\.(\d{2})\.(\d{4})\b/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

export function parseGroupSchedule(html, group, window, term) {
  const tree = htmlTree(html);
  const selected = findAll(tree, n => n.tag === 'select' && n.attrs.name === 'academic_year')[0];
  const academicYear = selected && findAll(selected, n => n.tag === 'option' && Object.hasOwn(n.attrs, 'selected'))[0]?.attrs.value;
  if (academicYear !== term.academicYear.slice(0, 4)) throw new Error(`Wrong academic year for ${group.name}: ${academicYear ?? 'missing'}`);
  const heading = findAll(tree, n => n.tag === 'h2' && nodeText(n).startsWith('Группа '))[0];
  if (!heading || normalize(nodeText(heading).slice(7)) !== group.name) throw new Error(`Group mismatch for ${group.name}`);
  const days = new Map();
  const dayNodes = findAll(tree, n => hasClass(n, 'accordion-item'));
  const recognized = dayNodes.filter(n => firstClass(n, 'group-schedule-head-date'));
  if (!recognized.length && !/Для выбранной группы в расписании пока нет занятий|Занятий пока нет/i.test(nodeText(tree))) throw new Error(`Schedule markup changed for ${group.name}; empty replacement refused`);
  let rejected = 0;
  for (const dayNode of recognized) {
    const header = firstClass(dayNode, 'group-schedule-head-date');
    const date = header && parseDate(nodeText(header));
    if (!date || !Number.isFinite(Date.parse(date)) || new Date(date + 'T12:00:00Z').toISOString().slice(0,10) !== date) throw new Error(`Invalid official date for ${group.name}`);
    if (date < window.from || date > window.to || date < term.startDate || date > term.endDate) continue;
    const day = days.get(date) || { date, weekday: DAYS[new Date(`${date}T12:00:00Z`).getUTCDay()], classes: [] };
    const lessonNodes = findAll(dayNode, n => hasClass(n, 'group-schedule-lesson-item'));
    if (!lessonNodes.length) throw new Error(`Lesson markup changed for ${group.name}`);
    for (const lesson of lessonNodes) {
      const subjectNode = firstClass(lesson, 'group-schedule-subject');
      const subject = subjectNode ? nodeText(subjectNode) : '';
      const num = Number(nodeText(firstClass(lesson, 'group-schedule-number') || { children: [] }));
      const time = nodeText(firstClass(lesson, 'group-schedule-time-range') || { children: [] }).match(/(\d{2}:\d{2})\s*[-–—]\s*(\d{2}:\d{2})/);
      if (!subject || !time || ![time[1],time[2]].every(t=>/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(t)) || time[1] >= time[2] || !Number.isInteger(num) || num < 1 || num > 12 || /(?:^|\s)(?:DEMO|ТЕСТ)(?:\s|$)/i.test(subject)) { rejected++; continue; }
      const meta = firstClass(lesson, 'group-schedule-teachers');
      let teacher = '', location = '';
      if (meta) for (const line of findAll(meta, n => hasClass(n, 'group-schedule-meta-line'))) {
        if (firstClass(line, 'bi-person')) teacher = nodeText(line);
        if (firstClass(line, 'bi-geo-alt')) location = nodeText(line);
      }
      const kind = firstClass(lesson, 'group-schedule-tag-lesson-type');
      const typeLabel = kind ? nodeText(kind) : '';
      const type = /лаборат/i.test(typeLabel) ? 'lab' : /лекц/i.test(typeLabel) ? 'lecture' : /практ|семинар/i.test(typeLabel) ? 'practice' : 'other';
      // Keep all official rooms intact; do not guess one room for combined subgroup lessons.
      const roomMatch = location.match(/^(\d{1,2})\s*[-–]\s*([^;]+)$/);
      const item = { id: parseInt(digest(`${group.id}|${date}|${num}|${subject}|${teacher}|${location}|${type}`).slice(0, 12), 16),
        num, start: time[1], end: time[2], subject, type, typeLabel, teacher,
        building: roomMatch ? `${Number(roomMatch[1])}-й учебный корпус` : '',
        room: roomMatch ? normalize(roomMatch[2]) : location,
        location, weekType: 'all' };
      if (!day.classes.some(c => c.id === item.id)) day.classes.push(item);
    }
    if (day.classes.length) days.set(date, day);
  }
  return { schedule: [...days.values()].sort((a,b) => a.date.localeCompare(b.date)).map(day => ({...day, classes: day.classes.sort((a,b)=>a.start.localeCompare(b.start)||a.id-b.id)})), rejected };
}

const MONTHS = { 'январ':1, 'феврал':2, 'март':3, 'апрел':4, 'ма':5, 'июн':6, 'июл':7, 'август':8, 'сентябр':9, 'октябр':10, 'ноябр':11, 'декабр':12 };
export function parseNews(html, checkedAt) {
  const tree = htmlTree(html), items = [];
  for (const a of findAll(tree, n => n.tag === 'a' && /^\/news\/[^/?]+\/?$/.test(n.attrs.href || ''))) {
    const titleNode = findAll(a, n => /^h[234]$/.test(n.tag) || /(?:^|[ _-])title(?:$|[ _-])/.test(n.attrs.class || ''))[0];
    const raw = nodeText(a);
    const dateMatch = raw.match(/(\d{1,2})\s+([А-Яа-яЁё]+)\s*[/,]?\s*(20\d{2})/);
    if (!dateMatch) continue;
    const month = Object.entries(MONTHS).find(([key])=>dateMatch[2].toLowerCase().startsWith(key))?.[1];
    if (!month) continue;
    const date = `${dateMatch[3]}-${String(month).padStart(2,'0')}-${dateMatch[1].padStart(2,'0')}`;
    if (date > checkedAt.slice(0,10) || new Date(checkedAt).getTime() - new Date(date).getTime() > 45 * 86400000) continue;
    const title = titleNode ? nodeText(titleNode) : normalize(raw.replace(dateMatch[0], ''));
    if (title.length < 15) continue;
    const sourceUrl = new URL(a.attrs.href, 'https://www.timacad.ru').href;
    items.push({ id: digest(sourceUrl).slice(0,16), title, summary: '', date, category: 'news', sourceName: 'РГАУ-МСХА', sourceUrl, checkedAt, badgeText: 'Новости' });
  }
  return [...new Map(items.map(i=>[i.sourceUrl,i])).values()].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,16);
}
