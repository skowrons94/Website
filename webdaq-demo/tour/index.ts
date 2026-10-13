/**
 * The guided tour (design §4.1): nine steps, each a non-modal dialog that
 * points at its target in the real WebDAQ interface, checks the simulated DAQ's
 * state to know when the visitor has done it, offers "Do it for me", and keeps
 * a live line of ground truth from the simulation. Loaded on demand through
 * window.__webdaqTour (shell/tour-loader.ts); plain DOM, no framework.
 * It survives page loads: its position is kept in sessionStorage.
 */
import { en, it, type Kind, type TourCopy } from './copy'

declare global { interface Window { __webdaqDemo: any; next?: { router?: { push(href: string): void } } } }

// scripts/size.mjs finds the tour's chunk by this string.
export const MARK = '__webdaqTourBundle'

type Lang = 'en' | 'it'
const KEY = 'webdaq-demo:v1:tour'
const BASE = process.env.NEXT_PUBLIC_DEMO_BASE_PATH || ''

interface Saved { i: number; lang: Lang; distance: number; source: string }
interface Ctx { s: any; kind: Kind }
interface Target { role: string; name: RegExp }
interface Step {
  id: keyof TourCopy['steps']
  route: string | ((k: Kind) => string)
  query?: string
  target?: (k: Kind) => Target | null
  done: (c: Ctx) => Promise<boolean>
  doIt?: (c: Ctx) => Promise<void>
  live?: (c: Ctx, t: TourCopy) => Promise<string>
  /** Do not move on by itself once done: the live line is the point of the step. */
  stay?: boolean
}

const req = (method: string, path: string, body: unknown = null, query: Record<string, string> = {}) =>
  window.__webdaqDemo.request({ method, path, query, body }).then((r: any) => r.data)
const ctl = (cmd: Record<string, unknown>) => window.__webdaqDemo.control(cmd)
const isPha = (k: Kind) => k === 'hpge'

/** The main line of the scenario, in calibrated keV: for the ROI and the FWHM probe. */
function mainLine(s: any): number {
  const src = s.scenario.source, k = s.scenario.detectors as Kind
  if (k === 'he3') return 764
  if (k === 'ej309') return 1000
  return src === 'cs137' ? 662 : src === 'background' ? 1461 : src === 'n14pg' ? 6792 : src === 'cf252' ? 1000 : 1332
}

/** What the Dashboard's run form would hold for the scenario: a source run, or the beam on a TiN target. */
function runMeta(s: any) {
  const sc = s.scenario
  if (sc.source === 'n14pg') return { target_name: 'TiN on Ta backing (simulated)', terminal_voltage: 300, probe_voltage: null, run_type: 'in-beam' }
  const names: Record<string, string> = { co60: '60Co source', cs137: '137Cs source', cf252: '252Cf source', background: 'no source (background)' }
  return { target_name: `${names[sc.source] ?? sc.source} at ${sc.distance_cm} cm (simulated)`, terminal_voltage: null, probe_voltage: null, run_type: sc.source === 'background' ? 'background' : 'calibration' }
}

async function startRun() {
  const n = await req('GET', '/experiment/get_run_number')
  await req('POST', '/experiment/set_run_number', { value: n })
  await req('POST', '/experiment/set_save_data', { value: true })
  await req('GET', `/current/start/${n}`)
  await req('POST', `/stats/run/${n}/start`)
  await req('POST', '/experiment/start_run')
  await req('POST', '/experiment/add_run_metadata', { run_number: n, ...runMeta(await ctl({ type: 'state' })) })
}
async function stopRun() {
  await req('POST', '/experiment/stop_run')
  await req('POST', '/current/stop')
  await req('POST', '/stats/run/stop')
}
const reg = async (key: string) => ((await req('GET', '/digitizer/0/registers')) as Record<string, { value_dec: number }>)[key]?.value_dec ?? 0
const setReg = (key: string, value: number) => req('POST', `/digitizer/0/setting/${key}`, { value, online: true })
const byRole = (role: string, name: RegExp) => () => ({ role, name })

