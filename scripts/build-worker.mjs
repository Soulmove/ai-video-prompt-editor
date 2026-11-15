import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'worker', 'index.mjs');
const OUT_DIR = path.join(ROOT, 'dist', 'server');
const OUT_FILE = path.join(OUT_DIR, 'index.js');

await fs.mkdir(OUT_DIR, { recursive: true });
await fs.copyFile(SRC, OUT_FILE);
console.log(`Built worker bundle -> ${path.relative(ROOT, OUT_FILE)}`);
