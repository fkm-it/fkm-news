/**
 * Setup.gs
 * Pemasangan sekali sahaja: cipta spreadsheet, sheet, header, folder Drive,
 * kategori lalai, tetapan lalai dan Admin pertama.
 *
 * Jalankan setupSystem() dari editor Apps Script, BUKAN dari web app.
 */

/**
 * Pemasangan penuh.
 * @param {string} adminEmail e-mel Admin pertama (kosong = guna pemilik skrip)
 */
function setupSystem(adminEmail) {
  requireOwnerOrTrigger_('setupSystem', arguments[0]);
  var props = PropertiesService.getScriptProperties();
  var log = [];

  // 1. Spreadsheet
  var ssId = props.getProperty(CONFIG.PROP_KEYS.SPREADSHEET_ID);
  var ss;
  if (ssId) {
    try { ss = SpreadsheetApp.openById(ssId); log.push('Spreadsheet sedia ada digunakan.'); }
    catch (e) { ssId = null; }
  }
  if (!ssId) {
    ss = SpreadsheetApp.create('FKM NEWS — Database');
    ss.setSpreadsheetTimeZone('Asia/Kuala_Lumpur');
    props.setProperty(CONFIG.PROP_KEYS.SPREADSHEET_ID, ss.getId());
    log.push('Spreadsheet baharu dicipta: ' + ss.getId());
  }

  // 2. Sheet dan header
  Object.keys(CONFIG.SHEETS).forEach(function (key) {
    var name = CONFIG.SHEETS[key];
    var headers = CONFIG.HEADERS[key];
    var sh = ss.getSheetByName(name);
    if (!sh) {
      sh = ss.insertSheet(name);
      log.push('Sheet dicipta: ' + name);
    }
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    sh.getRange(1, 1, 1, headers.length)
      .setFontWeight('bold')
      .setBackground('#12284C')
      .setFontColor('#FFFFFF');
    sh.setFrozenRows(1);
    if (sh.getMaxColumns() > headers.length) {
      sh.deleteColumns(headers.length + 1, sh.getMaxColumns() - headers.length);
    }
  });

  // Buang sheet lalai "Sheet1"
  var def = ss.getSheetByName('Sheet1');
  if (def && ss.getSheets().length > 1) ss.deleteSheet(def);

  SheetDB.clearHeaderCache();

  // 3. Folder Drive
  var rootId = DriveService.ensureRoot();
  log.push('Folder Drive: ' + rootId);

  // 4. Tetapan lalai
  var seeded = GlobalSettings.seedDefaults(false);
  log.push('Tetapan lalai ditambah: ' + seeded);

  // 5. Kategori lalai
  if (SheetDB.count(CONFIG.SHEETS.CATEGORIES) === 0) {
    var defaults = [
      ['Akademik', 'Pengajaran, kurikulum dan hal ehwal pelajar'],
      ['Penyelidikan', 'Geran, penerbitan dan inovasi'],
      ['Pencapaian', 'Anugerah dan pengiktirafan'],
      ['Aktiviti', 'Program, bengkel dan seminar'],
      ['Industri', 'Kerjasama dan jalinan industri'],
      ['Pengumuman', 'Makluman rasmi fakulti']
    ];
    SheetDB.insertMany(CONFIG.SHEETS.CATEGORIES, defaults.map(function (c, i) {
      return {
        CategoryID: 'CAT-' + ('00' + (i + 1)).slice(-3),
        CategoryName: c[0], Description: c[1], Status: 'ACTIVE',
        CreatedAt: new Date(), UpdatedAt: new Date()
      };
    }));
    log.push('6 kategori lalai dicipta.');
  }

  // 6. Admin pertama
  var email = String(adminEmail || Session.getEffectiveUser().getEmail()).toLowerCase();
  if (!SheetDB.findOneBy(CONFIG.SHEETS.USERS, 'Email', email)) {
    SheetDB.insert(CONFIG.SHEETS.USERS, {
      UserID: Utils.userId(),
      Email: email,
      Name: email.split('@')[0],
      Role: ROLES.ADMIN,
      Department: 'Unit Teknologi Maklumat',
      Position: 'Pentadbir Sistem',
      Status: USER_STATUS.ACTIVE,
      CreatedAt: new Date(), UpdatedAt: new Date(), LastLogin: ''
    });
    log.push('Admin pertama: ' + email);
  }

  props.setProperty(CONFIG.PROP_KEYS.INSTALLED_AT, new Date().toISOString());
  props.setProperty(CONFIG.PROP_KEYS.SCHEMA_VERSION, CONFIG.SCHEMA_VERSION);

  var result = log.join('\n');
  console.log(result);
  return {
    spreadsheetUrl: ss.getUrl(),
    driveFolderId: rootId,
    log: log
  };
}

