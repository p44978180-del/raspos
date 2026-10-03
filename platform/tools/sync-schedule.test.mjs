import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { OFFICIAL_URL, ELECTRONIC_URL, digest } from './official-source-parser.mjs';
import { SCHEDULE_ROOT, fetchOfficialHtml, syncSchedule } from './sync-schedule.mjs';

async function temporaryDirectory(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'tim-campus-tool-test-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  return directory;
}

const rows = Array.from({ length: 100 }, (_, index) => ({
  group_id: index + 1, group_name: `Группа-${index + 1}`, department_name: 'Институт агробиотехнологии', course_label: 'Первый',
}));
const source = '<a href="https://eg.timacad.ru/schedule/groups/">Расписание</a><h2>1 семестр 2026/2027</h2><h5>Институт агробиотехнологии</h5><a href="/uploads/files/current.pdf">1 курс</a>';
const index = `<script id="group-filter-data">${JSON.stringify(rows)}</script>`;
const pause = async () => {};
const log = () => {};
const now = new Date('2026-09-20T12:00:00Z');

function groupHtml(id) {
  return `<select name="academic_year"><option selected value="2026">2026</option></select><h2>Группа Группа-${id}</h2><div class="accordion-item"><div class="group-schedule-head-date">21.09.2026</div><div class="group-schedule-lesson-item"><div class="group-schedule-subject">Математика</div><span class="group-schedule-number">2</span><div class="group-schedule-time-range">10:55–12:30</div></div></div>`;
}

async function fetchHtml(url) {
  if (url === OFFICIAL_URL) return source;
  if (url === ELECTRONIC_URL) return index;
  const parsed = new URL(url);
  assert.equal(parsed.searchParams.get('academic_year'), '2026');
  return groupHtml(parsed.searchParams.get('group'));
}

test('default destination is the single platform schedule dataset', () => {
  assert.equal(SCHEDULE_ROOT, path.resolve(import.meta.dirname, '../fixtures/schedule'));
});

test('synchronization publishes only catalog and content-addressed shards', async t => {
  const scheduleRoot = await temporaryDirectory(t);
  const groupDirectory = path.join(scheduleRoot, 'data/groups');
  await fs.mkdir(groupDirectory, { recursive: true });
  const stale = '900-0123456789abcdef.json';
  await fs.writeFile(path.join(groupDirectory, stale), '{}');
  const catalog = await syncSchedule({ scheduleRoot, now, fetchHtml, pause, log });
  assert.equal(catalog.meta.totalGroups, 100);
  assert.equal(catalog.meta.totalClasses, 100);
  assert.deepEqual(await fs.readdir(scheduleRoot), ['data']);
  assert.deepEqual((await fs.readdir(path.join(scheduleRoot, 'data'))).sort(), ['groups', 'official-schedule.json']);
  assert.equal((await fs.readdir(groupDirectory)).length, 100);
  await assert.rejects(fs.stat(path.join(groupDirectory, stale)), { code: 'ENOENT' });
  for (const group of Object.values(catalog.groups)) {
    assert.match(group.schedulePath, /^data\/groups\/\d+-[a-f0-9]{16}\.json$/);
    const shard = JSON.parse(await fs.readFile(path.join(scheduleRoot, group.schedulePath), 'utf8'));
    assert.equal(shard.name, group.name);
    assert.equal(shard.id, group.id);
    assert.equal(digest(JSON.stringify(shard.schedule)).slice(0, 16), path.basename(group.schedulePath).match(/-([a-f0-9]{16})\.json$/)[1]);
    assert.equal(shard.schedule[0].classes[0].sourceUrl, group.sourceUrl);
  }
});

test('one failed group preserves the entire previous dataset without new shards', async t => {
  const scheduleRoot = await temporaryDirectory(t);
  await fs.mkdir(path.join(scheduleRoot, 'data/groups'), { recursive: true });
  await fs.writeFile(path.join(scheduleRoot, 'data/official-schedule.json'), '{"existing":true}');
  await fs.writeFile(path.join(scheduleRoot, 'data/groups/900-0123456789abcdef.json'), '{"existing":true}');
  await assert.rejects(syncSchedule({ scheduleRoot, now, pause, log, fetchHtml: async url => {
    if (new URL(url).searchParams.get('group') === '1') throw new Error('HTTP 500');
    return fetchHtml(url);
  } }), /1 groups failed; existing data preserved/);
  assert.equal(await fs.readFile(path.join(scheduleRoot, 'data/official-schedule.json'), 'utf8'), '{"existing":true}');
  assert.deepEqual(await fs.readdir(path.join(scheduleRoot, 'data/groups')), ['900-0123456789abcdef.json']);
});

test('suspicious and duplicate official catalog indexes never create an output', async t => {
  const temporary = await temporaryDirectory(t);
  for (const groupRows of [rows.slice(0, 99), [...rows.slice(0, 99), rows[0]]]) {
    const scheduleRoot = path.join(temporary, `dataset-${groupRows.length}-${groupRows.at(-1).group_id}`);
    await assert.rejects(syncSchedule({ scheduleRoot, now, pause, log, fetchHtml: async url => url === OFFICIAL_URL ? source : `<script id="group-filter-data">${JSON.stringify(groupRows)}</script>` }), /Suspicious|Duplicate/);
    await assert.rejects(fs.stat(scheduleRoot), { code: 'ENOENT' });
  }
});

test('HTTP cache supports conditional requests without project-local artifacts', async t => {
  const cacheDirectory = await temporaryDirectory(t);
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push(options);
    if (calls.length === 1) return new Response('<html>official</html>', { headers: { etag: '"source-v1"', 'last-modified': 'Mon, 21 Sep 2026 00:00:00 GMT' } });
    return new Response(null, { status: 304 });
  };
  assert.equal(await fetchOfficialHtml(ELECTRONIC_URL, { cacheDirectory, fetchImpl, pause }), '<html>official</html>');
  assert.equal(await fetchOfficialHtml(ELECTRONIC_URL, { cacheDirectory, fetchImpl, pause }), '<html>official</html>');
  assert.equal(calls[1].headers['If-None-Match'], '"source-v1"');
  assert.equal(calls[1].headers['If-Modified-Since'], 'Mon, 21 Sep 2026 00:00:00 GMT');
  assert.equal(calls[1].redirect, 'error');
});

test('HTTP loader refuses non-official sources, oversize responses and server errors', async t => {
  const cacheDirectory = await temporaryDirectory(t);
  let requests = 0;
  for (const url of ['http://eg.timacad.ru/', 'https://www.timacad.ru.evil.test/']) {
    await assert.rejects(fetchOfficialHtml(url, { cacheDirectory, pause, fetchImpl: async () => { requests++; } }), /Non-official URL/);
  }
  assert.equal(requests, 0);
  await assert.rejects(fetchOfficialHtml(ELECTRONIC_URL, { cacheDirectory, pause, fetchImpl: async () => new Response('', { headers: { 'content-length': '15000001' } }) }), /15 MB limit/);
  await assert.rejects(fetchOfficialHtml(ELECTRONIC_URL, { cacheDirectory, pause, fetchImpl: async () => new Response('', { status: 500 }) }), /HTTP 500/);
  assert.deepEqual(await fs.readdir(cacheDirectory), []);
});
