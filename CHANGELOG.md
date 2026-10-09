# Changelog — FKM News

## 1.4.0 — 2026-10-09 · F5 Portal Statik Pantas

Portal awam kini membaca berita daripada fail statik di GitHub Pages (CDN). Apps Script hanya dihubungi untuk carian, kiraan tontonan dan berita yang belum disalin. Paparan portal tidak berubah.

- `StaticSite.gs`: apabila berita **diterbitkan, diarkibkan atau dinyaharkib**, semua jawapan awam (BM & BI: bootstrap, laman utama, senarai ikut kategori/halaman, setiap artikel, panel sisi) dijana sekali dan ditolak ke `data/` dalam repo sebagai **satu commit** (Git Data API). Fail lapuk dipadam dan hanya `data/` disentuh. Perubahan tetapan, kategori dan kad ucapan ditanda tertunda dan ditolak oleh trigger 10 minit. Tanpa token, portal kekal berfungsi seperti dahulu.
- `PublicService.handle()` dikongsi oleh laluan awam dan penjanaan statik. Tindakan baharu `public.view` hanya menambah kiraan tontonan.
- `pwa/bridge.js`: baca `data/*.json` dahulu, jatuh balik kepada Apps Script jika tiada.
- `tools/build-web.js`: salin `data/`, jana **`/b/<slug>/`** setiap berita (meta Open Graph: tajuk, ringkasan, gambar, untuk pratonton WhatsApp/Facebook/LinkedIn; isi berita boleh dibaca enjin carian; pelayar dibawa ke portal) dan **`sitemap.xml`**.
- Aliran kerja `site-data.yml`: push `data/**` → terbit semula Pages sahaja (tanpa clasp). `deploy.yml` mengabaikan `data/**`.
- Fungsi pemilik: `staticSiteRebuild()` (jana sekarang + pasang trigger), trigger `staticSiteSync`.
- 13 ujian baharu (`tests/static.test.js`) dan E2E mod statik (laman utama dibaca dari `data/`, tiada panggilan Apps Script).

## 1.3.1 — 2026-10-09 · F4.1 Penyerahan aplikasi staf

- **E-mel alu-aluan** apabila Admin mendaftarkan pengguna (Pengguna → Tambah). E-mel menyatakan peranan dan menyertakan butang "Log masuk" ke aplikasi staf. Ia dihantar walaupun `EMAIL_ENABLED` dimatikan, dan kegagalan menghantar tidak membatalkan pendaftaran.
- Tetapan baharu **`STAFF_APP_URL`** (Links), lalai `https://fkm-it.github.io/fkm-news/app/`. Semua pautan "Buka berita" dalam e-mel notifikasi kini menuju ke aplikasi staf di GitHub Pages, bukan `/exec`.
- `/app/` bertanda `noindex, nofollow` supaya halaman log masuk tidak muncul dalam carian Google.
- 4 ujian baharu (`tests/f41.test.js`).

## 1.3.0 — 2026-10-09 · F4 Aplikasi staf di GitHub Pages (log masuk OTP e-mel)

Aplikasi staf kini juga boleh dibuka di **`https://fkm-it.github.io/fkm-news/app/`**. Log masuk menggunakan kod 6 digit ke e-mel yang berdaftar dalam sheet USERS, tanpa kata laluan. Semua skrin sedia ada kekal sama. URL `/exec` (log masuk Google) masih berfungsi sebagai sandaran.

- `WebAuth.gs`: minta kod (jawapan seragam, had 3/15 min setiap e-mel dan 40/15 min keseluruhan), sahkan kod (5 cubaan, sekali guna, tamat 10 min), token sesi 384-bit (hanya hash disimpan, berpepper), tamat bila tidak aktif (`SESSION_TIMEOUT_MINUTES`) atau mutlak 8 jam, log keluar. Status dan domain pengguna disemak pada setiap permintaan.
- `apiAs_()`: `api()` dipecah supaya laluan web dan laluan Google berkongsi penghala dan RBAC yang SAMA.
- `UserPrefs.gs`: tema, bahasa dan peranan ujian disimpan ikut UserID bagi pengguna web (tidak bocor antara pengguna).
- `WebBridge.gs`: `authRequest`, `authVerify`, `authLogout`, `apiWeb`; had badan 25 MB untuk muat naik gambar.
- `login.html`: skrin log masuk OTP (web) / akses ditolak (/exec). Ini juga membetulkan pepijat lama, iaitu `views['login']` tidak wujud sehingga skrin akses ditolak menjadi kosong.
- Menu profil: **Log keluar** (web sahaja).
- `pwa/app-bridge.js`, binaan `/app/`, manifest "FKM News Staf".
- Ujian: 16 ujian baharu (`tests/webauth.test.js`), E2E log masuk → papan pemuka → senarai → log keluar pada 360px dan desktop.

