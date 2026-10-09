/**
 * LanguageService.gs
 * -----------------------------------------------------------------------
 * Menukar rekod mentah kepada bentuk satu-bahasa untuk dipaparkan.
 *
 * KONVENSI LAJUR
 * Lajur sedia ada (Title, Summary, Content, CategoryName, …) memegang
 * Bahasa Melayu. Versi English berada dalam lajur bersufiks "En"
 * (TitleEn, SummaryEn, ContentEn, CategoryNameEn, …).
 *
 * Sebabnya: setiap fail servis yang sedia ada membaca row.Title. Menamakan
 * semula lajur itu kepada TitleBm akan memaksa suntingan serentak dalam
 * belasan fail — setiap satu satu peluang untuk pecah. Menambah lajur
 * bersufiks pula tidak menyentuh satu baris pun kod sedia ada.
 *
 * PRINSIP FALLBACK
 * Teks BM sentiasa wujud (ia yang asal). Teks EN mungkin belum ditulis.
 * Jadi fallback mengalir satu arah — EN kosong jatuh kepada BM, dan
 * pemanggil diberitahu melalui bendera `fallback` supaya antara muka boleh
 * memaparkan penunjuk "English version unavailable". Tiada terjemahan
 * automatik: teks yang dijana mesin pada laman rasmi fakulti lebih
 * memudaratkan daripada teks BM yang jujur.
 * -----------------------------------------------------------------------
 */

