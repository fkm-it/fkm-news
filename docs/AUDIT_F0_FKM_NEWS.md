# Audit F0: FKM News (kod sedia ada)

**Tarikh:** 9 Okt 2026 · **Sumber:** projek Apps Script "FKM NEWS" (`1y545hp-…jsc9`, milik mohdzaki@mail.fkm.utm.my), 53 fail, kira-kira 16,400 baris · **Kaedah:** semakan statik kod dan ujian sanitizer dalam Node. Tiada serangan dibuat ke atas sistem live.

## 1. Gambaran sistem

| Perkara | Dapatan |
|---|---|
| Seni bina | Apps Script V8, `executeAs: USER_DEPLOYING`, `access: ANYONE_ANONYMOUS`. Satu penghala `api(action,payload)` dengan aliran authenticate → rate limit → route → safe response. Portal awam diasingkan melalui `publicApi()` dan `publicSidebar()` |
| Auth | Identiti Google (`Session.getActiveUser`) dipetakan ke sheet USERS. Tiada kata laluan. Pilihan `AUTO_REGISTER_AUTHOR` dan `REQUIRE_DOMAIN`. Mod ujian membenarkan Admin bertukar peranan |
| Peranan | AUTHOR, ADMIN, EDITOR, dengan matriks `PERMISSIONS` dalam Constants.gs |
| Status | DRAFT → SUBMITTED → ADMIN_REVIEW → (REVISION_REQUIRED → RESUBMITTED) → EDITOR_REVIEW → APPROVED → PUBLISHED → ARCHIVED; REJECTED. `TRANSITIONS` disemak di server dalam `WorkflowService.transitionNews` dengan LockService |
| Data (Sheets) | USERS, NEWS (33 lajur termasuk EN dan SEO), NEWS_VERSIONS, REVIEWS, NOTIFICATIONS, CATEGORIES, AUDIT_LOG, SYSTEM_SETTINGS, NEWS_IMAGES, SOCIAL_POSTS, GREETING_CARDS |
| Global Settings | 131 tetapan dalam 17 kumpulan (Branding, Theme, Dark, Typography, Layout, Workflow, Article, Upload, Notification, Security, Dashboard, System, Social, Links, Label, Effects, Feature). Disimpan dalam SYSTEM_SETTINGS dengan cache |
| Skrin dalaman | dashboard, news-list, news-form, news-detail, review, notifications, users, social, settings, media, portal, portal-article (+ Index, login, css, js-core) |
| Portal awam | `Public.html`: dwibahasa BM/EN, kad ucapan, trend, pautan pantas, kiraan tontonan |
| Integrasi | Drive (gambar dan lampiran, perkongsian awam semasa terbit), MailApp, Facebook/Instagram Graph API (token dalam Script Properties) |
| Operasi | `setupSystem`, `installTriggers` (dailyMaintenance 2 pagi), `weeklyBackup`, seed/demo, migrasi dwibahasa, `ConfigRecovery`, `runSecurityTests` |

## 2. Pengesahan andaian panduan (B1–B5)

| Andaian | Keputusan |
|---|---|
| B1 Peranan dan status | ✗ Sistem sebenar ada 3 peranan dan 10 status, dengan 2 peringkat semakan. Ini sudah dilaksanakan dan sepadan dengan dokumen keperluan |
| B1 Kategori | Dalam data live (perlu disemak di Sheets). Seed asal mencipta 6 kategori |
| B2 Modul JSON templat | ✗ Tidak sesuai sekarang. Menukar ke enjin CrudEngine akan mengganti seluruh UI, sedangkan Za mahu interface sedia ada dikekalkan |
| B3 Hooks | Kebanyakannya sudah wujud dalam servis sedia ada (slug, versi, review, notifikasi, audit) |
| B4 Paparan awam | Sudah wujud dalam `Public.html`. Integrasi REST ke WordPress **belum dilaksanakan**; hanya medan SEO disediakan |
| B5 Gambar | **Keputusan Za:** Google Drive dahulu |
| B5 Pelanggan | **Keputusan Za:** tiada buat masa ini; paparkan yang sedia ada dahulu |
| B5 Penulis | Penulis berdaftar sahaja, akaun dicipta admin, `AUTO_REGISTER_AUTHOR` dimatikan |
| B5 Komen | Tiada pada fasa pertama |
| Aliran semakan | **Keputusan Za:** ikut dokumen keperluan (Admin semak format, Editor putuskan). Kod sudah sepadan |

## 3. Dapatan keselamatan

