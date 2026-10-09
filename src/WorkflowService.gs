/**
 * WorkflowService.gs
 * Enjin state machine. INI SATU-SATUNYA tempat status artikel boleh berubah.
 * Frontend tidak pernah menentukan status — ia hanya menghantar nama tindakan.
 */

var WorkflowService = (function () {

  /** Cari definisi transition */
  function findTransition(currentStatus, action) {
    var list = TRANSITIONS[String(currentStatus)] || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].action === String(action)) return list[i];
    }
    return null;
  }

  function statusEnabled(status) {
    var enabled = GlobalSettings.get('ENABLED_STATUSES') || [];
    return enabled.length === 0 || enabled.indexOf(status) !== -1;
  }

  /**
   * Bolehkah pengguna ini melakukan tindakan ini ke atas artikel ini?
   * @returns {{allowed:boolean, reason:string, transition:Object}}
   */
  function canTransition(user, news, action) {
    var current = String(news.Status);
    var t = findTransition(current, action);

    if (!t) return { allowed: false, reason: 'Tindakan tidak sah bagi status semasa.' };
    if (!statusEnabled(t.to)) return { allowed: false, reason: 'Status sasaran dinyahaktifkan.' };
    if (t.roles.indexOf(user.role) === -1)
      return { allowed: false, reason: 'Peranan anda tidak dibenarkan melakukan tindakan ini.' };
    if (!Security.hasPermission(user.role, t.permission))
      return { allowed: false, reason: 'Anda tiada kebenaran untuk tindakan ini.' };
    if (t.ownerOnly && String(news.AuthorID) !== String(user.userId) && user.role !== ROLES.ADMIN)
      return { allowed: false, reason: 'Hanya penulis artikel boleh melakukan tindakan ini.' };

    /*
     * Nyahkarkib mengembalikan berita kepada status Diterbitkan. Status
     * Diarkib boleh dicapai daripada DUA tempat: Diterbitkan dan Ditolak.
     * Tanpa semakan ini, berita yang ditolak Editor boleh menjadi
     * "diterbitkan" hanya dengan diarkib kemudian dinyahkarkib — memintas
     * keseluruhan aliran semakan. PublishedAt hanya terisi apabila berita
     * benar-benar pernah melalui keputusan Editor.
     */
    if (action === 'UNARCHIVE' && !news.PublishedAt) {
      return {
        allowed: false,
        reason: 'Berita ini tidak pernah diterbitkan, jadi ia tidak boleh dinyahkarkib. ' +
                'Ia perlu melalui semakan Admin dan Editor seperti biasa.'
      };
    }

    // Jika semakan Admin dilangkau melalui tetapan, hantar terus kepada Editor
    if (action === 'SUBMIT' || action === 'RESUBMIT') {
      var required = GlobalSettings.get('REQUIRED_FIELDS');
      if (required && required.length) {
        try {
          Validation.validateNews({
            title: news.Title, summary: news.Summary, content: news.Content,
            categoryId: news.CategoryID, featuredImageUrl: news.FeaturedImageURL
          }, true);
        } catch (e) {
          return { allowed: false, reason: e.message };
        }
      }
    }

    return { allowed: true, reason: '', transition: t };
  }

  /** Senarai tindakan yang boleh dipaparkan kepada pengguna (UI sahaja) */
  function getAvailableActions(user, news) {
    var list = TRANSITIONS[String(news.Status)] || [];
    return list.filter(function (t) {
      if (t.roles.indexOf(user.role) === -1) return false;
      if (!Security.hasPermission(user.role, t.permission)) return false;
      if (t.ownerOnly && String(news.AuthorID) !== String(user.userId)
        && user.role !== ROLES.ADMIN) return false;
      if (!statusEnabled(t.to)) return false;
      return true;
    }).map(function (t) {
      return {
        action: t.action,
        label: t.label,
        to: t.to,
        toLabel: GlobalSettings.statusLabel(t.to),
        requireComment: !!t.requireComment,
        tone: (t.to === STATUS.REJECTED) ? 'danger'
          : (t.to === STATUS.REVISION_REQUIRED) ? 'warning'
            : (t.to === STATUS.ARCHIVED) ? 'ghost'
              : (t.to === STATUS.PUBLISHED || t.to === STATUS.APPROVED) ? 'success' : 'primary'
      };
    });
  }

  /** Tentukan penerima notifikasi bagi setiap transition */
  function dispatchNotifications_(action, news, actor, comments) {
    var data = {
      newsId: String(news.NewsID),
      title: String(news.Title),
      author: (UserService.getUserMap()[String(news.AuthorID)] || {}).name || '—',
      reviewer: actor.name,
      comments: comments || ''
    };

    switch (action) {
      case 'SUBMIT':
      case 'RESUBMIT':
        NotificationService.notifyRole(ROLES.ADMIN, NOTIF_TYPE.SUBMISSION, data);
        break;
      case 'FORWARD_TO_EDITOR':
        NotificationService.notifyRole(ROLES.EDITOR, NOTIF_TYPE.FORWARDED, data);
        break;
      case 'REQUEST_REVISION':
        NotificationService.notifyUser(news.AuthorID, NOTIF_TYPE.REVISION, data);
        break;
      case 'REJECT':
        NotificationService.notifyUser(news.AuthorID, NOTIF_TYPE.REJECTED, data);
        break;
      case 'APPROVE':
        NotificationService.notifyUser(news.AuthorID, NOTIF_TYPE.APPROVED, data);
        break;
      case 'PUBLISH':
      case 'UNARCHIVE':
        NotificationService.notifyUser(news.AuthorID, NOTIF_TYPE.PUBLISHED, data);
        break;
      default:
        break;
    }
  }

  /** Medan tambahan yang dikemas kini bagi setiap transition */
  function sideEffects_(action, user, news) {
    var patch = {};
    switch (action) {
      case 'SUBMIT':
      case 'RESUBMIT':
        patch.SubmittedAt = Utils.now();
        patch.RejectReason = '';
        break;
      case 'FORWARD_TO_EDITOR':
        patch.AdminReviewedBy = user.userId;
        patch.AdminReviewedAt = Utils.now();
        break;
      case 'APPROVE':
        patch.EditorReviewedBy = user.userId;
        patch.EditorReviewedAt = Utils.now();
        break;
      case 'PUBLISH':
        patch.PublishedAt = Utils.now();
        break;
      case 'REJECT':
        if (user.role === ROLES.ADMIN) {
          patch.AdminReviewedBy = user.userId; patch.AdminReviewedAt = Utils.now();
        } else {
          patch.EditorReviewedBy = user.userId; patch.EditorReviewedAt = Utils.now();
        }
        break;
      default:
        break;
    }
    return patch;
  }

  /**
   * Laksanakan transition.
   * Turutan: authorize → validate → snapshot version → update → audit → notify.
   */
  function transitionNews(user, newsId, action, comments) {
    Validation.validateReviewComment(action, comments);

    var result = Utils.withLock(function () {
      var news = NewsService.getRaw(newsId);
      Security.requireViewNews(user, news);

      var check = canTransition(user, news, action);
      if (!check.allowed) throw Utils.appError('WORKFLOW', check.reason);

      var t = check.transition;
      var oldStatus = String(news.Status);

      // Snapshot versi pada setiap penghantaran supaya sejarah tidak hilang
      if (action === 'SUBMIT' || action === 'RESUBMIT') {
        NewsService.createVersion(news, user.userId,
          action === 'SUBMIT' ? 'Penghantaran pertama' : 'Penghantaran semula selepas pembetulan');
      }

      var patch = sideEffects_(action, user, news);
      patch.Status = t.to;
      patch.UpdatedAt = Utils.now();

      if (action === 'RESUBMIT') {
        patch.CurrentVersion = Number(news.CurrentVersion || 1) + 1;
      }
      if (action === 'REJECT') {
        patch.RejectReason = Security.sanitizeText(comments, 500);
      }

      // Terbit automatik selepas lulus, jika tetapan diaktifkan
      var autoPublish = (action === 'APPROVE') && GlobalSettings.get('AUTO_PUBLISH_ON_APPROVE');
      if (autoPublish) {
        patch.Status = STATUS.PUBLISHED;
        patch.PublishedAt = Utils.now();
      }

      SheetDB.updateRow(CONFIG.SHEETS.NEWS, news._row, patch);

      // Rekod semakan
      if (['FORWARD_TO_EDITOR', 'REQUEST_REVISION', 'REJECT', 'APPROVE', 'PUBLISH']
        .indexOf(action) !== -1) {
        ReviewService.record({
          newsId: newsId,
          reviewerId: user.userId,
          reviewerRole: user.role,
          reviewStage: (user.role === ROLES.ADMIN) ? REVIEW_STAGE.ADMIN : REVIEW_STAGE.EDITOR,
          decision: action,
          comments: Security.sanitizeText(comments, 1000)
        });
      }

      AuditService.log(user.userId, AUDIT_ACTION.TRANSITION, 'NEWS', newsId,
        oldStatus, patch.Status, t.label + (comments ? ' — ' + Utils.truncate(comments, 200) : ''));

      return {
        news: Object.assign({}, news, patch),
        action: action,
        autoPublished: autoPublish,
        oldStatus: oldStatus,
        newStatus: patch.Status
      };
    });

    // Notifikasi di luar lock — tidak menahan transaksi
    try {
      dispatchNotifications_(action, result.news, user, comments);
      if (result.autoPublished) {
        dispatchNotifications_('PUBLISH', result.news, user, '');
      }
    } catch (e) {
      console.error('NOTIFY_FAIL', newsId, String(e));
    }

    /*
     * Selaraskan keizinan gambar dengan status.
     *
     * Dijalankan di luar lock dan dibalut try/catch: kegagalan Drive tidak
     * sepatutnya membatalkan transisi yang sudah berjaya ditulis. Kesan
     * terburuk ialah gambar tidak kelihatan kepada pembaca awam sehingga
     * syncPublishedImageSharing() dijalankan.
     */
    if (GlobalSettings.get('PUBLIC_PORTAL_ENABLED')) {
      try {
        if (result.newStatus === STATUS.PUBLISHED) {
          ImageService.setPublicAccess(newsId, true);
        } else if (result.newStatus === STATUS.ARCHIVED) {
          ImageService.setPublicAccess(newsId, false);
        }
      } catch (e) {
        console.error('IMAGE_SHARING_SYNC_FAIL', newsId, String(e));
      }
    }

    // F11: push kepada pembaca apabila berita diterbitkan BUAT KALI PERTAMA
    // (bukan semasa dinyaharkib semula).
    if (result.newStatus === STATUS.PUBLISHED && result.oldStatus !== STATUS.PUBLISHED &&
        result.oldStatus !== STATUS.ARCHIVED) {
      try { PushService.notifyPublished(newsId); } catch (e) { console.error('PUSH_PUBLISH_FAIL', newsId, String(e)); }
    }

    // Portal statik (F5): jana semula bila kandungan awam berubah.
    // StaticSite.sync() tidak pernah melempar ralat.
    if (result.newStatus === STATUS.PUBLISHED || result.newStatus === STATUS.ARCHIVED ||
        result.oldStatus === STATUS.PUBLISHED) {
      try { StaticSite.sync(action + ' ' + newsId); } catch (e) { }
    }

    // Penerbitan automatik ke media sosial — tidak menggagalkan transition
    var social = null;
    if (result.newStatus === STATUS.PUBLISHED) {
      social = SocialService.autoPublishIfEnabled(user, newsId);
    }

    return {
      social: social,
      newsId: newsId,
      status: result.newStatus,
      statusLabel: GlobalSettings.statusLabel(result.newStatus)
    };
  }

  /** Gambaran state machine untuk dokumentasi/UI */
  function describeStateMachine() {
    return Object.keys(TRANSITIONS).map(function (from) {
      return {
        from: from,
        fromLabel: GlobalSettings.statusLabel(from),
        transitions: TRANSITIONS[from].map(function (t) {
          return { action: t.action, to: t.to, toLabel: GlobalSettings.statusLabel(t.to),
            roles: t.roles, label: t.label };
        })
      };
    });
  }

  return {
    canTransition: canTransition,
    getAvailableActions: getAvailableActions,
    transitionNews: transitionNews,
    describeStateMachine: describeStateMachine
  };
})();