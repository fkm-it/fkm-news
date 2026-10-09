/**
 * Ujian F5: Portal Statik Pantas (StaticSite.gs + build-web halaman /b/).
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { installed, OWNER } = require('./gas-mock');
const { seedDemo } = require('./demo-seed');

function setup(order) {
  const gas = installed({ order });
  const ids = seedDemo(gas);
  gas.as(OWNER);
  return { gas, c: gas.ctx, ids };
}

/** Pelayan GitHub API tiruan untuk Git Data API */
function fakeGitHub(gas, opts) {
  opts = opts || {};
  const calls = [];
  gas.state.fetchHandler = (url, params) => {
    const method = String(params.method || 'get').toLowerCase();
    const body = params.payload ? JSON.parse(params.payload) : null;
    calls.push({ url, method, body, headers: params.headers });
    const reply = (code, obj) => ({ getResponseCode: () => code, getContentText: () => JSON.stringify(obj), getHeaders: () => ({}) });
    if (opts.fail) return reply(401, { message: 'Bad credentials' });
    if (url.endsWith('/git/ref/heads/main')) return reply(200, { object: { sha: 'HEAD1' } });
    if (url.endsWith('/git/commits/HEAD1')) return reply(200, { tree: { sha: 'TREE1' } });
    if (url.includes('/git/trees/TREE1')) return reply(200, { tree: [
      { path: 'src/Code.gs', type: 'blob' },
      { path: 'data/bm/a/NEWS-1999-00001.json', type: 'blob' },
      { path: 'data/bm/home.json', type: 'blob' }
    ] });
    if (url.endsWith('/git/trees') && method === 'post') return reply(201, { sha: opts.sameTree ? 'TREE1' : 'TREE2' });
    if (url.endsWith('/git/commits') && method === 'post') return reply(201, { sha: 'COMMIT2abcdef' });
    if (url.endsWith('/git/refs/heads/main') && method === 'patch') return reply(200, {});
    return reply(404, { message: 'tidak dijangka: ' + url });
  };
  return calls;
}

