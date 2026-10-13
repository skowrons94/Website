# WebDAQ in-browser demo

The real WebDAQ frontend, at the commit pinned in `pin.json`, built as a static
site. Every server call is answered by a **simulated backend in a Web Worker**
inside the page. Nothing here talks to real hardware, and no request leaves the
page's origin. Design: `/tmp/claude-0/webdaq/design.md` (planning document).

## Layout

| Path | What |
|---|---|
| `pin.json` | WebDAQ repo + commit, sha256 of every upstream file the overlay replaces, JSROOT version and integrity, API-surface hash |
| `package.json`, `package-lock.json` | WebDAQ's dependencies, pruned and pinned exactly, plus the demo's build and test tools |
| `build.mjs` | fetch the pinned frontend → `.work/`, check the overridden hashes, apply `overlay/`, bundle the worker and JSROOT, `next build`, copy `out/` → `../public/webdaq-demo` |
| `overlay/` | files copied over the WebDAQ tree (design §2.3) |
| `shim/` | main thread: axios adapter (`axios-demo.ts`), fetch shim, storage shim, worker transport, JSROOT loader. Worker side: Werkzeug-like router and the handlers (`handlers/<family>.ts`) |
| `sim/state/` | the simulated DAQ: boards, registers, run state machine, metadata, histogram config, current, stats, notifications; the worker entry |
| `sim/physics/` | the physics engine (sources → detector → DPP → spectra), behind `sim/physics/api.ts` |
| `jsroot/` | esbuild entry of the trimmed, self-hosted JSROOT |
| `scripts/size.mjs`, `budgets.json` | gzip size report and budgets (design §6.4) |
| `tests/contract/` | the API contract (design §2.4), the state-machine tests, and `runtime.py` (every page in Chromium) |
| `api-surface.json` | every frontend → server call at the pin (186 method/path pairs), from `tests/contract/surface.ts` |

## Build

```sh
cd webdaq-demo
npm ci --ignore-scripts                              # nothing here needs an install script
node build.mjs                                       # → ../public/webdaq-demo, basePath /webdaq-demo
DEMO_BASE_PATH=/Website/webdaq-demo node build.mjs   # GitHub Pages
node build.mjs --out /some/dir                       # elsewhere
WEBDAQ_SRC=/path/to/webdaq node build.mjs            # use a local clone instead of GitHub
node scripts/size.mjs ../public/webdaq-demo          # size report, fails over budget
npm run test:contract                                # API contract + state machine (needs .work/webdaq: any build, or --fetch-only)
npm run test:physics                                 # physics suite
npm run test:files                                   # run files: formats, metadata keys, .caendat read back
python3 tests/shell/shell.py ../public/webdaq-demo /webdaq-demo --axe <axe.min.js>   # the demo frame
npx tsc --noEmit                                     # handlers type-check against WebDAQ's own types
python3 tests/e2e/tour.py ../public/webdaq-demo /webdaq-demo --start /   # the guided tour, a run, its files
python3 tests/contract/runtime.py ../public/webdaq-demo /webdaq-demo   # every route and tab in Chromium, and the
                                                     # scan → add → start → stop flow: no unmocked request,
                                                     # nothing outside the origin, no page error
                                                     # (it waits for Next's RSC prefetches before each
                                                     # page.goto; --rsc-delay 1.5 --no-settle reproduces
                                                     # the aborted-prefetch race it guards against)
npm run surface                                      # after a bump: rewrite api-surface.json, then copy its hash to pin.json
```

None of these writes anything committed (except `npm run surface`, on purpose)
and none uploads anything.

**Updating WebDAQ.** Set `commit` in `pin.json`, run `node build.mjs`: it
stops on every overridden upstream file that changed; compare it with the
overlay's copy, update the overlay and the hash. Then `npm run surface` (and
the hash it prints into `pin.json`), the tests above, and the size report.

### Deployment

