import fs from 'fs';
import path from 'path';

const vendorDir = 'public/vendor';
if (!fs.existsSync(vendorDir)) {
  fs.mkdirSync(vendorDir, { recursive: true });
}

async function downloadFile(url, dest) {
  console.log(`Downloading ${url} -> ${dest}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.statusText}`);
  const buf = await res.arrayBuffer();
  fs.writeFileSync(dest, Buffer.from(buf));
  console.log(`Saved ${dest} (${buf.byteLength} bytes)`);
}

async function main() {
  await downloadFile(
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
    path.join(vendorDir, 'pdf.min.js')
  );
  await downloadFile(
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
    path.join(vendorDir, 'pdf.worker.min.js')
  );
  console.log('PDF.js vendor files downloaded successfully!');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
