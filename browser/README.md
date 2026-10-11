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
worker.js           the Web Worker: loads everything, answers requests
bridge.py           the Flask app in the worker, with an in-process engine
../lib/browser-engine.ts   the page's side: sends requests to the worker
```

The site is built in this mode with `STATIC_EXPORT=1 API_BASE=browser`. In
`lib/api.ts`, `API_BASE=browser` sends every request to the worker instead of to
a server. The list of evaluations is a static file (`index.json`), so browsing
the list never starts the engine.

## What differs from the server

**One process.** A page cannot start processes, so the model lives in the
worker's interpreter (`InProcessEngine`, with the interface of
`server/app/engine.py`'s `Engine`). The worker handles one request at a time,
which is what pyazr's per-call change of working directory requires.

**One thread.** WebAssembly side modules have no OpenMP; `omp.h` makes every
parallel region run on one thread. The ⁷Be extrapolations, which recompute
external-capture integrals, take about 9 minutes in Chromium against about 6 on
one native core.

**Precomputed results.** `precompute.py` stores the data and extrapolation
curves of every evaluation at its shipped parameters (`precomputed.json` next to
the model), calculated natively by the same build the server uses. While a
session's parameters are unchanged, these are returned; the first edit switches
to the engine. Running the extrapolations also refreshes AZURE2's cache of
external-capture integrals (`output/intEC.*`), which ships with the evaluation.

**Numbers.** The WebAssembly engine and the native one agree to better than
10⁻⁶ (relative) on ¹³N, ¹⁴N, ²¹Na, ²³Na and ²⁴Mg. On ⁷Be, ⁸Be and ¹⁷F they
differ by up to 10⁻⁴–2·10⁻³ at some points; see the note at the end. Results
at the shipped parameters are the native ones in both builds.

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
