/**
 * GlobalSettings.gs
 * ============================================================================
 * PUSAT KAWALAN TUNGGAL bagi semua design & behaviour sistem.
 *
 * Peraturan:
 *  - Tiada warna, label, had, format tarikh atau feature flag di-hard-code
 *    dalam fail lain. Semua dibaca dari sini.
 *  - Setting bertanda isPublic=true sahaja dihantar ke frontend.
 *  - Setiap setting mempunyai jenis + validator supaya Admin tidak boleh
 *    menyimpan nilai rosak melalui UI.
 * ============================================================================
 */

var GlobalSettings = (function () {

  /**
   * SKEMA SETTING — definisi rasmi.
   * type: string | number | boolean | color | json | csv
   * isPublic: boleh dihantar kepada client
   */
  var SCHEMA = {

    /* ---------- Branding ---------- */
    SYSTEM_NAME:        { group: 'Branding', type: 'string', isPublic: true,  def: 'Sistem Pengurusan & Penerbitan Berita FKM', desc: 'Nama penuh sistem' },
    SYSTEM_SHORT_NAME:  { group: 'Branding', type: 'string', isPublic: true,  def: 'FKM News', desc: 'Nama ringkas untuk header' },
    FACULTY_NAME:       { group: 'Branding', type: 'string', isPublic: true,  def: 'Fakulti Kejuruteraan Mekanikal, UTM', desc: 'Nama fakulti' },
    ORGANISATION_NAME:  { group: 'Branding', type: 'string', isPublic: true,  def: 'Universiti Teknologi Malaysia', desc: 'Nama universiti' },
    LOGO_URL:           { group: 'Branding', type: 'string', isPublic: true,  def: '', desc: 'URL logo (kosong = guna monogram teks)' },
    FAVICON_URL:        { group: 'Branding', type: 'string', isPublic: true,  def: '', desc: 'URL favicon' },
    FOOTER_TEXT:        { group: 'Branding', type: 'string', isPublic: true,  def: 'Unit Teknologi Maklumat, FKM UTM', desc: 'Teks kaki laman' },

    /* ---------- Theme ---------- */
    PRIMARY_COLOR:      { group: 'Theme', type: 'color', isPublic: true, def: '#6B1839', desc: 'Warna utama (marun FKM)' },
    SECONDARY_COLOR:    { group: 'Theme', type: 'color', isPublic: true, def: '#7B3FA8', desc: 'Warna sekunder (ungu)' },
    ACCENT_COLOR:       { group: 'Theme', type: 'color', isPublic: true, def: '#C8952B', desc: 'Warna aksen (emas)' },
    SIDEBAR_GRADIENT_TO:{ group: 'Theme', type: 'color', isPublic: true, def: '#3B1244', desc: 'Hujung gradien sidebar (ungu gelap)' },
    BG_COLOR:           { group: 'Theme', type: 'color', isPublic: true, def: '#F7F5F8', desc: 'Warna latar halaman' },
    SURFACE_COLOR:      { group: 'Theme', type: 'color', isPublic: true, def: '#FFFFFF', desc: 'Warna permukaan kad' },
    TEXT_COLOR:         { group: 'Theme', type: 'color', isPublic: true, def: '#16202E', desc: 'Warna teks utama' },
    MUTED_COLOR:        { group: 'Theme', type: 'color', isPublic: true, def: '#5C6B7F', desc: 'Warna teks sekunder' },
    BORDER_COLOR:       { group: 'Theme', type: 'color', isPublic: true, def: '#E7E2EA', desc: 'Warna sempadan' },
    SUCCESS_COLOR:      { group: 'Theme', type: 'color', isPublic: true, def: '#1E7A4B', desc: 'Warna kejayaan' },
    WARNING_COLOR:      { group: 'Theme', type: 'color', isPublic: true, def: '#B5761B', desc: 'Warna amaran' },
    DANGER_COLOR:       { group: 'Theme', type: 'color', isPublic: true, def: '#B3261E', desc: 'Warna bahaya' },
    INFO_COLOR:         { group: 'Theme', type: 'color', isPublic: true, def: '#7B3FA8', desc: 'Warna maklumat' },
    SHADOW:             { group: 'Theme', type: 'string', isPublic: true, def: '0 1px 2px rgba(18,40,76,.06), 0 8px 24px rgba(18,40,76,.06)', desc: 'Bayang kad' },

    /* ---------- Dark Mode ----------
       Set token gelap yang berasingan. Apabila pengguna menukar mod, JavaScript
       menyuntik set ini ke :root — tiada helaian CSS kedua, tiada kelas .dark
       bertaburan dalam markup. */
    THEME_TOGGLE_ENABLED: { group: 'Dark', type: 'boolean', isPublic: true, def: true, desc: 'Benarkan pengguna menukar mod terang/gelap' },
    DEFAULT_THEME_MODE:   { group: 'Dark', type: 'string', isPublic: true, def: 'light', desc: 'Mod lalai untuk pengguna baharu', options: ['light', 'dark', 'system'] },
    DARK_PRIMARY_COLOR:   { group: 'Dark', type: 'color', isPublic: true, def: '#2A0E22', desc: 'Warna sidebar dalam mod gelap' },
    DARK_SECONDARY_COLOR: { group: 'Dark', type: 'color', isPublic: true, def: '#B583D8', desc: 'Warna sekunder (gelap)' },
    DARK_ACCENT_COLOR:    { group: 'Dark', type: 'color', isPublic: true, def: '#E0B457', desc: 'Warna aksen (gelap)' },
    DARK_BG_COLOR:        { group: 'Dark', type: 'color', isPublic: true, def: '#150E18', desc: 'Latar halaman (gelap)' },
    DARK_SURFACE_COLOR:   { group: 'Dark', type: 'color', isPublic: true, def: '#1F1522', desc: 'Permukaan kad (gelap)' },
    DARK_TEXT_COLOR:      { group: 'Dark', type: 'color', isPublic: true, def: '#E6ECF4', desc: 'Teks utama (gelap)' },
    DARK_MUTED_COLOR:     { group: 'Dark', type: 'color', isPublic: true, def: '#93A3B8', desc: 'Teks sekunder (gelap)' },
    DARK_BORDER_COLOR:    { group: 'Dark', type: 'color', isPublic: true, def: '#3A2A3F', desc: 'Sempadan (gelap)' },
    DARK_SUCCESS_COLOR:   { group: 'Dark', type: 'color', isPublic: true, def: '#43B37A', desc: 'Kejayaan (gelap)' },
    DARK_WARNING_COLOR:   { group: 'Dark', type: 'color', isPublic: true, def: '#D9A040', desc: 'Amaran (gelap)' },
    DARK_DANGER_COLOR:    { group: 'Dark', type: 'color', isPublic: true, def: '#E0685F', desc: 'Bahaya (gelap)' },
    DARK_INFO_COLOR:      { group: 'Dark', type: 'color', isPublic: true, def: '#B583D8', desc: 'Maklumat (gelap)' },
    DARK_SHADOW:          { group: 'Dark', type: 'string', isPublic: true, def: '0 1px 2px rgba(0,0,0,.28), 0 8px 24px rgba(0,0,0,.24)', desc: 'Bayang kad (gelap)' },
    DARK_STATUS_COLORS:   { group: 'Dark', type: 'json', isPublic: true, desc: 'Warna status dalam mod gelap (kontras lebih tinggi)',
      def: JSON.stringify({
        DRAFT: '#93A3B8', SUBMITTED: '#5B9BE8', ADMIN_REVIEW: '#5B9BE8',
        REVISION_REQUIRED: '#D9A040', RESUBMITTED: '#5B9BE8',
        EDITOR_REVIEW: '#A97FD6', APPROVED: '#43B37A',
        PUBLISHED: '#7FB2F0', REJECTED: '#E0685F', ARCHIVED: '#93A3B8'
      }) },

    /* ---------- Typography ---------- */
    FONT_FAMILY:        { group: 'Typography', type: 'string', isPublic: true, def: 'Poppins, "Segoe UI", system-ui, -apple-system, sans-serif', desc: 'Keluarga fon (jangan mulakan dengan tanda petik tunggal)' },
    FONT_FAMILY_HEADING:{ group: 'Typography', type: 'string', isPublic: true, def: 'Poppins, "Segoe UI", system-ui, sans-serif', desc: 'Fon tajuk (jangan mulakan dengan tanda petik tunggal)' },
    BASE_FONT_SIZE:     { group: 'Typography', type: 'string', isPublic: true, def: '15px', desc: 'Saiz asas teks' },
    BODY_FONT_WEIGHT:   { group: 'Typography', type: 'number', isPublic: true, def: 400, desc: 'Berat teks badan (400 = normal, 500 = lebih tebal)' },
    HEADING_FONT_WEIGHT:{ group: 'Typography', type: 'number', isPublic: true, def: 600, desc: 'Berat teks tajuk' },
    LETTER_SPACING:     { group: 'Typography', type: 'string', isPublic: true, def: '-0.005em', desc: 'Jarak huruf badan' },
    HEADING_SCALE:      { group: 'Typography', type: 'number', isPublic: true, def: 1.2, desc: 'Nisbah skala tajuk' },

    /* ---------- Layout ---------- */
    SIDEBAR_MODE:       { group: 'Layout', type: 'string', isPublic: true, def: 'expanded', desc: 'expanded | collapsed', options: ['expanded', 'collapsed'] },
    HEADER_MODE:        { group: 'Layout', type: 'string', isPublic: true, def: 'sticky', desc: 'sticky | static', options: ['sticky', 'static'] },
    CONTENT_MAX_WIDTH:  { group: 'Layout', type: 'string', isPublic: true, def: '1240px', desc: 'Lebar maksimum kandungan' },
    BORDER_RADIUS:      { group: 'Layout', type: 'string', isPublic: true, def: '16px', desc: 'Jejari sudut' },
    DENSITY:            { group: 'Layout', type: 'string', isPublic: true, def: 'comfortable', desc: 'comfortable | compact', options: ['comfortable', 'compact'] },

    /* ---------- Workflow ---------- */
    ENABLED_STATUSES:   { group: 'Workflow', type: 'csv', isPublic: true, def: 'DRAFT,SUBMITTED,ADMIN_REVIEW,REVISION_REQUIRED,RESUBMITTED,EDITOR_REVIEW,APPROVED,PUBLISHED,REJECTED,ARCHIVED', desc: 'Status yang diaktifkan' },
    REQUIRE_ADMIN_REVIEW:{ group: 'Workflow', type: 'boolean', isPublic: true, def: true, desc: 'Wajib semakan Admin sebelum Editor' },
    ALLOW_AUTHOR_DELETE_DRAFT: { group: 'Workflow', type: 'boolean', isPublic: true, def: true, desc: 'Author boleh padam draf sendiri' },
    REQUIRE_COMMENT_ON_REJECT: { group: 'Workflow', type: 'boolean', isPublic: true, def: true, desc: 'Komen wajib semasa tolak/pembetulan' },
    AUTO_PUBLISH_ON_APPROVE:   { group: 'Workflow', type: 'boolean', isPublic: true, def: false, desc: 'Terbit automatik selepas lulus' },
    STATUS_LABELS:      { group: 'Workflow', type: 'json', isPublic: true, desc: 'Label paparan bagi setiap status',
      def: JSON.stringify({
        DRAFT: 'Draf', SUBMITTED: 'Dihantar', ADMIN_REVIEW: 'Semakan Admin',
        REVISION_REQUIRED: 'Perlu Pembetulan', RESUBMITTED: 'Dihantar Semula',
        EDITOR_REVIEW: 'Semakan Editor', APPROVED: 'Diluluskan',
        PUBLISHED: 'Diterbitkan', REJECTED: 'Ditolak', ARCHIVED: 'Diarkib'
      }) },
    STATUS_COLORS:      { group: 'Workflow', type: 'json', isPublic: true, desc: 'Warna bagi setiap status',
      def: JSON.stringify({
        DRAFT: '#5C6B7F', SUBMITTED: '#1F4B8E', ADMIN_REVIEW: '#1F4B8E',
        REVISION_REQUIRED: '#B5761B', RESUBMITTED: '#1F4B8E',
        EDITOR_REVIEW: '#6B3FA0', APPROVED: '#1E7A4B',
        PUBLISHED: '#12284C', REJECTED: '#B3261E', ARCHIVED: '#5C6B7F'
      }) },

    /* ---------- Article ---------- */
    MAX_TITLE_LENGTH:   { group: 'Article', type: 'number', isPublic: true, def: 150, desc: 'Had aksara tajuk' },
    MIN_TITLE_LENGTH:   { group: 'Article', type: 'number', isPublic: true, def: 10, desc: 'Minimum aksara tajuk' },
    MAX_SUMMARY_LENGTH: { group: 'Article', type: 'number', isPublic: true, def: 300, desc: 'Had aksara ringkasan' },
    MIN_CONTENT_LENGTH: { group: 'Article', type: 'number', isPublic: true, def: 100, desc: 'Minimum aksara kandungan' },
    MAX_CONTENT_LENGTH: { group: 'Article', type: 'number', isPublic: true, def: 30000, desc: 'Had aksara kandungan' },
    REQUIRED_FIELDS:    { group: 'Article', type: 'csv', isPublic: true, def: 'Title,CategoryID,Summary,Content', desc: 'Medan wajib semasa hantar' },
    ALLOW_RICH_TEXT:    { group: 'Article', type: 'boolean', isPublic: true, def: true, desc: 'Benarkan format teks kaya' },

    /* ---------- Upload ---------- */
    MAX_FILE_SIZE_MB:   { group: 'Upload', type: 'number', isPublic: true, def: 10, desc: 'Saiz maksimum satu fail (MB)' },
    ALLOWED_EXTENSIONS: { group: 'Upload', type: 'csv', isPublic: true, def: 'jpg,jpeg,png,webp,gif,pdf,docx,xlsx,pptx', desc: 'Sambungan fail dibenarkan' },
    ALLOWED_IMAGE_EXTENSIONS: { group: 'Upload', type: 'csv', isPublic: true, def: 'jpg,jpeg,png,webp', desc: 'Sambungan imej dibenarkan' },
    MAX_IMAGES:         { group: 'Upload', type: 'number', isPublic: true, def: 10, desc: 'Bilangan imej maksimum' },
    MAX_ATTACHMENTS:    { group: 'Upload', type: 'number', isPublic: true, def: 5, desc: 'Bilangan lampiran maksimum' },

    /* ---------- Notification ---------- */
    EMAIL_ENABLED:      { group: 'Notification', type: 'boolean', isPublic: false, def: true, desc: 'Hantar notifikasi e-mel' },
    REMINDER_ENABLED:   { group: 'Notification', type: 'boolean', isPublic: false, def: true, desc: 'Peringatan harian (Isnin–Jumaat) bagi berita tersangkut dalam semakan' },
    REMINDER_DAYS:      { group: 'Notification', type: 'number', isPublic: false, def: 2, desc: 'Berita dianggap tertunggak selepas berapa hari tanpa tindakan' },
    IN_APP_ENABLED:     { group: 'Notification', type: 'boolean', isPublic: true,  def: true, desc: 'Notifikasi dalam sistem' },
    ADMIN_EMAIL:        { group: 'Notification', type: 'string', isPublic: false, def: '', desc: 'E-mel Admin untuk makluman sistem' },
    EMAIL_SENDER_NAME:  { group: 'Notification', type: 'string', isPublic: false, def: 'FKM News', desc: 'Nama pengirim e-mel' },
    EMAIL_SUBJECT_PREFIX:{ group: 'Notification', type: 'string', isPublic: false, def: '[FKM News]', desc: 'Awalan tajuk e-mel' },
    NOTIFICATION_POLL_SECONDS: { group: 'Notification', type: 'number', isPublic: true, def: 120, desc: 'Selang semak notifikasi baharu (saat)' },

    /* ---------- Security ---------- */
    SESSION_TIMEOUT_MINUTES: { group: 'Security', type: 'number', isPublic: true, def: 60, desc: 'Had masa sesi tidak aktif (minit)' },
    REQUIRE_DOMAIN:     { group: 'Security', type: 'boolean', isPublic: false, def: true, desc: 'Hadkan akses kepada domain tertentu' },
    ALLOWED_DOMAINS:    { group: 'Security', type: 'csv', isPublic: false, def: 'utm.my,graduate.utm.my,mail.fkm.utm.my', desc: 'Domain e-mel dibenarkan' },
    MAX_LOGIN_ATTEMPTS: { group: 'Security', type: 'number', isPublic: false, def: 5, desc: 'Had cubaan akses gagal' },
    TEST_MODE_ENABLED:  { group: 'Security', type: 'boolean', isPublic: true, def: false, desc: 'Benarkan Admin menukar peranan sendiri untuk ujian (MATIKAN dalam produksi)' },
    AUTO_REGISTER_AUTHOR: { group: 'Security', type: 'boolean', isPublic: false, def: false, desc: 'Daftar pengguna domain baharu sebagai Author secara automatik' },

    /* ---------- Dashboard ---------- */
    PAGE_SIZE:          { group: 'Dashboard', type: 'number', isPublic: true, def: 10, desc: 'Bilangan rekod setiap halaman' },
    PAGE_SIZE_OPTIONS:  { group: 'Dashboard', type: 'csv', isPublic: true, def: '10,25,50,100', desc: 'Pilihan saiz halaman' },
    KPI_LIMIT:          { group: 'Dashboard', type: 'number', isPublic: true, def: 6, desc: 'Bilangan kad KPI' },
    RECENT_LIMIT:       { group: 'Dashboard', type: 'number', isPublic: true, def: 8, desc: 'Bilangan rekod aktiviti terkini' },
    TREND_MONTHS:       { group: 'Dashboard', type: 'number', isPublic: true, def: 6, desc: 'Bilangan bulan dalam graf trend' },
    DEFAULT_DATE_RANGE_DAYS: { group: 'Dashboard', type: 'number', isPublic: true, def: 90, desc: 'Julat tarikh lalai (hari)' },

    /* ---------- System ---------- */
    TIMEZONE:           { group: 'System', type: 'string', isPublic: true, def: 'Asia/Kuala_Lumpur', desc: 'Zon waktu' },
    DATE_FORMAT:        { group: 'System', type: 'string', isPublic: true, def: 'dd/MM/yyyy', desc: 'Format tarikh' },
    DATETIME_FORMAT:    { group: 'System', type: 'string', isPublic: true, def: 'dd/MM/yyyy HH:mm', desc: 'Format tarikh & masa' },
    LOCALE:             { group: 'System', type: 'string', isPublic: true, def: 'ms-MY', desc: 'Lokal antara muka' },
    MAINTENANCE_MODE:   { group: 'System', type: 'boolean', isPublic: true, def: false, desc: 'Mod penyelenggaraan' },
    MAINTENANCE_MESSAGE:{ group: 'System', type: 'string', isPublic: true, def: 'Sistem sedang diselenggara. Sila cuba sebentar lagi.', desc: 'Mesej mod penyelenggaraan' },
    AUDIT_RETENTION_DAYS: { group: 'System', type: 'number', isPublic: false, def: 730, desc: 'Tempoh simpan log audit (hari)' },

    /* ---------- Feature Flags ---------- */
    FEATURE_VERSIONING: { group: 'Feature', type: 'boolean', isPublic: true, def: true, desc: 'Aktifkan sejarah versi artikel' },
    FEATURE_CATEGORIES: { group: 'Feature', type: 'boolean', isPublic: true, def: true, desc: 'Aktifkan kategori berita' },
    FEATURE_ATTACHMENTS:{ group: 'Feature', type: 'boolean', isPublic: true, def: true, desc: 'Aktifkan muat naik lampiran' },
    FEATURE_REPORTS:    { group: 'Feature', type: 'boolean', isPublic: true, def: true, desc: 'Aktifkan modul laporan' },
    FEATURE_AUDIT_UI:   { group: 'Feature', type: 'boolean', isPublic: true, def: true, desc: 'Papar log audit dalam UI' },

    /* ---------- Social Media ----------
       Nota: PAGE ID, TOKEN dan IG USER ID adalah RAHSIA dan disimpan dalam
       Script Properties (CONFIG.SECRET_KEYS), bukan di sini. Tetapan di bawah
       hanya mengawal kelakuan, bukan kredential. */
    SOCIAL_ENABLED:          { group: 'Social', type: 'boolean', isPublic: true, def: false, desc: 'Aktifkan modul penerbitan media sosial' },
    SOCIAL_FB_ENABLED:       { group: 'Social', type: 'boolean', isPublic: true, def: false, desc: 'Benarkan penerbitan ke Facebook Page' },
    SOCIAL_IG_ENABLED:       { group: 'Social', type: 'boolean', isPublic: true, def: false, desc: 'Benarkan penerbitan ke Instagram Business' },
    SOCIAL_AUTO_ON_PUBLISH:  { group: 'Social', type: 'boolean', isPublic: true, def: false, desc: 'Hantar automatik sebaik berita diterbitkan' },
    SOCIAL_REQUIRE_EDITOR:   { group: 'Social', type: 'boolean', isPublic: true, def: true, desc: 'Hanya Editor boleh menerbitkan ke media sosial' },
    SOCIAL_CAPTION_TEMPLATE: { group: 'Social', type: 'string', isPublic: true, def: '{title}\n\n{summary}\n\n{hashtags}', desc: 'Templat kapsyen. Token: {title} {summary} {category} {url} {hashtags}' },
    SOCIAL_DEFAULT_HASHTAGS: { group: 'Social', type: 'string', isPublic: true, def: '#FKMUTM #UTM #FakultiKejuruteraanMekanikal', desc: 'Hashtag lalai' },
    SOCIAL_MAX_CAPTION:      { group: 'Social', type: 'number', isPublic: true, def: 2200, desc: 'Had aksara kapsyen (Instagram: 2200)' },
    SOCIAL_MAX_IMAGES_IG:    { group: 'Social', type: 'number', isPublic: true, def: 10, desc: 'Had imej carousel Instagram' },
    SOCIAL_IMAGE_PUBLIC_MODE:{ group: 'Social', type: 'string', isPublic: false, def: 'proxy', desc: 'proxy = hidangkan melalui web app; drive = pautan Drive awam', options: ['proxy', 'drive'] },
    SOCIAL_GRAPH_VERSION:    { group: 'Social', type: 'string', isPublic: false, def: 'v21.0', desc: 'Versi Facebook Graph API' },

    /* ---------- Effects ----------
       Kesan visual dikawal dari sini supaya boleh dimatikan sepenuhnya
       pada peranti lama atau apabila prestasi diutamakan. */
    GLASS_ENABLED:      { group: 'Effects', type: 'boolean', isPublic: true, def: true, desc: 'Permukaan kaca lut sinar pada sidebar dan bar atas' },
    GLASS_BLUR:         { group: 'Effects', type: 'string', isPublic: true, def: '18px', desc: 'Kekuatan kabur kaca' },
    GLASS_OPACITY:      { group: 'Effects', type: 'number', isPublic: true, def: 0.82, desc: 'Kelegapan permukaan kaca (0.6 hingga 1)' },
    MOTION_ENABLED:     { group: 'Effects', type: 'boolean', isPublic: true, def: true, desc: 'Animasi dan peralihan mikro' },
    KPI_COUNT_ANIMATION:{ group: 'Effects', type: 'boolean', isPublic: true, def: true, desc: 'Animasi kiraan nombor pada kad KPI' },
    ELEVATION:          { group: 'Effects', type: 'string', isPublic: true, def: 'soft', desc: 'Kedalaman bayang: flat, soft, lifted', options: ['flat', 'soft', 'lifted'] },
    COMMAND_PALETTE:    { group: 'Effects', type: 'boolean', isPublic: true, def: true, desc: 'Palet arahan pantas (Ctrl+K)' },

    /* ---------- Pautan Pantas ----------
       Senarai pautan luar yang dipapar di papan pemuka. Boleh diubah
       sepenuhnya oleh Admin tanpa menyentuh kod. */
    QUICK_LINKS:        { group: 'Links', type: 'json', isPublic: true, desc: 'Pautan pantas: [{label, url, icon}]',
      def: JSON.stringify([
        { label: 'Laman Web FKM', url: 'https://mech.utm.my', icon: 'globe' },
        { label: 'Sistem Akademik', url: 'https://academic.utm.my', icon: 'cap' },
        { label: 'e-Pembelajaran', url: 'https://elearning.utm.my', icon: 'laptop' },
        { label: 'Portal UTM', url: 'https://www.utm.my', icon: 'building' },
        { label: 'Perpustakaan', url: 'https://library.utm.my', icon: 'book' },
        { label: 'Helpdesk IT', url: 'https://utmdigital.utm.my', icon: 'headset' }
      ]) },
    PUBLIC_PORTAL_ENABLED: { group: 'Links', type: 'boolean', isPublic: true, def: false, desc: 'Benarkan portal awam tanpa log masuk (perlu deployment berasingan)' },
    PUBLIC_PORTAL_URL:  { group: 'Links', type: 'string', isPublic: true, def: '', desc: 'ISI DI SINI: URL deployment Portal Awam yang berakhir dengan /exec. Digunakan oleh butang kongsi.' },
    PUBLIC_SITE_URL:    { group: 'Links', type: 'string', isPublic: true, def: '', desc: 'BIARKAN KOSONG melainkan berita turut diterbitkan di laman WordPress fakulti. Bukan untuk URL Apps Script.' },
    STAFF_APP_URL:      { group: 'Links', type: 'string', isPublic: false, def: 'https://fkm-it.github.io/fkm-news/app/', desc: 'URL aplikasi staf (GitHub Pages). Digunakan dalam e-mel notifikasi dan e-mel alu-aluan. Untuk kembali ke URL lama, tampal URL /exec di sini.' },
    SHARE_ENABLED:      { group: 'Links', type: 'boolean', isPublic: true, def: true, desc: 'Papar butang kongsi pada halaman bacaan' },
    SHOW_QUICK_LINKS:   { group: 'Links', type: 'boolean', isPublic: true, def: true, desc: 'Papar panel pautan pantas' },
    SIDEBAR_COLLAPSIBLE:{ group: 'Layout', type: 'boolean', isPublic: true, def: true, desc: 'Benarkan sidebar dikuncupkan' },

    /* ---------- Labels UI ---------- */
    LABEL_NEWS_SINGULAR:{ group: 'Label', type: 'string', isPublic: true, def: 'Berita', desc: 'Label tunggal' },
    LABEL_NEWS_PLURAL:  { group: 'Label', type: 'string', isPublic: true, def: 'Berita', desc: 'Label jamak' },
    LABEL_PORTAL:       { group: 'Label', type: 'string', isPublic: true, def: 'Laman Berita', desc: 'Label menu portal pembaca' },
    PORTAL_HERO_COUNT:  { group: 'Label', type: 'number', isPublic: true, def: 3, desc: 'Bilangan berita dalam karusel utama' },
    PORTAL_PAGE_SIZE:   { group: 'Label', type: 'number', isPublic: true, def: 6, desc: 'Bilangan kad berita di laman utama portal' },
    LABEL_DASHBOARD:    { group: 'Label', type: 'string', isPublic: true, def: 'Papan Pemuka', desc: 'Label menu papan pemuka' },
    LABEL_REVIEW_QUEUE: { group: 'Label', type: 'string', isPublic: true, def: 'Giliran Semakan', desc: 'Label menu semakan' },
    EMPTY_STATE_TEXT:   { group: 'Label', type: 'string', isPublic: true, def: 'Tiada rekod untuk dipaparkan.', desc: 'Teks keadaan kosong' }
  };

  var _cache = null;

  /**
   * Mod render bagi permintaan semasa. Ditetapkan sekali oleh api() supaya
   * setiap DTO yang dijana dalam permintaan itu menggunakan set warna status
   * yang betul, tanpa perlu menghantar 'mode' melalui setiap fungsi.
   */
  var _renderMode = 'light';

  function setRenderMode(mode) {
    _renderMode = (mode === 'dark') ? 'dark' : 'light';
  }

  function getRenderMode() { return _renderMode; }

  function cacheService() { return CacheService.getScriptCache(); }

  function castValue(raw, type) {
    if (raw === null || raw === undefined || raw === '') raw = '';
    switch (type) {
      case 'number':  return Number(raw);
      case 'boolean': return Utils.toBool(raw);
      case 'csv':     return String(raw).split(',').map(function (s) { return s.trim(); })
                        .filter(function (s) { return s !== ''; });
      case 'json':
        try { return JSON.parse(String(raw)); } catch (e) { return {}; }
      default:        return String(raw);
    }
  }

  /** Baca semua setting (raw string) dari sheet, dengan cache */
  function loadRaw_() {
    if (_cache) return _cache;

    var cached = null;
    try { cached = cacheService().get(CONFIG.TECHNICAL.SETTINGS_CACHE_KEY); } catch (e) { }
    if (cached) {
      try { _cache = JSON.parse(cached); return _cache; } catch (e) { }
    }

    var map = {};
    try {
      SheetDB.findAll(CONFIG.SHEETS.SYSTEM_SETTINGS).forEach(function (r) {
        map[String(r.SettingKey)] = String(r.SettingValue);
      });
    } catch (e) {
      map = {}; // sistem belum setup — jatuh balik kepada default
    }

    _cache = map;
    try {
      cacheService().put(CONFIG.TECHNICAL.SETTINGS_CACHE_KEY,
        JSON.stringify(map), CONFIG.TECHNICAL.CACHE_TTL_SECONDS);
    } catch (e) { }
    return _cache;
  }

  function invalidateCache() {
    _cache = null;
    try { cacheService().remove(CONFIG.TECHNICAL.SETTINGS_CACHE_KEY); } catch (e) { }
  }

  /** Dapatkan satu setting (sudah ditaip) */
  function get(key) {
    var def = SCHEMA[key];
    if (!def) throw Utils.appError('SETTING', 'Setting tidak dikenali: ' + key);
    var raw = loadRaw_()[key];
    if (raw === undefined || raw === '') raw = def.def;
    return castValue(raw, def.type);
  }

  /** Semua setting (untuk kegunaan server) */
  function getAll() {
    var out = {};
    Object.keys(SCHEMA).forEach(function (k) { out[k] = get(k); });
    return out;
  }

  /** Alias mengikut spec dokumen */
  function getGlobalSettings() { return getAll(); }

  /**
   * Hanya setting selamat untuk client.
   * Secret, credential dan domain policy TIDAK dihantar.
   */
  function getPublicSettings() {
    var out = {};
    Object.keys(SCHEMA).forEach(function (k) {
      if (SCHEMA[k].isPublic) out[k] = get(k);
    });
    return out;
  }

  /** Metadata skema untuk halaman Tetapan (Admin sahaja) */
  function getSchemaMeta() {
    return Object.keys(SCHEMA).map(function (k) {
      var d = SCHEMA[k];
      return {
        key: k, group: d.group, type: d.type, isPublic: !!d.isPublic,
        description: d.desc || '', options: d.options || null,
        value: get(k), defaultValue: castValue(d.def, d.type)
      };
    });
  }

  /** Validasi nilai sebelum simpan */
  function validateGlobalSetting(key, value) {
    var def = SCHEMA[key];
    if (!def) return { valid: false, message: 'Setting tidak dikenali.' };
    var s = String(value === null || value === undefined ? '' : value);

    switch (def.type) {
      case 'number':
        if (s === '' || isNaN(Number(s))) return { valid: false, message: 'Nilai mesti nombor.' };
        break;
      case 'boolean':
        if (!/^(true|false|ya|tidak|1|0)$/i.test(s.trim()))
          return { valid: false, message: 'Nilai mesti true atau false.' };
        break;
      case 'color':
        if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(s.trim()))
          return { valid: false, message: 'Warna mesti format hex, contoh #12284C.' };
        break;
      case 'json':
        try { JSON.parse(s); } catch (e) { return { valid: false, message: 'JSON tidak sah.' }; }
        break;
      case 'csv':
        if (s.trim() === '') return { valid: false, message: 'Senarai tidak boleh kosong.' };
        break;
      default:
        if (s.length > 2000) return { valid: false, message: 'Nilai terlalu panjang.' };
    }

    if (def.options && def.options.indexOf(s.trim()) === -1)
      return { valid: false, message: 'Nilai mesti salah satu daripada: ' + def.options.join(', ') };

    return { valid: true };
  }

  /** Kemas kini satu setting (dipanggil melalui API Admin sahaja) */
  function updateGlobalSetting(key, value, actorUserId) {
    var check = validateGlobalSetting(key, value);
    if (!check.valid) throw Utils.appError('VALIDATION', check.message);

    var def = SCHEMA[key];
    return Utils.withLock(function () {
      var existing = SheetDB.findOneBy(CONFIG.SHEETS.SYSTEM_SETTINGS, 'SettingKey', key);
      var payload = {
        SettingKey: key,
        SettingValue: String(value),
        ValueType: def.type,
        SettingGroup: def.group,
        IsPublic: def.isPublic ? 'TRUE' : 'FALSE',
        Description: def.desc || '',
        UpdatedAt: Utils.now(),
        UpdatedBy: actorUserId || ''
      };
      if (existing) SheetDB.updateRow(CONFIG.SHEETS.SYSTEM_SETTINGS, existing._row, payload);
      else SheetDB.insert(CONFIG.SHEETS.SYSTEM_SETTINGS, payload);
      invalidateCache();
      return get(key);
    });
  }

  /** Tulis semua default ke sheet (dipanggil oleh setupSystem) */
  function seedDefaults(force) {
    var existing = {};
    SheetDB.findAll(CONFIG.SHEETS.SYSTEM_SETTINGS).forEach(function (r) {
      existing[String(r.SettingKey)] = r;
    });

    var toInsert = [];
    Object.keys(SCHEMA).forEach(function (k) {
      var d = SCHEMA[k];
      var row = {
        SettingKey: k,
        SettingValue: String(d.def),
        ValueType: d.type,
        SettingGroup: d.group,
        IsPublic: d.isPublic ? 'TRUE' : 'FALSE',
        Description: d.desc || '',
        UpdatedAt: Utils.now(),
        UpdatedBy: 'SYSTEM'
      };
      if (!existing[k]) toInsert.push(row);
      else if (force) SheetDB.updateRow(CONFIG.SHEETS.SYSTEM_SETTINGS, existing[k]._row, row);
    });

    if (toInsert.length) SheetDB.insertMany(CONFIG.SHEETS.SYSTEM_SETTINGS, toInsert);
    invalidateCache();
    return toInsert.length;
  }

  function statusLabel(status) {
    var labels = get('STATUS_LABELS');
    return labels[status] || status;
  }

  /**
   * Warna status. Set gelap digunakan apabila mod gelap aktif supaya
   * kontras kekal mencukupi di atas permukaan gelap.
   */
  function statusColor(status, mode) {
    if ((mode || _renderMode) === 'dark') {
      var darkColors = get('DARK_STATUS_COLORS');
      if (darkColors[status]) return darkColors[status];
      return get('DARK_MUTED_COLOR');
    }
    var colors = get('STATUS_COLORS');
    return colors[status] || get('MUTED_COLOR');
  }

  return {
    SCHEMA: SCHEMA,
    get: get,
    getAll: getAll,
    getGlobalSettings: getGlobalSettings,
    getPublicSettings: getPublicSettings,
    getSchemaMeta: getSchemaMeta,
    validateGlobalSetting: validateGlobalSetting,
    updateGlobalSetting: updateGlobalSetting,
    seedDefaults: seedDefaults,
    invalidateCache: invalidateCache,
    statusLabel: statusLabel,
    statusColor: statusColor,
    setRenderMode: setRenderMode,
    getRenderMode: getRenderMode
  };
})();

/* Alias global mengikut spec dokumen */
function getGlobalSettings() { requireOwnerOrTrigger_('getGlobalSettings', arguments[0]); return GlobalSettings.getGlobalSettings(); }
function getPublicSettings() { requireOwnerOrTrigger_('getPublicSettings', arguments[0]); return GlobalSettings.getPublicSettings(); }
function updateGlobalSetting(k, v) { requireOwnerOrTrigger_('updateGlobalSetting', arguments[0]); return GlobalSettings.updateGlobalSetting(k, v); }
function validateGlobalSetting(k, v) { requireOwnerOrTrigger_('validateGlobalSetting', arguments[0]); return GlobalSettings.validateGlobalSetting(k, v); }