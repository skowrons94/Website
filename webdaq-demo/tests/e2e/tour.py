"""
The guided tour, end to end, in Chromium (phase P5 acceptance, design §6.5):

  companion page (or the demo's start page) → demo → the nine tour steps,
  each done with "Do it for me" and checked by the tour itself → a finished run
  → Run files (8 files, metadata.json says simulated).

  python tests/e2e/tour.py <site or demo out dir> <base path> --start /software/webdaq/
      (/it/software/webdaq/ for Italian)
      [--lang en|it] [--width 1440] [--detectors hpge]

For the demo alone: out = the demo export, base = its base path, --start /.

With --start pointing at the companion page the out dir is the site's export
(served under the site base path) and the demo is reached through its link.
Fails on: a step that does not complete, an unmocked request, a request that
leaves the origin, a Content-Security-Policy violation, a page error, horizontal scroll of the page at phone width.
Writes nothing.
"""
import argparse
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / 'contract'))
from serve import serve  # noqa: E402
from playwright.sync_api import sync_playwright  # noqa: E402

T = {
    'en': {'tour': 'Take the guided tour', 'do': 'Do it for me', 'next': 'Next', 'finish': 'Finish', 'files': 'Run files',
           'show': 'Show files', 'all': 'Download all (.zip)', 'menu': 'Demo menu', 'continue': 'Continue anyway', 'step': 'Step'},
    'it': {'tour': 'Fai la visita guidata', 'do': 'Fallo per me', 'next': 'Avanti', 'finish': 'Fine', 'files': 'File del run',
           'show': 'Mostra i file', 'all': 'Scarica tutto (.zip)', 'menu': 'Menu della demo', 'continue': 'Continua comunque', 'step': 'Passo'},
}
DET = {'hpge': 'HPGe', 'bgo': 'BGO', 'ej309': 'EJ-309', 'he3': '³He'}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('out')
    ap.add_argument('base')
    ap.add_argument('--start', default='/')
    ap.add_argument('--lang', default='en')
    ap.add_argument('--width', type=int, default=1440)
    ap.add_argument('--detectors', default='hpge')
    ap.add_argument('--executable', default='/opt/pw-browsers/chromium')
    a = ap.parse_args()
    base = a.base.rstrip('/')
    t = T[a.lang]
    phone = a.width < 768
    srv = serve(a.out, base)
    origin = f'http://127.0.0.1:{srv.server_address[1]}'
    failures, report = [], {'width': a.width, 'lang': a.lang, 'detectors': a.detectors}

    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=a.executable)
        ctx = browser.new_context(viewport={'width': a.width, 'height': 900 if not phone else 844},
                                  is_mobile=phone, has_touch=phone, accept_downloads=True)
        page = ctx.new_page()
        outside, errors = [], []
        page.on('request', lambda r: outside.append(r.url) if not r.url.startswith(origin) and not r.url.startswith(('data:', 'blob:')) else None)
        page.on('pageerror', lambda e: errors.append(str(e)))
        # the site's static export puts a Content-Security-Policy into every page
        page.on('console', lambda m: errors.append(m.text) if 'Content Security Policy' in m.text else None)

        # 1. the way in
        companion = 'software' in a.start
        start = a.start + ('&' if '?' in a.start else '?') + ('lang=it&' if a.lang == 'it' and not companion else '') + 'seed=77'
        page.goto(origin + base + start)
        if companion:
            link = page.locator('a[href*="/webdaq-demo/"]').first
            link.wait_for(timeout=10000)
            report['demo link'] = link.get_attribute('href')
            link.click()
            page.wait_for_url(re.compile(r'/webdaq-demo/'), timeout=15000)
        if phone:
            page.get_by_role('button', name=t['continue']).click(timeout=10000)
        page.get_by_role('radio', name=re.compile(re.escape(DET[a.detectors]))).first.check(timeout=15000)
        page.get_by_role('button', name=t['tour']).click(timeout=10000)

        # 2. the steps
        dialog = page.locator('.wd-tour')
        dialog.wait_for(timeout=15000)
        seen = []
        online_checked = False
        for _ in range(40):
            label = dialog.locator('#wd-tour-step').inner_text()
            title = dialog.locator('h2').inner_text()
            if not seen or seen[-1][1] != title:
                seen.append((label, title))
            if title in ('Tune while the run goes', 'Regola durante il run') and not online_checked:
                # By hand first: Online during a production run asks for confirmation
                # (LUNADAQ's AlertDialog); the tour must stay usable around it.
                online_checked = True
                go_btn = dialog.get_by_role('button', name=re.compile(r'^(Go to|Vai) '))
                if go_btn.count():
                    go_btn.click()
                # as a visitor would: the tour highlights the switch and scrolls it clear of its card
                switch = page.get_by_role('switch', name='Online')
                page.locator('.wd-tour-target[role="switch"]').wait_for(timeout=15000)
                page.wait_for_timeout(800)
                covered = page.evaluate("""() => { const s = document.querySelector('.wd-tour-target'); const r = s.getBoundingClientRect()
                  const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !(e && (e === s || s.contains(e))) }""")
                if covered:
                    failures.append('the highlighted Online switch is covered (tour card, banner or header)')
                switch.click(timeout=15000)
                confirm = page.get_by_role('alertdialog')
                confirm.wait_for(timeout=5000)
                report['Online confirmation'] = confirm.locator('h2').inner_text()
                confirm.get_by_role('button', name='Online for this run').click()
                confirm.wait_for(state='hidden', timeout=5000)
                if page.get_by_role('switch', name='Online').get_attribute('aria-checked') != 'true':
                    failures.append('Online did not stay on after the confirmation')
            do = dialog.get_by_role('button', name=t['do'])
            if do.count() and do.is_enabled():
                do.click()
            status = dialog.locator('[data-tour="status"]')
            try:
                status.filter(has_text='✓').wait_for(timeout=25000)
            except Exception:
                failures.append(f'step did not complete: {label} {title}')
                break
            if a.detectors == 'hpge' and title in ('Tune while the run goes', 'Regola durante il run'):
                page.wait_for_timeout(3000)
                m = re.search(r'(\d+[.,]\d+) keV', dialog.locator('[data-tour="live"]').inner_text())
                fw = float(m.group(1).replace(',', '.')) if m else None
                report['tuned FWHM at 1332 keV (model)'] = fw
                if fw is None or fw > 2.0:
                    failures.append(f'tuned FWHM at 1332 keV is {fw}, expected <= 2.0 keV')
            if phone:
                # The sheet must not cover WebDAQ's run bar (Start… / Stop…) at the bottom.
                over = page.evaluate("""() => { const b = document.querySelector('[role="region"][aria-label="Run status"]'), t = document.querySelector('.wd-tour')
                  if (!b || !t || getComputedStyle(b).position !== 'fixed') return 0
                  return Math.max(0, t.getBoundingClientRect().bottom - b.getBoundingClientRect().top) }""")
                if over > 1:
                    failures.append(f'the tour covers the run bar by {over:.0f} px ({title})')
            hl = page.evaluate("() => { const e = document.querySelector('.wd-tour-target'); return e ? (e.getAttribute('role') || e.tagName.toLowerCase()) + ': ' + (e.getAttribute('aria-label') || e.textContent || e.id || '').trim().slice(0, 40) : null }")
            report.setdefault('highlighted', {})[title] = hl
            live = dialog.locator('[data-tour="live"]').inner_text()
            if live:
                report.setdefault('live lines', []).append(live)
            fin = dialog.get_by_role('button', name=t['finish'])
            if fin.count():
                fin.click()
                break
            page.wait_for_timeout(2000)
            if dialog.count() and dialog.locator('h2').inner_text() == title:
                dialog.get_by_role('button', name=t['next']).click()
            page.wait_for_timeout(800)
        report['steps'] = [f'{a} — {b}' for a, b in seen]
        if len(seen) < 9:
            failures.append(f'only {len(seen)} steps seen')
        if dialog.count():
            failures.append('the tour did not close after Finish')

        # 3. the run's files
        try:
            if phone:
                page.get_by_role('button', name=t['menu']).click()
            # The last finished run, from the worker itself (not from any cached broadcast).
            latest = page.evaluate("window.__webdaqDemo.control({type:'state'}).then(s => Math.max(...s.runs.filter(r => r.end_time).map(r => r.run_number)))")
            report['last finished run'] = latest
            page.get_by_role('button', name=t['files']).first.click()
            drawer = page.get_by_role('dialog', name=t['files'])
            rows = drawer.locator('.wd-list > li')
            rows.first.get_by_role('button', name=t['show']).wait_for(timeout=10000)
            first = rows.first.locator('strong').inner_text()
            if not re.search(rf'\b{latest}\b', first):
                failures.append(f'the Run files drawer lists {first!r} first, not run {latest}, the one just stopped')
            rows.filter(has=page.locator('strong', has_text=re.compile(rf'\b{latest}$'))).get_by_role('button', name=t['show']).click()
            drawer.get_by_role('button', name=t['all']).wait_for(timeout=30000)
            names = drawer.locator('.wd-files li button').all_inner_texts()
            report['run files'] = names
            if len(names) != 8:
                failures.append(f'run files: {names}')
            with page.expect_download() as dl:
                drawer.get_by_role('button', name='metadata.json').click()
            meta = json.loads(Path(dl.value.path()).read_text())
            if meta.get('Demo', {}).get('simulated') is not True or meta.get('Run Number') is None:
                failures.append('metadata.json is not the simulated run record')
            demo = meta.get('Demo', {})
            report['metadata scenario'] = demo.get('scenario')
            report['metadata run'] = {k: meta.get(k) for k in ('Run Number', 'Run Type', 'Target Name', 'Terminal Voltage', 'Accumulated Charge')}
            # Step 8 starts a new run for the new condition: the files describe one scenario.
            if any('scenario' in c for c in demo.get('changes during the run', [])):
                failures.append('the last run changed scenario mid-run (step 8 should start a new run)')
            want_src = {'hpge': 'n14pg', 'ej309': 'cf252', 'he3': 'cf252'}.get(a.detectors)
            if want_src and (demo.get('scenario') or {}).get('source') != want_src:
                failures.append(f"last run's source is {(demo.get('scenario') or {}).get('source')}, expected {want_src}")
            if a.detectors == 'hpge' and (meta.get('Run Type') != 'in-beam' or not demo.get('in-beam yield')):
                failures.append('the in-beam run is not declared as such (run type, yield factor)')
            q = meta.get('Accumulated Charge')
            if isinstance(q, float) and round(q, 3) != q:
                failures.append(f'accumulated charge not rounded: {q}')
            page.keyboard.press('Escape')


        except Exception as e:  # report it with everything else
            failures.append(f'run files: {str(e).splitlines()[0]}')
        misses = page.evaluate('window.__webdaqDemo.misses()')
        if misses:
            failures.append(f'unmocked requests: {misses}')
        if phone:
            w = page.evaluate('[document.documentElement.scrollWidth, window.innerWidth]')
            if w[0] > w[1] + 1:
                failures.append(f'horizontal scroll at {a.width}px: {w}')
        if outside:
            failures.append(f'requests left the origin: {sorted(set(outside))[:5]}')
        if errors:
            failures.append(f'page errors: {errors[:3]}')
        if failures:
            try:
                report['request log (non-GET, ms since load)'] = page.evaluate('window.__webdaqDemo.log ? window.__webdaqDemo.log() : []')[-60:]
            except Exception:
                pass
        browser.close()

    print(json.dumps(report, indent=1, ensure_ascii=False))
    if failures:
        print('\nFAILURES:\n- ' + '\n- '.join(failures))
        sys.exit(1)
    print('\ntour OK')


if __name__ == '__main__':
    main()
