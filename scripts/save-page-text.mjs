import { execSync } from 'child_process';
import fs from 'fs';

const out = execSync('npx --yes pdf-parse text sample_schedule.pdf -f json', { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
const parsed = JSON.parse(out);

fs.writeFileSync('scripts/page1-text.txt', parsed.pages[0].text, 'utf8');
fs.writeFileSync('scripts/page2-text.txt', parsed.pages[1].text, 'utf8');
console.log('Saved page1-text.txt and page2-text.txt');
