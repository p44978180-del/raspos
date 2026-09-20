import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {validCatalog,validGroup,validDate,validStudent} from '../src/lib/data-validation.ts';
import {parseBackup,mergeBackup} from '../src/lib/personal-backup.ts';
import {currentTerm,parseGroupIndex,parseGroupSchedule,parseDocumentCatalog} from '../scripts/official-source-parser.mjs';
const catalog=JSON.parse(fs.readFileSync(new URL('../public/data/official-schedule.json',import.meta.url)));
test('the complete shipped catalog and every dated group shard are valid and integrity-bound',()=>{
  assert.ok(validCatalog(catalog));
  assert.deepEqual(catalog,JSON.parse(fs.readFileSync(new URL('../src/data/official-schedule.json',import.meta.url))));
  let lessons=0;
  for(const [name,g] of Object.entries(catalog.groups)){
    if(g.status==='fetch-failed')continue;
    const shard=JSON.parse(fs.readFileSync(new URL(`../public/${g.schedulePath}`,import.meta.url)));
    assert.ok(validGroup(shard,g,name,catalog.meta.scheduleWindow),name);
    assert.equal(createHash('sha256').update(JSON.stringify(shard.schedule)).digest('hex').slice(0,16),g.schedulePath.match(/-([a-f0-9]{16})\.json$/)[1],name);
    lessons+=shard.schedule.reduce((n,d)=>n+d.classes.length,0);
  }
  assert.equal(lessons,catalog.meta.totalClasses);
});
test('catalog rejects malicious paths, invalid totals, source hosts and malformed metadata',()=>{
  const first=Object.keys(catalog.groups)[0];
  for(const change of [c=>c.meta.sourceUrl='https://timacad.ru.evil.test/',c=>c.meta.totalGroups++,c=>c.meta.totalClasses=-1,c=>c.meta.checkedAt='tomorrow',c=>c.groups[first].schedulePath='../credentials.json',c=>c.institutes[0].name={},c=>c.documents[0].url='javascript:alert(1)']){
    const next=structuredClone(catalog);change(next);assert.equal(validCatalog(next),false);
  }
});
test('group rejects malformed fields even when a content hash could match',()=>{
  const [name,g]=Object.entries(catalog.groups).find(([,g])=>g.status==='current');
  const shard=JSON.parse(fs.readFileSync(new URL(`../public/${g.schedulePath}`,import.meta.url)));
  for(const change of [v=>v.id++,v=>v.schedule[0].date='2026-02-30',v=>v.schedule[0].classes[0].subject={},v=>v.schedule[0].classes[0].start='25:15',v=>v.schedule[0].classes[0].teacher=null,v=>v.schedule.push(v.schedule[0])]){
    const next=structuredClone(shard);change(next);assert.equal(validGroup(next,g,name,catalog.meta.scheduleWindow),false);
  }
});
test('academic term changes at Moscow midnight and semester boundary',()=>{
  assert.equal(currentTerm(new Date('2026-08-31T20:59:59Z')).academicYear,'2025/2026');
  assert.equal(currentTerm(new Date('2026-08-31T21:00:00Z')).academicYear,'2026/2027');
  assert.equal(currentTerm(new Date('2027-01-31T21:00:00Z')).semester,2);
});
test('strict dates reject normalized impossible calendar days',()=>{
  assert.ok(validDate('2028-02-29'));assert.equal(validDate('2026-02-29'),false);assert.equal(validDate('2026-13-01'),false);
});
const group={id:42,name:'ГРУППА-42'};
const term={academicYear:'2026/2027',startDate:'2026-09-01',endDate:'2027-01-31'};
const window={from:'2026-09-12',to:'2026-10-31'};
const head='<select name="academic_year"><option selected value="2026">2026</option></select><h2>Группа ГРУППА-42</h2>';
const lesson=(date)=>`<div class="accordion-item"><div class="group-schedule-head-date">${date}</div><div class="group-schedule-lesson-item"><div class="group-schedule-subject">Математика</div><span class="group-schedule-number">2</span><div class="group-schedule-time-range">10:55–12:30</div><div class="group-schedule-tag-lesson-type">Лекция</div><div class="group-schedule-teachers"><div class="group-schedule-meta-line"><i class="bi-person"></i>Преподаватель</div><div class="group-schedule-meta-line"><i class="bi-geo-alt"></i>29-211</div></div></div></div>`;
test('parser preserves actual dates/times and does not invent recurring lessons',()=>{
  const result=parseGroupSchedule(head+lesson('21.09.2026')+lesson('01.06.2026'),group,window,term);
  assert.equal(result.schedule.length,1);assert.equal(result.schedule[0].date,'2026-09-21');
  assert.equal(result.schedule[0].classes[0].start,'10:55');assert.equal(result.schedule[0].classes[0].room,'211');assert.equal(result.rejected,0);
});
test('parser rejects incorrect group/year and unexpected empty markup',()=>{
  assert.throws(()=>parseGroupSchedule(head.replace('ГРУППА-42','ЧУЖАЯ')+lesson('21.09.2026'),group,window,term),/mismatch/);
  assert.throws(()=>parseGroupSchedule(head.replace('value="2026"','value="2025"')+lesson('21.09.2026'),group,window,term),/year/);
  assert.throws(()=>parseGroupSchedule(head+'<main>New markup</main>',group,window,term),/markup/);
  assert.deepEqual(parseGroupSchedule(head+'<p>Для выбранной группы в расписании пока нет занятий.</p>',group,window,term).schedule,[]);
});
test('document selection excludes previous semesters and foreign PDF hosts',()=>{
  const html='<h2>1 семестр 2026/2027</h2><h5>Институт агробиотехнологии</h5><a href="/uploads/files/current.pdf">1 курс</a><a href="https://evil.test/uploads/files/a.pdf">2 курс</a><h2>2 семестр 2025/2026</h2><a href="/uploads/files/old.pdf">1 курс</a>';
  const result=parseDocumentCatalog(html,{academicYear:'2026/2027',semester:1},'2026-09-20T00:00:00Z');
  assert.equal(result.documents.length,1);assert.equal(result.archivedCount,1);
});
test('group index excludes demos and fails closed on missing markup',()=>{
  assert.throws(()=>parseGroupIndex('<html>changed</html>'),/markup changed/);
  const row={group_id:1,group_name:'ДА 01-26',department_name:'Институт агробиотехнологии',course_label:'Первый'};
  assert.equal(parseGroupIndex(`<script id="group-filter-data">${JSON.stringify([row,{...row,group_id:2,group_name:'RUSTORE'}])}</script>`).length,1);
});
test('personal backups reject broken records and duplicate IDs',()=>{
  const value={group:'',name:'',notes:'',favorites:[],plans:[],tasks:[{id:'a',title:'Задача',date:'',done:false,kind:'task'}]};
  assert.ok(validStudent(value));
  assert.equal(validStudent({...value,tasks:[...value.tasks,...value.tasks]}),false);
  assert.equal(validStudent({...value,name:{}}),false);
  assert.equal(validStudent({...value,plans:[{id:'b',title:'Встреча',date:'2026-09-21',start:'12:00',end:'11:00',room:''}]}),false);
});
test('backup roundtrip preserves new local work and merges only explicit imported records',()=>{
  const current={group:'ДА 01-26',name:'Имя',notes:'Текущая заметка',favorites:['ДА 01-26'],plans:[],tasks:[{id:'a',title:'Существующее',date:'',done:false,kind:'task'}]};
  const imported={group:'ДЭ 01-26',name:'Другое имя',notes:'Заметка из копии',favorites:['ДЭ 01-26'],plans:[],tasks:[{id:'b',title:'Из копии',date:'',done:true,kind:'homework'}]};
  const parsed=parseBackup(JSON.stringify({version:4,data:imported}));
  const merged=mergeBackup(current,parsed);
  assert.equal(merged.tasks.length,2);assert.equal(merged.name,current.name);assert.equal(merged.group,current.group);assert.ok(merged.notes.includes(current.notes));assert.ok(merged.notes.includes(imported.notes));
  assert.deepEqual(mergeBackup(current,current),current);
  assert.throws(()=>parseBackup(JSON.stringify({version:3,data:current})),/копия/);
  assert.throws(()=>parseBackup('{malformed'));
});
