/**
 * Ujian F9: alat pembaca (public-extras.html) — fungsi tulen tanpa DOM.
 * keyPoints() dan paparan diuji dalam pelayar sebenar oleh tools/e2e.py.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const HTML = fs.readFileSync(path.join(__dirname, '..', 'src', 'public-extras.html'), 'utf8');

function load() {
  const script = HTML.match(/<script>([\s\S]*?)<\/script>/)[1];
  const ctx = { window: { addEventListener() {} }, document: { readyState: 'complete', querySelector: () => null, documentElement: { lang: 'ms' } } };
  vm.createContext(ctx);
  vm.runInContext(script, ctx);
  return ctx.window.PubExtras;
}

test('tiada // dalam <script> (Apps Script memotongnya)', () => {
  const script = HTML.match(/<script>([\s\S]*?)<\/script>/)[1];
  script.split('\n').forEach((line, i) => {
    const code = line.replace(/\/\*.*?\*\//g, '');
    assert.ok(!/(^|[^:\\])\/\//.test(code) && !/['"]https?:\/\//.test(code), 'baris ' + (i + 1) + ': ' + line);
  });
});

test('sentences: pecah pada titik + huruf besar, gelaran tanpa titik kekal', () => {
  const X = load();
  const s = X.sentences('Prof Ts Dr Ahmad hadir. Program bermula 8 pagi! "Syabas," katanya. 2026 tahun hebat.');
  assert.equal(s.length, 4);
  assert.equal(s[0], 'Prof Ts Dr Ahmad hadir.');
  assert.equal(s[2], '"Syabas," katanya.');
  assert.deepEqual(Array.from(X.sentences('nilai 3.5 kali ganda. Seterusnya')), ['nilai 3.5 kali ganda.', 'Seterusnya']);
});

test('chunks: setiap cebisan ≤ 220 aksara dan tiada teks hilang', () => {
  const X = load();
  const long = Array.from({ length: 40 }, (_, i) => 'Ayat nombor ' + i + ' tentang kejuruteraan mekanikal.').join(' ') +
    ' ' + 'perkataan '.repeat(80).trim() + '.';
  const parts = X.chunks(long);
  assert.ok(parts.length > 5);
  parts.forEach(p => assert.ok(p.length <= 220, p.length));
  assert.equal(parts.join(' ').replace(/\s+/g, ' '), long.replace(/\s+/g, ' '));
});

test('pickVoice: BM → ms dahulu, kemudian id; BI → en-GB', () => {
  const X = load();
  const v = (lang, name) => ({ lang, name });
  const voices = [v('en-US', 'US'), v('id-ID', 'Indonesia'), v('en-GB', 'UK')];
  assert.equal(X.pickVoice(voices, 'bm').name, 'Indonesia');
  assert.equal(X.pickVoice(voices.concat([v('ms_MY', 'Melayu')]), 'bm').name, 'Melayu');
  assert.equal(X.pickVoice(voices, 'en').name, 'UK');
  assert.equal(X.pickVoice([v('en-US', 'US')], 'en').name, 'US');
  assert.equal(X.pickVoice([v('fr-FR', 'FR')], 'bm'), null);
  assert.equal(X.pickVoice([], 'bm'), null);
});

test('qrUrl: pautan dikodkan, https dan saiz', () => {
  const X = load();
  const u = X.qrUrl('https://fkm-it.github.io/fkm-news/b/a-b/?lang=en&x=1', 300);
  assert.ok(u.startsWith('https://api.qrserver.com/v1/create-qr-code/?size=300x300'));
  assert.ok(u.includes('data=https%3A%2F%2Ffkm-it.github.io%2Ffkm-news%2Fb%2Fa-b%2F%3Flang%3Den%26x%3D1'));
});

test('Public.html memuatkan public-extras dan memanggil attach selepas artikel', () => {
  const pub = fs.readFileSync(path.join(__dirname, '..', 'src', 'Public.html'), 'utf8');
  assert.ok(pub.includes("include('public-extras')"));
  assert.ok(pub.indexOf("include('public-extras')") < pub.indexOf('var Pub ='), 'dimuat sebelum skrip utama');
  assert.match(pub, /if \(window\.PubExtras\) window\.PubExtras\.attach\(a, state\.lang\);/);
});
