"""
e2e.py — ujian pelayar portal awam (GitHub Pages build) terhadap dev-server.

  node tools/build-web.js --api http://localhost:8080/__api --out .verify-web
  node tools/dev-server.js --port 8080 &
  python tools/e2e.py            # tangkapan skrin dalam e2e-shots/
"""
import os, sys
from playwright.sync_api import sync_playwright

BASE = os.environ.get('E2E_BASE', 'http://localhost:8080/')
SHOTS = os.environ.get('E2E_SHOTS', 'e2e-shots')
os.makedirs(SHOTS, exist_ok=True)
fails = []

GHA = bool(os.environ.get('GITHUB_ACTIONS'))
MODE = next((m for m in ('STATIC', 'AI', 'PUSH') if os.environ.get('E2E_' + m)), 'ASAS')

def check(cond, msg):
    print(('  ✓ ' if cond else '  ✗ ') + msg)
    if not cond:
        fails.append(msg)
        # Log Actions tidak boleh dibaca tanpa log masuk; anotasi boleh (API awam).
        if GHA: print(f'::error title=E2E {MODE}::{msg}')

if GHA:
    import traceback
    def _hook(t, v, tb):
        frames = [f for f in traceback.extract_tb(tb) if f.filename.endswith('e2e.py')] if tb else []
        last = frames[-1] if frames else None
        where = f' (e2e.py:{last.lineno} {last.line})' if last else ''
        print(f'::error title=E2E {MODE} ralat::{t.__name__}: {str(v).splitlines()[0][:300]}{where}')
        traceback.print_exception(t, v, tb)
    sys.excepthook = _hook

def ignorable(text):
    # Gambar demo dari internet disekat dalam CI/kontena; bukan pepijat portal.
    return 'ERR_' in text or 'Failed to load resource' in text or 'picsum' in text

FAKE_TTS = '''
(() => {
  window.__spoken = [];
  const synth = {
    speaking: false, paused: false, onvoiceschanged: null,
    getVoices: () => [{ lang: 'id-ID', name: 'Palsu Indonesia' }, { lang: 'en-GB', name: 'Palsu UK' }],
    speak(u) { window.__spoken.push({ text: u.text, lang: u.lang }); this.speaking = true; },
    cancel() { this.speaking = false; },
    pause() { this.paused = true; }, resume() { this.paused = false; }
  };
  Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
  window.SpeechSynthesisUtterance = function (text) { this.text = text; };
})();
'''

PUSH = bool(os.environ.get('E2E_PUSH'))
FAKE_FB = {
  'firebase-app.js': "export function initializeApp(c, n) { return { c: c, n: n }; }",
  'firebase-messaging.js': (
    "export function isSupported() { return Promise.resolve(true); }\n"
    "export function getMessaging(a) { return { a: a }; }\n"
    "export function getToken(m, o) { if (!o.vapidKey || !o.serviceWorkerRegistration || !m.a.c.apiKey) "
    "return Promise.reject(new Error('konfigurasi salah')); return Promise.resolve('e2e:' + 'B'.repeat(150)); }\n"
    "export function deleteToken() { return Promise.resolve(true); }")
}

def fake_firebase(ctx):
    def handle(route):
        name = route.request.url.rsplit('/', 1)[-1]
        route.fulfill(status=200, content_type='application/javascript', body=FAKE_FB.get(name, ''),
                      headers={'Access-Control-Allow-Origin': '*'})
    ctx.route('https://www.gstatic.com/firebasejs/**', handle)
    ctx.grant_permissions(['notifications'], origin=BASE.rstrip('/'))

def push_state(page):
    return page.evaluate("async () => (await (await fetch('/__push')).json())")

