/**
 * SecurityTest.gs
 * ============================================================================
 * Ujian keselamatan automatik.
 *
 * Apa yang fail ini boleh sahkan: bahawa matriks kebenaran, state machine,
 * pembersihan input dan guard suntikan formula berkelakuan seperti yang
 * ditakrifkan dalam kod.
 *
 * Apa yang ia TIDAK boleh sahkan: bahawa takrifan itu sendiri betul untuk
 * keperluan FKM, atau bahawa tiada kelemahan yang belum terfikir. Ujian
 * automatik mengesahkan andaian yang sudah kita buat — ia tidak menemui
 * andaian yang tersilap. Semakan manusia tetap diperlukan.
 *
 * Jalankan runSecurityTests() dari editor Apps Script.
 * ============================================================================
 */

function runSecurityTests() {
  var results = [];

  function check(name, condition, detail) {
    results.push({ name: name, pass: !!condition, detail: detail || '' });
  }

  function expectThrow(name, fn) {
    try {
      fn();
      check(name, false, 'Sepatutnya ditolak, tetapi dibenarkan.');
    } catch (e) {
      check(name, true, e.message);
    }
  }

  /* ---------------- Matriks kebenaran ---------------- */

  check('Penulis tidak boleh menerbitkan',
    !Security.hasPermission(ROLES.AUTHOR, 'news.publish'));

  check('Penulis tidak boleh mengurus pengguna',
    !Security.hasPermission(ROLES.AUTHOR, 'user.manage'));

  check('Penulis tidak boleh mengubah tetapan',
    !Security.hasPermission(ROLES.AUTHOR, 'settings.manage'));

  check('Penulis tidak boleh melihat semua berita',
    !Security.hasPermission(ROLES.AUTHOR, 'news.view.all'));

  check('Editor tidak boleh mengurus pengguna',
    !Security.hasPermission(ROLES.EDITOR, 'user.manage'));

  check('Editor tidak boleh mengubah tetapan',
    !Security.hasPermission(ROLES.EDITOR, 'settings.manage'));

  check('Admin tidak boleh menerbitkan',
    !Security.hasPermission(ROLES.ADMIN, 'news.publish'),
    'Penerbitan ialah keputusan Editor sahaja.');

  check('Admin tidak boleh membuat semakan peringkat Editor',
    !Security.hasPermission(ROLES.ADMIN, 'review.editor'));

  check('Editor tidak boleh membuat semakan peringkat Admin',
    !Security.hasPermission(ROLES.EDITOR, 'review.admin'));

  check('Editor boleh menerbitkan',
    Security.hasPermission(ROLES.EDITOR, 'news.publish'));

  check('Admin boleh mengurus pengguna',
    Security.hasPermission(ROLES.ADMIN, 'user.manage'));

  check('Permission tidak dikenali ditolak',
    !Security.hasPermission(ROLES.ADMIN, 'permission.tidak.wujud'));

  /* ---------------- State machine ---------------- */

  var author = { userId: 'TEST-AUTHOR', role: ROLES.AUTHOR, name: 'Ujian' };
  var admin  = { userId: 'TEST-ADMIN',  role: ROLES.ADMIN,  name: 'Ujian' };
  var editor = { userId: 'TEST-EDITOR', role: ROLES.EDITOR, name: 'Ujian' };

  function fakeNews(status, extra) {
    var n = {
      NewsID: 'NEWS-TEST-00001', Title: 'Tajuk ujian yang cukup panjang',
      Summary: 'Ringkasan ujian.', Content: 'Kandungan ujian yang cukup panjang untuk lulus.',
      CategoryID: 'CAT-001', AuthorID: 'TEST-AUTHOR', Status: status,
      PublishedAt: '', CurrentVersion: 1
    };
    Object.keys(extra || {}).forEach(function (k) { n[k] = extra[k]; });
    return n;
  }

  check('Penulis tidak boleh terus menerbitkan dari Draf',
    !WorkflowService.canTransition(author, fakeNews(STATUS.DRAFT), 'PUBLISH').allowed);

  check('Penulis tidak boleh meluluskan',
    !WorkflowService.canTransition(author, fakeNews(STATUS.EDITOR_REVIEW), 'APPROVE').allowed);

  check('Admin tidak boleh meluluskan di peringkat Editor',
    !WorkflowService.canTransition(admin, fakeNews(STATUS.EDITOR_REVIEW), 'APPROVE').allowed);

  check('Editor tidak boleh membuat semakan peringkat Admin',
    !WorkflowService.canTransition(editor, fakeNews(STATUS.ADMIN_REVIEW), 'FORWARD_TO_EDITOR').allowed);

  check('Penulis lain tidak boleh menghantar berita bukan miliknya',
    !WorkflowService.canTransition(
      { userId: 'ORANG-LAIN', role: ROLES.AUTHOR },
      fakeNews(STATUS.DRAFT), 'SUBMIT').allowed);

  check('Transisi tidak sah bagi status semasa ditolak',
    !WorkflowService.canTransition(editor, fakeNews(STATUS.DRAFT), 'PUBLISH').allowed);

  check('Berita ditolak yang diarkib tidak boleh dinyahkarkib',
    !WorkflowService.canTransition(admin, fakeNews(STATUS.ARCHIVED), 'UNARCHIVE').allowed,
    'PublishedAt kosong bermakna ia tidak pernah diterbitkan.');

  check('Berita terbit yang diarkib boleh dinyahkarkib',
    WorkflowService.canTransition(admin,
      fakeNews(STATUS.ARCHIVED, { PublishedAt: new Date() }), 'UNARCHIVE').allowed);

  check('Status ARCHIVED tiada laluan ke Draf',
    !WorkflowService.canTransition(admin,
      fakeNews(STATUS.ARCHIVED, { PublishedAt: new Date() }), 'SUBMIT').allowed);

  /* ---------------- Pembersihan input ---------------- */

  var xss = Security.sanitizeHtml('<p>Selamat</p><script>alert(1)</script>');
  check('Tag script dibuang', xss.indexOf('script') === -1, xss);

  var onerror = Security.sanitizeHtml('<img src=x onerror="alert(1)">');
  check('Atribut onerror dibuang', onerror.indexOf('onerror') === -1, onerror);

  var jsproto = Security.sanitizeHtml('<a href="javascript:alert(1)">pautan</a>');
  check('Protokol javascript: dineutralkan', jsproto.indexOf('javascript:') === -1, jsproto);

  var iframe = Security.sanitizeHtml('<iframe src="https://contoh.com"></iframe>');
  check('Iframe dibuang', iframe.indexOf('iframe') === -1, iframe);

  var styleAttr = Security.sanitizeHtml('<p style="position:fixed">teks</p>');
  check('Atribut style dibuang', styleAttr.indexOf('style') === -1, styleAttr);

  var kept = Security.sanitizeHtml('<p><strong>tebal</strong> dan <em>condong</em></p>');
  check('Format sah dikekalkan',
    kept.indexOf('strong') !== -1 && kept.indexOf('em') !== -1, kept);

  check('Teks biasa membuang semua tag',
    Security.sanitizeText('<b>tebal</b>') === 'tebal');

  /* ---------------- Suntikan formula ---------------- */

  check('Formula = diprefiks', String(SheetDB.safeCell('=1+1')).charAt(0) === "'");
  check('Formula + diprefiks', String(SheetDB.safeCell('+A1')).charAt(0) === "'");
  check('Formula - diprefiks', String(SheetDB.safeCell('-A1')).charAt(0) === "'");
  check('Formula @ diprefiks', String(SheetDB.safeCell('@SUM')).charAt(0) === "'");
  check('Teks biasa tidak diubah', SheetDB.safeCell('Berita FKM') === 'Berita FKM');
  check('Tarikh tidak diubah', SheetDB.safeCell(new Date()) instanceof Date);

  /* ---------------- Tetapan awam ---------------- */

  var pub = GlobalSettings.getPublicSettings();
  var secrets = ['ADMIN_EMAIL', 'ALLOWED_DOMAINS', 'MAX_LOGIN_ATTEMPTS',
    'EMAIL_ENABLED', 'REQUIRE_DOMAIN', 'AUTO_REGISTER_AUTHOR',
    'SOCIAL_GRAPH_VERSION', 'SOCIAL_IMAGE_PUBLIC_MODE', 'AUDIT_RETENTION_DAYS'];

  secrets.forEach(function (key) {
    check('Tetapan sulit tidak didedahkan: ' + key, pub[key] === undefined);
  });

  check('Tetapan awam mengandungi tema', pub.PRIMARY_COLOR !== undefined);

  /* ---------------- Validasi ---------------- */

  expectThrow('Tajuk kosong ditolak', function () {
    Validation.validateNews({ title: '', summary: '', content: '' }, false);
  });

  expectThrow('Tajuk terlalu panjang ditolak', function () {
    var long = new Array(GlobalSettings.get('MAX_TITLE_LENGTH') + 50).join('a');
    Validation.validateNews({ title: long }, false);
  });

  expectThrow('Penghantaran tanpa kategori ditolak', function () {
    Validation.validateNews({
      title: 'Tajuk yang cukup panjang untuk lulus',
      summary: 'Ringkasan.', content: 'Kandungan.', categoryId: ''
    }, true);
  });

  expectThrow('Fail .exe ditolak', function () {
    Validation.validateUpload({ name: 'virus.exe', data: 'AAAA' }, 'attachment');
  });

  expectThrow('Peranan tidak sah ditolak', function () {
    Validation.validateUser({ name: 'Ujian', email: 'a@utm.my', role: 'SUPERUSER' }, true);
  });

  expectThrow('Komen pembetulan terlalu pendek ditolak', function () {
    Validation.validateReviewComment('REQUEST_REVISION', 'ok');
  });

  /* ---------------- Laluan awam ---------------- */

  /*
   * Ujian ini wujud kerana satu pepijat sebenar: getActiveEmail() pernah
   * jatuh balik kepada getEffectiveUser(), yang menyebabkan setiap pelawat
   * anonim dikenali sebagai pemilik skrip dan diberi capaian Pentadbir.
   * Ujian di bawah memastikan laluan awam tidak boleh menyentuh apa-apa
   * tindakan pengurusan, walaupun pengenalan identiti tersilap lagi.
   */

  check('getActiveEmail tidak jatuh balik kepada pemilik skrip',
    Auth.getActiveEmail !== undefined &&
    String(Auth.getActiveEmail.toString()).indexOf('getEffectiveUser') === -1,
    'Fallback kepada getEffectiveUser memberi capaian penuh kepada pelawat anonim.');

  var blockedPublicActions = [
    'user.list', 'user.create', 'user.update',
    'news.list', 'news.create', 'news.update', 'news.delete',
    'settings.schema', 'settings.update', 'audit.list',
    'workflow.transition', 'media.list', 'social.configStatus',
    'dashboard.get', 'report.exportCsv', 'session.bootstrap'
  ];

  blockedPublicActions.forEach(function (action) {
    var res = publicApi(action, {});
    check('Laluan awam menolak: ' + action, res && res.ok === false,
      res && res.ok ? 'DIBENARKAN — ini pendedahan data.' : '');
  });

  check('Laluan awam membenarkan bacaan berita terbit',
    (function () {
      if (!GlobalSettings.get('PUBLIC_PORTAL_ENABLED')) return true; // dimatikan, tiada apa diuji
      var res = publicApi('public.home', {});
      return res && res.ok === true;
    })(),
    GlobalSettings.get('PUBLIC_PORTAL_ENABLED') ? '' : 'Portal awam dimatikan — dilangkau.');

  /* ---------------- Integriti data ---------------- */

  try {
    var admins = UserService.getActiveByRole(ROLES.ADMIN);
    check('Sekurang-kurangnya seorang Admin aktif', admins.length >= 1,
      admins.length + ' Admin');

    var editors = UserService.getActiveByRole(ROLES.EDITOR);
    check('Sekurang-kurangnya seorang Editor aktif', editors.length >= 1,
      editors.length + ' Editor — tanpa Editor, tiada berita boleh diterbitkan.');

    var emails = {};
    var duplicates = [];
    SheetDB.findAll(CONFIG.SHEETS.USERS).forEach(function (u) {
      var e = String(u.Email).toLowerCase();
      if (emails[e]) duplicates.push(e);
      emails[e] = true;
    });
    check('Tiada e-mel pengguna berganda', duplicates.length === 0, duplicates.join(', '));

    check('Mod ujian dimatikan', !GlobalSettings.get('TEST_MODE_ENABLED'),
      'Hidupkan hanya semasa ujian, matikan dalam produksi.');

  } catch (e) {
    check('Semakan integriti data', false, e.message);
  }

  /* ---------------- Laporan ---------------- */

  var passed = results.filter(function (r) { return r.pass; }).length;
  var failed = results.filter(function (r) { return !r.pass; });

  var lines = [];
  lines.push('UJIAN KESELAMATAN — ' + passed + '/' + results.length + ' lulus');
  lines.push('');

  if (failed.length) {
    lines.push('GAGAL:');
    failed.forEach(function (r) {
      lines.push('  [X] ' + r.name + (r.detail ? ' — ' + r.detail : ''));
    });
    lines.push('');
  }

  lines.push('LULUS:');
  results.filter(function (r) { return r.pass; }).forEach(function (r) {
    lines.push('  [/] ' + r.name);
  });

  var report = lines.join('\n');
  console.log(report);
  return report;
}