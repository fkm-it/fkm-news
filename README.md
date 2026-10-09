# FKM News

Sistem Pengurusan & Penerbitan Berita, Fakulti Kejuruteraan Mekanikal, UTM.
Google Apps Script + Google Sheets + Google Drive.

- Aliran: Penulis → Admin (semakan format) → Editor (keputusan terbit) → Diterbitkan
- `src/` — kod Apps Script (deploy automatik, lihat [DEPLOYMENT.md](DEPLOYMENT.md))
- `tests/` — ujian Node dengan persekitaran Apps Script tiruan (`npm test`)
- `docs/AUDIT_F0_FKM_NEWS.md` — audit & pelan fasa
- [CHANGELOG.md](CHANGELOG.md)

```
npm test        # ujian (dua susunan muat)
npm run check   # sintaks, '//' dalam <script>, imbasan rahsia
```
