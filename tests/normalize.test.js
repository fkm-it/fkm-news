/**
 * Ujian penyeragaman gambar 16:9 (image-normalize.html) — fungsi plan() tulen.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const HTML = fs.readFileSync(path.join(__dirname, '..', 'src', 'image-normalize.html'), 'utf8');
const script = HTML.match(/<script>([\s\S]*?)<\/script>/)[1];
const ctx = { window: {} };
vm.createContext(ctx);
vm.runInContext(script, ctx);
const plan = ctx.window.FKMImagePlan;
const near = (a, b) => Math.abs(a - b) < 0.01;

test('tiada // dalam <script>', () => {
  script.split('\n').forEach((line, i) => {
    const code = line.replace(/\/\*.*?\*\//g, '');
    assert.ok(!/(^|[^:\\])\/\//.test(code), 'baris ' + (i + 1));
  });
});

test('landskap 3:2 dipotong sedikit; 4:3 dipaparkan penuh', () => {
  const p32 = plan(3000, 2000, 'auto');
  assert.equal(p32.mode, 'cover');
  assert.ok(near(p32.src.w / p32.src.h, 16 / 9));
  assert.ok(near(p32.src.x, 0) && p32.src.y > 0, 'potong atas & bawah, condong ke atas');
  assert.equal(plan(4000, 3000, 'auto').mode, 'contain');
});

test('16:9 tepat → tiada potongan', () => {
  const p = plan(1920, 1080, 'auto');
  assert.equal(p.mode, 'cover');
  assert.deepEqual([p.src.x, p.src.y, p.src.w, p.src.h].map(Math.round), [0, 0, 1920, 1080]);
});

test('potret telefon 9:16 → gambar penuh di tengah, tiada bahagian dipotong', () => {
  const p = plan(1080, 1920, 'auto');
  assert.equal(p.mode, 'contain');
  assert.deepEqual([p.src.w, p.src.h], [1080, 1920]);
  assert.equal(p.dst.h, 900);
  assert.ok(near(p.dst.x, (1600 - p.dst.w) / 2), 'di tengah');
  assert.equal(p.w, 1600); assert.equal(p.h, 900);
});

test('panorama & segi empat → contain; mod paksa dihormati', () => {
  assert.equal(plan(6000, 1500, 'auto').mode, 'contain');
  assert.equal(plan(1000, 1000, 'auto').mode, 'contain');
  const c = plan(1080, 1920, 'cover');
  assert.equal(c.mode, 'cover');
  assert.ok(near(c.src.w / c.src.h, 16 / 9));
  assert.equal(plan(1920, 1080, 'contain').mode, 'contain');
});

test('borang berita menggunakan prepareNewsImage; Index memuatkan fail', () => {
  const form = fs.readFileSync(path.join(__dirname, '..', 'src', 'news-form.html'), 'utf8');
  const idx = fs.readFileSync(path.join(__dirname, '..', 'src', 'Index.html'), 'utf8');
  assert.match(form, /App\.prepareNewsImage \|\| App\.fileToBase64/);
  assert.ok(idx.includes("include('image-normalize')"));
});
