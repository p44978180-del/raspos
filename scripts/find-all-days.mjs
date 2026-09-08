import fs from 'fs';

const lines = fs.readFileSync('src/App.tsx', 'utf8').split('\n');
lines.forEach((l, i) => {
  if (l.includes('ALL_DAYS')) {
    console.log((i+1) + ': ' + l.trim().slice(0, 100));
  }
});