/** Tulis semula semua tetapan kepada nilai lalai (berhati-hati — menimpa kustomisasi) */
function resetSettingsToDefaults() {
  requireOwnerOrTrigger_('resetSettingsToDefaults', arguments[0]);
  var n = GlobalSettings.seedDefaults(true);
  GlobalSettings.invalidateCache();
  return 'Tetapan ditulis semula: ' + n;
}

/**
 * Segarkan tetapan tertentu kepada nilai lalai terkini.
 *
 * seedDefaults() hanya menambah kunci yang belum wujud, jadi apabila nilai
 * lalai berubah selepas pemasangan (contohnya tukar fon), baris lama dalam
 * SYSTEM_SETTINGS akan terus menguasai. Fungsi ini memaksa kemas kini bagi
 * senarai kunci yang diberi sahaja — tetapan lain kekal seperti sedia ada.
 *
 * Jalankan tanpa argumen untuk menyegarkan tipografi, tema gelap dan kesan visual.
 */
function syncSettingsToDefaults(keys) {
  requireOwnerOrTrigger_('syncSettingsToDefaults', arguments[0]);
  if (!keys || !keys.length) {
    keys = Object.keys(GlobalSettings.SCHEMA).filter(function (k) {
      var group = GlobalSettings.SCHEMA[k].group;
      return group === 'Typography' || group === 'Dark' || group === 'Effects';
    });
  }

  var updated = [];
  keys.forEach(function (key) {
    var def = GlobalSettings.SCHEMA[key];
    if (!def) return;
    GlobalSettings.updateGlobalSetting(key, def.def, 'SYSTEM');
    updated.push(key);
  });

  GlobalSettings.invalidateCache();
  console.log('Tetapan disegarkan (' + updated.length + '): ' + updated.join(', '));
  return updated;
}

/** Pasang trigger harian untuk pembersihan log audit */
function installTriggers() {
  requireOwnerOrTrigger_('installTriggers', arguments[0]);
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'dailyMaintenance') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('dailyMaintenance').timeBased().atHour(2).everyDays(1).create();
  return 'Trigger harian dipasang (2:00 pagi).';
}

function dailyMaintenance() {
  requireOwnerOrTrigger_('dailyMaintenance', arguments[0]);
  try {
    var purged = AuditService.purgeOldLogs();
    console.log('Log audit dibuang: ' + purged);
  } catch (e) {
    console.error('MAINTENANCE_FAIL', String(e));
  }
}

/**
 * Selaraskan keizinan gambar bagi SEMUA berita sedia ada.
 *
 * Jalankan sekali selepas mengaktifkan portal awam. Berita yang diterbitkan
 * sebelum ini masih mempunyai gambar berkeizinan domain sahaja, dan pembaca
 * luar akan melihat kotak kosong sehingga fungsi ini dijalankan.
 */