var LanguageService = (function () {

  /** Medan berita yang mempunyai pasangan dwibahasa. */
  var NEWS_FIELDS = ['Title', 'Summary', 'Content', 'SeoTitle', 'SeoDescription', 'SeoKeywords'];

  /** Medan kategori yang mempunyai pasangan dwibahasa. */
  var CATEGORY_FIELDS = ['CategoryName', 'Description'];

  /** Medan gambar yang mempunyai pasangan dwibahasa. */
  var IMAGE_FIELDS = ['Caption', 'AltText'];

  /**
   * Bahasa pilihan pengguna, disimpan dalam User Properties.
   * Ia pilihan peribadi seperti mod tema — bukan tetapan sistem.
   * Pelawat awam tanpa akaun tidak mempunyai User Properties; pilihan
   * mereka hidup dalam localStorage pelayar sahaja.
   */
  function getLanguage() {
    try {
      var saved = UserPrefs.get('FKMNEWS_LANG');
      if (saved === LANGS.BM || saved === LANGS.EN) return saved;
    } catch (e) { }
    return DEFAULT_LANG;
  }

  function setLanguage(lang) {
    var v = normalizeLang_(lang);
    try {
      UserPrefs.set('FKMNEWS_LANG', v);
    } catch (e) { }
    return { lang: v, htmlLang: HTML_LANG[v] };
  }

  /**
   * Nilai satu medan dalam bahasa diminta, dengan fallback kepada BM.
   * @return {{value:string, fallback:boolean}}
   */
  function pick(row, field, lang) {
    var bm = String(row[field] === null || row[field] === undefined ? '' : row[field]);

    if (normalizeLang_(lang) === LANGS.BM) {
      return { value: bm, fallback: false };
    }

    var en = row[field + 'En'];
    en = String(en === null || en === undefined ? '' : en).trim();

    if (en) return { value: en, fallback: false };
    return { value: bm, fallback: true };
  }

  /**
   * Meratakan satu rekod kepada bentuk satu-bahasa.
   *
   * Lajur BM dan En yang asal DIBUANG daripada hasil. Ini disengajakan:
   * ia menghalang paparan daripada tersilap membaca row.Title secara terus
   * dan memintas logik bahasa tanpa disedari.
   *
   * @param {Object} row baris mentah daripada SheetDB
   * @param {Array<string>} fields senarai medan dwibahasa
   * @param {string} lang bahasa diminta
   * @return {Object} rekod tempatan, dengan _fallback menyenaraikan medan
   *                  yang terpaksa berundur kepada BM
   */
  function localize(row, fields, lang) {
    var out = {};
    var fallbacks = [];

    Object.keys(row).forEach(function (k) {
      var base = k.replace(/En$/, '');
      var isPair = fields.indexOf(base) !== -1 && (k === base || k === base + 'En');
      if (!isPair) out[k] = row[k];
    });

    fields.forEach(function (f) {
      if (!Object.prototype.hasOwnProperty.call(row, f)) return;
      var r = pick(row, f, lang);
      out[f] = r.value;
      if (r.fallback && r.value) fallbacks.push(f);
    });

    out._lang = normalizeLang_(lang);
    out._fallback = fallbacks;
    out._hasFallback = fallbacks.length > 0;
    return out;
  }

  function getLocalizedNews(row, lang) {
    return localize(row, NEWS_FIELDS, lang);
  }

  function getLocalizedCategory(row, lang) {
    return localize(row, CATEGORY_FIELDS, lang);
  }

  function getLocalizedImage(row, lang) {
    return localize(row, IMAGE_FIELDS, lang);
  }

  function getLocalizedList(rows, lang, fields) {
    var f = fields || NEWS_FIELDS;
    return (rows || []).map(function (r) { return localize(r, f, lang); });
  }

  /**
   * Adakah satu berita mempunyai versi English yang lengkap?
   * Tajuk dan kandungan wajib; ringkasan tidak, kerana sesetengah berita
   * pendek memang tidak memerlukannya.
   */
  function hasEnglish(row) {
    return !!String(row.TitleEn || '').trim() && !!String(row.ContentEn || '').trim();
  }

  function hasMalay(row) {
    return !!String(row.Title || '').trim() && !!String(row.Content || '').trim();
  }

  /**
   * Penunjuk kesiapan dwibahasa untuk satu berita.
   * @return {{bm:boolean, en:boolean, label:string}}
   */
  function completeness(row) {
    var bm = hasMalay(row);
    var en = hasEnglish(row);
    return {
      bm: bm,
      en: en,
      label: 'BM ' + (bm ? '\u2713' : '\u2014') + '   EN ' + (en ? '\u2713' : '\u2014')
    };
  }

  /**
   * Ringkasan kesiapan terjemahan merentas semua berita, untuk papan
   * pemuka Admin. Hanya berita yang telah diterbitkan atau diluluskan
   * dikira — draf yang belum siap bukan hutang terjemahan.
   */
  function translationSummary() {
    var rows;
    try {
      rows = SheetDB.findAll(CONFIG.SHEETS.NEWS);
    } catch (e) {
      return { total: 0, bmComplete: 0, enComplete: 0, bmPercent: 0, enPercent: 0, incompleteEn: 0 };
    }

    var counted = rows.filter(function (r) {
      return r.Status === STATUS.PUBLISHED || r.Status === STATUS.APPROVED;
    });

    var bmDone = counted.filter(hasMalay).length;
    var enDone = counted.filter(hasEnglish).length;
    var total = counted.length;

    return {
      total: total,
      bmComplete: bmDone,
      enComplete: enDone,
      bmPercent: total ? Math.round((bmDone / total) * 100) : 0,
      enPercent: total ? Math.round((enDone / total) * 100) : 0,
      incompleteEn: total - enDone
    };
  }

  /**
   * Penapis senarai mengikut kesiapan terjemahan.
   * @param {Array<Object>} rows baris mentah
   * @param {string} mode 'all' | 'bm' | 'en' | 'incomplete'
   */
  function filterByTranslation(rows, mode) {
    switch (String(mode || 'all')) {
      case 'bm': return rows.filter(hasMalay);
      case 'en': return rows.filter(hasEnglish);
      case 'incomplete': return rows.filter(function (r) { return !hasEnglish(r) || !hasMalay(r); });
      default: return rows;
    }
  }

  /**
   * Teks yang boleh dicari bagi satu berita — kedua-dua bahasa digabung.
   * Carian mesti merentas bahasa: pengguna yang menaip "robotik" perlu
   * menemui artikel yang hanya mempunyai versi English, kerana artikel itu
   * memang berkaitan dengan apa yang mereka cari.
   */
  function searchHaystack(row) {
    return [
      row.Title, row.TitleEn,
      row.Summary, row.SummaryEn,
      row.Content, row.ContentEn
    ].map(function (v) {
      return String(v === null || v === undefined ? '' : v);
    }).join(' ').toLowerCase();
  }

  return {
    getLanguage: getLanguage,
    setLanguage: setLanguage,
    pick: pick,
    getLocalizedNews: getLocalizedNews,
    getLocalizedCategory: getLocalizedCategory,
    getLocalizedImage: getLocalizedImage,
    getLocalizedList: getLocalizedList,
    hasEnglish: hasEnglish,
    hasMalay: hasMalay,
    completeness: completeness,
    translationSummary: translationSummary,
    filterByTranslation: filterByTranslation,
    searchHaystack: searchHaystack,
    NEWS_FIELDS: NEWS_FIELDS,
    CATEGORY_FIELDS: CATEGORY_FIELDS,
    IMAGE_FIELDS: IMAGE_FIELDS
  };
})();