const STEPS: Step[] = [
  {
    id: 'choose', route: '/',
    target: byRole('button', /^Open WebDAQ$|^Apri WebDAQ$/),
    done: async () => location.pathname !== BASE + '/' && location.pathname !== BASE,
    doIt: async () => { go('/dashboard') },
    live: async (c, t) => t.live.distance(c.s.scenario.distance_cm),
  },
  {
    id: 'board', route: '/board',
    target: byRole('button', /Scan for boards|Use these settings|Add Board/),
    done: async c => c.s.boards.length > 0,
    doIt: async c => {
      await req('POST', '/digitizer/scan', { optical: { enabled: true, links: 1, nodes: 1 } })
      await new Promise(r => setTimeout(r, 400))
      await req('POST', '/experiment/add_board', { id: '0', vme: '0', link_type: 'Optical', link_num: '0', dpp: isPha(c.kind) ? 'DPP-PHA' : 'DPP-PSD' })
    },
    live: async (c, t) => (c.s.boards[0] ? t.live.board(c.s.boards[0].dpp) : ''),
  },
  {
    id: 'config', route: '/DAQ',
    target: byRole('tab', /^Configuration$/),
    done: async c => !!c.s.boards[0]?.waveforms,
    doIt: async () => { await req('POST', '/waveforms/activate/0') },
  },
  {
    id: 'run', route: '/dashboard',
    target: byRole('button', /^Start Run$/),
    done: async c => c.s.running,
    doIt: async c => { if (!c.s.running) await startRun() },
  },
  {
    id: 'fill', route: '/dashboard', query: '?tab=histograms',
    target: k => ({ role: 'tab', name: k === 'ej309' || k === 'bgo' ? /^PSD$/ : /^Histograms$/ }),
    // Neutron counting is slow (²⁵²Cf at 10 cm: tens of events a second): fewer counts will do.
    done: async c => ((await req('GET', '/histograms/0/0')).fEntries ?? 0) > (({ he3: 50, ej309: 500 } as Record<string, number>)[c.kind] ?? 2000),
    live: async (c, t) => {
      const st = await req('GET', '/experiment/stats')
      const ch = st?.[0]?.channels?.[0]
      return ch ? t.live.rate(0, ch.event_rate, ch.pileup_rate) : ''
    },
  },
  {
    id: 'tune', route: k => (isPha(k) ? '/tuner' : '/DAQ'), stay: true,
    target: k => (isPha(k) ? { role: 'switch', name: /Online/ } : { role: 'tab', name: /^Configuration$/ }),
    done: async c => {
      if (isPha(c.kind)) return (await reg('reg_1068')) >= 5000 && (await reg('reg_105C')) >= 375 && (await reg('reg_1060')) >= 100
      const g = await reg('reg_1058')
      return c.kind === 'he3' ? g >= 1500 : g >= (c.kind === 'ej309' ? 240 : 450)
    },
    doIt: async c => {
      for (const ch of [0, 1]) {
        const k = (a: number) => `reg_${(a + ch * 0x100).toString(16).toUpperCase()}`
        if (isPha(c.kind)) { await setReg(k(0x1068), 6250); await setReg(k(0x105C), 500); await setReg(k(0x1060), 125) }
        else await setReg(k(0x1058), c.kind === 'he3' ? 2000 : c.kind === 'ej309' ? 250 : 500)
      }
    },
    live: async (c, t) => {
      if (c.kind === 'ej309' || c.kind === 'he3') return t.live.gate((await reg('reg_1058')) * 2)
      const e = mainLine(c.s)
      const r = await ctl({ type: 'fwhm', channel: 0, energy_keV: e })
      const rel = !isPha(c.kind)
      const conv = (x: number | null | undefined) => (x == null ? null : rel ? (100 * x) / e : x)
      // The peak fit is reliable on germanium's narrow lines; for BGO the model alone is shown.
      return t.live.fwhm(e, conv(r?.expected_fwhm_keV), rel ? null : conv(r?.fit?.fwhm_keV), rel)
    },
  },
  {
    id: 'roi', route: '/dashboard', query: '?tab=histograms',
    target: byRole('tab', /^Histograms$/),
    done: async c => c.s.rois > 0,
    doIt: async c => {
      const cfg = await req('GET', '/histograms/config')
      const h = cfg.histograms[0]
      if (!h) return
      // EJ-309 has no full-energy peak: a range of light (keV electron-equivalent) instead.
      if (c.kind === 'ej309') { await req('POST', `/histograms/config/histograms/${h.id}/rois`, { name: '200–1800 keVee', low: 200, high: 1800 }); return }
      const e = mainLine(c.s), w = isPha(c.kind) ? 15 : e * 0.12
      await req('POST', `/histograms/config/histograms/${h.id}/rois`, { name: `${e} keV`, low: Math.max(0, e - w), high: e + w })
    },
    live: async (c, t) => {
      const r = (await req('GET', '/histograms/roi_integrals')).results?.[0]
      return r ? t.live.roi(r.net) : ''
    },
  },
  {
    id: 'scenario', route: '/dashboard',
    done: async c => {
      const sv = saved()
      return !!sv && (c.s.scenario.distance_cm !== sv.distance || c.s.scenario.source !== sv.source)
    },
    // A new condition is a new run: stop this one, change the scenario, start the next
    // (its files then describe one set of conditions; a change mid-run is recorded too).
    doIt: async c => {
      const sc = c.kind === 'hpge' && c.s.scenario.source !== 'n14pg' ? { source: 'n14pg' } : { distance_cm: Math.max(1, Math.round(c.s.scenario.distance_cm / 2)) }
      const wasRunning = c.s.running
      if (wasRunning) await stopRun()
      await ctl({ type: 'scenario', scenario: sc })
      if (wasRunning) await startRun()
    },
    live: async (c, t) => {
      if (c.s.scenario.source === 'n14pg') return t.live.beam(await req('GET', '/current/data'), await req('GET', '/current/accumulated'))
      return t.live.distance(c.s.scenario.distance_cm)
    },
  },
  {
    id: 'files', route: '/logbook',
    target: byRole('button', /^Run files$|^File del run$/),
    done: async c => c.s.runs.some((r: any) => r.end_time) && !c.s.running,
    doIt: async c => { if (c.s.running) await stopRun() },
    live: async (c, t) => {
      const r = [...c.s.runs].reverse().find((x: any) => x.end_time)
      if (!r) return ''
      const d = await req('GET', `/data/runs/${r.run_number}`)
      return t.live.files(r.run_number, Math.round((d.files?.total_bytes ?? 0) / 1024))
    },
  },
]

