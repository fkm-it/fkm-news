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
