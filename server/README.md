# The AZURE2 API

Flask + waitress, one set of AZURE2 worker processes per visitor session
(`app/engine.py`, `app/session.py`). The same app runs in the browser build
through Pyodide (`browser/bridge.py`). README.md ("A new evaluation") explains
the models; this file is the wire contract and how the server schedules work.

## Endpoints

All under `/api`. JSON in and out; errors are `{"error": "...", "code": "..."}`.

| Method and path | What | Notes |
|---|---|---|
| `GET /evaluations` | the list | |
| `GET /evaluations/<id>` | one evaluation | |
| `GET /evaluations/<id>/download` | the `.azr` file | |
| `GET /evaluations/<id>/initial` | **no session**: what the page draws first (below) | `?parts=scheme,data,fine` trims it; 404 `code: "not_prepared"` if `make warm` (or a first session) has not written it yet |
| `POST /evaluations/<id>/open` | start a session → 201 `{session_id, evaluation, scheme, n_data_segments, n_extrapolations, generation, heartbeat_interval, timings}` | **503** `code: "busy"` + `Retry-After` when every slot is in use |
| `POST /sessions/<sid>/ping` | heartbeat → `/status` body | send every `heartbeat_interval` s (30) while the page is visible |
| `GET /sessions/<sid>/status` | `{prepared, preparing, running, busy, modified, generation, fine_ready}` | `preparing` is `"data"`, `"fine"`, `"extrap"`, `"grid"` or null |
| `GET /sessions/<sid>/scheme` | levels and channels | |
| `GET /sessions/<sid>/data` | data segments with the model at the data | |
| `GET /sessions/<sid>/fine` | the smooth curves `{curves, segments}` | |
| `POST /sessions/<sid>/parameters` | edit → `{scheme, data, fine?, generation, superseded?, seq?}` | body `{"updates": {"<free_index>": value}, "seq"?: n, "on_superseded"?: "skip"}` |
| `POST /sessions/<sid>/reset` | back to the shipped values; same answer | body `{"seq"?, "on_superseded"?}` |
| `GET /sessions/<sid>/extrapolations` | every extrapolation segment | |
| `GET /sessions/<sid>/extrapolations/<index>/grid?view=angles\|map` | an energy × angle grid, on request | only for a segment whose `grid` is set |
| `GET /sessions/<sid>/extrapolations/download.csv` | CSV, full precision | `?segments=0,2` |
| `POST /sessions/<sid>/prepare` | build derived models and **wait** → `{prepared: [...]}` | body `{"steps": [...]}`; optional now (the server prepares by itself) |
| `DELETE /sessions/<sid>`, `POST /sessions/<sid>/close` | close (the POST is for `sendBeacon`) | |
| `GET /health`, `GET /sessions` | load, no ids | |

Status codes: **409** `code: "expired"` — the session is gone (reaped,
evicted, worker died): reopen and re-apply the edits. **503** `code: "busy"`
with `Retry-After` (seconds, also in the body as `retry_after`) — every slot
is serving a visitor; retry after that long, do not reopen in a loop. **500**
`code: "worker"` — one derived worker failed; the session is fine and the next
request starts it again (`code: "delegate"` is the in-browser build's own,
see browser/README.md). 400 for a malformed request.

`/open` also says whether the session came from a spare and what is
prepared (`from_spare`, `prepared`, `preparing`, `builds`); `/status` and the
heartbeat add `preparing_elapsed` and `pending` (steps still to build) and
`builds` (model builds running on the machine): the page's timer scales its
estimate by them. `GET /evaluations/<id>/initial/extrapolations` gives the
extrapolations at the shipped parameters, which the page shows faded while a
visitor's own are calculated.

### Edits: the latest wins

Edits are numbered (`generation`) as they arrive and applied to the parameters
at once, in arrival order. An edit still waiting for its calculation when a
newer one arrives is **not calculated**. It answers **200** with
`"superseded": true` and, by default, with the *newer* edit's result (scheme,
data, fine of the latest parameters), so an older page still shows the latest
state. With `"on_superseded": "skip"` it answers at once with only
`{"superseded": true, "generation": n}`; a page that keeps one request in
flight and coalesces the rest should send that and ignore the answer. Pass
`seq` (your own increasing counter) and an edit that arrives after a later one
is ignored rather than overwriting newer values; `seq` is echoed back.

