/**
 * demo-seed.js — data demo untuk dev-server, E2E dan ujian portal statik.
 */
'use strict';
const { OWNER } = require('./gas-mock');

function seedDemo(gas) {
  const c = gas.ctx;
  gas.as(OWNER);
  c.GlobalSettings.updateGlobalSetting('PUBLIC_PORTAL_ENABLED', true, 'DEV');
  const cats = c.NewsService.listCategories(true);
  const IMG = n => `https://picsum.photos/seed/fkm${n}/1200/675`;
  const sample = [
    ['Explorace Merdeka Seribu 2026 Meriahkan Sambutan Bulan Kebangsaan di UTM', 'Aktiviti'],
    ['Selamat Datang dan Selamat Menjalankan Tugas kepada Staf Baru FKM', 'Pengumuman'],
    ['Pelajar FKM Raih Pingat Emas di Pertandingan Inovasi Antarabangsa', 'Pencapaian'],
    ['Kerjasama Strategik FKM Bersama Industri Automotif Tempatan', 'Industri'],
    ['Bengkel Penulisan Jurnal Berimpak Tinggi untuk Pensyarah Muda', 'Aktiviti']
  ];
  const ids = [];
  sample.forEach(([title, catName], i) => {
    const cat = cats.find(x => x.categoryName === catName) || cats[0];
    const id = c.Utils.nextId('NEWS', true);
    ids.push(id);
    c.SheetDB.insert('NEWS', {
      NewsID: id, Title: title, Slug: c.Utils.slugify(title), CategoryID: cat.categoryId,
      AuthorID: 'USR-00001', Summary: 'Ringkasan berita: ' + title + '. Program ini melibatkan warga FKM.',
      Content: '<p>' + 'Kandungan penuh berita untuk ujian paparan. '.repeat(12) + '</p><h3>Sorotan</h3><ul><li>Satu</li><li>Dua</li></ul>',
      FeaturedImageURL: IMG(i), Status: 'PUBLISHED', CurrentVersion: 1, Tags: '',
      PublishedAt: new Date(Date.now() - i * 86400000 * 9), ViewCount: 10 + i,
      CreatedAt: new Date(), UpdatedAt: new Date(),
      TitleEn: i === 0 ? 'Merdeka Explorace 2026 Livens Up National Month at UTM' : ''
    });
  });
  c.SheetDB.invalidate();
  gas.anon();
  return ids;
}

module.exports = { seedDemo };
