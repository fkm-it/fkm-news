/**
 * WidgetService.gs
 * -----------------------------------------------------------------------
 * Backend data providers for the FKM News sidebar widgets:
 *   1. Trend Bulanan      -> getMonthlyTrend_()
 *   2. Kad Ucapan/Poster  -> getActiveGreetingCard_()
 *   3. Pautan Pantas      -> getQuickLinks_()
 *
 * Entry point called from the frontend via google.script.run:
 *   getSidebarData_()  (melalui publicSidebar)
 *
 * Uses SheetDB.gs (the project's existing data-access repository layer)
 * and the STATUS enum from Constants.gs — consistent with every other
 * service, rather than calling SpreadsheetApp directly.
 *
 * Sheets required (see CONFIG.SHEETS in Config.gs):
 *   - NEWS            (existing)
 *   - GREETING_CARDS  (new — CardID | Title | StartDate | EndDate |
 *                       PosterImageURL | IsOverride | IsActive | Priority)
 *   - SYSTEM_SETTINGS (existing — stores QUICK_LINKS as a JSON string)
 * -----------------------------------------------------------------------
 */

/** Single call the frontend uses to populate all 3 widgets at once. */
function getSidebarData_(lang) {
  return {
    trend: getMonthlyTrend_(6),
    greetingCard: getActiveGreetingCard_(lang),
    quickLinks: getQuickLinks_()
  };
}

/* =========================================================================
 * 1. TREND BULANAN
 * =======================================================================*/

/**
 * Returns published-article counts for the last N months.
 * Adjust PUBLISHED_AT_FIELD below if the NEWS sheet uses a different
 * column name for the publish date.
 */
function getMonthlyTrend_(monthsBack) {
  monthsBack = monthsBack || 6;
  var PUBLISHED_AT_FIELD = 'PublishedAt'; // <-- confirm/rename to match your NEWS sheet

  var tz = CONFIG.TIMEZONE || Session.getScriptTimeZone();
  var now = new Date();

  var buckets = [];
  for (var i = monthsBack - 1; i >= 0; i--) {
    var d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    buckets.push({
      key: Utilities.formatDate(d, tz, 'yyyy-MM'),
      month: Utilities.formatDate(d, tz, 'MMM yy'),
      count: 0
    });
  }
  var bucketByKey = {};
  buckets.forEach(function (b) { bucketByKey[b.key] = b; });

  var newsRows;
  try {
    newsRows = SheetDB.findAll(CONFIG.SHEETS.NEWS);
  } catch (e) {
    // NEWS sheet missing/unreadable — return zeroed buckets rather than
    // breaking the whole sidebar.
    return buckets.map(function (b) { return { month: b.month, count: b.count }; });
  }

  newsRows.forEach(function (row) {
    if (row.Status !== STATUS.PUBLISHED) return;
    var dt = row[PUBLISHED_AT_FIELD];
    if (!(dt instanceof Date)) return;
    var key = Utilities.formatDate(dt, tz, 'yyyy-MM');
    if (bucketByKey[key]) bucketByKey[key].count++;
  });

  return buckets.map(function (b) { return { month: b.month, count: b.count }; });
}

/* =========================================================================
 * 2. KAD UCAPAN / GREETING POSTER
 * =======================================================================*/

/**
 * GREETING_CARDS sheet schema:
 *   CardID | Title | StartDate | EndDate | PosterImageURL | IsOverride | IsActive | Priority
 *
 * Selection rule (auto + admin override):
 *   - Only rows where IsActive = TRUE and today falls within
 *     [StartDate, EndDate] are considered.
 *   - Rows with IsOverride = TRUE always outrank automatic rows.
 *   - Within the same tier, higher Priority wins.
 */
function getActiveGreetingCard_(lang) {
  var rows;
  try {
    rows = SheetDB.findAll(CONFIG.SHEETS.GREETING_CARDS);
  } catch (e) {
    return null; // sheet not found — widget just stays hidden
  }

  /*
   * Peraturan pemilihan tinggal dalam GreetingCardService.pickActive().
   * Salinan tempatan di sini dahulu bermakna halaman Tetapan dan portal
   * boleh tidak sepakat tentang kad mana yang "sedang dipaparkan".
   */
  var row = GreetingCardService.pickActive(rows, new Date());
  if (!row) return null;

  return {
    // Tajuk kad mengikut bahasa aktif; berundur kepada BM apabila
    // TitleEn belum diisi, sama seperti kandungan berita.
    title: LanguageService.pick(row, 'Title', lang).value,
    posterUrl: normalizeImageUrl_(row.PosterImageURL),
    isOverride: String(row.IsOverride).trim().toUpperCase() === 'TRUE',
    priority: Number(row.Priority) || 0
  };
}

