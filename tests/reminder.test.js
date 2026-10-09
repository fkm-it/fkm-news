/**
 * Ujian F7: peringatan berita tertunggak.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('vm');
const { installed, OWNER } = require('./gas-mock');

const DAY = 86400000;
// Isnin 12 Okt 2026, 09:00 waktu Malaysia
const MONDAY = Date.UTC(2026, 9, 12, 1, 0, 0);
const SATURDAY = Date.UTC(2026, 9, 10, 1, 0, 0);

function setup(order) {
  const gas = installed({ order });
  const c = gas.ctx;
  gas.as(OWNER);
  c.GlobalSettings.updateGlobalSetting('EMAIL_ENABLED', true, 'TEST');
  const VDate = vm.runInContext('Date', c);
  const at = ms => new VDate(ms);
  const users = c.UserService.getUserMap(true);
  const uid = email => Object.keys(users).find(k => users[k].email === email);
  const add = (status, daysAgo, author) => {
    const id = c.Utils.nextId('NEWS', true);
    c.SheetDB.insert('NEWS', { NewsID: id, Title: 'Berita ' + status + ' ' + daysAgo, Status: status,
      CategoryID: 'CAT-001', AuthorID: uid(author || 'author1@mail.fkm.utm.my'),
      CreatedAt: at(MONDAY - daysAgo * DAY), UpdatedAt: at(MONDAY - daysAgo * DAY) });
    return id;
  };
  add('ADMIN_REVIEW', 3);
  add('EDITOR_REVIEW', 5);
  add('REVISION_REQUIRED', 4, 'author1@mail.fkm.utm.my');
  add('SUBMITTED', 1);            // belum tertunggak
  add('PUBLISHED', 30);           // bukan peringkat semakan
  c.SheetDB.invalidate();
  return { gas, c, at, uid };
}

for (const order of ['alpha', 'reverse']) {

  test(`[${order}] F7: satu ringkasan setiap penerima ikut peringkat`, () => {
    const { gas, c, at, uid } = setup(order);
    const before = gas.state.mails.length;
    const r = c.ReminderService.run({ now: at(MONDAY) });
    const mails = gas.state.mails.slice(before);

    const to = m => mails.filter(x => x.to === m);
    assert.equal(to(OWNER).length, 1, 'admin pemilik');
    assert.equal(to('admin2@mail.fkm.utm.my').length, 1, 'admin kedua');
    assert.equal(to('editor@mail.fkm.utm.my').length, 1, 'editor');
    assert.equal(to('author1@mail.fkm.utm.my').length, 1, 'penulis (pembetulan)');
    assert.equal(to('author2@mail.fkm.utm.my').length, 0);

    assert.match(to(OWNER)[0].htmlBody, /Berita ADMIN_REVIEW 3/);
    assert.ok(!/SUBMITTED 1/.test(to(OWNER)[0].htmlBody), 'berita 1 hari belum tertunggak');
    assert.match(to('editor@mail.fkm.utm.my')[0].htmlBody, /menunggu 5 hari/);
    assert.match(to(OWNER)[0].htmlBody, /fkm-news\/app\/\?page=news-detail&amp;id=NEWS-/);
    assert.equal(r.emails, 4);

    const notifs = c.SheetDB.findAll('NOTIFICATIONS').filter(n => n.Type === 'REMINDER');
    assert.ok(notifs.some(n => n.UserID === uid('editor@mail.fkm.utm.my')));
  });

  test(`[${order}] F7: hujung minggu dilangkau; sekali sehari; boleh dimatikan`, () => {
    const { gas, c, at } = setup(order);
    assert.equal(c.ReminderService.run({ now: at(SATURDAY) }).skipped, 'WEEKEND');
    c.ReminderService.run({ now: at(MONDAY) });
    const n = gas.state.mails.length;
    assert.equal(c.ReminderService.run({ now: at(MONDAY + 3600000) }).skipped, 'ALREADY_RAN');
    assert.equal(gas.state.mails.length, n);

    c.GlobalSettings.updateGlobalSetting('REMINDER_ENABLED', false, 'TEST');
    assert.equal(c.ReminderService.run({ now: at(MONDAY + DAY) }).skipped, 'DISABLED');
  });

  test(`[${order}] F7: pengguna tidak aktif tidak menerima; EMAIL_ENABLED=false → dalam app sahaja`, () => {
    const { gas, c, at } = setup(order);
    const ed = c.SheetDB.findOneBy('USERS', 'Email', 'editor@mail.fkm.utm.my');
    c.SheetDB.updateRow('USERS', ed._row, { Status: 'INACTIVE' });
    c.GlobalSettings.updateGlobalSetting('EMAIL_ENABLED', false, 'TEST');
    const before = gas.state.mails.length;
    const r = c.ReminderService.run({ now: at(MONDAY) });
    assert.equal(gas.state.mails.length, before, 'tiada e-mel');
    assert.equal(r.emails, 0);
    assert.ok(r.recipients >= 3);
    assert.ok(!c.SheetDB.findAll('NOTIFICATIONS').some(n => n.Type === 'REMINDER' && n.UserID === ed.UserID));
  });

  test(`[${order}] F7: dailyMaintenance dari trigger menjalankan peringatan`, () => {
    const { gas, c } = setup(order);
    gas.as(OWNER);
    c.installTriggers();
    const t = gas.state.triggers.find(x => x.getHandlerFunction() === 'dailyMaintenance');
    gas.anon();
    assert.doesNotThrow(() => c.dailyMaintenance({ triggerUid: t.getUniqueId() }));
  });
}
