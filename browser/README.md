# AZURE2 in the browser

The static build of the site (GitHub Pages) has no server. Instead, the AZURE2
engine is compiled to WebAssembly and runs in the visitor's browser, in a Web
Worker, with [Pyodide](https://pyodide.org) providing Python.

Nothing of the evaluation API is rewritten for this. The worker runs the
server's own code: pyazr, the Flask application in `server/app/`, its routes,
sessions and serializers. Each request from the page goes to Flask's test client
inside the worker instead of over HTTP (`bridge.py`). A change to the server is
therefore a change to the static site too.

## The pieces

```
azure2/build.sh     compile pyazr's engine module (_azure2) to WebAssembly
azure2/omp.h        single-thread stand-in for OpenMP
precompute.py       run every evaluation natively at its shipped parameters
assemble.py         lay out public/azure2/: Pyodide, the engine, the evaluations
worker.js           a Web Worker: loads everything, answers requests
bridge.py           the Flask app in the worker, with an in-process engine,
                    and the per-role calculations of the other workers
../lib/browser-engine.ts   the page's side: the workers, and which asks what
```

The site is built in this mode with `STATIC_EXPORT=1 API_BASE=browser`. In
`lib/api.ts`, `API_BASE=browser` sends every request to the worker instead of to
a server. The list of evaluations is a static file (`index.json`), so browsing
the list never starts the engine.

## What differs from the server

**First paint without Python.** The scheme, the data and the smooth curves at
the published parameters (`evaluations/<id>/initial.json`) and the published
extrapolations (`evaluations/<id>/extrapolations.json`) are static files the
page fetches itself (`browserRequest` maps `/initial` to them), so the plot is
up in well under a second, before any worker has started; the sliders come
alive when the model has opened.

**One worker per model.** A page cannot start processes, so each model lives
in a worker's interpreter (`InProcessEngine`, with the interface of
`server/app/engine.py`'s `Engine`), and each worker handles one request at a
time, which is what pyazr's per-call change of working directory requires.
AZURE2 keeps state across the models of one interpreter -- only the one
initialised last calculates right -- so a single worker holding the data and
the smooth-curve models initialised each again whenever the other had been
used: 3 s + 18 s on every ⁷Be edit. As on the server, where each role is a
process, the page runs one worker per role (`lib/browser-engine.ts`):

| worker | holds | started |
|---|---|---|
| `azure2-data` | the Flask app (sessions, serializers) and the data model | on opening |
| `azure2-fine` | the smooth curves' model | once the data worker has the files |
| `azure2-extrap` | the extrapolations' model | likewise, built alongside |
| `azure2-grid` | the energy × angle grids' model | when a grid is first shown |

The data worker answers `500 {code: "delegate", role}` for what another
calculates (`app.engine.Delegated`). The page then has that role's worker
calculate it (`bridge.role_calc`) at the session's parameters -- it keeps a
copy, edited in step with the data worker's (same rules as
`Session.begin_edit`) -- hands the pickled result to the data worker
(`bridge.inject`, kept only if those are still its parameters) and asks again.
An edit's smooth curve is calculated alongside its data; a burst of edits
calculates only the latest parameters. ⁷Be: an edit 22 s → 1.5–2 s.

Each worker is a Pyodide of its own, about 150–250 MB (⁷Be's three: about
0.6 GB; four with a grid open). The files are downloaded once: the role
workers start when the data worker has the runtime and the evaluation, the
zips are kept in the Cache Storage under the hash `assemble.py` writes to
`manifest.json` (a new build is fetched anew), and Pyodide's own files come
from the browser's HTTP cache.

**One thread.** WebAssembly side modules have no OpenMP; `omp.h` makes every
parallel region run on one thread, so the engine calls take 2–6× what they take
on the server.

**Precomputed results.** `precompute.py` warms a copy of every evaluation
exactly as the server's `make warm` does (`server/app/warm.py`): the data,
smooth-curve, extrapolation and energy × angle grid results at its shipped
parameters go to `precomputed.json` (`server/app/cache.py`), calculated
natively by the same build the server uses. While a session's parameters are
unchanged, these are returned; the first edit switches to the engine. They are
matched by the model's fingerprint, not by comparing the parameters: the
WebAssembly engine reads 90 of ²⁴Mg's parameters back a few ulps (up to
5·10⁻⁸ relative) away from the native one, and an exact comparison never hit —
²⁴Mg computed everything in the page and ⁷Be did not finish in 45 minutes.
Now ²⁴Mg's data, curves and extrapolations come in 0.1–0.2 s each.

