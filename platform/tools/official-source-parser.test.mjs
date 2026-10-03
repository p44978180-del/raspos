import test from 'node:test';
import assert from 'node:assert/strict';
import {
  currentTerm, parseGroupIndex, parseGroupSchedule, parseDocumentCatalog,
} from './official-source-parser.mjs';

const group = { id: 42, name: 'ГРУППА-42' };
const term = { academicYear: '2026/2027', startDate: '2026-09-01', endDate: '2027-01-31' };
const window = { from: '2026-09-12', to: '2026-10-31' };
const head = '<select name="academic_year"><option selected value="2026">2026</option></select><h2>Группа ГРУППА-42</h2>';
const lesson = date => `<div class="accordion-item"><div class="group-schedule-head-date">${date}</div><div class="group-schedule-lesson-item"><div class="group-schedule-subject">Математика</div><span class="group-schedule-number">2</span><div class="group-schedule-time-range">10:55–12:30</div><div class="group-schedule-tag-lesson-type">Лекция</div><div class="group-schedule-teachers"><div class="group-schedule-meta-line"><i class="bi-person"></i>Преподаватель</div><div class="group-schedule-meta-line"><i class="bi-geo-alt"></i>29-211</div></div></div></div>`;

test('academic term changes at Moscow midnight and semester boundary', () => {
  assert.equal(currentTerm(new Date('2026-08-31T20:59:59Z')).academicYear, '2025/2026');
  assert.equal(currentTerm(new Date('2026-08-31T21:00:00Z')).academicYear, '2026/2027');
  assert.equal(currentTerm(new Date('2027-01-31T21:00:00Z')).semester, 2);
});

test('parser preserves dated lessons, times, locations and duplicate handling', () => {
  const result = parseGroupSchedule(head + lesson('21.09.2026') + lesson('21.09.2026') + lesson('01.06.2026'), group, window, term);
  assert.equal(result.schedule.length, 1);
  assert.equal(result.schedule[0].date, '2026-09-21');
  assert.equal(result.schedule[0].classes.length, 1);
  assert.equal(result.schedule[0].classes[0].start, '10:55');
  assert.equal(result.schedule[0].classes[0].room, '211');
  assert.equal(result.schedule[0].classes[0].teacher, 'Преподаватель');
  assert.equal(result.rejected, 0);
});

test('parser rejects incorrect group/year and unexplained empty source', () => {
  assert.throws(() => parseGroupSchedule(head.replace('ГРУППА-42', 'ЧУЖАЯ') + lesson('21.09.2026'), group, window, term), /mismatch/);
  assert.throws(() => parseGroupSchedule(head.replace('value="2026"', 'value="2025"') + lesson('21.09.2026'), group, window, term), /year/);
  assert.throws(() => parseGroupSchedule(head + '<main>New markup</main>', group, window, term), /markup/);
  assert.deepEqual(parseGroupSchedule(head + '<p>Для выбранной группы в расписании пока нет занятий.</p>', group, window, term).schedule, []);
});

test('impossible dates, malformed times and unexpected lesson markup fail closed', () => {
  assert.throws(() => parseGroupSchedule(head + lesson('31.09.2026'), group, window, term), /Invalid official date/);
  assert.throws(() => parseGroupSchedule(head + lesson('21.09.2026').replace('group-schedule-lesson-item', 'changed'), group, window, term), /Lesson markup/);
  const invalid = parseGroupSchedule(head + lesson('21.09.2026').replace('10:55', '25:55'), group, window, term);
  assert.equal(invalid.rejected, 1);
  assert.deepEqual(invalid.schedule, []);
});

test('official text is decoded and combined subgroup rooms are preserved', () => {
  const html = head + lesson('21.09.2026').replace('Математика', 'Математика &amp; анализ').replace('29-211', '29-211; 29-212');
  const result = parseGroupSchedule(html, group, window, term).schedule[0].classes[0];
  assert.equal(result.subject, 'Математика & анализ');
  assert.equal(result.room, '29-211; 29-212');
  assert.equal(result.building, '');
});

test('document selection excludes previous semesters and foreign hosts', () => {
  const html = '<h2>1 семестр 2026/2027</h2><h5>Институт агробиотехнологии</h5><a href="/uploads/files/current.pdf">1 курс</a><a href="https://evil.test/uploads/files/a.pdf">2 курс</a><h2>2 семестр 2025/2026</h2><a href="/uploads/files/old.pdf">1 курс</a>';
  const result = parseDocumentCatalog(html, { academicYear: '2026/2027', semester: 1 }, '2026-09-20T00:00:00Z');
  assert.equal(result.documents.length, 1);
  assert.equal(result.archivedCount, 1);
  assert.equal(result.documents[0].url, 'https://www.timacad.ru/uploads/files/current.pdf');
});

test('group index excludes demos and rejects changed markup', () => {
  assert.throws(() => parseGroupIndex('<html>changed</html>'), /markup changed/);
  const row = { group_id: 1, group_name: 'ДА 01-26', department_name: 'Институт агробиотехнологии', course_label: 'Первый' };
  const groups = parseGroupIndex(`<script id="group-filter-data">${JSON.stringify([row, { ...row, group_id: 2, group_name: 'RUSTORE' }])}</script>`);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].instituteId, 'agrobio');
  assert.equal(groups[0].course, 1);
});
