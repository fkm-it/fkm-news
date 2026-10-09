/**
 * PublicWidgets.gs
 * -----------------------------------------------------------------------
 * Titik masuk awam untuk data rail sisi halaman utama.
 *
 * Fungsi ini BACAAN SAHAJA. Ia memulangkan kiraan berita yang telah
 * diterbitkan, kad ucapan bermusim, dan pautan awam — tiada rekod
 * pengguna, tiada data workflow, tiada tetapan sulit. Selamat dipanggil
 * tanpa log masuk.
 *
 * Ia mengikut sampul respons yang sama seperti api() dan publicApi()
 * supaya klien mengendalikan ralat secara seragam.
 * -----------------------------------------------------------------------
 */

function publicSidebar(lang) {
  try {
    if (!PublicService.isEnabled()) {
      return { ok: false, error: { code: 'DISABLED', message: 'Portal awam tidak diaktifkan.' } };
    }
    return { ok: true, data: getSidebarData(lang) };
  } catch (err) {
    // Jangan bocorkan stack trace kepada pelawat awam.
    return { ok: false, error: { code: 'SIDEBAR', message: 'Tidak dapat memuatkan panel sisi.' } };
  }
}