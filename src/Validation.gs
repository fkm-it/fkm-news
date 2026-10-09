/**
 * Validation.gs
 * Peraturan validasi input. Semua had dibaca dari Global Settings —
 * tiada nombor magik di sini.
 */

var Validation = (function () {

  function fail(errors) {
    throw Utils.appError('VALIDATION', errors.join(' '));
  }

  function isEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
  }

  function extensionOf(filename) {
    var parts = String(filename || '').split('.');
    return parts.length > 1 ? parts.pop().toLowerCase() : '';
  }

  /**
   * Validasi artikel.
   * @param {Object} data payload artikel
   * @param {boolean} forSubmit true = semakan penuh (medan wajib), false = draf
   */
  function validateNews(data, forSubmit) {
    var errors = [];
    var minTitle = GlobalSettings.get('MIN_TITLE_LENGTH');
    var maxTitle = GlobalSettings.get('MAX_TITLE_LENGTH');
    var maxSummary = GlobalSettings.get('MAX_SUMMARY_LENGTH');
    var minContent = GlobalSettings.get('MIN_CONTENT_LENGTH');
    var maxContent = GlobalSettings.get('MAX_CONTENT_LENGTH');

    var title = String(data.title || '').trim();
    if (!title) {
      errors.push('Tajuk diperlukan.');
    } else {
      if (title.length > maxTitle) errors.push('Tajuk melebihi ' + maxTitle + ' aksara.');
      if (forSubmit && title.length < minTitle)
        errors.push('Tajuk mesti sekurang-kurangnya ' + minTitle + ' aksara.');
    }

    var summary = String(data.summary || '').trim();
    if (summary.length > maxSummary)
      errors.push('Ringkasan melebihi ' + maxSummary + ' aksara.');

    var contentText = Utils.stripTags(data.content || '');
    if (contentText.length > maxContent)
      errors.push('Kandungan melebihi ' + maxContent + ' aksara.');

    if (forSubmit) {
      var required = GlobalSettings.get('REQUIRED_FIELDS') || [];
      var map = {
        Title: title,
        CategoryID: data.categoryId,
        Summary: summary,
        Content: contentText,
        FeaturedImageURL: data.featuredImageUrl
      };
      var labels = {
        Title: 'Tajuk', CategoryID: 'Kategori', Summary: 'Ringkasan',
        Content: 'Kandungan', FeaturedImageURL: 'Gambar utama'
      };
      required.forEach(function (f) {
        if (Utils.isEmpty(map[f])) errors.push((labels[f] || f) + ' diperlukan sebelum hantar.');
      });
      if (contentText && contentText.length < minContent)
        errors.push('Kandungan mesti sekurang-kurangnya ' + minContent + ' aksara.');
    }

    if (data.eventDate && isNaN(new Date(data.eventDate).getTime()))
      errors.push('Tarikh peristiwa tidak sah.');

    if (errors.length) fail(errors);
    return true;
  }

  /** Validasi fail sebelum muat naik */
  function validateUpload(file, kind) {
    var errors = [];
    var maxMb = GlobalSettings.get('MAX_FILE_SIZE_MB');
    var allowed = (kind === 'image')
      ? GlobalSettings.get('ALLOWED_IMAGE_EXTENSIONS')
      : GlobalSettings.get('ALLOWED_EXTENSIONS');

    if (!file || !file.data) errors.push('Data fail tidak diterima.');
    if (!file || !file.name) errors.push('Nama fail diperlukan.');

    if (file && file.name) {
      var ext = extensionOf(file.name);
      if (allowed.indexOf(ext) === -1)
        errors.push('Jenis fail .' + ext + ' tidak dibenarkan. Dibenarkan: ' + allowed.join(', ') + '.');
    }

    if (file && file.data) {
      // base64 → anggaran saiz bait
      var bytes = Math.ceil(String(file.data).length * 3 / 4);
      if (bytes > maxMb * 1024 * 1024)
        errors.push('Saiz fail melebihi had ' + maxMb + ' MB.');
    }

    if (errors.length) fail(errors);
    return true;
  }

  /** Validasi pengguna */
  function validateUser(data, isNew, currentUserId) {
    var errors = [];
    if (!String(data.name || '').trim()) errors.push('Nama diperlukan.');

    if (data.email !== undefined && String(data.email).trim() !== '') {
      var email = String(data.email).toLowerCase().trim();
      if (!isEmail(email)) errors.push('E-mel tidak sah.');

      // E-mel mesti unik. Sistem mengenal pasti pengguna melalui e-mel, jadi
      // dua rekod dengan e-mel sama bermakna rekod kedua tidak akan pernah
      // dicapai — padanan pertama sentiasa menang.
      var existing = SheetDB.findOneBy(CONFIG.SHEETS.USERS, 'Email', email);
      if (existing && String(existing.UserID) !== String(currentUserId || '')) {
        errors.push('E-mel ini sudah digunakan oleh pengguna lain.');
      }
    } else if (isNew) {
      errors.push('E-mel diperlukan.');
    }
    var validRoles = [ROLES.AUTHOR, ROLES.ADMIN, ROLES.EDITOR];
    if (validRoles.indexOf(String(data.role || '').toUpperCase()) === -1)
      errors.push('Peranan tidak sah.');
    if (data.status && [USER_STATUS.ACTIVE, USER_STATUS.INACTIVE]
      .indexOf(String(data.status).toUpperCase()) === -1)
      errors.push('Status pengguna tidak sah.');

    if (errors.length) fail(errors);
    return true;
  }

  function validateCategory(data) {
    var errors = [];
    var name = String(data.categoryName || '').trim();
    if (!name) errors.push('Nama kategori diperlukan.');
    if (name.length > 80) errors.push('Nama kategori melebihi 80 aksara.');
    if (errors.length) fail(errors);
    return true;
  }

  /** Validasi komen semakan */
  function validateReviewComment(action, comments) {
    var transitionsNeedingComment = ['REQUEST_REVISION', 'REJECT'];
    var needsComment = transitionsNeedingComment.indexOf(action) !== -1
      && GlobalSettings.get('REQUIRE_COMMENT_ON_REJECT');
    if (needsComment && String(comments || '').trim().length < 10) {
      fail(['Nyatakan sebab atau cadangan pembetulan (sekurang-kurangnya 10 aksara).']);
    }
    return true;
  }

  return {
    isEmail: isEmail,
    extensionOf: extensionOf,
    validateNews: validateNews,
    validateUpload: validateUpload,
    validateUser: validateUser,
    validateCategory: validateCategory,
    validateReviewComment: validateReviewComment
  };
})();