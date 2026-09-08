import fs from 'fs';
import path from 'path';

const outDir = 'cache_pdfs';
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const list = [
  { name: 'agro_1kurs.pdf', url: 'https://www.timacad.ru/uploads/files/20260902/1788357517_1%20%D0%BA%D1%83%D1%80%D1%81.pdf' },
  { name: 'zoo_1kurs.pdf', url: 'https://www.timacad.ru/uploads/files/20260902/1788357544_1%20%D0%BA%D1%83%D1%80%D1%81.pdf' },
  { name: 'sad_1kurs.pdf', url: 'https://www.timacad.ru/uploads/files/20260902/1788357523_2%20%D0%BA%D1%83%D1%80%D1%81.pdf' },
  { name: 'econ_1kurs.pdf', url: 'https://www.timacad.ru/uploads/files/20260410/1775804095_ze01-25.pdf' }
];

async function main() {
  for (const item of list) {
    const dest = path.join(outDir, item.name);
    if (!fs.existsSync(dest)) {
      console.log('Downloading', item.name);
      const res = await fetch(item.url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      const buf = await res.arrayBuffer();
      fs.writeFileSync(dest, Buffer.from(buf));
      console.log('Saved', dest, buf.byteLength, 'bytes');
    } else {
      console.log('Already cached:', dest);
    }
  }
}

main().catch(console.error);
