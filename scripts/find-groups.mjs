import fs from 'fs';

const lines = fs.readFileSync('src/App.tsx', 'utf8').split('\n');
lines.forEach((l, i) => {
  if (l.includes('RGAU_GROUPS') || l.includes('GroupSheet') || l.includes('groupId')) {
    console.log((i+1) + ': ' + l.trim().slice(0, 100));
  }
});