| # | Tahap | Dapatan | Bukti |
|---|---|---|---|
| S1 | **KRITIKAL** | 44 fungsi global boleh dipanggil oleh **sesiapa** melalui `google.script.run` (termasuk pelawat portal awam) kerana web app ialah `ANYONE_ANONYMOUS` + Execute as Me. Contohnya `setupSystem('emel')` mencipta **ADMIN baharu**; `updateGlobalSetting(k,v)` mengubah sebarang tetapan (termasuk `REQUIRE_DOMAIN`, `AUTO_REGISTER_AUTHOR`); `resetSettingsToDefaults`, `removeDemoData`, `seedDemoData`, `migrateBilingualApply`, `repairFeaturedImagesApply`, `createBackup`, `setAppUrl`, `generateConfig` (bocorkan struktur) | Semakan: tiada semakan identiti dalam badan fungsi |
| S2 | **TINGGI** | Stored XSS. `sanitizeHtml` berasaskan regex boleh dipintas, dan kandungan dipaparkan melalui `innerHTML` dalam news-detail, portal-article dan Public. Penulis boleh menyuntik skrip yang berjalan dalam sesi Admin atau Editor, lalu memanggil `api()` dengan peranan mereka | `<img/src=x/onerror=alert(1)>`, `<a href=javascript:…>` dan `jav&#x61;script:` lepas tanpa diubah (diuji dalam Node) |
| S3 | SEDERHANA | IDOR. `news.versions`, `image.list`, `attachment.list` dan `social.history` hanya memanggil `getRaw` tanpa `requireViewNews`. Penulis boleh membaca versi, gambar dan lampiran berita orang lain (draf atau ditolak) | Code.gs baris 208, 225, 255, 283 |
| S4 | SEDERHANA | Muat naik hanya menyemak sambungan fail dan saiz, bukan *magic bytes* | Validation.validateUpload |
| S5 | RENDAH | Kad pos `setXFrameOptionsMode(ALLOWALL)` membenarkan mana-mana laman membingkai aplikasi dalaman. Ia diperlukan untuk portal di WordPress, tetapi tidak perlu untuk aplikasi dalaman | Code.gs doGet |
| S6 | RENDAH | Had kadar awam ialah satu kaunter dikongsi oleh semua pelawat (600/min). Ini sudah didokumenkan dalam kod | PublicService.rateLimit_ |

Perkara yang sudah baik: semakan peralihan di server dengan kunci, guard formula injection, safe error, rahsia dalam Script Properties, pengasingan `publicApi`, audit log, dan Penulis tidak boleh menerbitkan (`TRANSITIONS` + `PERMISSIONS`).

## 4. Jurang berbanding kaedah D'Ruang

| Kaedah D'Ruang | FKM News | Catatan |
|---|---|---|
| Repo + CI/CD + clasp | Tiada (edit terus dalam editor) | Perlu repo `fkm-it/fkm-news` |
| Ujian automatik dalam CI | `runSecurityTests()` manual dalam editor | Bawa ke Node supaya berjalan dalam CI |
| GitHub Pages + PWA | Tiada | Aplikasi dalaman bergantung pada identiti Google, jadi **tidak boleh** dipindahkan ke Pages tanpa menukar sistem log masuk (mengubah interface). Portal awam boleh dipindahkan (`publicApi` tanpa identiti) |
| Supabase | Tiada | Belum perlu; jumlah data kecil |
| Push VAPID | Tiada | Ditangguh (keputusan B5) |
| WordPress REST push | Belum dibina | Keputusan Za sebelum ini |

## 5. Pelan fasa (interface sedia ada dikekalkan)

| Fasa | Kerja | Ujian / pengesahan |
|---|---|---|
| **F1 Tampalan keselamatan** | S1 kunci fungsi operasi (`requireOwner_`, pengendali trigger disahkan melalui `triggerUid`); S2 sanitizer berasaskan token + sanitasi semula semasa paparan; S3 `requireViewNews`; S4 magic bytes, tolak SVG | Ujian Node: muatan XSS, IDOR, fungsi terkunci. Live: `google.script.run.setupSystem` daripada portal mesti ditolak |
| **F2 Repo + CI/CD** | `fkm-it/fkm-news`, `src/` = kod sedia ada, `npm test`, `check` (`//` dalam `<script>`), `scan-secrets`, `clasp push` + `update-deployment` ke deployment sedia ada (URL kekal) | Actions hijau, URL live tidak berubah |
| **F3 Ujian aliran kerja** | Port `runSecurityTests` + ujian peralihan, RBAC, versi dan notifikasi ke Node; tangkapan skrin 360px | `npm test` dalam CI |
| **F4 WordPress REST push** | Editor PUBLISH → `wp-json/wp/v2/fkm_news` (CPT), kategori auto-cipta, gambar dari Drive; Application Password dalam Script Properties | Ujian dengan pelayan tiruan; satu berita ujian live |
| **F5 Portal awam PWA (pilihan)** | `Public.html` ke GitHub Pages melalui `doPost` + `publicApi` | Nilai semula selepas F4 (WordPress mungkin sudah memadai) |
| F6 Notifikasi lanjutan | Push/outbox, langganan | Ditangguh (B5) |
| F8 Serahan | VERSION, CHANGELOG, dokumen konteks | Setiap fasa |
