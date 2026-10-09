/**
 * build-web.js — bina portal awam statik untuk GitHub Pages daripada
 * src/Public.html TANPA mengubah fail sumber (antara muka kekal sama).
 *
 *   node tools/build-web.js --api https://script.google.com/macros/s/<ID>/exec [--out dist]
 *
 * Transformasi:
 *  - <?!= include('x'); ?>   → kandungan src/x.html
 *  - '<?= bootLang ?>'       → parameter ?lang= daripada URL
 *  - '<?= bootId ?>'         → parameter ?id= daripada URL
 *  - sisip config + bridge.js (google.script.run → fetch doPost)
 *  - sisip manifest, ikon, CSP, pendaftaran service worker
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const PWA = path.join(ROOT, 'pwa');

function arg(name, def) {
  const i = process.argv.indexOf('--' + name);
  return i !== -1 ? process.argv[i + 1] : def;
}

const api = arg('api', process.env.API_URL || '');
const out = path.resolve(ROOT, arg('out', 'dist'));
if (!/^https?:\/\//.test(api)) {
  console.error('✗ --api <URL /exec> diperlukan');
  process.exit(1);
}

let html = fs.readFileSync(path.join(SRC, 'Public.html'), 'utf8');

/* 1. include() */
html = html.replace(/<\?!=\s*include\(\s*['"]([\w-]+)['"]\s*\);?\s*\?>/g,
  (m, f) => fs.readFileSync(path.join(SRC, f + '.html'), 'utf8'));

/* 2. scriptlet boot */
const qp = k => `(new URLSearchParams(location.search).get('${k}') || '')`;
html = html.replace(/'<\?=\s*bootLang\s*\?>'/g, qp('lang'));
html = html.replace(/'<\?=\s*bootId\s*\?>'/g, qp('id'));

if (/<\?/.test(html)) {
  const left = html.match(/<\?[\s\S]{0,60}/)[0];
  console.error('✗ Scriptlet Apps Script yang belum ditangani: ' + left);
  process.exit(1);
}

/* 3. kepala PWA + CSP */
const apiOrigin = new URL(api).origin;
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' https: data: blob:",
  `connect-src 'self' ${apiOrigin} https://script.googleusercontent.com https://api.open-meteo.com`,
  "frame-src https://www.youtube.com https://www.youtube-nocookie.com https://drive.google.com",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'"
].join('; ');

const head = [
  `<meta http-equiv="Content-Security-Policy" content="${csp}">`,
  '<meta name="theme-color" content="#6B1839">',
  '<meta name="description" content="Berita dan pengumuman Fakulti Kejuruteraan Mekanikal, UTM">',
  '<link rel="manifest" href="manifest.webmanifest">',
  '<link rel="icon" type="image/png" sizes="192x192" href="icons/icon-192.png">',
  '<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">',
  '<meta name="apple-mobile-web-app-capable" content="yes">',
  '<meta name="mobile-web-app-capable" content="yes">'
].join('\n  ');
if (!/<meta charset[^>]*>/i.test(html)) { console.error('✗ <meta charset> tidak dijumpai'); process.exit(1); }
html = html.replace(/(<meta charset[^>]*>)/i, `$1\n  ${head}`);

/* 4. config + bridge sebelum skrip pertama */
const build = crypto.createHash('sha256').update(html + api).digest('hex').slice(0, 10);
const boot =
  `<script>window.FKMNEWS_CONFIG = ${JSON.stringify({ apiUrl: api, build })};</script>\n` +
  `<script src="bridge.js?v=${build}"></script>\n`;
const firstScript = html.search(/<script\b/i);
html = html.slice(0, firstScript) + boot + html.slice(firstScript);

/* 5. daftar service worker */
const sw =
  `<script>if ('serviceWorker' in navigator) { window.addEventListener('load', function () {` +
  ` navigator.serviceWorker.register('sw.js').catch(function () {}); }); }</script>\n`;
html = html.replace(/<\/body>/i, sw + '</body>');

/* tulis */
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'icons'), { recursive: true });
fs.writeFileSync(path.join(out, 'index.html'), html);
fs.writeFileSync(path.join(out, '404.html'), html);
fs.copyFileSync(path.join(PWA, 'bridge.js'), path.join(out, 'bridge.js'));
fs.writeFileSync(path.join(out, 'sw.js'),
  fs.readFileSync(path.join(PWA, 'sw.js'), 'utf8').replace('__BUILD__', build));
for (const f of fs.readdirSync(path.join(PWA, 'icons'))) {
  fs.copyFileSync(path.join(PWA, 'icons', f), path.join(out, 'icons', f));
}
fs.writeFileSync(path.join(out, 'manifest.webmanifest'), JSON.stringify({
  name: 'FKM News',
  short_name: 'FKM News',
  description: 'Berita dan pengumuman Fakulti Kejuruteraan Mekanikal, UTM',
  start_url: './',
  scope: './',
  display: 'standalone',
  background_color: '#F7F5F8',
  theme_color: '#6B1839',
  lang: 'ms',
  icons: [
    { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
    { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
  ]
}, null, 2));
fs.writeFileSync(path.join(out, '.nojekyll'), '');

console.log(`✓ Portal dibina → ${path.relative(ROOT, out)}/ (build ${build}, API ${apiOrigin})`);
