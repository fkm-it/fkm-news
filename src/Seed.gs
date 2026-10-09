/**
 * Seed.gs
 * ============================================================================
 * Penjana data ujian.
 *
 * PENTING: fail ini menulis rekod SEBENAR ke dalam pangkalan data — ia bukan
 * simulasi. Setiap rekod ditanda dengan penanda DEMO_TAG supaya boleh dibuang
 * sepenuhnya melalui removeDemoData(). Jangan jalankan pada sistem produksi
 * yang sudah mengandungi berita sebenar.
 *
 * Jalankan seedDemoData() dari editor Apps Script.
 * ============================================================================
 */

var DEMO_TAG = 'DEMO';

/**
 * Jana set berita merentasi setiap peringkat aliran kerja, supaya papan
 * pemuka, giliran semakan, carta trend dan portal semuanya mempunyai data.
 *
 * @param {Object} options { includeUsers: boolean }
 */
function seedDemoData(options) {
  requireOwnerOrTrigger_('seedDemoData', arguments[0]);
  options = options || {};

  if (!CONFIG.isInstalled()) {
    throw new Error('Jalankan setupSystem() terlebih dahulu.');
  }

  var log = [];
  var now = new Date();

  /* ---------------- 1. Pengguna ujian ---------------- */

  if (options.includeUsers !== false) {
    var demoUsers = [
      { email: 'demo.author@utm.my', name: 'Nurul Ain (Demo)', role: ROLES.AUTHOR,
        dept: 'Jabatan Aeronautik', pos: 'Pensyarah Kanan' },
      { email: 'demo.editor@utm.my', name: 'Hafiz Rahman (Demo)', role: ROLES.EDITOR,
        dept: 'Pejabat Dekan', pos: 'Editor Berita' },
      { email: 'demo.author2@utm.my', name: 'Siti Aisyah (Demo)', role: ROLES.AUTHOR,
        dept: 'Jabatan Termo-Bendalir', pos: 'Pegawai Penyelidik' }
    ];

    demoUsers.forEach(function (u) {
      if (SheetDB.findOneBy(CONFIG.SHEETS.USERS, 'Email', u.email)) return;
      SheetDB.insert(CONFIG.SHEETS.USERS, {
        UserID: Utils.userId(), Email: u.email, Name: u.name, Role: u.role,
        Department: u.dept, Position: u.pos, Status: USER_STATUS.ACTIVE,
        CreatedAt: now, UpdatedAt: now, LastLogin: ''
      });
      log.push('Pengguna: ' + u.name);
    });
  }

  var users = SheetDB.findAll(CONFIG.SHEETS.USERS);
  var authors = users.filter(function (u) {
    return String(u.Role).toUpperCase() === ROLES.AUTHOR;
  });
  var admins = users.filter(function (u) {
    return String(u.Role).toUpperCase() === ROLES.ADMIN;
  });
  var editors = users.filter(function (u) {
    return String(u.Role).toUpperCase() === ROLES.EDITOR;
  });

  if (!authors.length) authors = admins;
  if (!authors.length) throw new Error('Tiada pengguna. Jalankan setupSystem() dahulu.');

  var adminId = admins.length ? String(admins[0].UserID) : String(authors[0].UserID);
  var editorId = editors.length ? String(editors[0].UserID) : adminId;

  var categories = SheetDB.findAll(CONFIG.SHEETS.CATEGORIES);
  if (!categories.length) throw new Error('Tiada kategori. Jalankan setupSystem() dahulu.');

  function catId(name) {
    var found = categories.filter(function (c) {
      return String(c.CategoryName).toLowerCase().indexOf(name.toLowerCase()) !== -1;
    })[0];
    return found ? String(found.CategoryID) : String(categories[0].CategoryID);
  }

  function daysAgo(n) {
    var d = new Date();
    d.setDate(d.getDate() - n);
    return d;
  }

  function body(paragraphs) {
    return paragraphs.map(function (p) { return '<p>' + p + '</p>'; }).join('');
  }

  /* ---------------- 2. Berita merentasi setiap status ---------------- */

  var samples = [
    {
      title: 'FKM Lancar Program Inovasi Kesihatan Komuniti 2026',
      cat: 'Aktiviti', status: STATUS.PUBLISHED, published: 4, submitted: 9, views: 1240,
      summary: 'Fakulti Kejuruteraan Mekanikal melancarkan program saringan kesihatan percuma untuk komuniti sekitar Skudai.',
      content: body([
        'Fakulti Kejuruteraan Mekanikal (FKM), Universiti Teknologi Malaysia telah melancarkan Program Inovasi Kesihatan Komuniti 2026 pada 12 September lalu di Dewan Utama fakulti.',
        'Program ini menggabungkan kepakaran kejuruteraan bioperubatan dengan khidmat masyarakat, melibatkan saringan kesihatan percuma serta demonstrasi peranti bantuan mobiliti yang direka oleh pelajar tahun akhir.',
        'Dekan FKM menyatakan bahawa program ini akan diperluas kepada tiga daerah lain menjelang suku kedua tahun hadapan, dengan kerjasama Jabatan Kesihatan Negeri Johor.'
      ])
    },
    {
      title: 'Pelajar FKM Menang Tempat Pertama Pertandingan Robotik Kebangsaan',
      cat: 'Pencapaian', status: STATUS.PUBLISHED, published: 11, submitted: 15, views: 986,
      summary: 'Pasukan robotik FKM mengungguli 42 pasukan dari seluruh negara dalam kategori automasi industri.',
      content: body([
        'Pasukan robotik FKM yang dianggotai lima pelajar tahun tiga telah muncul juara dalam Pertandingan Robotik Kebangsaan 2026 yang berlangsung di Kuala Lumpur.',
        'Projek mereka, sebuah lengan robotik penyusun automatik dengan sistem penglihatan mesin, dinilai berdasarkan ketepatan, kelajuan dan kos pembinaan.',
        'Kejayaan ini melayakkan pasukan tersebut mewakili Malaysia ke peringkat serantau di Bangkok pada bulan November.'
      ])
    },
    {
      title: 'Naik Taraf Makmal Fabrikasi dan Reka Bentuk Berinovasi',
      cat: 'Industri', status: STATUS.PUBLISHED, published: 23, submitted: 28, views: 1402,
      summary: 'Makmal fabrikasi FKM menerima peralatan pencetakan tiga dimensi baharu hasil kerjasama industri.',
      content: body([
        'Makmal Fabrikasi FKM kini dilengkapi enam unit pencetak tiga dimensi industri serta mesin pemotong laser berketepatan tinggi.',
        'Naik taraf ini membolehkan pelajar menghasilkan prototaip dalam masa yang jauh lebih singkat berbanding sebelum ini.',
        'Sesi latihan pengendalian peralatan akan dijalankan kepada semua pelajar tahun dua bermula minggu hadapan.'
      ])
    },
    {
      title: 'FKM Terima Lawatan Delegasi Universiti Luar Negara',
      cat: 'Industri', status: STATUS.PUBLISHED, published: 34, submitted: 38, views: 754,
      summary: 'Delegasi seramai dua belas orang meninjau kemudahan penyelidikan dan membincangkan program pertukaran pelajar.',
      content: body([
        'FKM menerima kunjungan hormat delegasi dari sebuah universiti teknikal Jepun bagi membincangkan kerjasama penyelidikan dalam bidang bahan komposit.',
        'Perbincangan turut menyentuh kemungkinan program pertukaran pelajar dua hala bermula sesi akademik berikutnya.',
        'Satu memorandum persefahaman dijangka ditandatangani sebelum akhir tahun ini.'
      ])
    },
    {
      title: 'Kursus Keselamatan Makmal Wajib untuk Semua Staf FKM',
      cat: 'Pengumuman', status: STATUS.EDITOR_REVIEW, submitted: 2,
      summary: 'Semua staf akademik dan teknikal dikehendaki menghadiri kursus keselamatan makmal sebelum akhir Oktober.',
      content: body([
        'Sehubungan dengan penambahbaikan sistem pengurusan keselamatan fakulti, semua staf yang terlibat dengan operasi makmal diwajibkan menghadiri kursus keselamatan.',
        'Kursus akan diadakan dalam empat sesi berasingan bagi memberi fleksibiliti kepada jadual pengajaran.',
        'Pendaftaran boleh dibuat melalui pegawai keselamatan jabatan masing-masing.'
      ])
    },
    {
      title: 'Bengkel Pemodelan CAD untuk Pelajar Tahun Satu',
      cat: 'Akademik', status: STATUS.ADMIN_REVIEW, submitted: 1,
      summary: 'Bengkel intensif tiga hari memperkenalkan perisian pemodelan kepada pelajar baharu.',
      content: body([
        'Unit Pengajaran FKM akan mengadakan bengkel pemodelan CAD selama tiga hari khusus untuk pelajar tahun satu.',
        'Bengkel ini bertujuan merapatkan jurang kemahiran sebelum pelajar memulakan projek reka bentuk pada semester kedua.',
        'Tempat adalah terhad kepada enam puluh peserta setiap sesi.'
      ])
    },
    {
      title: 'Taklimat Peluang Geran Penyelidikan Dana Khas UTM',
      cat: 'Penyelidikan', status: STATUS.REVISION_REQUIRED, submitted: 5,
      summary: 'Sesi taklimat mengenai tatacara permohonan geran dalaman universiti.',
      content: body([
        'Pejabat Timbalan Dekan Penyelidikan akan mengadakan taklimat mengenai peluang geran dalaman yang dibuka pada suku ini.',
        'Taklimat merangkumi kriteria kelayakan, format kertas cadangan dan jadual penilaian.'
      ]),
      reviewComment: 'Sila nyatakan tarikh, masa dan tempat taklimat dengan jelas dalam perenggan pertama. Tambah juga nama pegawai untuk dihubungi.'
    },
    {
      title: 'Kejohanan Sukan Antara Jabatan FKM 2026',
      cat: 'Aktiviti', status: STATUS.SUBMITTED, submitted: 0,
      summary: 'Kejohanan sukan tahunan membabitkan lima jabatan akan bermula bulan depan.',
      content: body([
        'Kejohanan Sukan Antara Jabatan FKM akan kembali pada tahun ini dengan penyertaan lima jabatan.',
        'Acara merangkumi badminton, bola sepak, ping pong dan larian berganti-ganti.'
      ])
    },
    {
      title: 'Draf: Kolokium Penyelidikan Siswazah Semester Ini',
      cat: 'Penyelidikan', status: STATUS.DRAFT,
      summary: 'Kolokium penyelidikan pelajar siswazah bagi semester semasa.',
      content: body([
        'Kolokium penyelidikan siswazah akan diadakan pada penghujung semester ini.',
        'Butiran penuh masih dalam perbincangan dengan jawatankuasa akademik.'
      ])
    },
    {
      title: 'Cadangan Penstrukturan Semula Jadual Makmal',
      cat: 'Pengumuman', status: STATUS.REJECTED, submitted: 19,
      summary: 'Cadangan penjadualan semula slot makmal untuk semester hadapan.',
      content: body([
        'Cadangan ini membincangkan penstrukturan semula slot penggunaan makmal bagi mengurangkan pertindihan jadual.'
      ]),
      rejectReason: 'Perkara ini adalah pekeliling dalaman, bukan berita untuk tatapan umum. Sila edarkan melalui e-mel jabatan.'
    }
  ];

  var created = 0;

  /** Masa aktiviti terakhir yang munasabah bagi setiap status */
  function lastActivity(sample, index) {
    if (sample.published !== undefined) return daysAgo(sample.published);
    if (sample.status === STATUS.REVISION_REQUIRED) return daysAgo(sample.submitted - 1);
    if (sample.status === STATUS.REJECTED) return daysAgo(sample.submitted - 2);
    if (sample.submitted !== undefined) return daysAgo(sample.submitted);
    return daysAgo(index + 1); // draf: sebarkan supaya susunan bermakna
  }

  samples.forEach(function (sample, index) {
    var author = authors[index % authors.length];
    var newsId = Utils.newsId();
    var submittedAt = sample.submitted !== undefined ? daysAgo(sample.submitted) : '';
    var publishedAt = sample.published !== undefined ? daysAgo(sample.published) : '';

    var isAdminSeen = [STATUS.EDITOR_REVIEW, STATUS.APPROVED, STATUS.PUBLISHED,
      STATUS.REVISION_REQUIRED, STATUS.REJECTED].indexOf(sample.status) !== -1;
    var isEditorSeen = [STATUS.APPROVED, STATUS.PUBLISHED, STATUS.REJECTED]
      .indexOf(sample.status) !== -1;

    SheetDB.insert(CONFIG.SHEETS.NEWS, {
      NewsID: newsId,
      Title: sample.title,
      Slug: Utils.slugify(sample.title),
      CategoryID: catId(sample.cat),
      AuthorID: String(author.UserID),
      Summary: sample.summary,
      Content: sample.content,
      FeaturedImageURL: '',
      FeaturedImageID: '',
      AttachmentFolderID: '',
      Status: sample.status,
      CurrentVersion: sample.status === STATUS.REVISION_REQUIRED ? 2 : 1,
      Tags: DEMO_TAG + ', ' + sample.cat,
      EventDate: '',
      SubmittedAt: submittedAt,
      AdminReviewedBy: isAdminSeen ? adminId : '',
      AdminReviewedAt: isAdminSeen ? daysAgo((sample.submitted || 1) - 1) : '',
      EditorReviewedBy: isEditorSeen ? editorId : '',
      EditorReviewedAt: isEditorSeen ? daysAgo((sample.published || 1) + 1) : '',
      PublishedAt: publishedAt,
      RejectReason: sample.rejectReason || '',
      ViewCount: sample.views || 0,
      CreatedAt: daysAgo((sample.submitted || index) + 3),
      UpdatedAt: lastActivity(sample, index)
    });

    // Versi pertama supaya sejarah artikel tidak kosong
    if (sample.status !== STATUS.DRAFT) {
      SheetDB.insert(CONFIG.SHEETS.NEWS_VERSIONS, {
        VersionID: Utils.versionId(), NewsID: newsId, VersionNumber: 1,
        Title: sample.title, Summary: sample.summary, Content: sample.content,
        FeaturedImageURL: '', SubmittedBy: String(author.UserID),
        SubmissionDate: submittedAt || now, Note: 'Penghantaran pertama'
      });
    }

    // Rekod semakan yang selaras dengan status
    if (isAdminSeen) {
      SheetDB.insert(CONFIG.SHEETS.REVIEWS, {
        ReviewID: Utils.reviewId(), NewsID: newsId, ReviewerID: adminId,
        ReviewerRole: ROLES.ADMIN, ReviewStage: REVIEW_STAGE.ADMIN,
        Decision: sample.status === STATUS.REVISION_REQUIRED ? 'REQUEST_REVISION' : 'FORWARD_TO_EDITOR',
        Comments: sample.reviewComment || 'Format dan ejaan telah disemak.',
        CreatedAt: daysAgo((sample.submitted || 1) - 1)
      });
    }
    if (sample.status === STATUS.PUBLISHED) {
      SheetDB.insert(CONFIG.SHEETS.REVIEWS, {
        ReviewID: Utils.reviewId(), NewsID: newsId, ReviewerID: editorId,
        ReviewerRole: ROLES.EDITOR, ReviewStage: REVIEW_STAGE.EDITOR,
        Decision: 'PUBLISH', Comments: 'Diluluskan untuk penerbitan.',
        CreatedAt: publishedAt
      });
    }
    if (sample.status === STATUS.REJECTED) {
      SheetDB.insert(CONFIG.SHEETS.REVIEWS, {
        ReviewID: Utils.reviewId(), NewsID: newsId, ReviewerID: editorId,
        ReviewerRole: ROLES.EDITOR, ReviewStage: REVIEW_STAGE.EDITOR,
        Decision: 'REJECT', Comments: sample.rejectReason,
        CreatedAt: daysAgo(sample.submitted - 2)
      });
    }

    // Jejak audit supaya garis masa artikel bermakna
    AuditService.log(String(author.UserID), AUDIT_ACTION.CREATE_NEWS, 'NEWS', newsId,
      '', STATUS.DRAFT, 'Cipta draf: ' + sample.title, DEMO_TAG);
    if (sample.status !== STATUS.DRAFT) {
      AuditService.log(String(author.UserID), AUDIT_ACTION.TRANSITION, 'NEWS', newsId,
        STATUS.DRAFT, sample.status, 'Data ujian', DEMO_TAG);
    }

    created++;
  });

  log.push(created + ' berita dijana merentasi ' +
    [STATUS.DRAFT, STATUS.SUBMITTED, STATUS.ADMIN_REVIEW, STATUS.REVISION_REQUIRED,
     STATUS.EDITOR_REVIEW, STATUS.PUBLISHED, STATUS.REJECTED].length + ' status.');

  /* ---------------- 3. Notifikasi ---------------- */

  var notifSamples = [
    { type: NOTIF_TYPE.SUBMISSION, subject: 'Berita baharu menunggu semakan',
      message: 'Kejohanan Sukan Antara Jabatan FKM 2026 telah dihantar untuk semakan Admin.' },
    { type: NOTIF_TYPE.FORWARDED, subject: 'Berita untuk semakan Editor',
      message: 'Kursus Keselamatan Makmal telah diteruskan untuk semakan Editor.' },
    { type: NOTIF_TYPE.PUBLISHED, subject: 'Berita telah diterbitkan',
      message: 'FKM Lancar Program Inovasi Kesihatan Komuniti 2026 telah diterbitkan.' }
  ];

  notifSamples.forEach(function (n, i) {
    SheetDB.insert(CONFIG.SHEETS.NOTIFICATIONS, {
      NotificationID: Utils.notificationId(), UserID: adminId, NewsID: '',
      Type: n.type, Subject: n.subject, Message: n.message,
      IsRead: 'FALSE',
      CreatedAt: new Date(Date.now() - (i * 7 + 2) * 3600 * 1000),
      ReadAt: ''
    });
  });
  log.push(notifSamples.length + ' notifikasi dijana.');

  GlobalSettings.invalidateCache();

  var result = log.join('\n');
  console.log(result);
  return result;
}

