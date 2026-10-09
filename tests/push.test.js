/**
 * Ujian F11: notifikasi push (Firebase Cloud Messaging).
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const vm = require('vm');
const { installed, OWNER } = require('./gas-mock');

const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const SA = {
  type: 'service_account', project_id: 'fkm-news-test',
  client_email: 'fcm@fkm-news-test.iam.gserviceaccount.com',
  private_key: privateKey.export({ type: 'pkcs8', format: 'pem' })
};
const TOK = n => 'tok' + String(n).padStart(3, '0') + ':' + 'A'.repeat(140);
const DEAD = TOK(999);

function setup(order, { enabled = true, configured = true } = {}) {
  const gas = installed({ order });
  const c = gas.ctx;
  gas.as(OWNER);
  c.GlobalSettings.updateGlobalSetting('PUBLIC_PORTAL_ENABLED', true, 'TEST');
  c.GlobalSettings.updateGlobalSetting('STAFF_APP_URL', 'https://fkm-it.github.io/fkm-news/app/', 'TEST');
  c.GlobalSettings.updateGlobalSetting('PUBLIC_PORTAL_URL', 'https://fkm-it.github.io/fkm-news/', 'TEST');
  if (enabled) c.GlobalSettings.updateGlobalSetting('PUSH_ENABLED', true, 'TEST');
  if (configured) c.PropertiesService.getScriptProperties().setProperty('FKMNEWS_FCM_SERVICE_ACCOUNT', JSON.stringify(SA));

  const sends = [];
  let auths = 0;
  gas.state.fetchHandler = (url, params) => {
    if (url === 'https://oauth2.googleapis.com/token') {
      auths++;
      const [h, cl, sig] = params.payload.assertion.split('.');
      const ok = crypto.verify('RSA-SHA256', Buffer.from(h + '.' + cl), publicKey, Buffer.from(sig, 'base64url'));
      const claims = JSON.parse(Buffer.from(cl, 'base64url').toString());
      if (!ok || claims.iss !== SA.client_email || !/firebase\.messaging/.test(claims.scope)) {
        return { getResponseCode: () => 400, getContentText: () => '{"error":"invalid_grant"}' };
      }
      return { getResponseCode: () => 200, getContentText: () => '{"access_token":"ya-test","expires_in":3599}' };
    }
    if (url.startsWith('https://fcm.googleapis.com/v1/projects/fkm-news-test/messages:send')) {
      const body = JSON.parse(params.payload);
      sends.push({ auth: params.headers.Authorization, msg: body.message });
      if (body.message.token === DEAD) {
        return { getResponseCode: () => 404, getContentText: () => '{"error":{"status":"NOT_FOUND","details":[{"errorCode":"UNREGISTERED"}]}}' };
      }
      return { getResponseCode: () => 200, getContentText: () => '{"name":"projects/x/messages/1"}' };
    }
    return { getResponseCode: () => 200, getContentText: () => '{}' };
  };
  const uid = email => c.SheetDB.findOneBy('USERS', 'Email', email).UserID;
  const VDate = vm.runInContext('Date', c);
  const publishNews = (title) => {
    const id = c.Utils.nextId('NEWS', true);
    const cat = c.NewsService.listCategories(true)[0];
    c.SheetDB.insert('NEWS', { NewsID: id, Title: title, Slug: '', Status: 'PUBLISHED', CategoryID: cat.categoryId,
      AuthorID: uid('author1@mail.fkm.utm.my'), Summary: 'Ringkasan ' + title, Content: '<p>Isi.</p>',
      TitleEn: 'EN ' + title, PublishedAt: new VDate(), CreatedAt: new VDate(), UpdatedAt: new VDate(), ViewCount: 0 });
    c.SheetDB.invalidate();
    return id;
  };
  return { gas, c, sends, uid, auths: () => auths, publishNews };
}

const rows = c => {
  const sh = c.SpreadsheetApp.openById(c.CONFIG.getSpreadsheetId()).getSheetByName('PUSH_TOKENS');
  return sh ? sh.getDataRange().getValues().slice(1) : [];
};

for (const order of ['alpha', 'reverse']) {

  test(`[${order}] F11: staf daftar peranti → notifikasi dalam app turut dihantar sebagai push`, () => {
    const { gas, c, sends, uid, auths } = setup(order);
    gas.as('author1@mail.fkm.utm.my');
    assert.equal(c.api('push.register', { token: TOK(1), device: 'Android Chrome' }).data.registered, true);
    assert.equal(c.api('push.register', { token: 'pendek' }).error.code, 'VALIDATION');
    assert.equal(c.api('push.register', { token: TOK(2) + '<script>' }).error.code, 'VALIDATION');

    c.NotificationService.createInApp(uid('author1@mail.fkm.utm.my'), 'NEWS-2026-00009', 'REVISION', 'Berita perlu pembetulan', 'Sila semak tajuk.');
    assert.equal(sends.length, 1);
    const m = sends[0].msg;
    assert.equal(m.token, TOK(1));
    assert.equal(sends[0].auth, 'Bearer ya-test');
    assert.equal(m.data.title, 'Berita perlu pembetulan');
    assert.equal(m.data.link, 'https://fkm-it.github.io/fkm-news/app/?page=news-detail&id=NEWS-2026-00009');
    assert.ok(!m.notification, 'mesej data sahaja');

    c.NotificationService.createInApp(uid('editor@mail.fkm.utm.my'), '', 'X', 'Untuk editor', '.');
    assert.equal(sends.length, 1, 'pengguna lain tiada peranti');
    c.NotificationService.createInApp(uid('author1@mail.fkm.utm.my'), '', 'X', 'Kedua', '.');
    assert.equal(auths(), 1, 'token akses dicache');

    assert.equal(c.api('push.status', {}).data.myDevices, 1);
    assert.equal(c.api('push.status', {}).data.readers, undefined, 'statistik pembaca untuk Admin sahaja');
    c.api('push.unregister', { token: TOK(1) });
    assert.equal(rows(c).length, 0);
  });

  test(`[${order}] F11: pembaca langgan ikut bahasa; push hanya pada terbitan pertama; token mati dibuang`, () => {
    const { gas, c, sends } = setup(order);
    gas.as('nobody@gmail.com');
    assert.equal(c.publicApi('public.pushSubscribe', { token: TOK(10), lang: 'bm' }).ok, true);
    assert.equal(c.publicApi('public.pushSubscribe', { token: TOK(11), lang: 'en' }).ok, true);
    assert.equal(c.publicApi('public.pushSubscribe', { token: DEAD, lang: 'bm' }).ok, true);
    assert.equal(c.publicApi('public.pushSubscribe', { token: TOK(10), lang: 'bm' }).ok, true, 'idempoten');
    assert.equal(rows(c).length, 3);
    assert.equal(c.publicApi('public.pushSubscribe', { token: 'x' }).error.code, 'VALIDATION');

    gas.as(OWNER);
    const id = 'NEWS-X';
    const newsId = setupPublish(c, id);
    const r = c.PushService.notifyPublished(newsId);
    assert.equal(r.sent, 2);
    assert.equal(r.removed, 1);
    const bm = sends.find(s => s.msg.token === TOK(10)).msg.data;
    const en = sends.find(s => s.msg.token === TOK(11)).msg.data;
    assert.match(bm.title, /^Pelancaran/);
    assert.match(en.title, /^EN Pelancaran/);
    assert.equal(bm.link, 'https://fkm-it.github.io/fkm-news/?view=reader&id=' + newsId + '&lang=bm');
    assert.match(en.link, /&lang=en$/);
    assert.equal(rows(c).length, 2, 'token UNREGISTERED dipadam');

    assert.equal(c.publicApi('public.pushUnsubscribe', { token: TOK(11) }).ok, true);
    assert.equal(rows(c).length, 1);
  });

  test(`[${order}] F11: aliran kerja — PUBLISH menghantar push pembaca; ARCHIVE→UNARCHIVE tidak`, () => {
    const { gas, c, sends, uid } = setup(order);
    c.publicApi('public.pushSubscribe', { token: TOK(20), lang: 'bm' });
    const VDate = vm.runInContext('Date', c);
    const id = c.Utils.nextId('NEWS', true);
    const cat = c.NewsService.listCategories(true)[0];
    c.SheetDB.insert('NEWS', { NewsID: id, Title: 'Berita Aliran Kerja', Slug: '', Status: 'APPROVED', CategoryID: cat.categoryId,
      AuthorID: uid('author1@mail.fkm.utm.my'), Summary: 'Ringkasan', Content: '<p>Isi.</p>', CurrentVersion: 1,
      CreatedAt: new VDate(), UpdatedAt: new VDate(), ViewCount: 0 });
    c.SheetDB.invalidate();
    const toReader = () => sends.filter(s => s.msg.token === TOK(20)).length;

    gas.as('editor@mail.fkm.utm.my');
    const r = c.api('workflow.transition', { newsId: id, action: 'PUBLISH' });
    assert.ok(r.ok, JSON.stringify(r.error));
    assert.equal(toReader(), 1, 'pembaca menerima push semasa terbit');
    assert.equal(sends.find(s => s.msg.token === TOK(20)).msg.data.title, 'Berita Aliran Kerja');

    assert.ok(c.api('workflow.transition', { newsId: id, action: 'ARCHIVE' }).ok);
    assert.ok(c.api('workflow.transition', { newsId: id, action: 'UNARCHIVE' }).ok);
    assert.equal(toReader(), 1, 'nyaharkib tidak menghantar semula');
  });

  test(`[${order}] F11: mati secara lalai / tanpa kunci → tiada panggilan FCM`, () => {
    const off = setup(order, { enabled: false });
    off.gas.as('author1@mail.fkm.utm.my');
    off.c.api('push.register', { token: TOK(30) });
    off.c.NotificationService.createInApp(off.uid('author1@mail.fkm.utm.my'), '', 'X', 'S', 'M');
    assert.equal(off.sends.length, 0);
    assert.equal(off.c.publicApi('public.pushSubscribe', { token: TOK(31) }).error.code, 'DISABLED');
    assert.equal(off.c.api('push.test', {}).error.code, 'DISABLED');

    const nokey = setup(order, { configured: false });
    nokey.gas.as('author1@mail.fkm.utm.my');
    assert.equal(nokey.c.api('push.test', {}).error.code, 'PUSH_NOT_CONFIGURED');
    assert.equal(nokey.c.api('push.status', {}).data.configured, false);
  });

  test(`[${order}] F11: had 5 peranti setiap pengguna; ujian push`, () => {
    const { gas, c, sends } = setup(order);
    gas.as('editor@mail.fkm.utm.my');
    assert.equal(c.api('push.test', {}).error.code, 'NO_DEVICE');
    for (let i = 40; i < 47; i++) c.api('push.register', { token: TOK(i) });
    assert.equal(rows(c).length, 5);
    assert.equal(c.api('push.test', {}).data.sent, 5);
    assert.ok(sends.every(s => /Ujian notifikasi/.test(s.msg.data.title)));
  });
}

function setupPublish(c, _id) {
  const VDate = vm.runInContext('Date', c);
  const id = c.Utils.nextId('NEWS', true);
  const cat = c.NewsService.listCategories(true)[0];
  const author = c.SheetDB.findOneBy('USERS', 'Email', 'author1@mail.fkm.utm.my');
  c.SheetDB.insert('NEWS', { NewsID: id, Title: 'Pelancaran Makmal Baharu', Slug: '', Status: 'PUBLISHED', CategoryID: cat.categoryId,
    AuthorID: author.UserID, Summary: 'Ringkasan pelancaran', Content: '<p>Isi.</p>', TitleEn: 'EN Pelancaran Makmal',
    SummaryEn: 'Launch summary', ContentEn: '<p>Body.</p>',
    PublishedAt: new VDate(), CreatedAt: new VDate(), UpdatedAt: new VDate(), ViewCount: 0 });
  c.SheetDB.invalidate();
  return id;
}
