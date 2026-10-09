/**
 * ConfigRecovery.gs
 * -----------------------------------------------------------------------
 * Menjana Config.gs daripada keadaan sebenar sistem.
 *
 * KENAPA DIJANA, BUKAN DITULIS TANGAN
 *
 * CONFIG.HEADERS mesti sepadan dengan susunan lajur sebenar setiap sheet.
 * setupSystem() menulis semula baris 1 daripada senarai itu:
 *
 *     sh.getRange(1, 1, 1, headers.length).setValues([headers]);
 *
 * Jika susunan yang ditulis berbeza daripada susunan data di bawahnya,
 * setiap lajur akan tersasar daripada tajuknya — Email di bawah tajuk Name,
 * Status di bawah tajuk Role. SheetDB memetakan mengikut nama tajuk, jadi
 * kerosakan itu merebak ke seluruh sistem dan tidak kelihatan sehingga
 * seseorang menyedari data pengguna bercampur aduk.
 *
 * Menyalin susunan daripada sheet yang hidup menghapuskan risiko itu
 * sepenuhnya. Tiada tekaan terlibat.
 *
 * CARA GUNA
 *   1. Run > generateConfig
 *   2. Buka pautan fail yang dicetak dalam log
 *   3. Dalam fail itu: Ctrl+A, Ctrl+C, tampal ke Config.gs
 *   4. Run > generateConfigNotes  — baca sebelum deploy
 *
 * Kod dan nota diasingkan kepada dua fungsi. Sebelum ini kedua-duanya
 * dicetak bersama dengan baris pemisah, dan pemisah itu mudah tersalin
 * sekali ke dalam Config.gs — menghasilkan ralat sintaks pada baris 1.
 *
 * KESELAMATAN: fungsi ini mencetak NAMA kunci Script Properties sahaja,
 * tidak pernah nilainya. Token Facebook dan Instagram tidak akan muncul
 * dalam log.
 * -----------------------------------------------------------------------
 */

/** Sheet yang dijangka wujud, mengikut urutan logik untuk dibaca manusia. */
var EXPECTED_SHEETS_ = [
  'USERS', 'NEWS', 'NEWS_VERSIONS', 'REVIEWS', 'NOTIFICATIONS',
  'CATEGORIES', 'AUDIT_LOG', 'SYSTEM_SETTINGS', 'NEWS_IMAGES',
  'SOCIAL_POSTS', 'GREETING_CARDS'
];

/** Lajur ID utama bagi setiap sheet, untuk mengesan awalan ID. */
var ID_COLUMN_ = {
  USERS: 'UserID',
  NEWS: 'NewsID',
  NEWS_VERSIONS: 'VersionID',
  REVIEWS: 'ReviewID',
  NOTIFICATIONS: 'NotificationID',
  CATEGORIES: 'CategoryID',
  AUDIT_LOG: 'LogID',
  NEWS_IMAGES: 'ImageID',
  SOCIAL_POSTS: 'PostID',
  GREETING_CARDS: 'CardID'
};

/** Lajur dwibahasa yang mesti disenaraikan supaya setupSystem tidak memadamnya. */
var RECOVERY_BILINGUAL_ = {
  NEWS: ['TitleEn', 'SummaryEn', 'ContentEn', 'SeoTitle', 'SeoTitleEn',
         'SeoDescription', 'SeoDescriptionEn', 'SeoKeywords', 'SeoKeywordsEn'],
  CATEGORIES: ['CategoryNameEn', 'DescriptionEn'],
  NEWS_IMAGES: ['CaptionEn', 'AltTextEn'],
  GREETING_CARDS: ['TitleEn']
};

/* =========================================================================
 * PENJANA UTAMA
 * =======================================================================*/

/**
 * Menjana Config.gs. Keluarannya ialah KOD SAHAJA — tiada tajuk, tiada
 * pemisah, tiada nota. Apa-apa yang bukan JavaScript sah tidak dicetak di
 * sini, supaya tiada apa yang boleh tersalin dan merosakkan fail.
 *
 * Nota berasingan: jalankan generateConfigNotes().
 */
