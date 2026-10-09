/**
 * Ujian keselamatan F1 (S1–S4 dalam AUDIT_F0_FKM_NEWS.md).
 * Dijalankan dalam dua susunan muat (alpha, reverse).
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadGas, installed, OWNER, SRC, listSources } = require('./gas-mock');

const STRANGER = 'orangluar@mail.fkm.utm.my';
const A1 = 'author1@mail.fkm.utm.my';
const A2 = 'author2@mail.fkm.utm.my';
const ED = 'editor@mail.fkm.utm.my';

/**
 * Fungsi global yang SENGAJA boleh dipanggil oleh klien (google.script.run)
 * atau oleh Apps Script sendiri (doGet/doPost). Semua fungsi global lain
 * mesti bermula dengan requireOwner_() atau requireOwnerOrTrigger_().
 */
const PUBLIC_ENTRY = new Set([
  'doGet', 'doPost', 'include', 'api', 'publicApi', 'publicSidebar',
  // Fungsi tulen yang hanya membaca kamus statik I18N
  't', 'getDictionary'
]);

/** Fungsi global yang dikunci tetapi juga dipanggil oleh trigger masa. */
const TRIGGER_HANDLERS = new Set(['dailyMaintenance', 'weeklyBackup']);

function topLevelFunctions() {
  const out = [];
  listSources().forEach(f => {
    const src = fs.readFileSync(path.join(SRC, f), 'utf8');
    const re = /^function\s+([A-Za-z0-9_$]+)\s*\(([^)]*)\)\s*\{/gm;
    let m;
    while ((m = re.exec(src))) {
      const name = m[1];
      if (name.endsWith('_')) continue; // peribadi: tidak boleh dipanggil oleh google.script.run
      const body = src.slice(m.index + m[0].length, m.index + m[0].length + 400);
      out.push({ file: f, name, body });
    }
  });
  return out;
}

function firstStatement(body) {
  return body
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').map(l => l.replace(/\/\/.*$/, '').trim()).filter(Boolean)[0] || '';
}

function sampleNews(gas, email, extra) {
  gas.as(email);
  const boot = gas.ctx.api('session.bootstrap', {});
  assert.ok(boot.ok, JSON.stringify(boot.error));
  const r = gas.ctx.api('news.create', {
    data: Object.assign({
      title: 'Berita ujian keselamatan',
      categoryId: boot.data.categories[0].categoryId,
      summary: 'Ringkasan berita ujian yang cukup panjang untuk lulus validasi.',
      content: '<p>Kandungan asal.</p>'
    }, extra || {})
  });
  assert.ok(r.ok, JSON.stringify(r.error));
  return r.data.newsId;
}

const PNG = Buffer.from('89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C4890000000D4944415478DA63F8FFFF3F0005FE02FEA7D6A4F60000000049454E44AE426082', 'hex');
const JPG = Buffer.from('FFD8FFE000104A46494600010100000100010000FFD9', 'hex');
const b64 = b => Buffer.from(b).toString('base64');