with sync_playwright() as p:
    exe = os.environ.get('E2E_CHROME') or '/opt/pw-browsers/chromium' if os.path.exists('/opt/pw-browsers/chromium') and os.path.isfile('/opt/pw-browsers/chromium') else None
    # channel='chromium' = Chromium penuh (mod headless baharu). chrome-headless-shell
    # lalai Playwright tidak memberi kebenaran notifikasi, jadi ujian push F11 gagal.
    browser = p.chromium.launch(executable_path=exe) if exe else p.chromium.launch(channel='chromium')
    for name, vp in (('telefon-360', {'width': 360, 'height': 780}), ('desktop', {'width': 1280, 'height': 860})):
        print(f'[{name}]')
        ctx = browser.new_context(viewport=vp, device_scale_factor=2 if name.startswith('telefon') else 1)
        # Chromium headless tiada enjin suara; ganti speechSynthesis dengan
        # palsu yang merekod teks supaya logik F9 boleh disahkan.
        ctx.add_init_script(FAKE_TTS)
        # Gambar demo: berita 1 = poster segi empat, lain-lain = landskap (smart fit v1.11.1)
        ctx.route('https://picsum.photos/**', lambda r: r.fulfill(status=200, content_type='image/svg+xml',
            body=('<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1000"><rect width="1000" height="1000" fill="#c93"/></svg>'
                  if 'fkm0' in r.request.url else
                  '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="750"><rect width="1200" height="750" fill="#4a7"/></svg>')))
        if PUSH: fake_firebase(ctx)
        page = ctx.new_page()
        errors = []
        page.on('console', lambda m: errors.append(m.text) if m.type == 'error' and not ignorable(m.text) else None)
        page.on('pageerror', lambda e: errors.append(str(e)))

        reqs = []
        page.on('request', lambda r: reqs.append((r.method, r.url, r.post_data or '')))
        page.goto(BASE, wait_until='domcontentloaded')
        page.wait_for_selector('.hero-headline', timeout=15000)
        if os.environ.get('E2E_STATIC'):
            check(any('/data/bm/home.json' in u for _, u, _ in reqs), 'portal statik: home dibaca dari data/*.json')
            check(not any(m == 'POST' and 'public.home' in d for m, _, d in reqs), 'portal statik: tiada panggilan Apps Script untuk home')
        check('Explorace' in page.inner_text('.hero-headline'), 'halaman utama: berita utama dipaparkan')
        check(page.locator('[data-open]').count() >= 3, 'halaman utama: kad berita dipaparkan')
        page.wait_for_timeout(600)
        nfit = page.locator('.news-card-media.fit-full').count()
        ncards = page.locator('.news-card-media > img').count()
        check(1 <= nfit < ncards, f'smart fit: poster dipaparkan penuh atas latar kabur, foto landskap kekal ({nfit}/{ncards})')
        sw = page.evaluate("() => scrollWidth = document.documentElement.scrollWidth - window.innerWidth")
        check(sw <= 1, f'tiada skrol mendatar (lebihan {sw}px)')
        page.wait_for_timeout(800)
        page.screenshot(path=f'{SHOTS}/{name}-1-utama.png', full_page=False)

        page.locator('[data-open]').first.click()
        page.wait_for_selector('.read-wrap', timeout=15000)
        check(page.locator('.read-body').count() == 1, 'artikel: kandungan dipaparkan')
        sw = page.evaluate("() => document.documentElement.scrollWidth - window.innerWidth")
        check(sw <= 1, f'artikel: tiada skrol mendatar (lebihan {sw}px)')
        page.screenshot(path=f'{SHOTS}/{name}-2-artikel.png', full_page=False)

        # ---------------------------------------------- F9: alat pembaca
        page.wait_for_selector('.read-tools', timeout=5000)
        check(page.locator('[data-rt="listen"]').count() == 0, 'F9: butang Dengar dimatikan')
        check(page.locator('[data-rt="qr"]').count() == 1, 'F9: butang Kod QR dipaparkan')
        if page.locator('[data-rt="summary"]').count():
            page.click('[data-rt="summary"]')
            n = page.locator('.kp-box li').count()
            check(2 <= n <= 5, f'F9: ringkasan 30 saat ({n} perkara)')
            words = page.evaluate("() => document.querySelector('.kp-box ul').innerText.split(/\\s+/).length")
            check(words <= 115, f'F9: ringkasan pendek ({words} perkataan)')
            check(page.locator('[data-kp-listen]').count() == 0, 'F9: Dengar ringkasan dimatikan')
            page.screenshot(path=f'{SHOTS}/{name}-2b-ringkasan.png', full_page=False)
            page.click('[data-rt="summary"]')
            check(page.locator('.kp-box').count() == 0, 'F9: ringkasan boleh ditutup')
        else:
            check(False, 'F9: butang ringkasan 30 saat dipaparkan')
        page.click('[data-rt="qr"]')
        page.wait_for_selector('#qrDialog[open]', timeout=3000)
        src = page.evaluate("() => (document.querySelector('#qrDialog img') || {}).src || 'gagal-dimuat'")
        check('qrserver' in src or src == 'gagal-dimuat', 'F9: dialog Kod QR dibuka')
        sw = page.evaluate("() => document.documentElement.scrollWidth - window.innerWidth")
        check(sw <= 1, f'F9: tiada skrol mendatar dengan dialog QR (lebihan {sw}px)')
        page.screenshot(path=f'{SHOTS}/{name}-2c-qr.png', full_page=False)
        page.keyboard.press('Escape')
        page.wait_for_timeout(200)
        check(page.locator('#qrDialog').count() == 0, 'F9: dialog QR ditutup dengan Esc')

        # ---------------------------------------- F10: kad kongsi & arkib
        page.click('[data-rt="card"]')
        page.wait_for_selector('#cardDialog[open] img.card-preview', timeout=15000)
        dims = page.evaluate("() => new Promise(r => { const i = document.querySelector('#cardDialog img'); const f = () => r([i.naturalWidth, i.naturalHeight]); i.complete ? f() : i.onload = f; })")
        check(dims == [1080, 1080], f'F10: kad kongsi 1080×1080 dijana ({dims[0]}×{dims[1]})')
        check(page.get_attribute('[data-card-dl]', 'download', timeout=2000).endswith('.png'), 'F10: butang muat turun PNG')
        sw = page.evaluate("() => document.documentElement.scrollWidth - window.innerWidth")
        check(sw <= 1, f'F10: tiada skrol mendatar dengan dialog kad (lebihan {sw}px)')
        page.screenshot(path=f'{SHOTS}/{name}-2d-kad.png', full_page=False)
        page.keyboard.press('Escape')
        page.wait_for_timeout(200)
        check(page.locator('#cardDialog').count() == 0, 'F10: dialog kad ditutup')
        check(page.locator('.pub-footer [data-archive]').count() == 1, 'F10: pautan Arkib berita di kaki portal')

        # ------------------------------------- F11: notifikasi pembaca
        if PUSH:
            page.wait_for_selector('#pubPush', timeout=10000)
            page.click('#pubPush')
            page.wait_for_selector('#pushDialog [data-push="on"]', timeout=5000)
            sw = page.evaluate("() => document.documentElement.scrollWidth - window.innerWidth")
            check(sw <= 1, f'F11: dialog notifikasi tiada skrol mendatar ({sw}px)')
            page.click('#pushDialog [data-push="on"]')
            page.wait_for_selector('#pushDialog .push-ok', timeout=10000)
            page.screenshot(path=f'{SHOTS}/{name}-2e-notifikasi.png', full_page=False)
            st = push_state(page)
            check(any(r[2] in (True, 'TRUE') and r[3] == 'bm' for r in st['rows']), 'F11: pembaca dilanggan (BM) di pelayan')
            page.keyboard.press('Escape')
            check(page.locator('#pubPush .push-dot').count() == 1, 'F11: tanda notifikasi aktif pada butang 🔔')
            page.click('#pubPush')
            page.click('#pushDialog [data-push="off"]')
            page.wait_for_selector('#pushDialog [data-push="on"]', timeout=10000)
            check(not any(r[2] in (True, 'TRUE') for r in push_state(page)['rows']), 'F11: pembaca boleh berhenti langgan')
            page.keyboard.press('Escape')

        page.goto(BASE + '?view=reader&id=NEWS-2026-00001&lang=en', wait_until='domcontentloaded')
        page.wait_for_selector('.read-wrap', timeout=15000)
        check('Merdeka Explorace' in page.inner_text('.read-wrap'), 'pautan kongsi ?id=&lang=en membuka artikel dalam BI')
        page.screenshot(path=f'{SHOTS}/{name}-3-kongsi-en.png', full_page=False)

        has_sw = page.evaluate("async () => !!(await navigator.serviceWorker.getRegistration())")
        check(has_sw, 'service worker didaftarkan (PWA)')
        man = page.evaluate("async () => (await (await fetch('manifest.webmanifest')).json()).display")
        check(man == 'standalone', 'manifest PWA sah')

        check(not errors, 'tiada ralat konsol' + ('' if not errors else ': ' + ' | '.join(errors[:3])))
        ctx.close()
        # ------------------------------------------------ aplikasi staf (F4)
        print(f'[{name}] aplikasi staf')
        ctx = browser.new_context(viewport=vp, device_scale_factor=2 if name.startswith('telefon') else 1)
        if PUSH: fake_firebase(ctx)
        page = ctx.new_page()
        errors = []
        page.on('console', lambda m: errors.append(m.text) if m.type == 'error' and not ignorable(m.text) else None)
        page.on('pageerror', lambda e: errors.append(str(e)))
        email = 'mohdzaki@mail.fkm.utm.my' if name == 'desktop' else 'author1@mail.fkm.utm.my'

        page.goto(BASE + 'app/', wait_until='domcontentloaded')
        page.wait_for_selector('#authEmail', timeout=15000)
        check(True, 'app: borang log masuk OTP dipaparkan')
        page.screenshot(path=f'{SHOTS}/{name}-4-app-login.png', full_page=False)
        page.fill('#authEmail', email)
        page.click('#authSend')
        page.wait_for_selector('#authCode', timeout=15000)
        code = page.evaluate("async (e) => (await (await fetch('/__lastcode?to=' + encodeURIComponent(e))).text())", email)
        check(len(code) == 6, 'app: kod OTP dihantar ke e-mel')
        page.fill('#authCode', '000000' if code != '000000' else '111111')
        page.click('#authVerify')
        page.wait_for_selector('.auth-msg.err', timeout=15000)
        check('tidak sah' in page.inner_text('.auth-msg.err'), 'app: kod salah ditolak dengan mesej')
        page.fill('#authCode', code)
        page.click('#authVerify')
        page.wait_for_selector('.kpis, .kpi', timeout=20000)
        check(page.locator('#nav .nav-item').count() >= 2, 'app: papan pemuka & navigasi dipaparkan selepas log masuk')
        sw = page.evaluate("() => document.documentElement.scrollWidth - window.innerWidth")
        check(sw <= 1, f'app: papan pemuka tiada skrol mendatar (lebihan {sw}px)')
        page.wait_for_timeout(600)
        page.screenshot(path=f'{SHOTS}/{name}-5-app-dashboard.png', full_page=False)

        # ------------------------------------------- F11: notifikasi staf
        if PUSH and name == 'desktop':
            page.wait_for_selector('.push-hint', timeout=10000)
            check(True, 'F11: kad cadangan notifikasi pada Papan Pemuka')
            page.click('.push-hint [data-ph="on"]')
            page.wait_for_selector('.toast.success', timeout=10000)
            check(any(r[1] for r in push_state(page)['rows']), 'F11: peranti staf didaftarkan kepada pengguna')
            page.click('#profileBtn')
            page.click('[data-push-menu]')
            page.wait_for_selector('#pushModalBody [data-pm="test"]', timeout=5000)
            page.screenshot(path=f'{SHOTS}/{name}-5c-notifikasi-staf.png', full_page=False)
            n0 = len(push_state(page)['sends'])
            page.click('#pushModalBody [data-pm="test"]')
            page.wait_for_function("() => [...document.querySelectorAll('.toast')].some(t => /Ujian dihantar ke 1/.test(t.textContent))", timeout=10000)
            st = push_state(page)
            check(len(st['sends']) == n0 + 1 and 'Ujian' in st['sends'][-1]['data']['title'], 'F11: push ujian dihantar melalui FCM')
            page.click('#modalFoot .btn-ghost')

        # ------------------------------------------- F10: buletin bulanan
        if name == 'desktop':
            page.wait_for_selector('#bulletinCard', timeout=15000)
            page.select_option('#bulMonth', index=0)
            page.click('[data-bul="preview"]')
            page.wait_for_selector('#bulPreview', timeout=15000)
            txt = page.inner_text('#bulPreview')
            check('buletin bulanan' in txt.lower() and 'Explorace' in txt, 'F10: pratonton buletin bulan ini (Admin)')
            page.screenshot(path=f'{SHOTS}/{name}-5b-buletin.png', full_page=False)
            page.click('#modalFoot .btn-ghost')
            check(page.locator('[data-bul="send"]').count() == 1, 'F10: Admin nampak butang Hantar')

            # ------------------------------ Sunting berita TERBIT (v1.10.0)
            page.goto(BASE + 'app/?page=news-detail&id=NEWS-2026-00001', wait_until='domcontentloaded')
            page.wait_for_selector('#editBtn', timeout=20000)
            check(True, 'Sunting: butang Sunting pada berita terbit (Admin)')
            page.click('#editBtn')
            page.wait_for_selector('#fTitle', timeout=20000)
            check(page.locator('#saveSubmitBtn').count() == 0 and 'Simpan perubahan' in page.inner_text('#saveBtn'),
                  'Sunting: borang berita terbit — "Simpan perubahan" sahaja')
            # ------------------- Gambar diseragamkan 16:9 (v1.11.0)
            res = page.evaluate('''async () => {
              const c = document.createElement('canvas'); c.width = 600; c.height = 1000;
              const x = c.getContext('2d'); x.fillStyle = '#c00'; x.fillRect(0, 0, 600, 1000);
              x.fillStyle = '#00f'; x.fillRect(0, 0, 600, 40);
              const blob = await new Promise(r => c.toBlob(r, 'image/png'));
              const f = new File([blob], 'potret.png', { type: 'image/png' });
              const o = await App.prepareNewsImage(f);
              const img = new Image(); img.src = 'data:image/jpeg;base64,' + o.data; await img.decode();
              const k = document.createElement('canvas'); k.width = img.width; k.height = img.height;
              const g = k.getContext('2d'); g.drawImage(img, 0, 0);
              const px = (a, b) => Array.from(g.getImageData(a, b, 1, 1).data.slice(0, 3));
              return { w: img.width, h: img.height, name: o.name, mime: o.mimeType, mode: o.normalized,
                       top: px(300, 8), mid: px(300, 500) };
            }''')
            check(res['w'] == 600 and res['h'] == 1000 and res['mime'] == 'image/jpeg' and res['name'] == 'potret.jpg',
                  f"Gambar: bentuk asal dikekalkan ({res['w']}×{res['h']} JPEG)")
            check(res['mode'] == 'original' and res['top'][2] > 150,
                  f"Gambar: bahagian atas tidak dipotong {res['top']}")
            page.set_input_files('#fileInput', files=[{'name': 'potret2.png', 'mimeType': 'image/png',
                'buffer': bytes.fromhex('89504E470D0A1A0A0000000D49484452000000010000000208060000009977E3DE0000000D49444154789C63F8CFC0F01F00050001FF5C3E6E8B0000000049454E44AE426082')}])
            page.wait_for_selector('.thumb img[alt^="potret2"]', timeout=20000)
            check(True, 'Gambar: muat naik melalui borang berjaya (fail .jpg diseragamkan)')
            page.fill('#fTitle', 'Explorace Merdeka Seribu 2026 Meriahkan Sambutan Bulan Kebangsaan di UTM Johor Bahru')
            page.click('#saveBtn')
            page.wait_for_selector('#editBtn', timeout=20000)
            check('Johor Bahru' in page.inner_text('#view'), 'Sunting: perubahan disimpan, kekal diterbitkan')
            page.screenshot(path=f'{SHOTS}/{name}-5c-sunting-terbit.png', full_page=False)
        else:
            page.wait_for_timeout(800)
            check(page.locator('#bulletinCard').count() == 0, 'F10: Penulis tidak nampak kad buletin')

        page.goto(BASE + 'app/?page=news-list', wait_until='domcontentloaded')
        page.wait_for_selector('#view table, #view .empty, #view .card', timeout=20000)
        page.wait_for_timeout(600)
        sw = page.evaluate("() => document.documentElement.scrollWidth - window.innerWidth")
        check(sw <= 1, f'app: senarai berita (sesi kekal selepas muat semula) tiada skrol mendatar ({sw}px)')
        page.screenshot(path=f'{SHOTS}/{name}-6-app-senarai.png', full_page=False)

        if os.environ.get('E2E_AI'):
            if name == 'desktop':
                # Admin: semakan AI pada butiran berita
                page.goto(BASE + 'app/?page=news-detail&id=NEWS-2026-00001', wait_until='domcontentloaded')
                page.wait_for_selector('#aiReviewBtn', timeout=20000)
                page.click('#aiReviewBtn')
                page.wait_for_selector('.ai-score', timeout=15000)
                check(page.inner_text('.ai-score').strip() == '78', 'AI: semakan awal memaparkan skor & cadangan')
                page.screenshot(path=f'{SHOTS}/{name}-7-ai-semakan.png', full_page=False)
                page.click('#modalFoot .btn-ghost')
            else:
                # Penulis: draf AI dalam borang berita
                page.goto(BASE + 'app/?page=news-form', wait_until='domcontentloaded')
                page.wait_for_selector('#aiDraftBtn', timeout=20000)
                page.click('#aiDraftBtn')
                page.fill('#aiNotes', 'Bengkel CAD 3D, 5 Okt 2026, Makmal E01 FKM, 40 pelajar tahun 2, anjuran Jabatan Reka Bentuk.')
                page.click('#modalFoot .btn:not(.btn-ghost)')
                page.wait_for_selector('#aiOut h3', timeout=15000)
                page.screenshot(path=f'{SHOTS}/{name}-7-ai-draf.png', full_page=False)
                page.click('#modalFoot .btn:not(.btn-ghost)')
                page.wait_for_timeout(400)
                check(page.input_value('#fTitle').startswith('Bengkel CAD 3D'), 'AI: draf dimasukkan ke borang (tajuk)')
                check('40 pelajar' in page.inner_text('#fContent'), 'AI: draf dimasukkan ke borang (kandungan)')
                sw = page.evaluate("() => document.documentElement.scrollWidth - window.innerWidth")
                check(sw <= 1, f'AI: borang tiada skrol mendatar ({sw}px)')
            page.goto(BASE + 'app/', wait_until='domcontentloaded')
            page.wait_for_selector('#profileBtn', timeout=20000)

        page.click('#profileBtn')
        page.click('[data-logout]')
        page.wait_for_selector('#authEmail', timeout=15000)
        check(page.evaluate("() => !localStorage.getItem('FKMNEWS_TOKEN')"), 'app: log keluar memadam sesi')
        if PUSH and name == 'desktop':
            check(not any(r[1] for r in push_state(page)['rows']), 'F11: log keluar menyahdaftar peranti staf')
        check(not errors, 'app: tiada ralat konsol' + ('' if not errors else ': ' + ' | '.join(errors[:3])))
        ctx.close()
    browser.close()

print('\n' + ('E2E LULUS' if not fails else f'E2E GAGAL: {len(fails)}'))
sys.exit(1 if fails else 0)
