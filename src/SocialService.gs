/**
 * SocialService.gs
 * ============================================================================
 * Penerbitan berita ke Facebook Page dan Instagram Business melalui Meta Graph API.
 *
 * SYARAT WAJIB (sebelah Meta — bukan boleh diprogram dari sini):
 *  1. Facebook Page yang dimiliki fakulti.
 *  2. Akaun Instagram jenis BUSINESS/CREATOR yang dipautkan kepada Page tersebut.
 *     Instagram peribadi TIDAK boleh diterbitkan melalui API.
 *  3. Meta App dengan keizinan: pages_manage_posts, pages_read_engagement,
 *     instagram_basic, instagram_content_publish.
 *  4. Page Access Token berkekalan (long-lived). Token ini RAHSIA dan disimpan
 *     dalam Script Properties — bukan dalam Sheets, bukan dalam HTML.
 *
 * HAD YANG PERLU DIKETAHUI:
 *  - Instagram memerlukan URL imej AWAM yang boleh dimuat turun oleh pelayan Meta.
 *    Fail Drive perlu ditukar kepada "anyone with link" buat sementara semasa
 *    penerbitan, kemudian dikembalikan kepada domain sahaja.
 *  - Instagram tidak menyokong pautan boleh klik dalam kapsyen.
 *  - Instagram mengehadkan 25 penerbitan API setiap 24 jam bagi satu akaun.
 *  - Nisbah imej Instagram mesti antara 4:5 dan 1.91:1.
 * ============================================================================
 */

