import fs from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const pdfData = new Uint8Array(fs.readFileSync('sample_schedule.pdf'));

// Provide require in sandbox
const code = fs.readFileSync('public/vendor/pdf.legacy.js', 'utf8');
const fn = new Function('require', 'exports', 'module', code + '; return (typeof pdfjsLib !== "undefined" ? pdfjsLib : module.exports);');
const mod = { exports: {} };
const pdfjsLib = fn(require, mod.exports, mod);

pdfjsLib.GlobalWorkerOptions.workerSrc = '';

async function run() {
  const doc = await pdfjsLib.getDocument({ data: pdfData }).promise;
  console.log('PDF loaded! Total pages:', doc.numPages);
  
  for (let pageNum = 1; pageNum <= Math.min(doc.numPages, 2); pageNum++) {
    const page = await doc.getPage(pageNum);
    const content = await page.getTextContent();
    console.log(`\n=== PAGE ${pageNum} (${content.items.length} items) ===`);
    const lines = content.items.map(i => i.str).filter(s => s.trim().length > 0);
    console.log(lines.slice(0, 50).join(' | '));
  }
}

run().catch(console.error);
