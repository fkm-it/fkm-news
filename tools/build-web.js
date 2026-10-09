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
  "script-src 'self' 'unsafe-inline' https://www.gstatic.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' https: data: blob:",
  `connect-src 'self' ${apiOrigin} https://script.googleusercontent.com https://api.open-meteo.com` +
    ' https://www.gstatic.com https://firebaseinstallations.googleapis.com https://fcmregistrations.googleapis.com',
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
    `<script src="${rel}${bridge}?v=${build}"></script>\n` +
    `<script src="${rel}push.js?v=${build}"></script>\n`;
  const firstScript = html.search(/<script\b/i);
  html = html.slice(0, firstScript) + boot + html.slice(firstScript);

  const sw =
    `<script>if ('serviceWorker' in navigator) { window.addEventListener('load', function () {` +
    ` navigator.serviceWorker.register('${rel}sw.js', { scope: '${rel || './'}' }).catch(function () {}); }); }</script>\n`;
  return html.replace(/<\/body>/i, sw + '</body>');
}

const srcHash = crypto.createHash('sha256');
for (const f of fs.readdirSync(SRC).filter(f => f.endsWith('.html')).sort()) srcHash.update(fs.readFileSync(path.join(SRC, f)));
for (const f of ['bridge.js', 'app-bridge.js', 'sw.js', 'push.js']) srcHash.update(fs.readFileSync(path.join(PWA, f)));
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
for (const f of ['bridge.js', 'app-bridge.js', 'push.js']) fs.copyFileSync(path.join(PWA, f), path.join(out, f));
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

/* ------------------------------------------- Portal statik (F5) ------ */
/*
 * data/ ditolak ke repo oleh StaticSite.gs setiap kali berita diterbitkan.
 * Salin ke laman, dan jana halaman /b/<slug>/ (pratonton kongsi + SEO),
 * dan sitemap.xml. (robots.txt tidak berguna pada laman projek /fkm-news/;
 * /app/ dilindungi meta noindex.)
 */
