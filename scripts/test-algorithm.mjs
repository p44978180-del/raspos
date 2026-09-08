import { execSync } from 'child_process';
import fs from 'fs';

// Let's test our parsing logic on sample_schedule.pdf
const out = execSync('npx --yes pdf-parse text sample_schedule.pdf -f json', { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
const parsed = JSON.parse(out);

const WEEKDAYS = ['ПОНЕДЕЛЬНИК', 'ВТОРНИК', 'СРЕДА', 'ЧЕТВЕРГ', 'ПЯТНИЦА', 'СУББОТА'];
const TIME_SLOTS = [
  { num: 1, start: '09:00', end: '10:35', pattern: /09\.00/ },
  { num: 2, start: '10:55', end: '12:30', pattern: /10\.55/ },
  { num: 3, start: '13:00', end: '14:35', pattern: /13\.00/ },
  { num: 4, start: '14:55', end: '16:30', pattern: /14\.55/ },
  { num: 5, start: '16:50', end: '18:25', pattern: /16\.50/ },
];

console.log('Parser test initialized. Testing extraction for group ДА 01-26...');
