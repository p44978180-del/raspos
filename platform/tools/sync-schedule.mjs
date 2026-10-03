import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  OFFICIAL_URL, ELECTRONIC_URL, INSTITUTES, currentTerm, parseGroupIndex,
  parseDocumentCatalog, parseGroupSchedule, digest,
} from './official-source-parser.mjs';

export const SCHEDULE_ROOT = path.resolve(import.meta.dirname, '../fixtures/schedule');
const HTTP_CACHE = path.join(os.tmpdir(), 'tim-campus-official-http');
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const addDays = (date, count) => new Date(Date.parse(`${date}T12:00:00Z`) + count * 86400000).toISOString().slice(0, 10);

async function writeJson(file, value) {
  const temporary = `${file}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(value));
  await fs.rename(temporary, file);
}

export async function fetchOfficialHtml(url, {
  cacheDirectory = HTTP_CACHE, checkedAt = new Date().toISOString(),
  fetchImpl = fetch, pause = sleep,
} = {}) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || !['www.timacad.ru', 'eg.timacad.ru'].includes(parsed.hostname)) {
    throw new Error('Non-official URL refused');
  }
  await fs.mkdir(cacheDirectory, { recursive: true });
  const key = path.join(cacheDirectory, digest(url));
  let previous;
  try { previous = JSON.parse(await fs.readFile(`${key}.json`, 'utf8')); } catch {}
  const headers = { 'User-Agent': 'TIM-Campus-Schedule/8.0 (+https://github.com/p44978180-del/raspos)' };
  if (previous?.etag) headers['If-None-Match'] = previous.etag;
  if (previous?.modified) headers['If-Modified-Since'] = previous.modified;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetchImpl(url, { headers, signal: AbortSignal.timeout(45000), redirect: 'error' });
      if (response.status === 304) return await fs.readFile(`${key}.html`, 'utf8');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      if (Number(response.headers.get('content-length')) > 15_000_000) throw new Error('Source exceeds 15 MB limit');
      const html = await response.text();
      if (Buffer.byteLength(html) > 15_000_000) throw new Error('Source exceeds 15 MB limit');
      await fs.writeFile(`${key}.html`, html);
      await writeJson(`${key}.json`, {
        url, etag: response.headers.get('etag'), modified: response.headers.get('last-modified'),
        checkedAt, sha256: digest(html),
      });
      return html;
    } catch (error) {
      if (attempt === 2) throw error;
      await pause(1000 * (attempt + 1));
    }
  }
}

export async function syncSchedule({
  scheduleRoot = SCHEDULE_ROOT, now = new Date(), fetchHtml, log = console.log,
  pause = sleep, concurrency = 4,
} = {}) {
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 4) {
    throw new Error('Concurrency must be an integer between 1 and 4');
  }
  const checkedAt = now.toISOString();
  const today = new Date(now.getTime() + 3 * 3600000).toISOString().slice(0, 10);
  const term = currentTerm(now);
  const window = {
    from: [term.startDate, addDays(today, -7)].sort().at(-1),
    to: [term.endDate, addDays(today, 42)].sort()[0],
  };
  fetchHtml ??= url => fetchOfficialHtml(url, { checkedAt });
  const [sourceHtml, indexHtml] = await Promise.all([fetchHtml(OFFICIAL_URL), fetchHtml(ELECTRONIC_URL)]);
  if (!sourceHtml.includes('eg.timacad.ru')) throw new Error('Official document page no longer links the electronic source');
  const entries = parseGroupIndex(indexHtml);
  if (entries.length < 100) throw new Error(`Suspicious source index size: ${entries.length}; existing data preserved`);
  if (new Set(entries.map(group => group.id)).size !== entries.length || new Set(entries.map(group => group.name)).size !== entries.length) {
    throw new Error('Duplicate official group identifiers; existing data preserved');
  }
  const documents = parseDocumentCatalog(sourceHtml, term, checkedAt);
  const institutes = [...new Map([
    ...INSTITUTES, ...entries.map(group => ({ id: group.instituteId, name: group.institute, short: group.institute })),
    ...documents.documents.filter(document => document.institute).map(document => ({ id: document.instituteId, name: document.institute, short: document.institute })),
  ].map(institute => [institute.id, institute])).values()];
  const groups = {}, errors = [];
  let cursor = 0, done = 0, totalClasses = 0;
  log(`Official catalog: ${entries.length} groups; ${documents.documents.length} current PDFs; ${window.from} to ${window.to}`);
  const stage = await fs.mkdtemp(path.join(os.tmpdir(), 'tim-campus-schedule-'));
  try {
    async function worker() {
      while (cursor < entries.length) {
        const group = entries[cursor++];
        const url = `${group.sourceUrl}&academic_year=${term.academicYear.slice(0, 4)}`;
        const metadata = { ...group, sourceUrl: url };
        try {
          const parsed = parseGroupSchedule(await fetchHtml(url), group, window, term);
          if (parsed.rejected) throw new Error(`${parsed.rejected} unrecognized lesson rows; refused partial group`);
          const schedule = parsed.schedule.map(day => ({ ...day, classes: day.classes.map(lesson => ({ ...lesson, sourceUrl: url })) }));
          const filename = `${group.id}-${digest(JSON.stringify(schedule)).slice(0, 16)}.json`;
          const status = schedule.length ? 'current' : 'no-classes';
          await writeJson(path.join(stage, filename), { ...metadata, status, schedule, checkedAt, window });
          groups[group.name] = { ...metadata, status, schedulePath: `data/groups/${filename}` };
          totalClasses += schedule.reduce((count, day) => count + day.classes.length, 0);
        } catch (error) {
          errors.push({ group: group.name, url, error: error.message });
        }
        done++;
        if (done % 25 === 0 || done === entries.length) log(`${done}/${entries.length}; lessons ${totalClasses}; failures ${errors.length}`);
        await pause(150);
      }
    }
    await Promise.all(Array.from({ length: concurrency }, worker));
    if (errors.length) {
      for (const error of errors) log(`${error.group}: ${error.error}`);
      throw new Error(`${errors.length} groups failed; existing data preserved`);
    }
    const ordered = Object.fromEntries(Object.entries(groups).sort(([left], [right]) => left.localeCompare(right, 'ru')));
    const catalog = {
      meta: {
        schemaVersion: 4, status: 'current', university: 'РГАУ-МСХА имени К.А. Тимирязева',
        sourceUrl: OFFICIAL_URL, electronicSourceUrl: ELECTRONIC_URL, currentTerm: term,
        semester: `${term.semester} семестр ${term.academicYear}`, checkedAt, lastSyncTime: checkedAt,
        totalGroups: entries.length, totalClasses, scheduleWindow: window,
        dataVersion: digest(JSON.stringify(ordered)), failedGroups: 0, archivedDocumentsExcluded: documents.archivedCount,
      },
      institutes, groups: ordered, documents: documents.documents,
      coverage: institutes.map(institute => ({
        instituteId: institute.id, groups: entries.filter(group => group.instituteId === institute.id).length,
        failed: 0, documents: documents.documents.filter(document => document.instituteId === institute.id).length,
      })),
      bellTimes: [], breaks: [],
    };
    const out = path.join(scheduleRoot, 'data');
    const groupDirectory = path.join(out, 'groups');
    await fs.mkdir(groupDirectory, { recursive: true });
    const keep = new Set(Object.values(ordered).map(group => path.basename(group.schedulePath)));
    for (const filename of keep) {
      await fs.copyFile(path.join(stage, filename), path.join(groupDirectory, `${filename}.tmp`));
      await fs.rename(path.join(groupDirectory, `${filename}.tmp`), path.join(groupDirectory, filename));
    }
    await writeJson(path.join(out, 'official-schedule.json'), catalog);
    for (const filename of await fs.readdir(groupDirectory)) {
      if (/^\d+-[a-f0-9]{16}\.json$/.test(filename) && !keep.has(filename)) await fs.unlink(path.join(groupDirectory, filename));
    }
    log(`Published ${entries.length} groups and ${totalClasses} dated lessons.`);
    return catalog;
  } finally {
    await fs.rm(stage, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (process.argv.length > 2) {
    console.error('Usage: node platform/tools/sync-schedule.mjs');
    process.exitCode = 1;
  } else {
    try { await syncSchedule(); }
    catch (error) { console.error(error.message); process.exitCode = 1; }
  }
}
