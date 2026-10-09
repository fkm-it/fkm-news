/**
 * AuditService.gs
 * Jejak audit bagi semua tindakan kritikal.
 * Kegagalan menulis audit tidak boleh menggagalkan operasi perniagaan,
 * tetapi ia direkodkan ke console log pelaksanaan.
 */

var AuditService = (function () {

  function log(userId, action, entity, entityId, oldStatus, newStatus, description, context) {
    try {
      SheetDB.insert(CONFIG.SHEETS.AUDIT_LOG, {
        LogID: Utils.auditId(),
        UserID: userId || '',
        Action: action || '',
        Entity: entity || '',
        EntityID: entityId || '',
        OldStatus: oldStatus || '',
        NewStatus: newStatus || '',
        Description: Utils.truncate(String(description || ''), 500),
        Context: Utils.truncate(String(context || ''), 300),
        Timestamp: Utils.now()
      });
    } catch (e) {
      try { console.error('AUDIT_FAIL', action, entityId, String(e)); } catch (e2) { }
    }
  }

  /** Senarai log dengan penapis dan pagination */
  function list(filters, page, pageSize) {
    filters = filters || {};
    var rows = SheetDB.findAll(CONFIG.SHEETS.AUDIT_LOG);

    if (filters.userId) {
      rows = rows.filter(function (r) { return String(r.UserID) === String(filters.userId); });
    }
    if (filters.action) {
      rows = rows.filter(function (r) { return String(r.Action) === String(filters.action); });
    }
    if (filters.entityId) {
      rows = rows.filter(function (r) { return String(r.EntityID) === String(filters.entityId); });
    }
    if (filters.dateFrom) {
      var from = new Date(filters.dateFrom);
      rows = rows.filter(function (r) { return new Date(r.Timestamp) >= from; });
    }
    if (filters.dateTo) {
      var to = new Date(filters.dateTo); to.setHours(23, 59, 59, 999);
      rows = rows.filter(function (r) { return new Date(r.Timestamp) <= to; });
    }

    rows = Utils.sortBy(rows, 'Timestamp', true);

    var userMap = UserService.getUserMap();
    var mapped = rows.map(function (r) {
      return {
        logId: r.LogID,
        userId: r.UserID,
        userName: (userMap[r.UserID] && userMap[r.UserID].name) || r.UserID || 'Sistem',
        action: r.Action,
        entity: r.Entity,
        entityId: r.EntityID,
        oldStatus: r.OldStatus,
        newStatus: r.NewStatus,
        description: r.Description,
        timestamp: Utils.formatDateTime(r.Timestamp)
      };
    });

    return Utils.paginate(mapped, page, pageSize || GlobalSettings.get('PAGE_SIZE'));
  }

  /** Log terkini bagi satu entiti (untuk halaman butiran artikel) */
  function forEntity(entityId, limit) {
    var rows = SheetDB.findWhere(CONFIG.SHEETS.AUDIT_LOG, function (r) {
      return String(r.EntityID) === String(entityId);
    });
    rows = Utils.sortBy(rows, 'Timestamp', true).slice(0, limit || 20);
    var userMap = UserService.getUserMap();
    return rows.map(function (r) {
      return {
        action: r.Action,
        oldStatus: r.OldStatus,
        newStatus: r.NewStatus,
        description: r.Description,
        userName: (userMap[r.UserID] && userMap[r.UserID].name) || 'Sistem',
        timestamp: Utils.formatDateTime(r.Timestamp)
      };
    });
  }

  /** Buang log melebihi tempoh simpanan (jalankan melalui time-driven trigger) */
  function purgeOldLogs() {
    var days = GlobalSettings.get('AUDIT_RETENTION_DAYS');
    if (!days || days <= 0) return 0;
    var cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    var sh = SheetDB.sheet(CONFIG.SHEETS.AUDIT_LOG);
    var rows = SheetDB.findAll(CONFIG.SHEETS.AUDIT_LOG)
      .filter(function (r) { return new Date(r.Timestamp) < cutoff; })
      .sort(function (a, b) { return b._row - a._row; });

    rows.forEach(function (r) { sh.deleteRow(r._row); });
    return rows.length;
  }

  return { log: log, list: list, forEntity: forEntity, purgeOldLogs: purgeOldLogs };
})();