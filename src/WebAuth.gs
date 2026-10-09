/**
 * WebAuth.gs
 * ============================================================================
 * Log masuk aplikasi staf di GitHub Pages melalui KOD SEKALI GUNA (OTP) ke
 * e-mel yang berdaftar dalam sheet USERS. Tiada kata laluan disimpan.
 *
 * Aliran:
 *   1. authRequest(email)  → jika e-mel berdaftar & aktif, kod 6 digit
 *                            dihantar. Jawapan SENTIASA sama (tidak
 *                            mendedahkan sama ada e-mel wujud).
 *   2. authVerify(email, kod) → token sesi rawak (256 bit) dipulangkan.
 *   3. apiWeb_(token, action, payload) → pengguna dikenal pasti melalui
 *      token, kemudian laluan api() yang SAMA (apiAs_) digunakan.
 *
 * Penyimpanan (CacheService skrip — tiada perubahan skema Sheets):
 *   OTP_<hash e-mel>   { h: hash kod, n: cubaan }       TTL 10 minit
 *   SES_<hash token>   { u: UserID, e: e-mel, x: luput mutlak }
 *                      TTL melungsur = SESSION_TIMEOUT_MINUTES (maks 6 jam)
 * Hanya HASH kod dan token disimpan, dengan pepper dalam Script Properties
 * (FKMNEWS_AUTH_PEPPER — JANGAN padam; semua sesi akan tamat).
 * ============================================================================
 */

