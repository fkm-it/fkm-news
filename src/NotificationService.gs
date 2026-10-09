/**
 * NotificationService.gs
 * Notifikasi dalam sistem (NOTIFICATIONS sheet) dan e-mel.
 * Kegagalan e-mel tidak menggagalkan transition workflow.
 */

var NotificationService = (function () {

  /** Templat mesej — teks boleh diubah melalui Global Settings label di masa depan */
  var TEMPLATES = {
    SUBMISSION: {
      subject: 'Berita baharu menunggu semakan: {title}',
      message: '{author} telah menghantar "{title}" untuk semakan Admin.'
    },
    FORWARDED: {
      subject: 'Berita untuk semakan Editor: {title}',
      message: 'Admin telah meneruskan "{title}" untuk semakan Editor.'
    },
    REVISION: {
      subject: 'Pembetulan diperlukan: {title}',
      message: '"{title}" memerlukan pembetulan. Catatan {reviewer}: {comments}'
    },
    REJECTED: {
      subject: 'Berita tidak diterbitkan: {title}',
      message: '"{title}" tidak diterima untuk penerbitan. Sebab: {comments}'
    },
    APPROVED: {
      subject: 'Berita diluluskan: {title}',
      message: '"{title}" telah diluluskan oleh Editor dan sedia untuk diterbitkan.'
    },
    PUBLISHED: {
      subject: 'Berita telah diterbitkan: {title}',
      message: '"{title}" telah diterbitkan.'
    }
  };

  function render(template, data) {
    return String(template).replace(/\{(\w+)\}/g, function (m, key) {
      return data[key] !== undefined && data[key] !== null && data[key] !== ''
        ? String(data[key]) : '—';
    });
  }

  /** Cipta notifikasi dalam sistem untuk satu pengguna */
  function createInApp(userId, newsId, type, subject, message) {
    if (!GlobalSettings.get('IN_APP_ENABLED')) return null;
    var record = {
      NotificationID: Utils.notificationId(),
      UserID: userId,
      NewsID: newsId || '',
      Type: type,
      Subject: Utils.truncate(subject, 200),
      Message: Utils.truncate(message, 800),
      IsRead: 'FALSE',
      CreatedAt: Utils.now(),
      ReadAt: ''
    };
    SheetDB.insert(CONFIG.SHEETS.NOTIFICATIONS, record);
    return record;
  }

  function emailBody_(subject, message, newsId, webAppUrl) {
    var s = GlobalSettings.getPublicSettings();
    var link = webAppUrl ? (webAppUrl + '?page=news-detail&id=' + encodeURIComponent(newsId)) : '';
    var esc = Security.escapeHtml;
    return '' +
      '<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;' +
      'border:1px solid ' + s.BORDER_COLOR + ';border-radius:' + s.BORDER_RADIUS + ';overflow:hidden">' +
      '<div style="background:' + s.PRIMARY_COLOR + ';color:#fff;padding:18px 22px">' +
      '<div style="font-size:17px;font-weight:700">' + esc(s.SYSTEM_SHORT_NAME) + '</div>' +
      '<div style="font-size:12px;opacity:.85">' + esc(s.FACULTY_NAME) + '</div></div>' +
      '<div style="padding:22px;color:' + s.TEXT_COLOR + '">' +
      '<p style="font-size:15px;font-weight:600;margin:0 0 10px">' + esc(subject) + '</p>' +
      '<p style="font-size:14px;line-height:1.6;margin:0 0 18px">' + esc(message) + '</p>' +
      (link ? '<a href="' + link + '" style="display:inline-block;background:' + s.PRIMARY_COLOR +
        ';color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;font-size:14px">' +
        'Buka berita</a>' : '') +
      '</div>' +
      '<div style="padding:14px 22px;background:' + s.BG_COLOR + ';font-size:11px;color:' +
      s.MUTED_COLOR + '">' + esc(s.FOOTER_TEXT) +
      ' · E-mel automatik, tidak perlu dibalas.</div></div>';
  }

  function sendEmail(toEmail, subject, message, newsId) {
    if (!GlobalSettings.get('EMAIL_ENABLED')) return false;
    if (!toEmail) return false;
    try {
      var quota = MailApp.getRemainingDailyQuota();
      if (quota <= CONFIG.TECHNICAL.EMAIL_QUOTA_GUARD) {
        console.warn('Kuota e-mel hampir habis; notifikasi e-mel dilangkau.');
        return false;
      }
      var prefix = GlobalSettings.get('EMAIL_SUBJECT_PREFIX');
      var url = '';
      try { url = ScriptApp.getService().getUrl(); } catch (e) { }
      MailApp.sendEmail({
        to: toEmail,
        subject: (prefix ? prefix + ' ' : '') + subject,
        htmlBody: emailBody_(subject, message, newsId, url),
        name: GlobalSettings.get('EMAIL_SENDER_NAME')
      });
      return true;
    } catch (e) {
      console.error('EMAIL_FAIL', toEmail, String(e));
      return false;
    }
  }

  /**
   * Hantar notifikasi kepada satu pengguna (in-app + e-mel).
   * @param {string} userId penerima
   * @param {string} type NOTIF_TYPE
   * @param {Object} data { title, author, reviewer, comments, newsId }
   */
  function notifyUser(userId, type, data) {
    var tpl = TEMPLATES[type];
    if (!tpl) return;
    var subject = render(tpl.subject, data);
    var message = render(tpl.message, data);

    createInApp(userId, data.newsId, type, subject, message);

    var user = UserService.getUserMap()[String(userId)];
    if (user && user.email) sendEmail(user.email, subject, message, data.newsId);
  }

  /** Hantar kepada semua pengguna aktif dengan peranan tertentu */
  function notifyRole(role, type, data) {
    UserService.getActiveByRole(role).forEach(function (u) {
      notifyUser(u.userId, type, data);
    });
  }

  /* ---------------- Bacaan untuk UI ---------------- */

  function listForUser(userId, onlyUnread, page, pageSize) {
    var rows = SheetDB.findWhere(CONFIG.SHEETS.NOTIFICATIONS, function (n) {
      if (String(n.UserID) !== String(userId)) return false;
      if (onlyUnread && Utils.toBool(n.IsRead)) return false;
      return true;
    });
    rows = Utils.sortBy(rows, 'CreatedAt', true);
    var mapped = rows.map(function (n) {
      return {
        notificationId: n.NotificationID,
        newsId: n.NewsID,
        type: n.Type,
        subject: n.Subject,
        message: n.Message,
        isRead: Utils.toBool(n.IsRead),
        createdAt: Utils.formatDateTime(n.CreatedAt)
      };
    });
    return Utils.paginate(mapped, page, pageSize || GlobalSettings.get('PAGE_SIZE'));
  }

  function unreadCount(userId) {
    return SheetDB.count(CONFIG.SHEETS.NOTIFICATIONS, function (n) {
      return String(n.UserID) === String(userId) && !Utils.toBool(n.IsRead);
    });
  }

  function markRead(notificationId, userId) {
    var n = SheetDB.findOneBy(CONFIG.SHEETS.NOTIFICATIONS, 'NotificationID', notificationId);
    if (!n) throw Utils.appError('NOT_FOUND', 'Notifikasi tidak dijumpai.');
    if (String(n.UserID) !== String(userId))
      throw Utils.appError('FORBIDDEN', 'Notifikasi ini bukan milik anda.');
    SheetDB.updateRow(CONFIG.SHEETS.NOTIFICATIONS, n._row,
      { IsRead: 'TRUE', ReadAt: Utils.now() });
    return true;
  }

  function markAllRead(userId) {
    var rows = SheetDB.findWhere(CONFIG.SHEETS.NOTIFICATIONS, function (n) {
      return String(n.UserID) === String(userId) && !Utils.toBool(n.IsRead);
    });
    rows.forEach(function (n) {
      SheetDB.updateRow(CONFIG.SHEETS.NOTIFICATIONS, n._row,
        { IsRead: 'TRUE', ReadAt: Utils.now() });
    });
    return rows.length;
  }

  return {
    TEMPLATES: TEMPLATES,
    createInApp: createInApp,
    sendEmail: sendEmail,
    notifyUser: notifyUser,
    notifyRole: notifyRole,
    listForUser: listForUser,
    unreadCount: unreadCount,
    markRead: markRead,
    markAllRead: markAllRead
  };
})();