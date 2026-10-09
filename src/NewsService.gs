/**
 * NewsService.gs
 * CRUD artikel, versioning dan pertanyaan senarai.
 * Semua semakan kebenaran dibuat di sini (server-side), bukan di frontend.
 */

var NewsService = (function () {

  function categoryMap() {
    var map = {};
    SheetDB.findAll(CONFIG.SHEETS.CATEGORIES).forEach(function (c) {
      map[String(c.CategoryID)] = String(c.CategoryName);
    });
    return map;
  }

  function toListDto(n, users, cats) {
    var author = users[String(n.AuthorID)];
    return {
      newsId: String(n.NewsID),
      title: String(n.Title),
      slug: String(n.Slug),
      categoryId: String(n.CategoryID || ''),
      categoryName: cats[String(n.CategoryID)] || '—',
      authorId: String(n.AuthorID),
      authorName: (author && author.name) || '—',
      summary: Utils.truncate(String(n.Summary || ''), 180),
      featuredImageUrl: String(n.FeaturedImageURL || ''),
      status: String(n.Status),
      statusLabel: GlobalSettings.statusLabel(String(n.Status)),
      statusColor: GlobalSettings.statusColor(String(n.Status)),
      currentVersion: Number(n.CurrentVersion || 1),
      eventDate: n.EventDate ? Utils.formatDate(n.EventDate) : '',
      submittedAt: n.SubmittedAt ? Utils.formatDateTime(n.SubmittedAt) : '',
      publishedAt: n.PublishedAt ? Utils.formatDateTime(n.PublishedAt) : '',
      updatedAt: Utils.formatDateTime(n.UpdatedAt),
      updatedAtRaw: n.UpdatedAt ? new Date(n.UpdatedAt).getTime() : 0,

      /*
       * Penunjuk kesiapan dwibahasa untuk senarai Admin: BM ✓  EN —
       * Dikira daripada baris mentah, bukan daripada DTO, kerana DTO
       * hanya memegang satu bahasa.
       */
      translation: (typeof LanguageService !== 'undefined')
        ? LanguageService.completeness(n)
        : { bm: true, en: false, label: '' }
    };
  }

  function getRaw(newsId) {
    var n = SheetDB.findOneBy(CONFIG.SHEETS.NEWS, 'NewsID', newsId);
    if (!n) throw Utils.appError('NOT_FOUND', 'Berita tidak dijumpai.');
    return n;
  }

  /**
   * Senarai berita mengikut skop peranan.
   * AUTHOR → artikel sendiri sahaja
   * ADMIN  → semua
   * EDITOR → status yang berkaitan sahaja (akses terhad)
   */
  function list(user, filters, page, pageSize) {
    filters = filters || {};
    var users = UserService.getUserMap();
    var cats = categoryMap();
    var rows = SheetDB.findAll(CONFIG.SHEETS.NEWS);

    if (user.role === ROLES.AUTHOR) {
      rows = rows.filter(function (n) { return String(n.AuthorID) === String(user.userId); });
    } else if (user.role === ROLES.EDITOR) {
      rows = rows.filter(function (n) {
        return EDITOR_VISIBLE_STATUSES.indexOf(String(n.Status)) !== -1;
      });
    }

    if (filters.scope === 'mine') {
      rows = rows.filter(function (n) { return String(n.AuthorID) === String(user.userId); });
    }
    if (filters.scope === 'queue') {
      var queue = user.role === ROLES.ADMIN ? ADMIN_QUEUE_STATUSES
        : (user.role === ROLES.EDITOR ? EDITOR_QUEUE_STATUSES : []);
      rows = rows.filter(function (n) { return queue.indexOf(String(n.Status)) !== -1; });
    }
    if (filters.status) {
      var wanted = String(filters.status).split(',');
      rows = rows.filter(function (n) { return wanted.indexOf(String(n.Status)) !== -1; });
    }
    if (filters.categoryId) {
      rows = rows.filter(function (n) { return String(n.CategoryID) === String(filters.categoryId); });
    }
    if (filters.authorId) {
      rows = rows.filter(function (n) { return String(n.AuthorID) === String(filters.authorId); });
    }
    if (filters.dateFrom) {
      var from = new Date(filters.dateFrom);
      rows = rows.filter(function (n) { return new Date(n.CreatedAt) >= from; });
    }
    if (filters.dateTo) {
      var to = new Date(filters.dateTo); to.setHours(23, 59, 59, 999);
      rows = rows.filter(function (n) { return new Date(n.CreatedAt) <= to; });
    }

    /*
     * Penapis kesiapan terjemahan: all | bm | en | incomplete
     * Digunakan oleh senarai Admin untuk menjejak kerja terjemahan.
     */
    if (filters.translation && filters.translation !== 'all'
        && typeof LanguageService !== 'undefined') {
      rows = LanguageService.filterByTranslation(rows, filters.translation);
    }

    /*
     * Carian merentas KEDUA-DUA bahasa dan merentas badan berita.
     *
     * Versi sebelum ini hanya memeriksa Title dan Summary dalam BM, jadi
     * padanan dalam kandungan penuh atau dalam versi English terlepas.
     * NewsID kekal boleh dicari kerana staf kerap merujuk berita melalui
     * IDnya dalam e-mel dan perbualan.
     */
    if (filters.search) {
      var q = String(filters.search).toLowerCase();
      rows = rows.filter(function (n) {
        if (String(n.NewsID).toLowerCase().indexOf(q) !== -1) return true;
        if (typeof LanguageService !== 'undefined') {
          return LanguageService.searchHaystack(n).indexOf(q) !== -1;
        }
        return String(n.Title).toLowerCase().indexOf(q) !== -1
          || String(n.Summary).toLowerCase().indexOf(q) !== -1;
      });
    }

    var dtos = rows.map(function (n) { return toListDto(n, users, cats); });
    dtos = Utils.sortBy(dtos, filters.sortBy || 'updatedAtRaw',
      filters.sortDesc === false ? false : true);

    return Utils.paginate(dtos, page, pageSize || GlobalSettings.get('PAGE_SIZE'));
  }

  /** Butiran penuh satu artikel, termasuk sejarah versi dan semakan */
  function getDetail(user, newsId) {
    var n = getRaw(newsId);
    Security.requireViewNews(user, n);

    var users = UserService.getUserMap();
    var cats = categoryMap();
    var base = toListDto(n, users, cats);

    // Dibersihkan semula semasa dibaca: kandungan lama mungkin disimpan
    // sebelum pembersih berasaskan token diperkenalkan (F1, Okt 2026).
    base.content = Security.sanitizeHtml(n.Content);
    base.summary = String(n.Summary || '');
    base.tags = String(n.Tags || '');
    base.rejectReason = String(n.RejectReason || '');
    base.attachmentFolderId = String(n.AttachmentFolderID || '');
    base.adminReviewedBy = (users[String(n.AdminReviewedBy)] || {}).name || '';
    base.adminReviewedAt = n.AdminReviewedAt ? Utils.formatDateTime(n.AdminReviewedAt) : '';
    base.editorReviewedBy = (users[String(n.EditorReviewedBy)] || {}).name || '';
    base.editorReviewedAt = n.EditorReviewedAt ? Utils.formatDateTime(n.EditorReviewedAt) : '';
    base.createdAt = Utils.formatDateTime(n.CreatedAt);

    /*
     * Medan English dihantar MENTAH kepada borang penyunting, bukan melalui
     * LanguageService.
     *
     * LanguageService meratakan rekod kepada satu bahasa dengan fallback —
     * betul untuk paparan pembaca, salah untuk penyunting. Jika ContentEn
     * kosong dan diratakan, borang akan memaparkan teks BM dalam tab EN,
     * dan simpanan berikutnya akan menyalin teks BM itu ke dalam ContentEn
     * sebagai "terjemahan". Penyunting mesti melihat medan yang sebenarnya
     * kosong sebagai kosong.
     */
    base.titleEn = String(n.TitleEn || '');
    base.summaryEn = String(n.SummaryEn || '');
    base.contentEn = Security.sanitizeHtml(n.ContentEn);
    base.seoTitle = String(n.SeoTitle || '');
    base.seoTitleEn = String(n.SeoTitleEn || '');
    base.seoDescription = String(n.SeoDescription || '');
    base.seoDescriptionEn = String(n.SeoDescriptionEn || '');
    base.seoKeywords = String(n.SeoKeywords || '');
    base.seoKeywordsEn = String(n.SeoKeywordsEn || '');

    base.canEdit = Security.canEditNews(user, n);
    base.availableActions = WorkflowService.getAvailableActions(user, n);
    base.versions = GlobalSettings.get('FEATURE_VERSIONING') ? getVersions(newsId, users) : [];
    base.reviews = ReviewService.getForNews(newsId, users);
    base.images = GlobalSettings.get('FEATURE_ATTACHMENTS') ? imagesForDetail_(newsId) : [];
    base.attachments = GlobalSettings.get('FEATURE_ATTACHMENTS') ? DriveService.listFiles(newsId, 'attachment') : [];
    base.timeline = AuditService.forEntity(newsId, 30);

    return base;
  }

  /**
   * Gambar untuk paparan butiran dan borang sunting.
   *
   * SUMBER: NEWS_IMAGES melalui ImageService — bukan senarai fail mentah
   * daripada folder Drive.
   *
   * Versi sebelum ini menggunakan DriveService.listFiles(), yang memulangkan
   * { fileId, name, mimeType, sizeBytes, viewUrl, previewUrl }. Galeri pula
   * membaca imageId, thumbUrl, fileName, sizeLabel dan caption — medan yang
   * hanya wujud dalam DTO ImageService. Akibatnya:
   *
   *   - thumbUrl tiada   → thumbnail rosak
   *   - imageId tiada    → setiap tindakan gambar (kapsyen, jadikan utama,
   *                        buang) menghantar ID kosong dan pelayan menjawab
   *                        "Gambar tidak dijumpai"
   *   - fileName tiada   → hanya pemisah "·" kelihatan
   *
   * Medan name dan previewUrl dikekalkan sebagai alias supaya mana-mana
   * paparan lain yang masih membaca bentuk DriveService tidak terjejas.
   * Hasilnya ialah gabungan lengkap kedua-dua bentuk — tiada medan hilang
   * bagi mana-mana pemanggil.
   */
  function imagesForDetail_(newsId) {
    return ImageService.listForNews(newsId).map(function (img) {
      img.name = img.fileName;
      img.previewUrl = img.thumbUrl;
      return img;
    });
  }

  function getVersions(newsId, users) {
    users = users || UserService.getUserMap();
    var rows = SheetDB.findWhere(CONFIG.SHEETS.NEWS_VERSIONS, function (v) {
      return String(v.NewsID) === String(newsId);
    });
    rows = Utils.sortBy(rows, 'VersionNumber', true);
    return rows.map(function (v) {
      return {
        versionId: String(v.VersionID),
        versionNumber: Number(v.VersionNumber),
        title: String(v.Title),
        summary: String(v.Summary || ''),
        content: Security.sanitizeHtml(v.Content),
        featuredImageUrl: String(v.FeaturedImageURL || ''),
        submittedBy: (users[String(v.SubmittedBy)] || {}).name || '—',
        submissionDate: Utils.formatDateTime(v.SubmissionDate),
        note: String(v.Note || '')
      };
    });
  }

  /** Simpan snapshot versi — revision TIDAK menimpa versi terdahulu */
  function createVersion(news, submittedBy, note) {
    if (!GlobalSettings.get('FEATURE_VERSIONING')) return null;
    var versionNumber = Number(news.CurrentVersion || 1);
    SheetDB.insert(CONFIG.SHEETS.NEWS_VERSIONS, {
      VersionID: Utils.versionId(),
      NewsID: String(news.NewsID),
      VersionNumber: versionNumber,
      Title: String(news.Title),
      Summary: String(news.Summary || ''),
      Content: String(news.Content || ''),
      FeaturedImageURL: String(news.FeaturedImageURL || ''),
      SubmittedBy: submittedBy,
      SubmissionDate: Utils.now(),
      Note: note || ''
    });
    return versionNumber;
  }

  /**
   * Membersihkan medan English daripada payload borang.
   *
   * Dikongsi oleh create() dan update(). Medan yang TIDAK hadir dalam
   * payload dilangkau sepenuhnya — bukan ditulis sebagai kosong. Ini
   * penting kerana borang lama (dan mana-mana pemanggil yang belum
   * dikemas kini) tidak menghantar medan ini langsung, dan menulisnya
   * secara membuta akan memadamkan terjemahan yang sudah ditaip.
   *
   * Ia corak kegagalan yang sama yang memadamkan FeaturedImageURL.
   */
  function bilingualPatch_(data) {
    var patch = {};
    var maxTitle = GlobalSettings.get('MAX_TITLE_LENGTH');
    var maxSummary = GlobalSettings.get('MAX_SUMMARY_LENGTH');
    var maxContent = GlobalSettings.get('MAX_CONTENT_LENGTH');
    var rich = GlobalSettings.get('ALLOW_RICH_TEXT');

    if (data.titleEn !== undefined) {
      patch.TitleEn = Security.sanitizeText(data.titleEn, maxTitle);
    }
    if (data.summaryEn !== undefined) {
      patch.SummaryEn = Security.sanitizeText(data.summaryEn, maxSummary);
    }
    if (data.contentEn !== undefined) {
      patch.ContentEn = rich ? Security.sanitizeHtml(data.contentEn)
                             : Security.sanitizeText(data.contentEn, maxContent);
    }

    // Metadata SEO — disuap kepada WordPress semasa penerbitan. Ia tiada
    // kesan pada indeks web app Apps Script, yang tidak boleh diindeks.
    [['seoTitle', 'SeoTitle', 200], ['seoTitleEn', 'SeoTitleEn', 200],
     ['seoDescription', 'SeoDescription', 400], ['seoDescriptionEn', 'SeoDescriptionEn', 400],
     ['seoKeywords', 'SeoKeywords', 300], ['seoKeywordsEn', 'SeoKeywordsEn', 300]
    ].forEach(function (f) {
      if (data[f[0]] !== undefined) {
        patch[f[1]] = Security.sanitizeText(data[f[0]], f[2]);
      }
    });

    return patch;
  }

  /** Salin kunci satu objek ke dalam objek lain */
  function merge_(target, source) {
    Object.keys(source).forEach(function (k) { target[k] = source[k]; });
    return target;
  }

  /** Cipta artikel baharu (status DRAFT) */
  function create(user, data) {
    Security.requirePermission(user, 'news.create');
    Validation.validateNews(data, false);

    return Utils.withLock(function () {
      var id = Utils.newsId();
      var title = Security.sanitizeText(data.title, GlobalSettings.get('MAX_TITLE_LENGTH'));
      var record = {
        NewsID: id,
        Title: title,
        Slug: Utils.slugify(title),
        CategoryID: Security.sanitizeText(data.categoryId, 30),
        AuthorID: user.userId,
        Summary: Security.sanitizeText(data.summary, GlobalSettings.get('MAX_SUMMARY_LENGTH')),
        Content: GlobalSettings.get('ALLOW_RICH_TEXT')
          ? Security.sanitizeHtml(data.content)
          : Security.sanitizeText(data.content, GlobalSettings.get('MAX_CONTENT_LENGTH')),
        FeaturedImageURL: Security.sanitizeText(data.featuredImageUrl, 500),
        FeaturedImageID: Security.sanitizeText(data.featuredImageId, 120),
        AttachmentFolderID: '',
        Status: STATUS.DRAFT,
        CurrentVersion: 1,
        Tags: Security.sanitizeText(data.tags, 300),
        EventDate: data.eventDate ? new Date(data.eventDate) : '',
        SubmittedAt: '', AdminReviewedBy: '', AdminReviewedAt: '',
        EditorReviewedBy: '', EditorReviewedAt: '', PublishedAt: '', RejectReason: '',
        CreatedAt: Utils.now(),
        UpdatedAt: Utils.now()
      };

      /*
       * Medan English pada penciptaan.
       *
       * Menulis kosong di sini selamat — tiada apa-apa yang boleh dipadam
       * pada rekod yang baru wujud. Ini berbeza daripada update(), di mana
       * penulisan membuta memusnahkan data sedia ada.
       */
      merge_(record, bilingualPatch_(data));

      SheetDB.insert(CONFIG.SHEETS.NEWS, record);

      AuditService.log(user.userId, AUDIT_ACTION.CREATE_NEWS, 'NEWS', id, '', STATUS.DRAFT,
        'Cipta draf: ' + title);

      return { newsId: id, status: STATUS.DRAFT };
    });
  }

  /** Kemas kini artikel (hanya status boleh sunting) */
  function update(user, newsId, data) {
    Validation.validateNews(data, false);

    return Utils.withLock(function () {
      var n = getRaw(newsId);
      Security.requireEditNews(user, n);

      var title = Security.sanitizeText(data.title, GlobalSettings.get('MAX_TITLE_LENGTH'));
      var patch = {
        Title: title,
        Slug: Utils.slugify(title),
        CategoryID: Security.sanitizeText(data.categoryId, 30),
        Summary: Security.sanitizeText(data.summary, GlobalSettings.get('MAX_SUMMARY_LENGTH')),
        Content: GlobalSettings.get('ALLOW_RICH_TEXT')
          ? Security.sanitizeHtml(data.content)
          : Security.sanitizeText(data.content, GlobalSettings.get('MAX_CONTENT_LENGTH')),
        Tags: Security.sanitizeText(data.tags, 300),
        EventDate: data.eventDate ? new Date(data.eventDate) : '',
        UpdatedAt: Utils.now()
      };

      /*
       * Gambar utama TIDAK ditulis secara membuta di sini.
       *
       * Pemilikannya ada pada ImageService: ia menetapkan FeaturedImageURL
       * semasa muat naik dan semasa setFeatured(). Borang berita pula tidak
       * menjejaki medan itu, jadi ia tidak hadir dalam payload biasa.
       *
       * Versi sebelum ini menulis Security.sanitizeText(data.featuredImageUrl)
       * tanpa syarat. Apabila medan itu tiada, sanitizeText(undefined)
       * memulangkan rentetan kosong dan lajur itu DIPADAM — jadi gambar
       * utama hilang setiap kali Author menyimpan selepas memuat naik
       * gambar.
       *
       * Semakan !== undefined membezakan "borang tidak menyentuh medan ini"
       * daripada "pengguna sengaja mengosongkannya". Rentetan kosong yang
       * dihantar secara eksplisit masih dihormati.
       */
      if (data.featuredImageUrl !== undefined) {
        patch.FeaturedImageURL = Security.sanitizeText(data.featuredImageUrl, 500);
      }
      if (data.featuredImageId !== undefined) {
        patch.FeaturedImageID = Security.sanitizeText(data.featuredImageId, 120);
      }

      // Medan English mengikut peraturan yang sama: hadir sahaja yang ditulis.
      merge_(patch, bilingualPatch_(data));

      SheetDB.updateRow(CONFIG.SHEETS.NEWS, n._row, patch);

      AuditService.log(user.userId, AUDIT_ACTION.UPDATE_NEWS, 'NEWS', newsId,
        String(n.Status), String(n.Status), 'Kemas kini kandungan');

      return { newsId: newsId };
    });
  }

  /** Padam draf sendiri sahaja */
  function remove(user, newsId) {
    return Utils.withLock(function () {
      var n = getRaw(newsId);
      var isOwner = String(n.AuthorID) === String(user.userId);
      var isDraft = String(n.Status) === STATUS.DRAFT;

      if (!isDraft) throw Utils.appError('FORBIDDEN', 'Hanya draf boleh dipadam.');
      if (!isOwner && user.role !== ROLES.ADMIN)
        throw Utils.appError('FORBIDDEN', 'Anda hanya boleh memadam draf sendiri.');
      if (isOwner && user.role === ROLES.AUTHOR && !GlobalSettings.get('ALLOW_AUTHOR_DELETE_DRAFT'))
        throw Utils.appError('FORBIDDEN', 'Pemadaman draf tidak dibenarkan oleh tetapan sistem.');

      SheetDB.deleteBy(CONFIG.SHEETS.NEWS, 'NewsID', newsId);
      AuditService.log(user.userId, AUDIT_ACTION.DELETE_NEWS, 'NEWS', newsId,
        STATUS.DRAFT, '', 'Padam draf: ' + n.Title);
      return true;
    });
  }

  /** Tetapkan gambar utama selepas muat naik */
  function setFeaturedImage(user, newsId, fileId, url) {
    var n = getRaw(newsId);
    Security.requireEditNews(user, n);

    /*
     * URL kosong dengan FileID yang sah bermakna pemanggil kehilangan
     * medan previewUrl. Membinanya semula di sini lebih baik daripada
     * menyimpan lajur kosong yang hanya disedari apabila seseorang melihat
     * portal dan mendapati hero tiada gambar.
     */
    var safeUrl = String(url || '').trim();
    if (!safeUrl && fileId) safeUrl = DriveService.thumbnailUrl(fileId);

    SheetDB.updateRow(CONFIG.SHEETS.NEWS, n._row, {
      FeaturedImageID: Security.sanitizeText(fileId, 120),
      FeaturedImageURL: Security.sanitizeText(safeUrl, 500),
      UpdatedAt: Utils.now()
    });
    return true;
  }

  /* ---------------- Kategori ---------------- */

  function listCategories(activeOnly) {
    var rows = SheetDB.findAll(CONFIG.SHEETS.CATEGORIES);
    if (activeOnly) rows = rows.filter(function (c) { return String(c.Status) === 'ACTIVE'; });
    return Utils.sortBy(rows, 'CategoryName', false).map(function (c) {
      return {
        categoryId: String(c.CategoryID),
        categoryName: String(c.CategoryName),
        categoryNameEn: String(c.CategoryNameEn || ''),
        description: String(c.Description || ''),
        descriptionEn: String(c.DescriptionEn || ''),
        status: String(c.Status)
      };
    });
  }

  function saveCategory(user, data) {
    Security.requirePermission(user, 'category.manage');
    Validation.validateCategory(data);

    return Utils.withLock(function () {
      var name = Security.sanitizeText(data.categoryName, 80);

      // Medan English mengikut peraturan yang sama seperti berita: hanya
      // yang hadir dalam payload ditulis.
      var bilingual = {};
      if (data.categoryNameEn !== undefined) {
        bilingual.CategoryNameEn = Security.sanitizeText(data.categoryNameEn, 80);
      }
      if (data.descriptionEn !== undefined) {
        bilingual.DescriptionEn = Security.sanitizeText(data.descriptionEn, 300);
      }

      if (data.categoryId) {
        var existing = SheetDB.findOneBy(CONFIG.SHEETS.CATEGORIES, 'CategoryID', data.categoryId);
        if (!existing) throw Utils.appError('NOT_FOUND', 'Kategori tidak dijumpai.');

        var patch = {
          CategoryName: name,
          Description: Security.sanitizeText(data.description, 300),
          Status: String(data.status || 'ACTIVE').toUpperCase(),
          UpdatedAt: Utils.now()
        };
        merge_(patch, bilingual);

        SheetDB.updateRow(CONFIG.SHEETS.CATEGORIES, existing._row, patch);
        AuditService.log(user.userId, AUDIT_ACTION.UPDATE_CATEGORY, 'CATEGORY',
          data.categoryId, '', '', 'Kemas kini kategori: ' + name);
        return { categoryId: data.categoryId };
      }

      var id = 'CAT-' + Utilities.getUuid().substring(0, 8).toUpperCase();
      var record = {
        CategoryID: id,
        CategoryName: name,
        Description: Security.sanitizeText(data.description, 300),
        Status: 'ACTIVE',
        CreatedAt: Utils.now(),
        UpdatedAt: Utils.now()
      };
      merge_(record, bilingual);

      SheetDB.insert(CONFIG.SHEETS.CATEGORIES, record);
      AuditService.log(user.userId, AUDIT_ACTION.CREATE_CATEGORY, 'CATEGORY', id, '', '',
        'Kategori baharu: ' + name);
      return { categoryId: id };
    });
  }

  return {
    getRaw: getRaw,
    categoryMap: categoryMap,
    toListDto: toListDto,
    list: list,
    getDetail: getDetail,
    getVersions: getVersions,
    createVersion: createVersion,
    create: create,
    update: update,
    remove: remove,
    setFeaturedImage: setFeaturedImage,
    listCategories: listCategories,
    saveCategory: saveCategory
  };
})();