function syncPublishedImageSharing() {
  requireOwnerOrTrigger_('syncPublishedImageSharing', arguments[0]);
  var published = 0, restricted = 0, files = 0;
  var failures = [];

  SheetDB.findAll(CONFIG.SHEETS.NEWS).forEach(function (n) {
    var status = String(n.Status);
    var out = null;

    if (status === STATUS.PUBLISHED) {
      out = ImageService.setPublicAccess(String(n.NewsID), true);
      published++;
    } else if (status === STATUS.ARCHIVED || status === STATUS.REJECTED) {
      out = ImageService.setPublicAccess(String(n.NewsID), false);
      restricted++;
    }

    if (out) {
      files += out.changed;
      out.failed.forEach(function (f) {
        failures.push(f.fileName + ' (' + f.newsId + ')');
      });
    }
  });

  var lines = [
    'Keizinan gambar diselaraskan.',
    published + ' berita diterbitkan dibuka kepada umum.',
    restricted + ' berita diarkib/ditolak dihadkan kepada domain.',
    files + ' fail berjaya ditetapkan.'
  ];

  if (failures.length) {
    lines.push('');
    lines.push(failures.length + ' fail GAGAL selepas tiga cubaan:');
    failures.forEach(function (f) { lines.push('  - ' + f); });
    lines.push('');
    lines.push('Jalankan semula fungsi ini. Jika fail yang sama gagal lagi,');
    lines.push('kemungkinan besar polisi Google Workspace UTM menyekat perkongsian');
    lines.push('awam bagi fail tersebut. Hubungi UTMDigital, atau hos gambar di');
    lines.push('tempat lain dan tetapkan PUBLIC_SITE_URL.');
  }

  var result = lines.join('\n');
  console.log(result);
  return result;
}

/**
 * Semak keizinan sebenar setiap gambar berita terbit.
 *
 * Gunakan ini SELEPAS syncPublishedImageSharing untuk mengesahkan bahawa
 * pembaca luar benar-benar boleh melihat gambar. Ia membaca keadaan sebenar
 * daripada Drive, bukan mengandaikan penetapan tadi berjaya.
 */
function auditImageSharing() {
  requireOwnerOrTrigger_('auditImageSharing', arguments[0]);
  var r = ImageService.auditSharing();

  var lines = [
    'AUDIT KEIZINAN GAMBAR',
    r.checked + ' gambar disemak pada berita yang diterbitkan.',
    r.publicOk.length + ' boleh dilihat umum.',
    r.notPublic.length + ' TIDAK boleh dilihat umum.',
    r.unreadable.length + ' gagal dibaca.'
  ];

  if (r.notPublic.length) {
    lines.push('');
    lines.push('Gambar yang pembaca luar TIDAK akan nampak:');
    r.notPublic.forEach(function (e) {
      lines.push('  - ' + e.fileName + ' [' + e.access + '] pada ' + e.title);
    });
  }

  if (r.unreadable.length) {
    lines.push('');
    lines.push('Fail yang gagal dibaca (mungkin telah dipadam):');
    r.unreadable.forEach(function (e) { lines.push('  - ' + e.fileId); });
  }

  var result = lines.join('\n');
  console.log(result);
  return result;
}

/* ------------------------------------------------------------- Sandaran */

/**
 * Salin spreadsheet ke folder sandaran dalam Drive.
 *
 * Google Drive sudah menyimpan sejarah versi spreadsheet, tetapi sejarah itu
 * hilang jika fail dipadam. Salinan berasingan melindungi daripada pemadaman
 * tidak sengaja dan daripada kerosakan data yang hanya disedari berminggu
 * kemudian.
 *
 * @param {number} keepCount bilangan sandaran untuk disimpan (lalai 14)
 */
function createBackup(keepCount) {
  requireOwnerOrTrigger_('createBackup', arguments[0]);
  return createBackup_(keepCount);
}

/**
 * Pelaksanaan sandaran. Berakhiran _ supaya tidak boleh dipanggil melalui
 * google.script.run, dan supaya weeklyBackup (konteks trigger) boleh
 * memanggilnya tanpa melalui guard pemilik sekali lagi.
 */
