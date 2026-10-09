/**
 * PushService.gs
 * ============================================================================
 * Notifikasi push ke telefon/komputer melalui Firebase Cloud Messaging (F11).
 *
 *   Staf     : setiap notifikasi dalam app (NotificationService.createInApp)
 *              turut dihantar sebagai push ke peranti yang didaftarkan
 *              pengguna itu (push.register dari app staf).
 *   Pembaca  : yang menekan 🔔 di portal (public.pushSubscribe) menerima
 *              push apabila berita BAHARU diterbitkan, dalam bahasa pilihan.
 *
 * Token peranti disimpan dalam sheet PUSH_TOKENS (dicipta automatik), tidak
 * pernah dipulangkan kepada pelayar. Token mati (UNREGISTERED/404) dipadam
 * secara automatik selepas penghantaran.
 *
 * Kelayakan pelayan: kunci akaun servis Firebase (JSON) dalam Script
 * Property FKMNEWS_FCM_SERVICE_ACCOUNT — RAHSIA, tidak dalam repo/tetapan.
 * Token akses OAuth ditandatangani di sini (RS256) dan dicache 50 minit;
 * tiada skop Apps Script baharu diperlukan.
 *
 * Suis: PUSH_ENABLED (lalai mati). Konfigurasi web (awam):
 * FIREBASE_WEB_CONFIG (JSON daripada Firebase console) dan FIREBASE_VAPID_KEY.
 * ============================================================================
 */

