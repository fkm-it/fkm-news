/**
 * Ujian F8: Pembantu AI (Claude API tiruan).
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { installed, OWNER } = require('./gas-mock');

const A1 = 'author1@mail.fkm.utm.my';
const ED = 'editor@mail.fkm.utm.my';

function setup(order, opts) {
  opts = opts || {};
  const gas = installed({ order });
  const c = gas.ctx;
  gas.as(OWNER);
  if (opts.enable !== false) c.GlobalSettings.updateGlobalSetting('AI_ENABLED', true, 'T');
  if (opts.key !== false) gas.scriptProps.setProperty('FKMNEWS_ANTHROPIC_KEY', 'sk-ant-ujian');
  const calls = [];
  let reply = opts.reply || (() => ({}));
  gas.state.fetchHandler = (url, params) => {
    const body = JSON.parse(params.payload);
    calls.push({ url, headers: params.headers, body });
    const r = typeof reply === 'function' ? reply(body) : reply;
    const status = r.__status || 200;
    return {
      getResponseCode: () => status,
      getContentText: () => JSON.stringify({
        content: [{ type: 'text', text: typeof r.__text === 'string' ? r.__text : JSON.stringify(r) }],
        usage: { input_tokens: 3000, output_tokens: 2000 }
      })
    };
  };
  const news = (status, author) => {
    const users = c.UserService.getUserMap(true);
    const uid = Object.keys(users).find(k => users[k].email === (author || A1));
    const id = c.Utils.nextId('NEWS', true);
    c.SheetDB.insert('NEWS', { NewsID: id, Title: 'Bengkel CAD 3D FKM', Status: status, CategoryID: 'CAT-001',
      AuthorID: uid, Summary: 'Ringkasan bengkel.', Content: '<p>Isi bengkel CAD.</p>',
      CreatedAt: new Date(), UpdatedAt: new Date() });
    c.SheetDB.invalidate();
    return id;
  };
  return { gas, c, calls, news, setReply: f => { reply = f; } };
}

for (const order of ['alpha', 'reverse']) {

  test(`[${order}] F8: dimatikan / tiada kunci → ralat jelas, tiada panggilan rangkaian`, () => {
    let s = setup(order, { enable: false });
    s.gas.as(A1);
    assert.equal(s.c.api('ai.draft', { notes: 'x'.repeat(40) }).error.code, 'AI_DISABLED');
    s = setup(order, { key: false });
    s.gas.as(A1);
    assert.equal(s.c.api('ai.draft', { notes: 'x'.repeat(40) }).error.code, 'AI_NOT_CONFIGURED');
    assert.equal(s.calls.length, 0);
    assert.equal(s.c.api('ai.status', {}).data.ready, false);
  });

  test(`[${order}] F8: draf — kunci dihantar dalam header, output dibersihkan, kos direkod`, () => {
    const s = setup(order, { reply: {
      title: 'Bengkel CAD 3D Perkasa Kemahiran Pelajar FKM',
      summary: 'Seramai 40 pelajar tahun dua menyertai bengkel CAD 3D anjuran Jabatan Reka Bentuk FKM.',
      content: '<p>JOHOR BAHRU – Bengkel.</p><script>alert(1)</script><img src=x onerror=alert(1)>',
      suggestedCategory: 'Aktiviti', missingInfo: ['Nama penuh penceramah']
    } });
    s.gas.as(A1);
    const r = s.c.api('ai.draft', { notes: 'Bengkel CAD 3D, 5 Okt 2026, Makmal E01, 40 pelajar tahun 2.' });
    assert.equal(r.ok, true, JSON.stringify(r.error));
    const call = s.calls[0];
    assert.equal(call.url, 'https://api.anthropic.com/v1/messages');
    assert.equal(call.headers['x-api-key'], 'sk-ant-ujian');
    assert.equal(call.headers['anthropic-version'], '2023-06-01');
    assert.equal(call.body.model, 'claude-sonnet-5-5');
    assert.match(call.body.system, /JSON/);
    assert.ok(!/script|onerror/i.test(r.data.content), 'HTML AI dibersihkan');
    assert.deepEqual(Array.from(r.data.missingInfo), ['Nama penuh penceramah']);

    s.gas.as(OWNER);
    const st = s.c.api('ai.status', {}).data;
    // 3000 × $2 + 2000 × $10 per juta = $0.026
    assert.equal(st.spentUsd, 0.026);
    assert.ok(!JSON.stringify(st).includes('sk-ant'), 'kunci tidak pernah dipulangkan');
  });

  test(`[${order}] F8: had bajet bulanan menyekat panggilan`, () => {
    const s = setup(order, { reply: { title: 'T', summary: 'S', content: '<p>x</p>' } });
    s.c.GlobalSettings.updateGlobalSetting('AI_MONTHLY_BUDGET_USD', 0.03, 'T');
    s.gas.as(A1);
    assert.equal(s.c.api('ai.draft', { notes: 'nota yang cukup panjang untuk diproses AI.' }).ok, true);
    assert.equal(s.c.api('ai.draft', { notes: 'nota yang cukup panjang untuk diproses AI.' }).ok, true);
    const r = s.c.api('ai.draft', { notes: 'nota yang cukup panjang untuk diproses AI.' });
    assert.equal(r.error.code, 'AI_BUDGET');
    assert.equal(s.calls.length, 2);
  });

  test(`[${order}] F8: model Haiku dipilih melalui tetapan; nilai tidak sah → lalai`, () => {
    const s = setup(order, { reply: { title: 'T', summary: 'S', content: '<p>x</p>' } });
    s.c.GlobalSettings.updateGlobalSetting('AI_MODEL', 'claude-haiku-5-5', 'T');
    s.gas.as(A1);
    s.c.api('ai.draft', { notes: 'nota yang cukup panjang untuk diproses AI.' });
    assert.equal(s.calls[0].body.model, 'claude-haiku-5-5');
    s.gas.as(OWNER);
    s.c.GlobalSettings.updateGlobalSetting('AI_MODEL', 'gpt-palsu', 'T');
    s.gas.as(A1);
    s.c.api('ai.draft', { notes: 'nota yang cukup panjang untuk diproses AI.' });
    assert.equal(s.calls[1].body.model, 'claude-sonnet-5-5');
  });

  test(`[${order}] F8: semakan AI hanya Admin/Editor; penulis ditolak`, () => {
    const s = setup(order, { reply: { score: 82, summary: 'Baik', items: [
      { type: 'ejaan', location: 'perenggan 1', issue: 'dibengkel', suggestion: 'di bengkel' }] } });
    const id = s.news('ADMIN_REVIEW');
    s.gas.as(A1);
    assert.equal(s.c.api('ai.review', { newsId: id }).error.code, 'FORBIDDEN');
    s.gas.as(OWNER);
    const r = s.c.api('ai.review', { newsId: id });
    assert.equal(r.ok, true, JSON.stringify(r.error));
    assert.equal(r.data.score, 82);
    assert.equal(r.data.items[0].suggestion, 'di bengkel');
  });

  test(`[${order}] F8: terjemahan → cadangan sahaja; simpan BI ikut kebenaran; terbit → portal statik`, () => {
    const s = setup(order, { reply: { titleEn: 'FKM 3D CAD Workshop', summaryEn: 'Forty students…',
      contentEn: '<p>JOHOR BAHRU – Workshop.</p><iframe src="x"></iframe>' } });
    const draftId = s.news('DRAFT');
    const pubId = s.news('PUBLISHED');

    s.gas.as(A1);
    const t = s.c.api('ai.translate', { newsId: draftId });
    assert.equal(t.ok, true, JSON.stringify(t.error));
    assert.ok(!/iframe/.test(t.data.contentEn));
    s.c.SheetDB.invalidate();
    assert.equal(String(s.c.SheetDB.findOneBy('NEWS', 'NewsID', draftId).TitleEn || ''), '', 'belum disimpan');

    const sv = s.c.api('news.saveEnglish', { newsId: draftId, data: Object.assign({ source: 'ai' }, t.data) });
    assert.equal(sv.ok, true, JSON.stringify(sv.error));
    s.c.SheetDB.invalidate();
    assert.equal(s.c.SheetDB.findOneBy('NEWS', 'NewsID', draftId).TitleEn, 'FKM 3D CAD Workshop');

    // Penulis tidak boleh mengubah berita yang sudah diterbitkan
    assert.equal(s.c.api('ai.translate', { newsId: pubId }).error.code, 'FORBIDDEN');
    assert.equal(s.c.api('news.saveEnglish', { newsId: pubId, data: { titleEn: 'x' } }).error.code, 'FORBIDDEN');
    // Penulis lain tidak boleh
    s.gas.as('author2@mail.fkm.utm.my');
    assert.equal(s.c.api('news.saveEnglish', { newsId: draftId, data: { titleEn: 'x' } }).ok, false);

    // Admin boleh pada berita diterbitkan → salinan statik dikemas kini (ditanda tertunda tanpa token)
    s.gas.as(OWNER);
    assert.equal(s.c.api('news.saveEnglish', { newsId: pubId, data: { titleEn: 'Published EN' } }).ok, true);
    assert.ok(s.c.StaticSite.status().dirty.includes('versi BI'));
  });

  test(`[${order}] F8: kapsyen sosial untuk Admin/Editor; ralat API dikendalikan`, () => {
    const s = setup(order, { reply: { facebook: 'FB #FKMUTM', instagram: 'IG', linkedin: 'LI' } });
    const id = s.news('PUBLISHED');
    s.gas.as(ED);
    const r = s.c.api('ai.social', { newsId: id });
    assert.equal(r.ok, true, JSON.stringify(r.error));
    assert.equal(r.data.facebook, 'FB #FKMUTM');

    s.setReply(() => ({ __status: 401 }));
    const e = s.c.api('ai.social', { newsId: id });
    assert.equal(e.error.code, 'AI_ERROR');
    assert.match(e.error.message, /tidak sah/);

    s.setReply(() => ({ __text: 'maaf, bukan JSON' }));
    assert.equal(s.c.api('ai.social', { newsId: id }).error.code, 'AI_ERROR');
  });
}

test('F8: setiap prompt meminta JSON dan menggunakan gaya FKM', () => {
  const { c } = setup('alpha');
  const P = c.AiPrompts;
  assert.match(P.system(), /mech\.utm\.my/);
  const n = { title: 'T', summary: 'S', content: '<p>C</p>' };
  for (const p of [P.draft('nota', 'Aktiviti'), P.review(n), P.translate(n), P.social(n)]) {
    assert.match(p, /Format JSON/);
  }
});
