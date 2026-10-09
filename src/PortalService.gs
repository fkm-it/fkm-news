/**
 * PortalService.gs
 * ============================================================================
 * Portal pembaca — paparan berita yang SUDAH DITERBITKAN sahaja.
 *
 * Berbeza daripada NewsService yang melayan aliran kerja dalaman, fail ini
 * hanya mengembalikan artikel berstatus PUBLISHED. Tiada draf, tiada komen
 * semakan, tiada nama penyemak — semuanya maklumat dalaman yang tidak
 * sepatutnya keluar melalui laluan pembaca.
 *
 * DWIBAHASA
 * Setiap fungsi awam menerima parameter `lang`. Rekod mentah diratakan
 * melalui LanguageService sebelum menjadi DTO, jadi paparan tidak pernah
 * melihat lajur TitleEn/ContentEn dan tidak boleh memintas logik bahasa
 * secara tidak sengaja. Medan `hasFallback` memberitahu paparan bahawa
 * sebahagian kandungan berundur kepada BM, supaya penunjuk kecil boleh
 * dipaparkan tanpa menyembunyikan berita itu.
 * ============================================================================
 */

var PortalService = (function () {

  /** Anggaran masa membaca: 200 patah perkataan seminit, minimum satu minit. */
  function readMinutes(content) {
    var words = Utils.stripTags(content || '').split(/\s+/).filter(Boolean).length;
    return Math.max(1, Math.round(words / 200));
  }

  function publishedRows() {
    return SheetDB.findWhere(CONFIG.SHEETS.NEWS, function (n) {
      return String(n.Status) === STATUS.PUBLISHED;
    });
  }

  /**
   * Peta nama kategori English, dibaca terus daripada sheet.
   *
   * NewsService.categoryMap() dikekalkan sebagai sumber nama BM supaya
   * kelakuan sedia ada tidak berubah; peta ini hanya menambah lapisan
   * English di atasnya. Kategori tanpa CategoryNameEn tidak muncul di sini
   * dan akan berundur kepada nama BM.
   */
  function categoryEnMap_() {
    var map = {};
    try {
      SheetDB.findAll(CONFIG.SHEETS.CATEGORIES).forEach(function (c) {
        var en = String(c.CategoryNameEn || '').trim();
        if (en) map[String(c.CategoryID)] = en;
      });
    } catch (e) { /* lajur belum dimigrasikan — semua berundur kepada BM */ }
    return map;
  }

  function catName_(id, cats, catsEn, lang) {
    if (normalizeLang_(lang) === LANGS.EN && catsEn[String(id)]) return catsEn[String(id)];
    return cats[String(id)] || t('uncategorised', lang);
  }

  function toCardDto(n, users, cats, catsEn, lang) {
    var author = users[String(n.AuthorID)];
    var loc = LanguageService.getLocalizedNews(n, lang);

    return {
      newsId: String(n.NewsID),
      title: String(loc.Title),
      slug: String(n.Slug),
      summary: Utils.truncate(Utils.stripTags(loc.Summary || loc.Content || ''), 160),
      categoryId: String(n.CategoryID || ''),
      categoryName: catName_(n.CategoryID, cats, catsEn, lang),
      authorName: (author && author.name) || '—',
      imageUrl: String(n.FeaturedImageURL || ''),
      publishedAt: n.PublishedAt ? Utils.formatDate(n.PublishedAt) : '',
      publishedAtRaw: n.PublishedAt ? new Date(n.PublishedAt).getTime() : 0,
      eventDate: n.EventDate ? Utils.formatDate(n.EventDate) : '',
      views: Number(n.ViewCount || 0),

      // Masa membaca dikira daripada kandungan yang BENAR-BENAR dipaparkan.
      // Versi English selalunya berbeza panjang daripada versi BM.
      readMinutes: readMinutes(loc.Content),

      lang: loc._lang,
      hasFallback: loc._hasFallback,
      hasEnglish: LanguageService.hasEnglish(n)
    };
  }

  /**
   * Data laman utama portal dalam satu panggilan — hero, kad statistik,
   * senarai terkini, ringkasan sisi, kategori dan tarikh aktiviti.
   */
  function getHome(user, options) {
    options = options || {};
    var lang = normalizeLang_(options.lang);

    var users = UserService.getUserMap();
    var cats = NewsService.categoryMap();
    var catsEn = categoryEnMap_();

    var rows = publishedRows();
    var all = rows.map(function (n) { return toCardDto(n, users, cats, catsEn, lang); });
    all = Utils.sortBy(all, 'publishedAtRaw', true);

    var heroCount = Math.min(options.heroCount || 3, all.length);
    var pageSize = options.pageSize || 6;

    /*
     * Kiraan kategori dikunci pada categoryId, bukan nama.
     *
     * Nama kategori berubah mengikut bahasa yang dipilih, jadi mengira
     * mengikut nama akan menghasilkan sifar untuk setiap kategori sebaik
     * sahaja pembaca bertukar ke English. ID kekal sama dalam kedua-dua
     * bahasa.
     */
    var categoryCounts = {};
    all.forEach(function (a) {
      categoryCounts[a.categoryId] = (categoryCounts[a.categoryId] || 0) + 1;
    });

    var categories = NewsService.listCategories(true).map(function (c) {
      return {
        categoryId: c.categoryId,
        categoryName: catName_(c.categoryId, cats, catsEn, lang),
        count: categoryCounts[String(c.categoryId)] || 0
      };
    }).sort(function (a, b) { return b.count - a.count; });

    // Tarikh yang mempunyai penerbitan — untuk penanda pada kalendar
    var activeDates = {};
    rows.forEach(function (n) {
      if (!n.PublishedAt) return;
      activeDates[Utils.formatDate(n.PublishedAt, 'yyyy-MM-dd')] = true;
    });

    // Kiraan imej mesti terhad kepada berita yang diterbitkan sahaja.
    // Mengira keseluruhan sheet akan mendedahkan bilangan fail bagi draf
    // dan berita yang ditolak kepada pembaca.
    var publishedIds = {};
    rows.forEach(function (n) { publishedIds[String(n.NewsID)] = true; });

    var totalImages = 0;
    try {
      totalImages = SheetDB.count(CONFIG.SHEETS.NEWS_IMAGES, function (img) {
        return !!publishedIds[String(img.NewsID)];
      });
    } catch (e) { }

    var thisYear = Utilities.formatDate(new Date(), Utils.timezone(), 'yyyy');
    var publishedThisYear = all.filter(function (a) {
      return String(a.publishedAt || '').slice(-4) === thisYear;
    }).length;

    // Apabila jumlah berita sedikit, karusel menelan hampir kesemuanya dan
    // bahagian "Berita Terkini" tinggal satu kad. Dalam keadaan itu senarai
    // terkini memaparkan semua berita, termasuk yang berada dalam karusel.
    var remaining = all.slice(heroCount);
    var latest = remaining.length >= 3 ? remaining.slice(0, pageSize)
                                       : all.slice(0, pageSize);

    return {
      lang: lang,
      hero: all.slice(0, heroCount),
      latest: latest,
      brief: all.slice(0, 4),
      mostRead: Utils.sortBy(all, 'views', true).slice(0, 4),
      categories: categories,
      activeDates: Object.keys(activeDates),
      stats: {
        totalNews: all.length,
        publishedThisYear: publishedThisYear,
        totalImages: totalImages,
        totalCategories: categories.length
      },
      canSubmit: Security.hasPermission(user.role, 'news.create')
    };
  }

  /** Senarai bertapis dengan pagination — untuk halaman "Lihat semua" */
  function list(filters, page, pageSize) {
    filters = filters || {};
    var lang = normalizeLang_(filters.lang);

    var users = UserService.getUserMap();
    var cats = NewsService.categoryMap();
    var catsEn = categoryEnMap_();

    var rows = publishedRows();

    if (filters.categoryId) {
      rows = rows.filter(function (n) {
        return String(n.CategoryID || '') === String(filters.categoryId);
      });
    }

    /*
     * Carian merentas KEDUA-DUA bahasa, pada baris mentah.
     *
     * Dua sebab ia tidak boleh dilakukan pada DTO: ringkasan DTO sudah
     * dipotong kepada 160 aksara, jadi padanan dalam badan berita akan
     * terlepas; dan DTO hanya memegang satu bahasa, jadi pembaca yang
     * menaip "robotik" tidak akan menemui artikel yang cuma mempunyai
     * versi English — walaupun artikel itu memang mengenai robotik.
     */
    if (filters.search) {
      var q = String(filters.search).toLowerCase();
      rows = rows.filter(function (n) {
        return LanguageService.searchHaystack(n).indexOf(q) !== -1;
      });
    }

    var all = rows.map(function (n) { return toCardDto(n, users, cats, catsEn, lang); });

    if (filters.date) {
      all = all.filter(function (a) { return a.publishedAt === String(filters.date); });
    }

    var sortField = filters.sortBy === 'views' ? 'views' : 'publishedAtRaw';
    all = Utils.sortBy(all, sortField, true);

    var result = Utils.paginate(all, page, pageSize || 9);
    result.lang = lang;
    return result;
  }

  /**
   * Artikel penuh untuk pembaca. Menambah kiraan tontonan dan
   * mengembalikan cadangan berkaitan daripada kategori yang sama.
   */
  function getArticle(newsId, countView, lang) {
    lang = normalizeLang_(lang);

    var n = SheetDB.findOneBy(CONFIG.SHEETS.NEWS, 'NewsID', newsId);
    if (!n) throw Utils.appError('NOT_FOUND', 'Berita tidak dijumpai.');
    if (String(n.Status) !== STATUS.PUBLISHED) {
      throw Utils.appError('NOT_FOUND', 'Berita ini belum diterbitkan.');
    }

    var users = UserService.getUserMap();
    var cats = NewsService.categoryMap();
    var catsEn = categoryEnMap_();
    var dto = toCardDto(n, users, cats, catsEn, lang);

    if (countView) {
      var next = Number(n.ViewCount || 0) + 1;
      try {
        SheetDB.updateRow(CONFIG.SHEETS.NEWS, n._row, { ViewCount: next });
        dto.views = next;
      } catch (e) { /* kiraan tontonan bukan kritikal */ }
    }

    var loc = LanguageService.getLocalizedNews(n, lang);
    dto.summary = String(loc.Summary || '');
    dto.content = String(loc.Content || '');
    dto.fallbackFields = loc._fallback;
    dto.hasFallback = loc._hasFallback;

    // Metadata SEO mengikut bahasa — disuap kepada WordPress semasa
    // penerbitan. Ia tiada kesan pada indeks web app Apps Script itu
    // sendiri, yang tidak boleh diindeks kerana dirender dalam iframe.
    dto.seoTitle = String(loc.SeoTitle || loc.Title || '');
    dto.seoDescription = String(loc.SeoDescription || '');
    dto.seoKeywords = String(loc.SeoKeywords || '');

    /*
     * Pautan kongsi.
     *
     * AMARAN: URL ini menunjuk ke web app. Jika deployment dihadkan kepada
     * domain UTM, sesiapa di luar domain yang mengklik pautan ini akan
     * melihat skrin log masuk Google, bukan berita. Perkongsian dalaman
     * (WhatsApp staf, e-mel) berfungsi; perkongsian awam tidak.
     *
     * Untuk perkongsian awam sebenar, tetapkan PUBLIC_SITE_URL dalam
     * Global Settings kepada laman WordPress fakulti, dan pautan itu akan
     * digunakan sebagai gantinya.
     */
    dto.shareUrl = buildShareUrl_(newsId, dto.slug, lang);
    dto.shareIsPublic = !!(safeSetting_('PUBLIC_SITE_URL') || safeSetting_('PUBLIC_PORTAL_URL'));
    dto.tags = String(n.Tags || '');

    dto.images = [];
    try {
      dto.images = ImageService.listForNews(newsId).map(function (img) {
        var li = LanguageService.getLocalizedImage(img, lang);
        img.caption = String(li.Caption || '');
        img.altText = String(li.AltText || '');
        return img;
      });
    } catch (e) { }

    var related = publishedRows()
      .filter(function (r) {
        return String(r.NewsID) !== String(newsId)
          && String(r.CategoryID) === String(n.CategoryID);
      })
      .map(function (r) { return toCardDto(r, users, cats, catsEn, lang); });

    dto.related = Utils.sortBy(related, 'publishedAtRaw', true).slice(0, 3);
    return dto;
  }

  function safeSetting_(key) {
    try { return GlobalSettings.get(key) || ''; } catch (e) { return ''; }
  }

  /**
   * Bersihkan URL asas.
   *
   * Apps Script hanya mengenali laluan yang berakhir dengan /exec. Satu
   * garis miring tambahan menyebabkan Google menganggapnya fail Drive dan
   * memaparkan "unable to open the file". URL yang disalin dari bar alamat
   * atau ditampal dari aplikasi lain kerap membawa garis miring, ruang
   * kosong, atau baki parameter — semuanya dibuang di sini.
   */
  function normaliseBase_(url) {
    return String(url || '')
      .trim()
      .replace(/[?#].*$/, '')   // buang parameter atau fragmen sedia ada
      .replace(/\/+$/, '');     // buang semua garis miring di hujung
  }

  /**
   * Bina pautan kongsi, mengikut keutamaan:
   *
   *   1. PUBLIC_SITE_URL   — laman awam luar (contoh WordPress fakulti)
   *   2. PUBLIC_PORTAL_URL — URL deployment Portal Awam, ditampal oleh Admin
   *   3. ScriptApp.getService().getUrl() — sandaran terakhir
   *
   * Sandaran ketiga sengaja diletakkan paling akhir kerana ia tidak boleh
   * dipercayai apabila skrip dijalankan bagi pengguna anonim: ia boleh
   * memulangkan URL deployment kepala atau tiada nilai langsung. Itulah
   * sebabnya Admin perlu menampal URL portal secara manual sekali sahaja.
   *
   * Bahasa dibawa dalam pautan supaya penerima membuka artikel dalam
   * bahasa yang sama seperti yang dilihat oleh pengirim.
   */
  function buildShareUrl_(newsId, slug, lang) {
    lang = normalizeLang_(lang);
    /*
     * view=reader memaksa portal awam walaupun penerima dikenal pasti oleh
     * Google sebagai warga domain. Tanpanya, pelajar atau staf UTM yang
     * mengklik pautan WhatsApp dihantar ke aplikasi dalaman — skrin akses
     * ditolak, atau lebih teruk, didaftarkan sebagai Penulis secara
     * automatik jika AUTO_REGISTER_AUTHOR dihidupkan.
     */
    var byId = '?view=reader&id=' + encodeURIComponent(newsId) + '&lang=' + lang;

    /*
     * PUBLIC_SITE_URL ialah laman luar (contoh WordPress fakulti), di mana
     * berita dicapai melalui slug. PUBLIC_PORTAL_URL pula ialah portal Apps
     * Script ini, yang menggunakan ?id=.
     *
     * Kedua-dua medan mudah dikelirukan. Jika URL Apps Script ditampal ke
     * dalam PUBLIC_SITE_URL, hasilnya ialah pautan seperti .../exec/slug
     * yang tidak dikenali oleh Google — jadi nilai sedemikian diabaikan di
     * sini dan dilayan sebagai portal, bukan laman luar.
     *
     * Slug kosong juga diperiksa: tanpa slug, pautan laman luar menjadi
     * hanya URL asas diikuti garis miring, yang membawa pembaca ke tempat
     * yang salah.
     */
    var site = normaliseBase_(safeSetting_('PUBLIC_SITE_URL'));
    var isAppsScript = /script\.google\.com/i.test(site);

    if (site && !isAppsScript && slug) return site + '/' + slug;

    var portal = normaliseBase_(safeSetting_('PUBLIC_PORTAL_URL'));
    if (portal) return portal + byId;

    // Jika URL Apps Script tersilap diletak dalam PUBLIC_SITE_URL, gunakannya
    // sebagai portal supaya pautan tetap berfungsi.
    if (site && isAppsScript) return site + byId;

    var appUrl = '';
    try { appUrl = ScriptApp.getService().getUrl() || ''; } catch (e) { }
    appUrl = normaliseBase_(appUrl);
    return appUrl ? appUrl + byId : '';
  }

  return {
    readMinutes: readMinutes,
    getHome: getHome,
    list: list,
    getArticle: getArticle
  };
})();