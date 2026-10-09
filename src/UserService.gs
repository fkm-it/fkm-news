/**
 * UserService.gs
 * Pengurusan pengguna dan pemetaan peranan.
 */

var UserService = (function () {

  var _map = null;

  function toDto(u) {
    return {
      userId: String(u.UserID),
      email: String(u.Email),
      name: String(u.Name),
      role: String(u.Role).toUpperCase(),
      department: String(u.Department || ''),
      position: String(u.Position || ''),
      status: String(u.Status || '').toUpperCase(),
      createdAt: Utils.formatDateTime(u.CreatedAt),
      lastLogin: u.LastLogin ? Utils.formatDateTime(u.LastLogin) : '—'
    };
  }

  /** Peta UserID → { name, email, role } untuk rujukan pantas */
  function getUserMap(force) {
    if (_map && !force) return _map;
    _map = {};
    SheetDB.findAll(CONFIG.SHEETS.USERS).forEach(function (u) {
      _map[String(u.UserID)] = {
        name: String(u.Name),
        email: String(u.Email),
        role: String(u.Role).toUpperCase(),
        status: String(u.Status).toUpperCase()
      };
    });
    return _map;
  }

  function getById(userId) {
    var u = SheetDB.findOneBy(CONFIG.SHEETS.USERS, 'UserID', userId);
    return u ? toDto(u) : null;
  }

  function getByEmail(email) {
    var u = SheetDB.findOneBy(CONFIG.SHEETS.USERS, 'Email', String(email).toLowerCase());
    return u ? toDto(u) : null;
  }

  /** Semua pengguna aktif dengan peranan tertentu */
  function getActiveByRole(role) {
    return SheetDB.findWhere(CONFIG.SHEETS.USERS, function (u) {
      return String(u.Role).toUpperCase() === String(role).toUpperCase()
        && String(u.Status).toUpperCase() === USER_STATUS.ACTIVE;
    }).map(toDto);
  }

  function list(filters, page, pageSize) {
    filters = filters || {};
    var rows = SheetDB.findAll(CONFIG.SHEETS.USERS).map(toDto);

    if (filters.role) rows = rows.filter(function (u) { return u.role === String(filters.role).toUpperCase(); });
    if (filters.status) rows = rows.filter(function (u) { return u.status === String(filters.status).toUpperCase(); });
    if (filters.search) {
      var q = String(filters.search).toLowerCase();
      rows = rows.filter(function (u) {
        return u.name.toLowerCase().indexOf(q) !== -1
          || u.email.toLowerCase().indexOf(q) !== -1
          || u.department.toLowerCase().indexOf(q) !== -1;
      });
    }

    rows = Utils.sortBy(rows, 'name', false);
    return Utils.paginate(rows, page, pageSize || GlobalSettings.get('PAGE_SIZE'));
  }

  function createUser(data, actorUserId) {
    Validation.validateUser(data, true);
    return Utils.withLock(function () {
      var id = Utils.userId();
      var record = {
        UserID: id,
        Email: Security.sanitizeText(data.email, 150).toLowerCase(),
        Name: Security.sanitizeText(data.name, 120),
        Role: String(data.role).toUpperCase(),
        Department: Security.sanitizeText(data.department, 120),
        Position: Security.sanitizeText(data.position, 120),
        Status: USER_STATUS.ACTIVE,
        CreatedAt: Utils.now(),
        UpdatedAt: Utils.now(),
        LastLogin: ''
      };
      SheetDB.insert(CONFIG.SHEETS.USERS, record);
      _map = null;
      AuditService.log(actorUserId, AUDIT_ACTION.CREATE_USER, 'USER', id, '', '',
        'Pengguna baharu: ' + record.Email + ' (' + record.Role + ')');
      return toDto(record);
    });
  }

  function updateUser(userId, data, actorUserId) {
    Validation.validateUser(data, false, userId);
    return Utils.withLock(function () {
      var existing = SheetDB.findOneBy(CONFIG.SHEETS.USERS, 'UserID', userId);
      if (!existing) throw Utils.appError('NOT_FOUND', 'Pengguna tidak dijumpai.');

      var patch = {
        Name: Security.sanitizeText(data.name, 120),
        Role: String(data.role).toUpperCase(),
        Department: Security.sanitizeText(data.department, 120),
        Position: Security.sanitizeText(data.position, 120),
        Status: String(data.status || existing.Status).toUpperCase(),
        UpdatedAt: Utils.now()
      };
      SheetDB.updateRow(CONFIG.SHEETS.USERS, existing._row, patch);
      _map = null;

      AuditService.log(actorUserId, AUDIT_ACTION.UPDATE_USER, 'USER', userId,
        String(existing.Role) + '/' + String(existing.Status),
        patch.Role + '/' + patch.Status,
        'Kemas kini pengguna: ' + existing.Email);

      return toDto(Object.assign({}, existing, patch));
    });
  }

  /** Halang Admin terakhir dinyahaktifkan — elak sistem tanpa pentadbir */
  function assertNotLastAdmin(userId, newRole, newStatus) {
    var target = SheetDB.findOneBy(CONFIG.SHEETS.USERS, 'UserID', userId);
    if (!target) return;
    var wasAdmin = String(target.Role).toUpperCase() === ROLES.ADMIN
      && String(target.Status).toUpperCase() === USER_STATUS.ACTIVE;
    var staysAdmin = String(newRole).toUpperCase() === ROLES.ADMIN
      && String(newStatus).toUpperCase() === USER_STATUS.ACTIVE;
    if (wasAdmin && !staysAdmin) {
      var admins = getActiveByRole(ROLES.ADMIN);
      if (admins.length <= 1) {
        throw Utils.appError('VALIDATION',
          'Tidak boleh menukar Admin terakhir. Lantik Admin lain terlebih dahulu.');
      }
    }
  }

  return {
    toDto: toDto,
    getUserMap: getUserMap,
    getById: getById,
    getByEmail: getByEmail,
    getActiveByRole: getActiveByRole,
    list: list,
    createUser: createUser,
    updateUser: updateUser,
    assertNotLastAdmin: assertNotLastAdmin
  };
})();