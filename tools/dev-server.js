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

/* Notifikasi push (F11): Firebase tiruan untuk E2E */
const pushSends = [];
if (process.argv.includes('--push')) {
  const crypto = require('crypto');
  const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  gas.as(OWNER);
  c.GlobalSettings.updateGlobalSetting('PUSH_ENABLED', true, 'DEV');
  c.GlobalSettings.updateGlobalSetting('FIREBASE_WEB_CONFIG',
    'const firebaseConfig = { apiKey: "AIza-dev", projectId: "fkm-news-dev", messagingSenderId: "123", appId: "1:123:web:abc" };', 'DEV');
  c.GlobalSettings.updateGlobalSetting('FIREBASE_VAPID_KEY', 'BDevVapidKey', 'DEV');
  gas.scriptProps.setProperty('FKMNEWS_FCM_SERVICE_ACCOUNT', JSON.stringify({
    project_id: 'fkm-news-dev', client_email: 'dev@fkm-news-dev.iam.gserviceaccount.com',
    private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) }));
  gas.anon();
  gas.state.fetchHandler = (url, params) => {
    if (/oauth2\.googleapis\.com/.test(url)) return { getResponseCode: () => 200, getContentText: () => '{"access_token":"dev"}' };
    if (/fcm\.googleapis\.com/.test(url)) pushSends.push(JSON.parse(params.payload).message);
    return { getResponseCode: () => 200, getContentText: () => '{}' };
  };
}

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

/* Pembantu AI (F8): Claude API tiruan untuk E2E */
if (process.argv.includes('--ai')) {
  gas.as(OWNER);
  c.GlobalSettings.updateGlobalSetting('AI_ENABLED', true, 'DEV');
  gas.scriptProps.setProperty('FKMNEWS_ANTHROPIC_KEY', 'sk-ant-dev');
  gas.anon();
  gas.state.fetchHandler = (url, params) => {
    const prompt = JSON.parse(params.payload).messages[0].content;
    let out = {};
    if (/nota kasar/i.test(prompt)) out = {
      title: 'Bengkel CAD 3D Perkasa Kemahiran Pelajar FKM',
      summary: 'Seramai 40 pelajar tahun dua menyertai bengkel CAD 3D anjuran Jabatan Reka Bentuk di Makmal E01, FKM.',
      content: '<p><strong>JOHOR BAHRU, 5 Oktober</strong> – Seramai 40 pelajar tahun dua menyertai bengkel <em>CAD 3D</em>.</p><p>Bengkel ini bertujuan meningkatkan kemahiran reka bentuk.</p>',
      suggestedCategory: 'Aktiviti', missingInfo: ['Nama penuh dan jawatan penceramah']
    };
    else if (/Semak berita/.test(prompt)) out = { score: 78, summary: 'Struktur baik; beberapa ejaan perlu dibetulkan.',
      items: [{ type: 'ejaan', location: 'perenggan 2', issue: 'dibengkel', suggestion: 'di bengkel' }] };
    else if (/Terjemahkan/.test(prompt)) out = { titleEn: 'Merdeka Explorace 2026', summaryEn: 'Summary EN', contentEn: '<p>Content EN</p>' };
    else out = { facebook: 'Kapsyen FB #FKMUTM', instagram: 'Kapsyen IG', linkedin: 'Caption LI' };
    return { getResponseCode: () => 200, getContentText: () => JSON.stringify({
      content: [{ type: 'text', text: JSON.stringify(out) }], usage: { input_tokens: 1000, output_tokens: 500 } }) };
  };
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
  // DEV SAHAJA: token push berdaftar & mesej yang dihantar (F11)
  if (req.method === 'GET' && req.url.startsWith('/__push')) {
    gas.as(OWNER);
    const sh = c.SpreadsheetApp.openById(c.CONFIG.getSpreadsheetId()).getSheetByName('PUSH_TOKENS');
    const rows = sh ? sh.getDataRange().getValues().slice(1) : [];
    gas.anon();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ rows, sends: pushSends }));
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
