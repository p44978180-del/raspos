import fs from 'fs';

// Mock browser globals for Node.js execution
if (typeof globalThis.document === 'undefined') {
  globalThis.document = {
    createElement: () => ({
      getContext: () => null,
      style: {},
    }),
    getElementsByTagName: () => [],
    head: { appendChild: () => {} },
  };
  globalThis.window = globalThis;
}

const pdfData = new Uint8Array(fs.readFileSync('sample_schedule.pdf'));

async function run() {
  const pdfjs = await import('../public/vendor/pdf.min.js');
  const pdfjsLib = globalThis.pdfjsLib || pdfjs.default || pdfjs;
  
  // Disable worker in node or use standard fake worker
  pdfjsLib.GlobalWorkerOptions.workerSrc = '';

  const loadingTask = pdfjsLib.getDocument({
    data: pdfData,
    disableFontFace: true,
  });
  const doc = await loadingTask.promise;
  console.log('PDF loaded! Total pages:', doc.numPages);

  for (let pageNum = 1; pageNum <= Math.min(doc.numPages, 3); pageNum++) {
    const page = await doc.getPage(pageNum);
    const textContent = await page.getTextContent();
    console.log(`--- Page ${pageNum} text items (${textContent.items.length}) ---`);
    const strings = textContent.items.map(item => item.str).filter(s => s.trim().length > 0);
    console.log('First 60 text items:');
    console.log(strings.slice(0, 60).join(' | '));
  }
}

run().catch(console.error);
