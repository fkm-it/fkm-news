# Changelog — FKM News

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
