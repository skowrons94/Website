"""The evaluation API, served inside the page.

On the static build (GitHub Pages) there is no server: AZURE2 is compiled to
WebAssembly as the same ``pyazr._azure2`` module the server uses, and this file
runs in Pyodide in a Web Worker.  It reuses the server's Flask application --
routes, sessions and serializers unchanged -- and answers each request through
Flask's test client, so the browser and the server cannot drift apart.

Two things differ from the server:

* **No worker processes.**  A page cannot fork, so :class:`InProcessEngine`
  holds the model in this interpreter.  The worker is single-threaded and the
  page sends one request at a time, so pyazr's per-call ``chdir`` is safe.
* **Precomputed results.**  ``precompute.py`` runs every evaluation natively at
  build time and stores the data and extrapolation curves at the shipped
  parameters.  While a session's parameters are the shipped ones, those are
  returned instead of recalculated; the first edit switches to the engine.
  An extrapolation with external capture takes minutes in a browser, so this is
  what makes opening one immediate.
"""

import json
import os

import numpy as np

from app import session as session_module
from app.engine import EngineError, ModelInfo, _dispatch, model_info  # noqa: F401
from app.session import SessionManager

CACHE_FILE = "precomputed.json"


# -- results to and from JSON ---------------------------------------------------

def encode(value):
    """Engine output (tuples and lists of arrays) as plain JSON."""
    if isinstance(value, np.ndarray):
        return {"__ndarray__": value.tolist(), "dtype": str(value.dtype)}
    if isinstance(value, (list, tuple)):
        return [encode(v) for v in value]
    if isinstance(value, (np.floating, np.integer)):
        return value.item()
    return value


def decode(value):
    if isinstance(value, dict) and "__ndarray__" in value:
        return np.asarray(value["__ndarray__"], dtype=value["dtype"])
    if isinstance(value, list):
        return [decode(v) for v in value]
    return value


def read_cache(directory):
    path = os.path.join(directory, CACHE_FILE)
    if not os.path.exists(path):
        return None
    with open(path) as f:
        return json.load(f)


# -- the engine ---------------------------------------------------------------

class InProcessEngine:
    """:class:`app.engine.Engine`'s interface, with the model in this process."""

    def __init__(self, azr_path, cwd, omp_threads=None, timeout=None):
        import pyazr
        try:
            self._azr = pyazr.azure2(azr_path, cwd=cwd)
        except Exception as err:
            raise EngineError(f"{type(err).__name__}: {err}") from err
        self.info = model_info(self._azr)
        self._cache = read_cache(cwd)
        self._closed = False

    def _cached(self, key, params):
        cache = self._cache
        if not cache or key not in cache:
            return None
        if [float(v) for v in params] != cache["params"]:
            return None
        return tuple(decode(cache[key]))

    def _run(self, command, params):
        try:
            return _dispatch(self._azr, command, params)
        except Exception as err:
            raise EngineError(f"{type(err).__name__}: {err}") from err

    def calculate_data(self, params):
        return self._cached("data", params) or self._run("data", params)

    def calculate_extrapolations(self, params):
        return self._cached("extrap", params) or self._run("extrap", params)

    def is_alive(self):
        return not self._closed

    def close(self):
        if not self._closed:
            self._closed = True
            try:
                self._azr.close()
            except Exception:
                pass

    pid = None


# -- the application ----------------------------------------------------------

_client = None


def start(evaluations_dir, max_sessions=4):
    """Build the Flask app around the in-process engine."""
    global _client
    from flask import Flask
    from app.routes import bp

    session_module.Engine = InProcessEngine
    app = Flask("azure2-browser")
    app.config.update(EVALUATIONS_DIR=evaluations_dir)
    # No reaper thread (a page has none to spare, and the tab's lifetime bounds
    # the sessions anyway); create() still reaps synchronously.
    app.extensions["sessions"] = SessionManager(ttl=24 * 3600, max_sessions=max_sessions)
    app.register_blueprint(bp)
    _client = app.test_client()


def handle(method, path, body=None):
    """One API request: returns ``(status, content_type, text)``."""
    response = _client.open(path, method=method, data=body or None,
                            content_type="application/json")
    return (response.status_code, response.headers.get("Content-Type", ""),
            response.get_data(as_text=True))
