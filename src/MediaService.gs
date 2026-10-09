/**
 * MediaService.gs
 * ============================================================================
 * Pustaka media — pandangan menyeluruh ke atas semua gambar yang telah
 * dimuat naik ke dalam sistem.
 *
 * Nota reka bentuk: modul ini TIDAK mencipta storan baharu. Ia membaca
 * sheet NEWS_IMAGES yang sedia ada dan menggabungkannya merentasi semua
 * artikel. Dengan cara itu, gambar hanya wujud di satu tempat — dilampirkan
 * pada berita — dan tiada risiko fail yatim yang tidak dimiliki sesiapa.
 *
 * Skop capaian mengikut peranan sama seperti berita:
 *   ADMIN  → semua gambar
 *   EDITOR → gambar bagi artikel yang boleh dilihatnya
 *   AUTHOR → gambar bagi artikel sendiri sahaja
 * ============================================================================
 */

var MediaService = (function () {

  /** Peta NewsID → maklumat ringkas artikel, dengan tapisan peranan */
  function accessibleNewsMap_(user) {
    var rows = SheetDB.findAll(CONFIG.SHEETS.NEWS);
    var cats = NewsService.categoryMap();
    var users = UserService.getUserMap();
    var map = {};

    rows.forEach(function (n) {
      var status = String(n.Status);
      var isOwner = String(n.AuthorID) === String(user.userId);

      var allowed;
      if (user.role === ROLES.ADMIN) allowed = true;
      else if (user.role === ROLES.EDITOR) {
        allowed = isOwner || EDITOR_VISIBLE_STATUSES.indexOf(status) !== -1;
      } else {
        allowed = isOwner;
      }
      if (!allowed) return;

      map[String(n.NewsID)] = {
        newsId: String(n.NewsID),
        title: String(n.Title),
        status: status,
        statusLabel: GlobalSettings.statusLabel(status),
        statusColor: GlobalSettings.statusColor(status),
        categoryId: String(n.CategoryID || ''),
        categoryName: cats[String(n.CategoryID)] || 'Umum',
        authorName: (users[String(n.AuthorID)] || {}).name || '—'
      };
    });

    return map;
  }

  function formatSize_(bytes) {
    if (!bytes) return '—';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(0) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  }

  /**
   * Senarai media dengan tapisan dan pagination.
   * @param {Object} filters { search, categoryId, newsId, featuredOnly, socialOnly }
   */
  function list(user, filters, page, pageSize) {
    Security.requirePermission(user, 'dashboard.view');
    filters = filters || {};

    var newsMap = accessibleNewsMap_(user);
    var rows = SheetDB.findAll(CONFIG.SHEETS.NEWS_IMAGES)
      .filter(function (img) { return !!newsMap[String(img.NewsID)]; });

    var items = rows.map(function (img) {
      var parent = newsMap[String(img.NewsID)];
      return {
        imageId: String(img.ImageID),
        fileId: String(img.FileID),
        fileName: String(img.FileName),
        caption: String(img.Caption || ''),
        altText: String(img.AltText || ''),
        sizeBytes: Number(img.SizeBytes || 0),
        sizeLabel: formatSize_(Number(img.SizeBytes || 0)),
        isFeatured: Utils.toBool(img.IsFeatured),
        isSelectedForSocial: Utils.toBool(img.IsSelectedForSocial),
        thumbUrl: DriveService.thumbnailUrl(String(img.FileID)),
        viewUrl: 'https://drive.google.com/file/d/' + String(img.FileID) + '/view',
        uploadedAt: Utils.formatDateTime(img.CreatedAt),
        uploadedAtRaw: img.CreatedAt ? new Date(img.CreatedAt).getTime() : 0,
        newsId: parent.newsId,
        newsTitle: parent.title,
        categoryId: parent.categoryId,
        categoryName: parent.categoryName,
        statusLabel: parent.statusLabel,
        statusColor: parent.statusColor,
        authorName: parent.authorName
      };
    });

    if (filters.search) {
      var q = String(filters.search).toLowerCase();
      items = items.filter(function (i) {
        return i.fileName.toLowerCase().indexOf(q) !== -1
          || i.caption.toLowerCase().indexOf(q) !== -1
          || i.newsTitle.toLowerCase().indexOf(q) !== -1;
      });
    }
    if (filters.categoryId) {
      items = items.filter(function (i) { return i.categoryId === String(filters.categoryId); });
    }
    if (filters.newsId) {
      items = items.filter(function (i) { return i.newsId === String(filters.newsId); });
    }
    if (filters.featuredOnly) {
      items = items.filter(function (i) { return i.isFeatured; });
    }
    if (filters.socialOnly) {
      items = items.filter(function (i) { return i.isSelectedForSocial; });
    }

    items = Utils.sortBy(items, 'uploadedAtRaw', true);

    var result = Utils.paginate(items, page, pageSize || 24);
    result.stats = {
      totalImages: items.length,
      totalSize: formatSize_(items.reduce(function (sum, i) { return sum + i.sizeBytes; }, 0)),
      featured: items.filter(function (i) { return i.isFeatured; }).length,
      forSocial: items.filter(function (i) { return i.isSelectedForSocial; }).length,
      linkedNews: Object.keys(items.reduce(function (acc, i) {
        acc[i.newsId] = true; return acc;
      }, {})).length
    };
    return result;
  }

  /** Senarai artikel yang mempunyai sekurang-kurangnya satu gambar — untuk penapis */
  function sources(user) {
    var newsMap = accessibleNewsMap_(user);
    var counts = {};

    SheetDB.findAll(CONFIG.SHEETS.NEWS_IMAGES).forEach(function (img) {
      var id = String(img.NewsID);
      if (!newsMap[id]) return;
      counts[id] = (counts[id] || 0) + 1;
    });

    return Object.keys(counts).map(function (id) {
      return { newsId: id, title: newsMap[id].title, count: counts[id] };
    }).sort(function (a, b) { return b.count - a.count; });
  }

  return { list: list, sources: sources };
})();