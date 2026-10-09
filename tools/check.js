/**
 * check.js — semakan statik sebelum deploy.
 *  1. Sintaks setiap fail .gs (diparse oleh V8).
 *  2. Apps Script membuang teks selepas '//' dalam <script> fail HTML
 *     (termasuk dalam string, URL dan regex). Laporkan setiap kejadian
 *     yang BAHARU berbanding garis asas.
 *  3. Rahsia tidak boleh berada dalam repo.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');
let errors = 0;
const err = m => { errors++; console.error('✗ ' + m); };

/* 1. Sintaks .gs */
for (const f of fs.readdirSync(SRC).filter(f => f.endsWith('.gs'))) {
  try { new vm.Script(fs.readFileSync(path.join(SRC, f), 'utf8'), { filename: f }); }
  catch (e) { err(`${f}: ralat sintaks: ${e.message}`); }
}

/* 2. '//' dalam <script> HTML */
const baselineFile = path.join(__dirname, 'check-baseline.json');
const baseline = fs.existsSync(baselineFile) ? JSON.parse(fs.readFileSync(baselineFile, 'utf8')) : {};
const found = {};
for (const f of fs.readdirSync(SRC).filter(f => f.endsWith('.html'))) {
  const html = fs.readFileSync(path.join(SRC, f), 'utf8');
  const re = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
  let m, count = 0;
  while ((m = re.exec(html))) {
    m[1].split('\n').forEach(line => {
      // abaikan baris ulasan blok
      const code = line.replace(/\/\*.*?\*\//g, '');
      if (/(^|[^:\\])\/\//.test(code) || /['"]https?:\/\//.test(code)) count++;
    });
  }
  if (count) found[f] = count;
  if (count > (baseline[f] || 0)) {
    err(`${f}: ${count} baris dengan '//' dalam <script> (garis asas ${baseline[f] || 0}). ` +
      `Guna ulasan /* */ dan 'https:' + '\\/\\/…'.`);
  }
}
if (process.argv.includes('--update-baseline')) {
  fs.writeFileSync(baselineFile, JSON.stringify(found, null, 2) + '\n');
  console.log('Garis asas dikemas kini:', found);
}

/* 3. Rahsia */
const SECRET_PATTERNS = [
  /-----BEGIN (RSA |EC )?PRIVATE KEY-----/,
  /"private_key"\s*:/,
  /EAA[A-Za-z0-9]{40,}/,                  // token Facebook
  /ya29\.[A-Za-z0-9_\-]{20,}/,            // token OAuth Google
  /"refresh_token"\s*:\s*"1\/\//,
  /AIza[0-9A-Za-z_\-]{35}/                // kunci API Google
];
function walk(dir) {
  for (const f of fs.readdirSync(dir)) {
    if (['node_modules', '.git'].includes(f)) continue;
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) { walk(p); continue; }
    if (p === __filename) continue;
    const text = fs.readFileSync(p, 'utf8');
    SECRET_PATTERNS.forEach(re => { if (re.test(text)) err(`${path.relative(ROOT, p)}: kemungkinan rahsia (${re})`); });
  }
}
walk(ROOT);
if (fs.existsSync(path.join(ROOT, '.clasprc.json'))) err('.clasprc.json tidak boleh berada dalam repo');

if (errors) { console.error(`\n${errors} masalah.`); process.exit(1); }
console.log('✓ check lulus');
