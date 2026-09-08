import fs from 'fs';
import zlib from 'zlib';

const buf = fs.readFileSync('sample_schedule.pdf');
const str = buf.toString('latin1');

const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
let match;
let idx = 0;
while ((match = streamRegex.exec(str)) !== null) {
  idx++;
  const rawStream = Buffer.from(match[1], 'latin1');
  try {
    const decompressed = zlib.inflateSync(rawStream);
    console.log(`Stream #${idx} size: ${decompressed.length}`);
    const s = decompressed.toString('latin1');
    if (s.includes('BT') && s.includes('ET')) {
      console.log(`Stream #${idx} has BT...ET blocks! Preview:`);
      console.log(s.slice(0, 500));
    }
  } catch (e) {
  }
}
