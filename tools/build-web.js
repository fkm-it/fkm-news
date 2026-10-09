/**
 * build-web.js — bina laman statik GitHub Pages TANPA mengubah fail sumber:
 *   /      portal awam   (src/Public.html)
 *   /app/  aplikasi staf (src/Index.html, log masuk OTP — F4)
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

const apiOrigin = new URL(api).origin;
const qp = k => `(new URLSearchParams(location.search).get('${k}') || '')`;
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

/**
 * Bina satu halaman daripada templat HtmlService.
 * @param {string} srcFile  fail dalam src/
 * @param {Array<[RegExp,string]>} scriptlets  penggantian <?= … ?>
 * @param {string} bridge   fail bridge dalam pwa/
 * @param {string} rel      laluan relatif ke akar Pages ('' atau '../')
 * @param {string} manifest nama fail manifest
 */
function buildPage(srcFile, scriptlets, bridge, rel, manifest, build, extraHead) {
  let html = fs.readFileSync(path.join(SRC, srcFile), 'utf8');

  html = html.replace(/<\?!=\s*include\(\s*['"]([\w-]+)['"]\s*\);?\s*\?>/g,
    (m, f) => fs.readFileSync(path.join(SRC, f + '.html'), 'utf8'));
  scriptlets.forEach(([re, val]) => { html = html.replace(re, val); });

  if (/<\?/.test(html)) {
    const left = html.match(/<\?[\s\S]{0,60}/)[0];
    throw new Error(`${srcFile}: scriptlet Apps Script yang belum ditangani: ${left}`);
  }
  if (!/<meta charset[^>]*>/i.test(html)) throw new Error(`${srcFile}: <meta charset> tidak dijumpai`);

  const head = [
    `<meta http-equiv="Content-Security-Policy" content="${csp}">`,
    '<meta name="theme-color" content="#6B1839">',
    '<meta name="description" content="Berita dan pengumuman Fakulti Kejuruteraan Mekanikal, UTM">',
    `<link rel="manifest" href="${manifest}">`,
    `<link rel="icon" type="image/png" sizes="192x192" href="${rel}icons/icon-192.png">`,
    `<link rel="apple-touch-icon" href="${rel}icons/apple-touch-icon.png">`,
    '<meta name="apple-mobile-web-app-capable" content="yes">',
    '<meta name="mobile-web-app-capable" content="yes">'
  ].concat(extraHead || []).join('\n  ');
  html = html.replace(/(<meta charset[^>]*>)/i, `$1\n  ${head}`);

  const boot =
    `<script>window.FKMNEWS_CONFIG = ${JSON.stringify({ apiUrl: api, build })};</script>\n` +
    `<script src="${rel}${bridge}?v=${build}"></script>\n`;
  const firstScript = html.search(/<script\b/i);
  html = html.slice(0, firstScript) + boot + html.slice(firstScript);

  const sw =
    `<script>if ('serviceWorker' in navigator) { window.addEventListener('load', function () {` +
    ` navigator.serviceWorker.register('${rel}sw.js', { scope: '${rel || './'}' }).catch(function () {}); }); }</script>\n`;
  return html.replace(/<\/body>/i, sw + '</body>');
}

const srcHash = crypto.createHash('sha256');
for (const f of fs.readdirSync(SRC).filter(f => f.endsWith('.html')).sort()) srcHash.update(fs.readFileSync(path.join(SRC, f)));
for (const f of ['bridge.js', 'app-bridge.js', 'sw.js']) srcHash.update(fs.readFileSync(path.join(PWA, f)));
const build = srcHash.update(api).digest('hex').slice(0, 10);

/* Portal awam (/) — Public.html */
const portalHtml = buildPage('Public.html', [
  [/'<\?=\s*bootLang\s*\?>'/g, qp('lang')],
  [/'<\?=\s*bootId\s*\?>'/g, qp('id')]
], 'bridge.js', '', 'manifest.webmanifest', build);

/* Aplikasi staf (/app/) — Index.html, log masuk OTP */
const appHtml = buildPage('Index.html', [
  [/'<\?=\s*bootPage\s*\?>'/g, `(${qp('page')} || (${qp('id')} ? 'portal-article' : 'dashboard'))`],
  [/'<\?=\s*bootId\s*\?>'/g, qp('id')]
], 'app-bridge.js', '../', 'manifest.webmanifest', build,
  ['<meta name="robots" content="noindex, nofollow">']);   /* jangan diindeks enjin carian */

/* tulis */
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'icons'), { recursive: true });
fs.mkdirSync(path.join(out, 'app'), { recursive: true });
fs.writeFileSync(path.join(out, 'index.html'), portalHtml);
fs.writeFileSync(path.join(out, '404.html'), portalHtml);
fs.writeFileSync(path.join(out, 'app', 'index.html'), appHtml);
for (const f of ['bridge.js', 'app-bridge.js']) fs.copyFileSync(path.join(PWA, f), path.join(out, f));
fs.writeFileSync(path.join(out, 'sw.js'),
  fs.readFileSync(path.join(PWA, 'sw.js'), 'utf8').replace('__BUILD__', build));
for (const f of fs.readdirSync(path.join(PWA, 'icons'))) {
  fs.copyFileSync(path.join(PWA, 'icons', f), path.join(out, 'icons', f));
}
const manifest = (name, start, scope, icons) => JSON.stringify({
  name, short_name: name,
  description: 'Berita dan pengumuman Fakulti Kejuruteraan Mekanikal, UTM',
  start_url: start, scope, display: 'standalone',
  background_color: '#F7F5F8', theme_color: '#6B1839', lang: 'ms',
  icons: [
    { src: icons + 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
    { src: icons + 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
  ]
}, null, 2);
fs.writeFileSync(path.join(out, 'manifest.webmanifest'), manifest('FKM News', './', './', ''));
fs.writeFileSync(path.join(out, 'app', 'manifest.webmanifest'), manifest('FKM News Staf', './', './', '../'));
fs.writeFileSync(path.join(out, '.nojekyll'), '');

console.log(`✓ Dibina → ${path.relative(ROOT, out)}/ (portal + app/, build ${build}, API ${apiOrigin})`);
