import fs from 'node:fs/promises';
import path from 'node:path';
import { OFFICIAL_URL, ELECTRONIC_URL, INSTITUTES, currentTerm, parseGroupIndex, parseDocumentCatalog, parseGroupSchedule, parseNews, digest } from './official-source-parser.mjs';

const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'public/data');
const cache = path.join(root, '.cache/official-http');
const now = new Date();
const checkedAt = now.toISOString();
const today = new Date(now.getTime() + 3 * 3600000).toISOString().slice(0,10);
const term = currentTerm(now);
const addDays = (date, n) => new Date(new Date(date + 'T12:00:00Z').getTime() + n * 86400000).toISOString().slice(0,10);
const window = { from: [term.startDate, addDays(today,-7)].sort().at(-1), to: [term.endDate, addDays(today,42)].sort()[0] };
await fs.mkdir(cache, {recursive:true});
await fs.mkdir(path.join(out,'groups'), {recursive:true});
async function json(file, value) { const temp = file + '.tmp'; await fs.writeFile(temp, JSON.stringify(value)); await fs.rename(temp, file); }
async function fetchHtml(url) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || !['www.timacad.ru','eg.timacad.ru'].includes(parsed.hostname)) throw new Error('Non-official URL refused');
  const key = path.join(cache, digest(url));
  let previous; try { previous = JSON.parse(await fs.readFile(key + '.json','utf8')); } catch {}
  const headers = { 'User-Agent': 'TIM-Campus-Schedule/4.0 (+https://github.com/p44978180-del/raspos)' };
  if (previous?.etag) headers['If-None-Match'] = previous.etag;
  if (previous?.modified) headers['If-Modified-Since'] = previous.modified;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url,{headers,signal:AbortSignal.timeout(45000),redirect:'error'});
      if (response.status === 304) return await fs.readFile(key + '.html','utf8');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const declared = Number(response.headers.get('content-length'));
      if (declared > 15_000_000) throw new Error('Source exceeds 15 MB limit');
      const html = await response.text();
      if (Buffer.byteLength(html) > 15_000_000) throw new Error('Source exceeds 15 MB limit');
      await fs.writeFile(key + '.html',html);
      await json(key + '.json',{url,etag:response.headers.get('etag'),modified:response.headers.get('last-modified'),checkedAt,sha256:digest(html)});
      return html;
    } catch (error) { if (attempt === 2) throw error; await new Promise(r=>setTimeout(r,1000 * (attempt+1))); }
  }
}
const [sourceHtml,indexHtml] = await Promise.all([fetchHtml(OFFICIAL_URL),fetchHtml(ELECTRONIC_URL)]);
if (!sourceHtml.includes('eg.timacad.ru')) throw new Error('Official document page no longer links the electronic source');
const entries = parseGroupIndex(indexHtml);
if (entries.length < 100) throw new Error(`Suspicious source index size: ${entries.length}; existing data preserved`);
const documentCatalog = parseDocumentCatalog(sourceHtml,term,checkedAt);
const institutes = [...new Map([...INSTITUTES,...entries.map(g=>({id:g.instituteId,name:g.institute,short:g.institute})),...documentCatalog.documents.filter(d=>d.institute).map(d=>({id:d.instituteId,name:d.institute,short:d.institute}))].map(i=>[i.id,i])).values()];
const groups = {}, errors = [], sourceHashes = [], stats = {done:0,totalClasses:0,rejected:0};
let cursor = 0;
console.log(`Official catalog: ${entries.length} groups; ${documentCatalog.documents.length} current PDFs; ${window.from} to ${window.to}`);
async function worker() {
  while (cursor < entries.length) {
    const g = entries[cursor++];
    const url = `${g.sourceUrl}&academic_year=${term.academicYear.slice(0,4)}`;
    const metadata = {...g,sourceUrl:url};
    try {
      const html = await fetchHtml(url);
      const parsed = parseGroupSchedule(html,g,window,term);
      if (parsed.rejected) throw new Error(`${parsed.rejected} unrecognized lesson rows; refused partial group`);
      const schedule = parsed.schedule.map(d=>({...d,classes:d.classes.map(l=>({...l,sourceUrl:url}))}));
      const content = JSON.stringify(schedule);
      const hash = digest(content).slice(0,16);
      const schedulePath = `data/groups/${g.id}-${hash}.json`;
      await json(path.join(root,'public',schedulePath),{...metadata,status:schedule.length?'current':'no-classes',schedule,checkedAt,window});
      groups[g.name] = {...metadata,status:schedule.length?'current':'no-classes',schedulePath};
      sourceHashes.push({groupId:g.id,url,sha256:digest(html),lessons:schedule.reduce((n,d)=>n+d.classes.length,0)});
      stats.totalClasses += schedule.reduce((n,d)=>n+d.classes.length,0);
    } catch (error) {
      errors.push({group:g.name,url,error:error.message});
      groups[g.name] = {...metadata,status:'fetch-failed'};
    }
    stats.done++;
    if (stats.done % 25 === 0 || stats.done === entries.length) console.log(`${stats.done}/${entries.length}; lessons ${stats.totalClasses}; failures ${errors.length}`);
    await new Promise(r=>setTimeout(r,150));
  }
}
await Promise.all(Array.from({length:4},worker));
if (errors.length > entries.length * .1) throw new Error('More than 10% groups failed; existing catalog preserved');
const ordered = Object.fromEntries(Object.entries(groups).sort(([a],[b])=>a.localeCompare(b,'ru')));
const catalog = {meta:{schemaVersion:4,status:errors.length?'partial':'current',university:'РГАУ-МСХА имени К.А. Тимирязева',sourceUrl:OFFICIAL_URL,electronicSourceUrl:ELECTRONIC_URL,currentTerm:term,semester:`${term.semester} семестр ${term.academicYear}`,checkedAt,lastSyncTime:checkedAt,totalGroups:entries.length,totalClasses:stats.totalClasses,scheduleWindow:window,dataVersion:digest(JSON.stringify(ordered)),failedGroups:errors.length,archivedDocumentsExcluded:documentCatalog.archivedCount},institutes,groups:ordered,documents:documentCatalog.documents,coverage:institutes.map(i=>({instituteId:i.id,groups:entries.filter(g=>g.instituteId===i.id).length,failed:errors.filter(e=>groups[e.group]?.instituteId===i.id).length,documents:documentCatalog.documents.filter(d=>d.instituteId===i.id).length})),bellTimes:[],breaks:[]};
await json(path.join(out,'official-schedule.json'),catalog);
await json(path.join(root,'src/data/official-schedule.json'),catalog);
let news=[]; try { news=parseNews(await fetchHtml('https://www.timacad.ru/'),checkedAt); } catch {}
await json(path.join(root,'src/data/official-timacad-feed.json'),news);
await json(path.join(out,'official-timacad-feed.json'),news);
await fs.mkdir(path.join(root,'docs/evidence'),{recursive:true});
await json(path.join(root,'docs/evidence/schedule-sync.json'),{checkedAt,term,window,indexSha256:digest(indexHtml),sourceSha256:digest(sourceHtml),totalGroups:entries.length,totalClasses:stats.totalClasses,errors,sources:sourceHashes});
// Retain only current content-addressed group files. Active clients can refresh their catalog.
const keep = new Set(Object.values(ordered).map(g=>g.schedulePath?.split('/').at(-1)).filter(Boolean));
for (const filename of await fs.readdir(path.join(out,'groups'))) if (/^\d+-[a-f0-9]{16}\.json$/.test(filename) && !keep.has(filename)) await fs.unlink(path.join(out,'groups',filename));
// HTTP cache is a CI optimization only; it is never bundled into the application.
console.log(`Published ${entries.length} groups, ${stats.totalClasses} dated lessons, ${errors.length} failed groups; ${news.length} verified news items.`);
if(errors.length) process.exitCode=2;
