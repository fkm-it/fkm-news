/**
 * Constants.gs
 * Enum tetap sistem: role, status, keputusan review, jenis notifikasi,
 * permission matrix dan workflow state machine.
 *
 * Nilai di sini adalah KONTRAK sistem (bukan pilihan kosmetik).
 * Label dan warna status yang dipaparkan kepada pengguna datang dari Global Settings.
 */

var ROLES = {
  AUTHOR: 'AUTHOR',
  ADMIN: 'ADMIN',
  EDITOR: 'EDITOR'
};

var USER_STATUS = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE'
};

var STATUS = {
  DRAFT: 'DRAFT',
  SUBMITTED: 'SUBMITTED',
  ADMIN_REVIEW: 'ADMIN_REVIEW',
  REVISION_REQUIRED: 'REVISION_REQUIRED',
  RESUBMITTED: 'RESUBMITTED',
  EDITOR_REVIEW: 'EDITOR_REVIEW',
  APPROVED: 'APPROVED',
  PUBLISHED: 'PUBLISHED',
  REJECTED: 'REJECTED',
  ARCHIVED: 'ARCHIVED'
};

var REVIEW_STAGE = {
  ADMIN: 'ADMIN',
  EDITOR: 'EDITOR'
};

var DECISION = {
  FORWARD: 'FORWARD',
  REQUEST_REVISION: 'REQUEST_REVISION',
  REJECT: 'REJECT',
  APPROVE: 'APPROVE',
  PUBLISH: 'PUBLISH'
};

var NOTIF_TYPE = {
  SUBMISSION: 'SUBMISSION',
  FORWARDED: 'FORWARDED',
  REVISION: 'REVISION',
  REJECTED: 'REJECTED',
  APPROVED: 'APPROVED',
  PUBLISHED: 'PUBLISHED'
};

var AUDIT_ACTION = {
  LOGIN: 'LOGIN',
  CREATE_NEWS: 'CREATE_NEWS',
  UPDATE_NEWS: 'UPDATE_NEWS',
  DELETE_NEWS: 'DELETE_NEWS',
  TRANSITION: 'TRANSITION',
  UPLOAD_FILE: 'UPLOAD_FILE',
  DELETE_FILE: 'DELETE_FILE',
  CREATE_USER: 'CREATE_USER',
  UPDATE_USER: 'UPDATE_USER',
  UPDATE_SETTING: 'UPDATE_SETTING',
  CREATE_CATEGORY: 'CREATE_CATEGORY',
  UPDATE_CATEGORY: 'UPDATE_CATEGORY',
  ACCESS_DENIED: 'ACCESS_DENIED'
};

/**
 * PERMISSION MATRIX
 * Sumber kebenaran tunggal untuk authorization. Disemak SERVER-SIDE pada setiap API.
 * 'OWN' bermaksud dibenarkan hanya ke atas rekod milik pengguna itu sendiri.
 */
var PERMISSIONS = {
  'news.create':        [ROLES.AUTHOR, ROLES.ADMIN],
  'news.edit.own':      [ROLES.AUTHOR, ROLES.ADMIN],
  'news.view.own':      [ROLES.AUTHOR, ROLES.ADMIN],
  'news.view.all':      [ROLES.ADMIN],
  'news.view.assigned': [ROLES.EDITOR],
  'news.submit':        [ROLES.AUTHOR, ROLES.ADMIN],
  'news.delete.own':    [ROLES.AUTHOR, ROLES.ADMIN],
  'review.admin':       [ROLES.ADMIN],
  'review.editor':      [ROLES.EDITOR],
  'review.revision':    [ROLES.ADMIN, ROLES.EDITOR],
  'review.reject':      [ROLES.ADMIN, ROLES.EDITOR],
  'news.publish':       [ROLES.EDITOR],
  'news.archive':       [ROLES.ADMIN, ROLES.EDITOR],
  'user.manage':        [ROLES.ADMIN],
  'category.manage':    [ROLES.ADMIN],
  'settings.manage':    [ROLES.ADMIN],
  'audit.view.all':     [ROLES.ADMIN],
  'audit.view.limited': [ROLES.EDITOR],
  'dashboard.view':     [ROLES.AUTHOR, ROLES.ADMIN, ROLES.EDITOR],
  'report.export':      [ROLES.ADMIN, ROLES.EDITOR]
};

/**
 * WORKFLOW STATE MACHINE
 * key = status semasa; setiap transition menetapkan status baharu, role yang
 * dibenarkan, permission yang diperlukan, dan sama ada komen wajib.
 */
