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
   * Rich text: pembersih berasaskan token (bukan regex ganti).
   *
   * Setiap tag dihurai, kemudian DIBINA SEMULA daripada senarai tag dan
   * atribut yang dibenarkan. Nilai atribut sentiasa dipetik dan di-escape,
   * jadi tiada cara untuk "keluar" daripada atribut. URL dinyahkod dahulu
   * (entiti HTML, ruang, aksara kawalan) sebelum skema diperiksa, supaya
   * helah seperti jav&#x61;script: atau java<tab>script: tidak lepas.
   *
   * Teks di luar tag dikekalkan, kecuali < dan > yang terbiar ditukar
   * kepada entiti. Blok berbahaya (script, style, svg, iframe...) dibuang
   * bersama kandungannya.
   *
   * Fungsi ini dipanggil semasa SIMPAN dan semasa BACA (paparan), supaya
   * kandungan lama yang disimpan sebelum pembetulan ini juga selamat.
   */
  var ALLOWED_TAGS = ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 'ul', 'ol', 'li',
    'h2', 'h3', 'h4', 'blockquote', 'a', 'span', 'div', 'figure', 'figcaption', 'img'];

  var VOID_TAGS = ['br', 'img'];

  /** Blok yang dibuang bersama SEMUA kandungannya */
  var DROP_BLOCKS = ['script', 'style', 'iframe', 'object', 'embed', 'svg', 'math',
    'template', 'noscript', 'textarea', 'select', 'title', 'xmp', 'noembed',
    'noframes', 'frameset', 'applet', 'form', 'button', 'head'];

  /** Atribut dibenarkan mengikut tag ('*' = semua tag yang dibenarkan) */
  var ALLOWED_ATTRS = {
    '*': ['class', 'title', 'dir', 'lang'],
    a: ['href', 'target'],
    img: ['src', 'alt', 'width', 'height']
  };

  var NAMED_ENTITIES = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
    colon: ':', tab: '\t', newline: '\n', sol: '/', lpar: '(', rpar: ')', semi: ';',
    period: '.', comma: ',', excl: '!', num: '#', equals: '='
  };

  function decodeEntities_(s) {
    return String(s).replace(/&(#[xX][0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);?/g, function (m, ent) {
      if (ent.charAt(0) === '#') {
        var code = (ent.charAt(1) === 'x' || ent.charAt(1) === 'X')
          ? parseInt(ent.substring(2), 16) : parseInt(ent.substring(1), 10);
        if (!isFinite(code) || code < 0 || code > 0x10FFFF) return '';
        try { return String.fromCodePoint(code); } catch (e) { return ''; }
      }
      var named = NAMED_ENTITIES[ent.toLowerCase()];
      return named !== undefined ? named : m;
    });
  }

  function escapeAttr_(s) {
    return String(s).replace(/[&<>"']/g, function (c) { return HTML_ESCAPE[c]; });
  }

  /** Escape teks biasa: kekalkan entiti sedia ada, escape < > dan & yang terbiar */
  function escapeText_(s) {
    return String(s)
      .replace(/&(?!(#[xX][0-9a-fA-F]+|#[0-9]+|[a-zA-Z][a-zA-Z0-9]*);)/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  /**
   * Sahkan URL. Mengembalikan URL asal (dinyahkod) jika selamat, atau ''.
   * @param {string} raw nilai atribut mentah
   * @param {boolean} imageOnly true untuk src gambar (http/https sahaja)
   */
  function safeUrl_(raw, imageOnly) {
    var url = decodeEntities_(raw).trim();
    if (!url) return '';
    // Pelayar mengabaikan ruang dan aksara kawalan dalam skema; kita juga.
    var probe = url.replace(/[\u0000- \u007f-\u009f]/g, '').toLowerCase();
    var scheme = probe.match(/^([a-z][a-z0-9+.\-]*):/);
    if (scheme) {
      var allowed = imageOnly ? ['http', 'https'] : ['http', 'https', 'mailto', 'tel'];
      return allowed.indexOf(scheme[1]) !== -1 ? url : '';
    }
    if (imageOnly) return '';
    // Pautan relatif: tolak apa-apa yang masih mengandungi ':' sebelum / ? #
    var head = probe.split(/[\/?#]/)[0];
    if (head.indexOf(':') !== -1) return '';
    return url;
  }

  /** Hurai rentetan atribut kepada senarai {name, value} */
  function parseAttrs_(str) {
    var out = [];
    var re = /([^\s"'>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
    var m;
    while ((m = re.exec(str)) !== null) {
      var value = m[2] !== undefined ? m[2] : (m[3] !== undefined ? m[3] : (m[4] !== undefined ? m[4] : ''));
      out.push({ name: m[1].toLowerCase(), value: value });
    }
    return out;
  }

  function buildTag_(tag, attrStr) {
    var allowed = (ALLOWED_ATTRS['*']).concat(ALLOWED_ATTRS[tag] || []);
    var seen = {};
    var parts = [];
    var isBlank = false;

    parseAttrs_(attrStr).forEach(function (a) {
      if (allowed.indexOf(a.name) === -1 || seen[a.name]) return;
      var v = a.value;

      if (a.name === 'href') {
        v = safeUrl_(v, false);
        if (!v) return;
      } else if (a.name === 'src') {
        v = safeUrl_(v, true);
        if (!v) return;
      } else if (a.name === 'target') {
        if (decodeEntities_(v).trim().toLowerCase() !== '_blank') return;
        v = '_blank';
        isBlank = true;
      } else if (a.name === 'width' || a.name === 'height') {
        if (!/^\d{1,4}$/.test(String(v).trim())) return;
        v = String(v).trim();
      } else if (a.name === 'class') {
        v = decodeEntities_(v).replace(/[^\w\- ]/g, '').trim();
        if (!v) return;
      } else if (a.name === 'dir') {
        v = decodeEntities_(v).trim().toLowerCase();
        if (['ltr', 'rtl', 'auto'].indexOf(v) === -1) return;
      } else {
        v = decodeEntities_(v);
      }

      seen[a.name] = true;
      parts.push(a.name + '="' + escapeAttr_(v) + '"');
    });

    if (tag === 'a' && isBlank) parts.push('rel="noopener noreferrer"');
    if (tag === 'img' && !seen.src) return '';
    return '<' + tag + (parts.length ? ' ' + parts.join(' ') : '') + '>';
  }

  function sanitizeHtml(html) {
    var s = String(html === null || html === undefined ? '' : html);

    var max = 0;
    try { max = Number(GlobalSettings.get('MAX_CONTENT_LENGTH')) || 0; } catch (e) { max = 0; }
    if (max && s.length > max) s = s.substring(0, max);

    // 1. Aksara kawalan dan ulasan HTML (termasuk ulasan tidak bertutup)
    s = s.replace(/[\u0000\u0001-\u0008\u000B\u000C\u000E-\u001F]/g, '');
    s = s.replace(/<!--[\s\S]*?(-->|$)/g, '');
    s = s.replace(/<!\[CDATA\[[\s\S]*?(\]\]>|$)/gi, '');
    s = s.replace(/<![^>]*>/g, '');
    s = s.replace(/<\?[^>]*>/g, '');

    // 2. Blok berbahaya bersama kandungan; ulang sehingga stabil
    var dropOpen = new RegExp('<\\s*(' + DROP_BLOCKS.join('|') + ')\\b[\\s\\S]*?<\\s*\\/\\s*\\1\\s*>', 'gi');
    var dropTail = new RegExp('<\\s*(' + DROP_BLOCKS.join('|') + ')\\b[\\s\\S]*$', 'gi');
    var prev;
    do {
      prev = s;
      s = s.replace(dropOpen, '').replace(dropTail, '');
    } while (s !== prev);

    // 3. Token: tag yang sah dibina semula; selainnya dianggap teks
    var out = [];
    // Tag dihadkan kepada 2048 aksara supaya input bertubi-tubi '<' tidak
    // menyebabkan masa pemprosesan kuadratik.
    var tagRe = /^<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/;
    var i = 0;
    var textStart = 0;

    while (i < s.length) {
      var lt = s.indexOf('<', i);
      if (lt === -1) break;

      var m = tagRe.exec(s.substr(lt, 2048));
      if (!m) { i = lt + 1; continue; }

      out.push(escapeText_(s.substring(textStart, lt)));

      var closing = m[1] === '/';
      var tag = m[2].toLowerCase();
      if (ALLOWED_TAGS.indexOf(tag) !== -1) {
        if (closing) {
          if (VOID_TAGS.indexOf(tag) === -1) out.push('</' + tag + '>');
        } else {
          out.push(buildTag_(tag, m[3]));
        }
      }

      i = lt + m[0].length;
      textStart = i;
    }
    out.push(escapeText_(s.substring(textStart)));

    return out.join('').trim();
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