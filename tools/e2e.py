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

def check(cond, msg):
    print(('  ✓ ' if cond else '  ✗ ') + msg)
    if not cond: fails.append(msg)

def ignorable(text):
    # Gambar demo dari internet disekat dalam CI/kontena; bukan pepijat portal.
    return 'ERR_' in text or 'Failed to load resource' in text or 'picsum' in text

with sync_playwright() as p:
    exe = '/opt/pw-browsers/chromium' if os.path.exists('/opt/pw-browsers/chromium') and os.path.isfile('/opt/pw-browsers/chromium') else None
    browser = p.chromium.launch(executable_path=exe) if exe else p.chromium.launch()
    for name, vp in (('telefon-360', {'width': 360, 'height': 780}), ('desktop', {'width': 1280, 'height': 860})):
        print(f'[{name}]')
        ctx = browser.new_context(viewport=vp, device_scale_factor=2 if name.startswith('telefon') else 1)
        page = ctx.new_page()
        errors = []
        page.on('console', lambda m: errors.append(m.text) if m.type == 'error' and not ignorable(m.text) else None)
        page.on('pageerror', lambda e: errors.append(str(e)))

        page.goto(BASE, wait_until='domcontentloaded')
        page.wait_for_selector('.hero-headline', timeout=15000)
        check('Explorace' in page.inner_text('.hero-headline'), 'halaman utama: berita utama dipaparkan')
        check(page.locator('[data-open]').count() >= 3, 'halaman utama: kad berita dipaparkan')
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
    browser.close()

print('\n' + ('E2E LULUS' if not fails else f'E2E GAGAL: {len(fails)}'))
sys.exit(1 if fails else 0)
