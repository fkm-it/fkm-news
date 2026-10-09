/**
 * dev-server.js — portal statik + backend Apps Script tiruan untuk E2E.
 *
 *   node tools/build-web.js --api http://localhost:8080/__api --out .verify-web
 *   node tools/dev-server.js --port 8080 --dir .verify-web
 *
 * POST /__api → doPost() dalam persekitaran tests/gas-mock.js (data demo).
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { installed, OWNER } = require('../tests/gas-mock');

const argv = k => { const i = process.argv.indexOf('--' + k); return i !== -1 ? process.argv[i + 1] : null; };
const PORT = Number(argv('port') || 8080);
const DIR = path.resolve(__dirname, '..', argv('dir') || '.verify-web');

/* ---------- data demo ---------- */
const gas = installed({});
const c = gas.ctx;
gas.as(OWNER);
c.GlobalSettings.updateGlobalSetting('PUBLIC_PORTAL_ENABLED', true, 'DEV');
const cats = c.NewsService.listCategories(true);
const IMG = n => `https://picsum.photos/seed/fkm${n}/1200/675`;
const sample = [
  ['Explorace Merdeka Seribu 2026 Meriahkan Sambutan Bulan Kebangsaan di UTM', 'Aktiviti'],
  ['Selamat Datang dan Selamat Menjalankan Tugas kepada Staf Baru FKM', 'Pengumuman'],
  ['Pelajar FKM Raih Pingat Emas di Pertandingan Inovasi Antarabangsa', 'Pencapaian'],
  ['Kerjasama Strategik FKM Bersama Industri Automotif Tempatan', 'Industri'],
  ['Bengkel Penulisan Jurnal Berimpak Tinggi untuk Pensyarah Muda', 'Aktiviti']
];
sample.forEach(([title, catName], i) => {
  const cat = cats.find(x => x.categoryName === catName) || cats[0];
  const id = c.Utils.nextId('NEWS', true);
  c.SheetDB.insert('NEWS', {
    NewsID: id, Title: title, Slug: c.Utils.slugify(title), CategoryID: cat.categoryId,
    AuthorID: 'USR-00001', Summary: 'Ringkasan berita: ' + title + '. Program ini melibatkan warga FKM.',
    Content: '<p>' + 'Kandungan penuh berita untuk ujian paparan. '.repeat(12) + '</p><h3>Sorotan</h3><ul><li>Satu</li><li>Dua</li></ul>',
    FeaturedImageURL: IMG(i), Status: 'PUBLISHED', CurrentVersion: 1, Tags: '',
    PublishedAt: new Date(Date.now() - i * 86400000 * 9), ViewCount: 10 + i,
    CreatedAt: new Date(), UpdatedAt: new Date(),
    TitleEn: i === 0 ? 'Merdeka Explorace 2026 Livens Up National Month at UTM' : ''
  });
});
c.SheetDB.invalidate();
gas.anon();

/* ---------- pelayan ---------- */
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.css': 'text/css' };

http.createServer((req, res) => {
  if (req.method === 'POST' && req.url.startsWith('/__api')) {
    let body = '';
    req.on('data', d => { body += d; });
    req.on('end', () => {
      gas.anon();
      const out = c.doPost({ postData: { contents: body } });
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(out._text);
    });
    return;
  }
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(DIR, path.normalize(p).replace(/^(\.\.[\/\\])+/, ''));
  if (!file.startsWith(DIR) || !fs.existsSync(file)) { res.writeHead(404); res.end('404'); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, () => console.log(`dev-server http://localhost:${PORT} (${DIR})`));
