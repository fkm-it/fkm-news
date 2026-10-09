/**
 * ReminderService.gs
 * ============================================================================
 * Peringatan tertunggak (F7).
 *
 * Setiap hari bekerja (Isnin–Jumaat), berita yang tersangkut dalam satu
 * peringkat lebih lama daripada REMINDER_DAYS hari dikumpul, dan SATU
 * ringkasan dihantar kepada setiap penerima (bukan satu e-mel setiap berita):
 *
 *   SUBMITTED / RESUBMITTED / ADMIN_REVIEW  → semua Admin aktif
 *   EDITOR_REVIEW / APPROVED                → semua Editor aktif
 *   REVISION_REQUIRED                       → Penulis berita itu
 *
 * "Tersangkut" diukur daripada UpdatedAt (masa status terakhir berubah).
 * Dijalankan oleh dailyMaintenance(); satu larian sahaja setiap hari.
 * Hormat EMAIL_ENABLED dan IN_APP_ENABLED.
 * ============================================================================
 */

var ReminderService = (function () {

  var DAY_MS = 86400000;
  var LAST_RUN_KEY = 'FKMNEWS_REMINDER_LAST';

  function stageOf_(status) {
    if ([STATUS.SUBMITTED, STATUS.RESUBMITTED, STATUS.ADMIN_REVIEW].indexOf(status) !== -1) return 'ADMIN';
    if ([STATUS.EDITOR_REVIEW, STATUS.APPROVED].indexOf(status) !== -1) return 'EDITOR';
    if (status === STATUS.REVISION_REQUIRED) return 'AUTHOR';
    return '';
  }

  /**
   * Kumpul berita tertunggak mengikut penerima.
   * @returns {Object<string,{user:Object,items:Array}>} UserID → senarai
   */
  function collect(now) {
    now = now || new Date();
    var days = Number(GlobalSettings.get('REMINDER_DAYS')) || 2;
    var cutoff = now.getTime() - days * DAY_MS;
    var users = UserService.getUserMap(true);
    var active = function (role) {
      return Object.keys(users).filter(function (id) {
        return users[id].role === role && users[id].status === USER_STATUS.ACTIVE;
      });
    };
    var admins = active(ROLES.ADMIN);
    var editors = active(ROLES.EDITOR);
    var out = {};

    SheetDB.findAll(CONFIG.SHEETS.NEWS).forEach(function (n) {
      var status = String(n.Status);
      var stage = stageOf_(status);
      if (!stage) return;
      var since = new Date(n.UpdatedAt || n.SubmittedAt || n.CreatedAt).getTime();
      if (!isFinite(since) || since > cutoff) return;

      var item = {
        newsId: String(n.NewsID),
        title: String(n.Title || ''),
        status: status,
        statusLabel: GlobalSettings.statusLabel(status),
        days: Math.floor((now.getTime() - since) / DAY_MS)
      };
      var to = stage === 'ADMIN' ? admins : stage === 'EDITOR' ? editors : [String(n.AuthorID)];
      to.forEach(function (uid) {
        var u = users[uid];
        if (!u || u.status !== USER_STATUS.ACTIVE) return;
        if (!out[uid]) out[uid] = { user: { userId: uid, name: u.name, email: u.email, role: u.role }, items: [] };
        out[uid].items.push(item);
      });
    });

    Object.keys(out).forEach(function (uid) {
      out[uid].items.sort(function (a, b) { return b.days - a.days; });
    });
    return out;
  }

  /**
   * Hantar peringatan. Melangkau hujung minggu dan larian kedua pada hari
   * yang sama (kecuali force).
   */
  function run(options) {
    options = options || {};
    var now = options.now || new Date();
    if (!GlobalSettings.get('REMINDER_ENABLED') && !options.force) return { skipped: 'DISABLED' };

    var tz = Utils.timezone();
    var dow = Number(Utilities.formatDate(now, tz, 'u'));   // 1 = Isnin … 7 = Ahad
    if (!options.force && (dow === 6 || dow === 7)) return { skipped: 'WEEKEND' };

    var today = Utilities.formatDate(now, tz, 'yyyy-MM-dd');
    var props = PropertiesService.getScriptProperties();
    if (!options.force && props.getProperty(LAST_RUN_KEY) === today) return { skipped: 'ALREADY_RAN' };

    var groups = collect(now);
    var sent = 0;
    Object.keys(groups).forEach(function (uid) {
      var g = groups[uid];
      var n = g.items.length;
      var subject = n + ' berita menunggu tindakan anda';
      var lines = g.items.slice(0, 15).map(function (it) {
        return '• ' + it.title + ' (' + it.statusLabel + ', ' + it.days + ' hari)';
      });
      if (n > 15) lines.push('… dan ' + (n - 15) + ' lagi.');
      var message = 'Berita berikut telah menunggu lebih daripada ' +
        (Number(GlobalSettings.get('REMINDER_DAYS')) || 2) + ' hari:\n' + lines.join('\n');

      try {
        NotificationService.createInApp(uid, g.items[0].newsId, 'REMINDER', subject,
          message.replace(/\n/g, ' '));
      } catch (e) { console.error('REMINDER_INAPP_FAIL', uid, String(e)); }
      if (NotificationService.sendDigest(g.user.email, subject, message, g.items)) sent++;
    });

    props.setProperty(LAST_RUN_KEY, today);
    return { recipients: Object.keys(groups).length, emails: sent };
  }

  return { collect: collect, run: run };
})();
