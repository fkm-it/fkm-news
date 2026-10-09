/**
 * Ujian F4.1: e-mel alu-aluan, pautan e-mel ke aplikasi staf, noindex /app/.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { installed, OWNER } = require('./gas-mock');

test('F4.1: Admin daftar pengguna → e-mel alu-aluan dengan pautan /app/ dan peranan', () => {
  const gas = installed({});
  gas.as(OWNER);
  const before = gas.state.mails.length;
  const r = gas.ctx.api('user.create', { data: {
    email: 'penulis.baru@mail.fkm.utm.my', name: 'Penulis Baru', role: 'AUTHOR',
    department: 'FKM', position: 'Pensyarah'
  } });
  assert.equal(r.ok, true, JSON.stringify(r.error));
  const mails = gas.state.mails.slice(before);
  assert.equal(mails.length, 1);
  const m = mails[0];
  assert.equal(m.to, 'penulis.baru@mail.fkm.utm.my');
  assert.match(m.subject, /didaftarkan/);
  assert.ok(m.htmlBody.includes('https://fkm-it.github.io/fkm-news/app/'), 'pautan /app/ dalam e-mel');
  assert.ok(m.htmlBody.includes('Penulis'), 'peranan dinyatakan');
  assert.ok(!m.htmlBody.includes('<script'), 'tiada skrip');
});

test('F4.1: e-mel alu-aluan tidak dihantar jika pendaftaran ditolak (bukan admin)', () => {
  const gas = installed({});
  gas.as('author1@mail.fkm.utm.my');
  const before = gas.state.mails.length;
  const r = gas.ctx.api('user.create', { data: { email: 'x@mail.fkm.utm.my', name: 'X', role: 'ADMIN' } });
  assert.equal(r.ok, false);
  assert.equal(gas.state.mails.length, before);
});

test('F4.1: pautan e-mel notifikasi menuju STAFF_APP_URL', () => {
  const gas = installed({});
  gas.as(OWNER);
  gas.ctx.GlobalSettings.updateGlobalSetting('EMAIL_ENABLED', true, 'TEST');
  gas.ctx.NotificationService.sendEmail('a@mail.fkm.utm.my', 'Ujian', 'Mesej', 'NEWS-2026-00001');
  const m = gas.state.mails.pop();
  assert.ok(m.htmlBody.includes('https://fkm-it.github.io/fkm-news/app/?page=news-detail&id=NEWS-2026-00001'), m.htmlBody.slice(0, 300));

  gas.ctx.GlobalSettings.updateGlobalSetting('STAFF_APP_URL', 'https://berita.fkm.example/app/', 'TEST');
  assert.equal(gas.ctx.NotificationService.appUrl(), 'https://berita.fkm.example/app/');
});

test('F4.1: /app/ bertanda noindex; portal awam tidak', () => {
  const out = path.join(__dirname, '..', '.verify-web-test');
  execFileSync('node', [path.join(__dirname, '..', 'tools', 'build-web.js'), '--api', 'https://script.google.com/macros/s/X/exec', '--out', out]);
  try {
    assert.ok(fs.readFileSync(path.join(out, 'app', 'index.html'), 'utf8').includes('noindex'));
    assert.ok(!fs.readFileSync(path.join(out, 'index.html'), 'utf8').includes('noindex'));
  } finally { fs.rmSync(out, { recursive: true, force: true }); }
});
