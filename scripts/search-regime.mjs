import fs from 'fs';

const content = fs.readFileSync('C:/Users/egorm/.gemini/antigravity/brain/e8de3604-fc40-486e-9b74-aa1d96568c9b/.system_generated/steps/20/content.md', 'utf8');
const lines = content.split('\n');
lines.forEach((l, i) => {
  if (/звонк|режим|аудитор/i.test(l) && l.length < 200) {
    console.log((i+1) + ': ' + l.trim());
  }
});
