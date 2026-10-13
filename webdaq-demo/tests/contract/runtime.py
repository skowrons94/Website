"""
Runtime contract check (design §2.4 iv) against an exported demo, in Chromium.

  python tests/contract/runtime.py <exported dir> <base path> [--executable /opt/pw-browsers/chromium]

1. Every route and tab renders: no request the mock did not handle, no request
   leaving the origin, no uncaught page error.
2. The core flow through the real UI: start page → Board: scan, use, add →
   Dashboard: start a run → spectra fill (placeholder physics) → stop → the run
   is in the Logbook.
3. The routes again, now with a board and a finished run.
Prints a summary and exits 1 on any failure. Writes nothing.
"""
import argparse
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from serve import serve  # noqa: E402
from playwright.sync_api import sync_playwright  # noqa: E402

ROUTES = [
    '/', '/dashboard/', '/dashboard/?tab=health', '/dashboard/?tab=runstats', '/dashboard/?tab=histograms',
    '/dashboard/?tab=waveforms', '/dashboard/?tab=psd', '/board/', '/DAQ/', '/tuner/', '/stats/', '/logbook/',
    '/logbook/1/', '/settings/', '/settings/?view=current', '/settings/?view=notifications', '/settings/?view=elog',
    '/settings/?view=grafana', '/settings/?view=appearance', '/alerts/', '/troubleshoot/', '/activity/', '/auth/login/',
]
# Errors the upstream frontend raises on its own, with or without the demo:
# React #418/#423 are recoverable hydration mismatches. Pages such as /tuner and
# /board render `null` when there is no token (the static HTML) and the page when
# there is one (the browser), so every full page load of a signed-in session
# mismatches; React re-renders on the client. Reported upstream as a finding.
ALLOWED_CONSOLE = ('Minified React error #418', 'Minified React error #423')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('out')
    ap.add_argument('base')
    ap.add_argument('--executable', default='/opt/pw-browsers/chromium')
    ap.add_argument('--wait', type=float, default=2.5)
    ap.add_argument('--screenshot', default='')
    a = ap.parse_args()
    base = a.base.rstrip('/')
    srv = serve(a.out, base)
    origin = f'http://127.0.0.1:{srv.server_address[1]}'
    failures = []
    report = {}

    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=a.executable)
        ctx = browser.new_context(viewport={'width': 1400, 'height': 900})
        page = ctx.new_page()
        seen = {'outside': [], 'errors': [], 'jsroot': set(), 'notfound': []}
        page.on('request', lambda r: seen['outside'].append(r.url) if not r.url.startswith(origin) and not r.url.startswith('data:') and not r.url.startswith('blob:') else None)
        page.on('request', lambda r: seen['jsroot'].add(r.url.rsplit('/', 1)[-1]) if '/jsroot/' in r.url else None)
        all404 = []
        page.on('response', lambda r: (seen['notfound'].append(r.url), all404.append(r.url)) if r.status >= 400 and r.url.startswith(origin) else None)
        page.on('pageerror', lambda e: seen['errors'].append(f'pageerror: {e}') if not any(x in str(e) for x in ALLOWED_CONSOLE) else None)
        page.on('console', lambda m: seen['errors'].append(f'console: {m.text}') if m.type == 'error' and not any(x in m.text for x in ALLOWED_CONSOLE) else None)

        def visit(route, label):
            seen['errors'].clear()
            seen['notfound'].clear()
            t0 = time.time()
            page.goto(origin + base + route + ('&' if '?' in route else '?') + 'seed=1234')
            page.wait_for_timeout(int(a.wait * 1000))
            misses = page.evaluate('window.__webdaqDemo ? window.__webdaqDemo.misses() : null')
            ok = misses == [] and not seen['errors']
            if misses is None:
                failures.append(f'{label} {route}: demo transport not present')
            elif misses:
                failures.append(f'{label} {route}: unmocked {misses}')
            if seen['errors']:
                failures.append(f'{label} {route}: {seen["errors"][:3]} {seen["notfound"][:3]}')
            report[f'{label} {route}'] = 'ok' if ok else 'FAIL'
            return time.time() - t0

        # 1. empty demo
        for r in ROUTES:
            visit(r, 'empty')

        # 2. the flow through the UI
        seen['errors'].clear()
        seen['notfound'].clear()
        try:
            flow(page, origin, base, a, seen, report, failures)
        except Exception as e:  # a broken flow is a failure, with a picture of where it broke
            failures.append(f'flow aborted: {str(e).splitlines()[0]} (errors: {seen["errors"][:3]})')
            if a.screenshot:
                page.screenshot(path=a.screenshot)

        # 3. every route again, with a board and a run (sessionStorage carries the state)
        for r in ROUTES[1:]:
            visit(r, 'with-run')

        if seen['outside']:
            failures.append(f'requests left the origin: {sorted(set(seen["outside"]))[:5]}')
        bad = [u for u in seen['notfound'] if '/_next/' in u or '/jsroot/' in u or '/demo/' in u]
        if bad:
            failures.append(f'missing static files: {bad[:5]}')
        report['jsroot files loaded'] = sorted(seen['jsroot'])
        report['404s (any)'] = sorted(set(all404))
        report['server errors'] = sorted(set(srv.errors))
        browser.close()

    print(json.dumps(report, indent=1, default=str))
    if failures:
        print('\nFAILURES:\n- ' + '\n- '.join(failures))
        sys.exit(1)
    print(f'\nruntime contract OK: {len(ROUTES)} routes empty + flow + {len(ROUTES) - 1} routes with a run, no unmocked request, nothing outside the origin')


