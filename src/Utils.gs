/**
 * Utils.gs
 * Fungsi utiliti kongsi: masa, ID unik, slug, error, pagination.
 */

var Utils = (function () {

  function timezone() {
    try { return GlobalSettings.get('TIMEZONE') || Session.getScriptTimeZone(); }
    catch (e) { return Session.getScriptTimeZone(); }
  }

  function now() {
    return new Date();
  }

  function nowIso() {
    return Utilities.formatDate(new Date(), timezone(), "yyyy-MM-dd'T'HH:mm:ss");
  }

  function formatDate(value, pattern) {
    if (!value) return '';
    var d = (value instanceof Date) ? value : new Date(value);
    if (isNaN(d.getTime())) return String(value);
    return Utilities.formatDate(d, timezone(), pattern || 'dd/MM/yyyy');
  }

  function formatDateTime(value) {
    return formatDate(value, 'dd/MM/yyyy HH:mm');
  }

  /** Jana ID berformat PREFIX-YYYY-00001 (untuk NEWS) atau PREFIX-00001 */
  function nextId(prefix, withYear) {
    var lock = LockService.getScriptLock();
    lock.waitLock(CONFIG.TECHNICAL.LOCK_TIMEOUT_MS);
    try {
      var props = PropertiesService.getScriptProperties();
      var year = Utilities.formatDate(new Date(), timezone(), 'yyyy');
      var key = 'SEQ_' + prefix + (withYear ? '_' + year : '');
      var current = parseInt(props.getProperty(key) || '0', 10) + 1;
      props.setProperty(key, String(current));
      var padded = ('00000' + current).slice(-5);
      return withYear ? (prefix + '-' + year + '-' + padded) : (prefix + '-' + padded);
    } finally {
      lock.releaseLock();
    }
  }

  function newsId()         { return nextId(CONFIG.ID_PREFIX.NEWS, true); }
  function userId()         { return nextId(CONFIG.ID_PREFIX.USER, false); }
  function versionId()      { return nextId(CONFIG.ID_PREFIX.VERSION, false); }
  function reviewId()       { return nextId(CONFIG.ID_PREFIX.REVIEW, false); }
  function notificationId() { return nextId(CONFIG.ID_PREFIX.NOTIFICATION, false); }
  function auditId()        { return nextId(CONFIG.ID_PREFIX.AUDIT, false); }

  /** Slug URL-safe daripada tajuk */
  function slugify(text) {
    return String(text || '')
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .substring(0, 80);
  }

  /** Buang tag HTML untuk preview ringkas */
  function stripTags(html) {
    return String(html || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function truncate(text, max) {
    var t = String(text || '');
    return t.length > max ? t.substring(0, max - 1) + '\u2026' : t;
  }

  /** Error aplikasi dengan kod — tidak mendedahkan stack trace kepada pengguna */
  function appError(code, message) {
    var e = new Error(message);
    e.appCode = code;
    e.isAppError = true;
    return e;
  }

  function isEmpty(v) {
    return v === null || v === undefined || String(v).trim() === '';
  }

  function toBool(v) {
    if (typeof v === 'boolean') return v;
    var s = String(v).trim().toLowerCase();
    return s === 'true' || s === 'yes' || s === '1' || s === 'ya';
  }

  function paginate(rows, page, pageSize) {
    var p = Math.max(1, parseInt(page, 10) || 1);
    var size = Math.max(1, parseInt(pageSize, 10) || 10);
    var total = rows.length;
    var totalPages = Math.max(1, Math.ceil(total / size));
    if (p > totalPages) p = totalPages;
    var start = (p - 1) * size;
    return {
      items: rows.slice(start, start + size),
      page: p,
      pageSize: size,
      total: total,
      totalPages: totalPages
    };
  }

  function sortBy(rows, field, desc) {
    return rows.slice().sort(function (a, b) {
      var x = a[field], y = b[field];
      if (x instanceof Date) x = x.getTime();
      if (y instanceof Date) y = y.getTime();
      if (x === y) return 0;
      if (x === '' || x === null || x === undefined) return 1;
      if (y === '' || y === null || y === undefined) return -1;
      return (x > y ? 1 : -1) * (desc ? -1 : 1);
    });
  }

  /** Kunci skrip untuk operasi kritikal */
  function withLock(fn) {
    var lock = LockService.getScriptLock();
    if (!lock.tryLock(CONFIG.TECHNICAL.LOCK_TIMEOUT_MS)) {
      throw appError('BUSY', 'Sistem sedang sibuk. Cuba sebentar lagi.');
    }
    try { return fn(); }
    finally { lock.releaseLock(); }
  }

  function monthKey(date) {
    return Utilities.formatDate(new Date(date), timezone(), 'yyyy-MM');
  }

  return {
    now: now, nowIso: nowIso, timezone: timezone,
    formatDate: formatDate, formatDateTime: formatDateTime,
    nextId: nextId, newsId: newsId, userId: userId, versionId: versionId,
    reviewId: reviewId, notificationId: notificationId, auditId: auditId,
    slugify: slugify, stripTags: stripTags, truncate: truncate,
    appError: appError, isEmpty: isEmpty, toBool: toBool,
    paginate: paginate, sortBy: sortBy, withLock: withLock, monthKey: monthKey
  };
})();