import { execSync } from 'child_process';

const files = [
  'cache_pdfs/agro_1kurs.pdf',
  'cache_pdfs/zoo_1kurs.pdf',
  'cache_pdfs/sad_1kurs.pdf',
  'cache_pdfs/econ_1kurs.pdf'
];

for (const f of files) {
  console.log(`=== ${f} ===`);
  const out = execSync(`npx --yes pdf-parse text "${f}" --pages 1`, { encoding: 'utf8' });
  const lines = out.split('\n').filter(l => l.trim().length > 0);
  console.log('Header line:', lines[0]);
  console.log('Sample classes:');
  console.log(lines.slice(1, 10).join('\n'));
}
