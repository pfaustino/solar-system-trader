import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const required = [
  'index.html',
  'ARCHITECTURE.md',
  'data/ships.json',
  'src/main.js',
];

for (const rel of required) {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) {
    console.error(`missing: ${rel}`);
    process.exit(1);
  }
}

const shipsPath = path.join(root, 'data/ships.json');
JSON.parse(fs.readFileSync(shipsPath, 'utf8'));

console.log('smoke-check ok');
