/**
 * RepairFeaturedImages.gs
 * -----------------------------------------------------------------------
 * Membina semula FeaturedImageURL yang terpadam.
 *
 * LATAR BELAKANG
 * NewsService.update() dahulunya menulis FeaturedImageURL tanpa syarat
 * daripada payload borang. Borang berita tidak menjejaki medan itu, jadi
 * setiap simpanan selepas muat naik gambar memadamkan lajur tersebut.
 * Pepijat itu sudah dibetulkan; skrip ini memulihkan data yang terjejas.
 *
 * Sumber kebenaran ialah sheet NEWS_IMAGES, yang tidak terjejas — bendera
 * IsFeatured dan FileID kekal betul sepanjang masa. URL hanya perlu dibina
 * semula daripadanya.
 *
 * CARA GUNA
 *   1. Run > repairFeaturedImages          (mod kering — laporan sahaja)
 *   2. Baca log
 *   3. Run > repairFeaturedImagesApply     (menulis perubahan)
 * -----------------------------------------------------------------------
 */

function repairFeaturedImages(dryRun) {
  requireOwnerOrTrigger_('repairFeaturedImages', arguments[0]);
  var dry = dryRun !== false;
  var lines = [dry ? 'MOD KERING — tiada perubahan ditulis'
                   : 'MOD SEBENAR — menulis perubahan', ''];

  var news = SheetDB.findAll(CONFIG.SHEETS.NEWS);
  var images = SheetDB.findAll(CONFIG.SHEETS.NEWS_IMAGES);

  // Kumpulkan gambar mengikut berita, sekali sahaja — mengelakkan carian
  // berulang merentas keseluruhan sheet bagi setiap berita.
  var byNews = {};
  images.forEach(function (img) {
    var key = String(img.NewsID);
    if (!byNews[key]) byNews[key] = [];
    byNews[key].push(img);
  });

  var repaired = 0, alreadyOk = 0, noImages = 0;

  news.forEach(function (n) {
    var newsId = String(n.NewsID);
    var currentUrl = String(n.FeaturedImageURL || '').trim();

    if (currentUrl) { alreadyOk++; return; }

    var gallery = byNews[newsId] || [];
    if (!gallery.length) { noImages++; return; }

    /*
     * Pilih gambar yang ditanda IsFeatured. Jika tiada yang ditanda —
     * boleh berlaku jika gambar utama pernah dipadam — gunakan gambar
     * pertama mengikut SortOrder, sama seperti yang dilakukan
     * ImageService.removeImage().
     */
    var chosen = gallery.filter(function (i) { return Utils.toBool(i.IsFeatured); })[0];

    if (!chosen) {
      gallery.sort(function (a, b) {
        return Number(a.SortOrder || 0) - Number(b.SortOrder || 0);
      });
      chosen = gallery[0];
    }

    var fileId = String(chosen.FileID || '').trim();
    if (!fileId) { noImages++; return; }

    var url = DriveService.thumbnailUrl(fileId);

    lines.push((dry ? 'AKAN BAIKI  ' : 'DIBAIKI  ') + newsId +
      '  ' + Utils.truncate(String(n.Title || ''), 46));
    lines.push('    ' + chosen.FileName + '  (' + chosen.ImageID + ')');

    if (!dry) {
      SheetDB.updateRow(CONFIG.SHEETS.NEWS, n._row, {
        FeaturedImageID: fileId,
        FeaturedImageURL: url,
        UpdatedAt: Utils.now()
      });
    }
    repaired++;
  });

  lines.push('');
  lines.push('Sudah betul       : ' + alreadyOk);
  lines.push((dry ? 'Akan dibaiki      : ' : 'Dibaiki           : ') + repaired);
  lines.push('Tiada gambar      : ' + noImages);

  if (dry && repaired) {
    lines.push('');
    lines.push('Jalankan repairFeaturedImagesApply untuk menulis perubahan.');
  }

  var report = lines.join('\n');
  Logger.log('\n=== BAIKI GAMBAR UTAMA ===\n' + report);
  return report;
}

function repairFeaturedImagesApply() {
  requireOwnerOrTrigger_('repairFeaturedImagesApply', arguments[0]);
  return repairFeaturedImages(false);
}