var SocialService = (function () {

  var PLATFORM = { FACEBOOK: 'FACEBOOK', INSTAGRAM: 'INSTAGRAM' };
  var POST_STATUS = { PENDING: 'PENDING', SUCCESS: 'SUCCESS', FAILED: 'FAILED' };

  function graphBase() {
    var version = CONFIG.getSecret(CONFIG.SECRET_KEYS.GRAPH_API_VERSION,
      GlobalSettings.get('SOCIAL_GRAPH_VERSION'));
    return 'https://graph.facebook.com/' + version + '/';
  }

  function pageId()   { return CONFIG.getSecret(CONFIG.SECRET_KEYS.FB_PAGE_ID); }
  function pageToken(){ return CONFIG.getSecret(CONFIG.SECRET_KEYS.FB_PAGE_TOKEN); }
  function igUserId() { return CONFIG.getSecret(CONFIG.SECRET_KEYS.IG_USER_ID); }

  /* ---------------------------------------------------------------- HTTP */

  function call_(path, payload, method) {
    var url = graphBase() + path;
    var options = {
      method: method || 'post',
      muteHttpExceptions: true,
      payload: payload || {}
    };
    var response = UrlFetchApp.fetch(url, options);
    var code = response.getResponseCode();
    var text = response.getContentText();
    var body;
    try { body = JSON.parse(text); } catch (e) { body = { raw: text }; }

    if (code < 200 || code >= 300 || body.error) {
      var msg = (body.error && body.error.message) ? body.error.message
        : ('HTTP ' + code + ' daripada Graph API.');
      throw Utils.appError('SOCIAL_API', msg);
    }
    return body;
  }

  /* ------------------------------------------------------------- Caption */

  function buildCaption(news, extraHashtags) {
    var template = GlobalSettings.get('SOCIAL_CAPTION_TEMPLATE');
    var hashtags = String(extraHashtags || GlobalSettings.get('SOCIAL_DEFAULT_HASHTAGS'));
    var cats = NewsService.categoryMap();
    var url = '';
    try { url = ScriptApp.getService().getUrl() + '?page=news-detail&id=' + news.NewsID; } catch (e) { }

    var caption = String(template)
      .replace(/\{title\}/g, String(news.Title || ''))
      .replace(/\{summary\}/g, Utils.stripTags(news.Summary || ''))
      .replace(/\{category\}/g, cats[String(news.CategoryID)] || '')
      .replace(/\{url\}/g, url)
      .replace(/\{hashtags\}/g, hashtags)
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    var max = GlobalSettings.get('SOCIAL_MAX_CAPTION');
    return caption.length > max ? caption.substring(0, max - 1) + '\u2026' : caption;
  }

  /* ---------------------------------------------------------- Image URLs */

  /**
   * Sediakan URL awam sementara bagi setiap gambar terpilih.
   * @returns {{urls:Array<string>, fileIds:Array<string>}}
   */
  function prepareImageUrls_(newsId, limit) {
    var images = ImageService.listSelectedForSocial(newsId, limit);
    if (!images.length) {
      throw Utils.appError('VALIDATION',
        'Tiada gambar dipilih. Tandakan sekurang-kurangnya satu gambar untuk media sosial.');
    }
    var urls = [], fileIds = [];
    images.forEach(function (img) {
      urls.push(ImageService.makePublic(img.fileId));
      fileIds.push(img.fileId);
    });
    return { urls: urls, fileIds: fileIds, images: images };
  }

  function cleanupSharing_(fileIds) {
    (fileIds || []).forEach(function (id) { ImageService.revertSharing(id); });
  }

  /* -------------------------------------------------------- Rekod posting */

  function recordPost_(data) {
    var id = Utils.nextId(CONFIG.ID_PREFIX.SOCIAL, false);
    SheetDB.insert(CONFIG.SHEETS.SOCIAL_POSTS, {
      PostID: id,
      NewsID: String(data.newsId),
      Platform: data.platform,
      TargetID: data.targetId || '',
      Status: data.status,
      ExternalPostID: data.externalPostId || '',
      PermalinkUrl: data.permalinkUrl || '',
      Caption: Utils.truncate(data.caption || '', 1000),
      ImageCount: data.imageCount || 0,
      ErrorMessage: Utils.truncate(data.errorMessage || '', 500),
      PostedBy: data.postedBy || '',
      RequestedAt: data.requestedAt || Utils.now(),
      CompletedAt: Utils.now()
    });
    return id;
  }

  /* ------------------------------------------------------------ Facebook */

  /**
   * Terbitkan ke Facebook Page.
   * Satu gambar  → /{page}/photos
   * Banyak gambar → muat naik unpublished, kemudian /{page}/feed dengan attached_media
   */
  function publishToFacebook(news, caption, imageUrls) {
    var token = pageToken(), page = pageId();
    if (!token || !page) {
      throw Utils.appError('CONFIG',
        'Facebook belum dikonfigurasi. Tetapkan Page ID dan Access Token dalam Tetapan > Media Sosial.');
    }

    if (!imageUrls.length) {
      var textPost = call_(page + '/feed', { message: caption, access_token: token });
      return { externalPostId: textPost.id, permalink: permalinkFb_(textPost.id) };
    }

    if (imageUrls.length === 1) {
      var single = call_(page + '/photos', {
        url: imageUrls[0], caption: caption, published: 'true', access_token: token
      });
      var postId = single.post_id || single.id;
      return { externalPostId: postId, permalink: permalinkFb_(postId) };
    }

    var mediaIds = imageUrls.map(function (url) {
      var r = call_(page + '/photos', { url: url, published: 'false', access_token: token });
      return { media_fbid: r.id };
    });

    var feed = call_(page + '/feed', {
      message: caption,
      attached_media: JSON.stringify(mediaIds),
      access_token: token
    });
    return { externalPostId: feed.id, permalink: permalinkFb_(feed.id) };
  }

  function permalinkFb_(postId) {
    if (!postId) return '';
    var parts = String(postId).split('_');
    return parts.length === 2
      ? 'https://www.facebook.com/' + parts[0] + '/posts/' + parts[1]
      : 'https://www.facebook.com/' + postId;
  }

  /* ----------------------------------------------------------- Instagram */

  /**
   * Terbitkan ke Instagram Business.
   * Satu gambar  → container → publish
   * Banyak gambar → container anak (is_carousel_item) → container CAROUSEL → publish
   */
  function publishToInstagram(news, caption, imageUrls) {
    var token = pageToken(), ig = igUserId();
    if (!token || !ig) {
      throw Utils.appError('CONFIG',
        'Instagram belum dikonfigurasi. Tetapkan IG User ID dalam Tetapan > Media Sosial.');
    }
    if (!imageUrls.length) {
      throw Utils.appError('VALIDATION', 'Instagram memerlukan sekurang-kurangnya satu gambar.');
    }

    var creationId;

    if (imageUrls.length === 1) {
      creationId = call_(ig + '/media', {
        image_url: imageUrls[0], caption: caption, access_token: token
      }).id;
    } else {
      var children = imageUrls.map(function (url) {
        return call_(ig + '/media', {
          image_url: url, is_carousel_item: 'true', access_token: token
        }).id;
      });
      creationId = call_(ig + '/media', {
        media_type: 'CAROUSEL',
        children: children.join(','),
        caption: caption,
        access_token: token
      }).id;
    }

    waitForContainer_(creationId, token);

    var published = call_(ig + '/media_publish', {
      creation_id: creationId, access_token: token
    });

    var permalink = '';
    try {
      permalink = call_(published.id + '?fields=permalink&access_token=' +
        encodeURIComponent(token), null, 'get').permalink || '';
    } catch (e) { }

    return { externalPostId: published.id, permalink: permalink };
  }

  /** Instagram memproses imej secara asinkron — tunggu sehingga FINISHED */
  function waitForContainer_(containerId, token) {
    var attempts = 0;
    var maxAttempts = 10;
    while (attempts < maxAttempts) {
      Utilities.sleep(attempts === 0 ? 2000 : 3000);
      var status = call_(containerId + '?fields=status_code,status&access_token=' +
        encodeURIComponent(token), null, 'get');
      var code = String(status.status_code || '');
      if (code === 'FINISHED') return true;
      if (code === 'ERROR' || code === 'EXPIRED') {
        throw Utils.appError('SOCIAL_API',
          'Instagram gagal memproses imej: ' + (status.status || code) +
          '. Semak saiz, format dan nisbah gambar (antara 4:5 dan 1.91:1).');
      }
      attempts++;
    }
    throw Utils.appError('SOCIAL_API',
      'Instagram mengambil masa terlalu lama memproses imej. Cuba sekali lagi.');
  }

  /* --------------------------------------------------------- Orkestrasi */

  function assertCanPublish_(user, news) {
    if (!GlobalSettings.get('SOCIAL_ENABLED')) {
      throw Utils.appError('CONFIG', 'Modul media sosial tidak diaktifkan.');
    }
    if (String(news.Status) !== STATUS.PUBLISHED) {
      throw Utils.appError('WORKFLOW',
        'Hanya berita yang sudah diterbitkan boleh dihantar ke media sosial.');
    }
    if (GlobalSettings.get('SOCIAL_REQUIRE_EDITOR')) {
      if (user.role !== ROLES.EDITOR && user.role !== ROLES.ADMIN) {
        throw Utils.appError('FORBIDDEN',
          'Hanya Editor atau Admin boleh menerbitkan ke media sosial.');
      }
    } else {
      Security.requirePermission(user, 'news.publish');
    }
  }

  /**
   * Terbitkan satu berita ke platform terpilih.
   * @param {Array<string>} platforms ['FACEBOOK','INSTAGRAM']
   * @param {Object} options { caption, hashtags }
   */
  function publish(user, newsId, platforms, options) {
    options = options || {};
    var news = NewsService.getRaw(newsId);
    Security.requireViewNews(user, news);
    assertCanPublish_(user, news);

    platforms = (platforms || []).map(function (p) { return String(p).toUpperCase(); });
    if (!platforms.length) throw Utils.appError('VALIDATION', 'Pilih sekurang-kurangnya satu platform.');

    if (platforms.indexOf(PLATFORM.FACEBOOK) !== -1 && !GlobalSettings.get('SOCIAL_FB_ENABLED')) {
      throw Utils.appError('CONFIG', 'Penerbitan Facebook tidak diaktifkan.');
    }
    if (platforms.indexOf(PLATFORM.INSTAGRAM) !== -1 && !GlobalSettings.get('SOCIAL_IG_ENABLED')) {
      throw Utils.appError('CONFIG', 'Penerbitan Instagram tidak diaktifkan.');
    }

    var caption = options.caption
      ? Security.sanitizeText(options.caption, GlobalSettings.get('SOCIAL_MAX_CAPTION'))
      : buildCaption(news, options.hashtags);

    var limit = (platforms.indexOf(PLATFORM.INSTAGRAM) !== -1)
      ? GlobalSettings.get('SOCIAL_MAX_IMAGES_IG') : GlobalSettings.get('MAX_IMAGES');

    var prepared = prepareImageUrls_(newsId, limit);
    var requestedAt = Utils.now();
    var results = [];

    try {
      platforms.forEach(function (platform) {
        try {
          var out = (platform === PLATFORM.FACEBOOK)
            ? publishToFacebook(news, caption, prepared.urls)
            : publishToInstagram(news, caption, prepared.urls);

          recordPost_({
            newsId: newsId, platform: platform,
            targetId: platform === PLATFORM.FACEBOOK ? pageId() : igUserId(),
            status: POST_STATUS.SUCCESS,
            externalPostId: out.externalPostId, permalinkUrl: out.permalink,
            caption: caption, imageCount: prepared.urls.length,
            postedBy: user.userId, requestedAt: requestedAt
          });

          AuditService.log(user.userId, 'SOCIAL_PUBLISH', 'NEWS', newsId, '', '',
            'Diterbitkan ke ' + platform + ': ' + out.externalPostId);

          results.push({ platform: platform, ok: true, permalink: out.permalink });

        } catch (err) {
          var message = err && err.isAppError ? err.message : 'Ralat penerbitan.';
          if (!(err && err.isAppError)) console.error('SOCIAL_FAIL', platform, String(err));

          recordPost_({
            newsId: newsId, platform: platform, status: POST_STATUS.FAILED,
            caption: caption, imageCount: prepared.urls.length,
            errorMessage: message, postedBy: user.userId, requestedAt: requestedAt
          });

          AuditService.log(user.userId, 'SOCIAL_PUBLISH_FAIL', 'NEWS', newsId, '', '',
            platform + ': ' + message);

          results.push({ platform: platform, ok: false, message: message });
        }
      });
    } finally {
      cleanupSharing_(prepared.fileIds);
    }

    return {
      newsId: newsId,
      caption: caption,
      imageCount: prepared.urls.length,
      results: results,
      allOk: results.every(function (r) { return r.ok; })
    };
  }

  /** Dipanggil secara automatik selepas transition PUBLISH, jika diaktifkan */
  function autoPublishIfEnabled(user, newsId) {
    if (!GlobalSettings.get('SOCIAL_ENABLED')) return null;
    if (!GlobalSettings.get('SOCIAL_AUTO_ON_PUBLISH')) return null;

    var platforms = [];
    if (GlobalSettings.get('SOCIAL_FB_ENABLED')) platforms.push(PLATFORM.FACEBOOK);
    if (GlobalSettings.get('SOCIAL_IG_ENABLED')) platforms.push(PLATFORM.INSTAGRAM);
    if (!platforms.length) return null;

    try {
      return publish(user, newsId, platforms, {});
    } catch (e) {
      console.error('SOCIAL_AUTO_FAIL', newsId, String(e));
      return null;
    }
  }

  /** Sejarah penerbitan bagi satu berita */
  function historyForNews(newsId) {
    var users = UserService.getUserMap();
    var rows = SheetDB.findWhere(CONFIG.SHEETS.SOCIAL_POSTS, function (r) {
      return String(r.NewsID) === String(newsId);
    });
    rows = Utils.sortBy(rows, 'CompletedAt', true);
    return rows.map(function (r) {
      return {
        postId: String(r.PostID),
        platform: String(r.Platform),
        status: String(r.Status),
        permalinkUrl: String(r.PermalinkUrl || ''),
        imageCount: Number(r.ImageCount || 0),
        errorMessage: String(r.ErrorMessage || ''),
        postedBy: (users[String(r.PostedBy)] || {}).name || '—',
        completedAt: Utils.formatDateTime(r.CompletedAt)
      };
    });
  }

  /**
   * Status konfigurasi untuk UI Admin.
   * Mengembalikan HANYA boolean dan pengecam awam — tiada token.
   */
  function getConfigStatus(user) {
    Security.requirePermission(user, 'settings.manage');
    return {
      enabled: GlobalSettings.get('SOCIAL_ENABLED'),
      facebook: {
        enabled: GlobalSettings.get('SOCIAL_FB_ENABLED'),
        pageIdSet: CONFIG.hasSecret(CONFIG.SECRET_KEYS.FB_PAGE_ID),
        tokenSet: CONFIG.hasSecret(CONFIG.SECRET_KEYS.FB_PAGE_TOKEN),
        pageIdMasked: maskId_(pageId())
      },
      instagram: {
        enabled: GlobalSettings.get('SOCIAL_IG_ENABLED'),
        userIdSet: CONFIG.hasSecret(CONFIG.SECRET_KEYS.IG_USER_ID),
        userIdMasked: maskId_(igUserId())
      },
      graphVersion: GlobalSettings.get('SOCIAL_GRAPH_VERSION'),
      autoOnPublish: GlobalSettings.get('SOCIAL_AUTO_ON_PUBLISH')
    };
  }

  function maskId_(value) {
    var s = String(value || '');
    if (!s) return '';
    return s.length <= 6 ? '••••' : ('••••' + s.slice(-4));
  }

  /** Simpan kredential (Admin sahaja). Nilai masuk ke Script Properties. */
  function saveCredentials(user, data) {
    Security.requirePermission(user, 'settings.manage');

    if (data.fbPageId !== undefined)
      CONFIG.setSecret(CONFIG.SECRET_KEYS.FB_PAGE_ID, String(data.fbPageId).trim());
    if (data.fbPageToken !== undefined && String(data.fbPageToken).trim() !== '')
      CONFIG.setSecret(CONFIG.SECRET_KEYS.FB_PAGE_TOKEN, String(data.fbPageToken).trim());
    if (data.igUserId !== undefined)
      CONFIG.setSecret(CONFIG.SECRET_KEYS.IG_USER_ID, String(data.igUserId).trim());
    if (data.graphVersion)
      CONFIG.setSecret(CONFIG.SECRET_KEYS.GRAPH_API_VERSION, String(data.graphVersion).trim());

    AuditService.log(user.userId, AUDIT_ACTION.UPDATE_SETTING, 'SOCIAL', 'CREDENTIALS', '', '',
      'Kemas kini kredential media sosial (nilai tidak direkodkan)');

    return getConfigStatus(user);
  }

  /** Uji sambungan tanpa menerbitkan apa-apa */
  function testConnection(user) {
    Security.requirePermission(user, 'settings.manage');
    var out = { facebook: null, instagram: null };

    if (GlobalSettings.get('SOCIAL_FB_ENABLED')) {
      try {
        var page = call_(pageId() + '?fields=name,id&access_token=' +
          encodeURIComponent(pageToken()), null, 'get');
        out.facebook = { ok: true, name: page.name, id: page.id };
      } catch (e) {
        out.facebook = { ok: false, message: e.message };
      }
    }

    if (GlobalSettings.get('SOCIAL_IG_ENABLED')) {
      try {
        var ig = call_(igUserId() + '?fields=username,id&access_token=' +
          encodeURIComponent(pageToken()), null, 'get');
        out.instagram = { ok: true, username: ig.username, id: ig.id };
      } catch (e) {
        out.instagram = { ok: false, message: e.message };
      }
    }

    return out;
  }

  return {
    PLATFORM: PLATFORM,
    buildCaption: buildCaption,
    publish: publish,
    autoPublishIfEnabled: autoPublishIfEnabled,
    historyForNews: historyForNews,
    getConfigStatus: getConfigStatus,
    saveCredentials: saveCredentials,
    testConnection: testConnection
  };
})();