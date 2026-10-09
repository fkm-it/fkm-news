/**
 * demo-seed.js — data demo untuk dev-server, E2E dan ujian portal statik.
 */
'use strict';
const { OWNER } = require('./gas-mock');

/* Berita gaya FKM berbilang perenggan (untuk ringkasan 30 saat, F9). */
const RICH_CONTENT = [
  '<p>Seramai 1,000 peserta menyertai Explorace Merdeka Seribu 2026 anjuran Fakulti Kejuruteraan Mekanikal (FKM) di kampus UTM Johor Bahru pada 30 Ogos lalu. Program ini diadakan sempena Bulan Kebangsaan.</p>',
  '<p>Peserta terdiri daripada pelajar, staf dan keluarga yang bergerak dalam kumpulan melalui 12 stesen cabaran di sekitar kampus. Setiap stesen menguji pengetahuan sejarah negara serta kerja berpasukan.</p>',
  '<p>Dekan FKM, Prof Ts Dr Ahmad Fauzi berkata program ini memupuk semangat patriotik dalam suasana santai. "Kami mahu warga FKM meraikan kemerdekaan bersama keluarga," katanya.</p>',
  '<p>Kumpulan Jentera Merah muncul juara keseluruhan dan membawa pulang hadiah wang tunai serta piala pusingan. Tempat kedua dan ketiga masing-masing dimenangi kumpulan Turbin dan Piston.</p>',
  '<p>Penganjur bercadang menjadikan Explorace acara tahunan dengan penyertaan komuniti setempat pada tahun hadapan.</p>'
].join('');

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
      Content: i === 0 ? RICH_CONTENT
        : '<p>' + 'Kandungan penuh berita untuk ujian paparan. '.repeat(12) + '</p><h3>Sorotan</h3><ul><li>Satu</li><li>Dua</li></ul>',
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
