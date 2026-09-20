import fs from 'node:fs';
import path from 'node:path';
import {parseGroupSchedule,digest} from './official-source-parser.mjs';
const root=path.resolve(import.meta.dirname,'..');
const catalog=JSON.parse(fs.readFileSync(path.join(root,'public/data/official-schedule.json'),'utf8'));
const result={checkedAt:new Date().toISOString(),sourceSnapshotCheckedAt:catalog.meta.checkedAt,groups:0,lessons:0,failures:[]};
for(const g of Object.values(catalog.groups)){
  try{
    if(!g.schedulePath)throw new Error('No verified group snapshot');
    const html=fs.readFileSync(path.join(root,'.cache/official-http',digest(g.sourceUrl)+'.html'),'utf8');
    const parsed=parseGroupSchedule(html,g,catalog.meta.scheduleWindow,catalog.meta.currentTerm);
    if(parsed.rejected)throw new Error('Rejected source rows');
    const schedule=parsed.schedule.map(d=>({...d,classes:d.classes.map(l=>({...l,sourceUrl:g.sourceUrl}))}));
    const shard=JSON.parse(fs.readFileSync(path.join(root,'public',g.schedulePath),'utf8'));
    if(JSON.stringify(schedule)!==JSON.stringify(shard.schedule))throw new Error('Source and shipped schedule differ');
    result.groups++;result.lessons+=schedule.reduce((n,d)=>n+d.classes.length,0);
  }catch(e){result.failures.push({group:g.name,error:e.message})}
}
fs.writeFileSync(path.join(root,'docs/evidence/parser-revalidation.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify({groups:result.groups,lessons:result.lessons,failures:result.failures.length}));
if(result.failures.length || result.lessons!==catalog.meta.totalClasses)process.exitCode=1;
