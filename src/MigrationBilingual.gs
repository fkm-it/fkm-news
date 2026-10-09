/**
 * MigrationBilingual.gs
 * -----------------------------------------------------------------------
 * Menambah lajur dwibahasa kepada sheet sedia ada.
 *
 * SIFAT SKRIP INI
 *   - Tambahan sahaja. Tiada lajur dinamakan semula, tiada data ditulis
 *     ganti, tiada baris disentuh.
 *   - Idempoten. Jalankan berkali-kali dengan selamat; lajur yang sudah
 *     ada dilangkau.
 *   - Boleh diuji dahulu. migrateBilingual(true) melaporkan apa yang akan
 *     berlaku tanpa mengubah apa-apa.
 *
 * URUTAN YANG DISYORKAN
 *   1. Buat salinan spreadsheet (File > Make a copy) — jaring keselamatan.
 *   2. Run > migrateBilingual   (mod kering, lalai)
 *   3. Baca execution log.
 *   4. Run > migrateBilingualApply   apabila laporan itu kelihatan betul.
 *   5. Run > listMissingEnglish     untuk senarai kerja terjemahan.
 * -----------------------------------------------------------------------
 */

/**
 * Lajur yang hendak ditambah, mengikut sheet.
 * Lajur sedia ada memegang Bahasa Melayu; yang bersufiks En memegang
 * English. Lihat nota konvensi dalam LanguageService.gs.
 */
var BILINGUAL_COLUMNS = {
  NEWS: [
    'TitleEn',
    'SummaryEn',
    'ContentEn',
    'SeoTitle',
    'SeoTitleEn',
    'SeoDescription',
    'SeoDescriptionEn',
    'SeoKeywords',
    'SeoKeywordsEn'
  ],
  CATEGORIES: [
    'CategoryNameEn',
    'DescriptionEn'
  ],
  NEWS_IMAGES: [
    'CaptionEn',
    'AltTextEn'
  ],
  GREETING_CARDS: [
    'TitleEn'
  ]
};

/** Mod kering — melaporkan sahaja. Ini yang dijalankan dahulu. */
function migrateBilingual(dryRun) {
  requireOwnerOrTrigger_('migrateBilingual', arguments[0]);
  var dry = dryRun !== false;
  var lines = [dry ? 'MOD KERING — tiada perubahan ditulis' : 'MOD SEBENAR — menulis perubahan', ''];

  Object.keys(BILINGUAL_COLUMNS).forEach(function (key) {
    var sheetName = CONFIG.SHEETS[key];
    if (!sheetName) {
      lines.push('LANGKAU  ' + key + ' — tiada dalam CONFIG.SHEETS');
      return;
    }

    var sheet;
    try {
      sheet = SheetDB.sheet(sheetName);
    } catch (e) {
      lines.push('LANGKAU  ' + sheetName + ' — sheet tidak dijumpai');
      return;
    }

    var lastCol = sheet.getLastColumn();
    var headers = lastCol > 0
      ? sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h).trim(); })
      : [];

    var wanted = BILINGUAL_COLUMNS[key];
    var missing = wanted.filter(function (c) { return headers.indexOf(c) === -1; });

    if (!missing.length) {
      lines.push('OK       ' + sheetName + ' — kesemua ' + wanted.length + ' lajur sudah ada');
      return;
    }

    if (dry) {
      lines.push('AKAN TAMBAH  ' + sheetName + ' (' + missing.length + '): ' + missing.join(', '));
      return;
    }

    // Lajur ditambah di hujung supaya kedudukan lajur sedia ada kekal.
    // Mana-mana kod yang membaca mengikut indeks lajur tidak terjejas.
    sheet.getRange(1, lastCol + 1, 1, missing.length).setValues([missing]);
    lines.push('DITAMBAH  ' + sheetName + ' (' + missing.length + '): ' + missing.join(', '));
  });

  if (!dry) {
    // Cache pengepala SheetDB memegang susunan lajur lama sehingga
    // dikosongkan; tanpa ini, bacaan seterusnya akan terlepas lajur baharu.
    SheetDB.clearHeaderCache();
    lines.push('', 'Cache pengepala SheetDB dikosongkan.');
  }

  var report = lines.join('\n');
  Logger.log('\n=== MIGRASI DWIBAHASA ===\n' + report);
  return report;
}

/** Menulis perubahan sebenar. Jalankan selepas menyemak mod kering. */
function migrateBilingualApply() {
  requireOwnerOrTrigger_('migrateBilingualApply', arguments[0]);
  return migrateBilingual(false);
}

/**
 * Mengisi CategoryNameEn bagi kategori yang namanya dikenali.
 * Hanya sel KOSONG diisi — terjemahan yang Admin sudah taip tidak diganggu.
 *
 * Peta ini disengajakan kecil dan eksplisit. Ia titik permulaan, bukan
 * kamus: kategori yang tidak dikenali dibiarkan untuk Admin isi sendiri,
 * kerana tekaan pada laman rasmi fakulti lebih buruk daripada ruang kosong.
 */
