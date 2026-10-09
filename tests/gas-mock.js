/**
 * gas-mock.js
 * Persekitaran Apps Script tiruan untuk ujian dalam Node.
 *
 * Memuatkan semua fail src/*.gs ke dalam satu konteks vm (sama seperti
 * Apps Script berkongsi skop global), dengan servis Google digantikan oleh
 * versi dalam memori: Spreadsheet, Properties, Cache, Lock, Session, Drive,
 * Mail, ScriptApp dan UrlFetch.
 *
 * Penggunaan:
 *   const gas = loadGas({ order: 'reverse' });
 *   gas.as('za@mail.fkm.utm.my');        // tukar identiti pengguna aktif
 *   gas.ctx.api('session.bootstrap', {});
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = path.join(__dirname, '..', 'src');
const OWNER = 'mohdzaki@mail.fkm.utm.my';

/* ------------------------------------------------------------ Spreadsheet */

function makeSheet(name) {
  let data = []; // baris 2D, indeks 0 = baris 1
  const sh = {
    _name: name,
    get _data() { return data; },
    getName: () => name,
    getLastRow: () => {
      for (let r = data.length - 1; r >= 0; r--) {
        if ((data[r] || []).some(v => v !== '' && v !== null && v !== undefined)) return r + 1;
      }
      return 0;
    },
    getLastColumn: () => data.reduce((m, r) => {
      let last = 0;
      (r || []).forEach((v, i) => { if (v !== '' && v !== null && v !== undefined) last = i + 1; });
      return Math.max(m, last);
    }, 0),
    getMaxColumns: () => Math.max(26, sh.getLastColumn()),
    getMaxRows: () => Math.max(1000, data.length),
    getRange(row, col, nr, nc) {
      nr = nr || 1; nc = nc || 1;
      const ensure = () => {
        while (data.length < row - 1 + nr) data.push([]);
      };
      const range = {
        getValues() {
          const out = [];
          for (let r = 0; r < nr; r++) {
            const src = data[row - 1 + r] || [];
            const line = [];
            for (let c = 0; c < nc; c++) {
              const v = src[col - 1 + c];
              line.push(v === undefined ? '' : v);
            }
            out.push(line);
          }
          return out;
        },
        getValue() { return range.getValues()[0][0]; },
        setValues(vals) {
          ensure();
          vals.forEach((line, r) => line.forEach((v, c) => {
            data[row - 1 + r][col - 1 + c] = sheetValue(v);
          }));
          return range;
        },
        setValue(v) { return range.setValues([[v]]); },
        setFontWeight() { return range; }, setBackground() { return range; },
        setFontColor() { return range; }, setNumberFormat() { return range; },
        clearContent() {
          for (let r = 0; r < nr; r++) for (let c = 0; c < nc; c++) {
            if (data[row - 1 + r]) data[row - 1 + r][col - 1 + c] = '';
          }
          return range;
        }
      };
      return range;
    },
    getDataRange() { return sh.getRange(1, 1, Math.max(1, sh.getLastRow()), Math.max(1, sh.getLastColumn())); },
    appendRow(values) { data[sh.getLastRow()] = values.map(sheetValue); return sh; },
    deleteRow(r) { data.splice(r - 1, 1); return sh; },
    deleteRows(r, n) { data.splice(r - 1, n); return sh; },
    deleteColumns() { return sh; },
    setFrozenRows() { return sh; },
    autoResizeColumns() { return sh; },
    clear() { data = []; return sh; },
    insertRowsAfter() { return sh; }
  };
  return sh;
}

/** Tiru tingkah laku Sheets: apostrof di hadapan ialah penanda teks dan dibuang. */
function sheetValue(v) {
  if (typeof v === 'string' && v.charAt(0) === "'") return v.slice(1);
  return v === undefined ? '' : v;
}

function makeSpreadsheet(id, name) {
  const sheets = new Map();
  const ss = {
    getId: () => id,
    getName: () => name,
    getUrl: () => 'https://docs.google.com/spreadsheets/d/' + id,
    getSheetByName: n => sheets.get(n) || null,
    getSheets: () => Array.from(sheets.values()),
    insertSheet(n) { const s = makeSheet(n); sheets.set(n, s); return s; },
    deleteSheet(s) { sheets.delete(s.getName()); },
    setSpreadsheetTimeZone() {},
    copy(n) { return makeSpreadsheet(id + '_copy', n); }
  };
  ss.insertSheet('Sheet1');
  return ss;
}

/* --------------------------------------------------------------- Drive */

