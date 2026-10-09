/**
 * ImageService.gs
 * Galeri gambar artikel: muat naik berbilang, susunan, kapsyen,
 * pilihan gambar utama (featured) dan pilihan gambar untuk media sosial.
 *
 * Binari disimpan dalam Google Drive; Sheets hanya menyimpan metadata + File ID.
 */

var ImageService = (function () {

  function toDto(r) {
    return {
      imageId: String(r.ImageID),
      newsId: String(r.NewsID),
      fileId: String(r.FileID),
      fileName: String(r.FileName),
      mimeType: String(r.MimeType),
      sizeBytes: Number(r.SizeBytes || 0),
      sizeLabel: formatSize(Number(r.SizeBytes || 0)),
      caption: String(r.Caption || ''),
      altText: String(r.AltText || ''),
      sortOrder: Number(r.SortOrder || 0),
      isFeatured: Utils.toBool(r.IsFeatured),
      isSelectedForSocial: Utils.toBool(r.IsSelectedForSocial),
      thumbUrl: DriveService.thumbnailUrl(String(r.FileID)),
      viewUrl: 'https://drive.google.com/file/d/' + String(r.FileID) + '/view',
      uploadedAt: Utils.formatDateTime(r.CreatedAt)
    };
  }

  function formatSize(bytes) {
    if (!bytes) return '—';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(0) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  }

  function rowsFor(newsId) {
    return SheetDB.findWhere(CONFIG.SHEETS.NEWS_IMAGES, function (r) {
      return String(r.NewsID) === String(newsId);
    });
  }

  /** Senarai gambar artikel mengikut susunan */
  function listForNews(newsId) {
    var rows = rowsFor(newsId);
    rows.sort(function (a, b) { return Number(a.SortOrder || 0) - Number(b.SortOrder || 0); });
    return rows.map(toDto);
  }

  /** Gambar yang ditanda untuk media sosial (fallback: gambar utama) */
  function listSelectedForSocial(newsId, limit) {
    var all = listForNews(newsId);
    var selected = all.filter(function (i) { return i.isSelectedForSocial; });
    if (!selected.length) selected = all.filter(function (i) { return i.isFeatured; });
    if (!selected.length) selected = all.slice(0, 1);
    return limit ? selected.slice(0, limit) : selected;
  }

  /**
   * Muat naik satu atau lebih gambar.
   * @param {Array<{name,mimeType,data}>} files senarai fail base64
   */
  function uploadImages(user, newsId, files) {
    var news = NewsService.getRaw(newsId);
    Security.requireEditNews(user, news);

    if (!files || !files.length) throw Utils.appError('VALIDATION', 'Tiada fail dipilih.');

    var existing = rowsFor(newsId);
    var maxImages = GlobalSettings.get('MAX_IMAGES');
    if (existing.length + files.length > maxImages) {
      throw Utils.appError('VALIDATION',
        'Had ' + maxImages + ' gambar setiap berita. Anda sudah ada ' + existing.length + '.');
    }

    // Validasi semua fail dahulu — jangan muat naik separa
    files.forEach(function (f) { Validation.validateUpload(f, 'image'); });

    var nextOrder = existing.reduce(function (max, r) {
      return Math.max(max, Number(r.SortOrder || 0));
    }, 0) + 1;

    var hasFeatured = existing.some(function (r) { return Utils.toBool(r.IsFeatured); });
    var created = [];
    var records = [];

    files.forEach(function (f, idx) {
      var uploaded = DriveService.uploadFile(newsId, f, 'image', user.userId);
      var makeFeatured = !hasFeatured && idx === 0;
      var rec = {
        ImageID: Utils.nextId(CONFIG.ID_PREFIX.IMAGE, false),
        NewsID: newsId,
        FileID: uploaded.fileId,
        FileName: uploaded.name,
        MimeType: uploaded.mimeType,
        SizeBytes: uploaded.sizeBytes,
        Caption: '',
        AltText: '',
        SortOrder: nextOrder + idx,
        IsFeatured: makeFeatured ? 'TRUE' : 'FALSE',
        IsSelectedForSocial: makeFeatured ? 'TRUE' : 'FALSE',
        PublicUrl: '',
        UploadedBy: user.userId,
        CreatedAt: Utils.now()
      };
      records.push(rec);
      created.push(uploaded);
      if (makeFeatured) {
        NewsService.setFeaturedImage(user, newsId, uploaded.fileId, uploaded.previewUrl);
      }
    });

    SheetDB.insertMany(CONFIG.SHEETS.NEWS_IMAGES, records);

    AuditService.log(user.userId, AUDIT_ACTION.UPLOAD_FILE, 'NEWS', newsId, '', '',
      'Muat naik ' + records.length + ' gambar');

    return listForNews(newsId);
  }

  /** Kemas kini kapsyen, teks alternatif atau susunan */
  function updateImage(user, imageId, patch) {
    var rec = SheetDB.findOneBy(CONFIG.SHEETS.NEWS_IMAGES, 'ImageID', imageId);
    if (!rec) throw Utils.appError('NOT_FOUND', 'Gambar tidak dijumpai.');

    var news = NewsService.getRaw(rec.NewsID);
    Security.requireEditNews(user, news);

    var update = {};
    if (patch.caption !== undefined) update.Caption = Security.sanitizeText(patch.caption, 300);
    if (patch.altText !== undefined) update.AltText = Security.sanitizeText(patch.altText, 200);
    if (patch.sortOrder !== undefined) update.SortOrder = Number(patch.sortOrder) || 0;
    if (patch.isSelectedForSocial !== undefined)
      update.IsSelectedForSocial = patch.isSelectedForSocial ? 'TRUE' : 'FALSE';

    SheetDB.updateRow(CONFIG.SHEETS.NEWS_IMAGES, rec._row, update);
    return listForNews(rec.NewsID);
  }

  /** Tetapkan satu gambar sebagai gambar utama (unik setiap artikel) */
  function setFeatured(user, imageId) {
    var rec = SheetDB.findOneBy(CONFIG.SHEETS.NEWS_IMAGES, 'ImageID', imageId);
    if (!rec) throw Utils.appError('NOT_FOUND', 'Gambar tidak dijumpai.');

    var news = NewsService.getRaw(rec.NewsID);
    Security.requireEditNews(user, news);

    return Utils.withLock(function () {
      rowsFor(rec.NewsID).forEach(function (r) {
        var shouldBe = String(r.ImageID) === String(imageId) ? 'TRUE' : 'FALSE';
        if (String(r.IsFeatured).toUpperCase() !== shouldBe) {
          SheetDB.updateRow(CONFIG.SHEETS.NEWS_IMAGES, r._row, { IsFeatured: shouldBe });
        }
      });
      NewsService.setFeaturedImage(user, rec.NewsID, rec.FileID,
        DriveService.thumbnailUrl(rec.FileID));
      AuditService.log(user.userId, AUDIT_ACTION.UPDATE_NEWS, 'NEWS', rec.NewsID, '', '',
        'Tukar gambar utama: ' + rec.FileName);
      return listForNews(rec.NewsID);
    });
  }

  /** Tanda / nyahtanda gambar untuk penerbitan media sosial */
  function toggleSocialSelection(user, imageId, selected) {
    return updateImage(user, imageId, { isSelectedForSocial: !!selected });
  }

  /** Susun semula galeri mengikut senarai ID */
  function reorder(user, newsId, orderedImageIds) {
    var news = NewsService.getRaw(newsId);
    Security.requireEditNews(user, news);

    var byId = {};
    rowsFor(newsId).forEach(function (r) { byId[String(r.ImageID)] = r; });

    orderedImageIds.forEach(function (id, idx) {
      var r = byId[String(id)];
      if (r) SheetDB.updateRow(CONFIG.SHEETS.NEWS_IMAGES, r._row, { SortOrder: idx + 1 });
    });
    return listForNews(newsId);
  }

  /** Buang gambar dari galeri dan Drive */
  function removeImage(user, imageId) {
    var rec = SheetDB.findOneBy(CONFIG.SHEETS.NEWS_IMAGES, 'ImageID', imageId);
    if (!rec) throw Utils.appError('NOT_FOUND', 'Gambar tidak dijumpai.');

    var news = NewsService.getRaw(rec.NewsID);
    Security.requireEditNews(user, news);

    var wasFeatured = Utils.toBool(rec.IsFeatured);
    try { DriveService.removeFile(rec.FileID, rec.NewsID, user.userId); } catch (e) { }
    SheetDB.deleteBy(CONFIG.SHEETS.NEWS_IMAGES, 'ImageID', imageId);

    // Jika gambar utama dibuang, naikkan gambar pertama yang tinggal
    if (wasFeatured) {
      var remaining = listForNews(rec.NewsID);
      if (remaining.length) setFeatured(user, remaining[0].imageId);
      else NewsService.setFeaturedImage(user, rec.NewsID, '', '');
    }

    return listForNews(rec.NewsID);
  }

  /**
   * Jadikan fail boleh diakses awam — DIPERLUKAN oleh Facebook/Instagram
   * kerana Graph API perlu memuat turun imej dari URL awam.
   * Dipanggil hanya semasa penerbitan media sosial, bukan semasa muat naik biasa.
   */
  function makePublic(fileId) {
    var file = DriveApp.getFileById(fileId);
    try {
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (e) {
      throw Utils.appError('DRIVE',
        'Gagal menetapkan gambar sebagai boleh dikongsi. Semak polisi perkongsian domain UTM.');
    }
    return 'https://drive.google.com/uc?export=download&id=' + fileId;
  }

  /**
   * Selaraskan keizinan Drive dengan status penerbitan berita.
   *
   * Pembaca awam tiada akaun UTM, jadi fail berkeizinan "domain sahaja" akan
   * gagal dimuatkan dan pembaca melihat kotak kosong. Apabila berita
   * diterbitkan, gambarnya dibuka kepada sesiapa yang mempunyai pautan;
   * apabila diarkibkan, keizinan ditarik balik.
   *
   * Perlu difahami: "anyone with link" bermakna sesiapa yang memiliki ID fail
   * boleh melihat gambar itu, walaupun berita kemudian diarkibkan dan
   * keizinan ditarik — sesiapa yang sudah menyimpan pautan mungkin masih
   * memilikinya dalam cache. Jangan letak gambar sulit dalam berita.
   *
   * @param {string} newsId
   * @param {boolean} isPublic
   */
  function setPublicAccess(newsId, isPublic) {
    var images = listForNews(newsId);
    var result = { changed: 0, failed: [] };

    images.forEach(function (img) {
      if (applySharing_(img.fileId, isPublic)) result.changed++;
      else result.failed.push({ fileId: img.fileId, fileName: img.fileName, newsId: newsId });
    });

    return result;
  }

  /**
   * Tetapkan keizinan satu fail, dengan cubaan semula.
   *
   * Drive kerap memulangkan "Service error: Drive" apabila banyak perubahan
   * keizinan dibuat berturut-turut. Ia biasanya sementara, jadi cubaan
   * diulang dengan jeda yang menaik. Kegagalan yang berterusan selepas tiga
   * cubaan biasanya bermakna sekatan polisi domain, bukan masalah sementara.
   */
  function applySharing_(fileId, isPublic) {
    var access = isPublic ? DriveApp.Access.ANYONE_WITH_LINK : DriveApp.Access.DOMAIN_WITH_LINK;
    var delays = [0, 800, 2500];

    for (var attempt = 0; attempt < delays.length; attempt++) {
      if (delays[attempt]) Utilities.sleep(delays[attempt]);
      try {
        DriveApp.getFileById(fileId).setSharing(access, DriveApp.Permission.VIEW);
        return true;
      } catch (e) {
        if (attempt === delays.length - 1) {
          console.error('SHARING_FAIL', fileId, String(e));
        }
      }
    }
    return false;
  }

  /**
   * Semak keizinan sebenar setiap gambar berita terbit.
   *
   * Berbeza daripada setPublicAccess yang menetapkan keizinan, fungsi ini
   * MEMBACA keadaan semasa. Gunakan untuk mengesahkan bahawa pembaca luar
   * benar-benar boleh melihat gambar, bukan sekadar mengandaikan.
   */
  function auditSharing() {
    var report = { checked: 0, publicOk: [], notPublic: [], unreadable: [] };

    SheetDB.findAll(CONFIG.SHEETS.NEWS).forEach(function (n) {
      if (String(n.Status) !== STATUS.PUBLISHED) return;

      listForNews(String(n.NewsID)).forEach(function (img) {
        report.checked++;
        try {
          var file = DriveApp.getFileById(img.fileId);
          var access = String(file.getSharingAccess());
          var entry = {
            newsId: String(n.NewsID), title: String(n.Title),
            fileName: img.fileName, fileId: img.fileId, access: access
          };
          if (access === 'ANYONE_WITH_LINK' || access === 'ANYONE') report.publicOk.push(entry);
          else report.notPublic.push(entry);
        } catch (e) {
          report.unreadable.push({ fileId: img.fileId, error: String(e) });
        }
      });
    });

    return report;
  }

  /** Kembalikan keizinan kepada domain sahaja selepas penerbitan */
  function revertSharing(fileId) {
    try {
      DriveApp.getFileById(fileId)
        .setSharing(DriveApp.Access.DOMAIN_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (e) { /* tidak kritikal */ }
  }

  return {
    listForNews: listForNews,
    listSelectedForSocial: listSelectedForSocial,
    uploadImages: uploadImages,
    updateImage: updateImage,
    setFeatured: setFeatured,
    toggleSocialSelection: toggleSocialSelection,
    reorder: reorder,
    removeImage: removeImage,
    makePublic: makePublic,
    revertSharing: revertSharing,
    setPublicAccess: setPublicAccess,
    auditSharing: auditSharing
  };
})();