/**
 * Code.gs
 * Titik masuk web app dan penghala API tunggal.
 *
 * Setiap panggilan API mengikut turutan tetap:
 *   authenticate → authorize → validate → execute → audit → notify → safe response
 */

/* ------------------------------------------------------------------ doGet */

function doGet(e) {
  e = e || { parameter: {} };

  if (!CONFIG.isInstalled()) {
    return HtmlService.createHtmlOutput(
      '<h2 style="font-family:sans-serif">Sistem belum dipasang</h2>' +
      '<p style="font-family:sans-serif">Jalankan <code>setupSystem()</code> ' +
      'dari editor Apps Script terlebih dahulu.</p>');
  }

  var settings = GlobalSettings.getPublicSettings();

  /*
   * Siapa yang mendapat portal awam, dan siapa yang mendapat aplikasi.
   *
   * Pelawat tanpa identiti Google sentiasa mendapat portal awam. Apabila
   * deployment ditetapkan kepada "Anyone", Session.getActiveUser()
   * mengembalikan rentetan kosong bagi mereka.
   *
   * MOD PEMBACA (?view=reader) memaksa portal awam walaupun pelawat
   * DIKENAL PASTI. Tanpanya, warga domain UTM yang mengklik pautan berita
   * dihantar ke aplikasi dalaman — dan jika mereka tiada dalam USERS,
   * mereka sama ada ditolak, atau didaftarkan sebagai Penulis secara
   * automatik apabila AUTO_REGISTER_AUTHOR dihidupkan. Kedua-duanya salah
   * bagi seseorang yang hanya mahu membaca berita.
   *
   * Portal awam memanggil publicApi() sahaja, yang tidak mempunyai laluan
   * kepada modul pengurusan — jadi menghidangkannya kepada pengguna yang
   * dikenal pasti tidak membuka apa-apa yang tertutup.
   *
   * Tanpa ?view=reader, pengguna berdaftar mendapat aplikasi penuh seperti
   * biasa, termasuk melalui URL deployment awam.
   */
  var identified = Auth.getActiveEmail();
  var portalOn = PublicService.isEnabled();
  var readerMode = String(e.parameter.view || '').toLowerCase() === 'reader';

  if (!identified && !portalOn) {
    return HtmlService.createHtmlOutput(
      '<div style="font-family:sans-serif;padding:48px;text-align:center">' +
      '<h2>' + Security.escapeHtml(settings.SYSTEM_SHORT_NAME) + '</h2>' +
      '<p>Portal awam tidak diaktifkan. Sila log masuk dengan akaun UTM anda.</p></div>');
  }

  if (portalOn && (!identified || readerMode)) {
    var pub = HtmlService.createTemplateFromFile('Public');
    pub.bootId = String(e.parameter.id || '');

    /*
     * Bahasa dibawa dalam URL supaya pautan kongsi membuka artikel dalam
     * bahasa yang dilihat oleh pengirim. Nilai yang tidak sah menjadi
     * rentetan kosong, dan klien berundur kepada pilihan tersimpan dalam
     * localStorage, kemudian kepada BM.
     */
    var reqLang = String(e.parameter.lang || '').toLowerCase();
    pub.bootLang = (reqLang === 'en' || reqLang === 'bm') ? reqLang : '';

    return pub.evaluate()
      .setTitle(settings.SYSTEM_SHORT_NAME)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setFaviconUrl(settings.FAVICON_URL ||
        'https://ssl.gstatic.com/docs/script/images/favicon.ico')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  if (settings.MAINTENANCE_MODE) {
    var user = Auth.getCurrentUser();
    if (!user || user.role !== ROLES.ADMIN) {
      return HtmlService.createHtmlOutput(
        '<div style="font-family:sans-serif;padding:40px;text-align:center">' +
        '<h2>' + Security.escapeHtml(settings.SYSTEM_SHORT_NAME) + '</h2><p>' +
        Security.escapeHtml(settings.MAINTENANCE_MESSAGE) + '</p></div>');
    }
  }

  var template = HtmlService.createTemplateFromFile('Index');
  /*
   * Pautan kongsi menggunakan ?id= sahaja, tanpa parameter page. Apabila
   * pengguna UTM yang log masuk mengklik pautan itu, mereka mendapat
   * aplikasi dalaman — dan sepatutnya dibawa terus kepada berita berkenaan,
   * bukan papan pemuka.
   */
  template.bootPage = String(e.parameter.page ||
    (e.parameter.id ? 'portal-article' : 'dashboard'));
  template.bootId = String(e.parameter.id || '');

  return template.evaluate()
    .setTitle(settings.SYSTEM_SHORT_NAME)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setFaviconUrl(settings.FAVICON_URL || 'https://ssl.gstatic.com/docs/script/images/favicon.ico')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** Sertakan fail HTML lain (css, js, views) ke dalam Index */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/* ------------------------------------------------------------------- API */

/**
 * Penghala API tunggal.
 * @param {string} action nama tindakan
 * @param {Object} payload data
 * @returns {{ok:boolean, data:*}|{ok:false, error:{code,message}}}
 */
function api(action, payload) {
  try {
    // 1. AUTHENTICATE (sesi Google, URL /exec)
    var user = Auth.requireUser();
    return apiAs_(user, action, payload);
  } catch (err) {
    return Security.safeError(err);
  }
}

/**
 * Laksanakan satu tindakan API bagi pengguna yang SUDAH disahkan.
 * Dikongsi oleh api() (sesi Google) dan apiWeb_() (sesi OTP, WebAuth.gs).
 */
function apiAs_(user, action, payload) {
  payload = payload || {};
  try {
    // 2. HAD KADAR — lindungi daripada gelung tak terkawal dan penyalahgunaan
    enforceRateLimit_(user, action);

    // Tetapkan mod render supaya warna status sepadan dengan tema pengguna
    GlobalSettings.setRenderMode(resolveRenderMode_(payload));

    // 3. ROUTE + AUTHORIZE + VALIDATE + EXECUTE
    var data = route_(action, payload, user);

    // 4. SAFE RESPONSE
    return { ok: true, data: data };

  } catch (err) {
    return Security.safeError(err);
  }
}

function route_(action, p, user) {
  switch (action) {

    /* ---------- Sesi & konfigurasi ---------- */
    case 'session.bootstrap':
      Auth.touchLogin(user);
      AuditService.log(user.userId, AUDIT_ACTION.LOGIN, 'SESSION', user.userId, '', '',
        'Log masuk');
      return {
        user: {
          userId: user.userId, name: user.name, email: user.email,
          role: user.role, realRole: user.realRole, isActing: !!user.isActing,
          department: user.department, position: user.position
        },
        settings: GlobalSettings.getPublicSettings(),
        categories: NewsService.listCategories(true),
        statuses: GlobalSettings.get('ENABLED_STATUSES').map(function (s) {
          return { value: s, label: GlobalSettings.statusLabel(s),
            color: GlobalSettings.statusColor(s) };
        }),
        unreadNotifications: NotificationService.unreadCount(user.userId),
        permissions: permissionSnapshot_(user),
        themeMode: getThemeMode_()
      };

    case 'session.setTheme':
      return setThemeMode_(p.mode);

    case 'session.setActingRole':
      var switched = Auth.setActingRole(user.realRole, p.role);
      AuditService.log(user.userId, 'ROLE_SWITCH', 'SESSION', user.userId,
        user.role, switched.role, 'Mod ujian: bertukar peranan');
      return switched;

    case 'session.ping':
      return { unread: NotificationService.unreadCount(user.userId), time: Utils.nowIso() };

    /* ---------- Portal pembaca ---------- */
    case 'portal.home':
      return PortalService.getHome(user, p.options);

    case 'portal.list':
      return PortalService.list(p.filters, p.page, p.pageSize);

    case 'portal.article':
      return PortalService.getArticle(p.newsId, p.countView !== false);

    /* ---------- Papan pemuka ---------- */
    case 'dashboard.get':
      return DashboardService.getDashboard(user, p.filters);

    /* ---------- Berita ---------- */
    case 'news.list':
      return NewsService.list(user, p.filters, p.page, p.pageSize);

    case 'news.detail':
      return NewsService.getDetail(user, p.newsId);

    case 'news.create':
      return NewsService.create(user, p.data);

    case 'news.update':
      return NewsService.update(user, p.newsId, p.data);

    case 'news.delete':
      return NewsService.remove(user, p.newsId);

    case 'news.versions':
      Security.requireViewNews(user, NewsService.getRaw(p.newsId));
      return NewsService.getVersions(p.newsId);

    /* ---------- Workflow ---------- */
    case 'workflow.actions':
      var n = NewsService.getRaw(p.newsId);
      Security.requireViewNews(user, n);
      return WorkflowService.getAvailableActions(user, n);

    case 'workflow.transition':
      return WorkflowService.transitionNews(user, p.newsId, p.action, p.comments);

    case 'workflow.stateMachine':
      return WorkflowService.describeStateMachine();

    /* ---------- Gambar ---------- */
    case 'image.list':
      Security.requireViewNews(user, NewsService.getRaw(p.newsId));
      return ImageService.listForNews(p.newsId);

    case 'image.upload':
      return ImageService.uploadImages(user, p.newsId, p.files);

    case 'image.update':
      return ImageService.updateImage(user, p.imageId, p.patch || {});

    case 'image.setFeatured':
      return ImageService.setFeatured(user, p.imageId);

    case 'image.toggleSocial':
      return ImageService.toggleSocialSelection(user, p.imageId, p.selected);

    case 'image.reorder':
      return ImageService.reorder(user, p.newsId, p.orderedImageIds || []);

    case 'image.remove':
      return ImageService.removeImage(user, p.imageId);

    /* ---------- Pustaka media ---------- */
    case 'media.list':
      return MediaService.list(user, p.filters, p.page, p.pageSize);

    case 'media.sources':
      return MediaService.sources(user);

    /* ---------- Lampiran ---------- */
    case 'attachment.list':
      Security.requireViewNews(user, NewsService.getRaw(p.newsId));
      return DriveService.listFiles(p.newsId, 'attachment');

    case 'attachment.upload':
      var newsForAttach = NewsService.getRaw(p.newsId);
      Security.requireEditNews(user, newsForAttach);
      return DriveService.uploadFile(p.newsId, p.file, 'attachment', user.userId);

    case 'attachment.remove':
      var newsForRemove = NewsService.getRaw(p.newsId);
      Security.requireEditNews(user, newsForRemove);
      return DriveService.removeFile(p.fileId, p.newsId, user.userId);

    /* ---------- Media sosial ---------- */
    case 'social.preview':
      var newsForPreview = NewsService.getRaw(p.newsId);
      Security.requireViewNews(user, newsForPreview);
      return {
        caption: SocialService.buildCaption(newsForPreview, p.hashtags),
        images: ImageService.listSelectedForSocial(p.newsId,
          GlobalSettings.get('SOCIAL_MAX_IMAGES_IG')),
        history: SocialService.historyForNews(p.newsId)
      };

    case 'social.publish':
      return SocialService.publish(user, p.newsId, p.platforms, p.options || {});

    case 'social.history':
      Security.requireViewNews(user, NewsService.getRaw(p.newsId));
      return SocialService.historyForNews(p.newsId);

    case 'social.configStatus':
      return SocialService.getConfigStatus(user);

    case 'social.saveCredentials':
      return SocialService.saveCredentials(user, p.data || {});

    case 'social.testConnection':
      return SocialService.testConnection(user);

    /* ---------- Pembantu AI (F8) ---------- */
    case 'ai.status':
      return AiService.status();

    case 'ai.draft':
      Security.requirePermission(user, 'news.create');
      return AiService.draft(user, p.notes, p.categoryName);

    case 'ai.review':
      var newsForReview = NewsService.getRaw(p.newsId);
      Security.requireViewNews(user, newsForReview);
      if (user.role !== ROLES.ADMIN && user.role !== ROLES.EDITOR) {
        throw Utils.appError('FORBIDDEN', 'Semakan AI untuk Admin dan Editor sahaja.');
      }
      return AiService.review(user, NewsService.getDetail(user, p.newsId));

    case 'ai.translate':
      var newsForTr = NewsService.getRaw(p.newsId);
      Security.requireViewNews(user, newsForTr);
      if (!NewsService.canEditEnglish(user, newsForTr)) {
        throw Utils.appError('FORBIDDEN', 'Anda tidak boleh mengubah versi Inggeris berita ini.');
      }
      return AiService.translate(user, NewsService.getDetail(user, p.newsId));

    case 'ai.social':
      var newsForSoc = NewsService.getRaw(p.newsId);
      Security.requireViewNews(user, newsForSoc);
      if (user.role !== ROLES.ADMIN && user.role !== ROLES.EDITOR) {
        throw Utils.appError('FORBIDDEN', 'Kapsyen AI untuk Admin dan Editor sahaja.');
      }
      return AiService.social(user, NewsService.getDetail(user, p.newsId));

    /* ---------- Notifikasi push (F11) ---------- */
    case 'push.status':
      return PushService.status(user);

    case 'push.register':
      return PushService.registerUser(user, p.token, p.device);

    case 'push.unregister':
      return PushService.unregisterUser(user, p.token);

    case 'push.test':
      return PushService.test(user);

    /* ---------- Buletin bulanan (F10) ---------- */
    case 'bulletin.status':
      requireStaffRole_(user, [ROLES.ADMIN, ROLES.EDITOR], 'Buletin');
      return BulletinService.status();

    case 'bulletin.preview':
      requireStaffRole_(user, [ROLES.ADMIN, ROLES.EDITOR], 'Buletin');
      var bul = BulletinService.render(p.month);
      return { month: bul.month, label: bul.label, count: bul.count, subject: bul.subject, html: bul.html };

    case 'bulletin.pdf':
      requireStaffRole_(user, [ROLES.ADMIN, ROLES.EDITOR], 'Buletin');
      return BulletinService.pdf(p.month);

    case 'bulletin.send':
      requireStaffRole_(user, [ROLES.ADMIN], 'Menghantar buletin');
      return BulletinService.send(p.month, { userId: user.userId, allowEmpty: false });

    case 'news.saveEnglish':
      return NewsService.saveEnglish(user, p.newsId, p.data || {});

    /* ---------- Notifikasi ---------- */
    case 'notification.list':
      return NotificationService.listForUser(user.userId, p.onlyUnread, p.page, p.pageSize);

    case 'notification.markRead':
      return NotificationService.markRead(p.notificationId, user.userId);

    case 'notification.markAllRead':
      return NotificationService.markAllRead(user.userId);

    /* ---------- Pengguna ---------- */
    case 'user.list':
      Security.requirePermission(user, 'user.manage');
      return UserService.list(p.filters, p.page, p.pageSize);

    case 'user.create':
      Security.requirePermission(user, 'user.manage');
      var createdUser = UserService.createUser(p.data, user.userId);
      NotificationService.sendWelcome(createdUser);
      return createdUser;

    case 'user.update':
      Security.requirePermission(user, 'user.manage');
      UserService.assertNotLastAdmin(p.userId, p.data.role, p.data.status);
      return UserService.updateUser(p.userId, p.data, user.userId);

    /* ---------- Kategori ---------- */
    case 'category.list':
      return NewsService.listCategories(p.activeOnly !== false);

    case 'category.save':
      var savedCat = NewsService.saveCategory(user, p.data);
      StaticSite.markDirty('kategori');
      return savedCat;

    /* ---------- Tetapan ---------- */
    case 'settings.schema':
      Security.requirePermission(user, 'settings.manage');
      return GlobalSettings.getSchemaMeta();

    case 'settings.update':
      Security.requirePermission(user, 'settings.manage');
      var updated = GlobalSettings.updateGlobalSetting(p.key, p.value, user.userId);
      StaticSite.markDirty('tetapan ' + p.key);
      AuditService.log(user.userId, AUDIT_ACTION.UPDATE_SETTING, 'SETTING', p.key, '', '',
        'Tetapan dikemas kini: ' + p.key);
      return { key: p.key, value: updated };

    case 'settings.public':
      return GlobalSettings.getPublicSettings();

    /* ---------- Kad ucapan ----------
       Kebenaran 'settings.manage' disemak di dalam GreetingCardService,
       bukan di sini — supaya tiada laluan lain boleh memanggil servis itu
       tanpa semakan yang sama. */
    case 'greeting.list':
      return GreetingCardService.list(user);

    case 'greeting.save':
      var savedCard = GreetingCardService.save(user, p.data || {});
      StaticSite.markDirty('kad ucapan');
      return savedCard;

    case 'greeting.remove':
      var removedCard = GreetingCardService.remove(user, p.cardId);
      StaticSite.markDirty('kad ucapan');
      return removedCard;

    /* ---------- Audit ---------- */
    case 'audit.list':
      if (user.role === ROLES.ADMIN) Security.requirePermission(user, 'audit.view.all');
      else Security.requirePermission(user, 'audit.view.limited');
      return AuditService.list(p.filters, p.page, p.pageSize);

    /* ---------- Laporan ---------- */
    case 'report.summary':
      return ReportService.summary(user, p.filters);

    case 'report.exportCsv':
      return ReportService.exportNewsCsv(user, p.filters);

    default:
      throw Utils.appError('UNKNOWN_ACTION', 'Tindakan tidak dikenali: ' + action);
  }
}

/** Snapshot permission untuk UI — UI sembunyikan butang, server tetap menguatkuasa */
function permissionSnapshot_(user) {
  var out = {};
  Object.keys(PERMISSIONS).forEach(function (key) {
    out[key] = Security.hasPermission(user.role, key);
  });
  return out;
}


/* ------------------------------------------------------------------ Tema */

/**
 * Mod tema disimpan dalam User Properties — pilihan peribadi setiap pengguna,
 * bukan tetapan sistem. Tidak menjejaskan pengguna lain.
 */
function getThemeMode_() {
  try {
    var saved = UserPrefs.get('FKMNEWS_THEME');
    if (saved === 'light' || saved === 'dark' || saved === 'system') return saved;
  } catch (e) { }
  return GlobalSettings.get('DEFAULT_THEME_MODE');
}

/**
 * Mod render untuk permintaan ini. Klien menghantar mod berkesan (selepas
 * 'system' diterjemah); jika tiada, jatuh balik kepada pilihan tersimpan.
 */
function resolveRenderMode_(payload) {
  if (payload && (payload.renderMode === 'dark' || payload.renderMode === 'light')) {
    return payload.renderMode;
  }
  var saved = getThemeMode_();
  return saved === 'dark' ? 'dark' : 'light';
}

function setThemeMode_(mode) {
  var allowed = ['light', 'dark', 'system'];
  if (allowed.indexOf(String(mode)) === -1) {
    throw Utils.appError('VALIDATION', 'Mod tema tidak sah.');
  }
  UserPrefs.set('FKMNEWS_THEME', String(mode));
  return { mode: String(mode) };
}


/* ------------------------------------------------------------ Had kadar */

/**
 * Had kadar per pengguna, menggunakan CacheService.
 *
 * Tujuannya bukan menghalang penyerang yang tekun — kaunter dalam cache
 * boleh luput dan boleh dipintas. Tujuannya ialah menangkap gelung klien
 * yang rosak, klik berulang yang tidak disengajakan, dan skrip yang
 * memanggil API beribu kali. Perlindungan sebenar kekal pada semakan
 * kebenaran di setiap laluan API.
 *
 * Operasi tulis dihadkan lebih ketat daripada bacaan.
 */
function enforceRateLimit_(user, action) {
  var isWrite = /\.(create|update|delete|save|upload|remove|transition|publish|markRead|markAllRead|setTheme|setActingRole|reorder|setFeatured|toggleSocial|saveCredentials|saveEnglish|draft|review|translate|social|send|pdf|register|unregister|test)$/.test(action);

  var limit = isWrite ? 60 : 300;   // setiap tetingkap
  var windowSeconds = 60;

  var cache;
  try { cache = CacheService.getUserCache(); } catch (e) { return; }
  if (!cache) return;

  var key = 'RL_' + (isWrite ? 'W_' : 'R_') + user.userId;
  var current = 0;

  try {
    current = parseInt(cache.get(key) || '0', 10);
  } catch (e) { return; }

  if (current >= limit) {
    AuditService.log(user.userId, 'RATE_LIMIT', 'API', action, '', '',
      'Had kadar dicapai: ' + current + ' panggilan dalam ' + windowSeconds + ' saat');
    throw Utils.appError('RATE_LIMIT',
      'Terlalu banyak permintaan dalam masa singkat. Tunggu seminit dan cuba lagi.');
  }

  try {
    cache.put(key, String(current + 1), windowSeconds);
  } catch (e) { /* cache tidak tersedia — teruskan tanpa had */ }
}

/** Hadkan tindakan kepada peranan tertentu (peranan bertindak, seperti semakan lain). */
function requireStaffRole_(user, roles, what) {
  if (!user || roles.indexOf(user.role) === -1) {
    throw Utils.appError('FORBIDDEN', what + ' untuk ' + roles.map(function (r) {
      return r === ROLES.ADMIN ? 'Admin' : r === ROLES.EDITOR ? 'Editor' : r;
    }).join(' dan ') + ' sahaja.');
  }
}