function makeDrive(state) {
  let seq = 0;
  const files = state.driveFiles;
  const nid = p => p + '_' + (++seq);

  function makeFolder(name, parentId) {
    const id = nid('folder');
    const kids = [];
    const folder = {
      getId: () => id, getName: () => name, _kids: kids,
      getFoldersByName(n) {
        const hits = kids.filter(k => k.isFolder && k.getName() === n);
        let i = 0;
        return { hasNext: () => i < hits.length, next: () => hits[i++] };
      },
      createFolder(n) { const f = makeFolder(n, id); f.isFolder = true; kids.push(f); return f; },
      createFile(blob) {
        const f = makeFile(blob, id); kids.push(f); return f;
      },
      getFiles() {
        const hits = kids.filter(k => !k.isFolder && !k._trashed);
        let i = 0;
        return { hasNext: () => i < hits.length, next: () => hits[i++] };
      },
      setSharing() { return folder; },
      getUrl: () => 'https://drive.google.com/drive/folders/' + id
    };
    files.set(id, folder);
    return folder;
  }

  function makeFile(blob, parentId) {
    const id = nid('file');
    const f = {
      getId: () => id, getName: () => blob.getName(), getMimeType: () => blob.getContentType(),
      getSize: () => blob.getBytes().length, getBlob: () => blob,
      getUrl: () => 'https://drive.google.com/file/d/' + id + '/view',
      setTrashed(t) { f._trashed = !!t; return f; },
      setSharing(a, p) { f._sharing = [a, p]; return f; },
      getSharingAccess: () => (f._sharing || ['PRIVATE'])[0],
      getSharingPermission: () => (f._sharing || [null, 'NONE'])[1],
      getDateCreated: () => new Date(), getLastUpdated: () => new Date(),
      getParents() { let done = false; return { hasNext: () => !done, next: () => { done = true; return files.get(parentId); } }; },
      setDescription() { return f; }
    };
    files.set(id, f);
    return f;
  }

  return {
    Access: { ANYONE: 'ANYONE', ANYONE_WITH_LINK: 'ANYONE_WITH_LINK', PRIVATE: 'PRIVATE', DOMAIN_WITH_LINK: 'DOMAIN_WITH_LINK', DOMAIN: 'DOMAIN' },
    Permission: { VIEW: 'VIEW', EDIT: 'EDIT', NONE: 'NONE', COMMENT: 'COMMENT' },
    createFolder: n => { const f = makeFolder(n, null); f.isFolder = true; return f; },
    createFile: b => makeFile(b, null),
    getFolderById: id => { const f = files.get(id); if (!f) throw new Error('No folder ' + id); return f; },
    getFileById: id => { const f = files.get(id); if (!f) throw new Error('No file ' + id); return f; },
    getRootFolder: () => makeFolder('root', null)
  };
}

/* ---------------------------------------------------------------- Blob */

function makeBlob(bytes, type, name) {
  let buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes || []);
  return {
    getBytes: () => Array.from(buf).map(b => (b > 127 ? b - 256 : b)),
    getContentType: () => type || 'application/octet-stream',
    getName: () => name || 'fail',
    setName(n) { name = n; return this; },
    getDataAsString: () => buf.toString('utf8'),
    copyBlob() { return makeBlob(buf, type, name); },
    // Apps Script menukar HTML → PDF; mock menghasilkan PDF palsu bertanda.
    getAs(t) { return makeBlob(Buffer.concat([Buffer.from('%PDF-1.4 mock\n'), buf]), t, name); }
  };
}

/* ------------------------------------------------------------- Loader */

function pad(n, w) { return String(n).padStart(w || 2, '0'); }

function formatDate(d, tz, fmt) {
  d = new Date(d);
  // Ujian berjalan dalam UTC+8 (Asia/Kuala_Lumpur) tanpa mengira TZ mesin.
  const t = new Date(d.getTime() + 8 * 3600 * 1000);
  if (fmt === 'u') return String(((t.getUTCDay() + 6) % 7) + 1);   // ISO: 1=Isnin … 7=Ahad
  const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return String(fmt)
    .replace(/yyyy/g, t.getUTCFullYear())
    .replace(/MMMM/g, M[t.getUTCMonth()])
    .replace(/MMM/g, M[t.getUTCMonth()])
    .replace(/MM/g, pad(t.getUTCMonth() + 1))
    .replace(/dd/g, pad(t.getUTCDate()))
    .replace(/HH/g, pad(t.getUTCHours()))
    .replace(/mm/g, pad(t.getUTCMinutes()))
    .replace(/ss/g, pad(t.getUTCSeconds()))
    .replace(/yy/g, String(t.getUTCFullYear()).slice(-2))
    .replace(/'T'/g, 'T').replace(/XXX/g, '+08:00').replace(/Z/g, '+0800');
}

