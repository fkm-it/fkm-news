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
const { seedDemo } = require('../tests/demo-seed');
const gas = installed({});
const c = gas.ctx;
seedDemo(gas);

/* Portal statik (F5): tulis data/ daripada StaticSite.buildFiles() ke laman */
if (process.argv.includes('--static')) {
  gas.as(OWNER);
  const files = c.StaticSite.buildFiles();
  for (const [p, body] of Object.entries(files)) {
    const f = path.join(DIR, p);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, body);
  }
  gas.anon();
  console.log('data statik: ' + Object.keys(files).length + ' fail');
}

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
  // DEV SAHAJA: kod OTP terakhir bagi e-mel (tiada dalam binaan sebenar)
  if (req.method === 'GET' && req.url.startsWith('/__lastcode')) {
    const to = new URL(req.url, 'http://x').searchParams.get('to');
    const m = gas.state.mails.filter(x => x.to === to).pop();
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end(m ? (m.subject.match(/(\d{6})$/) || [])[1] || '' : '');
    return;
  }
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  else if (!path.extname(p)) p += '/index.html';
  const file = path.join(DIR, path.normalize(p).replace(/^(\.\.[\/\\])+/, ''));
  if (!file.startsWith(DIR) || !fs.existsSync(file)) { res.writeHead(404); res.end('404'); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, () => console.log(`dev-server http://localhost:${PORT} (${DIR})`));
