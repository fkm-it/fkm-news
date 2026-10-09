/**
 * Deploy.gs
 * -----------------------------------------------------------------------
 * Deployment utilities. Run these MANUALLY from the Apps Script editor
 * (Run > pick function). They are not part of the request path and are
 * never called by the web app.
 *
 * Purpose: remove the guesswork around "which deployment URL is live?"
 * by asking the runtime itself instead of reading it off a dialog.
 * -----------------------------------------------------------------------
 */

/**
 * Prints the URL of the deployment this code is currently running under,
 * and writes it to SYSTEM_SETTINGS as APP_URL so the rest of the system
 * (notification emails, WordPress links, "back to system" buttons) can
 * read one authoritative value instead of hardcoding a URL that goes
 * stale the next time someone redeploys.
 *
 * NOTE: ScriptApp.getService().getUrl() returns the /exec URL of the
 * deployment executing this call. Run it from the editor and it returns
 * the HEAD (test) URL; to capture the production URL, call recordAppUrl()
 * once via the deployed web app instead — or simply paste the production
 * URL into setAppUrl() below.
 */
function printAppUrl() {
  var url = ScriptApp.getService().getUrl();
  Logger.log('Deployment URL: ' + url);
  return url;
}

/**
 * URL PRODUKSI — tampal di sini, sekali sahaja.
 *
 * Ambil daripada Deploy > Manage deployments > Web app > URL. Ia mesti
 * berakhir dengan /exec. Jangan letak garis miring di hujung.
 */
var PRODUCTION_URL = 'PASTE_PRODUCTION_URL_HERE';

/**
 * Menyimpan URL produksi ke dalam SYSTEM_SETTINGS sebagai DUA tetapan:
 *
 *   APP_URL            — rujukan am. Menjawab "deployment mana yang hidup?"
 *                        tanpa perlu membuka dialog Manage deployments.
 *
 *   PUBLIC_PORTAL_URL  — dibaca oleh PortalService.buildShareUrl_() semasa
 *                        membina pautan kongsi artikel. Tanpanya, pautan
 *                        jatuh kepada ScriptApp.getService().getUrl(), yang
 *                        tidak boleh dipercayai apabila skrip berjalan bagi
 *                        pembaca tanpa akaun — ia boleh memulangkan URL
 *                        deployment kepala, atau tiada apa-apa.
 *
 * Kedua-duanya ditetapkan bersama kerana ia sentiasa nilai yang sama, dan
 * menetapkannya secara berasingan menjemput satu daripadanya tertinggal
 * apabila deployment bertukar kemudian.
 *
 * Idempoten — selamat dijalankan berulang kali.
 */
function setAppUrl(url) {
  url = normaliseUrl_(url || PRODUCTION_URL);

  if (url.indexOf('PASTE_') === 0 || !url) {
    throw new Error('Tampal URL produksi dalam PRODUCTION_URL di bahagian atas Deploy.gs dahulu.');
  }
  if (url.slice(-5) !== '/exec') {
    throw new Error('URL mesti berakhir dengan /exec. Diterima: ' + url);
  }

  var written = [];
  [
    ['APP_URL', 'URL web app produksi (satu deployment)'],
    ['PUBLIC_PORTAL_URL', 'URL portal awam — digunakan untuk pautan kongsi artikel']
  ].forEach(function (pair) {
    writeSetting_(pair[0], url, pair[1]);
    written.push(pair[0]);
  });

  // Tetapan dicache; tanpa ini, pautan kongsi masih menggunakan nilai lama
  // sehingga cache luput.
  try { GlobalSettings.invalidateCache(); } catch (e) { }

  var msg = 'URL disimpan: ' + url + '\nTetapan dikemas kini: ' + written.join(', ');
  Logger.log(msg);
  return msg;
}

/**
 * Membersihkan URL yang disalin.
 *
 * Apps Script hanya mengenali laluan yang berakhir tepat dengan /exec. Satu
 * garis miring tambahan menyebabkan Google menganggapnya fail Drive dan
 * memaparkan "unable to open the file". URL yang disalin dari bar alamat
 * kerap membawa garis miring, ruang kosong atau baki parameter.
 */
