/*
 * bridge.js — google.script.run tiruan untuk portal di GitHub Pages.
 *
 * Public.html ditulis untuk Apps Script dan memanggil:
 *   google.script.run.withSuccessHandler(f).withFailureHandler(g).publicApi(a, p)
 * Fail ini menyediakan objek yang sama bentuknya, tetapi setiap panggilan
 * dihantar sebagai fetch POST ke URL /exec (doPost dalam WebBridge.gs).
 * Dengan cara ini Public.html tidak perlu diubah.
 *
 * text/plain + credentials:'omit' = "simple request": tiada preflight CORS,
 * tiada cookie Google dihantar.
 */
(function () {
  'use strict';
  var API = (window.FKMNEWS_CONFIG || {}).apiUrl || '';

  function call(fn, args, ok, fail) {
    if (!API) { fail(new Error('API belum dikonfigurasi.')); return; }
    fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ fn: fn, args: args }),
      credentials: 'omit',
      redirect: 'follow'
    }).then(function (r) {
      if (!r.ok) throw new Error('Pelayan memulangkan ralat ' + r.status + '.');
      return r.json();
    }).then(ok, function (e) {
      fail(new Error(e && e.message && !/Failed to fetch|NetworkError/i.test(e.message)
        ? e.message : 'Sambungan terputus. Semak internet dan cuba lagi.'));
    });
  }

  /*
   * Portal statik (F5): jawapan awam dibaca dahulu daripada data/*.json di
   * GitHub Pages (dijana oleh StaticSite.gs setiap kali berita diterbitkan).
   * Jika fail tiada (cth. berita baru diterbitkan, carian), jatuh balik
   * kepada Apps Script.
   */
  function staticPath(fn, args) {
    var p = (fn === 'publicApi' ? args[1] : null) || {};
    var lang = (fn === 'publicSidebar' ? args[0] : p.lang) === 'en' ? 'en' : 'bm';
    var base = 'data/' + lang + '/';
    if (fn === 'publicSidebar') return base + 'sidebar.json';
    if (fn !== 'publicApi') return null;
    switch (args[0]) {
      case 'public.bootstrap': return base + 'bootstrap.json';
      case 'public.home': return base + 'home.json';
      case 'public.list':
        if (p.search) return null;
        return base + 'list-' + (p.categoryId ? String(p.categoryId).replace(/[^\w-]/g, '') : 'all') +
          '-' + (parseInt(p.page, 10) || 1) + '.json';
      case 'public.article':
        return /^[\w-]+$/.test(String(p.newsId || '')) ? base + 'a/' + p.newsId + '.json' : null;
    }
    return null;
  }

  function viaStatic(fn, args, ok, fail) {
    var path = staticPath(fn, args);
    if (!path) return call(fn, args, ok, fail);
    fetch(path, { cache: 'no-cache' }).then(function (r) {
      if (!r.ok) throw new Error('static ' + r.status);
      return r.json();
    }).then(function (res) {
      ok(res);
      /* kiraan tontonan untuk artikel yang dihidang secara statik */
      if (fn === 'publicApi' && args[0] === 'public.article') {
        call('publicApi', ['public.view', { newsId: args[1].newsId }], function () {}, function () {});
      }
    }).catch(function () { call(fn, args, ok, fail); });
  }

  function runner(ok, fail) {
    var target = {
      withSuccessHandler: function (f) { return runner(f, fail); },
      withFailureHandler: function (f) { return runner(ok, f); }
    };
    return new Proxy(target, {
      get: function (t, name) {
        if (name in t) return t[name];
        return function () {
          viaStatic(String(name), Array.prototype.slice.call(arguments),
            ok || function () {}, fail || function () {});
        };
      }
    });
  }

  window.google = window.google || {};
  window.google.script = { run: runner(null, null) };
})();
