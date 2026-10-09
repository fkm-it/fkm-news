/**
 * PublicService.gs
 * ============================================================================
 * Laluan awam — untuk pembaca tanpa akaun.
 *
 * PRINSIP REKA BENTUK YANG PALING PENTING DALAM FAIL INI:
 *
 * Fail ini TIDAK memanggil api(). Ia ialah pintu masuk yang berasingan
 * sepenuhnya, dengan senarai tindakan yang ditulis secara literal di bawah.
 * Sebabnya: jika laluan awam hanyalah bendera di dalam penghala utama,
 * satu kesilapan logik akan mendedahkan draf, log audit, senarai pengguna
 * dan tetapan kepada seluruh internet. Dengan pengasingan ini, pendedahan
 * sedemikian memerlukan seseorang menambah tindakan baharu ke dalam suis
 * di bawah secara sengaja.
 *
 * Tiada identiti diperlukan. Tiada data ditulis kecuali kiraan tontonan.
 * Tiada tindakan pengurusan wujud di sini pada sebarang keadaan.
 *
 * DWIBAHASA
 * Bahasa ialah parameter paparan semata-mata. Ia tidak pernah menentukan
 * apa yang boleh dibaca — hanya cara ia dipaparkan. Menghantar lang='en'
 * tidak membuka satu baris pun yang tidak terbuka dengan lang='bm'.
 * ============================================================================
 */

