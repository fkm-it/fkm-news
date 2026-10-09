/**
 * Auth.gs
 * Pengenalan identiti pengguna.
 * Identiti diambil dari sesi Google (Session.getActiveUser()) — tiada kata laluan
 * disimpan oleh sistem. Pemetaan e-mel → role dibuat melalui sheet USERS.
 */

var Auth = (function () {

  /**
   * E-mel pengguna aktif daripada sesi Google.
   *
   * JANGAN SEKALI-KALI jatuh balik kepada Session.getEffectiveUser() di sini.
   *
   * Dengan tetapan "Execute as: Me", pengguna berkesan sentiasa pemilik
   * skrip. Jika fungsi ini jatuh balik kepadanya, setiap pelawat tanpa akaun
   * pada deployment awam akan dikenali sebagai pemilik — dan diberi capaian
   * Pentadbir penuh. Rentetan kosong adalah jawapan yang BETUL bagi pelawat
   * anonim; doGet menggunakannya untuk menghidangkan halaman awam.
   *
   * Untuk skrip yang dijalankan dari editor, gunakan getScriptOwnerEmail().
   */
  function getActiveEmail() {
    var email = '';
    try { email = Session.getActiveUser().getEmail(); } catch (e) { email = ''; }
    return String(email || '').trim().toLowerCase();
  }

  /**
   * Pemilik skrip. Hanya untuk fungsi persediaan yang dijalankan secara
   * manual dari editor Apps Script — tidak pernah untuk pengenalan pengguna
   * dalam permintaan web.
   */
  function getScriptOwnerEmail() {
    try { return String(Session.getEffectiveUser().getEmail() || '').toLowerCase(); }
    catch (e) { return ''; }
  }

  function isDomainAllowed(email) {
    if (!GlobalSettings.get('REQUIRE_DOMAIN')) return true;
    var domains = GlobalSettings.get('ALLOWED_DOMAINS') || [];
    if (!domains.length) return true;
    var domain = email.split('@')[1] || '';
    return domains.some(function (d) {
      d = String(d).toLowerCase();
      return domain === d || domain.indexOf('.' + d) === domain.length - d.length - 1;
    });
  }

  /**
   * Pengguna semasa, atau null jika tidak dibenarkan.
   * Melakukan auto-register jika AUTO_REGISTER_AUTHOR diaktifkan.
   */
  function getCurrentUser() {
    var email = getActiveEmail();
    if (!email) return null;

    var user = SheetDB.findOneBy(CONFIG.SHEETS.USERS, 'Email', email);

    if (!user) {
      if (!isDomainAllowed(email)) return null;
      if (!GlobalSettings.get('AUTO_REGISTER_AUTHOR')) return null;
      user = UserService.createUser({
        email: email,
        name: email.split('@')[0],
        role: ROLES.AUTHOR,
        department: '',
        position: ''
      }, 'SYSTEM');
      user = SheetDB.findOneBy(CONFIG.SHEETS.USERS, 'Email', email);
    }

    if (!user) return null;
    if (String(user.Status).toUpperCase() !== USER_STATUS.ACTIVE) return null;
    if (!isDomainAllowed(email)) return null;

    var realRole = String(user.Role).toUpperCase();
    var actingRole = resolveActingRole(realRole);

    return {
      userId: String(user.UserID),
      email: String(user.Email),
      name: String(user.Name),
      role: actingRole,
      realRole: realRole,
      isActing: actingRole !== realRole,
      department: String(user.Department || ''),
      position: String(user.Position || ''),
      _row: user._row
    };
  }

  /**
   * Peranan ujian.
   *
   * Hanya seorang ADMIN boleh menukar peranannya sendiri, dan hanya apabila
   * TEST_MODE_ENABLED dihidupkan. Identiti pengguna TIDAK pernah bertukar —
   * hanya peranan. Ini bermakna tiada penyamaran: Za kekal Za, cuma sistem
   * melayannya sebagai Penulis atau Editor bagi tujuan ujian aliran kerja.
   *
   * Pilihan disimpan dalam User Properties, jadi ia peribadi kepada pengguna
   * itu sahaja dan tidak menjejaskan sesiapa.
   */
  function resolveActingRole(realRole) {
    if (realRole !== ROLES.ADMIN) return realRole;

    var enabled;
    try { enabled = GlobalSettings.get('TEST_MODE_ENABLED'); } catch (e) { return realRole; }
    if (!enabled) return realRole;

    var acting = '';
    try {
      acting = PropertiesService.getUserProperties().getProperty('FKMNEWS_ACT_AS') || '';
    } catch (e) { return realRole; }

    if ([ROLES.AUTHOR, ROLES.EDITOR, ROLES.ADMIN].indexOf(acting) === -1) return realRole;
    return acting;
  }

  /** Tetapkan peranan ujian. Dipanggil hanya melalui API, oleh ADMIN sebenar. */
  function setActingRole(realRole, role) {
    if (realRole !== ROLES.ADMIN) {
      throw Utils.appError('FORBIDDEN', 'Hanya Pentadbir boleh menukar peranan ujian.');
    }
    if (!GlobalSettings.get('TEST_MODE_ENABLED')) {
      throw Utils.appError('FORBIDDEN',
        'Mod ujian tidak diaktifkan. Hidupkan TEST_MODE_ENABLED dalam Tetapan > Keselamatan.');
    }
    if ([ROLES.AUTHOR, ROLES.EDITOR, ROLES.ADMIN].indexOf(String(role)) === -1) {
      throw Utils.appError('VALIDATION', 'Peranan tidak sah.');
    }
    PropertiesService.getUserProperties().setProperty('FKMNEWS_ACT_AS', String(role));
    return { role: String(role) };
  }

  /** Pengguna semasa atau lempar ralat — untuk API yang memerlukan identiti */
  function requireUser() {
    var user = getCurrentUser();
    if (!user) {
      throw Utils.appError('UNAUTHENTICATED',
        'Akaun anda tiada akses kepada sistem ini. Sila hubungi Admin Unit IT FKM.');
    }
    return user;
  }

  /** Catat masa log masuk terakhir (dipanggil sekali setiap sesi baharu) */
  function touchLogin(user) {
    try {
      SheetDB.updateRow(CONFIG.SHEETS.USERS, user._row, { LastLogin: Utils.now() });
    } catch (e) { /* bukan kritikal */ }
  }

  return {
    resolveActingRole: resolveActingRole,
    setActingRole: setActingRole,
    getActiveEmail: getActiveEmail,
    getScriptOwnerEmail: getScriptOwnerEmail,
    isDomainAllowed: isDomainAllowed,
    getCurrentUser: getCurrentUser,
    requireUser: requireUser,
    touchLogin: touchLogin
  };
})();