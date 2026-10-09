/* sw.js — FKM News (portal awam). Versi diganti oleh build-web.js. */
var CACHE = 'fkmnews-__BUILD__';
var SHELL = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './app/', './app/index.html'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }));
  self.skipWaiting();
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; })
      .map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

/* Halaman: rangkaian dahulu, cache sebagai sandaran luar talian.
   Panggilan API (POST, domain lain) tidak pernah dicache. */
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(req).then(function (res) {
      var copy = res.clone();
      caches.open(CACHE).then(function (c) { c.put(req, copy); });
      return res;
    }).catch(function () {
      return caches.match(req).then(function (hit) {
        return hit || caches.match(req.url.indexOf('/app/') !== -1 ? './app/index.html' : './index.html');
      });
    })
  );
});

/* ---------------------------------------------- Notifikasi push (F11) ----
   Mesej data-sahaja daripada Firebase Cloud Messaging (PushService.gs):
   { data: { title, body, link, tag, image } }. Service worker ini yang
   memaparkan notifikasi supaya paparan sama di Android, desktop dan iPhone. */
self.addEventListener('push', function (e) {
  var j = {};
  try { j = e.data ? e.data.json() : {}; } catch (err) { j = {}; }
  var d = j.data || {};
  var n = j.notification || {};
  var title = d.title || n.title || 'FKM News';
  var opts = {
    body: d.body || n.body || '',
    icon: 'icons/icon-192.png',
    badge: 'icons/icon-192.png',
    data: { link: d.link || (j.fcmOptions && j.fcmOptions.link) || './' },
    lang: 'ms'
  };
  if (d.tag) { opts.tag = d.tag; opts.renotify = true; }
  if (d.image) opts.image = d.image;
  e.waitUntil(self.registration.showNotification(title, opts));
});

self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var link = (e.notification.data && e.notification.data.link) || './';
  var url;
  try { url = new URL(link, self.registration.scope).href; } catch (err) { url = self.registration.scope; }
  /* Hanya buka pautan https atau laman sendiri */
  if (!/^https:/.test(url) && new URL(url).origin !== self.location.origin) url = self.registration.scope;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
    for (var i = 0; i < list.length; i++) {
      if (list[i].url === url && 'focus' in list[i]) return list[i].focus();
    }
    return self.clients.openWindow ? self.clients.openWindow(url) : null;
  }));
});
