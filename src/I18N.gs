/**
 * I18N.gs
 * -----------------------------------------------------------------------
 * Kamus terjemahan berpusat untuk seluruh sistem.
 *
 * PERATURAN: tiada teks antara muka ditulis terus dalam fail lain. Setiap
 * label, butang dan mesej diambil melalui t(). Ini bukan sekadar kekemasan
 * — ia satu-satunya cara memastikan kedua-dua bahasa kekal seiring apabila
 * teks berubah kemudian.
 *
 * Kunci ditulis camelCase dan dikumpulkan mengikut kawasan antara muka.
 * Apabila menambah kunci baharu, tambah pada KEDUA-DUA bahasa dalam commit
 * yang sama — lint() di bawah menangkap yang tertinggal.
 * -----------------------------------------------------------------------
 */

var LANGS = {
  BM: 'bm',
  EN: 'en'
};

/** Bahasa lalai apabila pengguna belum memilih. */
var DEFAULT_LANG = LANGS.BM;

/** Kod bahasa untuk atribut <html lang="..."> dan pembaca skrin. */
var HTML_LANG = {
  bm: 'ms',
  en: 'en'
};

var I18N = {

  bm: {
    /* ---- Jenama & navigasi ---- */
    siteName: 'FKM News',
    home: 'Laman utama',
    allNews: 'Semua berita',
    viewAllNews: 'Lihat semua berita',
    loadMore: 'Muat lagi',
    latestNews: 'Berita Terkini',
    featuredNews: 'Berita Utama',
    news: 'Berita',
    dashboard: 'Papan Pemuka',

    /* ---- Tindakan ---- */
    readMore: 'Baca selengkapnya',
    readAlso: 'Baca juga',
    search: 'Cari berita…',
    searchResults: 'Hasil carian',
    share: 'Kongsi',
    copyLink: 'Salin pautan',
    linkCopied: 'Pautan disalin.',
    back: 'Kembali',
    all: 'Semua',
    filter: 'Tapis',
    save: 'Simpan',
    saveDraft: 'Simpan Draf',
    preview: 'Pratonton',
    publish: 'Terbitkan',
    cancel: 'Batal',

    /* ---- Metadata artikel ---- */
    by: 'Oleh',
    publishedOn: 'Diterbitkan pada',
    relatedNews: 'Berita Berkaitan',
    category: 'Kategori',
    views: 'tontonan',
    readMinutes: 'minit baca',
    minShort: 'min',
    tags: 'Tag',
    uncategorised: 'Umum',
    submitNews: 'Hantar Berita',

    /* ---- Keadaan kosong & ralat ---- */
    loading: 'Memuatkan…',
    noNewsYet: 'Belum ada berita',
    noNewsYetHint: 'Berita akan dipaparkan di sini apabila diterbitkan.',
    noResults: 'Tiada berita dijumpai',
    noResultsHint: 'Cuba kata kunci atau kategori lain.',
    loadFailed: 'Tidak dapat memuatkan',
    connectionLost: 'Sambungan terputus.',
    noResponse: 'Tiada respons.',

    /* ---- Rail sisi ---- */
    monthlyTrend: 'Trend Bulanan',
    monthlyTrendHint: 'Berita diterbitkan setiap bulan',
    quickLinks: 'Pautan Pantas',
    weather: 'Cuaca',
    weatherUnavailable: 'Cuaca tidak tersedia.',
    wxHour: 'Jam',
    wxWeek: 'Minggu',
    wx16Day: '16 Hari',
    wxNow: 'Sekarang',
    wxToday: 'Hari ini',
    wxHourlyUnavailable: 'Data ikut jam tidak tersedia.',

    /* ---- Dwibahasa ---- */
    language: 'Bahasa',
    switchToEnglish: 'Tukar ke English',
    switchToMalay: 'Tukar ke Bahasa Melayu',
    englishUnavailable: 'Versi English belum tersedia',
    malayUnavailable: 'Versi Bahasa Melayu belum tersedia',
    translationStatus: 'Status Terjemahan',
    incompleteEnglish: 'Artikel tanpa versi English',
    previewAs: 'Pratonton sebagai',

    /* ---- Papan pemuka ---- */
    totalNews: 'Jumlah Berita',
    publishedNews: 'Berita Diterbitkan',
    drafts: 'Draf',
    featuredCount: 'Berita Ditampilkan',
    totalViews: 'Jumlah Paparan',
    pendingAdminReview: 'Menunggu Semakan Admin',
    pendingEditorReview: 'Menunggu Semakan Editor',
    revisionRequired: 'Perlu Pembetulan',
    rejected: 'Ditolak',

    /* ---- Borang editor ---- */
    createNews: 'Cipta Berita',
    editNews: 'Sunting Berita',
    title: 'Tajuk',
    summary: 'Ringkasan',
    content: 'Kandungan',
    imageCaption: 'Kapsyen Gambar',
    altText: 'Teks Alt',
    featured: 'Ditampilkan',
    status: 'Status',
    seoTitle: 'Tajuk SEO',
    seoDescription: 'Penerangan SEO',
    seoKeywords: 'Kata Kunci SEO'
  },

  en: {
    /* ---- Brand & navigation ---- */
    siteName: 'FKM News',
    home: 'Home',
    allNews: 'All news',
    viewAllNews: 'View all news',
    loadMore: 'Load more',
    latestNews: 'Latest News',
    featuredNews: 'Featured',
    news: 'News',
    dashboard: 'Dashboard',

    /* ---- Actions ---- */
    readMore: 'Read more',
    readAlso: 'Read also',
    search: 'Search news…',
    searchResults: 'Search results',
    share: 'Share',
    copyLink: 'Copy link',
    linkCopied: 'Link copied.',
    back: 'Back',
    all: 'All',
    filter: 'Filter',
    save: 'Save',
    saveDraft: 'Save Draft',
    preview: 'Preview',
    publish: 'Publish',
    cancel: 'Cancel',

    /* ---- Article metadata ---- */
    by: 'By',
    publishedOn: 'Published on',
    relatedNews: 'Related News',
    category: 'Category',
    views: 'views',
    readMinutes: 'min read',
    minShort: 'min',
    tags: 'Tags',
    uncategorised: 'General',
    submitNews: 'Submit News',

    /* ---- Empty & error states ---- */
    loading: 'Loading…',
    noNewsYet: 'No news yet',
    noNewsYetHint: 'Articles will appear here once published.',
    noResults: 'No news found',
    noResultsHint: 'Try a different keyword or category.',
    loadFailed: 'Unable to load',
    connectionLost: 'Connection lost.',
    noResponse: 'No response.',

    /* ---- Side rail ---- */
    monthlyTrend: 'Monthly Trend',
    monthlyTrendHint: 'Articles published each month',
    quickLinks: 'Quick Links',
    weather: 'Weather',
    weatherUnavailable: 'Weather unavailable.',
    wxHour: 'Hourly',
    wxWeek: 'Week',
    wx16Day: '16 Days',
    wxNow: 'Now',
    wxToday: 'Today',
    wxHourlyUnavailable: 'Hourly data unavailable.',

    /* ---- Bilingual ---- */
    language: 'Language',
    switchToEnglish: 'Switch to English',
    switchToMalay: 'Switch to Bahasa Melayu',
    englishUnavailable: 'English version unavailable',
    malayUnavailable: 'Malay version unavailable',
    translationStatus: 'Translation Status',
    incompleteEnglish: 'Articles without an English version',
    previewAs: 'Preview as',

    /* ---- Dashboard ---- */
    totalNews: 'Total News',
    publishedNews: 'Published News',
    drafts: 'Drafts',
    featuredCount: 'Featured News',
    totalViews: 'Total Views',
    pendingAdminReview: 'Pending Admin Review',
    pendingEditorReview: 'Pending Editor Review',
    revisionRequired: 'Revision Required',
    rejected: 'Rejected',

    /* ---- Editor form ---- */
    createNews: 'Create News',
    editNews: 'Edit News',
    title: 'Title',
    summary: 'Summary',
    content: 'Content',
    imageCaption: 'Image Caption',
    altText: 'Alt Text',
    featured: 'Featured',
    status: 'Status',
    seoTitle: 'SEO Title',
    seoDescription: 'SEO Description',
    seoKeywords: 'SEO Keywords'
  }
};

