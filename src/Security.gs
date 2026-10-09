/**
 * Security.gs
 * Authorization, sanitization dan kawalan akses — SEMUANYA SERVER-SIDE.
 * Butang tersembunyi di frontend BUKAN kawalan keselamatan.
 */

var Security = (function () {

  /** Adakah role mempunyai permission ini? */
  function hasPermission(role, permission) {
    var allowed = PERMISSIONS[permission];
    if (!allowed) return false;
    return allowed.indexOf(String(role).toUpperCase()) !== -1;
  }

  /** Lempar ralat jika permission tiada, dan catat percubaan */
  function requirePermission(user, permission) {
    if (!hasPermission(user.role, permission)) {
      try {
        AuditService.log(user.userId, AUDIT_ACTION.ACCESS_DENIED, 'PERMISSION',
          permission, '', '', 'Percubaan akses tanpa kebenaran: ' + permission);
      } catch (e) { }
      throw Utils.appError('FORBIDDEN', 'Anda tiada kebenaran untuk tindakan ini.');
    }
    return true;
  }

  /** Semak sama ada pengguna boleh melihat satu artikel */
  function canViewNews(user, news) {
    if (!news) return false;
    if (user.role === ROLES.ADMIN) return true;
    if (String(news.AuthorID) === String(user.userId)) return true;
    if (user.role === ROLES.EDITOR) {
      return EDITOR_VISIBLE_STATUSES.indexOf(String(news.Status)) !== -1;
    }
    return false;
  }

  function requireViewNews(user, news) {
    if (!canViewNews(user, news)) {
      throw Utils.appError('FORBIDDEN', 'Anda tiada akses kepada berita ini.');
    }
    return true;
  }

  /** Hanya pemilik (atau Admin) boleh sunting draf */
  function canEditNews(user, news) {
    if (!news) return false;
    if (EDITABLE_STATUSES.indexOf(String(news.Status)) === -1) return false;
    if (String(news.AuthorID) === String(user.userId)) return true;
    return user.role === ROLES.ADMIN;
  }

  function requireEditNews(user, news) {
    if (!canEditNews(user, news)) {
      throw Utils.appError('FORBIDDEN',
        'Berita ini tidak boleh disunting pada status semasa.');
    }
    return true;
  }

  /* ---------------- Sanitization ---------------- */

  var HTML_ESCAPE = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

  function escapeHtml(text) {
    return String(text === null || text === undefined ? '' : text)
      .replace(/[&<>"']/g, function (c) { return HTML_ESCAPE[c]; });
  }

  /** Teks biasa: buang semua tag dan kawal panjang */
  function sanitizeText(value, maxLength) {
    var s = String(value === null || value === undefined ? '' : value);
    s = s.replace(/<[^>]*>/g, '');
    s = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
    s = s.trim();
    if (maxLength && s.length > maxLength) s = s.substring(0, maxLength);
    return s;
  }

  /**
   * Rich text: whitelist tag yang selamat, buang event handler, javascript:,
   * <script>, <style>, <iframe> dan atribut berbahaya.
   */
  var ALLOWED_TAGS = ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 'ul', 'ol', 'li',
    'h2', 'h3', 'h4', 'blockquote', 'a', 'span', 'div', 'figure', 'figcaption', 'img'];

  function sanitizeHtml(html) {
    var s = String(html || '');

    // Buang blok berbahaya sepenuhnya
    s = s.replace(/<\s*(script|style|iframe|object|embed|form|input|link|meta)[\s\S]*?<\s*\/\s*\1\s*>/gi, '');
    s = s.replace(/<\s*(script|style|iframe|object|embed|form|input|link|meta)[^>]*\/?>/gi, '');

    // Buang atribut event dan protokol berbahaya
    s = s.replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
    s = s.replace(/(href|src)\s*=\s*("|')\s*(javascript|vbscript|data):[^"']*\2/gi, '$1="#"');
    s = s.replace(/\sstyle\s*=\s*("[^"]*"|'[^']*')/gi, '');

    // Buang tag yang tiada dalam whitelist
    s = s.replace(/<\s*\/?\s*([a-zA-Z0-9]+)([^>]*)>/g, function (match, tag, attrs) {
      if (ALLOWED_TAGS.indexOf(String(tag).toLowerCase()) === -1) return '';
      return match;
    });

    var max = GlobalSettings.get('MAX_CONTENT_LENGTH');
    if (s.length > max) s = s.substring(0, max);
    return s.trim();
  }

  /** Bersihkan nama fail sebelum simpan ke Drive */
  function sanitizeFilename(name) {
    return String(name || 'fail')
      .replace(/[\/\\?%*:|"<>\u0000-\u001F]/g, '-')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 120) || 'fail';
  }

  /** Respons ralat selamat — tiada stack trace kepada pengguna */
  function safeError(err) {
    var isApp = err && err.isAppError;
    var message = isApp ? err.message : 'Ralat sistem. Sila cuba lagi atau hubungi Admin.';
    var code = isApp ? err.appCode : 'INTERNAL';
    if (!isApp) {
      try { console.error('FKMNEWS_ERROR', err && err.stack ? err.stack : String(err)); }
      catch (e) { }
    }
    return { ok: false, error: { code: code, message: message } };
  }

  return {
    hasPermission: hasPermission,
    requirePermission: requirePermission,
    canViewNews: canViewNews,
    requireViewNews: requireViewNews,
    canEditNews: canEditNews,
    requireEditNews: requireEditNews,
    escapeHtml: escapeHtml,
    sanitizeText: sanitizeText,
    sanitizeHtml: sanitizeHtml,
    sanitizeFilename: sanitizeFilename,
    safeError: safeError
  };
})();