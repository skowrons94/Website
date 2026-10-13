"""
The demo frame in Chromium (design §5, phase P4 acceptance):
banner on every page, EN/IT, phone width (375 px) without horizontal scroll and
with 44 px targets, theme pass-through, not-in-demo notes, the Run files drawer
(8 files, metadata.json says simulated, zip), the Scenario panel, Reset, and
axe-core on the frame (no serious or critical issue). Plus the wording rule on
the export: no old name of the MV machine, "simulated" on every page.

  python tests/shell/shell.py <exported dir> <base path> --axe <path to axe.min.js>

Writes nothing (downloads are read in memory and discarded).
"""
import argparse
import json
import re
import sys
import zipfile
import io
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / 'contract'))
from serve import serve  # noqa: E402
from playwright.sync_api import sync_playwright  # noqa: E402

PAGES = ['/', '/dashboard/', '/board/', '/DAQ/', '/tuner/', '/stats/', '/logbook/', '/logbook/1/', '/settings/', '/alerts/', '/troubleshoot/', '/activity/', '/auth/login/']
OLD_NAME = re.compile(r'LUNA[\s-]*MV', re.I)


def wording(out: Path, failures):
    pages = 0
    for f in out.rglob('*'):
        if f.suffix not in ('.html', '.js', '.txt') or not f.is_file():
            continue
        s = f.read_text(errors='ignore')
        if OLD_NAME.search(s):
            failures.append(f'old name of the MV machine in {f.relative_to(out)}')
        if f.name == 'index.html':
            pages += 1
            if 'simulated' not in s.lower():
                failures.append(f'"simulated" missing from {f.relative_to(out)}')
    return pages


