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
 * Hanya fungsi dalam ALLOWED_ di bawah boleh dipanggil. Kedua-duanya ialah
 * laluan awam baca-sahaja yang sama seperti portal Apps Script, dan tidak
 * memerlukan identiti. api() (aplikasi staf) SENGAJA tiada di sini: ia
 * bergantung pada sesi Google, yang tidak wujud dalam permintaan fetch
 * dari domain lain. Laluan staf akan ditambah dalam F4 dengan sesi OTP.
 * ============================================================================
 */

function doPost(e) {
  var out;
  try {
    var raw = (e && e.postData && e.postData.contents) || '';
    if (raw.length > 100000) throw new Error('too large');
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
    publicSidebar: function (a) { return publicSidebar(a[0]); }
  };
}
