/**
 * Config.gs
 * ---------------------------------------------------------------------
 * Konfigurasi teknikal yang jarang berubah.
 *
 * CONFIG.HEADERS dijana daripada susunan lajur SEBENAR dalam spreadsheet.
 * Apabila menambah lajur pada mana-mana sheet, tambah ia di sini juga DAN
 * pada kedudukan yang sama. setupSystem() menulis semula baris tajuk
 * daripada senarai ini dan memadam lajur yang melebihinya.
 *
 * Rahsia (token media sosial) TIDAK disimpan di sini. Ia tinggal dalam
 * Script Properties dan dicapai melalui getSecret().
 * ---------------------------------------------------------------------
 */

var CONFIG = {

  SCHEMA_VERSION: '1.0.0',
  SYSTEM_NAME: 'FKM News Management & Publication Workflow System',
  SYSTEM_SHORT_NAME: 'FKM News',
  FACULTY_NAME: 'Fakulti Kejuruteraan Mekanikal, Universiti Teknologi Malaysia',
  TIMEZONE: 'Asia/Kuala_Lumpur',

  /**
   * Nilai teknikal yang tidak sepatutnya boleh diubah oleh Admin melalui
   * antara muka. Berbeza daripada SYSTEM_SETTINGS, yang memegang tetapan
   * operasi dan paparan.
   *
   * Dibaca oleh Utils.nextId() dan Utils.withLock().
   */
  TECHNICAL: {
    /*
     * Tempoh menunggu kunci skrip, dalam milisaat.
     *
     * Terlalu pendek: dua Author yang menghantar serentak berlanggar dan
     * seorang menerima "Sistem sedang sibuk".
     * Terlalu panjang: permintaan tergantung, pengguna menekan butang
     * berulang kali, dan keadaan menjadi lebih buruk.
     *
     * 15 saat memberi ruang untuk penulisan Sheets yang perlahan tanpa
     * membuat antara muka terasa mati.
     */
    LOCK_TIMEOUT_MS: 15000
  },

  /** Kunci Script Properties. Nama di bawah dibaca daripada projek sebenar. */
  PROP_KEYS: {
    SPREADSHEET_ID: 'FKMNEWS_SPREADSHEET_ID',
    DRIVE_ROOT_ID: 'FKMNEWS_DRIVE_ROOT_ID',
    INSTALLED_AT: 'FKMNEWS_INSTALLED_AT',
    SCHEMA_VERSION: 'FKMNEWS_SCHEMA_VERSION'
  },

  /** Kunci rahsia — nilai tidak pernah ditulis dalam kod. */
  SECRET_KEYS: {
    FB_PAGE_TOKEN: 'FKMNEWS_FB_PAGE_TOKEN',
    FB_PAGE_ID: 'FKMNEWS_FB_PAGE_ID',
    IG_USER_ID: 'FKMNEWS_IG_USER_ID',
    IG_ACCESS_TOKEN: 'FKMNEWS_IG_ACCESS_TOKEN'
  },

  /*
   * Awalan ID.
   *
   * NAMA KUNCI mesti sepadan dengan apa yang Utils.gs baca, bukan dengan
   * nama sheet. Contohnya AUDIT_LOG dibaca sebagai ID_PREFIX.AUDIT.
   *
   * NILAI mesti sepadan dengan kunci SEQ_* dalam Script Properties, yang
   * memegang nombor turutan semasa. Menukar satu nilai akan memulakan
   * penomboran semula dari satu dan menghasilkan ID bertindih dengan
   * rekod sedia ada.
   */
  ID_PREFIX: {
    NEWS: 'NEWS',         // SEQ_NEWS_2026 — contoh: NEWS-2026-00011
    USER: 'USR',          // SEQ_USR       — contoh: USR-00001
    VERSION: 'VER',       // SEQ_VER       — contoh: VER-00010
    REVIEW: 'REV',        // SEQ_REV       — contoh: REV-00013
    NOTIFICATION: 'NTF',  // SEQ_NTF       — contoh: NTF-00004
    AUDIT: 'LOG',         // SEQ_LOG       — contoh: LOG-00001
    CATEGORY: 'CAT',      // contoh: CAT-001
    IMAGE: 'IMG',         // SEQ_IMG       — contoh: IMG-00021
    SOCIAL: 'SOC',        // belum ada rekod; SEQ_SOC tercipta pada posting pertama
    CARD: 'CARD'          // belum ada rekod
  },

  SHEETS: {
    USERS: 'USERS',
    NEWS: 'NEWS',
    NEWS_VERSIONS: 'NEWS_VERSIONS',
    REVIEWS: 'REVIEWS',
    NOTIFICATIONS: 'NOTIFICATIONS',
    CATEGORIES: 'CATEGORIES',
    AUDIT_LOG: 'AUDIT_LOG',
    SYSTEM_SETTINGS: 'SYSTEM_SETTINGS',
    NEWS_IMAGES: 'NEWS_IMAGES',
    SOCIAL_POSTS: 'SOCIAL_POSTS',
    GREETING_CARDS: 'GREETING_CARDS'
  },

  /**
   * Susunan lajur sebenar setiap sheet.
   * Lajur dwibahasa disertakan di hujung sheet berkenaan.
   */
  HEADERS: {
    USERS: [
      'UserID', 'Email', 'Name', 'Role', 'Department', 'Position', 'Status', 'CreatedAt',
      'UpdatedAt', 'LastLogin'
    ],
    NEWS: [
      'NewsID', 'Title', 'Slug', 'CategoryID', 'AuthorID', 'Summary', 'Content',
      'FeaturedImageURL', 'FeaturedImageID', 'AttachmentFolderID', 'Status', 'CurrentVersion',
      'Tags', 'EventDate', 'SubmittedAt', 'AdminReviewedBy', 'AdminReviewedAt',
      'EditorReviewedBy', 'EditorReviewedAt', 'PublishedAt', 'RejectReason', 'ViewCount',
      'CreatedAt', 'UpdatedAt', 'TitleEn', 'SummaryEn', 'ContentEn', 'SeoTitle',
      'SeoTitleEn', 'SeoDescription', 'SeoDescriptionEn', 'SeoKeywords', 'SeoKeywordsEn'
    ],
    NEWS_VERSIONS: [
      'VersionID', 'NewsID', 'VersionNumber', 'Title', 'Summary', 'Content', 'FeaturedImageURL',
      'SubmittedBy', 'SubmissionDate', 'Note'
    ],
    REVIEWS: [
      'ReviewID', 'NewsID', 'ReviewerID', 'ReviewerRole', 'ReviewStage', 'Decision',
      'Comments', 'CreatedAt'
    ],
    NOTIFICATIONS: [
      'NotificationID', 'UserID', 'NewsID', 'Type', 'Subject', 'Message', 'IsRead',
      'CreatedAt', 'ReadAt'
    ],
    CATEGORIES: [
      'CategoryID', 'CategoryName', 'Description', 'Status', 'CreatedAt', 'UpdatedAt',
      'CategoryNameEn', 'DescriptionEn'
    ],
    AUDIT_LOG: [
      'LogID', 'UserID', 'Action', 'Entity', 'EntityID', 'OldStatus', 'NewStatus',
      'Description', 'Context', 'Timestamp'
    ],
    SYSTEM_SETTINGS: [
      'SettingKey', 'SettingValue', 'ValueType', 'SettingGroup', 'IsPublic', 'Description',
      'UpdatedAt', 'UpdatedBy'
    ],
    NEWS_IMAGES: [
      'ImageID', 'NewsID', 'FileID', 'FileName', 'MimeType', 'SizeBytes', 'Caption',
      'AltText', 'SortOrder', 'IsFeatured', 'IsSelectedForSocial', 'PublicUrl',
      'UploadedBy', 'CreatedAt', 'CaptionEn', 'AltTextEn'
    ],
    SOCIAL_POSTS: [
      'PostID', 'NewsID', 'Platform', 'TargetID', 'Status', 'ExternalPostID', 'PermalinkUrl',
      'Caption', 'ImageCount', 'ErrorMessage', 'PostedBy', 'RequestedAt', 'CompletedAt'
    ],
    GREETING_CARDS: [
      'CardID', 'Title', 'StartDate', 'EndDate', 'PosterImageURL', 'IsOverride',
      'IsActive', 'Priority', 'TitleEn'
    ]
  },

  /* ------------------------------------------------------- Pencapai */

  /**
   * ID spreadsheet dibaca daripada Script Properties, bukan ditulis dalam
   * kod. setupSystem() yang menetapkannya, dan menyimpannya di luar sumber
   * bermakna ID itu tidak bocor melalui salinan kod atau repositori.
   */
  getSpreadsheetId: function () {
    var id = PropertiesService.getScriptProperties()
      .getProperty(this.PROP_KEYS.SPREADSHEET_ID);
    if (!id) throw new Error('Spreadsheet belum di-setup. Jalankan setupSystem().');
    return id;
  },

  getDriveRootId: function () {
    var id = PropertiesService.getScriptProperties()
      .getProperty(this.PROP_KEYS.DRIVE_ROOT_ID);
    if (!id) throw new Error('Folder Drive belum di-setup. Jalankan setupSystem().');
    return id;
  },

  getSecret: function (key) {
    return PropertiesService.getScriptProperties().getProperty(key) || '';
  },

  hasSecret: function (key) {
    return !!this.getSecret(key);
  },

  setSecret: function (key, value) {
    PropertiesService.getScriptProperties().setProperty(key, String(value));
  },

  /**
   * Benar setelah setupSystem() dijalankan. doGet() memaparkan mesej
   * "Sistem belum dipasang" apabila ini palsu, dan bukannya tumbang dengan
   * ralat yang tidak bermakna kepada pengguna.
   */
  isInstalled: function () {
    try {
      var id = PropertiesService.getScriptProperties()
        .getProperty(this.PROP_KEYS.SPREADSHEET_ID);
      if (!id) return false;
      return !!SpreadsheetApp.openById(id).getSheetByName(this.SHEETS.SYSTEM_SETTINGS);
    } catch (e) {
      return false;
    }
  }
};