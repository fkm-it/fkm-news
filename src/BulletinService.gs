/**
 * BulletinService.gs
 * ============================================================================
 * Buletin bulanan FKM News (F10).
 *
 * Mengumpul semua berita yang DITERBITKAN dalam satu bulan kalendar dan
 * menghasilkan:
 *   - e-mel HTML (susun atur jadual, selamat untuk Gmail/Outlook)
 *   - PDF (HTML yang sama ditukar oleh Apps Script) untuk dicetak/diarkib
 *
 * Penghantaran automatik (BULLETIN_ENABLED, lalai MATI): pada 7 hari
 * pertama setiap bulan, dailyMaintenance() menghantar buletin bulan lepas
 * SEKALI kepada BULLETIN_RECIPIENTS (contoh senarai mel staf fakulti).
 * Ini senarai dalaman yang ditetapkan Admin, bukan langganan awam.
 * Admin/Editor boleh pratonton dan muat turun PDF bila-bila masa;
 * Admin boleh menghantar secara manual.
 * ============================================================================
 */

var BulletinService = (function () {

  var LAST_SENT_KEY = 'FKMNEWS_BULLETIN_LAST';
  var MAX_ITEMS = 60;
  var MONTHS_BM = ['Januari', 'Februari', 'Mac', 'April', 'Mei', 'Jun', 'Julai', 'Ogos',
    'September', 'Oktober', 'November', 'Disember'];

  /* ------------------------------------------------------------ Bulan */

  /** 'yyyy-MM' dalam zon waktu sistem */
  function monthKey(date) {
    return Utilities.formatDate(date || new Date(), Utils.timezone(), 'yyyy-MM');
  }

  function previousMonthKey(now) {
    var k = monthKey(now || new Date()).split('-');
    var y = Number(k[0]), m = Number(k[1]) - 1;
    if (m === 0) { m = 12; y--; }
    return y + '-' + (m < 10 ? '0' : '') + m;
  }

  function validMonth_(key) {
    key = String(key || '');
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(key)) {
      throw Utils.appError('VALIDATION', 'Bulan tidak sah (format yyyy-MM).');
    }
    return key;
  }

  function monthLabel(key) {
    var p = validMonth_(key).split('-');
    return MONTHS_BM[Number(p[1]) - 1] + ' ' + p[0];
  }

  /* ---------------------------------------------------------- Kumpul */

  /** Berita diterbitkan dalam bulan itu, mengikut tarikh terbit menaik. */
  function collect(key) {
    key = validMonth_(key);
    var tz = Utils.timezone();
    var rows = SheetDB.findWhere(CONFIG.SHEETS.NEWS, function (n) {
      if (String(n.Status) !== STATUS.PUBLISHED || !n.PublishedAt) return false;
      var d = new Date(n.PublishedAt);
      return isFinite(d.getTime()) && Utilities.formatDate(d, tz, 'yyyy-MM') === key;
    });
    rows.sort(function (a, b) { return new Date(a.PublishedAt) - new Date(b.PublishedAt); });

    return rows.slice(0, MAX_ITEMS).map(function (n) {
      var a = null;
      try { a = PublicService.handle('public.article', { newsId: String(n.NewsID), lang: 'bm' }, false); }
      catch (e) { console.error('BULLETIN_ARTICLE_FAIL', n.NewsID, String(e)); }
      a = a || {};
      return {
        newsId: String(n.NewsID),
        title: String(a.title || n.Title || ''),
        summary: Utils.truncate(Utils.stripTags(String(a.summary || n.Summary || '')), 260),
        category: String(a.categoryName || ''),
        publishedAt: String(a.publishedAt || Utils.formatDate(n.PublishedAt)),
        imageUrl: /^https:\/\//.test(String(a.imageUrl || '')) ? String(a.imageUrl) : '',
        url: /^https:\/\//.test(String(a.shareUrl || '')) ? String(a.shareUrl) : ''
      };
    });
  }

  /* ---------------------------------------------------------- Render */

  /**
   * HTML buletin (inline style sahaja — e-mel dan PDF).
   * @returns {{month, label, count, subject, html, text}}
   */
  function render(key) {
    key = validMonth_(key);
    var items = collect(key);
    var s = GlobalSettings.getPublicSettings();
    var esc = Security.escapeHtml;
    var label = monthLabel(key);
    var primary = s.PRIMARY_COLOR || '#6B1839';
    var accent = s.ACCENT_COLOR || '#C8952B';
    var muted = s.MUTED_COLOR || '#5C6B7F';
    var border = s.BORDER_COLOR || '#E7E2EA';
    var portal = '';
    try { portal = String(GlobalSettings.get('PUBLIC_PORTAL_URL') || ''); } catch (e) { }
    if (!/^https:\/\//.test(portal)) portal = '';

    var rows = items.map(function (it) {
      var title = it.url
        ? '<a href="' + esc(it.url) + '" style="color:' + primary + ';text-decoration:none">' + esc(it.title) + '</a>'
        : esc(it.title);
      var img = it.imageUrl
        ? '<td width="150" valign="top" style="padding:16px 14px 16px 0">' +
          '<img src="' + esc(it.imageUrl) + '" width="150" alt="" style="display:block;width:150px;max-width:150px;' +
          'height:auto;border-radius:6px;border:0"></td>'
        : '';
      return '<tr><td style="border-bottom:1px solid ' + border + '">' +
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>' + img +
        '<td valign="top" style="padding:16px 0">' +
        '<div style="font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:' + accent + '">' +
          esc(it.category) + (it.category ? ' · ' : '') + esc(it.publishedAt) + '</div>' +
        '<div style="font-size:16px;font-weight:700;line-height:1.35;margin:4px 0 6px">' + title + '</div>' +
        '<div style="font-size:13px;line-height:1.55;color:#333">' + esc(it.summary) + '</div>' +
        '</td></tr></table></td></tr>';
    }).join('');

    var empty = '<tr><td style="padding:24px 0;color:' + muted + ';font-size:14px">' +
      'Tiada berita diterbitkan pada bulan ini.</td></tr>';

    var html = '<!doctype html><html lang="ms"><head><meta charset="utf-8">' +
      '<title>' + esc('Buletin ' + (s.SYSTEM_SHORT_NAME || 'FKM News') + ' ' + label) + '</title></head>' +
      '<body style="margin:0;padding:0;background:#ffffff">' +
      '<div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto;color:#16202E">' +
      '<div style="background:' + primary + ';color:#fff;padding:22px 24px">' +
        '<div style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:' + accent + ';font-weight:700">' +
          'Buletin bulanan</div>' +
        '<div style="font-size:24px;font-weight:700;margin-top:4px">' + esc(s.SYSTEM_SHORT_NAME || 'FKM News') +
          ' · ' + esc(label) + '</div>' +
        '<div style="font-size:12px;opacity:.85;margin-top:4px">' + esc(s.FACULTY_NAME || '') + '</div>' +
      '</div>' +
      '<div style="padding:4px 24px 8px">' +
        '<p style="font-size:14px;line-height:1.6;margin:18px 0 4px">' +
          esc(items.length + ' berita diterbitkan sepanjang ' + label + '.') + '</p>' +
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">' +
          (rows || empty) + '</table>' +
        (portal ? '<p style="margin:22px 0 6px"><a href="' + esc(portal) + '" style="display:inline-block;background:' +
          primary + ';color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;font-size:14px;font-weight:700">' +
          'Baca semua berita di portal</a></p>' : '') +
        '<p style="font-size:11px;color:' + muted + ';margin:18px 0 22px">Dijana oleh ' +
          esc(s.SYSTEM_SHORT_NAME || 'FKM News') + '.</p>' +
      '</div></div></body></html>';

    var text = 'Buletin ' + (s.SYSTEM_SHORT_NAME || 'FKM News') + ' ' + label + '\n\n' +
      (items.length ? items.map(function (it) {
        return '• ' + it.title + ' (' + it.publishedAt + ')' + (it.url ? '\n  ' + it.url : '');
      }).join('\n') : 'Tiada berita diterbitkan pada bulan ini.') + (portal ? '\n\n' + portal : '');

    return {
      month: key,
      label: label,
      count: items.length,
      items: items,
      subject: 'Buletin ' + (s.SYSTEM_SHORT_NAME || 'FKM News') + ' ' + label,
      html: html,
      text: text
    };
  }

  /** PDF buletin. @returns {{fileName, mimeType, base64, count}} */
  function pdf(key) {
    var b = render(key);
    var blob = Utilities.newBlob(b.html, 'text/html', 'buletin.html').getAs('application/pdf');
    var name = 'Buletin-FKM-News-' + b.month + '.pdf';
    blob.setName(name);
    return {
      fileName: name,
      mimeType: 'application/pdf',
      base64: Utilities.base64Encode(blob.getBytes()),
      count: b.count
    };
  }

  /* --------------------------------------------------------- Hantar */

  function recipients() {
    var raw = String(GlobalSettings.get('BULLETIN_RECIPIENTS') || '');
    var seen = {};
    return raw.split(/[\s,;]+/).map(function (e) { return e.trim().toLowerCase(); })
      .filter(function (e) {
        if (!e || seen[e] || !/^[^@\s<>"']+@[^@\s<>"']+\.[a-z]{2,}$/.test(e)) return false;
        seen[e] = true;
        return true;
      }).slice(0, 50);
  }

  /**
   * Hantar buletin. Penerima dalam BCC supaya alamat tidak didedahkan.
   * @returns {{sent:boolean, month, count, recipients:number}}
   */
  function send(key, options) {
    options = options || {};
    key = validMonth_(key);
    if (!GlobalSettings.get('EMAIL_ENABLED')) {
      throw Utils.appError('EMAIL_DISABLED', 'E-mel dimatikan (EMAIL_ENABLED). Hidupkan dahulu dalam Tetapan.');
    }
    var to = recipients();
    if (!to.length) {
      throw Utils.appError('VALIDATION', 'Tetapkan BULLETIN_RECIPIENTS (alamat e-mel, dipisahkan koma) dalam Tetapan.');
    }
    var b = render(key);
    if (!b.count && !options.allowEmpty) return { sent: false, reason: 'EMPTY', month: key, count: 0, recipients: to.length };

    var attachments = [];
    try {
      var p = Utilities.newBlob(b.html, 'text/html', 'buletin.html').getAs('application/pdf');
      p.setName('Buletin-FKM-News-' + key + '.pdf');
      attachments.push(p);
    } catch (e) { console.error('BULLETIN_PDF_FAIL', String(e)); }

    var prefix = GlobalSettings.get('EMAIL_SUBJECT_PREFIX');
    var sender = '';
    try { sender = Session.getEffectiveUser().getEmail(); } catch (e) { }
    MailApp.sendEmail({
      to: sender || to[0],
      bcc: to.join(','),
      subject: (prefix ? prefix + ' ' : '') + b.subject,
      htmlBody: b.html,
      body: b.text,
      name: GlobalSettings.get('EMAIL_SENDER_NAME'),
      attachments: attachments
    });
    PropertiesService.getScriptProperties().setProperty(LAST_SENT_KEY, key);
    try {
      AuditService.log(options.userId || 'SYSTEM', 'BULLETIN_SENT', 'BULLETIN', key, '', '',
        b.count + ' berita kepada ' + to.length + ' penerima');
    } catch (e) { }
    return { sent: true, month: key, count: b.count, recipients: to.length };
  }

  /**
   * Dipanggil oleh dailyMaintenance(). Pada hari 1–7 setiap bulan, hantar
   * buletin bulan lepas jika belum dihantar.
   */
  function runMonthly(now) {
    now = now || new Date();
    if (!GlobalSettings.get('BULLETIN_ENABLED')) return { skipped: 'DISABLED' };
    var day = Number(Utilities.formatDate(now, Utils.timezone(), 'dd'));
    if (day > 7) return { skipped: 'NOT_START_OF_MONTH' };
    var prev = previousMonthKey(now);
    if (PropertiesService.getScriptProperties().getProperty(LAST_SENT_KEY) === prev) {
      return { skipped: 'ALREADY_SENT' };
    }
    if (!recipients().length) return { skipped: 'NO_RECIPIENTS' };
    return send(prev, { userId: 'SYSTEM' });
  }

  function status() {
    return {
      enabled: !!GlobalSettings.get('BULLETIN_ENABLED'),
      recipients: recipients().length,
      lastSent: PropertiesService.getScriptProperties().getProperty(LAST_SENT_KEY) || '',
      currentMonth: monthKey(new Date()),
      previousMonth: previousMonthKey(new Date())
    };
  }

  return {
    monthKey: monthKey,
    previousMonthKey: previousMonthKey,
    monthLabel: monthLabel,
    collect: collect,
    render: render,
    pdf: pdf,
    recipients: recipients,
    send: send,
    runMonthly: runMonthly,
    status: status
  };
})();