### What the server does on its own

- **Background preparation.** As soon as a session opens it builds, in order,
  the split data model, the smooth-curve model and the extrapolations' model
  (`AZURE2_AUTO_PREPARE`), each in its own worker and holding only that
  worker's lock. An edit needs the data worker (and, if built, the fine one),
  so it never waits for the extrapolations; a step does not start while an
  edit is being calculated. Until `fine` is prepared an edit's answer has no
  `fine` (ask `/fine`, which waits for it); `/status` says what is under way.
- **Spare sessions.** For the slow evaluations (⁷Be, ²⁴Mg) one session is kept
  opened and prepared, at the shipped parameters and never used, and handed to
  the next visitor (`AZURE2_SPARES`, see config.py). Their first edit then
  takes what any edit takes: ⁷Be 2.0 s, ²⁴Mg 2.4 s, against 65 s and 23 s.
  The visitor comes first: a replacement is built only once no visitor's own
  session has been opening or preparing for 2 s, one spare at a time, and a
  spare being built is paused (SIGSTOP) while a visitor prepares. A visitor
  who arrives while a spare is being built takes it over, its preparation
  going on as theirs (`from_spare` in `/open` and `/status`), instead of a
  second build competing with it. `AZURE2_SPARES=7Be:2` keeps two.
- **Threads.** A worker computes with `AZURE2_OMP_THREADS` (1) and builds a
  model with `AZURE2_PREPARE_THREADS` (every core): AZURE2's INITIALIZE (the
  external-capture integrals) scales with threads, `update_segments` (an edit)
  does not. At most `AZURE2_PREPARE_CONCURRENCY` builds run at once.
- **Lifetimes.** A page that pings is closed `AZURE2_HEARTBEAT_TTL` (120 s)
  after the pings stop, or after `AZURE2_IDLE_TTL` (1 h) of pings without a
  request; one that never pings after `AZURE2_SESSION_TTL` (600 s) without a
  request. The extrapolations' workers are closed after `AZURE2_ROLE_TTL`
  (300 s) unused and started again when asked (a few seconds; the integrals
  are on disk). A new visitor evicts a spare of another evaluation (or stops
  one being built), then the session seen least recently -- never one seen
  (a request or a heartbeat) within `AZURE2_EVICT_AFTER` seconds (default
  60: a visible page pings every 30 s); if there is none, 503. The reaper
  rebuilds spares evicted this way once there is room.

## Payloads

- **Numbers** carry 7 significant digits (`app.serializers.DIGITS`); χ² is
  computed before rounding; the CSV export keeps all digits. NaN and ±∞ are
  `null`.
- **gzip** when the request says `Accept-Encoding: gzip` (`AZURE2_GZIP`).
  Behind Caddy both work: Caddy leaves an encoded response alone.
- **`?compact=1`** (any JSON endpoint), opt-in: an array whose entries are
  all equal is sent as `{"fill": value, "n": length}` (an extrapolation's
  `angles`, all 0°); and an edit's `data` segments leave out the measurement
  (`energies`, `angles`, `cross_sections`, `cross_sections_errors`,
  `sfactor`, `sfactor_errors`), which the page has from `/data` — merge by
  `index`.

Sizes, raw / gzip, before → after (rounding and the grids on request; `compact`
not counted):

| | data | fine | edit (with fine) | extrapolations |
|---|---|---|---|---|
| ⁷Be | 450 / 153 kB → 300 / 88 kB | 2036 / 661 → 1024 / 306 kB | 2500 / 816 → 1375 / 397 kB | 9612 / 2881 → 1449 / 415 kB |
| ²⁴Mg | 258 / 99 → 132 / 49 kB | 497 / 228 → 244 / 81 kB | 924 / — → 545 / 137 kB | 1135 / 392 → 560 / 180 kB |
| ¹³N | 112 / 45 → 69 / 25 kB | 259 / 91 → 134 / 44 kB | 379 / 136 → 211 / 69 kB | 141 / 48 → 78 / 24 kB |

### `GET /evaluations/<id>/initial`

