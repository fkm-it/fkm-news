/**
 * Ujian: suntingan berita yang telah diterbitkan & tukar gambar utama (v1.10.0).
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { installed, OWNER } = require('./gas-mock');
const { seedDemo } = require('./demo-seed');

const PNG = Buffer.from('89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C4890000000A49444154789C6300010000050001', 'hex');

function setup(order) {
  const gas = installed({ order });
  const ids = seedDemo(gas);
  gas.as(OWNER);
  const c = gas.ctx;
  gas.scriptProps.setProperty('FKMNEWS_GITHUB_TOKEN', 'ghp_ujian');
  const commits = [];
  gas.state.fetchHandler = (url, params) => {
    const method = String(params.method || 'get').toLowerCase();
    const reply = (code, obj) => ({ getResponseCode: () => code, getContentText: () => JSON.stringify(obj), getHeaders: () => ({}) });
    if (url.endsWith('/git/ref/heads/main')) return reply(200, { object: { sha: 'H' } });
    if (url.endsWith('/git/commits/H')) return reply(200, { tree: { sha: 'T' } });
    if (url.includes('/git/trees/T')) return reply(200, { tree: [] });
    if (url.endsWith('/git/trees')) return reply(201, { sha: 'T' + commits.length + 'x' });
    if (url.endsWith('/git/commits') && method === 'post') { commits.push(JSON.parse(params.payload).message); return reply(201, { sha: 'C' }); }
    if (method === 'patch') return reply(200, {});
    return reply(404, {});
  };
  const id = ids[0];
  return { gas, c, id, commits };
}

const form = n => ({ title: n.Title, categoryId: n.CategoryID, summary: n.Summary, content: n.Content, tags: '', eventDate: '' });

for (const order of ['alpha', 'reverse']) {

  test(`[${order}] Admin & Editor boleh sunting berita TERBIT; Penulis tidak`, () => {
    const { gas, c, id } = setup(order);
    assert.equal(c.api('news.detail', { newsId: id }).data.canEdit, true, 'admin');
    gas.as('editor@mail.fkm.utm.my');
    assert.equal(c.api('news.detail', { newsId: id }).data.canEdit, true, 'editor');
    gas.as('author1@mail.fkm.utm.my');
    const n = c.NewsService.getRaw(id);
    const r = c.api('news.update', { newsId: id, data: Object.assign(form(n), { title: 'Cubaan penulis' }) });
    assert.equal(r.ok, false);
    assert.equal(r.error.code, 'FORBIDDEN');

    gas.as(OWNER);
    c.GlobalSettings.updateGlobalSetting('EDIT_PUBLISHED_ENABLED', false, 'TEST');
    assert.equal(c.api('news.detail', { newsId: id }).data.canEdit, false, 'boleh dimatikan');
  });

  test(`[${order}] Suntingan selepas terbit: slug kekal, versi lama disimpan, kekal TERBIT, portal dikemas kini`, () => {
    const { c, id, commits } = setup(order);
    const before = c.NewsService.getRaw(id);
    const r = c.api('news.update', { newsId: id, data: Object.assign(form(before), {
      title: 'Tajuk Dibetulkan Selepas Terbit', content: '<p>Kandungan baharu yang dibetulkan.</p><script>x</script>' }) });
    assert.equal(r.ok, true, JSON.stringify(r.error));
    assert.equal(r.data.published, true);

    const after = c.NewsService.getRaw(id);
    assert.equal(after.Status, 'PUBLISHED');
    assert.equal(after.Title, 'Tajuk Dibetulkan Selepas Terbit');
    assert.equal(after.Slug, before.Slug, 'slug kekal supaya pautan kongsi tidak putus');
    assert.ok(!/<script/.test(after.Content));
    assert.equal(Number(after.CurrentVersion), Number(before.CurrentVersion || 1) + 1);

    const v = c.SheetDB.findAll('NEWS_VERSIONS').filter(x => x.NewsID === id);
    assert.ok(v.some(x => x.Title === before.Title && /selepas terbit/.test(x.Note)), 'versi lama disimpan');
    assert.ok(commits.some(m => /suntingan/.test(m)), 'portal statik dikemas kini');
    assert.ok(c.SheetDB.findAll('AUDIT_LOG').some(l => l.EntityID === id && /Suntingan selepas terbit/.test(l.Description)));
  });

  test(`[${order}] Tukar gambar utama pada berita TERBIT: gambar baharu awam, portal dikemas kini`, () => {
    const { gas, c, id, commits } = setup(order);
    const up = c.api('image.upload', { newsId: id, files: [
      { name: 'a.png', mimeType: 'image/png', data: PNG.toString('base64') },
      { name: 'b.png', mimeType: 'image/png', data: PNG.toString('base64') }] });
    assert.equal(up.ok, true, JSON.stringify(up.error));
    const imgs = up.data;
    const b = imgs.find(i => i.fileName.indexOf('b') === 0) || imgs[imgs.length - 1];
    const fileB = c.DriveApp.getFileById(b.fileId);
    assert.equal(String(fileB._sharing[0]), 'ANYONE_WITH_LINK', 'gambar baharu boleh dilihat pembaca awam');

    const n0 = commits.length;
    gas.as('editor@mail.fkm.utm.my');
    const r = c.api('image.setFeatured', { imageId: b.imageId });
    assert.equal(r.ok, true, JSON.stringify(r.error));
    assert.ok(r.data.find(i => i.imageId === b.imageId).isFeatured);
    const n = c.NewsService.getRaw(id);
    assert.equal(n.FeaturedImageID, b.fileId);
    assert.equal(n.Status, 'PUBLISHED');
    assert.ok(commits.length > n0 && /gambar utama/.test(commits[commits.length - 1]));

    const art = c.PublicService.handle('public.article', { newsId: id, lang: 'bm' }, false);
    assert.ok(String(art.imageUrl).includes(b.fileId), 'portal memaparkan gambar utama baharu');
  });
}
