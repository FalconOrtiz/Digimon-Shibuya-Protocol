import { readFileSync, writeFileSync } from 'node:fs';
const file = process.argv[2];
const pairs = JSON.parse(readFileSync(process.argv[3], 'utf8'));
let s = readFileSync(file, 'utf8');
const missing = [];
for (const [a, b] of pairs) {
  if (!s.includes(a)) { missing.push(a); continue; }
  s = s.split(a).join(b);
}
writeFileSync(file, s);
console.log(file, 'replaced', pairs.length - missing.length, 'missing', JSON.stringify(missing));
