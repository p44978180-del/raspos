import fs from 'fs';

const content = fs.existsSync('scripts/page1-text.txt') ? fs.readFileSync('scripts/page1-text.txt', 'utf8') : '';
const lines = content.split('\n');
lines.forEach((l, i) => {
  if (/звонк|режим|аудитор/i.test(l) && l.length < 200) {
    console.log((i+1) + ': ' + l.trim());
  }
});
