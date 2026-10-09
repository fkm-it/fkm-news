/**
 * WebBridge.gs
 * ============================================================================
 * Pintu masuk HTTP POST untuk portal awam yang dihoskan di GitHub Pages.
 *
 * Portal di GitHub Pages tidak boleh menggunakan google.script.run, jadi
 * pwa/bridge.js menghantar fetch POST (text/plain, tanpa cookie) ke URL
 * /exec dengan badan JSON: { fn: 'publicApi', args: [action, payload] }.
 *
 * KESELAMATAN
 * Hanya fungsi dalam WEB_BRIDGE_ALLOWED_ boleh dipanggil:
 *  - publicApi / publicSidebar: laluan awam baca-sahaja (portal)
 *  - authRequest / authVerify / authLogout: log masuk OTP (WebAuth.gs)
 *  - apiWeb: api() aplikasi staf, dengan token sesi OTP sebagai argumen
 *    pertama. Tanpa token sah → UNAUTHENTICATED. api() sendiri (sesi
 *    Google) SENGAJA tiada di sini.
 * ============================================================================
 */

function doPost(e) {
  var out;
  try {
    var raw = (e && e.postData && e.postData.contents) || '';
    // Muat naik gambar (base64) melalui apiWeb boleh mencecah ~14 MB.
    if (raw.length > 25 * 1024 * 1024) throw new Error('too large');
    var body = JSON.parse(raw || '{}');
    var fn = String(body.fn || '');
    var args = Array.isArray(body.args) ? body.args : [];

    // hasOwnProperty: tanpanya 'constructor', 'toString' dan lain-lain
    // daripada prototaip Object akan dianggap sebagai pengendali.
    var allowed = WEB_BRIDGE_ALLOWED_();
    var handler = Object.prototype.hasOwnProperty.call(allowed, fn) ? allowed[fn] : null;
    out = handler
      ? handler(args)
      : { ok: false, error: { code: 'UNKNOWN_ACTION', message: 'Tindakan tidak dikenali.' } };
  } catch (err) {
    out = { ok: false, error: { code: 'BAD_REQUEST', message: 'Permintaan tidak sah.' } };
  }
  return ContentService.createTextOutput(JSON.stringify(out))
    .setMimeType(ContentService.MimeType.JSON);
}

/** Senarai putih fungsi yang boleh dipanggil melalui doPost */
function WEB_BRIDGE_ALLOWED_() {
  return {
    publicApi: function (a) { return publicApi(String(a[0] || ''), a[1] || {}); },
    publicSidebar: function (a) { return publicSidebar(a[0]); },

    /* Aplikasi staf (F4): log masuk OTP + api() bertoken */
    authRequest: function (a) {
      return webAuthCall_(function () { return WebAuth.requestCode(a[0]); });
    },
    authVerify: function (a) {
      return webAuthCall_(function () { return WebAuth.verifyCode(a[0], a[1]); });
    },
    authLogout: function (a) {
      return webAuthCall_(function () { return WebAuth.logout(a[0]); });
    },
    apiWeb: function (a) {
      return apiWeb_(String(a[0] || ''), String(a[1] || ''), a[2] || {});
    }
  };
}