// ── state ───────────────────────────────────────────────────────────────────

function saved(): Saved | null {
  try { return JSON.parse(sessionStorage.getItem(KEY) || 'null') } catch { return null }
}
function save(v: Saved | null) {
  try { v ? sessionStorage.setItem(KEY, JSON.stringify(v)) : sessionStorage.removeItem(KEY) } catch { /* ignore */ }
}

const routeOf = (s: Step, k: Kind) => (typeof s.route === 'function' ? s.route(k) : s.route)

function here(): string {
  const p = location.pathname.startsWith(BASE) ? location.pathname.slice(BASE.length) : location.pathname
  return p.replace(/\/+$/, '') || '/'
}
function go(route: string, query = '') {
  const href = route + (route === '/' ? '' : '/') + query
  if (window.next?.router) window.next.router.push(href)
  else location.href = BASE + href
}

/** The accessible name, roughly: aria-label, aria-labelledby, a <label for>, else the text. */
function accessibleName(el: HTMLElement): string {
  const aria = el.getAttribute('aria-label')
  if (aria) return aria.trim()
  const by = el.getAttribute('aria-labelledby')
  if (by) return by.split(/\s+/).map(id => document.getElementById(id)?.textContent ?? '').join(' ').trim()
  const labels = (el as HTMLButtonElement).labels
  if (labels && labels.length) return [...labels].map(l => l.textContent ?? '').join(' ').trim()
  return (el.textContent || '').trim()
}

