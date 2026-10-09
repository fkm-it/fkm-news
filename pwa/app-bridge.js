/*
 * app-bridge.js — aplikasi staf di GitHub Pages.
 *
 * 1. google.script.run tiruan: .api(action, payload) dihantar sebagai
 *    fetch POST { fn: 'apiWeb', args: [token, action, payload] } ke /exec.
 *    Fungsi lain (publicApi, dll.) dihantar terus dengan nama yang sama.
 * 2. window.FKMNEWS_WEB: log masuk OTP (request / verify / logout) untuk
 *    login.html dan menu profil.
 *
 * Token sesi disimpan dalam localStorage pelayar ini sahaja. Ia bukan kata
 * laluan: tamat selepas tempoh tidak aktif atau 8 jam, dan boleh dibatalkan
 * dengan Log keluar.
 */
(function () {
  'use strict';
  var API = (window.FKMNEWS_CONFIG || {}).apiUrl || '';
  var KEY = 'FKMNEWS_TOKEN';

  function getToken() { try { return localStorage.getItem(KEY) || ''; } catch (e) { return ''; } }
  function setToken(t) { try { t ? localStorage.setItem(KEY, t) : localStorage.removeItem(KEY); } catch (e) { } }

  function post(fn, args) {
    if (!API) return Promise.reject(new Error('API belum dikonfigurasi.'));
    return fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ fn: fn, args: args }),
      credentials: 'omit',
      redirect: 'follow'
    }).then(function (r) {
      if (!r.ok) throw new Error('Pelayan memulangkan ralat ' + r.status + '.');
      return r.json();
    }, function () {
      throw new Error('Sambungan terputus. Semak internet dan cuba lagi.');
    });
  }

  /* Panggilan auth: sampul { ok, data | error } → Promise data */
  function authCall(fn, args) {
    return post(fn, args).then(function (res) {
      if (res && res.ok) return res.data;
      throw new Error((res && res.error && res.error.message) || 'Ralat tidak diketahui.');
    });
  }

  var web = {
    lastError: '',
    request: function (email) { return authCall('authRequest', [email]); },
    verify: function (email, code) {
      return authCall('authVerify', [email, code]).then(function (d) {
        setToken(d.token);
        return d;
      });
    },
    logout: function () {
      var t = getToken();
      setToken('');
      var done = function () { location.reload(); };
      (t ? post('authLogout', [t]) : Promise.resolve()).then(done, done);
    }
  };
  window.FKMNEWS_WEB = web;

  function invoke(name, args, ok, fail) {
    var fn = name, payload = args;
    if (name === 'api') {
      var token = getToken();
      if (!token) {
        ok({ ok: false, error: { code: 'UNAUTHENTICATED', message: '' } });
        return;
      }
      fn = 'apiWeb';
      payload = [token].concat(args);
    }
    post(fn, payload).then(function (res) {
      if (name === 'api' && res && !res.ok && res.error && res.error.code === 'UNAUTHENTICATED') {
        setToken('');
        web.lastError = res.error.message || 'Sesi anda telah tamat. Sila log masuk semula.';
        if (window.App && App.state && App.state.user) { location.reload(); return; }
      }
      ok(res);
    }, fail);
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
          invoke(String(name), Array.prototype.slice.call(arguments),
            ok || function () {}, fail || function () {});
        };
      }
    });
  }

  window.google = window.google || {};
  window.google.script = { run: runner(null, null) };
})();