function createBackup_(keepCount) {
  keepCount = keepCount || 14;

  var root = DriveApp.getFolderById(CONFIG.getDriveRootId());
  var backupFolder;
  var it = root.getFoldersByName('_Sandaran');
  backupFolder = it.hasNext() ? it.next() : root.createFolder('_Sandaran');

  var stamp = Utilities.formatDate(new Date(), Utils.timezone(), 'yyyy-MM-dd_HHmm');
  var source = DriveApp.getFileById(CONFIG.getSpreadsheetId());
  var copy = source.makeCopy('FKMNEWS_Sandaran_' + stamp, backupFolder);

  // Buang sandaran lama supaya folder tidak membesar tanpa had
  var existing = [];
  var files = backupFolder.getFilesByType(MimeType.GOOGLE_SHEETS);
  while (files.hasNext()) {
    var f = files.next();
    if (f.getName().indexOf('FKMNEWS_Sandaran_') === 0) {
      existing.push({ file: f, created: f.getDateCreated() });
    }
  }
  existing.sort(function (a, b) { return b.created - a.created; });

  var removed = 0;
  existing.slice(keepCount).forEach(function (e) {
    e.file.setTrashed(true);
    removed++;
  });

  var result = 'Sandaran dicipta: ' + copy.getName() +
    '\nSandaran disimpan: ' + Math.min(existing.length, keepCount) +
    (removed ? '\nSandaran lama dibuang: ' + removed : '');
  console.log(result);
  return result;
}

/** Pasang trigger sandaran mingguan (Ahad, 1 pagi) */
function installBackupTrigger() {
  requireOwnerOrTrigger_('installBackupTrigger', arguments[0]);
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'weeklyBackup') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('weeklyBackup')
    .timeBased().onWeekDay(ScriptApp.WeekDay.SUNDAY).atHour(1).create();
  return 'Trigger sandaran mingguan dipasang (Ahad, 1:00 pagi).';
}

function weeklyBackup() {
  requireOwnerOrTrigger_('weeklyBackup', arguments[0]);
  try {
    createBackup_(14);
  } catch (e) {
    console.error('BACKUP_FAIL', String(e));
    try {
      var adminEmail = GlobalSettings.get('ADMIN_EMAIL');
      if (adminEmail) {
        MailApp.sendEmail(adminEmail, '[FKM News] Sandaran mingguan gagal',
          'Sandaran automatik gagal pada ' + new Date() + '.\n\nRalat: ' + e.message);
      }
    } catch (e2) { /* makluman gagal juga — sudah direkod dalam log */ }
  }
}

/** Semakan kesihatan sistem — guna sebelum deployment produksi */
function healthCheck() {
  requireOwnerOrTrigger_('healthCheck', arguments[0]);
  var issues = [];
  var ok = [];

  try { CONFIG.getSpreadsheetId(); ok.push('Spreadsheet dikonfigurasi.'); }
  catch (e) { issues.push('Spreadsheet belum di-setup.'); }

  try { CONFIG.getDriveRootId(); ok.push('Folder Drive dikonfigurasi.'); }
  catch (e) { issues.push('Folder Drive belum di-setup.'); }

  Object.keys(CONFIG.SHEETS).forEach(function (key) {
    var name = CONFIG.SHEETS[key];
    try {
      var actual = SheetDB.headers(name).join('|');
      var expected = CONFIG.HEADERS[key].join('|');
      if (actual !== expected) issues.push('Header tidak sepadan: ' + name);
      else ok.push('Skema sah: ' + name);
    } catch (e) {
      issues.push('Sheet hilang: ' + name);
    }
  });

  var admins = UserService.getActiveByRole(ROLES.ADMIN);
  if (!admins.length) issues.push('Tiada Admin aktif.');
  else ok.push(admins.length + ' Admin aktif.');

  if (!UserService.getActiveByRole(ROLES.EDITOR).length) {
    issues.push('Tiada Editor aktif — berita tidak boleh diterbitkan.');
  }

  if (GlobalSettings.get('SOCIAL_ENABLED')) {
    if (GlobalSettings.get('SOCIAL_FB_ENABLED') &&
      !CONFIG.hasSecret(CONFIG.SECRET_KEYS.FB_PAGE_TOKEN)) {
      issues.push('Facebook diaktifkan tetapi Page Access Token belum ditetapkan.');
    }
    if (GlobalSettings.get('SOCIAL_IG_ENABLED') &&
      !CONFIG.hasSecret(CONFIG.SECRET_KEYS.IG_USER_ID)) {
      issues.push('Instagram diaktifkan tetapi IG User ID belum ditetapkan.');
    }
  }

  var report = { healthy: issues.length === 0, issues: issues, passed: ok };
  console.log(JSON.stringify(report, null, 2));
  return report;
}