function generateConfig() {
  var ss = openSpreadsheet_();
  var live = readLiveSheets_(ss);
  var props = readPropertyKeys_();
  var prefixes = detectIdPrefixes_(ss, live);

  var source = buildConfigSource_(live, props, prefixes);

  /*
   * Salinan ditulis ke Drive kerana execution log membalut baris panjang
   * dan menambah cap masa pada setiap entri. Menyalin daripadanya mudah
   * membawa tempelan yang tidak diingini. Fail dalam Drive disalin bersih
   * dengan Ctrl+A.
   */
  var url = '';
  try {
    var stamp = Utilities.formatDate(new Date(), 'Asia/Kuala_Lumpur', 'yyyy-MM-dd_HHmm');
    var file = DriveApp.createFile('Config_dijana_' + stamp + '.txt', source, MimeType.PLAIN_TEXT);
    file.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE);
    url = file.getUrl();
  } catch (e) {
    url = '(gagal menulis ke Drive: ' + e.message + ')';
  }

  Logger.log('Fail dijana: ' + url);
  Logger.log('Buka fail di atas, Ctrl+A, Ctrl+C, tampal ke Config.gs.');
  Logger.log('Kemudian: Run > generateConfigNotes');
  Logger.log('');
  Logger.log(source);

  return source;
}

/**
 * Semakan yang perlu dibaca sebelum deploy. Diasingkan daripada
 * generateConfig() supaya teks ini tidak pernah berada dalam papan klip
 * yang sama dengan kod.
 */
function generateConfigNotes() {
  var ss = openSpreadsheet_();
  var live = readLiveSheets_(ss);
  var props = readPropertyKeys_();
  var prefixes = detectIdPrefixes_(ss, live);

  var notes = buildNotes_(live, props, prefixes);
  Logger.log(notes);
  return notes;
}

/* =========================================================================
 * PEMBACAAN KEADAAN SEBENAR
 * =======================================================================*/

/**
 * Membuka spreadsheet tanpa bergantung pada CONFIG, yang mungkin rosak —
 * itulah sebabnya fungsi ini dijalankan.
 */
function openSpreadsheet_() {
  // Cuba Script Properties dahulu: itulah tempat Setup.gs menyimpannya.
  var props = PropertiesService.getScriptProperties().getProperties();
  var candidates = Object.keys(props).filter(function (k) {
    return /SPREADSHEET/i.test(k) && /^[a-zA-Z0-9_-]{30,}$/.test(String(props[k]));
  });

  for (var i = 0; i < candidates.length; i++) {
    try { return SpreadsheetApp.openById(props[candidates[i]]); } catch (e) { }
  }

  // Sandaran: ID yang diketahui daripada URL spreadsheet.
  try {
    return SpreadsheetApp.openById('1ZwE7OpA5ptr8Ovb3mc5aKvFe4su8wyXLg4bPoan4z5c');
  } catch (e) { }

  throw new Error('Tidak dapat membuka spreadsheet. Tampal ID secara manual dalam openSpreadsheet_().');
}

/** Nama dan tajuk sebenar setiap sheet, mengikut susunan sebenar. */
function readLiveSheets_(ss) {
  var out = {};

  ss.getSheets().forEach(function (sh) {
    var name = sh.getName();
    var lastCol = sh.getLastColumn();
    if (!lastCol) { out[name] = []; return; }

    out[name] = sh.getRange(1, 1, 1, lastCol).getValues()[0]
      .map(function (h) { return String(h).trim(); })
      .filter(function (h) { return h !== ''; });
  });

  return out;
}

/**
 * Nama kunci Script Properties — NILAI TIDAK PERNAH DIBACA.
 * Ini yang mendedahkan penamaan sebenar PROP_KEYS dan SECRET_KEYS.
 */
function readPropertyKeys_() {
  try {
    return PropertiesService.getScriptProperties().getKeys().sort();
  } catch (e) {
    return [];
  }
}

/**
 * Mengesan awalan ID daripada rekod sedia ada.
 *
 * 'NEWS-2026-00022' menghasilkan awalan 'NEWS' dengan tahun;
 * 'USR-00001' menghasilkan 'USR' tanpa tahun.
 */