* **GitHub Pages** (`.github/workflows/pages.yml`, the existing build job):
  `DEMO_BASE_PATH="$BASE_PATH/webdaq-demo" node build.mjs` into
  `public/webdaq-demo/` before the site's export, then the size report (fails
  over budget). The fetched WebDAQ source is cached by its commit. The site's
  `scripts/csp-static.mjs` gives the demo's pages the site's
  Content-Security-Policy too (the demo needs no eval and no inline script
  beyond Next's own, which are hashed); `scripts/seo-pages.mjs` leaves them
  out of the sitemap, and they say `noindex`.
* **Docker** (`deploy/Dockerfile.web`, stage `webdaq-demo`): built with
  basePath `/webdaq-demo` and copied into the image's `public/webdaq-demo/`;
  `deploy/Caddyfile` maps directory addresses to their `index.html` (Next's
  server does not) and marks `_next/static` immutable.
* **The companion page** (`/software/webdaq/`, `components/pages/webdaq.tsx`)
  links to `${BASE_PATH}/webdaq-demo/` (`?lang=it` from the Italian page).

## What the overlay changes (design §2.3)

| # | Upstream path | Overlay |
|---|---|---|
| 1 | `next.config.mjs` | static export, `basePath` from `DEMO_BASE_PATH`, `NEXT_PUBLIC_API_URL='demo:'`, `axios` → `shim/axios-demo.ts` |
| 2 | `src/app/api/**`, `src/api/**` | deleted; their two endpoints are answered through the fetch shim |
| 3 | `src/app/logbook/[run_number]/layout.tsx` | added: `generateStaticParams` for runs 1–30 |
| 4 | `src/app/layout.tsx` | no `root.cern` script; storage shim inline in `<head>`; `<DemoBoot>` (the shell of P4 mounts here) |
| 4b | `src/app/page.tsx` | empty: the start page is drawn by the demo frame (`shell/StartPage.tsx`) |
| 6 | `src/lib/load-jsroot.ts` | re-exports `shim/load-jsroot.ts` (a webpack alias cannot win over tsconfig paths) |
| 7 | `package.json` | dependencies live in this directory's `package.json` |
| 8 | `src/components/histo-dashboard.tsx` | patched in place by `build.mjs` (`PATCHES`, two edits, each found exactly once): a changed x axis (the in-beam HPGe gain) rebuilds the plot instead of refreshing only the bins |

`pin.json.overrides` holds the upstream sha256 of each of these at the pin.

JSROOT is self-hosted: `jsroot@7.11.2` from npm (integrity in `pin.json`), the
seven functions WebDAQ uses (`jsroot/entry.mjs`), split by esbuild. three.js
(reached by the 2-D painters through `base3d`) and jsPDF are replaced by inert
stubs at bundle time: WebDAQ draws neither 3-D nor PDF.

`build.mjs` stops if any upstream file the overlay replaces changed at the pin
(`pin.json.overrides`); look at the diff, update the overlay, then the hash.

## How a request flows

```
WebDAQ component → api.ts (unchanged) → axios ─(alias)→ shim/axios-demo.ts adapter ─┐
fetch('/api/server-control' | '/api/cache') → shim/fetch-shim.ts ───────────────────┤ postMessage
                                                                                    ▼
                    Web Worker: sim/state/worker.ts → shim/router.ts → shim/handlers/*.ts
                                                     → sim/state (DAQ state machine) → sim/physics
```

* The router compiles Flask rule syntax (`<x>`, `<int:x>`, `<path:x>`) and orders
  rules as Werkzeug does: per segment, static before `int` before default before
  `path`; a path that matches only under another method answers 405. Unknown
  paths answer 404 `{message:'Not Found'}` and are recorded as misses
  (`window.__webdaqDemo.misses()` in the page).
* Only routes that exist in the registered Flask blueprints (or the two Next
  route handlers) have mock handlers; `tests/contract` checks this both ways.
* Simulated time advances in 50 ms ticks. The seed comes from `?seed=` or is
  drawn once per tab; sessionStorage (`webdaq-demo:v1:*`) holds the snapshot,
  written every 5 s and before any change is acknowledged.
* The worker is an ES module, split by esbuild: the first chunk holds the router,
  the DAQ state machine, the handler families every page polls, and the physics.
  The Logbook (`/data/…`), ELOG/Grafana, notification-settings and trace
  (`/waveforms/<trace>/<board>/<ch>`) families, `lines.json` and each detector's
  response table are chunks loaded when first needed.
* `Daq.advance()` has a time budget (200 ms of wall time per call): if the ticks
  cost more than real time, the rest of the gap is taken in one longer step, so the
  server keeps answering and the simulation degrades instead of falling behind.
* `window.__webdaqDemo` exposes `misses()`, `state()`, `control(cmd)`,
  `request(req)`, `onState(fn)`, `resetDemo()` and `log()` (the last 400
  changing requests and commands, which `tests/e2e/tour.py` prints when it
  fails) to the shell and the tests. The worker broadcasts its state summary
  every second and before it acknowledges any change, so `state()` never lags
  an acknowledged request; the Run files drawer still asks the worker
  (`control({type:'state'})`) when it opens rather than trust a broadcast.
  `control` takes `{type:'scenario', scenario}`, `{type:'fault', board_fail_at_s,
  stall_at_s}`, `{type:'fwhm', channel, energy_keV}` and `{type:'state'}`.

## The simulated DAQ (sim/state)

* One V1730 answers a probe at Optical link 0, node 0, VME 0. Its firmware is the
  scenario's (`dppFor`): adding it as the other DPP fails as a real board would.
* Starting registers are WebDAQ's test-mode defaults (`board_defaults.py`), plus:
  invert input for BGO, EJ-309 and ³He; a 4 µs long gate for ³He; for in-beam
  HPGe, trapezoid rescaling 6 and DC offset 10 %. Switching to or from the beam
  only moves those two, so the visitor's tuning survives; during a run it moves
  nothing (the spectrum and its ROIs keep their meaning) and the new gain is set
  at the next run start.
* Saving is on by default (WebDAQ's default is off) so every run is recorded.
  Run numbers stay within 1–30 (the exported Logbook pages).
* Refusals as upstream: start while running (404), start without boards (404),
  scan or refresh while running (409/400), duplicate board id (409), registers not
  safe online (saved, not written, with the reason).
* Alerts: the demo starts with a `board_failure` and a `stalled_buffers` rule
  (20 s), and the in-beam scenario seeds a `beam_current` rule; all three are
  evaluated locally, and every delivery is marked failed ("nothing leaves your
  browser"). ELOG and Grafana answer "not configured".
* Faults (Scenario panel): a board that sets its FAIL flag sends no more data
  until the run is restarted (by auto-restart, if on); a stalled board sends
  none without the flag.
* Rules, transports, the watcher and recovery (`shim/handlers/notify-settings.ts`)
  are a lazy family too; the bell's event routes stay in the first chunk.

## Run files (sim/files, phase P3)

Nothing per event is stored. A finished run's directory is regenerated on demand
from its record: seed, scenario, the register file at start, the timeline of
register writes and scenario changes during the run, its demo-time span and the
wall-clock time it started. Everything in it follows that history (the beam in
`current.txt` is on only while the run's scenario had it on), so the files of a
finished run never change, whatever happens afterwards, reloads included; only
editing the run's metadata (flag, notes, target) updates `metadata.json`, as on
the real server. `metadata.json → Demo` gives the starting scenario, every change
during the run (`changes during the run`: scenario or register, with its run
time) and, for an in-beam run, the yield factor the rate was multiplied by.

Every file says it is simulated: `stats.csv` and `current.txt` carry a
`# SIMULATED DATA — …` comment line, `events.csv` starts with one (read it with
`comment='#'`), `roi.json` and `metadata.json` have `simulated: true`. The
`.caendat` keeps CaenDAQ's format, which has no free field we could use without
risking RUReader: its name (`.sim.caendat`), `metadata.json` and `README.txt` mark
it. A ROOT file converted from it carries no marker.

| File | Written like |
|---|---|
| `run_<N>_0000.sim.caendat` | CaenDAQ: XDAQ header (`DataFileHeader.hpp`), x730 board aggregates, extras option 2 (47-bit time stamps, 2 ns ticks); first 50 000 events; no traces |
| `events.csv` | RUReader's tree columns: `Board,Channel,Timestamp_ps,Energy` (PHA) or `EnergyShort,EnergyLong` (PSD), `PU,SATU,LOST` |
| `V1730_0.json` | the register dump copied at run start |
| `current.txt` | `mock_current.py` and the real modules, 10 Hz, four channels |
| `stats.csv` | `stats_manager.py`, plus `# SIMULATED DATA — …` |
| `roi.json` | `roi_analysis.build_snapshot` at stop |
| `metadata.json` | `run_metadata_snapshot.build_run_metadata_snapshot`, key for key, plus `Demo` |
| `README.txt` | what each file is, how to convert, what FAIR means here |

The events come from a fresh physics engine replaying the run (`replay.ts`,
through the engine's `eventSink`), so the file is statistically the run that was
taken, not a copy of the live spectrum. The writers are a lazy worker chunk:
the Logbook's handler family imports them (`setRunFileProvider` gives the real
sizes) and the shell's `control({type:'files', run})` returns the bytes.

## The demo frame (shell/, phase P4)

* `shell/Shell.tsx`, mounted by the overlaid layout: the banner (role region
  "Demo notice", 40 px, sticky; WebDAQ's sticky header moves below it), the
  not-in-demo notes per route (dismissal kept for the tab), and on demand the
  Run files drawer (`RunFiles.tsx`, zip through `zip.ts` = fflate's `zipSync`)
  and the Scenario panel (`ScenarioPanel.tsx`: detectors, source, distance,
  activity, background level, beam current, the two faults).
* `shell/StartPage.tsx` is the start page; below 768 px it first explains that
  WebDAQ is a desktop interface (*Continue anyway* / *Read about WebDAQ*).
* EN/IT: `?lang=it` or the banner switch; Italian strings load on demand
  (`strings-it.ts`), panel strings live with the panels.
* Look: `shim/tokens.css`, the site's surface tokens (checked against
  `app/globals.css` by `tests/shell/tokens.test.ts`); WebDAQ's own pages keep
  their Inter font (a 48 kB woff2, self-hosted by Next); light and
  dark follow the `theme` key the site and WebDAQ share.
* The start page is drawn by `Shell.tsx` on `/` (the overlay's `page.tsx`
  returns null), which keeps that route's first load small.
* `tests/shell/shell.py` checks all of this in Chromium, including axe-core on
  the frame (pass `--axe` the path of an `axe.min.js`; nothing is installed).

## The guided tour (tour/, phase P5)

* `shell/tour-loader.ts` defines `window.__webdaqTour(lang, resume)` and
  fires `webdaq-demo:tour-ready`; the tour itself (`tour/index.ts`, strings in
  `tour/copy.ts`, EN and IT) is a separate chunk loaded on the first click of
  *Take the guided tour* or the banner's *Guide*.
* Nine steps: choose detectors, find the board (scan, add a V1730 as DPP-PHA
  or DPP-PSD), the configuration, start a run, watch it fill, tune (HPGe:
  trapezoid, PSD: the gates, both in `/tuner`; Online asks for confirmation
  during a production run, and tour.py answers it), an ROI, the Scenario panel
  (distance, source, faults), and the run files with what makes them FAIR-ready
  (`metadata.json`, the Logbook) and what is still planned.
* It is a non-modal card (a bottom sheet below 768 px) that highlights the
  control it talks about and checks each step against the worker's state, so a
  step done by hand counts too. *Do it for me* does the step. Live lines
  (rates, FWHM at the main line from the model and the fit, gates, distance)
  are announced politely. Progress is kept in sessionStorage
  (`webdaq-demo:v1:tour`) and resumes after a reload.
* Choosing ³He on the start page selects the ²⁵²Cf source, the only one it sees.
* `tests/e2e/tour.py <out> <base> --start / [--lang it] [--width 390]
  [--detectors he3]` runs it end to end in Chromium (with `--start
  /software/webdaq/` on the site export it starts from the companion page).

## Sizes (gzip -9, this build)

First-load JS at WebDAQ 0ab65e1 (LUNADAQ round 2): start page 116.9 kB
(budget 120), `/dashboard` 251.2 kB (budget 400; the refreshed dashboard loads its
tabs lazily), other routes 117–267 kB; demo shell 8.0 kB (budget 25); worker first
chunk 39.7 kB (budget 40), plus 15.3 kB of lazy chunks (Logbook and run files,
ELOG and Grafana, notification settings, traces); response table + line data 39 kB per
detector; JSROOT needed to draw 297 kB (budget 360); zip 4.6 kB (budget 10);
tour 11.6 kB (budget 20).
`node scripts/size.mjs <export>` prints the table.

## Traces and probes (sim/physics/traces.ts)

One capture per request for trace 1 or 2: the pulse of the channel's last accepted
event at the ADC, then what the firmware selected in Board Configuration (0x8000)
shows, all from that one event; the probe requests that follow reuse it (up to 2 s
of demo time), so the Tuner's overlay lines up.

* DPP-PHA: trace 1 Input / RC-CR / RC-CR² / Trapezoid [13:12]; trace 2, with Dual
  Trace [11], Input / Threshold (the trigger threshold on the RC-CR² scale) /
  Trapezoid − Baseline / Baseline (the baseline-mean window, held from the pulse
  until it has left the window) [15:14]; digital probe 1 [23:20]: Peaking (where the
  energy is sampled, Peak Mean samples wide), Armed, Peak Run, Baseline Freeze, TRG
  Hold-off, Zero Crossing Window; digital probe 2: Trigger.
* DPP-PSD: trace 1 Input or CFD (fraction and delay from CFD Settings 0x1n3C), trace
  2 with Dual Trace the baseline or the CFD [13:12]; the trigger is the leading edge
  at the threshold, or the CFD zero crossing with Discrimination Mode (0x1n80[6]) on;
  digital probes (with Enable Digital Probe [31]) Long Gate, Short Gate, Over
  Threshold, Shaped TRG, TRG Hold-off, Baseline Freeze, PSD Cut High, Trigger.
* Digital probes are 0/1 drawn on trace 1's scale (low at its baseline, high a
  quarter of its span above; probe 2 a little lower), so they overlay it. What needs
  coincidences, validation or a full memory stays low.
* WebDAQ's server at the pin answers trace 2 and the probes with an empty histogram
  (`utils/spy.py`: "Trace 2 is not available"); the demo is ahead of it, for the
  Tuner redesign. The endpoints and response shapes are the server's.
* The CFD shapes the CFD trace and the trigger time; it does not change the
  simulated charges (an EJ-309 pulse rises in about 1 ns, so the gates hardly move).

## Noise triggers inside the noise

A threshold inside the noise (EJ-309 at 8 LSB: about 6 MHz of crossings per
channel) is no longer drawn crossing by crossing. Above 500 per channel and tick,
only the crossings the trigger hold-off lets through are generated (a renewal
process), at most 500 of them; the rest are counted: offered rate, dead time,
events the readout keeps or loses. The kept ones fill the spectra in bulk like the
simulated noise events of that tick, so the counters and the spectra still agree.
`tests/physics/tuner.test.ts` checks a tick stays cheap there, and that events,
pile-up and saturation counts match what reaches the spectra.

## Known upstream behaviour the demo shows as it is

* No React hydration errors since the ui-refresh pin (an AuthGate per page);
  `runtime.py`, `shell.py` and `tour.py` now fail on any page error.
* `GET /histograms/rebin` (405), `/qlong/…`, `/qshort/…`, `/faraday/…` (404) fail
  in the demo exactly as they would against the server.

## Physics interface

The state machine (`sim/state`) and the physics engine (`sim/physics`) meet only
in **`sim/physics/api.ts`**. It declares the types and exports:

| Export | Called by the state machine when | Returns |
|---|---|---|
| `createPhysics(seed)` | the worker boots or the demo is reset | a `PhysicsEngine` |
| `engine.configure(scenario, board)` | run start, scenario change, every register write | — |
| `engine.clear()` | run start, `POST /experiment/reset` | — |
| `engine.tick({t_s, dt_s, beamCurrent_uA})` | every 50 ms tick while running | `TickResult`: per channel `{offered, events, pileup, lost, saturated, dead_s}`, board `bytes`, `blocksDropped` |
| `engine.spectrum(ch)` | `GET /histograms/<b>/<ch>`, ROI integrals, `roi.json` | live `Uint32Array` (32768 PHA energy / 65536 PSD Q_long) |
| `engine.psd(ch)` | `GET /psd/<b>/<ch>` | `Uint32Array` 2048 × 256, x fastest, or null |
| `engine.waveform(ch)` | `GET /waveforms/1/<b>/<ch>` while running with waveforms on | `Int16Array` (probe of `0x8000[13:12]`), or null |
| `engine.beamSample(t_s)` | 10 Hz beam sampling (current, charge, `current.txt`); `t_s` is demo time, and the result must be a pure function of (seed, scenario, t_s) | `[target, coll1, coll2, idle]` µA |
| `engine.calibration(ch)` | once, when the board is added: seeds `calib/V1730_0.cal` | `[offset, slope]` keV per bin |
| `engine.fwhmProbe(ch, E)` | the tour's live line | `{energy_keV, centroid_keV, fwhm_keV, counts}` or null |
| `engine.snapshot()` / `restore()` | sessionStorage snapshots | JSON-serialisable |
| `th1f`, `th2f`, `emptyTH1F`, `waveformTH1F` | every histogram/trace response | TBufferJSON-shaped objects for `JSROOT.parse` |

`BoardView` is a read-only view of the register file (`chReg(0x10XX, ch)`,
`reg(0x8000)`, `channelEnabled`, `waveformsEnabled`, `dpp`, `nChannels`,
`nsPerSample`). `Scenario` is the visitor's choice: detectors
(`hpge` → DPP-PHA; `bgo`, `ej309` liquid scintillator with n/γ PSD, `he3` →
DPP-PSD, see `dppFor`), source (`co60`, `cs137`, `background`, `n14pg`,
`ambe`, `cf252`), source–detector distance in cm (free, 1–50), activity,
background level, yield factor, beam I0. The state machine stores it, puts it
in `metadata.json → Demo.scenario`, re-creates the board with the right DPP
when the detector kind changes, and passes it to `configure()` unchanged.

What stays in the state machine: rebinning (`POST /histograms/rebin`), the
calibration's axis limits, the "SIMULATED — …" titles, the "why is it empty"
titles, ROI integration, charge integration (Σ I·Δt), rate windows
(`/experiment/stats`), board-health counters, Graphite-like metrics.

The bodies in `api.ts` are the P1 placeholder (flat spectra, flat trace,
constant beam). The physics phase replaces them and keeps the signatures; a
signature change is agreed in this section first. Rules: deterministic for a
seed (no `Math.random`, no `Date.now`), no DOM, no imports from `shim/`.

## Physics simplifications to know

* ⁶⁰Co summing uses the 4→2→0 angular correlation with Legendre coefficients
  a2 = 0.1020, a4 = 0.0091: W(0°) = 1 + a2 + a4 = 1.111 relative to the
  average.
* ³He: a constant intrinsic efficiency of 0.5 for the neutrons of a moderated
  ²⁵²Cf source (no moderator is modelled; the counting rate follows the solid
  angle), and the wall effect splits 50/50 between proton and triton escapes
  (in a real tube the longer-range proton escapes more often, closer to 3:1).
  Both are declared illustrative in `lines.json`.
* In-beam ¹⁴N(p,γ)¹⁵O: the thick-target yield times `yield_factor` (20 by
  default), declared in the Scenario panel and in `metadata.json → Demo`.
* A Peaking Time past the flat top samples the energy on the falling edge: the peak
  moves down and broadens with the trigger jitter.
* The tour's live FWHM fits a copy of channels 0 and 1 that counts only events
  taken with the present settings (it restarts at every change of the filter
  parameters) and stays silent below 400 counts in the peak, so a spectrum
  filled before and after tuning is never fitted as one peak.

## Labelling

Every page says it is a simulation (the banner: "WebDAQ demo — simulated …").
The histograms the server returns are titled `SIMULATED — …`; WebDAQ's
dashboard shows its own label ("Board 0 - Channel 0") above them instead. The 3.5 MV accelerator is "the MV machine of the Bellotti Ion
Beam Facility (BIBF)".
