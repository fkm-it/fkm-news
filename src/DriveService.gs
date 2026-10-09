/**
 * DriveService.gs
 * Pengurusan fail dalam Google Drive.
 * Struktur: FKM NEWS / <TAHUN> / <NEWS-ID> / (images | attachments)
 * Hanya File ID + metadata disimpan dalam Sheets — bukan binari.
 */

var DriveService = (function () {

  function rootFolder() {
    return DriveApp.getFolderById(CONFIG.getDriveRootId());
  }

  function getOrCreateChild(parent, name) {
    var it = parent.getFoldersByName(name);
    return it.hasNext() ? it.next() : parent.createFolder(name);
  }

  /** Folder khusus bagi satu artikel; dicipta jika belum ada */
  function getNewsFolder(newsId) {
    var year = String(newsId).split('-')[1] ||
      Utilities.formatDate(new Date(), Utils.timezone(), 'yyyy');
    var yearFolder = getOrCreateChild(rootFolder(), year);
    return getOrCreateChild(yearFolder, newsId);
  }

  function getSubFolder(newsId, kind) {
    return getOrCreateChild(getNewsFolder(newsId), kind === 'image' ? 'images' : 'attachments');
  }

  /**
   * Muat naik fail dari client.
   * @param {string} newsId
   * @param {{name:string, mimeType:string, data:string}} file base64 tanpa prefix data URI
   * @param {string} kind 'image' | 'attachment'
   */
  function uploadFile(newsId, file, kind, actorUserId) {
    var checked = Validation.validateUpload(file, kind === 'image' ? 'image' : 'attachment');

    var cleanName = Security.sanitizeFilename(file.name);
    var bytes = Utilities.base64Decode(String(file.data).replace(/^data:[^,]*,/, ''));
    // Jenis MIME daripada kandungan sebenar, bukan daripada pelayar
    var blob = Utilities.newBlob(bytes, checked.mimeType, cleanName);

    var folder = getSubFolder(newsId, kind);
    var created = folder.createFile(blob);

    // Warisi keizinan folder — jangan dedahkan fail kepada umum secara automatik
    created.setSharing(DriveApp.Access.DOMAIN_WITH_LINK, DriveApp.Permission.VIEW);

    AuditService.log(actorUserId, AUDIT_ACTION.UPLOAD_FILE, 'NEWS', newsId, '', '',
      'Muat naik ' + kind + ': ' + cleanName);

    return {
      fileId: created.getId(),
      name: created.getName(),
      mimeType: created.getMimeType(),
      sizeBytes: created.getSize(),
      viewUrl: 'https://drive.google.com/file/d/' + created.getId() + '/view',
      previewUrl: 'https://drive.google.com/thumbnail?id=' + created.getId() + '&sz=w1200',
      folderId: folder.getId()
    };
  }

  /** Senarai fail bagi satu artikel */
  function listFiles(newsId, kind) {
    var out = [];
    try {
      var folder = getSubFolder(newsId, kind);
      var it = folder.getFiles();
      while (it.hasNext()) {
        var f = it.next();
        out.push({
          fileId: f.getId(),
          name: f.getName(),
          mimeType: f.getMimeType(),
          sizeBytes: f.getSize(),
          viewUrl: 'https://drive.google.com/file/d/' + f.getId() + '/view',
          previewUrl: 'https://drive.google.com/thumbnail?id=' + f.getId() + '&sz=w1200'
        });
      }
    } catch (e) { /* folder belum wujud */ }
    return out;
  }

  /** Buang fail (trash, bukan padam kekal — boleh dipulihkan) */
  function removeFile(fileId, newsId, actorUserId) {
    var file = DriveApp.getFileById(fileId);
    var name = file.getName();
    file.setTrashed(true);
    AuditService.log(actorUserId, AUDIT_ACTION.DELETE_FILE, 'NEWS', newsId, '', '',
      'Buang fail: ' + name);
    return true;
  }

  function thumbnailUrl(fileId) {
    return fileId ? ('https://drive.google.com/thumbnail?id=' + fileId + '&sz=w1200') : '';
  }

  /** Cipta struktur akar semasa setup */
  function ensureRoot() {
    var props = PropertiesService.getScriptProperties();
    var existing = props.getProperty(CONFIG.PROP_KEYS.DRIVE_ROOT_ID);
    if (existing) {
      try { DriveApp.getFolderById(existing); return existing; } catch (e) { }
    }
    var folder = DriveApp.createFolder(CONFIG.TECHNICAL.DRIVE_ROOT_NAME);
    props.setProperty(CONFIG.PROP_KEYS.DRIVE_ROOT_ID, folder.getId());
    return folder.getId();
  }

  return {
    rootFolder: rootFolder,
    getNewsFolder: getNewsFolder,
    getSubFolder: getSubFolder,
    uploadFile: uploadFile,
    listFiles: listFiles,
    removeFile: removeFile,
    thumbnailUrl: thumbnailUrl,
    ensureRoot: ensureRoot
  };
})();