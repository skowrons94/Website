// Every string the demo frame shows, in English and Italian.
// Wording rule: the 3.5 MV accelerator is "the MV machine of the Bellotti Ion
// Beam Facility (BIBF)"; never the old name.

export type Lang = 'en' | 'it'

export const en = {
  banner: 'Demo — simulated detectors · runs in your browser · nothing here is real hardware',
  bannerShort: 'Demo — simulated, in your browser',
  bannerTitle: 'Everything in this demo is simulated inside this page. A new tab starts a fresh demo.',
  guide: 'Guide',
  runFiles: 'Run files',
  scenario: 'Scenario',
  reset: 'Reset demo',
  resetConfirm: 'Reset the demo? Boards, runs and settings are cleared; the seed is kept, so it replays the same way.',
  back: '← Back to the site',
  menu: 'Demo menu',
  close: 'Close',
  dismiss: 'Dismiss',
  langSwitch: 'Italiano',
  langSwitchLabel: 'Leggi in italiano',
  // notes
  noteLogin: 'There is no login in the demo: any name and password work.',
  noteLogbook: 'The demo has no ELOG server. In real use WebDAQ reads and writes the collaboration’s PSI ELOG; “Write up a run” drafts the entry from the run’s files.',
  noteRun: 'Conversion needs RUReader on the server: download the .caendat from Run files and run RUReader yourself (RUReader -i <dir> -o run.root).',
  noteSettings: 'ELOG and Grafana are not connected in the demo. Notification rules are evaluated here, but messages are never sent.',
  noteAlerts: 'Grafana is not connected in the demo.',
  noteStats: 'Metrics are simulated (demo.*); in real use they come from Graphite.',
  noteTroubleshoot: 'Alerts are raised by the simulated DAQ and never delivered: nothing leaves your browser.',
  // start page
  startTitle: 'WebDAQ, simulated',
  startLead: 'The data acquisition software of the LUNA experiment, running here against a simulated DAQ server inside this page. The interface is the real one; the detectors, the board and the beam are simulated.',
  detectors: 'Detectors',
  detectorsHint: 'Two detectors on one simulated CAEN V1730 digitizer, channels 0 and 1.',
  det_hpge: '2 × HPGe — germanium, for resolution (DPP-PHA firmware)',
  det_bgo: '2 × BGO — scintillators, for efficiency (DPP-PSD)',
  det_ej309: '2 × liquid scintillators, EJ-309-like — neutrons and γ rays apart (DPP-PSD)',
  det_he3: '2 × ³He counters — thermal neutrons (DPP-PSD)',
  source: 'Source',
  src_co60: '⁶⁰Co calibration source',
  src_cs137: '¹³⁷Cs calibration source',
  src_background: 'Room background only (underground)',
  src_n14pg: 'In-beam ¹⁴N(p,γ)¹⁵O at the 278 keV resonance',
  src_cf252: '²⁵²Cf neutron source',
  distance: 'Source–detector distance',
  open: 'Open WebDAQ',
  tourOffer: 'Take the guided tour',
  readAbout: 'Read about WebDAQ',
  phoneTitle: 'WebDAQ is a desktop control interface',
  phoneText: 'Its tables and plots are wide. On a phone you can still try it, or read about it first.',
  continueAnyway: 'Continue anyway',
  simulatedNote: 'Simulated detectors · runs in your browser · nothing here is real hardware. Data you download are marked as simulated.',
}

export type Strings = typeof en


let itStrings: Strings | null = null
/** The frame's strings: English at once, Italian from its own chunk. */
export function getStrings(l: Lang): Strings | Promise<Strings> {
  if (l === 'en') return en
  if (itStrings) return itStrings
  return import('./strings-it').then(m => (itStrings = m.it))
}

const KEY = 'webdaq-demo:v1:lang'

/** ?lang=it (or en) wins and is remembered for the tab; otherwise the remembered one, else English. */
export function currentLang(): Lang {
  if (typeof window === 'undefined') return 'en'
  let q: string | null = null
  try { q = new URLSearchParams(window.location.search).get('lang') } catch { /* no location */ }
  if (q === 'it' || q === 'en') { try { sessionStorage.setItem(KEY, q) } catch { /* ignore */ } return q }
  try { const s = sessionStorage.getItem(KEY); if (s === 'it' || s === 'en') return s } catch { /* ignore */ }
  return 'en'
}

export function setLang(l: Lang) {
  try { sessionStorage.setItem(KEY, l) } catch { /* ignore */ }
  window.dispatchEvent(new CustomEvent('webdaq-demo:lang', { detail: l }))
}

export const BASE = process.env.NEXT_PUBLIC_DEMO_BASE_PATH || ''
/** The site that hosts the demo: its base path is the demo's minus /webdaq-demo. */
export const SITE_BASE = BASE.replace(/\/webdaq-demo$/, '')
export const aboutHref = (l: Lang) => `${SITE_BASE}${l === 'it' ? '/it' : ''}/software/webdaq/`
