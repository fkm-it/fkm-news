/**
 * StaticSite.gs
 * ============================================================================
 * Portal Statik Pantas (F5).
 *
 * Apabila berita diterbitkan, diarkibkan atau dinyaharkib, semua jawapan
 * portal awam dijana SEKALI di sini dan ditolak ke repo GitHub sebagai fail
 * JSON di bawah data/ (satu commit, melalui Git Data API). Aliran kerja
 * GitHub "site-data.yml" kemudian menerbitkannya ke GitHub Pages bersama
 * halaman /b/<slug>/ (pratonton WhatsApp/Facebook) dan sitemap.xml.
 *
 * Portal (pwa/bridge.js) membaca fail statik ini dahulu (CDN, ~0.1 s) dan
 * hanya menghubungi Apps Script untuk carian, kiraan tontonan dan apa-apa
 * yang belum ada dalam salinan statik.
 *
 * Hanya data AWAM dieksport — jawapan yang sama seperti publicApi(), iaitu
 * berita berstatus PUBLISHED sahaja.
 *
 * Konfigurasi (Script Properties, ditetapkan oleh pemilik):
 *   FKMNEWS_GITHUB_TOKEN  token GitHub (fine-grained: repo fkm-news,
 *                         Contents: Read and write). RAHSIA.
 *   FKMNEWS_GITHUB_REPO   pilihan, lalai 'fkm-it/fkm-news'
 * Tanpa token: perubahan ditanda "kotor" dan portal kekal menggunakan
 * Apps Script secara terus (seperti sebelum F5).
 * ============================================================================
 */