var WebAuth = (function () {

  var OTP_TTL = 600;                // 10 minit
  var OTP_MAX_TRIES = 5;
  var REQ_PER_EMAIL = 3;            // permintaan kod / 15 minit / e-mel
  var REQ_GLOBAL = 40;              // permintaan kod / 15 minit / semua
  var REQ_WINDOW = 900;
  var SESSION_ABSOLUTE_MS = 8 * 3600 * 1000;
  var PEPPER_KEY = 'FKMNEWS_AUTH_PEPPER';

  var GENERIC_SENT = 'Jika e-mel ini berdaftar dalam sistem, kod log masuk telah dihantar. ' +
    'Semak peti masuk (dan folder spam).';

  function cache_() { return CacheService.getScriptCache(); }

  function pepper_() {
    var props = PropertiesService.getScriptProperties();
    var p = props.getProperty(PEPPER_KEY);
    if (!p) {
      p = Utilities.getUuid() + Utilities.getUuid();
      props.setProperty(PEPPER_KEY, p);
    }
    return p;
  }

  function hash_(text) {
    var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,
      pepper_() + '|' + String(text), Utilities.Charset.UTF_8);
    return bytes.map(function (b) { return ('0' + (b & 255).toString(16)).slice(-2); }).join('');
  }

  function normEmail_(email) {
    return String(email || '').trim().toLowerCase().substring(0, 200);
  }

  function bump_(key, limit) {
    var c = cache_();
    var n = parseInt(c.get(key) || '0', 10);
    if (n >= limit) return false;
    c.put(key, String(n + 1), REQ_WINDOW);
    return true;
  }

  function randomCode_() {
    var hex = Utilities.getUuid().replace(/-/g, '');
    return String(parseInt(hex.substring(0, 10), 16) % 1000000 + 1000000).substring(1);
  }

  /* -------------------------------------------------------- 1. Minta kod */

  function requestCode(email) {
    email = normEmail_(email);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw Utils.appError('VALIDATION', 'Masukkan alamat e-mel yang sah.');
    }
    var eh = hash_('e:' + email);

    if (!bump_('OTPRL_ALL', REQ_GLOBAL) || !bump_('OTPRL_' + eh, REQ_PER_EMAIL)) {
      throw Utils.appError('RATE_LIMIT',
        'Terlalu banyak permintaan kod. Cuba semula selepas 15 minit.');
    }

    var user = Auth.userForEmail(email);
    if (user) {
      var code = randomCode_();
      cache_().put('OTP_' + eh, JSON.stringify({ h: hash_('c:' + email + ':' + code), n: 0 }), OTP_TTL);
      sendCode_(email, user.name, code);
      try {
        AuditService.log(user.userId, 'OTP_REQUEST', 'SESSION', user.userId, '', '',
          'Kod log masuk web diminta');
      } catch (e) { }
    }
    return { message: GENERIC_SENT };
  }

  function sendCode_(email, name, code) {
    var sys = 'FKM News';
    try { sys = GlobalSettings.get('SYSTEM_SHORT_NAME') || sys; } catch (e) { }
    MailApp.sendEmail({
      to: email,
      subject: '[' + sys + '] Kod log masuk: ' + code,
      body: 'Salam ' + name + ',\n\n' +
        'Kod log masuk ' + sys + ' anda ialah: ' + code + '\n\n' +
        'Kod ini sah selama 10 minit dan hanya boleh digunakan sekali.\n' +
        'Jika anda tidak meminta kod ini, abaikan e-mel ini.\n',
      name: sys
    });
  }

  /* ------------------------------------------------------ 2. Sahkan kod */

  function verifyCode(email, code) {
    email = normEmail_(email);
    code = String(code || '').replace(/\D/g, '');
    var eh = hash_('e:' + email);
    var key = 'OTP_' + eh;
    var c = cache_();
    var raw = c.get(key);
    var fail = Utils.appError('INVALID_CODE', 'Kod tidak sah atau telah tamat tempoh.');
    if (!raw || code.length !== 6) throw fail;

    var rec = JSON.parse(raw);
    if (rec.n >= OTP_MAX_TRIES) { c.remove(key); throw fail; }

    if (rec.h !== hash_('c:' + email + ':' + code)) {
      rec.n++;
      if (rec.n >= OTP_MAX_TRIES) c.remove(key);
      else c.put(key, JSON.stringify(rec), OTP_TTL);
      throw fail;
    }
    c.remove(key);   // sekali guna

    var user = Auth.userForEmail(email);
    if (!user) throw fail;

    var token = (Utilities.getUuid() + Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
    putSession_(hash_('t:' + token), { u: user.userId, e: user.email, x: Date.now() + SESSION_ABSOLUTE_MS });
    try {
      AuditService.log(user.userId, AUDIT_ACTION.LOGIN, 'SESSION', user.userId, '', '',
        'Log masuk web (OTP)');
    } catch (e) { }
    return { token: token };
  }

  function idleTtl_() {
    var mins = 60;
    try { mins = Number(GlobalSettings.get('SESSION_TIMEOUT_MINUTES')) || 60; } catch (e) { }
    return Math.max(300, Math.min(21600, Math.round(mins * 60)));
  }

  function putSession_(th, s) {
    cache_().put('SES_' + th, JSON.stringify(s), idleTtl_());
  }

  /* ------------------------------------------------ 3. Sesi → pengguna */

  /** Pulangkan objek pengguna bagi token, atau null. Melanjutkan sesi. */
  function userForToken(token) {
    token = String(token || '');
    if (!/^[a-f0-9]{96}$/.test(token)) return null;
    var th = hash_('t:' + token);
    var raw = cache_().get('SES_' + th);
    if (!raw) return null;
    var s = JSON.parse(raw);
    if (!s || Date.now() > s.x) { cache_().remove('SES_' + th); return null; }

    WEB_USER_ID_ = String(s.u);       // pilihan peribadi ikut pengguna ini
    var user = Auth.userForEmail(s.e);
    if (!user || user.userId !== String(s.u)) {
      cache_().remove('SES_' + th);
      return null;
    }
    putSession_(th, s);               // TTL melungsur
    return user;
  }

  function logout(token) {
    token = String(token || '');
    if (/^[a-f0-9]{96}$/.test(token)) cache_().remove('SES_' + hash_('t:' + token));
    return { loggedOut: true };
  }

  return {
    requestCode: requestCode,
    verifyCode: verifyCode,
    userForToken: userForToken,
    logout: logout
  };
})();

/**
 * api() bagi aplikasi web. Dipanggil hanya melalui doPost (WebBridge.gs).
 */
function apiWeb_(token, action, payload) {
  WEB_USER_ID_ = '';
  try {
    var user = WebAuth.userForToken(token);
    if (!user) {
      return { ok: false, error: { code: 'UNAUTHENTICATED',
        message: 'Sesi anda telah tamat. Sila log masuk semula.' } };
    }
    return apiAs_(user, action, payload);
  } catch (err) {
    return Security.safeError(err);
  } finally {
    WEB_USER_ID_ = '';
  }
}

/** Bungkus panggilan auth dalam sampul respons standard */
function webAuthCall_(fn) {
  try { return { ok: true, data: fn() }; }
  catch (err) { return Security.safeError(err); }
}
