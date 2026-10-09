/**
 * ReportService.gs
 * Laporan ringkasan dan eksport CSV.
 */

var ReportService = (function () {

  function inRange_(value, from, to) {
    if (!value) return false;
    var d = new Date(value);
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  }

  function parseRange_(filters) {
    var from = filters.dateFrom ? new Date(filters.dateFrom) : null;
    var to = null;
    if (filters.dateTo) { to = new Date(filters.dateTo); to.setHours(23, 59, 59, 999); }
    return { from: from, to: to };
  }

  /** Laporan ringkasan penerbitan */
  function summary(user, filters) {
    Security.requirePermission(user, 'report.export');
    filters = filters || {};
    var range = parseRange_(filters);

    var rows = SheetDB.findAll(CONFIG.SHEETS.NEWS);
    if (user.role === ROLES.EDITOR) {
      rows = rows.filter(function (n) {
        return EDITOR_VISIBLE_STATUSES.indexOf(String(n.Status)) !== -1;
      });
    }
    if (range.from || range.to) {
      rows = rows.filter(function (n) { return inRange_(n.CreatedAt, range.from, range.to); });
    }

    var cats = NewsService.categoryMap();
    var users = UserService.getUserMap();

    var byCategory = {}, byAuthor = {}, byStatus = {};
    var publishedDurations = [];

    rows.forEach(function (n) {
      var cat = cats[String(n.CategoryID)] || 'Tanpa kategori';
      byCategory[cat] = (byCategory[cat] || 0) + 1;

      var author = (users[String(n.AuthorID)] || {}).name || '—';
      if (!byAuthor[author]) byAuthor[author] = { total: 0, published: 0, rejected: 0 };
      byAuthor[author].total++;
      if (String(n.Status) === STATUS.PUBLISHED) byAuthor[author].published++;
      if (String(n.Status) === STATUS.REJECTED) byAuthor[author].rejected++;

      var st = GlobalSettings.statusLabel(String(n.Status));
      byStatus[st] = (byStatus[st] || 0) + 1;

      if (n.SubmittedAt && n.PublishedAt) {
        var days = (new Date(n.PublishedAt) - new Date(n.SubmittedAt)) / 86400000;
        if (days >= 0) publishedDurations.push(days);
      }
    });

    var avgDays = publishedDurations.length
      ? (publishedDurations.reduce(function (a, b) { return a + b; }, 0) / publishedDurations.length)
      : 0;

    return {
      totalNews: rows.length,
      published: rows.filter(function (n) { return String(n.Status) === STATUS.PUBLISHED; }).length,
      rejected: rows.filter(function (n) { return String(n.Status) === STATUS.REJECTED; }).length,
      pending: rows.filter(function (n) {
        return [STATUS.SUBMITTED, STATUS.RESUBMITTED, STATUS.ADMIN_REVIEW,
          STATUS.EDITOR_REVIEW, STATUS.APPROVED].indexOf(String(n.Status)) !== -1;
      }).length,
      avgDaysToPublish: Math.round(avgDays * 10) / 10,
      byStatus: Object.keys(byStatus).map(function (k) { return { label: k, count: byStatus[k] }; }),
      byCategory: Object.keys(byCategory).map(function (k) { return { label: k, count: byCategory[k] }; })
        .sort(function (a, b) { return b.count - a.count; }),
      byAuthor: Object.keys(byAuthor).map(function (k) {
        return { label: k, total: byAuthor[k].total, published: byAuthor[k].published,
          rejected: byAuthor[k].rejected };
      }).sort(function (a, b) { return b.total - a.total; }),
      reviewerStats: ReviewService.statsByReviewer(filters.dateFrom, filters.dateTo)
    };
  }

  function csvEscape_(value) {
    var s = String(value === null || value === undefined ? '' : value);
    if (/^[=+\-@]/.test(s)) s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
  }

  /** Eksport senarai berita sebagai CSV (dipulangkan sebagai teks kepada client) */
  function exportNewsCsv(user, filters) {
    Security.requirePermission(user, 'report.export');
    var page = NewsService.list(user, filters || {}, 1, CONFIG.TECHNICAL.MAX_QUERY_ROWS);

    var headers = ['ID Berita', 'Tajuk', 'Kategori', 'Penulis', 'Status',
      'Versi', 'Tarikh Hantar', 'Tarikh Terbit', 'Kemas Kini'];
    var lines = [headers.map(csvEscape_).join(',')];

    page.items.forEach(function (n) {
      lines.push([n.newsId, n.title, n.categoryName, n.authorName, n.statusLabel,
        n.currentVersion, n.submittedAt, n.publishedAt, n.updatedAt].map(csvEscape_).join(','));
    });

    return {
      filename: 'FKM-News-' + Utilities.formatDate(new Date(), Utils.timezone(), 'yyyyMMdd-HHmm') + '.csv',
      // BOM supaya Excel membaca UTF-8 dengan betul
      content: '\uFEFF' + lines.join('\r\n'),
      rowCount: page.items.length
    };
  }

  return { summary: summary, exportNewsCsv: exportNewsCsv };
})();