## 1.2.0 — 2026-10-09 · F3 Portal awam di GitHub Pages + PWA

Portal awam kini juga dihidangkan dari **GitHub Pages** (`https://fkm-it.github.io/fkm-news/`), tanpa banner Apps Script dan boleh dipasang sebagai app telefon. `Public.html` tidak diubah; antara muka sama. Aplikasi staf kekal di URL `/exec`.

- `WebBridge.gs`: `doPost` dengan senarai putih `publicApi` dan `publicSidebar` sahaja (semakan `hasOwnProperty`; `constructor`/`toString` ditolak).
- `pwa/bridge.js`: `google.script.run` tiruan yang menghantar `fetch` POST (text/plain, tanpa cookie) ke `/exec`.
- `tools/build-web.js`: himpun `Public.html` + `css` menjadi `index.html` statik; parameter `?id=` dan `?lang=` dibaca dari URL; CSP, manifest, ikon, service worker.
- `tools/dev-server.js` + `tools/e2e.py`: E2E pada 360px dan desktop (berita utama, kad, artikel, pautan kongsi BI, tiada skrol mendatar, PWA, 0 ralat konsol).
- CI: binaan web + E2E; Deploy: kerja GitHub Pages selepas Apps Script.

## 1.1.0 — 2026-10-09 · F1 Tampalan keselamatan

Tiada perubahan pada antara muka. Rujuk `docs/AUDIT_F0_FKM_NEWS.md`.

### Keselamatan
- **S1 (kritikal):** 36 fungsi operasi global (setup, seed, migrasi, sandaran, tetapan, diagnostik) kini dikunci dengan `requireOwnerOrTrigger_()` dalam `Guard.gs`. Sebelum ini, sesiapa sahaja boleh memanggilnya melalui `google.script.run`, termasuk pelawat portal awam. Contohnya `setupSystem('emel')` boleh mencipta ADMIN baharu. Trigger masa yang sah masih dibenarkan (disahkan melalui `triggerUid` + nama pengendali). `getSidebarData` → `getSidebarData_` (dalaman).
- **S2 (tinggi):** `Security.sanitizeHtml` ditulis semula sebagai pembersih berasaskan token. Tag dan atribut dibina semula daripada senarai dibenarkan, URL dinyahkod sebelum skema diperiksa, dan `target=_blank` diberi `rel="noopener noreferrer"`. Kandungan juga dibersihkan **semasa dibaca** (news.detail, versi, portal, awam), jadi berita lama turut selamat.
- **S3 (sederhana):** `news.versions`, `image.list`, `attachment.list` dan `social.history` kini menyemak `requireViewNews`.
- **S4 (sederhana):** Muat naik disemak menggunakan magic bytes (JPEG/PNG/GIF/WebP/PDF/Office). SVG/HTML ditolak, dan jenis MIME Drive diambil daripada kandungan fail.
- `weeklyBackup` memanggil `createBackup_` secara terus supaya sandaran trigger tidak tersekat oleh guard.

### Ujian
- `tests/gas-mock.js`: persekitaran Apps Script tiruan (Sheets, Drive, Properties, Cache, Lock, Session, Mail, ScriptApp) untuk ujian dalam Node, dengan dua susunan muat.
- `tests/security.test.js`: 29 ujian, termasuk 25 muatan XSS, IDOR, guard setiap fungsi global (statik + dinamik), trigger sah/palsu, magic bytes, dan `runSecurityTests()` sedia ada (72/72).
- `tools/check.js`: sintaks .gs, `//` baharu dalam `<script>` HTML, dan imbasan rahsia.

## 1.0.0 — sebelum 2026-10-09
Kod asal dari editor Apps Script (garis asas repo).
