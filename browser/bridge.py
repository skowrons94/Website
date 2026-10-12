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
* **One Web Worker per model.**  AZURE2 keeps state across the models of one
  process (see :func:`app.engine.evaluate`): one interpreter holding the data
  and the smooth-curve models initialised each again whenever the other had
  been used -- 18 s per ⁷Be edit.  So the page runs one worker per role
  (``lib/browser-engine.ts``): this Flask app in the *data* worker, with
  :class:`InProcessEngine` answering ``Delegated`` for the smooth curves,
  the extrapolations and the 2-D grids; and :func:`role_calc` in a worker
  per role, each holding that one model.  The page calculates the role at
  the session's parameters, hands the result to this app (:func:`inject`)
  and asks again, which then finds it.
* **Precomputed results.**  ``precompute.py`` runs every evaluation natively at
  build time and stores the data and extrapolation curves at the shipped
  parameters.  While a session's parameters are the shipped ones, those are
  returned instead of recalculated (matched by the model's fingerprint: the
  WebAssembly engine reads some parameters back a few ulps away from the
  native one, see ``app.cache``); the first edit switches to the engine.
  An extrapolation with external capture takes minutes in a browser, so this is
  what makes opening one immediate.
"""

from app import session as session_module
import json
import pickle

from app.engine import (ROLES, Delegated, EngineError, _dispatch, extrap_curves,
                        extrap_model, fine_curves, fine_model, grid_curves,
                        grid_model, model_info, opened)
from app.session import SessionManager

# Results at the shipped parameters come from the server's own cache
# (app/cache.py, used by app.session), filled at build time by precompute.py.


# -- the engine ---------------------------------------------------------------

class InProcessEngine:
    """:class:`app.engine.Engine`'s interface, with the model in this process."""

    # The roles another worker calculates (set by start(delegate=True)).
    delegated = ()

    def __init__(self, azr_path, cwd, omp_threads=None, timeout=None, **_):
        import pyazr
        try:
            self._azr = opened(pyazr.azure2(azr_path, cwd=cwd))
        except Exception as err:
            raise EngineError(f"{type(err).__name__}: {err}") from err
        self.info = model_info(self._azr)
        self._closed = False
        self._azr_path, self._cwd = azr_path, cwd
        self._fine = {}

    def _delegate(self, role):
        if role in self.delegated:
            raise Delegated(role)

    def _run(self, command, params):
        try:
            return _dispatch(self._azr, command, params)
        except Exception as err:
            raise EngineError(f"{type(err).__name__}: {err}") from err

    def calculate_data(self, params):
        return self._run("data", params)

    def calculate_extrapolations(self, params):
        self._delegate("extrap")
        return self._run("extrap", params)

    def calculate_grid(self, params):
        self._delegate("grid")
        return self._run("grid", params)

    def calculate_fine(self, params):
        self._delegate("fine")
        try:
            return fine_curves(self._fine, self._azr_path, self._cwd, params)
        except Exception as err:
            raise EngineError(f"{type(err).__name__}: {err}") from err

    def prepare(self, step):
        if step not in ROLES:
            raise ValueError(f"unknown preparation step: {step}")
        self._delegate(step)
        try:
            if step == "fine":
                fine_model(self._fine, self._azr_path, self._cwd)
                return True
            return _dispatch(self._azr, f"prepare_{step}", [])
        except Exception as err:
            raise EngineError(f"{type(err).__name__}: {err}") from err

    def fine_ready(self):
        return "model" in self._fine

    def has_role(self, role):
        if role in self.delegated:
            return False
        if role == "data":
            return not self._closed
        if role == "fine":
            return "model" in self._fine
        return "model" in getattr(self._azr, f"_{role}_state", {})

    def close_role(self, role):
        # One process: nothing to give back separately.
        pass

    def pids(self):
        return {}

    def is_alive(self):
        return not self._closed

    def close(self):
        if not self._closed:
            self._closed = True
            for model in (self._azr, self._fine.get("model"),
                          getattr(self._azr, "_extrap_state", {}).get("model"),
                          getattr(self._azr, "_grid_state", {}).get("model"),
                          getattr(self._azr, "_data_state", {}).get("model")):
                try:
                    if model is not None:
                        model.close()
                except Exception:
                    pass

    pid = None


