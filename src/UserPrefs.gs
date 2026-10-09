/**
 * UserPrefs.gs
 * ============================================================================
 * Pilihan peribadi pengguna (tema, bahasa, peranan ujian).
 *
 * Melalui URL /exec (sesi Google), pilihan disimpan dalam User Properties
 * akaun Google pengguna, seperti sebelum ini.
 *
 * Melalui aplikasi web di GitHub Pages (doPost, sesi OTP), SEMUA permintaan
 * berjalan sebagai pemilik skrip tanpa pengguna aktif, jadi User Properties
 * akan dikongsi oleh semua orang. Dalam mod itu pilihan disimpan dalam
 * Script Properties dengan kunci mengikut UserID.
 * ============================================================================
 */

/** UserID pengguna web bagi permintaan semasa (ditetapkan oleh apiWeb_) */
var WEB_USER_ID_ = '';

var UserPrefs = (function () {

  function store_() {
    return WEB_USER_ID_
      ? PropertiesService.getScriptProperties()
      : PropertiesService.getUserProperties();
  }

  function key_(name) {
    return WEB_USER_ID_ ? 'FKMNEWS_PREF_' + WEB_USER_ID_ + '_' + name : name;
  }

  function get(name) {
    try { return store_().getProperty(key_(name)) || ''; } catch (e) { return ''; }
  }

  function set(name, value) {
    store_().setProperty(key_(name), String(value));
  }

  return { get: get, set: set };
})();
