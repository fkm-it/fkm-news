/**
 * Ujian F4: log masuk OTP + apiWeb melalui doPost (aplikasi staf di Pages).
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { installed, OWNER } = require('./gas-mock');

const A1 = 'author1@mail.fkm.utm.my';
const A2 = 'author2@mail.fkm.utm.my';

function setup(order) {
  const gas = installed({ order });
  gas.as(OWNER);
  gas.ctx.GlobalSettings.updateGlobalSetting('PUBLIC_PORTAL_ENABLED', true, 'TEST');
  gas.anon();   // permintaan doPost dari GitHub Pages: tiada pengguna Google
  const post = (fn, args) => JSON.parse(gas.ctx.doPost({
    postData: { contents: JSON.stringify({ fn, args }) }
  })._text);
  const lastCode = to => {
    const m = gas.state.mails.filter(x => x.to === to).pop();
    return m ? m.subject.match(/(\d{6})$/)[1] : null;
  };
  const login = email => {
    assert.equal(post('authRequest', [email]).ok, true);
    const r = post('authVerify', [email, lastCode(email)]);
    assert.equal(r.ok, true, JSON.stringify(r.error));
    return r.data.token;
  };
  return { gas, post, lastCode, login };
}

for (const order of ['alpha', 'reverse']) {

  test(`[${order}] F4: jawapan minta kod seragam; kod hanya dihantar kepada pengguna aktif berdaftar`, () => {
    const { gas, post } = setup(order);
    const known = post('authRequest', [A1]);
    const unknown = post('authRequest', ['tiada.siapa@mail.fkm.utm.my']);
    assert.equal(known.ok, true);
    assert.deepEqual(known, unknown, 'jawapan mesti sama — tidak dedahkan kewujudan e-mel');
    assert.equal(gas.state.mails.length, 1);
    assert.equal(gas.state.mails[0].to, A1);
    assert.match(gas.state.mails[0].subject, /Kod log masuk: \d{6}$/);

    // Pengguna tidak aktif tidak menerima kod
    gas.as(OWNER);
    const u = gas.ctx.SheetDB.findOneBy('USERS', 'Email', A2);
    gas.ctx.SheetDB.updateRow('USERS', u._row, { Status: 'INACTIVE' });
    gas.anon();
    assert.equal(post('authRequest', [A2]).ok, true);
    assert.equal(gas.state.mails.filter(m => m.to === A2).length, 0);
  });

  test(`[${order}] F4: kod salah dihadkan 5 cubaan; kod sekali guna`, () => {
    const { post, lastCode } = setup(order);
    post('authRequest', [A1]);
    const code = lastCode(A1);
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) {
      const r = post('authVerify', [A1, wrong]);
      assert.equal(r.ok, false);
      assert.equal(r.error.code, 'INVALID_CODE');
    }
    assert.equal(post('authVerify', [A1, code]).ok, false, 'kod betul ditolak selepas 5 cubaan salah');

    post('authRequest', [A1]);
    const code2 = lastCode(A1);
    assert.equal(post('authVerify', [A1, code2]).ok, true);
    assert.equal(post('authVerify', [A1, code2]).ok, false, 'kod tidak boleh diguna semula');
  });

  test(`[${order}] F4: had kadar permintaan kod per e-mel`, () => {
    const { post } = setup(order);
    for (let i = 0; i < 3; i++) assert.equal(post('authRequest', [A1]).ok, true);
    const r = post('authRequest', [A1]);
    assert.equal(r.ok, false);
    assert.equal(r.error.code, 'RATE_LIMIT');
  });

  test(`[${order}] F4: apiWeb dengan token sah = pengguna yang betul; tanpa token ditolak`, () => {
    const { post, login } = setup(order);
    assert.equal(post('apiWeb', ['', 'session.bootstrap', {}]).error.code, 'UNAUTHENTICATED');
    assert.equal(post('apiWeb', ['a'.repeat(96), 'session.bootstrap', {}]).error.code, 'UNAUTHENTICATED');

    const t1 = login(A1);
    const b = post('apiWeb', [t1, 'session.bootstrap', {}]);
    assert.equal(b.ok, true, JSON.stringify(b.error));
    assert.equal(b.data.user.email, A1);
    assert.equal(b.data.user.role, 'AUTHOR');

    // RBAC kekal: penulis tidak boleh urus pengguna
    const r = post('apiWeb', [t1, 'user.list', {}]);
    assert.equal(r.ok, false);
    assert.equal(r.error.code, 'FORBIDDEN');
  });

  test(`[${order}] F4: aliran kerja penuh melalui web (cipta → hantar)`, () => {
    const { post, login } = setup(order);
    const t1 = login(A1);
    const cats = post('apiWeb', [t1, 'session.bootstrap', {}]).data.categories;
    const c = post('apiWeb', [t1, 'news.create', { data: {
      title: 'Berita dari aplikasi web', categoryId: cats[0].categoryId,
      summary: 'Ringkasan berita yang dihantar melalui GitHub Pages.',
      content: '<p>' + 'Isi berita yang cukup panjang untuk lulus semakan kandungan minimum. '.repeat(3) + '</p>'
    } }]);
    assert.equal(c.ok, true, JSON.stringify(c.error));
    const s = post('apiWeb', [t1, 'workflow.transition', { newsId: c.data.newsId, action: 'SUBMIT' }]);
    assert.equal(s.ok, true, JSON.stringify(s.error));
  });

  test(`[${order}] F4: log keluar membatalkan token; akaun dinyahaktif terputus serta-merta`, () => {
    const { gas, post, login } = setup(order);
    const t1 = login(A1);
    assert.equal(post('authLogout', [t1]).ok, true);
    assert.equal(post('apiWeb', [t1, 'session.ping', {}]).error.code, 'UNAUTHENTICATED');

    const t2 = login(A1);
    assert.equal(post('apiWeb', [t2, 'session.ping', {}]).ok, true);
    gas.as(OWNER);
    const u = gas.ctx.SheetDB.findOneBy('USERS', 'Email', A1);
    gas.ctx.SheetDB.updateRow('USERS', u._row, { Status: 'INACTIVE' });
    gas.anon();
    assert.equal(post('apiWeb', [t2, 'session.ping', {}]).error.code, 'UNAUTHENTICATED');
  });

  test(`[${order}] F4: pilihan tema diasingkan antara pengguna web`, () => {
    const { post, login } = setup(order);
    const t1 = login(A1);
    const t2 = login(A2);
    assert.equal(post('apiWeb', [t1, 'session.setTheme', { mode: 'dark' }]).ok, true);
    assert.equal(post('apiWeb', [t1, 'session.bootstrap', {}]).data.themeMode, 'dark');
    assert.notEqual(post('apiWeb', [t2, 'session.bootstrap', {}]).data.themeMode, 'dark',
      'tema pengguna 1 tidak boleh bocor kepada pengguna 2');
  });

  test(`[${order}] F4: sesi tamat selepas had mutlak 8 jam`, () => {
    const { gas, post, login } = setup(order);
    const t1 = login(A1);
    const VDate = require('vm').runInContext('Date', gas.ctx);
    const realNow = VDate.now;
    assert.equal(post('apiWeb', [t1, 'session.ping', {}]).ok, true);
    try {
      VDate.now = () => realNow() + 8 * 3600 * 1000 + 1000;
      assert.equal(post('apiWeb', [t1, 'session.ping', {}]).error.code, 'UNAUTHENTICATED');
    } finally { VDate.now = realNow; }
  });
}
