import { execSync } from 'child_process';

const out = execSync('npx --yes pdf-parse text sample_schedule.pdf -f json', { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
const parsed = JSON.parse(out);
console.log('Keys:', Object.keys(parsed));
console.log('Pages:', parsed.pages?.length);
if (parsed.pages?.[0]) {
  console.log('Page 1 keys:', Object.keys(parsed.pages[0]));
  console.log('Page 1 text sample:', typeof parsed.pages[0].text, parsed.pages[0].text?.slice(0, 300));
}