/**
 * Buang semua data ujian.
 * Mengenal pasti berita melalui penanda DEMO dalam medan Tags, dan
 * membuang versi, semakan serta log berkaitan.
 */
function removeDemoData() {
  requireOwnerOrTrigger_('removeDemoData', arguments[0]);
  var removed = { news: 0, versions: 0, reviews: 0, notifications: 0, users: 0, audit: 0, images: 0 };

  var demoNews = SheetDB.findWhere(CONFIG.SHEETS.NEWS, function (n) {
    return String(n.Tags || '').indexOf(DEMO_TAG) !== -1;
  });
  var demoIds = demoNews.map(function (n) { return String(n.NewsID); });

  function purge(sheetName, idField, matcher, counterKey) {
    var sh = SheetDB.sheet(sheetName);
    var rows = SheetDB.findAll(sheetName).filter(matcher)
      .sort(function (a, b) { return b._row - a._row; });
    rows.forEach(function (r) { sh.deleteRow(r._row); });
    removed[counterKey] = rows.length;
  }

  purge(CONFIG.SHEETS.NEWS_VERSIONS, 'NewsID', function (r) {
    return demoIds.indexOf(String(r.NewsID)) !== -1;
  }, 'versions');

  purge(CONFIG.SHEETS.REVIEWS, 'NewsID', function (r) {
    return demoIds.indexOf(String(r.NewsID)) !== -1;
  }, 'reviews');

  purge(CONFIG.SHEETS.AUDIT_LOG, 'EntityID', function (r) {
    return demoIds.indexOf(String(r.EntityID)) !== -1 ||
      String(r.Context || '') === DEMO_TAG;
  }, 'audit');

  // Gambar: buang rekod metadata dan hantar fail Drive ke tong sampah
  var demoImages = SheetDB.findWhere(CONFIG.SHEETS.NEWS_IMAGES, function (img) {
    return demoIds.indexOf(String(img.NewsID)) !== -1;
  });
  demoImages.forEach(function (img) {
    try { DriveApp.getFileById(String(img.FileID)).setTrashed(true); } catch (e) { }
  });
  purge(CONFIG.SHEETS.NEWS_IMAGES, 'ImageID', function (r) {
    return demoIds.indexOf(String(r.NewsID)) !== -1;
  }, 'images');

  purge(CONFIG.SHEETS.NEWS, 'NewsID', function (r) {
    return String(r.Tags || '').indexOf(DEMO_TAG) !== -1;
  }, 'news');

  purge(CONFIG.SHEETS.NOTIFICATIONS, 'NotificationID', function (r) {
    return String(r.Message || '').indexOf('FKM Lancar Program Inovasi') !== -1
      || String(r.Message || '').indexOf('Kejohanan Sukan Antara Jabatan') !== -1
      || String(r.Message || '').indexOf('Kursus Keselamatan Makmal') !== -1;
  }, 'notifications');

  purge(CONFIG.SHEETS.USERS, 'Email', function (r) {
    return String(r.Email || '').indexOf('demo.') === 0;
  }, 'users');

  var summary = 'Data ujian dibuang: ' + JSON.stringify(removed);
  console.log(summary);
  return summary;
}