var PublicService = (function () {

  /** Tetapan yang selamat untuk pembaca tanpa akaun */
  function publicSettings_() {
    var s = GlobalSettings.getPublicSettings();

    // Tetapan berkaitan aliran kerja dalaman tiada makna bagi pembaca,
    // dan tiada sebab untuk menghantarnya keluar.
    var strip = ['ENABLED_STATUSES', 'REQUIRE_ADMIN_REVIEW', 'ALLOW_AUTHOR_DELETE_DRAFT',
      'REQUIRE_COMMENT_ON_REJECT', 'AUTO_PUBLISH_ON_APPROVE', 'STATUS_LABELS',
      'STATUS_COLORS', 'DARK_STATUS_COLORS', 'REQUIRED_FIELDS', 'MAX_IMAGES',
      'MAX_ATTACHMENTS', 'MAX_FILE_SIZE_MB', 'ALLOWED_EXTENSIONS',
      'ALLOWED_IMAGE_EXTENSIONS', 'SESSION_TIMEOUT_MINUTES', 'TEST_MODE_ENABLED',
      'COMMAND_PALETTE', 'SIDEBAR_COLLAPSIBLE', 'SIDEBAR_MODE',
      'NOTIFICATION_POLL_SECONDS', 'IN_APP_ENABLED', 'FEATURE_AUDIT_UI',
      'FEATURE_VERSIONING', 'FEATURE_ATTACHMENTS', 'FEATURE_REPORTS',
      'SOCIAL_ENABLED', 'SOCIAL_FB_ENABLED', 'SOCIAL_IG_ENABLED',
      'SOCIAL_AUTO_ON_PUBLISH', 'SOCIAL_REQUIRE_EDITOR', 'SOCIAL_CAPTION_TEMPLATE',
      'SOCIAL_DEFAULT_HASHTAGS', 'SOCIAL_MAX_CAPTION', 'SOCIAL_MAX_IMAGES_IG',
      'QUICK_LINKS', 'SHOW_QUICK_LINKS', 'MAINTENANCE_MESSAGE'];

    strip.forEach(function (k) { delete s[k]; });
    return s;
  }

  function enabled_() {
    return GlobalSettings.get('PUBLIC_PORTAL_ENABLED');
  }

  function requireEnabled_() {
    if (!enabled_()) {
      throw Utils.appError('DISABLED', 'Portal awam tidak diaktifkan.');
    }
  }

  /**
   * Had kadar kasar untuk pembaca tanpa akaun.
   *
   * Pembaca anonim tiada identiti, jadi kaunter ini dikongsi oleh semua
   * pelawat. Ia menghalang satu skrip daripada membanjiri sistem, tetapi ia
   * TIDAK boleh membezakan pelawat — beban tinggi yang sah akan
   * mencetuskannya juga. Had ditetapkan tinggi atas sebab itu.
   */
  function rateLimit_() {
    var cache;
    try { cache = CacheService.getScriptCache(); } catch (e) { return; }
    if (!cache) return;

    var key = 'PUB_RL';
    var current = parseInt(cache.get(key) || '0', 10);

    if (current >= 600) {
      throw Utils.appError('RATE_LIMIT',
        'Laman sedang menerima terlalu banyak permintaan. Sila cuba sebentar lagi.');
    }
    try { cache.put(key, String(current + 1), 60); } catch (e) { }
  }

  /**
   * Penghala awam.
   *
   * Setiap tindakan di bawah mengembalikan HANYA berita berstatus PUBLISHED.
   * PortalService sudah menguatkuasakannya; senarai ini menguatkuasakannya
   * sekali lagi dengan tidak mendedahkan apa-apa laluan lain.
   */
  function route(action, payload) {
    payload = payload || {};
    requireEnabled_();
    rateLimit_();

    /* Kiraan tontonan bagi artikel yang dihidang dari salinan statik
       (StaticSite.gs). Hanya menambah kiraan; tiada data dipulangkan. */
    if (action === 'public.view') {
      PortalService.getArticle(String(payload.newsId || ''), true, 'bm');
      return { counted: true };
    }

    return handle_(action, payload, true);
  }

  /**
   * Jawapan bagi satu tindakan awam, tanpa had kadar. Dikongsi oleh route()
   * dan StaticSite (penjanaan salinan statik, countView = false).
   */
  function handle_(action, payload, countView) {
    payload = payload || {};
    var lang = normalizeLang_(payload.lang);

    switch (action) {

      case 'public.bootstrap':
        return {
          lang: lang,
          htmlLang: HTML_LANG[lang],

          /*
           * KEDUA-DUA kamus dihantar sekali, bukan satu mengikut bahasa.
           *
           * Bersama-sama ia lebih kurang 4 KB. Kos itu dibayar sekali pada
           * muatan pertama, dan sebagai balasan penukaran bahasa menukar
           * setiap label serta-merta tanpa perjalanan ke pelayan. Meminta
           * kamus pada setiap penukaran menjadikan butang BM|EN terasa
           * seperti memuat semula halaman — tepat apa yang hendak
           * dielakkan.
           */
          dicts: {
            bm: getDictionary(LANGS.BM),
            en: getDictionary(LANGS.EN)
          },

          settings: publicSettings_(),

          // Kedua-dua nama dihantar supaya cip kategori bertukar serta-merta
          // bersama label yang lain.
          categories: categoriesBilingual_()
        };

      case 'public.home':
        return PortalService.getHome(READER_, {
          lang: lang,
          heroCount: GlobalSettings.get('PORTAL_HERO_COUNT'),
          pageSize: GlobalSettings.get('PORTAL_PAGE_SIZE')
        });

      case 'public.list':
        return PortalService.list({
          lang: lang,
          categoryId: payload.categoryId,
          search: payload.search
        }, payload.page, 9);

      case 'public.article':
        return PortalService.getArticle(payload.newsId, countView !== false, lang);

      default:
        throw Utils.appError('UNKNOWN_ACTION', 'Tindakan tidak dikenali.');
    }
  }

  /**
   * Senarai kategori aktif dengan kedua-dua nama.
   *
   * NewsService.listCategories(true) kekal sebagai sumber kebenaran untuk
   * kategori MANA yang aktif — penapisan itu tidak diulang di sini. Sheet
   * hanya dirujuk untuk menambah nama English pada senarai yang sama.
   */
  function categoriesBilingual_() {
    var enMap = {};
    try {
      SheetDB.findAll(CONFIG.SHEETS.CATEGORIES).forEach(function (c) {
        var en = String(c.CategoryNameEn || '').trim();
        if (en) enMap[String(c.CategoryID)] = en;
      });
    } catch (e) { /* lajur belum dimigrasikan */ }

    return NewsService.listCategories(true).map(function (c) {
      return {
        categoryId: c.categoryId,
        categoryName: c.categoryName,
        categoryNameEn: enMap[String(c.categoryId)] || c.categoryName
      };
    });
  }

  /**
   * Pengguna tiruan untuk pembaca awam.
   *
   * PortalService.getHome menerima objek pengguna untuk menentukan sama ada
   * butang "Hantar Berita" dipaparkan. Pembaca awam tidak pernah mempunyai
   * kebenaran itu, jadi peranan yang tidak wujud digunakan: sebarang semakan
   * kebenaran ke atasnya akan gagal, yang memang dikehendaki.
   */
  var READER_ = { userId: '', role: 'PUBLIC_READER', name: 'Pembaca' };

  return { route: route, handle: handle_, isEnabled: enabled_ };
})();

/**
 * Pintu masuk awam yang dipanggil dari halaman pembaca.
 * Berasingan daripada api(); tidak pernah memerlukan atau menyemak identiti.
 */
function publicApi(action, payload) {
  try {
    return { ok: true, data: PublicService.route(action, payload) };
  } catch (err) {
    return Security.safeError(err);
  }
}