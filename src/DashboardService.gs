/**
 * DashboardService.gs
 * KPI, trend dan giliran tindakan mengikut peranan.
 * Semua had dan julat dibaca dari Global Settings.
 */

var DashboardService = (function () {

  function scopeRows_(user) {
    var rows = SheetDB.findAll(CONFIG.SHEETS.NEWS);
    if (user.role === ROLES.AUTHOR) {
      return rows.filter(function (n) { return String(n.AuthorID) === String(user.userId); });
    }
    if (user.role === ROLES.EDITOR) {
      return rows.filter(function (n) {
        return EDITOR_VISIBLE_STATUSES.indexOf(String(n.Status)) !== -1;
      });
    }
    return rows;
  }

  function countBy_(rows, statuses) {
    return rows.filter(function (n) { return statuses.indexOf(String(n.Status)) !== -1; }).length;
  }

  function kpi_(label, value, status, hint) {
    return {
      label: label,
      value: value,
      status: status || '',
      color: status ? GlobalSettings.statusColor(status) : GlobalSettings.get('PRIMARY_COLOR'),
      hint: hint || ''
    };
  }

  /** KPI berbeza mengikut peranan, seperti dinyatakan dalam spec */
  function buildKpis_(user, rows) {
    if (user.role === ROLES.ADMIN) {
      return [
        kpi_('Jumlah berita', rows.length, '', 'Semua rekod dalam sistem'),
        kpi_('Menunggu semakan Admin', countBy_(rows, ADMIN_QUEUE_STATUSES), STATUS.ADMIN_REVIEW, 'Perlu tindakan anda'),
        kpi_('Menunggu semakan Editor', countBy_(rows, [STATUS.EDITOR_REVIEW]), STATUS.EDITOR_REVIEW),
        kpi_('Perlu pembetulan', countBy_(rows, [STATUS.REVISION_REQUIRED]), STATUS.REVISION_REQUIRED),
        kpi_('Diterbitkan', countBy_(rows, [STATUS.PUBLISHED]), STATUS.PUBLISHED),
        kpi_('Ditolak', countBy_(rows, [STATUS.REJECTED]), STATUS.REJECTED)
      ];
    }
    if (user.role === ROLES.EDITOR) {
      return [
        kpi_('Menunggu semakan anda', countBy_(rows, [STATUS.EDITOR_REVIEW]), STATUS.EDITOR_REVIEW, 'Perlu tindakan anda'),
        kpi_('Diluluskan', countBy_(rows, [STATUS.APPROVED]), STATUS.APPROVED, 'Sedia untuk diterbitkan'),
        kpi_('Diterbitkan', countBy_(rows, [STATUS.PUBLISHED]), STATUS.PUBLISHED),
        kpi_('Ditolak', countBy_(rows, [STATUS.REJECTED]), STATUS.REJECTED),
        kpi_('Perlu pembetulan', countBy_(rows, [STATUS.REVISION_REQUIRED]), STATUS.REVISION_REQUIRED)
      ];
    }
    return [
      kpi_('Draf saya', countBy_(rows, [STATUS.DRAFT]), STATUS.DRAFT),
      kpi_('Dihantar', countBy_(rows, [STATUS.SUBMITTED, STATUS.RESUBMITTED]), STATUS.SUBMITTED),
      kpi_('Perlu pembetulan', countBy_(rows, [STATUS.REVISION_REQUIRED]), STATUS.REVISION_REQUIRED, 'Perlu tindakan anda'),
      kpi_('Semakan Admin', countBy_(rows, [STATUS.ADMIN_REVIEW]), STATUS.ADMIN_REVIEW),
      kpi_('Semakan Editor', countBy_(rows, [STATUS.EDITOR_REVIEW, STATUS.APPROVED]), STATUS.EDITOR_REVIEW),
      kpi_('Diterbitkan', countBy_(rows, [STATUS.PUBLISHED]), STATUS.PUBLISHED),
      kpi_('Ditolak', countBy_(rows, [STATUS.REJECTED]), STATUS.REJECTED)
    ];
  }

  /** Trend bulanan: dihantar lawan diterbitkan */
  function buildTrend_(rows) {
    var months = GlobalSettings.get('TREND_MONTHS');
    var buckets = [];
    var index = {};
    var cursor = new Date();
    cursor.setDate(1);

    for (var i = months - 1; i >= 0; i--) {
      var d = new Date(cursor.getFullYear(), cursor.getMonth() - i, 1);
      var key = Utils.monthKey(d);
      var bucket = {
        key: key,
        label: Utilities.formatDate(d, Utils.timezone(), 'MMM yy'),
        submitted: 0, published: 0
      };
      index[key] = bucket;
      buckets.push(bucket);
    }

    rows.forEach(function (n) {
      if (n.SubmittedAt) {
        var k1 = Utils.monthKey(n.SubmittedAt);
        if (index[k1]) index[k1].submitted++;
      }
      if (n.PublishedAt) {
        var k2 = Utils.monthKey(n.PublishedAt);
        if (index[k2]) index[k2].published++;
      }
    });

    return buckets;
  }

  /** Taburan mengikut status — untuk carta progres workflow */
  function buildStatusBreakdown_(rows) {
    var enabled = GlobalSettings.get('ENABLED_STATUSES');
    return enabled.map(function (s) {
      return {
        status: s,
        label: GlobalSettings.statusLabel(s),
        color: GlobalSettings.statusColor(s),
        count: countBy_(rows, [s])
      };
    }).filter(function (b) { return b.count > 0; });
  }

  /** Giliran tindakan: apa yang perlu dibuat oleh pengguna ini sekarang */
  function buildActionQueue_(user, rows, users, cats) {
    var statuses;
    if (user.role === ROLES.ADMIN) statuses = ADMIN_QUEUE_STATUSES;
    else if (user.role === ROLES.EDITOR) statuses = EDITOR_QUEUE_STATUSES;
    else statuses = [STATUS.REVISION_REQUIRED, STATUS.DRAFT];

    var queue = rows.filter(function (n) { return statuses.indexOf(String(n.Status)) !== -1; });
    queue = Utils.sortBy(queue, 'UpdatedAt', false);

    return queue.slice(0, GlobalSettings.get('RECENT_LIMIT'))
      .map(function (n) { return NewsService.toListDto(n, users, cats); });
  }

  function buildRecent_(rows, users, cats) {
    var sorted = Utils.sortBy(rows, 'UpdatedAt', true);
    return sorted.slice(0, GlobalSettings.get('RECENT_LIMIT'))
      .map(function (n) { return NewsService.toListDto(n, users, cats); });
  }

  /** Data papan pemuka lengkap bagi pengguna semasa */
  function getDashboard(user, filters) {
    Security.requirePermission(user, 'dashboard.view');
    filters = filters || {};

    var rows = scopeRows_(user);

    if (filters.dateFrom) {
      var from = new Date(filters.dateFrom);
      rows = rows.filter(function (n) { return new Date(n.CreatedAt) >= from; });
    }
    if (filters.dateTo) {
      var to = new Date(filters.dateTo); to.setHours(23, 59, 59, 999);
      rows = rows.filter(function (n) { return new Date(n.CreatedAt) <= to; });
    }
    if (filters.categoryId) {
      rows = rows.filter(function (n) { return String(n.CategoryID) === String(filters.categoryId); });
    }

    var users = UserService.getUserMap();
    var cats = NewsService.categoryMap();
    var kpis = buildKpis_(user, rows).slice(0, GlobalSettings.get('KPI_LIMIT'));

    return {
      role: user.role,
      generatedAt: Utils.formatDateTime(Utils.now()),
      kpis: kpis,
      trend: buildTrend_(rows),
      statusBreakdown: buildStatusBreakdown_(rows),
      actionQueue: buildActionQueue_(user, rows, users, cats),
      recent: buildRecent_(rows, users, cats),
      activity: (user.role === ROLES.ADMIN && GlobalSettings.get('FEATURE_AUDIT_UI'))
        ? AuditService.list({}, 1, GlobalSettings.get('RECENT_LIMIT')).items : [],
      unreadNotifications: NotificationService.unreadCount(user.userId)
    };
  }

  return { getDashboard: getDashboard };
})();