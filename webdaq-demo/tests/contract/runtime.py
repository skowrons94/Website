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

Next prefetches the RSC payload of every page the nav links to. A navigation the test
makes (page.goto) while such prefetches are in flight aborts them, and Next logs
"Failed to fetch RSC payload for … Falling back to browser navigation". So before
every page.goto the test waits for the RSC requests in flight to finish; and if one is
still aborted, that console error is accepted only for a payload whose request failed
with net::ERR_ABORTED while the test's own navigation was under way. Any other RSC
failure (a 404, a network error, a payload failing outside a navigation) fails.
--rsc-delay holds every RSC response, to reproduce the race on demand.
"""
import argparse
import json
import re
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
# Errors the upstream frontend raises on its own, with or without the demo. None
# at the pin: the ui-refresh frontend fixed the React #418/#423 hydration
# mismatches the earlier pin raised on every full load of /tuner and /board.
ALLOWED_CONSOLE: tuple[str, ...] = ()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('out')
    ap.add_argument('base')
    ap.add_argument('--executable', default='/opt/pw-browsers/chromium')
    ap.add_argument('--wait', type=float, default=2.5)
    ap.add_argument('--screenshot', default='')
    ap.add_argument('--rsc-delay', type=float, default=0.0, help='hold RSC payloads this long (reproduces in-flight prefetches)')
    ap.add_argument('--no-settle', action='store_true', help='navigate without waiting for RSC prefetches (to check the abort handling)')
    a = ap.parse_args()
    base = a.base.rstrip('/')
    srv = serve(a.out, base, rsc_delay=a.rsc_delay)
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
        rsc = RscWatch(page, origin, report, settle=not a.no_settle)
        page.on('console', lambda m: seen['errors'].append(f'console: {m.text}') if m.type == 'error' and not any(x in m.text for x in ALLOWED_CONSOLE) and not rsc.aborted_by_us(m.text) else None)
        page.goto_settled = rsc.goto

        def visit(route, label):
            seen['errors'].clear()
            seen['notfound'].clear()
            t0 = time.time()
            page.goto_settled(origin + base + route + ('&' if '?' in route else '?') + 'seed=1234')
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

        if rsc.genuine:
            failures.append(f'RSC payloads failed (not aborted by the test): {rsc.genuine[:5]}')
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


class RscWatch:
    """RSC requests in flight, and those the test's own navigations aborted."""

    def __init__(self, page, origin, report, settle=True):
        self.page, self.origin, self.settle = page, origin, settle
        self.inflight = set()
        self.navigating = False
        self.aborted = set()        # page paths whose payload our navigation aborted
        self.genuine = []           # RSC requests that failed for any other reason
        self.report = report
        page.on('request', lambda r: self.inflight.add(r) if self.is_rsc(r) else None)
        page.on('requestfinished', lambda r: self.inflight.discard(r))
        page.on('response', lambda r: self.genuine.append(f'{r.status} {r.url}') if self.is_rsc(r.request) and r.status >= 400 else None)
        page.on('requestfailed', self.failed)

    @staticmethod
    def is_rsc(r):
        return '_rsc=' in r.url or r.headers.get('rsc') == '1'

    def page_path(self, url):
        """…/settings/index.txt?_rsc=x and …/settings/ (or …/settings) are the same page."""
        p = url.split('?', 1)[0].split('#', 1)[0]
        if p.startswith(self.origin):
            p = p[len(self.origin):]
        if p.endswith('index.txt'):
            p = p[:-len('index.txt')]
        return p.rstrip('/') + '/'

    def failed(self, r):
        self.inflight.discard(r)
        if not self.is_rsc(r):
            return
        if self.navigating and r.failure == 'net::ERR_ABORTED':
            self.aborted.add(self.page_path(r.url))
        else:
            self.genuine.append(f'{r.failure} {r.url}')

    def aborted_by_us(self, text):
        m = re.search(r'Failed to fetch RSC payload for (\S+?)\.? Falling back', text)
        if not m or self.page_path(m.group(1)) not in self.aborted:
            return False
        self.report['RSC prefetches aborted by the test\'s navigation'] = self.report.get('RSC prefetches aborted by the test\'s navigation', 0) + 1
        return True

    def goto(self, url):
        # let the prefetches of the current page finish first (they are why it races)
        deadline = time.time() + 10
        while self.settle and self.inflight and time.time() < deadline:
            self.page.wait_for_timeout(50)
        self.navigating = True
        try:
            return self.page.goto(url)
        finally:
            self.navigating = False


def flow(page, origin, base, a, seen, report, failures):
    if True:
        page.goto_settled(origin + base + '/?seed=1234')
        page.get_by_role('button', name='Open WebDAQ').click()
        page.wait_for_url('**/dashboard/**')
        page.goto_settled(origin + base + '/board/')
        page.get_by_role('button', name='Scan for boards').click()
        page.get_by_role('button', name='Use these settings').first.click(timeout=15000)
        page.get_by_role('button', name='Add Board').click()
        page.wait_for_function('() => window.__webdaqDemo.state() && window.__webdaqDemo.state().boards.length === 1', timeout=10000)
        page.goto_settled(origin + base + '/dashboard/')
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
        page.goto_settled(origin + base + '/dashboard/?tab=overview')
        page.wait_for_timeout(2000)
        # Stop Run asks first (WebDAQ's shared ConfirmAction). Cancel must leave
        # the run going; the dialog's own "Stop run N" button stops it.
        page.get_by_role('button', name='Stop Run').click()
        dialog = page.get_by_role('alertdialog')
        dialog.wait_for(timeout=5000)
        dialog.get_by_role('button', name='Cancel').click()
        page.wait_for_timeout(1000)
        if not page.evaluate('window.__webdaqDemo.state().running'):
            failures.append('cancelling the Stop Run confirmation stopped the run')
        page.get_by_role('button', name='Stop Run').click()
        page.get_by_role('alertdialog').get_by_role('button', name=re.compile(r'^Stop run')).click()
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
        page.goto_settled(origin + base + '/logbook/1/')
        page.wait_for_timeout(2500)
        text = page.inner_text('body')
        if 'Run 1' not in text and 'run 1' not in text.lower():
            failures.append('logbook/1 does not show run 1')


if __name__ == '__main__':
    main()
