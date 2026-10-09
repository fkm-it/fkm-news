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

  function runner(ok, fail) {
    var target = {
      withSuccessHandler: function (f) { return runner(f, fail); },
      withFailureHandler: function (f) { return runner(ok, f); }
    };
    return new Proxy(target, {
      get: function (t, name) {
        if (name in t) return t[name];
        return function () {
          call(String(name), Array.prototype.slice.call(arguments),
            ok || function () {}, fail || function () {});
        };
      }
    });
  }

  window.google = window.google || {};
  window.google.script = { run: runner(null, null) };
})();