for (const order of ['alpha', 'reverse']) {

  test(`[${order}] F5: buildFiles menjana jawapan awam lengkap (BM & BI) untuk berita diterbitkan sahaja`, () => {
    const { c, ids } = setup(order);
    // draf + berita dengan kandungan XSS lama
    c.SheetDB.insert('NEWS', { NewsID: 'NEWS-2026-09999', Title: 'Draf rahsia', Status: 'DRAFT',
      CategoryID: 'CAT-001', AuthorID: 'USR-00002', CreatedAt: new Date(), UpdatedAt: new Date() });
    const row = c.SheetDB.findOneBy('NEWS', 'NewsID', ids[0]);
    c.SheetDB.updateRow('NEWS', row._row, { Content: '<p>ok</p><img/src=x/onerror=alert(1)>' });

    const files = c.StaticSite.buildFiles();
    for (const lang of ['bm', 'en']) {
      for (const f of ['bootstrap.json', 'home.json', 'sidebar.json', 'list-all-1.json']) {
        assert.ok(files[`data/${lang}/${f}`], `${lang}/${f}`);
        assert.equal(JSON.parse(files[`data/${lang}/${f}`]).ok, true, `${lang}/${f} ok`);
      }
      for (const id of ids) assert.ok(files[`data/${lang}/a/${id}.json`], `${lang} artikel ${id}`);
    }
    const all = Object.keys(files).join('\n') + Object.values(files).join('\n');
    assert.ok(!all.includes('NEWS-2026-09999') && !all.includes('Draf rahsia'), 'draf tidak dieksport');
    assert.ok(!/onerror/i.test(files[`data/bm/a/${ids[0]}.json`]), 'kandungan dibersihkan');
    assert.equal(JSON.parse(files[`data/en/a/${ids[0]}.json`]).data.title,
      'Merdeka Explorace 2026 Livens Up National Month at UTM');

    const idx = JSON.parse(files['data/index.json']);
    assert.equal(idx.articles.length, ids.length);
    assert.ok(idx.articles.every(a => a.slug && a.title));
    // tiada data dalaman (e-mel, tetapan sulit)
    assert.ok(!/@mail\.fkm\.utm\.my/.test(all), 'tiada e-mel pengguna dalam data awam');
    assert.ok(!/FKMNEWS_GITHUB_TOKEN|AUTO_REGISTER_AUTHOR/.test(all));
  });

  test(`[${order}] F5: tanpa token → ditanda tertunda, tiada panggilan rangkaian`, () => {
    const { gas, c } = setup(order);
    const before = gas.state.fetches.length;
    const r = c.StaticSite.sync('ujian');
    assert.equal(r.skipped, 'NO_TOKEN');
    assert.equal(gas.state.fetches.length, before);
    assert.ok(c.StaticSite.status().dirty.includes('ujian'));
  });

  test(`[${order}] F5: sync menolak satu commit, memadam fail data lapuk, dan tidak menyentuh src/`, () => {
    const { gas, c, ids } = setup(order);
    gas.scriptProps.setProperty('FKMNEWS_GITHUB_TOKEN', 'ghp_ujian');
    const calls = fakeGitHub(gas);
    const r = c.StaticSite.sync('ujian');
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.changed, true);

    assert.ok(calls.every(x => x.headers.Authorization === 'Bearer ghp_ujian'));
    assert.ok(calls.every(x => x.url.startsWith('https://api.github.com/repos/fkm-it/fkm-news/')));
    const tree = calls.find(x => x.url.endsWith('/git/trees') && x.method === 'post').body;
    assert.equal(tree.base_tree, 'TREE1');
    const del = tree.tree.filter(e => e.sha === null).map(e => e.path);
    assert.deepEqual(del, ['data/bm/a/NEWS-1999-00001.json'], 'hanya fail data lapuk dipadam');
    assert.ok(tree.tree.every(e => e.path.startsWith('data/')), 'hanya data/ diubah');
    assert.ok(tree.tree.some(e => e.path === `data/bm/a/${ids[0]}.json` && e.content));
    assert.ok(calls.some(x => x.method === 'patch' && x.body.sha === 'COMMIT2abcdef'));
    assert.equal(c.StaticSite.status().dirty, '');
  });

  test(`[${order}] F5: tiada perubahan → tiada commit; ralat GitHub → tertunda, tidak melempar`, () => {
    const { gas, c } = setup(order);
    gas.scriptProps.setProperty('FKMNEWS_GITHUB_TOKEN', 'ghp_ujian');
    let calls = fakeGitHub(gas, { sameTree: true });
    assert.equal(c.StaticSite.sync('x').changed, false);
    assert.ok(!calls.some(x => x.url.endsWith('/git/commits') && x.method === 'post'));

    calls = fakeGitHub(gas, { fail: true });
    const r = c.StaticSite.sync('gagal');
    assert.equal(r.ok, false);
    assert.match(r.error, /401/);
    assert.ok(c.StaticSite.status().dirty.includes('gagal'));
  });

  test(`[${order}] F5: penerbitan oleh Editor mencetuskan sync; trigger tertunda dipasang`, () => {
    const { gas, c } = setup(order);
    gas.scriptProps.setProperty('FKMNEWS_GITHUB_TOKEN', 'ghp_ujian');
    const id = c.Utils.nextId('NEWS', true);
    c.SheetDB.insert('NEWS', { NewsID: id, Title: 'Berita lulus untuk diterbitkan', Slug: 'lulus',
      CategoryID: 'CAT-001', AuthorID: 'USR-00002', Summary: 'Ringkasan berita yang cukup panjang.',
      Content: '<p>' + 'isi '.repeat(40) + '</p>', Status: 'APPROVED', CreatedAt: new Date(), UpdatedAt: new Date() });
    c.SheetDB.invalidate();
    const calls = fakeGitHub(gas);
    gas.as('editor@mail.fkm.utm.my');
    const r = c.api('workflow.transition', { newsId: id, action: 'PUBLISH' });
    assert.equal(r.ok, true, JSON.stringify(r.error));
    assert.ok(calls.some(x => x.method === 'patch'), 'commit ditolak selepas terbit');

    gas.as(OWNER);
    c.StaticSite.markDirty('tetapan');
    assert.ok(gas.state.triggers.some(t => t.getHandlerFunction() === 'staticSiteSync'));
  });

  test(`[${order}] F5: public.view menambah kiraan tontonan sahaja`, () => {
    const { gas, c, ids } = setup(order);
    gas.anon();
    const before = Number(c.SheetDB.findOneBy('NEWS', 'NewsID', ids[1]).ViewCount);
    const r = c.publicApi('public.view', { newsId: ids[1] });
    assert.equal(JSON.stringify(r), JSON.stringify({ ok: true, data: { counted: true } }));
    c.SheetDB.invalidate();
    assert.equal(Number(c.SheetDB.findOneBy('NEWS', 'NewsID', ids[1]).ViewCount), before + 1);
    assert.equal(c.publicApi('public.view', { newsId: 'NEWS-2026-09999' }).ok, false);
  });
}

test('F5: build-web menjana /b/<slug>/ dengan OG, sitemap dan salinan data', () => {
  const { c } = setup('alpha');
  const files = c.StaticSite.buildFiles();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fkmdata-'));
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'fkmweb-'));
  try {
    for (const [p, body] of Object.entries(files)) {
      const f = path.join(tmp, p.replace(/^data\//, ''));
      fs.mkdirSync(path.dirname(f), { recursive: true });
      fs.writeFileSync(f, body);
    }
    execFileSync('node', [path.join(__dirname, '..', 'tools', 'build-web.js'),
      '--api', 'https://script.google.com/macros/s/X/exec', '--out', out,
      '--data', tmp, '--base', 'https://fkm-it.github.io/fkm-news/']);
    const idx = JSON.parse(fs.readFileSync(path.join(out, 'data', 'index.json'), 'utf8'));
    const a = idx.articles[0];
    const page = fs.readFileSync(path.join(out, 'b', a.pageSlug, 'index.html'), 'utf8');
    assert.ok(page.includes(`<meta property="og:title" content="${a.title}">`));
    assert.ok(page.includes('og:image" content="https://'));
    assert.ok(page.includes(`og:url" content="https://fkm-it.github.io/fkm-news/b/${a.pageSlug}/"`));
    assert.ok(page.includes('location.replace("../../?view=reader&id=' + a.id));
    assert.ok(fs.existsSync(path.join(out, 'data', 'bm', 'home.json')));
    const sm = fs.readFileSync(path.join(out, 'sitemap.xml'), 'utf8');
    assert.ok(sm.includes(`https://fkm-it.github.io/fkm-news/b/${a.pageSlug}/`));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(out, { recursive: true, force: true });
  }
});