/**
 * Lampirkan gambar contoh kepada berita ujian.
 *
 * JUJUR TENTANG SUMBER: gambar diambil dari picsum.photos, sebuah perkhidmatan
 * gambar pengganti awam. Ia BUKAN gambar FKM sebenar — tujuannya semata-mata
 * untuk menguji susun atur, galeri dan portal. Gantikan dengan gambar sebenar
 * sebelum sistem digunakan secara rasmi.
 *
 * Memerlukan capaian rangkaian keluar. Jika rangkaian UTM menyekat
 * picsum.photos, fungsi ini akan melaporkan kegagalan bagi setiap berita
 * tanpa merosakkan data sedia ada.
 *
 * @param {number} perNews bilangan gambar setiap berita (lalai 2)
 */
function seedDemoImages(perNews) {
  requireOwnerOrTrigger_('seedDemoImages', arguments[0]);
  perNews = perNews || 2;

  var demoNews = SheetDB.findWhere(CONFIG.SHEETS.NEWS, function (n) {
    return String(n.Tags || '').indexOf(DEMO_TAG) !== -1;
  });

  if (!demoNews.length) {
    throw new Error('Tiada berita ujian. Jalankan seedDemoData() dahulu.');
  }

  var log = [];
  var attached = 0;
  var failed = 0;

  demoNews.forEach(function (news, newsIndex) {
    var newsId = String(news.NewsID);

    // Langkau jika berita ini sudah ada gambar
    var existing = SheetDB.findWhere(CONFIG.SHEETS.NEWS_IMAGES, function (img) {
      return String(img.NewsID) === newsId;
    });
    if (existing.length) return;

    var records = [];
    var firstFile = null;

    for (var i = 0; i < perNews; i++) {
      // Seed tetap supaya gambar yang sama muncul setiap kali dijana semula
      var seed = 'fkm' + (newsIndex * 10 + i);
      var url = 'https://picsum.photos/seed/' + seed + '/1200/800';

      try {
        var response = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true });
        if (response.getResponseCode() !== 200) {
          failed++;
          continue;
        }

        var blob = response.getBlob().setName('demo-' + seed + '.jpg');
        var folder = DriveService.getSubFolder(newsId, 'image');
        var file = folder.createFile(blob);
        file.setSharing(DriveApp.Access.DOMAIN_WITH_LINK, DriveApp.Permission.VIEW);

        var isFirst = (i === 0);
        if (isFirst) firstFile = file;

        records.push({
          ImageID: Utils.nextId(CONFIG.ID_PREFIX.IMAGE, false),
          NewsID: newsId,
          FileID: file.getId(),
          FileName: file.getName(),
          MimeType: file.getMimeType(),
          SizeBytes: file.getSize(),
          Caption: isFirst
            ? 'Gambar contoh untuk ' + Utils.truncate(String(news.Title), 50)
            : 'Gambar sokongan',
          AltText: String(news.Title),
          SortOrder: i + 1,
          IsFeatured: isFirst ? 'TRUE' : 'FALSE',
          IsSelectedForSocial: isFirst ? 'TRUE' : 'FALSE',
          PublicUrl: '',
          UploadedBy: String(news.AuthorID),
          CreatedAt: new Date()
        });

        attached++;

      } catch (e) {
        failed++;
        console.error('SEED_IMAGE_FAIL', newsId, String(e));
      }
    }

    if (records.length) {
      SheetDB.insertMany(CONFIG.SHEETS.NEWS_IMAGES, records);
    }

    if (firstFile) {
      SheetDB.updateRow(CONFIG.SHEETS.NEWS, news._row, {
        FeaturedImageID: firstFile.getId(),
        FeaturedImageURL: DriveService.thumbnailUrl(firstFile.getId()),
        UpdatedAt: new Date()
      });
    }
  });

  log.push(attached + ' gambar dilampirkan.');
  if (failed) {
    log.push(failed + ' muat turun gagal — semak sama ada rangkaian menyekat picsum.photos.');
  }
  log.push('Sumber: picsum.photos (gambar pengganti, bukan gambar FKM sebenar).');

  var result = log.join('\n');
  console.log(result);
  return result;
}