/**
 * Terjemah satu kunci.
 *
 * Kunci yang tiada dipulangkan sebagai kunci itu sendiri, bukan rentetan
 * kosong. Label pelik seperti "readMoreX" pada skrin lebih cepat disedari
 * daripada ruang kosong yang senyap.
 *
 * @param {string} key kunci kamus
 * @param {string=} lang 'bm' atau 'en'; lalai DEFAULT_LANG
 * @return {string}
 */
function t(key, lang) {
  var dict = I18N[normalizeLang_(lang)] || I18N[DEFAULT_LANG];
  if (Object.prototype.hasOwnProperty.call(dict, key)) return dict[key];

  var fallback = I18N[DEFAULT_LANG];
  if (Object.prototype.hasOwnProperty.call(fallback, key)) return fallback[key];

  return key;
}

/** Menerima apa-apa input dan memulangkan kod bahasa yang sah. */
function normalizeLang_(lang) {
  var v = String(lang || '').trim().toLowerCase();
  if (v === LANGS.EN || v === 'eng' || v === 'english') return LANGS.EN;
  if (v === LANGS.BM || v === 'ms' || v === 'my' || v === 'melayu') return LANGS.BM;
  return DEFAULT_LANG;
}

/**
 * Seluruh kamus untuk satu bahasa — dihantar sekali kepada klien supaya
 * frontend tidak perlu memanggil pelayan bagi setiap label.
 */
function getDictionary(lang) {
  return I18N[normalizeLang_(lang)] || I18N[DEFAULT_LANG];
}

/**
 * Semakan integriti kamus. Jalankan secara manual selepas menambah kunci.
 * Run > lintI18n, kemudian baca execution log.
 */
function lintI18n() {
  var bm = Object.keys(I18N.bm);
  var en = Object.keys(I18N.en);

  var missingEn = bm.filter(function (k) { return en.indexOf(k) === -1; });
  var missingBm = en.filter(function (k) { return bm.indexOf(k) === -1; });
  var emptyBm = bm.filter(function (k) { return !String(I18N.bm[k]).trim(); });
  var emptyEn = en.filter(function (k) { return !String(I18N.en[k]).trim(); });

  var lines = [
    'Kunci BM: ' + bm.length,
    'Kunci EN: ' + en.length,
    'Tiada dalam EN: ' + (missingEn.length ? missingEn.join(', ') : '—'),
    'Tiada dalam BM: ' + (missingBm.length ? missingBm.join(', ') : '—'),
    'Kosong dalam BM: ' + (emptyBm.length ? emptyBm.join(', ') : '—'),
    'Kosong dalam EN: ' + (emptyEn.length ? emptyEn.join(', ') : '—')
  ];

  var ok = !missingEn.length && !missingBm.length && !emptyBm.length && !emptyEn.length;
  lines.push(ok ? 'STATUS: SEIRING' : 'STATUS: PERLU DIBETULKAN');

  var report = lines.join('\n');
  Logger.log('\n=== LINT I18N ===\n' + report);
  return report;
}