var PushService = (function () {

  var SHEET = 'PUSH_TOKENS';
  var HEADERS = ['Token', 'UserID', 'Reader', 'Lang', 'Device', 'CreatedAt', 'LastSeen'];
  var SA_PROP = 'FKMNEWS_FCM_SERVICE_ACCOUNT';
  var TOKEN_CACHE = 'FKMNEWS_FCM_ACCESS';
  var MAX_DEVICES_PER_USER = 5;
  var MAX_READERS = 20000;
  var BATCH = 100;
  var TOKEN_RE = /^[A-Za-z0-9_:\-]{60,400}$/;

  /* ------------------------------------------------------- Konfigurasi */

  function serviceAccount_() {
    var raw = PropertiesService.getScriptProperties().getProperty(SA_PROP) || '';
    if (!raw) return null;
    try {
      var sa = JSON.parse(raw);
      return (sa.client_email && sa.private_key && sa.project_id) ? sa : null;
    } catch (e) { return null; }
  }

  function enabled_() {
    try { return !!GlobalSettings.get('PUSH_ENABLED'); } catch (e) { return false; }
  }

  function ready() { return enabled_() && !!serviceAccount_(); }

  function validToken_(t) {
    t = String(t || '').trim();
    if (!TOKEN_RE.test(t)) throw Utils.appError('VALIDATION', 'Token peranti tidak sah.');
    return t;
  }

  /* ------------------------------------------------------------- Sheet */

  /** Kunci skrip; jika pemanggil sudah memegangnya, jangan lepaskan awal. */
  function lock_(fn) {
    var held = false;
    try { held = LockService.getScriptLock().hasLock(); } catch (e) { }
    return held ? fn() : Utils.withLock(fn);
  }

  function sheet_() {
    var ss = SpreadsheetApp.openById(CONFIG.getSpreadsheetId());
    var sh = ss.getSheetByName(SHEET);
    if (!sh) {
      sh = ss.insertSheet(SHEET);
      sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
      try { sh.setFrozenRows(1); } catch (e) { }
    }
    return sh;
  }

  /** Semua baris sebagai objek, dengan nombor baris sheet (row). */
  function rows_() {
    var sh = sheet_();
    var last = sh.getLastRow();
    if (last < 2) return [];
    return sh.getRange(2, 1, last - 1, HEADERS.length).getValues().map(function (r, i) {
      return {
        row: i + 2,
        token: String(r[0] || ''),
        userId: String(r[1] || ''),
        reader: r[2] === true || String(r[2]).toUpperCase() === 'TRUE',
        lang: String(r[3] || 'bm') === 'en' ? 'en' : 'bm',
        device: String(r[4] || ''),
        createdAt: r[5],
        lastSeen: r[6]
      };
    }).filter(function (r) { return r.token; });
  }

  function writeRow_(sh, r) {
    var values = ["'" + r.token, r.userId ? "'" + r.userId : '', r.reader ? 'TRUE' : 'FALSE', r.lang,
      Utils.truncate(String(r.device || ''), 120), r.createdAt || new Date(), new Date()];
    if (r.row) sh.getRange(r.row, 1, 1, HEADERS.length).setValues([values]);
    else sh.appendRow(values);
  }

  /** Kemas kini/sisip satu token (dalam kunci). */
  function upsert_(token, patch) {
    return lock_(function () {
      var sh = sheet_();
      var all = rows_();
      var cur = all.filter(function (r) { return r.token === token; })[0] ||
        { token: token, userId: '', reader: false, lang: 'bm', device: '' };
      Object.keys(patch).forEach(function (k) { cur[k] = patch[k]; });

      if (!cur.userId && !cur.reader) {
        if (cur.row) sh.deleteRow(cur.row);
        return null;
      }
      if (!cur.row && cur.reader && !cur.userId) {
        var readers = all.filter(function (r) { return r.reader; }).length;
        if (readers >= MAX_READERS) throw Utils.appError('LIMIT', 'Had pelanggan notifikasi dicapai.');
      }
      writeRow_(sh, cur);

      /* Hadkan peranti setiap pengguna: buang yang paling lama */
      if (patch.userId) {
        var mine = rows_().filter(function (r) { return r.userId === patch.userId && r.token !== token; });
        mine.sort(function (a, b) { return new Date(a.lastSeen) - new Date(b.lastSeen); });
        var extra = mine.length - (MAX_DEVICES_PER_USER - 1);
        if (extra > 0) {
          mine.slice(0, extra).map(function (r) { return r.row; })
            .sort(function (a, b) { return b - a; })
            .forEach(function (row) { sheet_().deleteRow(row); });
        }
      }
      return cur;
    });
  }

  function removeTokens_(tokens) {
    if (!tokens.length) return;
    var dead = {};
    tokens.forEach(function (t) { dead[t] = true; });
    lock_(function () {
      var sh = sheet_();
      rows_().filter(function (r) { return dead[r.token]; })
        .map(function (r) { return r.row; })
        .sort(function (a, b) { return b - a; })
        .forEach(function (row) { sh.deleteRow(row); });
    });
  }

  /* ----------------------------------------------------- Pendaftaran */

  /** Staf: kaitkan peranti dengan pengguna. */
  function registerUser(user, token, device) {
    token = validToken_(token);
    upsert_(token, { userId: String(user.userId), device: device || '' });
    return { registered: true };
  }

  function unregisterUser(user, token) {
    token = validToken_(token);
    var cur = rows_().filter(function (r) { return r.token === token; })[0];
    if (cur && cur.userId === String(user.userId)) upsert_(token, { userId: '' });
    return { registered: false };
  }

  /** Pembaca: langgan berita baharu (tanpa akaun). */
  function subscribeReader(token, lang, device) {
    if (!enabled_()) throw Utils.appError('DISABLED', 'Notifikasi belum diaktifkan.');
    token = validToken_(token);
    upsert_(token, { reader: true, lang: lang === 'en' ? 'en' : 'bm', device: device || '' });
    return { subscribed: true };
  }

  function unsubscribeReader(token) {
    token = validToken_(token);
    upsert_(token, { reader: false });
    return { subscribed: false };
  }

  /* ------------------------------------------------------ FCM HTTP v1 */

  function b64url_(s) {
    return Utilities.base64EncodeWebSafe(s).replace(/=+$/, '');
  }

  /** Token akses OAuth daripada akaun servis (JWT RS256), dicache. */
  function accessToken_(sa) {
    var cache = CacheService.getScriptCache();
    var hit = cache.get(TOKEN_CACHE);
    if (hit) return hit;
    var now = Math.floor(Date.now() / 1000);
    var header = b64url_(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    var claims = b64url_(JSON.stringify({
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600
    }));
    var sig = b64url_(Utilities.computeRsaSha256Signature(header + '.' + claims, sa.private_key));
    var res = UrlFetchApp.fetch('https://oauth2.googleapis.com/token', {
      method: 'post',
      payload: {
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: header + '.' + claims + '.' + sig
      },
      muteHttpExceptions: true
    });
    var body = {};
    try { body = JSON.parse(res.getContentText() || '{}'); } catch (e) { }
    if (res.getResponseCode() !== 200 || !body.access_token) {
      console.error('FCM_AUTH_FAIL', res.getResponseCode(), String(res.getContentText()).substring(0, 200));
      throw Utils.appError('PUSH_AUTH', 'Kunci akaun servis Firebase tidak sah.');
    }
    cache.put(TOKEN_CACHE, body.access_token, 3000);
    return body.access_token;
  }

  /**
   * Hantar mesej data-sahaja kepada senarai token. Service worker portal
   * (pwa/sw.js) memaparkan notifikasi; mesej data menjamin paparan yang sama
   * di Android, desktop dan iPhone (app yang dipasang).
   * @returns {{sent:number, failed:number, removed:number}}
   */
  function sendTo_(tokens, msg) {
    var out = { sent: 0, failed: 0, removed: 0 };
    if (!tokens.length) return out;
    var sa = serviceAccount_();
    if (!sa) return out;
    var access = accessToken_(sa);
    var url = 'https://fcm.googleapis.com/v1/projects/' + encodeURIComponent(sa.project_id) + '/messages:send';
    var data = {
      title: Utils.truncate(String(msg.title || 'FKM News'), 120),
      body: Utils.truncate(String(msg.body || ''), 240),
      link: String(msg.link || ''),
      tag: String(msg.tag || ''),
      image: /^https:\/\//.test(String(msg.image || '')) ? String(msg.image) : ''
    };
    var dead = [];

    for (var i = 0; i < tokens.length; i += BATCH) {
      var chunk = tokens.slice(i, i + BATCH);
      var reqs = chunk.map(function (t) {
        return {
          url: url,
          method: 'post',
          contentType: 'application/json',
          headers: { Authorization: 'Bearer ' + access },
          payload: JSON.stringify({
            message: {
              token: t,
              data: data,
              webpush: { headers: { Urgency: 'high', TTL: '86400' } }
            }
          }),
          muteHttpExceptions: true
        };
      });
      var res = UrlFetchApp.fetchAll(reqs);
      res.forEach(function (r, k) {
        var code = r.getResponseCode();
        if (code === 200) { out.sent++; return; }
        out.failed++;
        var text = String(r.getContentText() || '');
        if (code === 404 || /UNREGISTERED|registration token is not a valid/i.test(text)) dead.push(chunk[k]);
        else console.error('FCM_SEND_FAIL', code, text.substring(0, 200));
      });
    }
    try { removeTokens_(dead); } catch (e) { console.error('FCM_CLEANUP_FAIL', String(e)); }
    out.removed = dead.length;
    return out;
  }

  /* ------------------------------------------------------- Pencetus */

  function staffLink_(newsId) {
    var base = '';
    try { base = String(GlobalSettings.get('STAFF_APP_URL') || ''); } catch (e) { }
    if (!/^https:\/\//.test(base)) return '';
    return newsId ? base + '?page=news-detail&id=' + encodeURIComponent(newsId) : base;
  }

  function portalBase_() {
    var p = '';
    try { p = String(GlobalSettings.get('PUBLIC_PORTAL_URL') || ''); } catch (e) { }
    if (/^https:\/\//.test(p)) return p.replace(/\?.*$/, '');
    var staff = staffLink_('');
    return staff ? staff.replace(/app\/?$/, '') : '';
  }

  /** Dipanggil oleh NotificationService.createInApp untuk setiap notifikasi staf. */
  function notifyUser(userId, newsId, subject, message) {
    if (!ready() || !userId) return null;
    var tokens = rows_().filter(function (r) { return r.userId === String(userId); })
      .map(function (r) { return r.token; });
    if (!tokens.length) return null;
    return sendTo_(tokens, {
      title: subject,
      body: message,
      link: staffLink_(newsId),
      tag: newsId ? 'news-' + newsId : ''
    });
  }

  /** Dipanggil oleh WorkflowService apabila berita diterbitkan buat kali pertama. */
  function notifyPublished(newsId) {
    if (!ready()) return null;
    var readers = rows_().filter(function (r) { return r.reader; });
    if (!readers.length) return { sent: 0 };
    var base = portalBase_();
    var total = { sent: 0, failed: 0, removed: 0 };

    ['bm', 'en'].forEach(function (lang) {
      var tokens = readers.filter(function (r) { return r.lang === lang; }).map(function (r) { return r.token; });
      if (!tokens.length) return;
      var a = null;
      try { a = PublicService.handle('public.article', { newsId: String(newsId), lang: lang }, false); }
      catch (e) { console.error('PUSH_ARTICLE_FAIL', newsId, String(e)); return; }
      if (!a) return;
      var r = sendTo_(tokens, {
        title: a.title,
        body: Utils.truncate(Utils.stripTags(String(a.summary || '')), 200) ||
          (lang === 'en' ? 'New story from FKM News' : 'Berita baharu daripada FKM News'),
        link: base ? base + '?view=reader&id=' + encodeURIComponent(newsId) + '&lang=' + lang : '',
        tag: 'pub-' + newsId,
        image: a.imageUrl
      });
      total.sent += r.sent; total.failed += r.failed; total.removed += r.removed;
    });
    try {
      AuditService.log('SYSTEM', 'PUSH_PUBLISHED', 'NEWS', String(newsId), '', '',
        'Push kepada ' + total.sent + ' peranti pembaca');
    } catch (e) { }
    return total;
  }

  /** Push ujian ke peranti pengguna sendiri. */
  function test(user) {
    if (!enabled_()) throw Utils.appError('DISABLED', 'Hidupkan PUSH_ENABLED dalam Tetapan dahulu.');
    if (!serviceAccount_()) throw Utils.appError('PUSH_NOT_CONFIGURED', 'Kunci akaun servis Firebase belum ditetapkan.');
    var r = notifyUser(user.userId, '', 'Ujian notifikasi FKM News', 'Notifikasi telefon berfungsi. 👍');
    if (!r || !r.sent) throw Utils.appError('NO_DEVICE', 'Tiada peranti aktif didaftarkan untuk anda.');
    return r;
  }

  function status(user) {
    var all = [];
    try { all = rows_(); } catch (e) { }
    var out = {
      enabled: enabled_(),
      configured: !!serviceAccount_(),
      myDevices: user ? all.filter(function (r) { return r.userId === String(user.userId); }).length : 0
    };
    if (user && user.role === ROLES.ADMIN) {
      out.readers = all.filter(function (r) { return r.reader; }).length;
      out.staffDevices = all.filter(function (r) { return r.userId; }).length;
    }
    return out;
  }

  return {
    ready: ready,
    registerUser: registerUser,
    unregisterUser: unregisterUser,
    subscribeReader: subscribeReader,
    unsubscribeReader: unsubscribeReader,
    notifyUser: notifyUser,
    notifyPublished: notifyPublished,
    test: test,
    status: status
  };
})();
