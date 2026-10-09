/**
 * Guard.gs
 * ============================================================================
 * Kunci untuk fungsi operasi (setup, seed, migrasi, sandaran, diagnostik).
 *
 * KENAPA FAIL INI WUJUD
 * Web app ini dideploy sebagai "Execute as: Me" dan "Who has access: Anyone".
 * Dalam konfigurasi itu, SETIAP fungsi global yang namanya tidak berakhir
 * dengan garis bawah (_) boleh dipanggil oleh sesiapa sahaja melalui
 * google.script.run, termasuk pelawat portal awam yang membuka konsol
 * pelayar. Fungsi itu kemudian berjalan dengan kuasa pemilik skrip.
 *
 * Oleh itu setiap fungsi global, selain pintu masuk yang disengajakan
 * (doGet, include, api, publicApi, publicSidebar, t, getDictionary), MESTI
 * bermula dengan salah satu guard di bawah. Ujian
 * tests/security.test.js menggagalkan CI jika ada fungsi baharu tanpa guard.
 *
 * Fungsi dalaman yang tidak perlu dijalankan dari editor sepatutnya
 * dinamakan dengan akhiran _ sahaja (google.script.run tidak boleh
 * memanggilnya).
 * ============================================================================
 */

/**
 * Benarkan hanya pemilik skrip (Za) yang menjalankan fungsi dari editor
 * Apps Script, atau dari sesi web pemilik sendiri.
 *
 * Pelawat anonim mempunyai e-mel aktif kosong. Pengguna domain lain
 * mempunyai e-mel yang tidak sama dengan pemilik. Kedua-duanya ditolak.
 */
function requireOwner_() {
  var active = '';
  var owner = '';
  try { active = String(Session.getActiveUser().getEmail() || '').trim().toLowerCase(); }
  catch (e) { active = ''; }
  try { owner = String(Session.getEffectiveUser().getEmail() || '').trim().toLowerCase(); }
  catch (e) { owner = ''; }

  if (!active || !owner || active !== owner) {
    throw new Error('Fungsi operasi ini hanya boleh dijalankan oleh pemilik skrip ' +
      'dari editor Apps Script.');
  }
  return true;
}

/**
 * Seperti requireOwner_(), tetapi juga membenarkan trigger projek yang SAH
 * untuk fungsi yang sama.
 *
 * Trigger masa menghantar objek acara yang mengandungi triggerUid. Nilai itu
 * disemak terhadap senarai trigger sebenar projek DAN nama fungsi
 * pengendalinya, jadi penyerang yang menghantar {triggerUid: '...'} melalui
 * google.script.run tetap ditolak kecuali dia meneka ID trigger yang wujud
 * untuk fungsi tersebut.
 *
 * @param {string} handlerName nama fungsi yang sedang berjalan
 * @param {*} e argumen pertama fungsi (objek acara trigger, jika ada)
 */
function requireOwnerOrTrigger_(handlerName, e) {
  if (e && typeof e === 'object' && e.triggerUid) {
    var uid = String(e.triggerUid);
    var valid = false;
    try {
      valid = ScriptApp.getProjectTriggers().some(function (t) {
        return String(t.getUniqueId()) === uid && t.getHandlerFunction() === handlerName;
      });
    } catch (err) { valid = false; }
    if (valid) return true;
  }
  return requireOwner_();
}
