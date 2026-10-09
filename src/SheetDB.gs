/**
 * SheetDB.gs
 * Lapisan akses data (repository) untuk Google Sheets.
 * Semua service lain BERINTERAKSI DENGAN DATA MELALUI FAIL INI SAHAJA
 * supaya skema, caching dan formula-injection guard berada di satu tempat.
 */

var SheetDB = (function () {

  var _ss = null;
  var _headerCache = {};

  /**
   * Cache bacaan seumur satu pelaksanaan.
   *
   * Satu permintaan papan pemuka membaca sheet NEWS, USERS dan CATEGORIES
   * beberapa kali melalui service yang berlainan. Setiap bacaan ialah
   * panggilan SpreadsheetApp yang memakan masa. Cache ini hidup hanya
   * selama satu pelaksanaan skrip, jadi ia tidak boleh menjadi basi antara
   * permintaan — dan ia dikosongkan pada setiap tulisan.
   */
  var _readCache = {};

  function invalidate(name) {
    if (name) delete _readCache[name];
    else _readCache = {};
  }

  function ss() {
    if (!_ss) _ss = SpreadsheetApp.openById(CONFIG.getSpreadsheetId());
    return _ss;
  }

  function sheet(name) {
    var sh = ss().getSheetByName(name);
    if (!sh) throw Utils.appError('SCHEMA', 'Sheet tidak dijumpai: ' + name);
    return sh;
  }

  function headers(name) {
    if (_headerCache[name]) return _headerCache[name];
    var sh = sheet(name);
    var lastCol = sh.getLastColumn();
    var row = lastCol > 0 ? sh.getRange(1, 1, 1, lastCol).getValues()[0] : [];
    _headerCache[name] = row.map(function (h) { return String(h).trim(); });
    return _headerCache[name];
  }

  /**
   * Guard formula injection: input pengguna yang bermula dengan = + - @
   * diprefix dengan apostrof supaya Sheets tidak menilainya sebagai formula.
   */
  function safeCell(value) {
    if (value === null || value === undefined) return '';
    if (value instanceof Date) return value;
    if (typeof value === 'number' || typeof value === 'boolean') return value;
    var s = String(value);
    if (/^[=+\-@\t\r]/.test(s)) return "'" + s;
    // Google Sheets membuang apostrof di hadapan sel (penanda format teks).
    // Nilai seperti font stack yang bermula dengan ' akan rosak senyap,
    // jadi apostrof itu digandakan supaya satu kekal selepas disimpan.
    if (s.charAt(0) === "'") return "'" + s;
    return s;
  }

  function rowToObject(hdrs, row) {
    var obj = {};
    for (var i = 0; i < hdrs.length; i++) obj[hdrs[i]] = row[i];
    return obj;
  }

  function objectToRow(hdrs, obj) {
    return hdrs.map(function (h) {
      return safeCell(Object.prototype.hasOwnProperty.call(obj, h) ? obj[h] : '');
    });
  }

  /** Baca semua baris sebagai object (dicache dalam pelaksanaan semasa) */
  function findAll(name) {
    if (_readCache[name]) return _readCache[name];
    var rows = readAll_(name);
    _readCache[name] = rows;
    return rows;
  }

  function readAll_(name) {
    var sh = sheet(name);
    var lastRow = sh.getLastRow();
    var lastCol = sh.getLastColumn();
    if (lastRow < 2) return [];
    var hdrs = headers(name);
    var values = sh.getRange(2, 1, lastRow - 1, lastCol).getValues();
    var out = [];
    for (var i = 0; i < values.length; i++) {
      if (String(values[i][0]).trim() === '') continue;
      var o = rowToObject(hdrs, values[i]);
      o._row = i + 2;
      out.push(o);
    }
    return out;
  }

  /** Cari baris yang memenuhi predicate */
  function findWhere(name, predicate) {
    return findAll(name).filter(predicate);
  }

  /** Cari satu rekod berdasarkan medan */
  function findOneBy(name, field, value) {
    var rows = findAll(name);
    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i][field]) === String(value)) return rows[i];
    }
    return null;
  }

  /** Sisip satu baris */
  function insert(name, obj) {
    invalidate(name);
    var sh = sheet(name);
    var hdrs = headers(name);
    sh.appendRow(objectToRow(hdrs, obj));
    return obj;
  }

  /** Sisip banyak baris sekaligus (lebih pantas daripada appendRow berulang) */
  function insertMany(name, objs) {
    invalidate(name);
    if (!objs || !objs.length) return 0;
    var sh = sheet(name);
    var hdrs = headers(name);
    var rows = objs.map(function (o) { return objectToRow(hdrs, o); });
    sh.getRange(sh.getLastRow() + 1, 1, rows.length, hdrs.length).setValues(rows);
    return rows.length;
  }

  /**
   * Kemas kini sebahagian medan bagi satu baris.
   * @param {string} name  nama sheet
   * @param {number} rowNo nombor baris sebenar (_row)
   * @param {Object} patch medan yang hendak ditukar
   */
  function updateRow(name, rowNo, patch) {
    invalidate(name);
    var sh = sheet(name);
    var hdrs = headers(name);
    Object.keys(patch).forEach(function (key) {
      var idx = hdrs.indexOf(key);
      if (idx === -1) return;
      sh.getRange(rowNo, idx + 1).setValue(safeCell(patch[key]));
    });
  }

  /** Kemas kini berdasarkan medan ID */
  function updateBy(name, idField, idValue, patch) {
    var rec = findOneBy(name, idField, idValue);
    if (!rec) throw Utils.appError('NOT_FOUND', 'Rekod tidak dijumpai: ' + idValue);
    updateRow(name, rec._row, patch);
    return Object.assign({}, rec, patch);
  }

  /** Padam baris berdasarkan medan ID */
  function deleteBy(name, idField, idValue) {
    var rec = findOneBy(name, idField, idValue);
    if (!rec) return false;
    sheet(name).deleteRow(rec._row);
    invalidate(name);
    return true;
  }

  function count(name, predicate) {
    return predicate ? findWhere(name, predicate).length : findAll(name).length;
  }

  function clearHeaderCache() { _headerCache = {}; invalidate(); }

  return {
    ss: ss, sheet: sheet, headers: headers, safeCell: safeCell,
    findAll: findAll, findWhere: findWhere, findOneBy: findOneBy,
    insert: insert, insertMany: insertMany,
    updateRow: updateRow, updateBy: updateBy, deleteBy: deleteBy,
    count: count, clearHeaderCache: clearHeaderCache,
    invalidate: invalidate
  };
})();