function detectIdPrefixes_(ss, live) {
  var out = {};

  Object.keys(ID_COLUMN_).forEach(function (sheetName) {
    var headers = live[sheetName];
    if (!headers) return;

    var col = headers.indexOf(ID_COLUMN_[sheetName]);
    if (col === -1) return;

    var sh = ss.getSheetByName(sheetName);
    var lastRow = Math.min(sh.getLastRow(), 6);
    if (lastRow < 2) return;

    var values = sh.getRange(2, col + 1, lastRow - 1, 1).getValues();
    for (var i = 0; i < values.length; i++) {
      var id = String(values[i][0]).trim();
      if (!id) continue;

      var m = id.match(/^([A-Z]+)-(\d{4})-(\d+)$/);
      if (m) { out[sheetName] = { prefix: m[1], withYear: true, sample: id }; return; }

      m = id.match(/^([A-Z]+)-(\d+)$/);
      if (m) { out[sheetName] = { prefix: m[1], withYear: false, sample: id }; return; }
    }
  });

  return out;
}

/* =========================================================================
 * PENJANAAN SUMBER
 * =======================================================================*/

function q_(s) { return "'" + String(s).replace(/'/g, "\\'") + "'"; }

function headerArray_(headers, indent) {
  // Dipecahkan kepada beberapa baris supaya senarai panjang kekal boleh dibaca.
  var lines = [];
  var current = [];

  headers.forEach(function (h) {
    current.push(q_(h));
    if (current.join(', ').length > 70) {
      lines.push(indent + current.join(', ') + ',');
      current = [];
    }
  });
  if (current.length) lines.push(indent + current.join(', '));

  return '[\n' + lines.join('\n') + '\n' + indent.slice(2) + ']';
}

function buildConfigSource_(live, propKeys, prefixes) {
  var sheets = EXPECTED_SHEETS_.filter(function (n) { return live[n]; });

  // Sheet lain yang wujud tetapi tiada dalam senarai jangkaan
  Object.keys(live).forEach(function (n) {
    if (sheets.indexOf(n) === -1 && n !== 'Sheet1') sheets.push(n);
  });

  var L = [];

  L.push('/**');
  L.push(' * Config.gs');
  L.push(' * ---------------------------------------------------------------------');
  L.push(' * Konfigurasi teknikal yang jarang berubah.');
  L.push(' *');
  L.push(' * CONFIG.HEADERS dijana daripada susunan lajur SEBENAR dalam');
  L.push(' * spreadsheet pada ' + Utilities.formatDate(new Date(), 'Asia/Kuala_Lumpur', 'd MMM yyyy, HH:mm') + '.');
  L.push(' *');
  L.push(' * Apabila menambah lajur pada mana-mana sheet, tambah ia di sini juga');
  L.push(' * DAN pada kedudukan yang sama. setupSystem() menulis semula baris');
  L.push(' * tajuk daripada senarai ini dan memadam lajur yang melebihinya.');
  L.push(' *');
  L.push(' * Rahsia (token media sosial) TIDAK disimpan di sini. Ia tinggal dalam');
  L.push(' * Script Properties dan dicapai melalui getSecret().');
  L.push(' * ---------------------------------------------------------------------');
  L.push(' */');
  L.push('');
  L.push('var CONFIG = {');
  L.push('');
  L.push('  SCHEMA_VERSION: \'1.0.0\',');
  L.push('  SYSTEM_NAME: \'FKM News Management & Publication Workflow System\',');
  L.push('  SYSTEM_SHORT_NAME: \'FKM News\',');
  L.push('  FACULTY_NAME: \'Fakulti Kejuruteraan Mekanikal, Universiti Teknologi Malaysia\',');
  L.push('  TIMEZONE: \'Asia/Kuala_Lumpur\',');
  L.push('');

  // ---- PROP_KEYS ----
  L.push('  /** Kunci Script Properties. Nama di bawah dibaca daripada projek sebenar. */');
  L.push('  PROP_KEYS: {');
  var propMap = mapPropKeys_(propKeys);
  Object.keys(propMap).forEach(function (k) {
    L.push('    ' + k + ': ' + q_(propMap[k]) + ',');
  });
  L.push('  },');
  L.push('');

  // ---- SECRET_KEYS ----
  L.push('  /** Kunci rahsia — nilai tidak pernah ditulis dalam kod. */');
  L.push('  SECRET_KEYS: {');
  var secretMap = mapSecretKeys_(propKeys);
  Object.keys(secretMap).forEach(function (k) {
    L.push('    ' + k + ': ' + q_(secretMap[k]) + ',');
  });
  L.push('  },');
  L.push('');

  // ---- ID_PREFIX ----
  L.push('  /** Awalan ID, dikesan daripada rekod sedia ada. */');
  L.push('  ID_PREFIX: {');
  var pfx = mapIdPrefixes_(prefixes);
  Object.keys(pfx).forEach(function (k) {
    L.push('    ' + k + ': ' + q_(pfx[k].prefix) + ',' +
      '   // contoh: ' + pfx[k].sample + (pfx[k].withYear ? '  (dengan tahun)' : ''));
  });
  L.push('  },');
  L.push('');

  // ---- SHEETS ----
  L.push('  SHEETS: {');
  sheets.forEach(function (n) { L.push('    ' + n + ': ' + q_(n) + ','); });
  L.push('  },');
  L.push('');

  // ---- HEADERS ----
  L.push('  /**');
  L.push('   * Susunan lajur sebenar setiap sheet.');
  L.push('   * Lajur dwibahasa sudah disertakan di hujung sheet berkenaan.');
  L.push('   */');
  L.push('  HEADERS: {');
  sheets.forEach(function (n, i) {
    var headers = live[n].slice();

    // Pastikan lajur dwibahasa disenaraikan walaupun migrasi belum dijalankan,
    // supaya setupSystem() tidak memadamnya kemudian.
    (RECOVERY_BILINGUAL_[n] || []).forEach(function (c) {
      if (headers.indexOf(c) === -1) headers.push(c);
    });

    L.push('    ' + n + ': ' + headerArray_(headers, '      ') + (i < sheets.length - 1 ? ',' : ''));
  });
  L.push('  },');
  L.push('');

  // ---- Getters ----
  L.push('  /* ------------------------------------------------------- Pencapai */');
  L.push('');
  L.push('  /**');
  L.push('   * ID spreadsheet dibaca daripada Script Properties, bukan ditulis');
  L.push('   * dalam kod. setupSystem() yang menetapkannya, dan menyimpannya di');
  L.push('   * luar sumber bermakna ID itu tidak bocor melalui salinan kod atau');
  L.push('   * repositori.');
  L.push('   */');
  L.push('  getSpreadsheetId: function () {');
  L.push('    var id = PropertiesService.getScriptProperties()');
  L.push('      .getProperty(this.PROP_KEYS.SPREADSHEET_ID);');
  L.push('    if (!id) throw new Error(\'Spreadsheet belum di-setup. Jalankan setupSystem().\');');
  L.push('    return id;');
  L.push('  },');
  L.push('');
  L.push('  getDriveRootId: function () {');
  L.push('    var id = PropertiesService.getScriptProperties()');
  L.push('      .getProperty(this.PROP_KEYS.DRIVE_ROOT_ID);');
  L.push('    if (!id) throw new Error(\'Folder Drive belum di-setup. Jalankan setupSystem().\');');
  L.push('    return id;');
  L.push('  },');
  L.push('');
  L.push('  getSecret: function (key) {');
  L.push('    return PropertiesService.getScriptProperties().getProperty(key) || \'\';');
  L.push('  },');
  L.push('');
  L.push('  hasSecret: function (key) {');
  L.push('    return !!this.getSecret(key);');
  L.push('  },');
  L.push('');
  L.push('  setSecret: function (key, value) {');
  L.push('    PropertiesService.getScriptProperties().setProperty(key, String(value));');
  L.push('  },');
  L.push('');
  L.push('  /**');
  L.push('   * Benar setelah setupSystem() dijalankan. doGet() memaparkan mesej');
  L.push('   * "Sistem belum dipasang" apabila ini palsu, dan bukannya tumbang');
  L.push('   * dengan ralat yang tidak bermakna kepada pengguna.');
  L.push('   */');
  L.push('  isInstalled: function () {');
  L.push('    try {');
  L.push('      var id = PropertiesService.getScriptProperties()');
  L.push('        .getProperty(this.PROP_KEYS.SPREADSHEET_ID);');
  L.push('      if (!id) return false;');
  L.push('      return !!SpreadsheetApp.openById(id).getSheetByName(this.SHEETS.SYSTEM_SETTINGS);');
  L.push('    } catch (e) {');
  L.push('      return false;');
  L.push('    }');
  L.push('  }');
  L.push('};');

  return L.join('\n');
}

/** Memadankan kunci Script Properties sebenar kepada nama PROP_KEYS. */
function mapPropKeys_(keys) {
  var want = {
    SPREADSHEET_ID: /SPREADSHEET/i,
    DRIVE_ROOT_ID: /DRIVE.*(ROOT|FOLDER)|ROOT.*FOLDER/i,
    INSTALLED_AT: /INSTALL/i,
    SCHEMA_VERSION: /SCHEMA/i
  };

  var out = {};
  Object.keys(want).forEach(function (name) {
    var hit = keys.filter(function (k) { return want[name].test(k); })[0];
    out[name] = hit || ('FKMNEWS_' + name);
  });
  return out;
}

/** Memadankan kunci Script Properties sebenar kepada nama SECRET_KEYS. */
function mapSecretKeys_(keys) {
  var want = {
    FB_PAGE_TOKEN: /FB.*(TOKEN|ACCESS)/i,
    FB_PAGE_ID: /FB.*PAGE.*ID/i,
    IG_USER_ID: /IG.*USER/i,
    IG_ACCESS_TOKEN: /IG.*(TOKEN|ACCESS)/i
  };

  var out = {};
  Object.keys(want).forEach(function (name) {
    var hit = keys.filter(function (k) { return want[name].test(k); })[0];
    out[name] = hit || ('FKMNEWS_' + name);
  });
  return out;
}

function mapIdPrefixes_(prefixes) {
  var map = {
    NEWS: 'NEWS', USER: 'USERS', VERSION: 'NEWS_VERSIONS', REVIEW: 'REVIEWS',
    NOTIFICATION: 'NOTIFICATIONS', CATEGORY: 'CATEGORIES', LOG: 'AUDIT_LOG',
    IMAGE: 'NEWS_IMAGES', SOCIAL: 'SOCIAL_POSTS', CARD: 'GREETING_CARDS'
  };
  var fallback = {
    NEWS: 'NEWS', USER: 'USR', VERSION: 'VER', REVIEW: 'REV', NOTIFICATION: 'NTF',
    CATEGORY: 'CAT', LOG: 'LOG', IMAGE: 'IMG', SOCIAL: 'SOC', CARD: 'CARD'
  };

  var out = {};
  Object.keys(map).forEach(function (name) {
    var found = prefixes[map[name]];
    out[name] = found || { prefix: fallback[name], withYear: false, sample: '(tiada rekod — anggaran)' };
  });
  return out;
}

/* =========================================================================
 * NOTA SELEPAS PENJANAAN
 * =======================================================================*/

function buildNotes_(live, propKeys, prefixes) {
  var N = [];

  N.push('NOTA — SEMAK SEBELUM MENGGUNAKAN');
  N.push('');

  N.push('Sheet yang dijumpai (' + Object.keys(live).length + '):');
  Object.keys(live).forEach(function (n) {
    N.push('  ' + n + '  —  ' + live[n].length + ' lajur');
  });
  N.push('');

  var missing = EXPECTED_SHEETS_.filter(function (n) { return !live[n]; });
  if (missing.length) {
    N.push('Sheet yang dijangka tetapi TIADA: ' + missing.join(', '));
    N.push('  (Ia akan dicipta oleh setupSystem apabila dijalankan.)');
    N.push('');
  }

  N.push('Kunci Script Properties (' + propKeys.length + ' — nama sahaja, nilai tidak dibaca):');
  if (!propKeys.length) N.push('  (tiada)');
  propKeys.forEach(function (k) { N.push('  ' + k); });
  N.push('');

  var noPrefix = Object.keys(ID_COLUMN_).filter(function (n) {
    return live[n] && !prefixes[n];
  });
  if (noPrefix.length) {
    N.push('Awalan ID tidak dapat dikesan (sheet kosong): ' + noPrefix.join(', '));
    N.push('  Nilai anggaran digunakan. Semak terhadap ID sebenar jika ada.');
    N.push('');
  }

  N.push('PERIKSA TIGA PERKARA SEBELUM TAMPAL:');
  N.push('  1. Nama dalam PROP_KEYS dan SECRET_KEYS sepadan dengan senarai di atas.');
  N.push('     Jika mana-mana tertulis FKMNEWS_... ia TIDAK dijumpai dan hanya anggaran.');
  N.push('  2. Awalan ID sepadan dengan contoh yang dicetak di sebelahnya.');
  N.push('  3. Tiada sheet penting hilang daripada senarai.');
  N.push('');
  N.push('SELEPAS TAMPAL:');
  N.push('  Run > healthCheck   (milik Setup.gs)');
  N.push('  Ia membandingkan CONFIG.HEADERS dengan sheet sebenar dan akan');
  N.push('  melaporkan sebarang ketidaksepadanan.');

  return N.join('\n');
}