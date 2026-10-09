/**
 * GreetingCardService.gs
 * ============================================================================
 * Pengurusan kad ucapan dari halaman Tetapan.
 *
 * Sebelum fail ini wujud, kad ucapan hanya boleh diurus dengan menaip terus
 * dalam sheet GREETING_CARDS. Itu membawa tiga risiko: tarikh tersimpan
 * sebagai teks dan dibaca salah, poster terlupa dikongsi kepada umum, dan
 * Admin perlu akses tulis ke pangkalan data sebenar.
 *
 * PERATURAN PEMILIHAN DITULIS SEKALI SAHAJA — dalam pickActive() di bawah.
 * Portal awam (WidgetService) dan senarai Admin kedua-duanya memanggilnya,
 * jadi label "Sedang dipaparkan" dalam Tetapan tidak boleh berbeza daripada
 * apa yang pembaca benar-benar lihat.
 *
 * Kebenaran: 'settings.manage' — Admin sahaja, sama seperti tetapan lain.
 * ============================================================================
 */

var GreetingCardService = (function () {

  /** Folder poster di bawah folder akar FKM NEWS dalam Drive. */
  var POSTER_FOLDER = '_KadUcapan';

  var STATE = {
    LIVE: 'LIVE',             // sedang dipaparkan di portal
    OUTRANKED: 'OUTRANKED',   // dalam julat tarikh, tetapi kad lain menang
    NO_POSTER: 'NO_POSTER',   // dalam julat tarikh, tetapi tiada poster
    UPCOMING: 'UPCOMING',
    EXPIRED: 'EXPIRED',
    DISABLED: 'DISABLED',
    INVALID_DATE: 'INVALID_DATE' // tarikh tidak boleh dibaca — tidak akan dipaparkan
  };

  /* ------------------------------------------------------------ Pembantu */

  function toBool(v) {
    if (typeof v === 'boolean') return v;
    return String(v).trim().toUpperCase() === 'TRUE';
  }

  function isValidDate(d) {
    return d instanceof Date && !isNaN(d.getTime());
  }

  /**
   * Menerima tarikh dalam DUA bentuk yang wujud dalam sheet:
   *   - objek Date (sel yang Sheets kenali sebagai tarikh)
   *   - teks 'yyyy-mm-dd' (sel yang tersimpan sebagai teks, contoh
   *     daripada import CSV)
   *
   * Teks dalam bentuk lain DITOLAK, bukan diteka. '01/10/2026' boleh
   * bermaksud 1 Oktober atau 10 Januari bergantung pada lokal — menebak
   * salah bermakna kad Deepavali muncul pada bulan Januari.
   */
  function parseDay(v) {
    if (v instanceof Date) return isValidDate(v) ? v : null;
    var m = String(v || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return null;
    var y = Number(m[1]), mo = Number(m[2]) - 1, d = Number(m[3]);
    var out = new Date(y, mo, d);
    // Tolak tarikh yang "melimpah", contoh 2026-02-31 menjadi 3 Mac.
    if (out.getFullYear() !== y || out.getMonth() !== mo || out.getDate() !== d) return null;
    return out;
  }

  function dayStart(d) { var x = new Date(d.getTime()); x.setHours(0, 0, 0, 0); return x; }
  function dayEnd(d) { var x = new Date(d.getTime()); x.setHours(23, 59, 59, 999); return x; }

  function fmtDay(v) {
    var d = parseDay(v);
    return d ? Utilities.formatDate(d, Utils.timezone(), 'yyyy-MM-dd') : '';
  }

  function hasPoster(row) {
    return !!String(row.PosterImageURL || '').trim();
  }

  function inRange(row, today) {
    var start = parseDay(row.StartDate);
    var end = parseDay(row.EndDate);
    if (!start || !end) return false;
    return today >= dayStart(start) && today <= dayEnd(end);
  }

  /* -------------------------------------------------- Peraturan pemilihan */

  /**
   * Kad yang sepatutnya dipaparkan pada tarikh tertentu.
   *
   *   1. Hanya kad aktif, dalam julat tarikh, DAN mempunyai poster.
   *   2. Kad override mengatasi kad biasa.
   *   3. Dalam peringkat yang sama, Priority lebih tinggi menang.
   *
   * Syarat "mempunyai poster" ialah pembetulan. Versi sebelum ini memilih
   * kad tanpa poster, kemudian portal menyembunyikannya kerana tiada gambar
   * — dan kad lain yang ada poster pada hari yang sama ikut tersembunyi.
   *
   * @param {Array<Object>} rows baris mentah GREETING_CARDS
   * @param {Date=} when tarikh rujukan; lalai hari ini
   * @return {Object|null} baris yang menang
   */
  function pickActive(rows, when) {
    var today = dayStart(when || new Date());
    var best = null;

    (rows || []).forEach(function (row) {
      if (!toBool(row.IsActive)) return;
      if (!hasPoster(row)) return;
      if (!inRange(row, today)) return;

      if (!best) { best = row; return; }

      var rowOverride = toBool(row.IsOverride);
      var bestOverride = toBool(best.IsOverride);

      if (rowOverride && !bestOverride) { best = row; return; }
      if (rowOverride === bestOverride &&
          (Number(row.Priority) || 0) > (Number(best.Priority) || 0)) {
        best = row;
      }
    });

    return best;
  }

  /* ------------------------------------------------------------ Senarai */

  function stateOf(row, today, winner) {
    if (!toBool(row.IsActive)) return STATE.DISABLED;

    var start = parseDay(row.StartDate);
    var end = parseDay(row.EndDate);

    // Keadaan sendiri, bukan OUTRANKED: kad ini tidak kalah kepada kad
    // lain — ia tidak pernah layak. Melabelnya "kalah" akan membuat Admin
    // menaikkan Priority dan tertanya kenapa ia masih tidak muncul.
    if (!start || !end) return STATE.INVALID_DATE;

    if (end && today > dayEnd(end)) return STATE.EXPIRED;
    if (start && today < dayStart(start)) return STATE.UPCOMING;

    if (!hasPoster(row)) return STATE.NO_POSTER;
    if (winner && String(winner.CardID) === String(row.CardID)) return STATE.LIVE;
    return STATE.OUTRANKED;
  }

  function toDto(row, today, winner) {
    var raw = String(row.PosterImageURL || '').trim();
    return {
      cardId: String(row.CardID || ''),
      title: String(row.Title || ''),
      titleEn: String(row.TitleEn || ''),
      startDate: fmtDay(row.StartDate),
      endDate: fmtDay(row.EndDate),
      posterUrl: raw,
      // Imej kecil untuk jadual Tetapan — 400px cukup, tidak perlu 1000px.
      posterPreview: raw ? normalizeImageUrl_(raw, 400) : '',
      isOverride: toBool(row.IsOverride),
      isActive: toBool(row.IsActive),
      priority: Number(row.Priority) || 0,
      state: stateOf(row, today, winner),
      // Nilai mentah dikembalikan apabila tarikh rosak, supaya Admin
      // nampak apa yang sebenarnya tersimpan dalam sel.
      rawStart: parseDay(row.StartDate) ? '' : String(row.StartDate || ''),
      rawEnd: parseDay(row.EndDate) ? '' : String(row.EndDate || '')
    };
  }

  function list(user) {
    Security.requirePermission(user, 'settings.manage');

    var rows = SheetDB.findAll(CONFIG.SHEETS.GREETING_CARDS);
    var today = dayStart(new Date());
    var winner = pickActive(rows, today);

    var cards = rows.map(function (r) { return toDto(r, today, winner); });

    // Terkini dahulu dalam kalendar: yang akan datang paling hampir di atas,
    // yang sudah tamat di bawah.
    // Kad yang perlu dibetulkan (tarikh rosak, tiada poster) diletakkan
    // tinggi supaya Admin nampak, bukan tertimbus di bawah kad lama.
    var rank = { LIVE: 0, INVALID_DATE: 1, NO_POSTER: 1, OUTRANKED: 2,
                 UPCOMING: 3, DISABLED: 4, EXPIRED: 5 };
    cards.sort(function (a, b) {
      var r = rank[a.state] - rank[b.state];
      if (r) return r;
      return a.state === STATE.EXPIRED
        ? (a.startDate < b.startDate ? 1 : -1)
        : (a.startDate < b.startDate ? -1 : 1);
    });

    return {
      cards: cards,
      activeCardId: winner ? String(winner.CardID) : '',
      today: Utilities.formatDate(today, Utils.timezone(), 'yyyy-MM-dd')
    };
  }

  /* ------------------------------------------------------------ Simpan */

  /**
   * Cipta atau kemas kini kad.
   *
   * @param {Object} data
   *   cardId      — kosong untuk kad baharu
   *   title       — wajib
   *   titleEn     — pilihan
   *   startDate   — 'yyyy-mm-dd', wajib
   *   endDate     — 'yyyy-mm-dd', wajib
   *   posterUrl   — pautan Drive dalam apa jua bentuk, pilihan
   *   posterFile  — { name, mimeType, data(base64) }, pilihan; mengatasi posterUrl
   *   isOverride, isActive — boolean
   *   priority    — 0 hingga 100
   * @return {{cardId:string, warnings:Array<string>}}
   */
  function save(user, data) {
    Security.requirePermission(user, 'settings.manage');
    data = data || {};

    var title = String(Security.sanitizeText(data.title, 120) || '').trim();
    if (!title) throw Utils.appError('VALIDATION', 'Tajuk wajib diisi.');

    var start = parseDay(data.startDate);
    var end = parseDay(data.endDate);
    if (!start || !end) {
      throw Utils.appError('VALIDATION', 'Tarikh mula dan tarikh tamat wajib diisi dengan betul.');
    }
    if (end < start) {
      throw Utils.appError('VALIDATION', 'Tarikh tamat tidak boleh lebih awal daripada tarikh mula.');
    }

    var priority = parseInt(data.priority, 10);
    if (isNaN(priority)) priority = 5;
    priority = Math.max(0, Math.min(100, priority));

    if (data.posterUrl !== undefined && data.posterUrl !== null) {
      var candidate = String(data.posterUrl).trim();
      if (candidate && !/^https:\/\//i.test(candidate)) {
        throw Utils.appError('VALIDATION', 'Pautan poster mesti bermula dengan https://');
      }
    }

    // Muat naik fail dilakukan SEBELUM kunci diambil: ia boleh mengambil
    // beberapa saat, dan kunci skrip menyekat setiap pengguna lain selama
    // tempoh itu.
    var warnings = [];
    var uploadedUrl = '';
    if (data.posterFile) {
      var up = uploadPoster_(data.posterFile, user);
      uploadedUrl = up.url;
      if (up.warning) warnings.push(up.warning);
    }

    return Utils.withLock(function () {
      var patch = {
        Title: title,
        StartDate: start,     // disimpan sebagai objek Date, bukan teks
        EndDate: end,
        IsOverride: data.isOverride ? 'TRUE' : 'FALSE',
        IsActive: data.isActive === false ? 'FALSE' : 'TRUE',
        Priority: priority
      };

      // Medan pilihan hanya ditulis apabila hadir dalam payload — corak yang
      // sama yang membetulkan pepijat FeaturedImageURL dalam NewsService.
      if (data.titleEn !== undefined) {
        patch.TitleEn = String(Security.sanitizeText(data.titleEn, 120) || '').trim();
      }

      if (uploadedUrl) {
        patch.PosterImageURL = uploadedUrl;
      } else if (data.posterUrl !== undefined && data.posterUrl !== null) {
        var url = String(Security.sanitizeText(String(data.posterUrl).trim(), 500) || '');
        patch.PosterImageURL = url;
        if (url) {
          var w = ensurePublic_(url);
          if (w) warnings.push(w);
        }
      }

      var sheet = CONFIG.SHEETS.GREETING_CARDS;
      var id, isNew;

      if (data.cardId) {
        var existing = SheetDB.findOneBy(sheet, 'CardID', data.cardId);
        if (!existing) throw Utils.appError('NOT_FOUND', 'Kad ucapan tidak dijumpai.');
        SheetDB.updateRow(sheet, existing._row, patch);
        id = String(data.cardId);
        isNew = false;
      } else {
        id = Utils.nextId(CONFIG.ID_PREFIX.CARD, true);
        patch.CardID = id;
        SheetDB.insert(sheet, patch);
        isNew = true;
      }

      AuditService.log(user.userId, 'GREETING_SAVE', 'GREETING_CARD', id, '', '',
        (isNew ? 'Cipta' : 'Kemas kini') + ' kad ucapan: ' + title);

      return { cardId: id, warnings: warnings };
    });
  }

  /* ------------------------------------------------------------ Padam */

  /**
   * Padam kad. Fail poster dalam Drive TIDAK dibuang — poster yang sama
   * kerap digunakan semula tahun berikutnya, dan membuangnya secara senyap
   * akan merosakkan kad lain yang merujuknya.
   */
  function remove(user, cardId) {
    Security.requirePermission(user, 'settings.manage');
    if (!cardId) throw Utils.appError('VALIDATION', 'ID kad tidak diberi.');

    return Utils.withLock(function () {
      var row = SheetDB.findOneBy(CONFIG.SHEETS.GREETING_CARDS, 'CardID', cardId);
      if (!row) throw Utils.appError('NOT_FOUND', 'Kad ucapan tidak dijumpai.');

      SheetDB.deleteBy(CONFIG.SHEETS.GREETING_CARDS, 'CardID', cardId);
      AuditService.log(user.userId, 'GREETING_DELETE', 'GREETING_CARD', String(cardId), '', '',
        'Padam kad ucapan: ' + String(row.Title || ''));
      return true;
    });
  }

  /* ------------------------------------------------------------ Drive */

  function posterFolder_() {
    var root = DriveService.rootFolder();
    var it = root.getFoldersByName(POSTER_FOLDER);
    return it.hasNext() ? it.next() : root.createFolder(POSTER_FOLDER);
  }

  /**
   * Muat naik poster dan buka kepada umum terus.
   *
   * Berbeza daripada gambar berita, yang kekal "domain sahaja" sehingga
   * diterbitkan: poster kad ucapan memang dicipta untuk laman awam, jadi
   * tiada peringkat draf yang perlu dilindungi.
   */
  function uploadPoster_(file, user) {
    Validation.validateUpload(file, 'image');

    var name = Security.sanitizeFilename(file.name);
    var blob = Utilities.newBlob(Utilities.base64Decode(file.data),
      file.mimeType || 'application/octet-stream', name);

    var created = posterFolder_().createFile(blob);
    var warning = '';
    try {
      created.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (e) {
      warning = 'Poster dimuat naik tetapi tidak dapat dibuka kepada umum. ' +
        'Pembaca luar mungkin tidak nampak gambarnya.';
    }

    AuditService.log(user.userId, AUDIT_ACTION.UPLOAD_FILE, 'GREETING_CARD', '', '', '',
      'Muat naik poster kad ucapan: ' + name);

    return { url: DriveService.thumbnailUrl(created.getId()), warning: warning };
  }

  /**
   * Pastikan poster yang ditampal boleh dilihat umum.
   *
   * Poster yang dikongsi "domain UTM sahaja" kelihatan sempurna kepada
   * Admin yang log masuk, tetapi kosong kepada setiap pembaca awam.
   * Kesilapan itu tidak akan disedari oleh orang yang menyediakannya.
   *
   * Hanya berjaya jika pemilik skrip mempunyai hak edit pada fail itu;
   * jika tidak, amaran dipulangkan dan kad tetap disimpan.
   *
   * @return {string} amaran, atau '' jika tiada masalah
   */
  function ensurePublic_(url) {
    if (url.indexOf('drive.google.com') === -1) return '';

    var m = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) ||
            url.match(/[?&]id=([a-zA-Z0-9_-]+)/) ||
            url.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (!m) return 'Pautan Drive tidak dikenali. Semak pautan poster.';

    try {
      var file = DriveApp.getFileById(m[1]);
      var access = String(file.getSharingAccess());
      if (access === 'ANYONE_WITH_LINK' || access === 'ANYONE') return '';
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      return '';
    } catch (e) {
      return 'Poster tidak dapat dibuka kepada umum. Kongsi fail itu sebagai ' +
        '"Anyone with the link" secara manual, atau muat naik terus dari borang ini.';
    }
  }

  return {
    STATE: STATE,
    pickActive: pickActive,
    list: list,
    save: save,
    remove: remove
  };
})();