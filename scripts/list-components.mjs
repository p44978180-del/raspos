import fs from 'fs';

const lines = fs.readFileSync('src/App.tsx', 'utf8').split('\n');
lines.forEach((l, i) => {
  const match = l.match(/^(?:export\s+)?function\s+([A-Za-z0-9_]+)/);
  if (match) console.log(`${i+1}: function ${match[1]}`);
});