var TRANSITIONS = {
  DRAFT: [
    { action: 'SUBMIT', to: STATUS.SUBMITTED, roles: [ROLES.AUTHOR, ROLES.ADMIN],
      permission: 'news.submit', ownerOnly: true, requireComment: false,
      label: 'Hantar untuk semakan' }
  ],
  SUBMITTED: [
    { action: 'START_ADMIN_REVIEW', to: STATUS.ADMIN_REVIEW, roles: [ROLES.ADMIN],
      permission: 'review.admin', ownerOnly: false, requireComment: false,
      label: 'Mula semakan Admin' }
  ],
  RESUBMITTED: [
    { action: 'START_ADMIN_REVIEW', to: STATUS.ADMIN_REVIEW, roles: [ROLES.ADMIN],
      permission: 'review.admin', ownerOnly: false, requireComment: false,
      label: 'Mula semakan Admin' }
  ],
  ADMIN_REVIEW: [
    { action: 'FORWARD_TO_EDITOR', to: STATUS.EDITOR_REVIEW, roles: [ROLES.ADMIN],
      permission: 'review.admin', ownerOnly: false, requireComment: false,
      label: 'Teruskan kepada Editor' },
    { action: 'REQUEST_REVISION', to: STATUS.REVISION_REQUIRED, roles: [ROLES.ADMIN],
      permission: 'review.revision', ownerOnly: false, requireComment: true,
      label: 'Minta pembetulan' },
    { action: 'REJECT', to: STATUS.REJECTED, roles: [ROLES.ADMIN],
      permission: 'review.reject', ownerOnly: false, requireComment: true,
      label: 'Tolak berita' }
  ],
  REVISION_REQUIRED: [
    { action: 'RESUBMIT', to: STATUS.RESUBMITTED, roles: [ROLES.AUTHOR, ROLES.ADMIN],
      permission: 'news.submit', ownerOnly: true, requireComment: false,
      label: 'Hantar semula' }
  ],
  EDITOR_REVIEW: [
    { action: 'APPROVE', to: STATUS.APPROVED, roles: [ROLES.EDITOR],
      permission: 'review.editor', ownerOnly: false, requireComment: false,
      label: 'Luluskan' },
    { action: 'REQUEST_REVISION', to: STATUS.REVISION_REQUIRED, roles: [ROLES.EDITOR],
      permission: 'review.revision', ownerOnly: false, requireComment: true,
      label: 'Minta pembetulan' },
    { action: 'REJECT', to: STATUS.REJECTED, roles: [ROLES.EDITOR],
      permission: 'review.reject', ownerOnly: false, requireComment: true,
      label: 'Tolak berita' }
  ],
  APPROVED: [
    { action: 'PUBLISH', to: STATUS.PUBLISHED, roles: [ROLES.EDITOR],
      permission: 'news.publish', ownerOnly: false, requireComment: false,
      label: 'Terbitkan' },
    { action: 'REQUEST_REVISION', to: STATUS.REVISION_REQUIRED, roles: [ROLES.EDITOR],
      permission: 'review.revision', ownerOnly: false, requireComment: true,
      label: 'Minta pembetulan' }
  ],
  PUBLISHED: [
    { action: 'ARCHIVE', to: STATUS.ARCHIVED, roles: [ROLES.ADMIN, ROLES.EDITOR],
      permission: 'news.archive', ownerOnly: false, requireComment: false,
      label: 'Arkibkan' }
  ],
  REJECTED: [
    { action: 'ARCHIVE', to: STATUS.ARCHIVED, roles: [ROLES.ADMIN],
      permission: 'news.archive', ownerOnly: false, requireComment: false,
      label: 'Arkibkan' }
  ],
  ARCHIVED: [
    { action: 'UNARCHIVE', to: STATUS.PUBLISHED, roles: [ROLES.ADMIN, ROLES.EDITOR],
      permission: 'news.archive', ownerOnly: false, requireComment: false,
      label: 'Nyahkarkib' }
  ]
};

/** Status yang boleh disunting oleh Author */
var EDITABLE_STATUSES = [STATUS.DRAFT, STATUS.REVISION_REQUIRED];

/** Status dalam giliran tindakan Admin */
var ADMIN_QUEUE_STATUSES = [STATUS.SUBMITTED, STATUS.RESUBMITTED, STATUS.ADMIN_REVIEW];

/** Status dalam giliran tindakan Editor */
var EDITOR_QUEUE_STATUSES = [STATUS.EDITOR_REVIEW, STATUS.APPROVED];

/** Status yang boleh dilihat oleh Editor (akses terhad) */
var EDITOR_VISIBLE_STATUSES = [STATUS.EDITOR_REVIEW, STATUS.APPROVED,
  STATUS.PUBLISHED, STATUS.REJECTED, STATUS.REVISION_REQUIRED, STATUS.ARCHIVED];