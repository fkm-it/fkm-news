/**
 * AiService.gs
 * ============================================================================
 * Pembantu AI untuk staf (F8), menggunakan Claude API (Anthropic).
 *
 * Bil Claude API BERASINGAN daripada langganan Claude.ai. Kos dikawal oleh:
 *   AI_ENABLED              suis utama (lalai: mati)
 *   AI_MODEL                claude-sonnet-5-5 (kualiti) / claude-haiku-5-5 (jimat)
 *   AI_MONTHLY_BUDGET_USD   had perbelanjaan sebulan; panggilan ditolak bila habis
 * Kunci API: Script Property FKMNEWS_ANTHROPIC_KEY (RAHSIA; bukan dalam
 * tetapan, repo atau pelayar). Perbelanjaan dikira daripada `usage` setiap
 * jawapan dan disimpan ikut bulan (FKMNEWS_AI_SPEND_yyyy-MM).
 *
 * Semua output AI ialah CADANGAN: tiada apa-apa ditulis ke berita kecuali
 * pengguna menekan Simpan (news.saveEnglish) atau menyimpan borang sendiri.
 * Kandungan HTML daripada AI sentiasa melalui Security.sanitizeHtml().
 * ============================================================================
 */

var AiService = (function () {

  var KEY_PROP = 'FKMNEWS_ANTHROPIC_KEY';
  var SPEND_PREFIX = 'FKMNEWS_AI_SPEND_';
  var ENDPOINT = 'https://api.anthropic.com/v1/messages';
  var CALLS_PER_HOUR = 30;

  /* Harga USD setiap 1 juta token (platform.claude.com/docs, Okt 2026) */
  var MODELS = {
    'claude-sonnet-5-5': { input: 2, output: 10, label: 'Claude Sonnet 5.5' },
    'claude-haiku-5-5': { input: 0.10, output: 0.50, label: 'Claude Haiku 5.5' }
  };
  var DEFAULT_MODEL = 'claude-sonnet-5-5';

  function props_() { return PropertiesService.getScriptProperties(); }
  function key_() { return props_().getProperty(KEY_PROP) || ''; }

  function model_() {
    var m = '';
    try { m = String(GlobalSettings.get('AI_MODEL') || ''); } catch (e) { }
    return MODELS[m] ? m : DEFAULT_MODEL;
  }

  function monthKey_() {
    return SPEND_PREFIX + Utilities.formatDate(new Date(), Utils.timezone(), 'yyyy-MM');
  }

  function spent_() { return Number(props_().getProperty(monthKey_()) || 0); }

  function budget_() { return Number(GlobalSettings.get('AI_MONTHLY_BUDGET_USD')) || 0; }

  function status() {
    var enabled = !!GlobalSettings.get('AI_ENABLED');
    var configured = !!key_();
    return {
      enabled: enabled,
      configured: configured,
      ready: enabled && configured,
      model: model_(),
      modelLabel: MODELS[model_()].label,
      spentUsd: Math.round(spent_() * 10000) / 10000,
      budgetUsd: budget_()
    };
  }

  function requireReady_(user) {
    if (!GlobalSettings.get('AI_ENABLED')) {
      throw Utils.appError('AI_DISABLED', 'Pembantu AI tidak diaktifkan. Hidupkan AI_ENABLED dalam Tetapan.');
    }
    if (!key_()) {
      throw Utils.appError('AI_NOT_CONFIGURED', 'Kunci Claude API belum ditetapkan oleh pentadbir.');
    }
    if (spent_() >= budget_()) {
      throw Utils.appError('AI_BUDGET', 'Had perbelanjaan AI bulan ini (USD ' + budget_() +
        ') telah dicapai. Pentadbir boleh menaikkan AI_MONTHLY_BUDGET_USD.');
    }
    var cache = CacheService.getScriptCache();
    var rk = 'AI_RL_' + user.userId;
    var n = parseInt(cache.get(rk) || '0', 10);
    if (n >= CALLS_PER_HOUR) {
      throw Utils.appError('RATE_LIMIT', 'Had penggunaan AI dicapai. Cuba semula dalam sejam.');
    }
    cache.put(rk, String(n + 1), 3600);
  }

  /**
   * Panggil Claude dan pulangkan objek JSON daripada jawapan.
   * @param {string} system arahan sistem
   * @param {string} prompt mesej pengguna
   * @param {number} maxTokens had token output
   */
  function callJson_(user, system, prompt, maxTokens) {
    requireReady_(user);
    var model = model_();
    var res = UrlFetchApp.fetch(ENDPOINT, {
      method: 'post',
      contentType: 'application/json',
      headers: { 'x-api-key': key_(), 'anthropic-version': '2023-06-01' },
      payload: JSON.stringify({
        model: model,
        max_tokens: maxTokens || 2000,
        system: system,
        messages: [{ role: 'user', content: prompt }]
      }),
      muteHttpExceptions: true
    });
    var code = res.getResponseCode();
    var body = {};
    try { body = JSON.parse(res.getContentText() || '{}'); } catch (e) { body = {}; }
    if (code !== 200) {
      console.error('AI_HTTP', code, String(res.getContentText()).substring(0, 300));
      throw Utils.appError('AI_ERROR', code === 401
        ? 'Kunci Claude API tidak sah. Semak FKMNEWS_ANTHROPIC_KEY.'
        : 'Perkhidmatan AI tidak dapat dihubungi (' + code + '). Cuba sebentar lagi.');
    }

    // Kira kos sebenar daripada usage
    var price = MODELS[model];
    var usage = body.usage || {};
    var cost = ((Number(usage.input_tokens) || 0) * price.input +
      (Number(usage.output_tokens) || 0) * price.output) / 1e6;
    try { props_().setProperty(monthKey_(), String(spent_() + cost)); } catch (e) { }

    var text = ((body.content || []).filter(function (c) { return c.type === 'text'; })[0] || {}).text || '';
    var a = text.indexOf('{'), b = text.lastIndexOf('}');
    if (a === -1 || b <= a) throw Utils.appError('AI_ERROR', 'Jawapan AI tidak dapat dibaca. Cuba semula.');
    var out;
    try { out = JSON.parse(text.substring(a, b + 1)); }
    catch (e) { throw Utils.appError('AI_ERROR', 'Jawapan AI tidak dapat dibaca. Cuba semula.'); }

    try {
      AuditService.log(user.userId, 'AI_CALL', 'AI', model, '', '',
        'Token ' + (usage.input_tokens || 0) + '/' + (usage.output_tokens || 0) +
        ' · USD ' + cost.toFixed(4));
    } catch (e) { }
    return out;
  }

  function str_(v, max) { return Security.sanitizeText(String(v == null ? '' : v), max || 2000); }

  /* ------------------------------------------------------------ Tindakan */

  /** Draf berita daripada nota kasar (tidak disimpan) */
  function draft(user, notes, categoryName) {
    notes = String(notes || '').trim();
    if (notes.length < 30) throw Utils.appError('VALIDATION', 'Tulis sekurang-kurangnya beberapa ayat nota.');
    if (notes.length > 8000) notes = notes.substring(0, 8000);

    var out = callJson_(user, AiPrompts.system(), AiPrompts.draft(notes, categoryName), 3000);
    return {
      title: str_(out.title, GlobalSettings.get('MAX_TITLE_LENGTH')),
      summary: str_(out.summary, GlobalSettings.get('MAX_SUMMARY_LENGTH')),
      content: Security.sanitizeHtml(String(out.content || '')),
      suggestedCategory: str_(out.suggestedCategory, 60),
      missingInfo: (Array.isArray(out.missingInfo) ? out.missingInfo : []).slice(0, 10)
        .map(function (m) { return str_(m, 200); })
    };
  }

  /** Semakan awal format/ejaan/struktur untuk Admin (tidak mengubah berita) */
  function review(user, news) {
    var out = callJson_(user, AiPrompts.system(), AiPrompts.review(news), 2500);
    var items = (Array.isArray(out.items) ? out.items : []).slice(0, 30).map(function (it) {
      return {
        type: str_(it.type, 20),
        location: str_(it.location, 120),
        issue: str_(it.issue, 400),
        suggestion: str_(it.suggestion, 600)
      };
    });
    return { score: Math.max(0, Math.min(100, Number(out.score) || 0)), summary: str_(out.summary, 500), items: items };
  }

  /** Cadangan versi Bahasa Inggeris (disimpan hanya melalui news.saveEnglish) */
  function translate(user, news) {
    var out = callJson_(user, AiPrompts.system(), AiPrompts.translate(news), 4000);
    return {
      titleEn: str_(out.titleEn, GlobalSettings.get('MAX_TITLE_LENGTH')),
      summaryEn: str_(out.summaryEn, GlobalSettings.get('MAX_SUMMARY_LENGTH')),
      contentEn: Security.sanitizeHtml(String(out.contentEn || ''))
    };
  }

  /** Kapsyen media sosial */
  function social(user, news) {
    var out = callJson_(user, AiPrompts.system(), AiPrompts.social(news), 1500);
    return {
      facebook: str_(out.facebook, 2000),
      instagram: str_(out.instagram, 2200),
      linkedin: str_(out.linkedin, 2000)
    };
  }

  return {
    status: status,
    draft: draft,
    review: review,
    translate: translate,
    social: social,
    MODELS: MODELS
  };
})();
