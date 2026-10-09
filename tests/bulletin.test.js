/**
 * Ujian F10: buletin bulanan.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('vm');
const { installed, OWNER } = require('./gas-mock');

const SEPT_10 = Date.UTC(2026, 8, 10, 2, 0, 0);
const SEPT_30_LATE = Date.UTC(2026, 8, 30, 17, 0, 0);   // 1 Okt 01:00 waktu Malaysia
const OCT_3 = Date.UTC(2026, 9, 3, 1, 0, 0);            // Sabtu 3 Okt 09:00 MYT
const OCT_12 = Date.UTC(2026, 9, 12, 1, 0, 0);

function setup(order) {
  const gas = installed({ order });
  const c = gas.ctx;
  gas.as(OWNER);
  c.GlobalSettings.updateGlobalSetting('EMAIL_ENABLED', true, 'TEST');
  c.GlobalSettings.updateGlobalSetting('PUBLIC_PORTAL_ENABLED', true, 'TEST');
  const VDate = vm.runInContext('Date', c);
  const at = ms => new VDate(ms);
  const cat = c.NewsService.listCategories(true)[0];
  const author = c.SheetDB.findOneBy('USERS', 'Email', 'author1@mail.fkm.utm.my');
  const add = (title, status, publishedMs) => {
    const id = c.Utils.nextId('NEWS', true);
    c.SheetDB.insert('NEWS', { NewsID: id, Title: title, Slug: '', Status: status, CategoryID: cat.categoryId,
      AuthorID: author.UserID, Summary: 'Ringkasan <b>' + title + '</b>', Content: '<p>Isi berita.</p>',
      PublishedAt: publishedMs ? at(publishedMs) : '', CreatedAt: at(SEPT_10), UpdatedAt: at(SEPT_10), ViewCount: 0 });
    return id;
  };
  add('Berita September <script>', 'PUBLISHED', SEPT_10);
  add('Berita Oktober awal pagi', 'PUBLISHED', SEPT_30_LATE);
  add('Draf September', 'DRAFT', '');
  add('Diarkib September', 'ARCHIVED', SEPT_10);
  c.SheetDB.invalidate();
  return { gas, c, at };
}

for (const order of ['alpha', 'reverse']) {

  test(`[${order}] F10: kumpul ikut bulan zon Malaysia, hanya PUBLISHED`, () => {
    const { c } = setup(order);
    const sept = c.BulletinService.collect('2026-09');
    assert.deepEqual(Array.from(sept, x => x.title), ['Berita September <script>']);
    const oct = c.BulletinService.collect('2026-10');
    assert.deepEqual(Array.from(oct, x => x.title), ['Berita Oktober awal pagi']);
    assert.equal(c.BulletinService.monthLabel('2026-09'), 'September 2026');
    assert.equal(c.BulletinService.previousMonthKey(new (vm.runInContext('Date', c))(Date.UTC(2026, 0, 5))), '2025-12');
    assert.throws(() => c.BulletinService.collect('2026-13'), /Bulan tidak sah/);
    assert.throws(() => c.BulletinService.collect("2026-09' OR 1"), /Bulan tidak sah/);
  });

  test(`[${order}] F10: HTML buletin di-escape, PDF dijana`, () => {
    const { c } = setup(order);
    const r = c.BulletinService.render('2026-09');
    assert.equal(r.count, 1);
    assert.match(r.html, /Berita September &lt;script&gt;/);
    assert.ok(!/<script>/.test(r.html));
    assert.ok(!/<b>/.test(r.html), 'tag dalam ringkasan dibuang');
    assert.match(r.subject, /Buletin .* September 2026/);
    const empty = c.BulletinService.render('2025-01');
    assert.match(empty.html, /Tiada berita diterbitkan/);

    const p = c.BulletinService.pdf('2026-09');
    assert.equal(p.fileName, 'Buletin-FKM-News-2026-09.pdf');
    assert.ok(Buffer.from(p.base64, 'base64').toString().startsWith('%PDF'));
  });

  test(`[${order}] F10: kebenaran — Admin/Editor pratonton, hanya Admin hantar`, () => {
    const { gas, c } = setup(order);
    gas.as('author1@mail.fkm.utm.my');
    assert.equal(c.api('bulletin.preview', { month: '2026-09' }).error.code, 'FORBIDDEN');
    assert.equal(c.api('bulletin.pdf', { month: '2026-09' }).error.code, 'FORBIDDEN');
    gas.as('editor@mail.fkm.utm.my');
    const pv = c.api('bulletin.preview', { month: '2026-09' });
    assert.equal(pv.data.count, 1);
    assert.equal(c.api('bulletin.send', { month: '2026-09' }).error.code, 'FORBIDDEN');
    gas.as(OWNER);
    assert.equal(c.api('bulletin.send', { month: '2026-09' }).error.code, 'VALIDATION', 'tiada penerima');
  });

  test(`[${order}] F10: hantar sebagai BCC dengan lampiran PDF`, () => {
    const { gas, c } = setup(order);
    c.GlobalSettings.updateGlobalSetting('BULLETIN_RECIPIENTS', 'staf@fkm.utm.my, bukan-emel, Staf@FKM.utm.my; dekan@utm.my', 'TEST');
    assert.deepEqual(Array.from(c.BulletinService.recipients()), ['staf@fkm.utm.my', 'dekan@utm.my']);
    const before = gas.state.mails.length;
    const r = c.api('bulletin.send', { month: '2026-09' }).data;
    assert.equal(r.sent, true);
    const m = gas.state.mails.slice(before)[0];
    assert.equal(m.bcc, 'staf@fkm.utm.my,dekan@utm.my');
    assert.equal(m.to, OWNER);
    assert.equal(m.attachments.length, 1);
    assert.match(m.subject, /September 2026/);
    assert.equal(c.api('bulletin.send', { month: '2025-01' }).data.reason, 'EMPTY');
  });

  test(`[${order}] F10: automatik minggu pertama, sekali sebulan, mati secara lalai`, () => {
    const { gas, c, at } = setup(order);
    c.GlobalSettings.updateGlobalSetting('BULLETIN_RECIPIENTS', 'staf@fkm.utm.my', 'TEST');
    assert.equal(c.BulletinService.runMonthly(at(OCT_3)).skipped, 'DISABLED');
    c.GlobalSettings.updateGlobalSetting('BULLETIN_ENABLED', true, 'TEST');
    assert.equal(c.BulletinService.runMonthly(at(OCT_12)).skipped, 'NOT_START_OF_MONTH');
    const before = gas.state.mails.length;
    const r = c.BulletinService.runMonthly(at(OCT_3));
    assert.equal(r.sent, true);
    assert.equal(r.month, '2026-09');
    assert.equal(c.BulletinService.runMonthly(at(OCT_3 + 86400000)).skipped, 'ALREADY_SENT');
    assert.equal(gas.state.mails.length, before + 1);
  });
}
