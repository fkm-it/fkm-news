# Status naik taraf FKM News (kaedah D'Ruang)

**Dikemas kini:** 9 Okt 2026 · Versi live: **v1.4.0**
**Repo:** github.com/fkm-it/fkm-news (awam) · CI/CD: setiap push ke `main` → ujian → `clasp push` → kemas kini deployment → GitHub Pages

## URL
| Apa | URL |
|---|---|
| Portal awam (PWA, untuk pembaca) | https://fkm-it.github.io/fkm-news/ |
| Aplikasi staf (PWA, semua peranan, log masuk OTP e-mel) | https://fkm-it.github.io/fkm-news/app/ |
| Apps Script /exec (sandaran, log masuk Google) | script.google.com/macros/s/AKfycbzvVCfZa-…__Dw/exec |

## Fasa
| Fasa | Status | Ringkasan |
|---|---|---|
| F0 Audit | ✅ | `AUDIT_F0_FKM_NEWS.md`: sistem sedia ada matang; 2 lubang keselamatan serius ditemui |
| F1 Keselamatan (v1.1.0) | ✅ live | Guard 36 fungsi operasi, pembersih HTML berasaskan token, semakan IDOR, magic bytes |
| F2 Repo + CI/CD | ✅ live | Secret `CLASPRC_JSON` (mohdzaki@mail.fkm.utm.my), Variables `SCRIPT_ID`, `DEPLOYMENT_ID` |
| F3 Portal Pages + PWA (v1.2.0) | ✅ live | `Public.html` tidak diubah; `doPost` senarai putih; E2E 360px |
| F4 App staf Pages + OTP (v1.3.0) | ✅ deploy, menunggu semakan Za | `WebAuth.gs`, `apiAs_`, `UserPrefs.gs`, skrin log masuk |
| F4.1 Penyerahan app staf (v1.3.1) | ✅ deploy | E-mel alu-aluan semasa Admin daftar pengguna, `STAFF_APP_URL` untuk pautan e-mel, `noindex` pada /app/ |
| F5 Portal Statik Pantas (v1.4.0) | ✅ live (token ditetapkan, rebuild pertama 9 Okt 15:18: 8 berita) | `StaticSite.gs` tolak `data/` bila terbit; `/b/<slug>/` OG + sitemap; bridge statik dahulu |
| F6 WordPress REST push | ⏳ | CPT `fkm_news` di mech.utm.my/fkmnews |
| F7 Peringatan tertunggak | ⏳ | Berita tersangkut dalam semakan > N hari → peringatan |
| F8 AI staf (Claude API) | ⏳ | Pembantu Penulis, semakan awal Admin, terjemahan BI, alt-text, kapsyen sosial; skill `gaya-berita-fkm` sebagai prompt |
| F9 Pembaca: dengar & ringkasan | ⏳ | Butang Dengar (TTS pelayar), ringkasan 30 saat, kod QR |
| F10 Kongsi & buletin | ⏳ | Kad kongsi 1080×1080, buletin bulanan PDF/e-mel, arkib garis masa |

## Keputusan Za
- Kod dan interface sedia ada dikekalkan (tidak dipindah ke enjin modul JSON templat)
- Gambar: Google Drive dahulu
- Notifikasi pelanggan awam: tiada buat masa ini
- Aliran semakan: ikut dokumen keperluan (Admin semak format → Editor putuskan)
- Log masuk app staf di Pages: OTP ke e-mel UTM
- Satu pautan `/app/` untuk semua peranan (Penulis, Admin, Editor); paparan ikut peranan. Admin mendaftarkan Penulis, Editor dan Admin lain melalui Pengguna → Tambah
- Penulis berdaftar sahaja (auto-daftar tutup); tiada komen pembaca pada fasa pertama

- Prestasi: Portal Statik Pantas (GitHub Pages) dipilih; Supabase ditangguhkan (projek percuma dijeda selepas 7 hari tidak aktif)
- Idea dipilih: AI staf, dengar & ringkasan, kongsi & buletin, peringatan tertunggak
- Skill dicadangkan: `naik-taraf-sistem-gas-pwa` (baharu), `bina-sistem-gas-pwa` (kemas kini), `gaya-berita-fkm` (baharu)

## Perkara tertunggak / perlu disemak
- F5: tetapkan `PUBLIC_SITE_URL` = https://fkm-it.github.io/fkm-news/b dan `PUBLIC_PORTAL_URL` = https://fkm-it.github.io/fkm-news/ (pautan kongsi masih /exec)
- Token GitHub portal statik tamat tempoh mengikut tarikh yang dipilih Za — perbaharui dan kemas kini Script Property `FKMNEWS_GITHUB_TOKEN`
- Semakan live oleh Za: log masuk OTP di `/app/`, muat naik gambar, gambar draf dipaparkan, e-mel alu-aluan
- Tetapkan `PUBLIC_PORTAL_URL` = https://fkm-it.github.io/fkm-news/ (pautan kongsi ke portal baharu)
- Gambar draf (Drive "domain with link") mungkin tidak dipaparkan di github.io untuk pelayar tanpa log masuk akaun UTM; jika berlaku, hidangkan melalui backend
- Projek Apps Script `1O6hRQ8ob…` (tercipta di PC Za) bukan FKM NEWS; semak dan padam jika tidak diperlukan
- Jangan sunting kod dalam editor Apps Script; semua perubahan melalui repo
- Jangan padam Script Property `FKMNEWS_AUTH_PEPPER` (semua sesi web akan tamat)
