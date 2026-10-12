"""The evaluation API, served inside the page.

On the static build (GitHub Pages) there is no server: AZURE2 is compiled to
WebAssembly as the same ``pyazr._azure2`` module the server uses, and this file
runs in Pyodide in a Web Worker.  It reuses the server's Flask application --
routes, sessions and serializers unchanged -- and answers each request through
Flask's test client, so the browser and the server cannot drift apart.

Two things differ from the server:

* **No worker processes.**  A page cannot fork, so :class:`InProcessEngine`
  holds the model in this interpreter -- its derived models too, which
  AZURE2 does not keep apart: :func:`app.engine.evaluate` initializes a
  model again when another was initialized after it.  The worker is single-threaded and the
  page sends one request at a time, so pyazr's per-call ``chdir`` is safe.
* **Precomputed results.**  ``precompute.py`` runs every evaluation natively at
  build time and stores the data and extrapolation curves at the shipped
  parameters.  While a session's parameters are the shipped ones, those are
  returned instead of recalculated; the first edit switches to the engine.
  An extrapolation with external capture takes minutes in a browser, so this is
  what makes opening one immediate.
"""

from app import session as session_module
from app.engine import (PREPARE_STEPS, EngineError, _dispatch, fine_curves,
                        fine_model, model_info, opened)
from app.session import SessionManager

# Results at the shipped parameters come from the server's own cache
# (app/cache.py, used by app.session), filled at build time by precompute.py.


# -- the engine ---------------------------------------------------------------

class InProcessEngine:
    """:class:`app.engine.Engine`'s interface, with the model in this process."""

    def __init__(self, azr_path, cwd, omp_threads=None, timeout=None):
        import pyazr
        try:
            self._azr = opened(pyazr.azure2(azr_path, cwd=cwd))
        except Exception as err:
            raise EngineError(f"{type(err).__name__}: {err}") from err
        self.info = model_info(self._azr)
        self._closed = False
        self._azr_path, self._cwd = azr_path, cwd
        self._fine = {}

    def _run(self, command, params):
        try:
            return _dispatch(self._azr, command, params)
        except Exception as err:
            raise EngineError(f"{type(err).__name__}: {err}") from err

    def calculate_data(self, params):
        return self._run("data", params)

    def calculate_extrapolations(self, params):
        return self._run("extrap", params)

    def calculate_fine(self, params):
        try:
            return fine_curves(self._fine, self._azr_path, self._cwd, params)
        except Exception as err:
            raise EngineError(f"{type(err).__name__}: {err}") from err

    def prepare(self, step):
        if step not in PREPARE_STEPS:
            raise ValueError(f"unknown preparation step: {step}")
        try:
            if step == "fine":
                fine_model(self._fine, self._azr_path, self._cwd)
                return True
            return _dispatch(self._azr, f"prepare_{step}", [])
        except Exception as err:
            raise EngineError(f"{type(err).__name__}: {err}") from err

    def fine_ready(self):
        return "model" in self._fine

    def is_alive(self):
        return not self._closed

    def close(self):
        if not self._closed:
            self._closed = True
            for model in (self._azr, self._fine.get("model"),
                          getattr(self._azr, "_extrap_state", {}).get("model"),
                          getattr(self._azr, "_data_state", {}).get("model")):
                try:
                    if model is not None:
                        model.close()
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