for (const order of ['alpha', 'reverse']) {

  /* ================================================================ S1 */

  test(`[${order}] S1: setiap fungsi global bukan-pintu-masuk bermula dengan guard pemilik`, () => {
    const offenders = topLevelFunctions()
      .filter(f => !PUBLIC_ENTRY.has(f.name))
      .filter(f => !/^requireOwner(OrTrigger)?_\(/.test(firstStatement(f.body)))
      .map(f => `${f.file}:${f.name}`);
    assert.deepEqual(offenders, [], 'Fungsi global tanpa guard: ' + offenders.join(', '));
  });

  test(`[${order}] S1: orang luar dan pelawat anonim ditolak oleh semua fungsi operasi`, () => {
    const gas = installed({ order });
    const usersBefore = gas.ctx.SheetDB.findAll('USERS').length;
    const fns = topLevelFunctions().filter(f => !PUBLIC_ENTRY.has(f.name));
    assert.ok(fns.length > 30, 'sepatutnya ada banyak fungsi operasi');

    for (const who of [STRANGER, A1, '']) {
      gas.as(who);
      for (const f of fns) {
        assert.throws(() => gas.ctx[f.name]('penyerang@mail.fkm.utm.my', 'x'),
          /pemilik skrip/i, `${f.name} sepatutnya ditolak untuk "${who || 'anon'}"`);
      }
    }
    gas.ctx.SheetDB.invalidate();
    assert.equal(gas.ctx.SheetDB.findAll('USERS').length, usersBefore,
      'setupSystem() tidak boleh mencipta pengguna untuk bukan-pemilik');
  });

  test(`[${order}] S1: pemilik masih boleh menjalankan fungsi operasi dari editor`, () => {
    const gas = installed({ order });
    gas.as(OWNER);
    assert.doesNotThrow(() => gas.ctx.healthCheck());
    assert.doesNotThrow(() => gas.ctx.getGlobalSettings());
  });

  test(`[${order}] S1: trigger sah dibenarkan, triggerUid palsu ditolak`, () => {
    const gas = installed({ order });
    gas.as(OWNER);
    gas.ctx.installTriggers();
    const t = gas.state.triggers.find(x => x.getHandlerFunction() === 'dailyMaintenance');
    assert.ok(t, 'trigger dailyMaintenance dipasang');

    gas.anon();
    assert.doesNotThrow(() => gas.ctx.dailyMaintenance({ triggerUid: t.getUniqueId() }));
    assert.throws(() => gas.ctx.dailyMaintenance({ triggerUid: '424242' }), /pemilik skrip/i);
    assert.throws(() => gas.ctx.dailyMaintenance(), /pemilik skrip/i);
    gas.as(STRANGER);
    assert.throws(() => gas.ctx.weeklyBackup({ triggerUid: '1' }), /pemilik skrip/i);
  });

  test(`[${order}] S1: weeklyBackup dari trigger sebenar berjaya membuat sandaran`, () => {
    const gas = installed({ order });
    gas.as(OWNER);
    gas.ctx.installBackupTrigger();
    const t = gas.state.triggers.find(x => x.getHandlerFunction() === 'weeklyBackup');
    assert.ok(t, 'trigger weeklyBackup dipasang');
    let copied = 0;
    const ssFile = gas.ctx.DriveApp.getFileById;
    gas.ctx.DriveApp.getFileById = id => (id.startsWith('ss_')
      ? { makeCopy: () => { copied++; return { getId: () => 'copy', getName: () => 'c' }; } }
      : ssFile(id));
    gas.anon(); // konteks trigger: tiada pengguna aktif
    gas.ctx.weeklyBackup({ triggerUid: t.getUniqueId() });
    assert.equal(copied, 1, 'sandaran sepatutnya dibuat');
    assert.equal(gas.state.mails.length, 0, 'tiada emel kegagalan');
  });

  test(`[${order}] S1: pintu masuk klien masih berfungsi`, () => {
    const gas = installed({ order });
    gas.as(OWNER);
    gas.ctx.GlobalSettings.updateGlobalSetting('PUBLIC_PORTAL_ENABLED', true, 'TEST');
    gas.anon();
    assert.equal(gas.ctx.publicApi('public.home', {}).ok, true);
    assert.equal(gas.ctx.publicSidebar('bm').ok, true);
    gas.as(A1);
    assert.equal(gas.ctx.api('session.bootstrap', {}).ok, true);
  });

  /* ================================================================ S2 */

  const XSS = [
    '<img/src=x/onerror=alert(1)>',
    '<img src=x onerror=alert(1)>',
    '<img src="x"onerror="alert(1)">',
    '<a href=javascript:alert(1)>x</a>',
    '<a href="jav&#x61;script:alert(1)">x</a>',
    '<a href="  JaVaScRiPt:alert(1)">x</a>',
    '<a href="java\tscript:alert(1)">x</a>',
    '<a href="data:text/html,<script>alert(1)</script>">x</a>',
    '<script>alert(1)</script>',
    '<scr<script>ipt>alert(1)</script>',
    '<svg onload=alert(1)>',
    '<svg><script>alert(1)</script></svg>',
    '<iframe src="https://evil.example"></iframe>',
    '<div style="background:url(javascript:alert(1))">x</div>',
    '<p title="x" onmouseover="alert(1)">x</p>',
    '<math><mtext><img src=x onerror=alert(1)></mtext></math>',
    '<a href="https://ok.example" onclick="alert(1)">x</a>',
    '<img src="https://ok.example/a.png" onerror=alert(1)//>',
    '<<img src=x onerror=alert(1)>',
    '<!--<img src=x onerror=alert(1)>-->',
    '<p>teks</p><style>*{}</style>',
    '<form action="https://evil"><input name=x></form>',
    '<img src="javascript:alert(1)">',
    '<a href="vbscript:msgbox(1)">x</a>',
    '<a href="&#106;avascript:alert(1)">x</a>'
  ];

  function assertSafe(out, payload) {
    const lower = out.toLowerCase();
    assert.ok(!/<\s*(script|style|iframe|svg|math|object|embed|form|input|link|meta)\b/.test(lower), `tag bahaya lepas: ${payload} => ${out}`);
    assert.ok(!/\son[a-z]+\s*=/.test(lower) && !/[\/"']on[a-z]+\s*=/.test(lower), `pengendali acara lepas: ${payload} => ${out}`);
    assert.ok(!/(javascript|vbscript|data)\s*:/.test(lower.replace(/&#x?0*6a;|&#0*106;/g, 'j')), `protokol bahaya lepas: ${payload} => ${out}`);
    assert.ok(!/style\s*=/.test(lower), `atribut style lepas: ${payload} => ${out}`);
  }

  test(`[${order}] S2: sanitizeHtml menolak semua muatan XSS`, () => {
    const gas = installed({ order });
    for (const p of XSS) assertSafe(gas.ctx.Security.sanitizeHtml(p), p);
  });

  test(`[${order}] S2: kandungan sah dikekalkan`, () => {
    const gas = installed({ order });
    const S = gas.ctx.Security;
    const ok = '<h2>Tajuk</h2><p>Teks <strong>tebal</strong>, <em>condong</em> &amp; <u>garis</u>.</p>' +
      '<ul><li>satu</li><li>dua</li></ul><blockquote>petikan</blockquote>' +
      '<p><a href="https://mech.utm.my/fkmnews">pautan</a></p>' +
      '<figure><img src="https://drive.google.com/thumbnail?id=abc&amp;sz=w1200" alt="gambar"><figcaption>Kapsyen</figcaption></figure>';
    const out = S.sanitizeHtml(ok);
    for (const frag of ['<h2>Tajuk</h2>', '<strong>tebal</strong>', '<em>condong</em>', '&amp;', '<li>satu</li>',
      '<blockquote>petikan</blockquote>', 'href="https://mech.utm.my/fkmnews"', 'src="https://drive.google.com/thumbnail?id=abc&amp;sz=w1200"',
      'alt="gambar"', '<figcaption>Kapsyen</figcaption>']) {
      assert.ok(out.includes(frag), `hilang: ${frag}\n=> ${out}`);
    }
    assert.ok(/<a [^>]*rel="noopener noreferrer"/.test(S.sanitizeHtml('<a href="https://x.example" target="_blank">x</a>')));
    assert.equal(S.sanitizeHtml('<p>a<br>b</p>'), '<p>a<br>b</p>');
    assert.ok(S.sanitizeHtml('<a href="mailto:a@utm.my">e</a>').includes('href="mailto:a@utm.my"'));
    assert.ok(S.sanitizeHtml('<a href="/relatif">r</a>').includes('href="/relatif"'));
  });

  test(`[${order}] S2: kandungan lama yang tercemar dibersihkan semasa dibaca`, () => {
    const gas = installed({ order });
    const id = sampleNews(gas, A1);
    const row = gas.ctx.SheetDB.findOneBy('NEWS', 'NewsID', id);
    gas.ctx.SheetDB.updateRow('NEWS', row._row, {
      Content: '<p>ok</p><img/src=x/onerror=alert(1)>', ContentEn: '<a href=javascript:alert(1)>x</a>',
      Status: 'PUBLISHED', PublishedAt: new Date()
    });

    gas.as(OWNER);
    const d = gas.ctx.api('news.detail', { newsId: id });
    assert.ok(d.ok, JSON.stringify(d.error));
    assertSafe(d.data.content, 'news.detail');
    assertSafe(d.data.contentEn, 'news.detail EN');

    const pa = gas.ctx.api('portal.article', { newsId: id, countView: false });
    assert.ok(pa.ok, JSON.stringify(pa.error));
    assertSafe(pa.data.content, 'portal.article');

    gas.ctx.GlobalSettings.updateGlobalSetting('PUBLIC_PORTAL_ENABLED', true, 'TEST');
    gas.anon();
    const pub = gas.ctx.publicApi('public.article', { newsId: id, lang: 'en' });
    assert.ok(pub.ok, JSON.stringify(pub.error));
    assertSafe(pub.data.content, 'public.article');
  });

  test(`[${order}] S2: XSS yang dihantar melalui news.create disimpan dalam bentuk bersih`, () => {
    const gas = installed({ order });
    const id = sampleNews(gas, A1, { content: '<p>x</p><img/src=x/onerror=alert(1)>' });
    const row = gas.ctx.SheetDB.findOneBy('NEWS', 'NewsID', id);
    assertSafe(String(row.Content), 'stored');
  });

  /* ================================================================ S3 */

  test(`[${order}] S3: penulis lain tidak boleh membaca versi, gambar, lampiran, sejarah sosial`, () => {
    const gas = installed({ order });
    const id = sampleNews(gas, A1);
    for (const action of ['news.versions', 'image.list', 'attachment.list', 'social.history']) {
      gas.as(A2);
      const r = gas.ctx.api(action, { newsId: id });
      assert.equal(r.ok, false, `${action} sepatutnya ditolak untuk penulis lain`);
      assert.equal(r.error.code, 'FORBIDDEN', action);

      gas.as(A1);
      assert.equal(gas.ctx.api(action, { newsId: id }).ok, true, `${action} pemilik`);
      gas.as(OWNER);
      assert.equal(gas.ctx.api(action, { newsId: id }).ok, true, `${action} admin`);
    }
  });

  test(`[${order}] S3: editor tidak boleh membaca draf`, () => {
    const gas = installed({ order });
    const id = sampleNews(gas, A1);
    gas.as(ED);
    const r = gas.ctx.api('news.versions', { newsId: id });
    assert.equal(r.ok, false);
  });

  /* ================================================================ S4 */

  test(`[${order}] S4: muat naik disemak dengan magic bytes`, () => {
    const gas = installed({ order });
    const id = sampleNews(gas, A1);
    gas.as(A1);
    const up = (name, buf, mime) => gas.ctx.api('image.upload', { newsId: id, files: [{ name, mimeType: mime, data: b64(buf) }] });

    const bad = [
      ['palsu.jpg', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>'), 'image/jpeg'],
      ['palsu.png', Buffer.from('MZ\x90\x00binari'), 'image/png'],
      ['html.webp', Buffer.from('<html><script>alert(1)</script>'), 'image/webp'],
      ['jpg-sebagai.png', JPG, 'image/png'],
      ['vektor.svg', Buffer.from('<svg/>'), 'image/svg+xml']
    ];
    for (const [n, buf, mime] of bad) {
      const r = up(n, buf, mime);
      assert.equal(r.ok, false, `${n} sepatutnya ditolak`);
    }

    let r = up('betul.png', PNG, 'image/png');
    assert.ok(r.ok, JSON.stringify(r.error));
    r = up('foto.JPG', JPG, 'application/octet-stream');
    assert.ok(r.ok, JSON.stringify(r.error));
    const img = r.data.find(i => /foto/i.test(i.fileName));
    assert.equal(img.mimeType, 'image/jpeg', 'jenis MIME diambil daripada kandungan, bukan klien');
  });

  test(`[${order}] S4: lampiran PDF disemak`, () => {
    const gas = installed({ order });
    const id = sampleNews(gas, A1);
    gas.as(A1);
    let r = gas.ctx.api('attachment.upload', { newsId: id, file: { name: 'a.pdf', mimeType: 'application/pdf', data: b64('<html>bukan pdf') } });
    assert.equal(r.ok, false);
    r = gas.ctx.api('attachment.upload', { newsId: id, file: { name: 'a.pdf', mimeType: 'application/pdf', data: b64('%PDF-1.4\n%%EOF') } });
    assert.ok(r.ok, JSON.stringify(r.error));
  });
}

test('runSecurityTests() sedia ada masih lulus sepenuhnya', () => {
  const gas = installed({});
  gas.as(OWNER);
  const report = String(gas.ctx.runSecurityTests());
  const m = report.match(/(\d+)\/(\d+) lulus/);
  assert.ok(m, report.slice(0, 200));
  assert.equal(m[1], m[2], report.split('GAGAL')[1] || report.slice(0, 400));
});
