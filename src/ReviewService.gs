/**
 * ReviewService.gs
 * Rekod keputusan semakan Admin dan Editor.
 * Dipanggil oleh WorkflowService selepas setiap transition semakan.
 */

var ReviewService = (function () {

  function record(data) {
    var id = Utils.reviewId();
    SheetDB.insert(CONFIG.SHEETS.REVIEWS, {
      ReviewID: id,
      NewsID: String(data.newsId),
      ReviewerID: String(data.reviewerId),
      ReviewerRole: String(data.reviewerRole),
      ReviewStage: String(data.reviewStage),
      Decision: String(data.decision),
      Comments: String(data.comments || ''),
      CreatedAt: Utils.now()
    });
    return id;
  }

  /** Sejarah semakan bagi satu artikel (terkini di atas) */
  function getForNews(newsId, users) {
    users = users || UserService.getUserMap();
    var rows = SheetDB.findWhere(CONFIG.SHEETS.REVIEWS, function (r) {
      return String(r.NewsID) === String(newsId);
    });
    rows = Utils.sortBy(rows, 'CreatedAt', true);
    return rows.map(function (r) {
      return {
        reviewId: String(r.ReviewID),
        reviewerName: (users[String(r.ReviewerID)] || {}).name || '—',
        reviewerRole: String(r.ReviewerRole),
        reviewStage: String(r.ReviewStage),
        decision: String(r.Decision),
        decisionLabel: decisionLabel(String(r.Decision)),
        comments: String(r.Comments || ''),
        createdAt: Utils.formatDateTime(r.CreatedAt)
      };
    });
  }

  function decisionLabel(decision) {
    var map = {
      FORWARD_TO_EDITOR: 'Diteruskan kepada Editor',
      REQUEST_REVISION: 'Pembetulan diminta',
      REJECT: 'Ditolak',
      APPROVE: 'Diluluskan',
      PUBLISH: 'Diterbitkan'
    };
    return map[decision] || decision;
  }

  /** Statistik semakan untuk laporan */
  function statsByReviewer(dateFrom, dateTo) {
    var users = UserService.getUserMap();
    var rows = SheetDB.findAll(CONFIG.SHEETS.REVIEWS);

    if (dateFrom) {
      var from = new Date(dateFrom);
      rows = rows.filter(function (r) { return new Date(r.CreatedAt) >= from; });
    }
    if (dateTo) {
      var to = new Date(dateTo); to.setHours(23, 59, 59, 999);
      rows = rows.filter(function (r) { return new Date(r.CreatedAt) <= to; });
    }

    var agg = {};
    rows.forEach(function (r) {
      var key = String(r.ReviewerID);
      if (!agg[key]) {
        agg[key] = {
          reviewerName: (users[key] || {}).name || key,
          role: String(r.ReviewerRole),
          total: 0, forwarded: 0, revisions: 0, rejected: 0, approved: 0, published: 0
        };
      }
      agg[key].total++;
      switch (String(r.Decision)) {
        case 'FORWARD_TO_EDITOR': agg[key].forwarded++; break;
        case 'REQUEST_REVISION': agg[key].revisions++; break;
        case 'REJECT': agg[key].rejected++; break;
        case 'APPROVE': agg[key].approved++; break;
        case 'PUBLISH': agg[key].published++; break;
      }
    });

    return Object.keys(agg).map(function (k) { return agg[k]; })
      .sort(function (a, b) { return b.total - a.total; });
  }

  return {
    record: record,
    getForNews: getForNews,
    decisionLabel: decisionLabel,
    statsByReviewer: statsByReviewer
  };
})();