/**
 * Menukar apa-apa bentuk pautan Google Drive kepada URL yang benar-benar
 * memulangkan bait imej kepada tag <img>.
 *
 * Laluan lama /uc?export=view telah ditutup oleh Google — ia kini
 * mengalihkan ke halaman pengesahan, jadi imej pecah secara senyap.
 * Titik akhir /thumbnail masih menghidangkan imej untuk fail yang
 * dikongsi "Anyone with the link".
 *
 * Admin boleh menampal pautan Drive dalam apa jua bentuk — termasuk
 * pautan Share mentah — dan sistem membetulkannya di sini. URL bukan
 * Drive (Imgur, CDN fakulti, dsb.) dibiarkan tidak berubah.
 *
 * @param {string} url pautan seperti yang ditaip dalam sheet
 * @param {number=} width lebar piksel yang diminta; lalai 1000
 * @return {string} URL yang boleh dimuatkan, atau '' jika tiada
 */
function normalizeImageUrl_(url, width) {
  url = String(url || '').trim();
  if (!url) return '';
  if (url.indexOf('drive.google.com') === -1) return url;

  // Bentuk yang dikenali:
  //   /file/d/<ID>/view      (pautan Share)
  //   ?id=<ID> atau &id=<ID> (uc?export=view, thumbnail)
  //   /d/<ID>                (pautan ringkas)
  var m = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) ||
          url.match(/[?&]id=([a-zA-Z0-9_-]+)/) ||
          url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (!m) return url;

  return 'https://drive.google.com/thumbnail?id=' + m[1] + '&sz=w' + (width || 1000);
}

/* =========================================================================
 * 3. PAUTAN PANTAS
 * =======================================================================*/

/**
 * Reads QUICK_LINKS from SYSTEM_SETTINGS (SettingKey = 'QUICK_LINKS',
 * SettingValue = JSON string) so Admin can edit links without redeploying
 * code. Falls back to sensible UTM defaults if not seeded yet.
 */
function getQuickLinks_() {
  try {
    var row = SheetDB.findOneBy(CONFIG.SHEETS.SYSTEM_SETTINGS, 'SettingKey', 'QUICK_LINKS');
    if (row && row.SettingValue) {
      return JSON.parse(row.SettingValue);
    }
  } catch (e) {
    // fall through to default below
  }
  return DEFAULT_QUICK_LINKS_;
}

/**
 * Default quick links — official UTM system URLs. Verify these still match
 * FKM's intended targets before going live; update via SYSTEM_SETTINGS
 * (QUICK_LINKS) rather than editing this array once the system is running.
 */
var DEFAULT_QUICK_LINKS_ = [
  { label: 'Laman Web FKM',   url: 'https://mech.utm.my',      icon: 'globe' },
  { label: 'Sistem Akademik', url: 'https://my.utm.my',        icon: 'graduation-cap' },
  { label: 'e-Pembelajaran',  url: 'https://elearning.utm.my', icon: 'monitor' },
  { label: 'Portal UTM',      url: 'https://www.utm.my',       icon: 'file-text' },
  { label: 'Perpustakaan',    url: 'https://library.utm.my',   icon: 'book' },
  { label: 'Helpdesk IT',     url: 'https://digital.utm.my',   icon: 'headphones' }
];

/**
 * One-off helper to seed/refresh the QUICK_LINKS setting row.
 * Run manually once from the Apps Script editor (Run > seedQuickLinksSetting).
 */
function seedQuickLinksSetting() {
  requireOwnerOrTrigger_('seedQuickLinksSetting', arguments[0]);
  var existing = SheetDB.findOneBy(CONFIG.SHEETS.SYSTEM_SETTINGS, 'SettingKey', 'QUICK_LINKS');
  if (existing) {
    SheetDB.updateBy(CONFIG.SHEETS.SYSTEM_SETTINGS, 'SettingKey', 'QUICK_LINKS', {
      SettingValue: JSON.stringify(DEFAULT_QUICK_LINKS_)
    });
  } else {
    SheetDB.insert(CONFIG.SHEETS.SYSTEM_SETTINGS, {
      SettingKey: 'QUICK_LINKS',
      SettingValue: JSON.stringify(DEFAULT_QUICK_LINKS_),
      Description: 'Sidebar quick links (JSON array)',
      UpdatedAt: new Date()
    });
  }
}