function storeService() {
  const m = new Map();
  return {
    _map: m,
    getProperty: k => (m.has(k) ? m.get(k) : null),
    setProperty(k, v) { m.set(k, String(v)); return this; },
    setProperties(o) { Object.keys(o).forEach(k => m.set(k, String(o[k]))); return this; },
    getProperties: () => Object.fromEntries(m),
    getKeys: () => Array.from(m.keys()),
    deleteProperty(k) { m.delete(k); return this; },
    deleteAllProperties() { m.clear(); return this; }
  };
}

function cacheService() {
  const m = new Map();
  return {
    get: k => (m.has(k) ? m.get(k) : null),
    put: (k, v) => { m.set(k, String(v)); },
    putAll: o => Object.keys(o).forEach(k => m.set(k, String(o[k]))),
    getAll: ks => Object.fromEntries(ks.filter(k => m.has(k)).map(k => [k, m.get(k)])),
    remove: k => m.delete(k),
    removeAll: ks => ks.forEach(k => m.delete(k))
  };
}

function listSources() {
  return fs.readdirSync(SRC).filter(f => f.endsWith('.gs')).sort();
}

/**
 * @param {{order?: 'alpha'|'reverse', activeEmail?: string}} opts
 */
function loadGas(opts) {
  opts = opts || {};
  const state = {
    activeEmail: opts.activeEmail === undefined ? OWNER : opts.activeEmail,
    owner: OWNER,
    mails: [],
    fetches: [],
    triggers: [],
    driveFiles: new Map(),
    spreadsheets: new Map(),
    userProps: new Map(),
    userCaches: new Map(),
    fetchHandler: null
  };
  const scriptProps = storeService();
  const scriptCache = cacheService();
  let ssSeq = 0;

  const userProps = () => {
    const k = state.activeEmail || '(anon)';
    if (!state.userProps.has(k)) state.userProps.set(k, storeService());
    return state.userProps.get(k);
  };
  const userCache = () => {
    const k = state.activeEmail || '(anon)';
    if (!state.userCaches.has(k)) state.userCaches.set(k, cacheService());
    return state.userCaches.get(k);
  };

  const ctx = {
    console: { log() {}, error() {}, warn() {}, info() {} },
    Logger: { log() {} },
    Session: {
      getActiveUser: () => ({ getEmail: () => state.activeEmail || '' }),
      getEffectiveUser: () => ({ getEmail: () => state.owner }),
      getScriptTimeZone: () => 'Asia/Kuala_Lumpur'
    },
    PropertiesService: {
      getScriptProperties: () => scriptProps,
      getUserProperties: () => userProps(),
      getDocumentProperties: () => null
    },
    CacheService: {
      getScriptCache: () => scriptCache,
      getUserCache: () => userCache(),
      getDocumentCache: () => null
    },
    LockService: {
      getScriptLock: () => ({ waitLock() {}, tryLock: () => true, releaseLock() {}, hasLock: () => true }),
      getUserLock: () => ({ waitLock() {}, tryLock: () => true, releaseLock() {} })
    },
    SpreadsheetApp: {
      create(name) {
        const id = 'ss_' + (++ssSeq);
        const ss = makeSpreadsheet(id, name);
        state.spreadsheets.set(id, ss);
        return ss;
      },
      openById(id) {
        const ss = state.spreadsheets.get(id);
        if (!ss) throw new Error('Spreadsheet not found: ' + id);
        return ss;
      },
      flush() {}
    },
    DriveApp: null,
    Utilities: {
      formatDate,
      getUuid: () => require('crypto').randomUUID(),
      sleep() {},
      newBlob: (b, t, n) => makeBlob(typeof b === 'string' ? Buffer.from(b, 'utf8') : Buffer.from((b || []).map(x => x & 255)), t, n),
      base64Decode: s => Array.from(Buffer.from(String(s), 'base64')).map(b => (b > 127 ? b - 256 : b)),
      base64Encode: b => Buffer.from((typeof b === 'string' ? Buffer.from(b) : (b || []).map(x => x & 255))).toString('base64'),
      base64EncodeWebSafe: b => Buffer.from((typeof b === 'string' ? Buffer.from(b) : (b || []).map(x => x & 255))).toString('base64url'),
      computeDigest: (alg, s) => Array.from(require('crypto').createHash('sha256').update(String(s)).digest()).map(b => (b > 127 ? b - 256 : b)),
      computeHmacSha256Signature: (v, k) => Array.from(require('crypto').createHmac('sha256', String(k)).update(String(v)).digest()).map(b => (b > 127 ? b - 256 : b)),
      computeRsaSha256Signature: (v, key) => Array.from(require('crypto').createSign('RSA-SHA256').update(String(v)).sign(key)).map(b => (b > 127 ? b - 256 : b)),
      DigestAlgorithm: { SHA_256: 'SHA_256', MD5: 'MD5' },
      Charset: { UTF_8: 'UTF_8' }
    },
    MailApp: {
      sendEmail(o) { state.mails.push(typeof o === 'object' ? o : { to: arguments[0], subject: arguments[1], body: arguments[2] }); },
      getRemainingDailyQuota: () => 100
    },
    GmailApp: { sendEmail() { state.mails.push(Array.from(arguments)); } },
    UrlFetchApp: {
      fetch(url, params) {
        state.fetches.push({ url, params });
        if (state.fetchHandler) return state.fetchHandler(url, params);
        return { getResponseCode: () => 200, getContentText: () => '{}', getHeaders: () => ({}) };
      },
      fetchAll(reqs) { return reqs.map(r => ctx.UrlFetchApp.fetch(r.url, r)); }
    },
    ScriptApp: {
      WeekDay: { MONDAY: 'MONDAY', SUNDAY: 'SUNDAY' },
      getService: () => ({ getUrl: () => 'https://script.google.com/macros/s/TEST/exec' }),
      getProjectTriggers: () => state.triggers.slice(),
      deleteTrigger(t) { state.triggers = state.triggers.filter(x => x !== t); },
      newTrigger(fn) {
        const b = {
          timeBased: () => b, atHour: () => b, everyDays: () => b, everyHours: () => b,
          everyWeeks: () => b, onWeekDay: () => b, nearMinute: () => b, everyMinutes: () => b,
          create() {
            const uid = String(1000000 + state.triggers.length + 1);
            const t = { getHandlerFunction: () => fn, getUniqueId: () => uid, getEventType: () => 'CLOCK' };
            state.triggers.push(t);
            return t;
          }
        };
        return b;
      },
      AuthMode: { FULL: 'FULL' }
    },
    HtmlService: {
      XFrameOptionsMode: { ALLOWALL: 'ALLOWALL', DEFAULT: 'DEFAULT' },
      SandboxMode: { IFRAME: 'IFRAME' },
      createHtmlOutput(html) { return htmlOut(String(html || '')); },
      createHtmlOutputFromFile(f) {
        return htmlOut(fs.readFileSync(path.join(SRC, f + '.html'), 'utf8'));
      },
      createTemplateFromFile(f) {
        const tpl = { _file: f, evaluate() { const o = htmlOut('[template ' + f + ']'); o._template = tpl; return o; } };
        return tpl;
      }
    },
    ContentService: {
      MimeType: { JSON: 'JSON', TEXT: 'TEXT' },
      createTextOutput(s) { return { _text: s, setMimeType() { return this; }, getContent: () => s }; }
    }
  };

  function htmlOut(html) {
    const o = {
      _html: html, _meta: {}, _xfo: 'DEFAULT',
      getContent: () => html,
      setTitle(t) { o._title = t; return o; },
      addMetaTag(k, v) { o._meta[k] = v; return o; },
      setFaviconUrl() { return o; },
      setXFrameOptionsMode(m) { o._xfo = m; return o; },
      setSandboxMode() { return o; }
    };
    return o;
  }

  ctx.DriveApp = makeDrive(state);
  ctx.Drive = { Files: { get: () => ({}), update: () => ({}) } };
  ctx.globalThis = ctx;

  vm.createContext(ctx);

  let files = listSources();
  if (opts.order === 'reverse') files = files.slice().reverse();
  files.forEach(f => {
    const code = fs.readFileSync(path.join(SRC, f), 'utf8');
    vm.runInContext(code, ctx, { filename: f });
  });

  return {
    ctx,
    state,
    scriptProps,
    OWNER,
    as(email) { state.activeEmail = email; return this; },
    anon() { state.activeEmail = ''; return this; },
    files
  };
}

/**
 * Pasang sistem lengkap (setupSystem sebagai pemilik) dan cipta pengguna ujian.
 * Mengembalikan objek gas dengan identiti kembali kepada pemilik.
 */
function installed(opts) {
  const gas = loadGas(opts);
  gas.as(OWNER);
  gas.ctx.setupSystem();
  const c = gas.ctx;
  const mk = (email, role, name) => {
    c.SheetDB.insert(c.CONFIG.SHEETS.USERS, {
      UserID: c.Utils.userId(), Email: email, Name: name, Role: role,
      Department: 'FKM', Position: '', Status: 'ACTIVE',
      CreatedAt: new Date(), UpdatedAt: new Date(), LastLogin: ''
    });
  };
  mk('author1@mail.fkm.utm.my', 'AUTHOR', 'Penulis Satu');
  mk('author2@mail.fkm.utm.my', 'AUTHOR', 'Penulis Dua');
  mk('editor@mail.fkm.utm.my', 'EDITOR', 'Editor');
  mk('admin2@mail.fkm.utm.my', 'ADMIN', 'Admin Dua');
  c.SheetDB.invalidate();
  return gas;
}

module.exports = { loadGas, installed, OWNER, SRC, listSources };