Building the derived models also leaves AZURE2's external-capture integrals of
their grids (`datamodel/`, `fine/`, `extrapolations/`), which ship with the
evaluation, so the engine in the page reads them rather than recalculating
them. What the page never reads is left out of `evaluations/<id>.zip`
(`assemble.py`): AZURE2's `checks/` (shipped as empty directories), the
evaluation's own extrapolation integrals when a derived model calculates the
extrapolations, and `initial.json` — the scheme, data and smooth curves at the
shipped parameters with the server's typical timings (`server/app/initial.py`),
which is published next to the zip as `evaluations/<id>/initial.json` for the
page to fetch before the worker has even started. ⁷Be's zip went from 9.5 to
6.0 MB, ¹⁴N's from 5.7 to 1.6 MB.

The models are prepared in the background as on the server, each in its own
worker: the data model as soon as the session opens, the smooth curves' and
the extrapolations' as soon as their workers have started. After an edit the
previous smooth curve stays up, faded, until the new one is calculated.

**Numbers.** The WebAssembly engine and the native one agree to better than
10⁻⁶ (relative) on ¹³N, ¹⁴N, ²¹Na, ²³Na and ²⁴Mg. On ⁷Be, ⁸Be and ¹⁷F they
differ by up to 10⁻⁴–2·10⁻³ at some points; see the note below. Results at
the shipped parameters are the native ones in both builds.

### Why ⁷Be, ⁸Be and ¹⁷F differ

The difference comes from AZURE2, not from WebAssembly. AZURE2 takes the energy
derivative of the shift function, dS/dE, by finite differences:

- in `CoulFunc::PEShift_dE` (open channels) with an absolute step of 10⁻⁶ MeV;
- in `ShftFunc` (bound channels) as a derivative of a derivative, with steps of
  10⁻⁴ fm and 10⁻⁶ MeV.

The Coulomb functions it differentiates are accurate to about 10⁻¹⁰ (the
Bulirsch–Stoer tolerance in `cwfcomp`). Divided by 10⁻⁶, that error becomes
about 10⁻⁴ in dS/dE, and its pattern differs between any two maths libraries.

Some examples, compared with mpmath:

| quantity | native | WebAssembly | mpmath |
|---|---|---|---|
| ⁸Be, l = 0 at 40.09 MeV: dS/dE | 4.42·10⁻⁴ | 2.42·10⁻⁴ | 2.609·10⁻⁴ |
| ¹⁷F ground state, l = 2: dS/dE | 0.237646 | 0.237399 | 0.2376758 |
| ²¹Na subthreshold state, l = 0: dS/dE | 0.4477 | — | 0.40421 |

The error enters wherever widths are converted to reduced widths, so the
results inherit it.

A three-file patch fixes this (`azure2/shift-derivative.patch`):

- five-point derivatives with relative steps;
- the Whittaker-function log-derivative from its closed form.

With it, the two builds agree to better than 10⁻⁸ on every evaluation, and
dS/dE matches mpmath to 10⁻¹¹. It also changes the native results, by up to 5%
(²¹Na) and 0.6% (¹⁷F). It belongs upstream in AZURE2, followed by a re-check of
the published fits; it is not applied here, so that the site keeps running the
pinned AZURE2.

## Building locally

Requirements: [emsdk](https://emscripten.org/docs/getting_started/downloads.html)
at Emscripten 4.0.9 (the version Pyodide 0.28 was built with), a native pyazr
(`deploy/Dockerfile.azure2` shows how), Python with `pybind11`, `numpy`, `flask`
and `flask-cors`, and Node.

```sh
source /path/to/emsdk/emsdk_env.sh
browser/azure2/build.sh build/wasm                     # about 4 minutes
python browser/precompute.py server/evaluations build/azure2/evaluations

mkdir -p build/pyodide
curl -sSL https://github.com/pyodide/pyodide/releases/download/0.28.3/pyodide-core-0.28.3.tar.bz2 \
  | tar -xj -C build/pyodide --strip-components=1
curl -sSL -o build/pyodide/numpy-2.2.5-cp313-cp313-pyodide_2025_0_wasm32.whl \
  https://cdn.jsdelivr.net/pyodide/v0.28.3/full/numpy-2.2.5-cp313-cp313-pyodide_2025_0_wasm32.whl

python browser/assemble.py --pyodide build/pyodide \
  --numpy build/pyodide/numpy-2.2.5-cp313-cp313-pyodide_2025_0_wasm32.whl \
  --module build/wasm/_azure2.cpython-313-wasm32-emscripten.so \
  --pyazr build/wasm/AZURE2/pyazr \
  --evaluations build/azure2/evaluations --out public/azure2

STATIC_EXPORT=1 API_BASE=browser npm run build        # writes out/
python -m http.server -d out                           # http://localhost:8000
```

Set `BASE_PATH=/<repository>` for a build served from a subdirectory, as
GitHub Pages does for a project site; the workflow sets it automatically.

The AZURE2 commit is read from `deploy/Dockerfile.azure2`, so the browser and
the server always build the same engine. Updating Pyodide means updating the
Emscripten version with it (`PYODIDE` and `EMSCRIPTEN` in the workflow; the
pairs are listed in Pyodide's `Makefile.envs`).
