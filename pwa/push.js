/*
 * push.js — pasang app (PWA) dan notifikasi push Firebase (F11).
 *
 * Dimuatkan oleh portal (/) dan app staf (/app/) di GitHub Pages. Fail ini
 * tidak tahu tentang peranan: UI (public-extras.html / push-staff.html)
 * memanggil FKMPush.enable(), kemudian menghantar token kepada pelayan.
 *
 * Firebase JS SDK dimuat HANYA apabila diperlukan (dynamic import), supaya
 * pembaca biasa tidak memuat turun apa-apa tambahan.
 */
(function () {
  'use strict';

  var FB_VERSION = '10.12.2';
  var FB_BASE = 'https://www.gstatic.com/firebasejs/' + FB_VERSION + '/';
  var TOKEN_KEY = 'FKMNEWS_PUSH_TOKEN';

  var deferredPrompt = null;
  var installListeners = [];

  function store(k, v) {
    try {
      if (v === undefined) return localStorage.getItem(k);
      if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v);
    } catch (e) { return null; }
    return v;
  }

  var ua = navigator.userAgent || '';
  var isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  function standalone() {
    return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
      window.navigator.standalone === true;
  }

  function supported() {
    return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window &&
      location.protocol === 'https:' || (location.hostname === 'localhost' && 'serviceWorker' in navigator);
  }

  /** iPhone/iPad: push hanya dalam app yang dipasang ke Skrin Utama (iOS 16.4+). */
  function needsInstallFirst() { return isIOS && !standalone(); }

  function permission() { return ('Notification' in window) ? Notification.permission : 'unsupported'; }

  function deviceLabel() {
    var os = /Android/.test(ua) ? 'Android' : isIOS ? 'iOS' : /Windows/.test(ua) ? 'Windows' :
      /Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'Lain';
    var br = /Edg\//.test(ua) ? 'Edge' : /SamsungBrowser/.test(ua) ? 'Samsung' : /Chrome\//.test(ua) ? 'Chrome' :
      /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Pelayar';
    return os + ' · ' + br + (standalone() ? ' · app' : '');
  }

  /** Terima JSON atau petikan "const firebaseConfig = {...}" dari Firebase console. */
  function parseConfig(raw) {
    if (!raw) return null;
    if (typeof raw === 'object') return raw.apiKey ? raw : null;
    var out = {};
    String(raw).replace(/["']?(\w+)["']?\s*:\s*["']([^"']+)["']/g, function (_, k, v) { out[k] = v; return _; });
    return (out.apiKey && out.projectId && out.messagingSenderId && out.appId) ? out : null;
  }

  /** Dapatkan konfigurasi daripada tetapan awam sistem. */
  function configFrom(settings) {
    settings = settings || {};
    var fb = parseConfig(settings.FIREBASE_WEB_CONFIG);
    var vapid = String(settings.FIREBASE_VAPID_KEY || '').trim();
    var on = settings.PUSH_ENABLED === true || settings.PUSH_ENABLED === 'TRUE' || settings.PUSH_ENABLED === 'true';
    return (on && fb && vapid) ? { firebase: fb, vapidKey: vapid } : null;
  }

  var fbPromise = null;
  function messaging(cfg) {
    if (!fbPromise) {
      fbPromise = Promise.all([
        import(FB_BASE + 'firebase-app.js'),
        import(FB_BASE + 'firebase-messaging.js')
      ]).then(function (m) {
        var app = m[0].initializeApp(cfg.firebase, 'fkmnews');
        return m[1].isSupported().then(function (ok) {
          if (!ok) throw new Error('Pelayar ini tidak menyokong notifikasi push.');
          return { mod: m[1], msg: m[1].getMessaging(app) };
        });
      });
      fbPromise.catch(function () { fbPromise = null; });
    }
    return fbPromise;
  }

  function registration() {
    return navigator.serviceWorker.getRegistration().then(function (r) {
      return r || navigator.serviceWorker.ready;
    });
  }

  /**
   * Minta kebenaran (mesti daripada klik pengguna) dan dapatkan token FCM.
   * @returns {Promise<string>} token
   */
  function enable(cfg) {
    if (!cfg) return Promise.reject(new Error('Notifikasi belum dikonfigurasi oleh pentadbir.'));
    if (needsInstallFirst()) return Promise.reject(new Error('Pasang app ke Skrin Utama dahulu.'));
    if (!supported()) return Promise.reject(new Error('Pelayar ini tidak menyokong notifikasi push.'));
    return Notification.requestPermission().then(function (p) {
      if (p !== 'granted') throw new Error(p === 'denied'
        ? 'Notifikasi disekat. Benarkan dalam tetapan laman pelayar.'
        : 'Kebenaran notifikasi tidak diberikan.');
      return token(cfg);
    });
  }

  /** Token semasa (tanpa meminta kebenaran). */
  function token(cfg) {
    if (!cfg || permission() !== 'granted') return Promise.resolve('');
    return Promise.all([messaging(cfg), registration()]).then(function (r) {
      return r[0].mod.getToken(r[0].msg, { vapidKey: cfg.vapidKey, serviceWorkerRegistration: r[1] });
    }).then(function (t) {
      if (t) store(TOKEN_KEY, t);
      return t || '';
    });
  }

  function disable(cfg) {
    var t = store(TOKEN_KEY);
    store(TOKEN_KEY, null);
    if (!cfg) return Promise.resolve(t || '');
    return messaging(cfg).then(function (m) {
      return m.mod.deleteToken(m.msg).catch(function () { });
    }).catch(function () { }).then(function () { return t || ''; });
  }

  /* ------------------------------------------------------------ Pasang */

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferredPrompt = e;
    installListeners.forEach(function (f) { try { f(); } catch (err) { } });
  });
  window.addEventListener('appinstalled', function () {
    deferredPrompt = null;
    installListeners.forEach(function (f) { try { f(); } catch (err) { } });
  });

  function canInstall() { return !!deferredPrompt; }

  function install() {
    if (!deferredPrompt) return Promise.resolve('unavailable');
    var p = deferredPrompt;
    deferredPrompt = null;
    p.prompt();
    return p.userChoice.then(function (c) { return c && c.outcome; }).catch(function () { return 'dismissed'; });
  }

  window.FKMPush = {
    supported: supported,
    isIOS: isIOS,
    standalone: standalone,
    needsInstallFirst: needsInstallFirst,
    permission: permission,
    deviceLabel: deviceLabel,
    parseConfig: parseConfig,
    configFrom: configFrom,
    enable: enable,
    token: token,
    disable: disable,
    savedToken: function () { return store(TOKEN_KEY) || ''; },
    canInstall: canInstall,
    install: install,
    onInstallChange: function (f) { installListeners.push(f); },
    store: store
  };
})();