var CATEGORY_EN_SEED = {
  'Akademik': 'Academic',
  'Penyelidikan': 'Research',
  'Pelajar': 'Students',
  'Staf': 'Staff',
  'Acara': 'Events',
  'Aktiviti': 'Activities',
  'Kerjasama': 'Collaboration',
  'Anugerah': 'Awards',
  'Pencapaian': 'Achievements',
  'Korporat': 'Corporate',
  'Komuniti': 'Community',
  'Industri': 'Industry',
  'Pengumuman': 'Announcements'
};

function seedCategoryEnglish(dryRun) {
  requireOwnerOrTrigger_('seedCategoryEnglish', arguments[0]);
  var dry = dryRun !== false;
  var lines = [dry ? 'MOD KERING' : 'MOD SEBENAR', ''];

  var rows = SheetDB.findAll(CONFIG.SHEETS.CATEGORIES);

  rows.forEach(function (row) {
    var bm = String(row.CategoryName || '').trim();
    var existing = String(row.CategoryNameEn || '').trim();

    if (existing) {
      lines.push('LANGKAU  ' + bm + ' — sudah ada "' + existing + '"');
      return;
    }
    if (!CATEGORY_EN_SEED[bm]) {
      lines.push('TIADA PETA  ' + bm + ' — Admin perlu isi sendiri');
      return;
    }

    if (dry) {
      lines.push('AKAN ISI  ' + bm + ' \u2192 ' + CATEGORY_EN_SEED[bm]);
      return;
    }

    SheetDB.updateBy(CONFIG.SHEETS.CATEGORIES, 'CategoryID', row.CategoryID, {
      CategoryNameEn: CATEGORY_EN_SEED[bm]
    });
    lines.push('DIISI  ' + bm + ' \u2192 ' + CATEGORY_EN_SEED[bm]);
  });

  var report = lines.join('\n');
  Logger.log('\n=== SEED KATEGORI ENGLISH ===\n' + report);
  return report;
}

function seedCategoryEnglishApply() {
  requireOwnerOrTrigger_('seedCategoryEnglishApply', arguments[0]);
  return seedCategoryEnglish(false);
}

/**
 * Pemeriksaan selepas migrasi. Mengesahkan lajur wujud dan menunjukkan
 * keadaan terjemahan semasa.
 */
function verifyBilingual() {
  requireOwnerOrTrigger_('verifyBilingual', arguments[0]);
  var lines = [];

  Object.keys(BILINGUAL_COLUMNS).forEach(function (key) {
    var sheetName = CONFIG.SHEETS[key];
    try {
      var headers = SheetDB.headers(sheetName);
      var missing = BILINGUAL_COLUMNS[key].filter(function (c) {
        return headers.indexOf(c) === -1;
      });
      lines.push((missing.length ? 'GAGAL  ' : 'LULUS  ') + sheetName +
        (missing.length ? ' — tiada: ' + missing.join(', ') : ''));
    } catch (e) {
      lines.push('GAGAL  ' + sheetName + ' — ' + e.message);
    }
  });

  var s = LanguageService.translationSummary();
  lines.push('');
  lines.push('Berita dikira (diterbitkan/diluluskan): ' + s.total);
  lines.push('BM lengkap: ' + s.bmComplete + ' (' + s.bmPercent + '%)');
  lines.push('EN lengkap: ' + s.enComplete + ' (' + s.enPercent + '%)');
  lines.push('Tiada versi English: ' + s.incompleteEn);

  var report = lines.join('\n');
  Logger.log('\n=== SEMAKAN DWIBAHASA ===\n' + report);
  return report;
}


/**
 * Senarai berita terbitan yang belum mempunyai versi English.
 *
 * Ini menggantikan penjana "rekod contoh": menulis berita rekaan ke dalam
 * pangkalan data fakulti yang hidup akan bercampur dengan berita sebenar
 * dan sukar dibersihkan kemudian. Senarai kerja lebih berguna — ia
 * menunjukkan apa yang sebenarnya perlu diterjemah.
 */
function listMissingEnglish() {
  requireOwnerOrTrigger_('listMissingEnglish', arguments[0]);
  var rows = SheetDB.findAll(CONFIG.SHEETS.NEWS).filter(function (r) {
    return r.Status === STATUS.PUBLISHED || r.Status === STATUS.APPROVED;
  });

  var missing = rows.filter(function (r) { return !LanguageService.hasEnglish(r); });

  var lines = ['Berita terbitan/diluluskan: ' + rows.length,
               'Belum ada versi English: ' + missing.length, ''];

  missing
    .sort(function (a, b) {
      return new Date(b.PublishedAt || 0) - new Date(a.PublishedAt || 0);
    })
    .forEach(function (r) {
      var need = [];
      if (!String(r.TitleEn || '').trim()) need.push('TitleEn');
      if (!String(r.SummaryEn || '').trim()) need.push('SummaryEn');
      if (!String(r.ContentEn || '').trim()) need.push('ContentEn');
      lines.push(String(r.NewsID) + '  ' + Utils.truncate(String(r.Title || ''), 52));
      lines.push('    perlu: ' + need.join(', '));
    });

  if (!missing.length) lines.push('Semua berita terbitan sudah mempunyai versi English.');

  var report = lines.join('\n');
  Logger.log('\n=== KERJA TERJEMAHAN ===\n' + report);
  return report;
}