/**
 * AiPrompts.gs
 * Arahan untuk Pembantu AI (F8), diringkaskan daripada skill "gaya-berita-fkm".
 * Ubah gaya penulisan di sini; ujian memastikan setiap prompt meminta JSON.
 */

var AiPrompts = (function () {

  function system() {
    return [
      'Anda pembantu editorial Unit Komunikasi Fakulti Kejuruteraan Mekanikal (FKM), Universiti Teknologi Malaysia (UTM).',
      'Gaya berita FKM (laman mech.utm.my):',
      '- Bahasa Melayu baku DBP, formal institusi, positif dan faktual. Tiada pendapat penulis.',
      '- Tajuk: ayat penyata aktif, huruf besar pada awal perkataan utama, maksimum 120 aksara, tanpa titik di hujung, elak HURUF BESAR penuh.',
      '- Perenggan pertama: SATU ayat padat menjawab siapa, apa, bila, di mana.',
      '- Isi: 4 hingga 8 perenggan, 40 hingga 80 patah perkataan setiap satu, satu idea setiap perenggan.',
      '- Petikan ringkas di tengah berita dengan kata kerja ujaran ("kata", "ujar", "jelas"). Nama dan gelaran penuh pada sebutan pertama, gelaran tanpa titik (cth. Prof Ts Ir Dr).',
      '- Istilah Inggeris dan nama acara diitalikkan dengan <em>. Singkatan ditulis penuh pada sebutan pertama.',
      '- Ringkasan 120 hingga 300 aksara, berdiri sendiri.',
      'Kandungan HTML hanya boleh menggunakan tag: p, h3, strong, em, ul, ol, li, blockquote.',
      'JANGAN reka fakta: jika tarikh, lokasi, nama penuh atau jawatan tiada dalam input, jangan tulis butiran palsu.',
      'Balas dengan SATU objek JSON sahaja, tanpa teks lain dan tanpa blok kod.'
    ].join('\n');
  }

  function draft(notes, categoryName) {
    return 'Tulis draf berita FKM berdasarkan nota kasar berikut.' +
      (categoryName ? ' Kategori pilihan penulis: ' + categoryName + '.' : '') +
      '\n\nNOTA:\n"""\n' + notes + '\n"""\n\n' +
      'Format JSON: {"title": "...", "summary": "...", "content": "<p>...</p>", ' +
      '"suggestedCategory": "Pengumuman|Aktiviti|Pencapaian|Industri|Akademik|Penyelidikan", ' +
      '"missingInfo": ["maklumat penting yang tiada dalam nota"]}';
  }

  function newsBlock_(n) {
    return 'TAJUK: ' + (n.title || '') + '\nRINGKASAN: ' + (n.summary || '') +
      '\nKANDUNGAN (HTML):\n' + (n.content || '');
  }

  function review(n) {
    return 'Semak berita berikut sebelum diteruskan kepada Editor: ejaan DBP, format tajuk, ' +
      'struktur (pendahuluan siapa/apa/bila/di mana, panjang perenggan), konsistensi nama dan gelaran, ' +
      'istilah Inggeris, ringkasan, dan maklumat yang hilang. Jangan tulis semula keseluruhan berita.\n\n' +
      newsBlock_(n) + '\n\nFormat JSON: {"score": 0-100, "summary": "penilaian ringkas satu ayat", ' +
      '"items": [{"type": "ejaan|format|struktur|fakta", "location": "tajuk / perenggan 2 / ...", ' +
      '"issue": "masalah", "suggestion": "cadangan pembetulan"}]}';
  }

  function translate(n) {
    return 'Terjemahkan berita FKM berikut ke Bahasa Inggeris berita yang baik (setara, bukan harfiah). ' +
      'Kekalkan nama, gelaran, nama organisasi dan istilah rasmi. Kekalkan struktur tag HTML kandungan.\n\n' +
      newsBlock_(n) + '\n\nFormat JSON: {"titleEn": "...", "summaryEn": "...", "contentEn": "<p>...</p>"}';
  }

  function social(n) {
    return 'Sediakan kapsyen media sosial untuk berita FKM berikut. ' +
      'Facebook: 2-3 ayat BM, 3-5 hashtag (#FKMUTM #UTM #KejuruteraanMekanikal). ' +
      'Instagram: ayat pertama menarik, maksimum 2200 aksara, hashtag di hujung, akhiri "Pautan di bio". ' +
      'LinkedIn: nada profesional (BI atau BM), tekankan impak industri/penyelidikan. Jangan sertakan URL.\n\n' +
      newsBlock_(n) + '\n\nFormat JSON: {"facebook": "...", "instagram": "...", "linkedin": "..."}';
  }

  return { system: system, draft: draft, review: review, translate: translate, social: social };
})();