const baseArg = arg('base', process.env.PUBLIC_BASE_URL || '') || '';
const base = /^https?:\/\//.test(baseArg) ? baseArg.replace(/\/?$/, '/') : '';
const dataDir = path.resolve(ROOT, arg('data', 'data'));
let pages = 0;
if (fs.existsSync(path.join(dataDir, 'index.json'))) {
  fs.cpSync(dataDir, path.join(out, 'data'), { recursive: true });
  const idx = JSON.parse(fs.readFileSync(path.join(dataDir, 'index.json'), 'utf8'));
  /* Ringkasan dipotong di pelayan boleh memecahkan pasangan surrogate
     (tajuk huruf tebal Unicode) → buang separuh yang tinggal. */
  const esc = v => String(v == null ? '' : v)
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '')
    .replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const safeSlug = (s, id) => (String(s || '').toLowerCase().replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '').slice(0, 120)) || String(id).toLowerCase();
  const seen = new Set();
  const urls = [];

  for (const a of idx.articles || []) {
    let slug = safeSlug(a.slug, a.id);
    if (seen.has(slug)) slug = slug + '-' + String(a.id).toLowerCase();
    seen.add(slug);
    a.pageSlug = slug;

    let art = {};
    try {
      const env = JSON.parse(fs.readFileSync(path.join(dataDir, 'bm', 'a', a.id + '.json'), 'utf8'));
      art = env.data || {};
    } catch (e) { continue; }

    const url = base ? base + 'b/' + slug + '/' : '';
    const img = /^https:\/\//.test(a.imageUrl || '') ? a.imageUrl : (base ? base + 'icons/icon-512.png' : '');
    const desc = a.summary || '';
    const portal = `../../?view=reader&id=${encodeURIComponent(a.id)}&lang=bm`;
    const html = `<!doctype html>
<html lang="ms"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(a.title)} · ${esc(idx.siteName || 'FKM News')}</title>
<meta name="description" content="${esc(desc)}">
${url ? `<link rel="canonical" href="${esc(url)}">` : ''}
<meta property="og:type" content="article">
<meta property="og:site_name" content="${esc(idx.siteName || 'FKM News')}">
<meta property="og:title" content="${esc(a.title)}">
<meta property="og:description" content="${esc(desc)}">
${url ? `<meta property="og:url" content="${esc(url)}">` : ''}
${img ? `<meta property="og:image" content="${esc(img)}">` : ''}
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#6B1839">
<link rel="icon" href="../../icons/icon-192.png">
<style>
body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;margin:0;background:#F7F5F8;color:#1f1a24;line-height:1.7}
main{max-width:760px;margin:0 auto;padding:24px 16px 48px}
.brand{font-weight:700;color:#6B1839;text-decoration:none}
h1{font-size:1.6rem;line-height:1.3;margin:18px 0 8px}
.meta{color:#6b6475;font-size:.9rem}
img{max-width:100%;height:auto;border-radius:10px}
.btn{display:inline-block;background:#6B1839;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;margin:18px 0}
</style>
</head><body><main>
<a class="brand" href="../../">${esc(idx.siteName || 'FKM News')}</a>
<h1>${esc(a.title)}</h1>
<p class="meta">${esc(art.publishedAt || '')} · ${esc(a.category || '')}</p>
${img && a.imageUrl ? `<p><img src="${esc(a.imageUrl)}" alt="${esc(a.title)}"></p>` : ''}
<p><strong>${esc(art.summary || desc)}</strong></p>
<article>${art.content || ''}</article>
<a class="btn" href="${portal}">Baca di portal ${esc(idx.siteName || 'FKM News')}</a>
</main>
<script>location.replace(${JSON.stringify(portal)});</script>
</body></html>
`;
    fs.mkdirSync(path.join(out, 'b', slug), { recursive: true });
    fs.writeFileSync(path.join(out, 'b', slug, 'index.html'), html);
    if (url) urls.push({ url, lastmod: a.publishedAt ? new Date(a.publishedAt).toISOString().slice(0, 10) : '' });
    pages++;
  }
  fs.writeFileSync(path.join(out, 'data', 'index.json'), JSON.stringify(idx));

  /* --------------------------------------- Arkib garis masa (F10) ---- */
  const MONTHS = ['Januari', 'Februari', 'Mac', 'April', 'Mei', 'Jun', 'Julai', 'Ogos',
    'September', 'Oktober', 'November', 'Disember'];
  const myt = ms => new Date(Number(ms) + 8 * 3600 * 1000);   // Asia/Kuala_Lumpur
  const groups = new Map();
  for (const a of (idx.articles || []).filter(x => x.publishedAt)
    .sort((x, y) => y.publishedAt - x.publishedAt)) {
    const d = myt(a.publishedAt);
    const key = d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0');
    if (!groups.has(key)) groups.set(key, { label: MONTHS[d.getUTCMonth()] + ' ' + d.getUTCFullYear(), items: [] });
    groups.get(key).items.push({ a, day: d.getUTCDate() });
  }
  const total = [...groups.values()].reduce((n, g) => n + g.items.length, 0);
  const archiveUrl = base ? base + 'arkib/' : '';
  const archive = `<!doctype html>
<html lang="ms"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Arkib berita · ${esc(idx.siteName || 'FKM News')}</title>
<meta name="description" content="Semua berita ${esc(idx.siteName || 'FKM News')} mengikut bulan, ${esc(idx.facultyName || '')}.">
${archiveUrl ? `<link rel="canonical" href="${esc(archiveUrl)}">` : ''}
<meta name="theme-color" content="#6B1839">
<link rel="icon" href="../icons/icon-192.png">
<style>
:root{--p:#6B1839;--a:#C8952B;--bg:#F7F5F8;--s:#fff;--t:#16202E;--m:#5C6B7F;--b:#E7E2EA}
@media (prefers-color-scheme:dark){:root{--bg:#141019;--s:#1D1724;--t:#F2EEF5;--m:#A79FB2;--b:#33293D;--p:#E4A3BF}}
*{box-sizing:border-box}
body{font-family:Poppins,"Segoe UI",system-ui,-apple-system,sans-serif;margin:0;background:var(--bg);color:var(--t);line-height:1.6}
header{background:#6B1839;color:#fff;padding:28px 16px}
header div,main{max-width:760px;margin:0 auto}
header a{color:#fff;text-decoration:none;font-size:.85rem;opacity:.85}
header h1{margin:8px 0 2px;font-size:1.7rem;line-height:1.25}
header p{margin:0;font-size:.85rem;opacity:.85}
main{padding:12px 16px 56px}
nav.months{display:flex;gap:6px;flex-wrap:wrap;margin:18px 0 6px}
nav.months a{font-size:.75rem;padding:5px 10px;border-radius:999px;border:1px solid var(--b);background:var(--s);color:var(--t);text-decoration:none}
section{margin-top:26px}
h2{position:sticky;top:0;background:var(--bg);margin:0;padding:10px 0;font-size:.8rem;letter-spacing:.08em;text-transform:uppercase;color:var(--p);z-index:1}
h2 span{color:var(--m);font-weight:400;letter-spacing:0;text-transform:none}
ol{list-style:none;margin:0;padding:0 0 0 22px;border-left:2px solid var(--b)}
li{position:relative;padding:10px 0 14px}
li:before{content:"";position:absolute;left:-29px;top:17px;width:12px;height:12px;border-radius:50%;background:var(--s);border:3px solid #C8952B}
li a{color:var(--t);text-decoration:none;font-weight:600;line-height:1.4}
li a:hover{color:var(--p);text-decoration:underline}
.meta{font-size:.75rem;color:var(--m);margin-top:2px}
.sum{font-size:.85rem;color:var(--m);margin:4px 0 0}
</style>
</head><body>
<header><div>
<a href="../">← ${esc(idx.siteName || 'FKM News')}</a>
<h1>Arkib berita</h1>
<p>${total} berita · ${esc(idx.facultyName || '')}</p>
</div></header>
<main>
<nav class="months" aria-label="Lompat ke bulan">${[...groups.entries()].map(([k, g]) =>
    `<a href="#m-${k}">${esc(g.label)}</a>`).join('')}</nav>
${[...groups.entries()].map(([k, g]) => `<section id="m-${k}">
<h2>${esc(g.label)} <span>· ${g.items.length} berita</span></h2>
<ol>
${g.items.map(({ a, day }) => {
    const href = a.pageSlug ? `../b/${a.pageSlug}/` : `../?view=reader&id=${encodeURIComponent(a.id)}&lang=bm`;
    return `<li><a href="${esc(href)}">${esc(a.title)}</a>
<div class="meta">${day} ${esc(g.label)}${a.category ? ' · ' + esc(a.category) : ''}</div>
${a.summary ? `<p class="sum">${esc(a.summary)}</p>` : ''}</li>`;
  }).join('\n')}
</ol>
</section>`).join('\n')}
${total ? '' : '<p>Belum ada berita diterbitkan.</p>'}
</main>
</body></html>
`;
  fs.mkdirSync(path.join(out, 'arkib'), { recursive: true });
  fs.writeFileSync(path.join(out, 'arkib', 'index.html'), archive);
  if (archiveUrl) urls.unshift({ url: archiveUrl, lastmod: '' });

  if (base) {
    fs.writeFileSync(path.join(out, 'sitemap.xml'),
      '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      `  <url><loc>${esc(base)}</loc></url>\n` +
      urls.map(u => `  <url><loc>${esc(u.url)}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}</url>`).join('\n') +
      '\n</urlset>\n');
  }
}

console.log(`✓ Dibina → ${path.relative(ROOT, out)}/ (portal + app/ + ${pages} halaman berita statik, build ${build}, API ${apiOrigin})`);
