import fs from 'fs';

const page1 = fs.readFileSync('scripts/page1-text.txt', 'utf8');
const page2 = fs.readFileSync('scripts/page2-text.txt', 'utf8');

// The groups on page 1: ДА 01-26, ДА 02-26, ДА 03-26, ДА 04-26, ДА 05-26, ДА 07-26
// The groups on page 2: ДА 06-26, ДА 08-26, ДА 09-26, ДА 10-26, ДА 13-26, ДА 11-26, ДА 12-26

console.log('Sample schedule parser ready.');