def axe(page, axe_js, failures, label):
    # evaluated, not added as a <script>: the site's export has a CSP that blocks inline scripts
    if not page.evaluate('() => !!window.axe'):
        page.evaluate(axe_js + '\n;0')
    res = page.evaluate("""async () => {
        const r = await axe.run({ include: [['.wd-frame']] }, { resultTypes: ['violations'] });
        return r.violations.filter(v => v.impact === 'serious' || v.impact === 'critical')
          .map(v => v.id + ': ' + v.nodes.slice(0, 2).map(n => n.target.join(' ')).join(' | '));
    }""")
    if res:
        failures.append(f'axe {label}: {res}')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('out')
    ap.add_argument('base')
    ap.add_argument('--axe', required=True)
    ap.add_argument('--executable', default='/opt/pw-browsers/chromium')
    a = ap.parse_args()
    base = a.base.rstrip('/')
    out = Path(a.out)
    failures = []
    report = {'pages with "simulated"': wording(out, failures)}
    axe_js = Path(a.axe).read_text()
    srv = serve(a.out, base)
    origin = f'http://127.0.0.1:{srv.server_address[1]}'
    url = lambda p, q='': origin + base + p + ('?' + q if q else '')  # noqa: E731

    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=a.executable)

        # ── desktop ──
        ctx = browser.new_context(viewport={'width': 1366, 'height': 900}, accept_downloads=True)
        page = ctx.new_page()
        page.on('dialog', lambda d: d.accept())
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        for path in PAGES:
            page.goto(url(path, 'seed=21'))
            banner = page.get_by_role('region', name='Demo notice')
            banner.wait_for(timeout=5000)
            if 'simulated' not in banner.inner_text().lower():
                failures.append(f'banner text on {path}')
        report['banner on every page'] = len(PAGES)
        if page.get_by_role('button', name='Demo menu').is_visible():
            failures.append('the phone menu button shows on a desktop')
        page.goto(url('/', 'seed=21'))
        axe(page, axe_js, failures, 'start page')
        # notes
        page.goto(url('/stats/'))
        note = page.get_by_role('note').filter(has_text='simulated')
        note.wait_for(timeout=5000)
        note.get_by_role('button', name='Dismiss').click()
        page.goto(url('/stats/'))
        page.wait_for_timeout(800)
        if page.get_by_role('note').filter(has_text='Metrics are simulated').count():
            failures.append('dismissed note came back')
        # a run, through the API, then the drawer
        page.goto(url('/', 'seed=21'))
        page.get_by_role('button', name='Open WebDAQ').click()
        page.wait_for_url('**/dashboard/**')
        page.evaluate("""async () => { const R=(m,p,b)=>window.__webdaqDemo.request({method:m,path:p,query:{},body:b||null});
          await R('POST','/digitizer/scan',{optical:{enabled:true,links:1,nodes:1}}); await new Promise(r=>setTimeout(r,600));
          await R('POST','/experiment/add_board',{id:'0',vme:'0',link_type:'Optical',link_num:'0',dpp:'DPP-PHA'});
          await R('GET','/current/start/1'); await R('POST','/stats/run/1/start');
          await R('POST','/experiment/start_run'); await new Promise(r=>setTimeout(r,4000));
          await R('POST','/experiment/stop_run'); await R('POST','/current/stop'); await R('POST','/stats/run/stop'); }""")
        page.wait_for_timeout(1500)
        page.get_by_role('button', name='Run files').click()
        dialog = page.get_by_role('dialog', name='Run files')
        dialog.wait_for(timeout=5000)
        dialog.get_by_role('button', name='Show files').first.click()
        dialog.get_by_role('button', name='Download all (.zip)').wait_for(timeout=20000)
        names = dialog.locator('.wd-files li button').all_inner_texts()
        report['run files'] = names
        if len(names) != 8:
            failures.append(f'expected 8 run files, got {names}')
        axe(page, axe_js, failures, 'run files drawer')
        with page.expect_download() as dl:
            dialog.get_by_role('button', name='metadata.json').click()
        meta = json.loads(Path(dl.value.path()).read_text())
        if meta.get('Demo', {}).get('simulated') is not True:
            failures.append('metadata.json Demo.simulated is not true')
        with page.expect_download() as dl:
            dialog.get_by_role('button', name='Download all (.zip)').click()
        z = zipfile.ZipFile(io.BytesIO(Path(dl.value.path()).read_bytes()))
        report['zip'] = sorted(z.namelist())
        if len(z.namelist()) != 8:
            failures.append(f'zip holds {z.namelist()}')
        page.keyboard.press('Escape')
        if dialog.count():
            failures.append('Esc does not close the drawer')
        # scenario panel: switch to BGO (no run going)
        page.get_by_role('button', name='Scenario').click()
        sp = page.get_by_role('dialog', name='Scenario')
        sp.get_by_label(re.compile('BGO')).check()
        sp.get_by_role('button', name='Apply').click()
        sp.get_by_role('status').filter(has_text='applied').wait_for(timeout=10000)
        dpp = page.evaluate("window.__webdaqDemo.control({type: 'state'}).then(s => s.boards[0].dpp)")
        if dpp != 'DPP-PSD':
            failures.append(f'scenario did not switch the firmware: {dpp}')
        page.keyboard.press('Escape')
        # reset
        page.get_by_role('button', name='Reset demo').click()
        page.wait_for_url(re.compile(re.escape(base) + r'/(\?.*)?$'), timeout=10000)
        page.wait_for_timeout(2500)
        st = page.evaluate("window.__webdaqDemo.control({type: 'state'})")
        if st['boards'] or st['runs']:
            failures.append(f'reset kept state at {page.url}: {st["boards"]} {st["runs"]}')
        if errors:
            failures.append(f'page errors: {errors[:3]}')
        ctx.close()

        # ── Italian ──
        ctx = browser.new_context(viewport={'width': 1366, 'height': 900})
        page = ctx.new_page()
        page.goto(url('/', 'lang=it'))
        page.get_by_role('heading', name='WebDAQ, simulato').wait_for(timeout=5000)
        if page.evaluate('document.documentElement.lang') != 'it':
            failures.append('html lang is not it')
        if 'rivelatori simulati' not in page.get_by_role('region', name='Avviso demo').inner_text():
            failures.append('banner not in Italian')
        page.goto(url('/dashboard/'))
        page.get_by_role('region', name='Avviso demo').wait_for(timeout=5000)
        ctx.close()

        # ── dark theme follows the site ──
        ctx = browser.new_context(viewport={'width': 1366, 'height': 900}, color_scheme='light')
        page = ctx.new_page()
        page.goto(url('/'))
        page.evaluate("localStorage.setItem('theme', 'dark')")
        page.goto(url('/dashboard/'))
        page.wait_for_timeout(800)
        if 'dark' not in (page.get_attribute('html', 'class') or ''):
            failures.append('theme=dark did not reach WebDAQ')
        bg = page.evaluate("getComputedStyle(document.querySelector('.wd-banner')).backgroundColor")
        report['dark banner background'] = bg
        axe(page, axe_js, failures, 'banner, dark')
        ctx.close()

        # ── phone ──
        ctx = browser.new_context(viewport={'width': 375, 'height': 812}, has_touch=True, is_mobile=True)
        page = ctx.new_page()
        page.goto(url('/'))
        page.get_by_role('button', name='Continue anyway').wait_for(timeout=5000)
        axe(page, axe_js, failures, 'phone notice')

        def no_hscroll(label):
            w = page.evaluate('[document.documentElement.scrollWidth, window.innerWidth]')
            if w[0] > w[1]:
                failures.append(f'horizontal scroll on {label}: {w}')

        no_hscroll('phone notice')
        page.get_by_role('button', name='Continue anyway').click()
        page.get_by_role('button', name='Open WebDAQ').wait_for()
        no_hscroll('start page')
        small = page.evaluate("""[...document.querySelectorAll('.wd-frame button, .wd-frame a.wd-btn')]
            .filter(b => b.offsetParent).map(b => [b.textContent.trim(), b.getBoundingClientRect().height]).filter(([, h]) => h < 44)""")
        if small:
            failures.append(f'targets under 44 px: {small}')
        page.get_by_role('button', name='Demo menu').click()
        page.get_by_role('button', name='Run files').wait_for()
        no_hscroll('banner menu')
        small = page.evaluate("""[...document.querySelectorAll('.wd-menu button, .wd-menu a')]
            .map(b => [b.textContent.trim(), b.getBoundingClientRect().height]).filter(([, h]) => h < 44)""")
        if small:
            failures.append(f'menu targets under 44 px: {small}')
        ctx.close()
        browser.close()

    print(json.dumps(report, indent=1))
    if failures:
        print('\nFAILURES:\n- ' + '\n- '.join(failures))
        sys.exit(1)
    print('\nshell OK')


if __name__ == '__main__':
    main()