```
{ "version": 1, "model": "<cache fingerprint>",
  "evaluation": {...}, "scheme": {...},          # as /open
  "n_data_segments": n, "n_extrapolations": n,
  "data": [...], "fine": {...},                  # as /data and /fine, shipped parameters
  "timings": { "open": s, "prepare": {"data": s, "fine": s, "extrap": s},
               "edit": s, "extrap": s, "grid": s?,      # seconds, measured by make warm
               "source": "server", "omp_threads": 1, "prepare_threads": 4,
               "cpus": 4, "measured": "2026-10-12" } }
```

The page can draw the scheme, the data and the curves from this at once and
open the session in the background; the sliders come alive with the session.
On the static build the same file is `azure2/evaluations/<id>/initial.json`
(fetch it directly, before the Pyodide worker has started). `timings` is what
the progress timer can estimate from: opening `open` (≈0 with a spare), an edit
`edit`, the extrapolations after an edit `extrap`; an edit made before the
background preparation is done also waits about `prepare.data` (data) and
`prepare.fine` (the smooth curve). In the browser expect roughly 2–6× longer
for the engine calls (single-threaded WebAssembly), plus about 5 s to start
Python the first time. `timings` may be missing (not measured yet).

### Extrapolation segments

New fields on each segment of `/extrapolations`:

- `label_plain`: the reaction with the final state, e.g. `²²Ne(p,γ₁)²³Na →
  440 keV`, `¹³C(p,γ₀)¹⁴N → g.s.`, `²²Ne(p,γ)²³Na, total`, `⁶Li(p,α)³He`; use
  it instead of repeating "Angle-integrated".
- `final_state` (`"²³Na 440 keV"`, `"²³Na g.s."`, `"all final states"`) and
  `exit_excitation` (MeV; null for a total).
- `grid`: null, or for an energy × angle grid (⁷Be's ⁶Li(p,α) 2.4–5.1 MeV ×
  0–180° and ⁶Li(p,p)) `{"n_energies": 321, "n_angles": 181, "views":
  ["angles", "map"], "angles": [20, 45, 70, 90, 110, 135, 160]}`. Its
  `energies`/`calculated` arrays are then **empty**; fetch the grid:

`GET /sessions/<sid>/extrapolations/<index>/grid?view=angles`:
```
{"index": 32, "view": "angles",
 "curves": [{"angle": 20.0, "energies": [...], "calculated": [...], "calculated_sfactor": [...]}, ...]}
```
one curve per representative c.m. angle, on the segment's own energy step (a
family of lines on the usual energy axis).

`GET /sessions/<sid>/extrapolations/<index>/grid?view=map`:
```
{"index": 32, "view": "map", "energies": [61 values], "angles": [0, 5, ..., 180],
 "calculated": [[61 values] per angle], "calculated_sfactor": [[...] per angle]}
```
row `k` is angle `angles[k]` (a heatmap: energy across, angle down); `null`
where AZURE2 gives no finite value (Rutherford scattering at 0°). Energies
c.m. MeV, angles c.m. degrees. The first request builds the grid model (⁷Be:
about 4 s, once per session); the shipped parameters come from the cache.

²²Ne(p,γ)'s total capture (²³Na) now runs from 1 keV to 2.87 MeV (472
points, 29 in the Gamow window at T₉ = 0.08) instead of stopping at 95.6 keV:
a total capture shipped on a much shorter grid than its partial captures is
extended in the derived model (`app.fine.extrap_model`; the `.azr` file is
unchanged, the shipped points are kept).

## Memory

Measured RSS of a session's workers (data + fine + extrap), after an edit and
the extrapolations:

| ⁷Be | ²⁴Mg | ¹⁴N | ²³Na | ²¹Na | ¹³N | ¹⁷F | ⁸Be |
|---|---|---|---|---|---|---|---|
| 0.87 GB (was 1.69) | 0.43 GB | 0.29 GB | 0.24 GB | 0.24 GB | 0.20 GB | 0.20 GB | 0.18 GB |

plus the ⁷Be grid worker when its grids are shown (about 0.15 GB). DEPLOY.md
turns this into `AZURE2_MAX_SESSIONS` per GB.

## Tests

```sh
cd server && PYTHONPATH=<pyazr> python3 -m pytest -q
```

`tests/test_session.py` needs no AZURE2 (a stand-in engine): per-role locks,
latest-wins, the cache under tiny float differences, 503 when full,
heartbeats, spares, rounding, gzip.