/** A target by role and accessible name (aria-label, labelled-by, a label, or text). */
function findTarget(t: Target | null): HTMLElement | null {
  if (!t) return null
  const sel = t.role === 'button' ? 'button,[role="button"]' : `[role="${t.role}"]`
  for (const el of document.querySelectorAll<HTMLElement>(sel)) {
    if (el.closest('.wd-tour')) continue
    const name = accessibleName(el)
    if (t.name.test(name) && el.offsetParent !== null) return el
  }
  return null
}

// ── the dialog ──────────────────────────────────────────────────────────────

let root: HTMLDivElement | null = null
let timer: number | undefined
let lang: Lang = 'en'
let index = 0
let highlighted: HTMLElement | null = null
let returnFocus: HTMLElement | null = null
let wasDone = false
/** "Do it for me" is under way: its steps (stop, change, start) are not judged half-way. */
let busy = false

const copy = () => (lang === 'it' ? it : en)

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v)
  if (text) e.textContent = text
  return e
}

async function state(): Promise<Ctx> {
  const s = await ctl({ type: 'state' })
  return { s, kind: s.scenario.detectors as Kind }
}

function highlight(target: HTMLElement | null) {
  if (highlighted && highlighted !== target) highlighted.classList.remove('wd-tour-target')
  highlighted = target
  if (target && !target.classList.contains('wd-tour-target')) {
    target.classList.add('wd-tour-target')
    const smooth = !matchMedia('(prefers-reduced-motion: reduce)').matches
    target.scrollIntoView({ block: 'nearest', behavior: smooth ? 'smooth' : 'auto' })
  }
}

async function render(focus: boolean) {
  if (!root) return
  const t = copy()
  const step = STEPS[index]
  const c = await state()
  const sc = t.steps[step.id]
  const body = typeof sc.body === 'function' ? sc.body(c.kind) : sc.body
  root.replaceChildren()
  root.setAttribute('lang', lang)
  const head = el('div', { class: 'wd-tour-head' })
  head.append(el('p', { class: 'wd-muted', id: 'wd-tour-step' }, t.step(index + 1, STEPS.length)))
  const close = el('button', { type: 'button', class: 'wd-btn', 'aria-label': t.close }, '×')
  close.onclick = () => stop()
  head.append(close)
  const h = el('h2', { id: 'wd-tour-title', tabindex: '-1' }, sc.title)
  const p = el('p', {}, body)
  const status = el('p', { class: 'wd-tour-status', 'data-tour': 'status' })
  const live = el('p', { class: 'wd-muted', 'aria-live': 'polite', 'data-tour': 'live' })
  const actions = el('div', { class: 'wd-tour-actions' })
  const route = routeOf(step, c.kind)
  const onPage = here() === route
  if (!onPage) {
    const b = el('button', { type: 'button', class: 'wd-btn' }, t.goTo(t.pages[route] ?? route))
    b.onclick = () => go(route, step.query)
    actions.append(b)
  }
  if (step.doIt) {
    const b = el('button', { type: 'button', class: 'wd-btn', 'data-tour': 'do' }, t.doIt)
    b.onclick = async () => {
      b.disabled = true
      if (!onPage && route !== '/') go(route, step.query)
      busy = true
      try { await step.doIt!(await state()) } finally { b.disabled = false; busy = false }
      tick()
    }
    actions.append(b)
  }
  if (index > 0) {
    const b = el('button', { type: 'button', class: 'wd-btn' }, t.back)
    b.onclick = () => show(index - 1)
    actions.append(b)
  }
  const last = index === STEPS.length - 1
  const nx = el('button', { type: 'button', class: 'wd-btn wd-primary', 'data-tour': 'next' }, last ? t.finish : t.next)
  nx.onclick = () => (last ? stop() : show(index + 1))
  actions.append(nx)
  root.append(head, h, p, status, live, actions)
  clearRunBar()
  if (focus) h.focus()
  wasDone = false
  tick()
}

