# Deployment — FKM News

Kod dalam `src/` ialah projek Apps Script **FKM NEWS** (pemilik: mohdzaki@mail.fkm.utm.my).
Setiap push ke `main` → `.github/workflows/deploy.yml`:

1. `npm test` (ujian Node, dua susunan muat) + `npm run check` (sintaks, `//` dalam `<script>`, imbasan rahsia)
2. `clasp push --force` ke `SCRIPT_ID`
3. `clasp update-deployment DEPLOYMENT_ID` — URL `/exec` kekal sama, versi baharu dicipta automatik

> **Jangan sunting kod dalam editor Apps Script lagi.** Push seterusnya akan menulis ganti. Semua perubahan melalui repo ini.

## 1. Persediaan sekali sahaja

### 1.1 Kelayakan clasp (akaun pemilik skrip)
```
npx @google/clasp@3 login
```
Log masuk dengan **mohdzaki@mail.fkm.utm.my**. Fail `C:\Users\<nama>\.clasprc.json` dicipta — **rahsia**, jangan commit / kongsi dalam chat.

> Akaun mesti pemilik skrip. Deployment "Execute as: Me" berjalan sebagai akaun yang menjalankan `update-deployment`.

### 1.2 GitHub
Repo `fkm-it/fkm-news` → **Settings → Secrets and variables → Actions**

| Jenis | Nama | Nilai |
|---|---|---|
| Secret | `CLASPRC_JSON` | kandungan penuh `.clasprc.json` |
| Variable | `SCRIPT_ID` | `1y545hp-MSu0PFU9u1S1UIXyusHPwdDFF7od3Pd-d1g1ikv7e5YOWjsc9` |
| Variable | `DEPLOYMENT_ID` | `AKfycbzvVCfZa-KQiu8aP7kDRf-1BfM-j7PKYijT9ucGv3euvTctjPoUZUfJ3-IPkylVZX__Dw` |

## 1.3 Portal Statik Pantas (F5) — sekali sahaja

1. **Token GitHub:** github.com/settings/personal-access-tokens/new
   - Token name: `FKM News portal statik` · Expiration: 1 tahun (letak peringatan kalendar)
   - Resource owner: **fkm-it** · Repository access: **Only select repositories → fkm-news**
   - Permissions → Repository permissions → **Contents: Read and write** → **Generate token**, salin
   - Jika organisasi memerlukan kelulusan: fkm-it → Settings → Personal access tokens → Pending requests → Approve
2. **Simpan token dalam Apps Script** (bukan dalam repo / chat): editor FKM NEWS → ⚙ Project Settings → Script Properties → **Add script property**
   - Property: `FKMNEWS_GITHUB_TOKEN` · Value: token tadi → **Save script properties**
3. **Jana kali pertama:** editor → pilih fungsi `staticSiteRebuild` → **Run**. Log: `{"ok":true,"changed":true,...}`. GitHub Actions "Site data" berjalan (~1 minit).
4. **Pautan kongsi ke halaman pratonton:** app staf → Tetapan → Links → `PUBLIC_SITE_URL` = `https://fkm-it.github.io/fkm-news/b` (tukar kepada URL WordPress apabila F6 siap).

> Nota pembangun: StaticSite.gs membuat commit ke `main` (folder `data/`). Jalankan `git pull --rebase` sebelum push.

## 1.4 Pembantu AI (F8) — pilihan

1. platform.claude.com → log masuk / daftar → **Billing**: tambah kredit (cth. USD 5–10). Bil ini berasingan daripada langganan Claude.ai.
2. **API Keys → Create Key** (nama: `FKM News`) → salin (`sk-ant-…`).
3. Editor FKM NEWS → ⚙ Project Settings → Script Properties → Add: `FKMNEWS_ANTHROPIC_KEY` = kunci → Save.
4. App staf → Tetapan → **Feature**: `AI_ENABLED` = hidup; `AI_MODEL` = `claude-sonnet-5-5` (kualiti) atau `claude-haiku-5-5` (jimat); `AI_MONTHLY_BUDGET_USD` = had sebulan.
5. Semak: borang Tulis berita menunjukkan butang **✨ Pembantu Penulis AI**.

## 1.5 Buletin bulanan (F10) — pilihan

1. Buka `/app/` sebagai Admin → **Tetapan** → kumpulan **Notification**.
2. `BULLETIN_RECIPIENTS`: alamat e-mel penerima, dipisahkan koma (contoh senarai mel staf FKM). Penerima dihantar sebagai BCC.
3. Uji dahulu: **Papan Pemuka** → kad **Buletin bulanan** → pilih bulan → **Pratonton** / **Muat turun PDF** / **Hantar sekarang**.
4. Bila berpuas hati, hidupkan `BULLETIN_ENABLED`. Buletin bulan lepas dihantar secara automatik pada minggu pertama setiap bulan (sekali sahaja), oleh `dailyMaintenance`.

Kuota e-mel Apps Script (akaun Workspace): 1,500 penerima sehari. Setiap alamat BCC dikira satu.

## 2. Rollback
Apps Script → **Deploy → Manage deployments → ✏️ → Version** → pilih versi sebelumnya → Deploy.
Atau `git revert` commit bermasalah dan push.

## 3. Penyelesaian masalah
| Gejala | Tindakan |
|---|---|
| Actions: `CLASPRC_JSON belum ditetapkan` | Tambah secret (1.2) |
| Actions: `invalid_grant` / `401` | Token clasp tamat. `clasp login` semula, kemas kini secret |
| Actions: `User has not enabled the Apps Script API` | https://script.google.com/home/usersettings → Google Apps Script API: **On** (akaun pemilik) |
| Ujian gagal | Betulkan kod; deploy tidak berjalan selagi CI merah |