/**
 * Cipta berita ujian yang DIMILIKI OLEH ANDA SENDIRI, dalam status DRAF.
 *
 * Bezanya dengan seedDemoData(): berita di sana dimiliki oleh pengguna demo,
 * jadi anda tidak boleh menyuntingnya sebagai Penulis. Berita di sini pula
 * milik anda, membolehkan ujian aliran penuh:
 *
 *   Tukar peranan ke Penulis  → sunting draf, muat naik gambar, hantar
 *   Tukar peranan ke Pentadbir → semak, minta pembetulan atau teruskan
 *   Tukar peranan ke Penulis  → betulkan, hantar semula (versi naik)
 *   Tukar peranan ke Editor   → luluskan, terbitkan
 *
 * @param {boolean} withImages muat naik gambar sekali (memerlukan rangkaian)
 */
function seedMyTestArticles(withImages) {
  requireOwnerOrTrigger_('seedMyTestArticles', arguments[0]);
  var email = Session.getEffectiveUser().getEmail().toLowerCase();
  var me = SheetDB.findOneBy(CONFIG.SHEETS.USERS, 'Email', email);
  if (!me) throw new Error('Akaun anda (' + email + ') tiada dalam sheet USERS.');

  var categories = SheetDB.findAll(CONFIG.SHEETS.CATEGORIES);
  if (!categories.length) throw new Error('Tiada kategori. Jalankan setupSystem() dahulu.');

  function catId(name) {
    var found = categories.filter(function (c) {
      return String(c.CategoryName).toLowerCase().indexOf(name.toLowerCase()) !== -1;
    })[0];
    return found ? String(found.CategoryID) : String(categories[0].CategoryID);
  }

  var drafts = [
    {
      title: 'Seminar Kecerdasan Buatan dalam Reka Bentuk Kejuruteraan',
      cat: 'Akademik',
      summary: 'Seminar sehari membincangkan penggunaan kecerdasan buatan dalam proses reka bentuk mekanikal.',
      content: '<p>Fakulti Kejuruteraan Mekanikal akan mengadakan seminar sehari mengenai penerapan kecerdasan buatan dalam proses reka bentuk kejuruteraan.</p>' +
               '<p>Seminar ini membincangkan penggunaan pembelajaran mesin untuk pengoptimuman topologi, ramalan kegagalan bahan, dan automasi lakaran awal reka bentuk.</p>' +
               '<p>Pembentang terdiri daripada ahli akademik fakulti serta wakil industri pembuatan tempatan. Sesi ini terbuka kepada staf akademik, pelajar siswazah dan rakan industri.</p>'
    },
    {
      title: 'Kerjasama Penyelidikan Bahan Komposit dengan Sektor Automotif',
      cat: 'Penyelidikan',
      summary: 'Projek penyelidikan bersama meneroka penggunaan bahan komposit ringan untuk komponen kenderaan.',
      content: '<p>Sebuah projek penyelidikan bersama antara FKM dan sebuah syarikat automotif tempatan telah dimulakan bagi meneroka penggunaan bahan komposit ringan.</p>' +
               '<p>Fokus penyelidikan adalah mengurangkan berat komponen struktur kenderaan tanpa menjejaskan keselamatan perlanggaran.</p>' +
               '<p>Projek ini melibatkan tiga penyelidik utama dan lima pelajar siswazah, dijangka mengambil masa dua tahun.</p>'
    },
    {
      title: 'Program Latihan Industri Pelajar Tahun Tiga Bermula',
      cat: 'Aktiviti',
      summary: 'Seramai 180 pelajar memulakan penempatan latihan industri di lebih 60 buah syarikat.',
      content: '<p>Program latihan industri bagi pelajar tahun tiga FKM telah bermula, melibatkan seramai 180 orang pelajar.</p>' +
               '<p>Penempatan meliputi sektor pembuatan, tenaga, aeroangkasa dan perundingan kejuruteraan di seluruh negara.</p>' +
               '<p>Pelajar akan menjalani penempatan selama enam bulan sebelum kembali untuk projek tahun akhir.</p>'
    }
  ];

  var createdIds = [];

  drafts.forEach(function (d) {
    var newsId = Utils.newsId();
    SheetDB.insert(CONFIG.SHEETS.NEWS, {
      NewsID: newsId,
      Title: d.title,
      Slug: Utils.slugify(d.title),
      CategoryID: catId(d.cat),
      AuthorID: String(me.UserID),
      Summary: d.summary,
      Content: d.content,
      FeaturedImageURL: '', FeaturedImageID: '', AttachmentFolderID: '',
      Status: STATUS.DRAFT,
      CurrentVersion: 1,
      Tags: DEMO_TAG + ', Ujian Sendiri',
      EventDate: '', SubmittedAt: '',
      AdminReviewedBy: '', AdminReviewedAt: '',
      EditorReviewedBy: '', EditorReviewedAt: '',
      PublishedAt: '', RejectReason: '', ViewCount: 0,
      CreatedAt: new Date(), UpdatedAt: new Date()
    });

    AuditService.log(String(me.UserID), AUDIT_ACTION.CREATE_NEWS, 'NEWS', newsId,
      '', STATUS.DRAFT, 'Cipta draf ujian: ' + d.title, DEMO_TAG);

    createdIds.push(newsId);
  });

  var imageNote = 'Gambar dilangkau.';

  if (withImages !== false) {
    var attached = 0;
    createdIds.forEach(function (newsId, idx) {
      var records = [];
      var firstFile = null;

      for (var i = 0; i < 2; i++) {
        var seed = 'fkmown' + (idx * 10 + i);
        try {
          var res = UrlFetchApp.fetch('https://picsum.photos/seed/' + seed + '/1200/800',
            { muteHttpExceptions: true, followRedirects: true });
          if (res.getResponseCode() !== 200) continue;

          var file = DriveService.getSubFolder(newsId, 'image')
            .createFile(res.getBlob().setName('ujian-' + seed + '.jpg'));
          file.setSharing(DriveApp.Access.DOMAIN_WITH_LINK, DriveApp.Permission.VIEW);

          if (i === 0) firstFile = file;

          records.push({
            ImageID: Utils.nextId(CONFIG.ID_PREFIX.IMAGE, false),
            NewsID: newsId, FileID: file.getId(), FileName: file.getName(),
            MimeType: file.getMimeType(), SizeBytes: file.getSize(),
            Caption: i === 0 ? 'Gambar utama' : 'Gambar sokongan',
            AltText: '', SortOrder: i + 1,
            IsFeatured: i === 0 ? 'TRUE' : 'FALSE',
            IsSelectedForSocial: i === 0 ? 'TRUE' : 'FALSE',
            PublicUrl: '', UploadedBy: String(me.UserID), CreatedAt: new Date()
          });
          attached++;
        } catch (e) {
          console.error('OWN_IMAGE_FAIL', newsId, String(e));
        }
      }

      if (records.length) SheetDB.insertMany(CONFIG.SHEETS.NEWS_IMAGES, records);

      if (firstFile) {
        var row = SheetDB.findOneBy(CONFIG.SHEETS.NEWS, 'NewsID', newsId);
        SheetDB.updateRow(CONFIG.SHEETS.NEWS, row._row, {
          FeaturedImageID: firstFile.getId(),
          FeaturedImageURL: DriveService.thumbnailUrl(firstFile.getId())
        });
      }
    });
    imageNote = attached + ' gambar dilampirkan.';
  }

  var result = createdIds.length + ' draf dicipta atas nama ' + me.Name +
    ' (' + me.Email + ').\n' + imageNote +
    '\nBuka Pengurusan Berita dan tapis status Draf untuk mula menguji.';
  console.log(result);
  return result;
}