function normaliseUrl_(url) {
  return String(url || '').trim().replace(/[?#].*$/, '').replace(/\/+$/, '');
}

/** Tulis atau kemas kini satu baris SYSTEM_SETTINGS. */
function writeSetting_(key, value, description) {
  var existing = SheetDB.findOneBy(CONFIG.SHEETS.SYSTEM_SETTINGS, 'SettingKey', key);

  if (existing) {
    SheetDB.updateBy(CONFIG.SHEETS.SYSTEM_SETTINGS, 'SettingKey', key, {
      SettingValue: value,
      UpdatedAt: new Date()
    });
  } else {
    SheetDB.insert(CONFIG.SHEETS.SYSTEM_SETTINGS, {
      SettingKey: key,
      SettingValue: value,
      Description: description,
      UpdatedAt: new Date()
    });
  }
}

/**
 * Memaparkan URL yang sedang tersimpan. Gunakan untuk menjawab
 * "deployment mana yang hidup?" tanpa membuka Manage deployments.
 */
function showAppUrl() {
  var lines = [];
  var portal = '';
  ['APP_URL', 'PUBLIC_PORTAL_URL', 'PUBLIC_SITE_URL'].forEach(function (k) {
    var row = SheetDB.findOneBy(CONFIG.SHEETS.SYSTEM_SETTINGS, 'SettingKey', k);
    var v = (row && row.SettingValue) || '';
    if (k === 'PUBLIC_PORTAL_URL') portal = v;
    lines.push(k + ': ' + (v || '(belum ditetapkan)'));
  });

  /*
   * Dua pautan untuk dua khalayak. Pautan pembaca ialah yang dikongsi di
   * WhatsApp, Facebook, e-mel pelajar dan laman web — ia sentiasa membuka
   * portal berita. Pautan pengurusan hanya untuk Penulis, Admin dan Editor.
   */
  if (portal) {
    lines.push('');
    lines.push('PAUTAN PEMBACA (kongsi yang ini):');
    lines.push('  ' + normaliseUrl_(portal) + '?view=reader');
    lines.push('PAUTAN PENGURUSAN (staf berdaftar sahaja):');
    lines.push('  ' + normaliseUrl_(portal));
  }

  var msg = lines.join('\n');
  Logger.log(msg);
  return msg;
}

/** Baca URL produksi yang tersimpan, dari mana-mana dalam kod. */
function getAppUrl_() {
  var row = SheetDB.findOneBy(CONFIG.SHEETS.SYSTEM_SETTINGS, 'SettingKey', 'APP_URL');
  return row ? row.SettingValue : '';
}

/* =========================================================================
 * HEALTH CHECK
 * Run this after every deploy. It surfaces the class of problem that
 * otherwise shows up as a blank page: a sheet that doesn't exist, a
 * CONFIG key that was lost, a service file that didn't get pasted in.
 * =======================================================================*/

/**
 * Verifies the system's wiring and logs a pass/fail line per check.
 * Run > deployHealthCheck, then open the execution log.
 *
 * NAMA: Setup.gs sudah memiliki healthCheck(). Dua fungsi bernama sama
 * dalam satu projek GAS akan saling menutup secara senyap — yang dimuatkan
 * kemudian menang, tanpa amaran. Fungsi ini dinamakan berbeza atas sebab
 * itu, dan ia menyemak perkara yang berlainan: healthCheck() Setup.gs
 * menyemak skema dan peranan, yang ini menyemak pendawaian deployment.
 */
function deployHealthCheck() {
  var results = [];

  function check(label, fn) {
    try {
      var detail = fn();
      results.push('PASS  ' + label + (detail ? ' — ' + detail : ''));
    } catch (e) {
      results.push('FAIL  ' + label + ' — ' + e.message);
    }
  }

  check('CONFIG defined', function () {
    if (typeof CONFIG === 'undefined') throw new Error('CONFIG missing');
    // Config.gs menamakannya SCHEMA_VERSION, bukan VERSION.
    return CONFIG.SYSTEM_SHORT_NAME + ' v' + (CONFIG.SCHEMA_VERSION || '?');
  });

  check('CONFIG.getSpreadsheetId()', function () {
    var id = CONFIG.getSpreadsheetId();
    if (!id) throw new Error('empty');
    return id.substring(0, 12) + '…';
  });

  check('Spreadsheet reachable', function () {
    return SpreadsheetApp.openById(CONFIG.getSpreadsheetId()).getName();
  });

  // Every sheet the system expects. A missing one here is the usual cause
  // of a silently blank page.
  Object.keys(CONFIG.SHEETS).forEach(function (key) {
    check('Sheet ' + CONFIG.SHEETS[key], function () {
      var rows = SheetDB.findAll(CONFIG.SHEETS[key]);
      return rows.length + ' rows';
    });
  });

  // Global objects each service depends on.
  [['ROLES', 'ROLES'], ['STATUS', 'STATUS'], ['PERMISSIONS', 'PERMISSIONS'],
   ['TRANSITIONS', 'TRANSITIONS']].forEach(function (pair) {
    check('Constant ' + pair[0], function () {
      if (typeof this[pair[1]] === 'undefined' && eval('typeof ' + pair[1]) === 'undefined') {
        throw new Error('not defined');
      }
      return 'ok';
    });
  });

  check('Sidebar data', function () {
    var data = getSidebarData();
    return 'trend=' + data.trend.length +
           ' card=' + (data.greetingCard ? 'active' : 'none') +
           ' links=' + data.quickLinks.length;
  });

  check('APP_URL recorded', function () {
    var url = getAppUrl_();
    if (!url) throw new Error('belum ditetapkan — jalankan setAppUrl()');
    return url.substring(0, 50) + '…';
  });

  // Pautan kongsi artikel bergantung pada tetapan ini secara khusus.
  // APP_URL sahaja tidak mencukupi — PortalService membaca yang ini.
  check('PUBLIC_PORTAL_URL recorded', function () {
    var row = SheetDB.findOneBy(CONFIG.SHEETS.SYSTEM_SETTINGS, 'SettingKey', 'PUBLIC_PORTAL_URL');
    var url = row && row.SettingValue;
    if (!url) throw new Error('belum ditetapkan — pautan kongsi tidak boleh dipercayai');
    return url.substring(0, 50) + '…';
  });

  var report = results.join('\n');
  Logger.log('\n=== SEMAKAN DEPLOYMENT ===\n' + report);
  return report;
}