/**
 * On a phone WebDAQ keeps a run bar (Start… / Stop…) fixed at the bottom of the
 * screen; the tour's sheet sits just above it, so the controls it talks about stay visible.
 */
function clearRunBar() {
  if (!root) return
  const bar = document.querySelector<HTMLElement>('[role="region"][aria-label="Run status"]')
  const h = bar && getComputedStyle(bar).position === 'fixed' ? bar.getBoundingClientRect().height : 0
  const want = h > 0 && matchMedia('(max-width: 767px)').matches ? `${Math.ceil(h)}px` : ''
  if (root.style.bottom !== want) root.style.bottom = want
}

async function tick() {
  clearRunBar()
  if (!root || busy) return
  const t = copy()
  const step = STEPS[index]
  let c: Ctx
  try { c = await state() } catch { return }
  const done = await step.done(c).catch(() => false)
  if (!root) return
  const status = root.querySelector<HTMLElement>('[data-tour="status"]')
  if (status) status.textContent = done ? t.done : t.waiting
  const live = root.querySelector<HTMLElement>('[data-tour="live"]')
  if (live && step.live) {
    const txt = await step.live(c, t).catch(() => '')
    if (txt && live.textContent !== txt) live.textContent = txt
  }
  if (!root || STEPS[index] !== step) return   // closed or moved on while waiting
  highlight(here() === routeOf(step, c.kind) ? findTarget(step.target?.(c.kind) ?? null) : null)
  // Advance by itself once the visitor has done it (not when it was already done on arrival).
  if (done && !wasDone && !step.stay && index < STEPS.length - 1 && root.dataset.arrivedDone === 'no') {
    wasDone = true
    window.setTimeout(() => { if (root && STEPS[index] === step) show(index + 1) }, 1500)
  }
  if (root.dataset.arrivedDone === undefined || root.dataset.arrivedDone === '') root.dataset.arrivedDone = done ? 'yes' : 'no'
}

function show(i: number) {
  index = Math.max(0, Math.min(STEPS.length - 1, i))
  const sv = saved()
  if (sv) save({ ...sv, i: index, lang })
  if (root) root.dataset.arrivedDone = ''
  render(true)
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && root && root.contains(document.activeElement)) { e.preventDefault(); stop() }
}
function onLang(e: Event) {
  lang = (e as CustomEvent).detail === 'it' ? 'it' : 'en'
  const sv = saved()
  if (sv) save({ ...sv, lang })
  render(false)
}

export function stop() {
  window.clearInterval(timer)
  highlight(null)
  root?.remove()
  root = null
  save(null)
  document.removeEventListener('keydown', onKey)
  window.removeEventListener('webdaq-demo:lang', onLang)
  returnFocus?.focus?.()
}

/** Start the tour (or resume the one this tab was following). */
export async function startTour(l: Lang, resume = false) {
  lang = l === 'it' ? 'it' : 'en'
  const sv = saved()
  if (resume && sv) { lang = sv.lang; index = sv.i }
  else {
    const c = await state()
    index = here() === '/' ? 0 : 1
    save({ i: index, lang, distance: c.s.scenario.distance_cm, source: c.s.scenario.source })
  }
  if (!root) {
    returnFocus = document.activeElement as HTMLElement | null
    root = el('div', { class: 'wd-frame wd-tour', role: 'dialog', 'aria-modal': 'false', 'aria-labelledby': 'wd-tour-title', 'aria-describedby': 'wd-tour-step' })
    document.body.append(root)
    document.addEventListener('keydown', onKey)
    window.addEventListener('webdaq-demo:lang', onLang)
    timer = window.setInterval(tick, 1500)
  }
  ;(globalThis as Record<string, unknown>)[MARK] = true
  root.dataset.arrivedDone = ''
  render(!resume)
}