# -- the application ----------------------------------------------------------

_client = None


def start(evaluations_dir, max_sessions=4, delegate=False):
    """Build the Flask app around the in-process engine; ``delegate``: the
    smooth curves, extrapolations and grids are calculated by other workers
    (:func:`role_calc`), the page handing their results in (:func:`inject`)."""
    global _client, _app
    InProcessEngine.delegated = ("fine", "extrap", "grid") if delegate else ()
    from flask import Flask
    from app.routes import bp

    session_module.Engine = InProcessEngine
    app = Flask("azure2-browser")
    app.config.update(EVALUATIONS_DIR=evaluations_dir)
    # No reaper thread (a page has none to spare, and the tab's lifetime bounds
    # the sessions anyway); create() still reaps synchronously.
    # Nor background preparation: one worker answers every request in turn.
    app.extensions["sessions"] = SessionManager(ttl=24 * 3600, max_sessions=max_sessions,
                                                role_ttl=0, auto_prepare=False)
    app.register_blueprint(bp)
    _client = app.test_client()
    _app = app


def handle(method, path, body=None):
    """One API request: returns ``(status, content_type, text)``."""
    response = _client.open(path, method=method, data=body or None,
                            content_type="application/json")
    return (response.status_code, response.headers.get("Content-Type", ""),
            response.get_data(as_text=True))


# -- results calculated by another worker ---------------------------------------

_app = None


def _manager():
    return _app.extensions["sessions"]


def session_params(session_id):
    """The session's parameter vector (JSON), which the page keeps a copy of
    and edits in step, to ask the role workers at the same values."""
    return json.dumps(list(_manager().get(session_id).snapshot()))


def inject(session_id, key, params_json, result):
    """Hand ``key``'s result (pickled by :func:`role_calc`), calculated at
    ``params_json``, to the session.  Kept only if those are its parameters
    now (an edit may have come in between): returns whether it was."""
    session = _manager().get(session_id)
    params = tuple(float(v) for v in json.loads(params_json))
    if tuple(session.snapshot()) != params:
        return False
    raw = result.to_bytes() if hasattr(result, "to_bytes") else bytes(result)
    session._memo[key] = (params, pickle.loads(raw))
    if key == "fine":
        session._fine_built = True
    return True


# -- a role worker ---------------------------------------------------------------

_ROLE = {"fine": (fine_model, fine_curves), "extrap": (extrap_model, extrap_curves),
         "grid": (grid_model, grid_curves)}
_role_root = None
_role_states = {}


def role_start(evaluations_dir):
    """This worker calculates one derived model (no Flask app)."""
    global _role_root
    _role_root = evaluations_dir


def _role_state(role, evaluation_id):
    from app import evaluations as evaluations_module
    key = (role, evaluation_id)
    if key not in _role_states:
        # One evaluation at a time: another one's model is let go.
        for other in [k for k in _role_states if k[0] == role]:
            state = _role_states.pop(other)[1]
            try:
                if state.get("model") is not None:
                    state["model"].close()
            except Exception:
                pass
        evaluation = evaluations_module.get(_role_root, evaluation_id)
        _role_states[key] = (evaluation, {})
    return _role_states[key]


def role_prepare(role, evaluation_id):
    """Build the role's model ahead of need."""
    evaluation, state = _role_state(role, evaluation_id)
    _ROLE[role][0](state, evaluation.azr_path, evaluation.path)
    return True


def role_calc(role, evaluation_id, params_json):
    """The role's result at ``params_json``, pickled for :func:`inject`."""
    from pyodide.ffi import to_js
    evaluation, state = _role_state(role, evaluation_id)
    params = [float(v) for v in json.loads(params_json)]
    result = _ROLE[role][1](state, evaluation.azr_path, evaluation.path, params)
    return to_js(pickle.dumps(result, protocol=pickle.HIGHEST_PROTOCOL))