def flow(page, origin, base, a, seen, report, failures):
    if True:
        page.goto(origin + base + '/?seed=1234')
        page.get_by_role('button', name='Open WebDAQ').click()
        page.wait_for_url('**/dashboard/**')
        page.goto(origin + base + '/board/')
        page.get_by_role('button', name='Scan for boards').click()
        page.get_by_role('button', name='Use these settings').first.click(timeout=15000)
        page.get_by_role('button', name='Add Board').click()
        page.wait_for_function('() => window.__webdaqDemo.state() && window.__webdaqDemo.state().boards.length === 1', timeout=10000)
        page.goto(origin + base + '/dashboard/')
        page.wait_for_timeout(1500)
        page.get_by_role('button', name='Start Run').click()
        page.wait_for_function('() => window.__webdaqDemo.state() && window.__webdaqDemo.state().running === true', timeout=10000)
        page.wait_for_timeout(4000)
        counts = page.evaluate("""async () => {
            const h = await window.__webdaqDemo.request({method:'GET', path:'/histograms/0/0', query:{}, body:null});
            const s = await window.__webdaqDemo.request({method:'GET', path:'/experiment/stats', query:{}, body:null});
            let sum = 0; for (const v of h.data.fArray) sum += v;
            return {title: h.data.fTitle, nbins: h.data.fXaxis.fNbins, sum, rate0: s.data[0] && s.data[0].channels[0].event_rate};
        }""")
        report['run: spectrum b0 ch0'] = counts
        if not counts['sum'] > 0:
            failures.append(f'spectrum did not fill: {counts}')
        page.get_by_role('tab', name='Histograms').click()
        page.wait_for_timeout(4000)
        page.goto(origin + base + '/dashboard/?tab=overview')
        page.wait_for_timeout(2000)
        page.get_by_role('button', name='Stop Run').click()
        page.wait_for_function('() => window.__webdaqDemo.state() && window.__webdaqDemo.state().running === false', timeout=10000)
        page.wait_for_timeout(1500)
        state = page.evaluate('window.__webdaqDemo.state()')
        report['after stop'] = {'runs': state['runs'], 'runNumber': state['runNumber']}
        if len(state['runs']) != 1 or not state['runs'][0]['end_time']:
            failures.append(f'run not recorded: {state["runs"]}')
        flow_misses = page.evaluate('window.__webdaqDemo.misses()')
        if flow_misses:
            failures.append(f'flow: unmocked {flow_misses}')
        if seen['errors']:
            failures.append(f'flow: {seen["errors"][:3]} {seen["notfound"][:5]}')
        page.goto(origin + base + '/logbook/1/')
        page.wait_for_timeout(2500)
        text = page.inner_text('body')
        if 'Run 1' not in text and 'run 1' not in text.lower():
            failures.append('logbook/1 does not show run 1')


if __name__ == '__main__':
    main()