var StaticSite = (function () {

  var TOKEN_KEY = 'FKMNEWS_GITHUB_TOKEN';
  var REPO_KEY = 'FKMNEWS_GITHUB_REPO';
  var DIRTY_KEY = 'FKMNEWS_STATIC_DIRTY';
  var LAST_KEY = 'FKMNEWS_STATIC_LAST';
  var LANGS_ = ['bm', 'en'];
  var LIST_SIZE = 9;           // sama seperti PublicService 'public.list'
  var BRANCH = 'main';

  function props_() { return PropertiesService.getScriptProperties(); }

  function token_() { return props_().getProperty(TOKEN_KEY) || ''; }

  function repo_() { return props_().getProperty(REPO_KEY) || 'fkm-it/fkm-news'; }

  function isConfigured() { return !!token_(); }

  /* --------------------------------------------------------- Penjanaan */

  function envelope_(fn) {
    try { return JSON.stringify({ ok: true, data: fn() }); }
    catch (e) { return null; }
  }

  /**
   * Jana semua fail data awam.
   * @returns {Object<string,string>} laluan → kandungan JSON
   */
  function buildFiles() {
    var files = {};
    var cats = NewsService.listCategories(true);
    var catIds = [''].concat(cats.map(function (c) { return String(c.categoryId); }));

    var published = SheetDB.findWhere(CONFIG.SHEETS.NEWS, function (n) {
      return String(n.Status) === STATUS.PUBLISHED;
    });

    var index = [];

    LANGS_.forEach(function (lang) {
      var base = 'data/' + lang + '/';
      var put = function (path, json) { if (json) files[base + path] = json; };

      put('bootstrap.json', envelope_(function () {
        return PublicService.handle('public.bootstrap', { lang: lang });
      }));
      put('home.json', envelope_(function () {
        return PublicService.handle('public.home', { lang: lang });
      }));
      put('sidebar.json', envelope_(function () { return getSidebarData_(lang); }));

      catIds.forEach(function (cid) {
        var page = 1, pages = 1;
        do {
          var res = null;
          var json = envelope_(function () {
            res = PublicService.handle('public.list', { lang: lang, categoryId: cid, page: page });
            return res;
          });
          put('list-' + (cid || 'all') + '-' + page + '.json', json);
          pages = res ? res.totalPages : 1;
          page++;
        } while (page <= pages && page <= 50);
      });

      published.forEach(function (n) {
        var id = String(n.NewsID);
        var art = null;
        var json = envelope_(function () {
          art = PublicService.handle('public.article', { lang: lang, newsId: id }, false);
          return art;
        });
        put('a/' + id + '.json', json);
        if (lang === 'bm' && art) {
          index.push({
            id: id,
            slug: String(n.Slug || '') || id.toLowerCase(),
            title: art.title,
            summary: Utils.truncate(Utils.stripTags(art.summary || ''), 200),
            imageUrl: art.imageUrl || '',
            publishedAt: art.publishedAtRaw || 0,
            category: art.categoryName || '',
            hasEnglish: !!art.hasEnglish
          });
        }
      });
    });

    files['data/index.json'] = JSON.stringify({
      generatedAt: new Date().toISOString(),
      siteName: GlobalSettings.get('SYSTEM_SHORT_NAME'),
      facultyName: GlobalSettings.get('FACULTY_NAME'),
      articles: index
    });
    return files;
  }

  /* ------------------------------------------------------- GitHub API */

  function gh_(method, path, body) {
    var res = UrlFetchApp.fetch('https://api.github.com/repos/' + repo_() + path, {
      method: method,
      contentType: 'application/json',
      headers: {
        Authorization: 'Bearer ' + token_(),
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
      },
      payload: body ? JSON.stringify(body) : null,
      muteHttpExceptions: true
    });
    var code = res.getResponseCode();
    var text = res.getContentText();
    if (code < 200 || code >= 300) {
      throw new Error('GitHub ' + method + ' ' + path + ' → ' + code + ': ' + String(text).substring(0, 200));
    }
    return text ? JSON.parse(text) : {};
  }

  /**
   * Satu commit: tulis semua fail data/, padam fail data/ yang tidak lagi
   * wujud (berita diarkibkan). Tiada commit jika tiada perubahan.
   */
  function pushFiles_(files, message) {
    var ref = gh_('get', '/git/ref/heads/' + BRANCH);
    var headSha = ref.object.sha;
    var head = gh_('get', '/git/commits/' + headSha);
    var baseTree = head.tree.sha;

    var existing = gh_('get', '/git/trees/' + baseTree + '?recursive=1').tree || [];
    var entries = [];
    existing.forEach(function (t) {
      if (t.type === 'blob' && t.path.indexOf('data/') === 0 && !files[t.path]) {
        entries.push({ path: t.path, mode: '100644', type: 'blob', sha: null });
      }
    });
    Object.keys(files).sort().forEach(function (path) {
      entries.push({ path: path, mode: '100644', type: 'blob', content: files[path] });
    });

    var tree = gh_('post', '/git/trees', { base_tree: baseTree, tree: entries });
    if (tree.sha === baseTree) return { changed: false, commit: headSha };

    var commit = gh_('post', '/git/commits', { message: message, tree: tree.sha, parents: [headSha] });
    gh_('patch', '/git/refs/heads/' + BRANCH, { sha: commit.sha });
    return { changed: true, commit: commit.sha };
  }

  /* ------------------------------------------------------------ Awam */

  /**
   * Tandakan salinan statik perlu dijana semula (cth. tetapan jenama,
   * kategori, kad ucapan berubah). Trigger 10 minit akan menolaknya.
   */
  function markDirty(reason) {
    try { props_().setProperty(DIRTY_KEY, new Date().toISOString() + ' ' + String(reason || '')); }
    catch (e) { }
    if (isConfigured()) ensureTrigger_();
  }

  function ensureTrigger_() {
    try {
      var has = ScriptApp.getProjectTriggers().some(function (t) {
        return t.getHandlerFunction() === 'staticSiteSync';
      });
      if (!has) ScriptApp.newTrigger('staticSiteSync').timeBased().everyMinutes(10).create();
    } catch (e) { console.error('STATIC_TRIGGER_FAIL', String(e)); }
  }

  /**
   * Jana dan tolak salinan statik. Tidak pernah melempar ralat kepada
   * pemanggil (penerbitan berita tidak boleh gagal kerana GitHub).
   */
  function sync(reason) {
    if (!isConfigured()) {
      markDirty(reason);
      return { ok: false, skipped: 'NO_TOKEN' };
    }
    try {
      var files = buildFiles();
      var out = pushFiles_(files, 'data: kemas kini portal statik (' + String(reason || 'manual') + ')');
      props_().deleteProperty(DIRTY_KEY);
      props_().setProperty(LAST_KEY, new Date().toISOString() + ' ' + out.commit.substring(0, 7));
      return { ok: true, changed: out.changed, files: Object.keys(files).length, commit: out.commit };
    } catch (e) {
      console.error('STATIC_SYNC_FAIL', String(e));
      markDirty(reason);
      return { ok: false, error: String(e && e.message || e).substring(0, 300) };
    }
  }

  function syncIfDirty() {
    var dirty = props_().getProperty(DIRTY_KEY);
    if (!dirty) return { ok: true, skipped: 'CLEAN' };
    return sync('tertunda: ' + dirty.split(' ').slice(1).join(' '));
  }

  function status() {
    return {
      configured: isConfigured(),
      repo: repo_(),
      dirty: props_().getProperty(DIRTY_KEY) || '',
      last: props_().getProperty(LAST_KEY) || ''
    };
  }

  return {
    buildFiles: buildFiles,
    sync: sync,
    syncIfDirty: syncIfDirty,
    markDirty: markDirty,
    status: status,
    isConfigured: isConfigured
  };
})();

/** Trigger berkala (10 minit): tolak salinan statik jika ada perubahan tertunda. */
function staticSiteSync(e) {
  requireOwnerOrTrigger_('staticSiteSync', e);
  return StaticSite.syncIfDirty();
}

/**
 * Jalankan dari editor oleh pemilik: jana semula portal statik sekarang dan
 * pasang trigger 10 minit jika belum ada. Lihat log untuk keputusan.
 */
function staticSiteRebuild() {
  requireOwnerOrTrigger_('staticSiteRebuild', arguments[0]);
  var has = ScriptApp.getProjectTriggers().some(function (t) {
    return t.getHandlerFunction() === 'staticSiteSync';
  });
  if (!has) ScriptApp.newTrigger('staticSiteSync').timeBased().everyMinutes(10).create();
  var out = StaticSite.sync('manual');
  console.log(JSON.stringify(out));
  return out;
}
