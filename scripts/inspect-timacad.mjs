import fs from 'fs';

const content = fs.readFileSync('C:/Users/egorm/.gemini/antigravity/brain/e8de3604-fc40-486e-9b74-aa1d96568c9b/.system_generated/steps/20/content.md', 'utf8');

const h5Regex = /<h5[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/h5>([\s\S]*?)(?=<h5|$)/g;

let match;
const data = [];
let totalFiles = 0;
while ((match = h5Regex.exec(content)) !== null) {
  const instituteName = match[1].replace(/\s+/g, ' ').trim();
  const sectionContent = match[2];
  
  const courseRegex = /<a href="([^"]+\.pdf)"[^>]*title="([^"]+)"/g;
  let courseMatch;
  const courses = [];
  while ((courseMatch = courseRegex.exec(sectionContent)) !== null) {
    courses.push({
      course: courseMatch[2].trim(),
      url: courseMatch[1].startsWith('http') ? courseMatch[1] : `https://www.timacad.ru${courseMatch[1]}`
    });
    totalFiles++;
  }
  if (courses.length > 0) {
    data.push({ institute: instituteName, count: courses.length, courses });
  }
}

console.log('Institutes summary:');
data.forEach((d, i) => console.log(`${i+1}. ${d.institute} (${d.count} files)`));
console.log('Total PDF files:', totalFiles);
