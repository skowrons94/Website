"""One AZURE2 model, running in a process of its own.

pyazr used to drive AZURE2 as a subprocess over a socket.  Since pyazr 2.8 the
engine is a pybind11 extension module living *in the calling interpreter*, which
removes the socket but introduces two problems for a server:

* **The working directory is process-wide.**  A model names ``output/``,
  ``checks/`` and its data files relative to the process cwd, so ``pyazr``
  chdirs into the evaluation's directory for every engine call -- and it releases
  the GIL while the C++ runs.  Two sessions on different evaluations calculating
  at the same time would therefore chdir out from under each other, and AZURE2
  would read and write another evaluation's files.
* **A crash is not contained.**  A segfault in the engine would take the whole
  Flask process with it, ending every other session and the site's API.

Both are answered by giving each session its own interpreter: a cwd is private
to a process, and a process can die alone.  This is also what the socket-based
design had, so the properties the server was written against are preserved.

The protocol is deliberately tiny -- ``(command, payload)`` in, ``(status,
payload)`` back, over a :class:`multiprocessing.Pipe`.  Everything crossing it is
either a plain float vector or one of pyazr's own dataclasses, all of which
pickle.

Orphans take care of themselves.  The child blocks on the pipe, so if the server
is killed outright -- ``SIGKILL``, a crash, ``docker kill`` -- the pipe closes,
``recv`` raises ``EOFError`` and the child exits.  There is nothing to sweep and
no PID file to keep.
"""

import logging
import multiprocessing
import os
from dataclasses import dataclass
from typing import Any, List, Optional

import numpy as np

log = logging.getLogger(__name__)

# A generous ceiling for one engine call.  Opening a model and switching modes
# both re-run AZURE2's INITIALIZE, and an external-capture integral that is not
# cached can take minutes; this exists to turn a wedged child into an error
# rather than a request that never returns.
DEFAULT_TIMEOUT = 600.0


# What a session builds in the background once it opens, in this order: the
# models the first edit needs (data, then the plots' extended curves), then
# the extrapolations'.
PREPARE_STEPS = ("data", "fine", "extrap")


class EngineError(RuntimeError):
    """Raised when the worker cannot be started, has died, or reported a failure."""


class Delegated(EngineError):
    """A calculation this engine leaves to another worker: the in-browser
    build runs each derived model in a Web Worker of its own
    (browser/bridge.py), so its data worker answers "ask the ``role``
    worker" (HTTP 500, ``code: "delegate"``) and the page does, hands the
    result back and asks again.  Never raised on the server."""

    def __init__(self, role):
        super().__init__(f"calculated by the {role} worker")
        self.role = role


@dataclass
class ModelInfo:
    """Everything about a model that does not change while a session is open.

    Read once when the worker opens the model and kept on the server side, so
    the serializers can describe the level scheme and the measured data without
    a round trip to the worker for every request.
    """

    params: List[float]          # the free-parameter vector, as the model ships it
    parameters: Any              # pyazr ParameterSet: every parameter, fixed included
    pairs: Any                   # pyazr PairSet
    scheme: Any                  # pyazr LevelScheme
    datasets: Any                # pyazr SegmentSet, the <segmentsData> blocks
    extrapolations: Any          # pyazr TestSegmentSet, the <segmentsTest> blocks

    # The measurements themselves, per data segment.  These belong to the data
    # files rather than to the model, so they are read once and never again.
    energies: List[Any]
    angles: List[Any]
    cross: List[Any]
    cross_err: List[Any]
    sfactor: List[Any]
    sfactor_err: List[Any]


def model_info(azr) -> ModelInfo:
    """What a session keeps of an open ``pyazr.azure2`` model.

    Shared with the in-browser engine (``browser/bridge.py``), which runs the
    same model in the page's own interpreter instead of a worker process.
    """
    return ModelInfo(
        params=[float(v) for v in azr.params],
        parameters=azr.parameters,
        pairs=azr.pairs,
        scheme=azr.level_scheme,
        datasets=azr.datasets,
        extrapolations=azr.extrapolations,
        energies=list(azr.energies),
        angles=list(azr.angles),
        cross=list(azr.cross),
        cross_err=list(azr.cross_err),
        sfactor=list(azr.sfactor),
        sfactor_err=list(azr.sfactor_err),
    )


# -- the worker ---------------------------------------------------------------

def _worker(conn, azr_path, cwd, omp_threads, role="data", prepare_threads=None):
    """Own one model and answer commands until the pipe closes.

    Runs in a fresh interpreter (the ``spawn`` start method), so nothing of the
    server's threaded state is inherited -- which is the point: this process has
    its own working directory and its own copy of the engine.

    ``role`` says which of a session's models: ``"data"`` (the evaluation's
    own, plus its split data model), ``"fine"`` (the plots' extended grid) or
    ``"extrap"`` (and ``"grid"``, the extrapolations' energy × angle grids,
    on request).  Each in a process of its own, because AZURE2 keeps state
    across the models of one process: whichever was initialized last
    calculates right, and the others -- the data model after the fine one was
    built -- come out wrong (⁷Be's ³He(α,γ) by a factor of 25).  See
    :func:`evaluate` for the one-process case (the in-browser build).
    """
    # Each session is a process, so left alone every one of them would claim all
    # the cores for its own OpenMP pool and they would fight.  Set before pyazr
    # is imported, since the runtime reads it at load.
    if omp_threads:
        os.environ["OMP_NUM_THREADS"] = str(omp_threads)
    _threads.default = omp_threads or os.cpu_count()

    azr = None
    try:
        import pyazr
        if role == "data":
            with _threads(prepare_threads):
                azr = pyazr.azure2(azr_path, cwd=cwd)
            opened(azr)
            conn.send(("ready", model_info(azr)))
        else:
            conn.send(("ready", None))
    except BaseException as err:            # the model may simply not open
        try:
            conn.send(("error", f"{type(err).__name__}: {err}"))
        except Exception:
            pass
        return

    state = {}
    while True:
        try:
            command, payload = conn.recv()
        except (EOFError, OSError):
            # The server is gone.  Nothing to clean up that process exit will
            # not do; this is what makes orphaned workers impossible.
            break

        if command == "close":
            break

        try:
            if role == "fine":
                if command == "fine":
                    # The first call builds the model: with the build's threads.
                    with _threads(prepare_threads if "model" not in state else None):
                        result = fine_curves(state, azr_path, cwd, payload)
                elif command == "fine_ready":
                    result = "model" in state
                elif command == "prepare_fine":
                    with _threads(prepare_threads):
                        fine_model(state, azr_path, cwd)
                    result = True
                else:
                    raise ValueError(f"unknown command: {command}")
            elif role == "extrap":
                if command == "extrap":
                    with _threads(prepare_threads if "model" not in state else None):
                        result = extrap_curves(state, azr_path, cwd, payload)
                elif command == "prepare_extrap":
                    with _threads(prepare_threads):
                        extrap_model(state, azr_path, cwd)
                    result = True
                else:
                    raise ValueError(f"unknown command: {command}")
            elif role == "grid":
                if command == "grid":
                    with _threads(prepare_threads if "model" not in state else None):
                        result = grid_curves(state, azr_path, cwd, payload)
                elif command == "prepare_grid":
                    with _threads(prepare_threads):
                        grid_model(state, azr_path, cwd)
                    result = True
                else:
                    raise ValueError(f"unknown command: {command}")
            elif command.startswith("prepare_") or (
                    command == "data" and _needs_split(azr)
                    and "model" not in getattr(azr, "_data_state", {})):
                with _threads(prepare_threads):
                    result = _dispatch(azr, command, payload)
            else:
                result = _dispatch(azr, command, payload)
            conn.send(("ok", result))
        except BaseException as err:
            conn.send(("error", f"{type(err).__name__}: {err}"))

    for model in (azr, state.get("model"), getattr(azr, "_extrap_state", {}).get("model"),
                  getattr(azr, "_grid_state", {}).get("model"),
                  getattr(azr, "_data_state", {}).get("model")):
        try:
            if model is not None:
                model.close()
        except Exception:
            pass


class _threads:
    """Run a block with ``n`` OpenMP threads, then go back to the worker's
    own count.

    Building a model (AZURE2's INITIALIZE: the external-capture integrals)
    runs in parallel and scales with the threads; a calculation at new
    parameters (``update_segments``) does not, and with several sessions on
    one machine it is better kept to one thread each.  So a worker starts
    with ``AZURE2_OMP_THREADS`` (default 1) and takes
    ``AZURE2_PREPARE_THREADS`` (default: every core) only while it builds.
    ``omp_set_num_threads`` is called on libgomp, the runtime the engine is
    linked against; where it cannot be loaded (the in-browser build has no
    OpenMP) this does nothing.
    """

    _lib = False
    default = None

    def __init__(self, n):
        self.n = n

    @classmethod
    def _omp(cls):
        if cls._lib is False:
            cls._lib = None
            try:
                import ctypes
                import ctypes.util
                name = ctypes.util.find_library("gomp") or "libgomp.so.1"
                cls._lib = ctypes.CDLL(name)
            except (OSError, ImportError, AttributeError):
                cls._lib = None
        return cls._lib

    def __enter__(self):
        lib = self._omp() if self.n else None
        if lib is not None:
            try:
                lib.omp_set_num_threads(int(self.n))
            except Exception:
                pass
        return self

    def __exit__(self, *exc):
        lib = self._omp() if self.n else None
        if lib is not None:
            try:
                lib.omp_set_num_threads(int(_threads.default or os.cpu_count() or 1))
            except Exception:
                pass
        return False


# The model AZURE2 last initialized in this process (a weak reference).
_CURRENT = None


def opened(model):
    """Note that ``model`` was just built (so initialized): the one AZURE2
    now calculates right in this process (see :func:`evaluate`)."""
    global _CURRENT
    import weakref
    _CURRENT = weakref.ref(model)
    return model


def _open(path, cwd, data_mode=True):
    import pyazr
    return opened(pyazr.azure2(path, cwd=cwd, data_mode=data_mode))


def evaluate(model, params, grid=True):
    """One AZURE2 calculation, and everything read from it.

    pyazr's ``calculate``, ``calculate_sfactor``, ``calculate_energies`` and
    ``calculate_angles`` each run ``update_segments`` -- a whole calculation
    -- before reading their one result, so asking for all four did the work
    four times.  This runs it once and reads every result.

    Returns ``(mu, mu_sfactor, energies, angles)``, one array per segment
    (``energies`` and ``angles`` are ``None`` without ``grid``).
    """
    # Several models in one process (the in-browser build): AZURE2 keeps
    # state across them, and only the one initialized last calculates right.
    # Initialize this one again if another came after it (seconds, with its
    # integrals stored); the server keeps each model in a process of its own
    # (_worker), so there this never happens.
    current = _CURRENT() if _CURRENT is not None else None
    if current is not None and current is not model:
        if model.mode == "extrap":
            model.extrap_mode()
        else:
            model.data_mode()
    opened(model)
    s = model.sess
    params = np.asarray(params, dtype=np.float64)
    n = int(s.update_segments(params))
    mu = [np.asarray(s.calculated_segments(i), dtype=float) for i in range(n)]
    sfactor = [mu[i] * np.asarray(s.calculated_conv(i), dtype=float) for i in range(n)]
    if not grid:
        return mu, sfactor, None, None
    energies = [np.asarray(s.calculated_energies(i), dtype=float) for i in range(n)]
    angles = [np.asarray(s.calculated_angles(i), dtype=float) for i in range(n)]
    return mu, sfactor, energies, angles


def data_model(state, azr_path, cwd):
    """Build (once, kept in ``state``) the split data model of
    :func:`app.fine.split_data_model`."""
    from app import fine

    if "model" not in state:
        captures = fine.capture_keys(azr_path)
        workdir = fine.workdir_for(cwd, "datamodel")
        with fine.building(workdir):
            path, groups = fine.split_data_model(azr_path, workdir, captures)
            model = _open(path, cwd) if path else None
        state["model"], state["groups"] = model, groups
    return state


def data_curves(state, azr_path, cwd, params):
    """``(mu, mu_sfactor)`` per data segment of a model whose total capture
    sums several capture pairs, from the split model of
    :func:`app.fine.split_data_model` (built once and kept in ``state``).

    Returns ``None`` when the model cannot be split, and the caller falls
    back on a fresh initialization of its own model (:func:`_fresh_data`).
    """
    from app import fine

    data_model(state, azr_path, cwd)
    model, groups = state["model"], state["groups"]
    if model is None:
        return None
    params = np.asarray(params, dtype=np.float64)
    if len(params) != len(model.params):
        return None
    mu, sfactor, _, _ = evaluate(model, params, grid=False)
    return ([fine.sum_slots(mu, g) for g in groups],
            [fine.sum_slots(sfactor, g) for g in groups])


def _needs_split(azr) -> bool:
    needs = getattr(azr, "_needs_split", None)
    if needs is None:
        from app import fine
        try:
            needs = (fine.split_enabled(azr.cwd)
                     and fine.summed(azr.datasets, fine.capture_keys(azr.file)))
        except Exception:
            needs = False
        azr._needs_split = needs
    return needs


def _output_dir(azr):
    """The model's output directory, as AZURE2 resolves it (cwd-relative)."""
    import re
    try:
        with open(azr.file) as f:
            config = re.search(r"<config>\n(.*?)</config>", f.read(), flags=re.S)
        row = config.group(1).split("\n")[1].split("#")[0].strip()
    except (OSError, AttributeError, IndexError):
        return None
    return row if os.path.isabs(row) else os.path.join(azr.cwd, row)


def _fresh_data(azr):
    """Initialize the model again without a stored ``intEC.dat``: right for
    a summed total capture, at the cost of the integrals (the fallback when
    no split model can be written)."""
    if getattr(azr, "_fresh_ec", False):
        return
    output = _output_dir(azr)
    if output:
        try:
            os.remove(os.path.join(output, "intEC.dat"))
        except OSError:
            pass
    azr.data_mode()
    opened(azr)
    azr._fresh_ec = True


def fine_model(state, azr_path, cwd):
    """Build (once, kept in ``state``) the derived model of :mod:`app.fine`.

    Building runs AZURE2's INITIALIZE, external-capture integrals included,
    which is slow the first time and is then reused for every later
    parameter vector -- which is why a session prepares it in the background
    (``POST /api/sessions/<id>/prepare``) before the first edit needs it.
    """
    from pyazr.datasets import SegmentSet
    from app import fine

    if "model" not in state:
        segments = SegmentSet.from_file(azr_path)
        workdir = fine.workdir_for(cwd)
        with fine.building(workdir):
            path, calcs, index = fine.derived_model(azr_path, cwd, segments, workdir)
            model = _settled(path, cwd) if path else None
        state["index"], state["calcs"], state["model"] = index, calcs, model
    return state


def _settled(path, cwd, attempts=3):
    """The model at ``path`` in extrapolation mode, built until AZURE2 reads
    its stored external-capture integrals back rather than writing them.

    A total capture over several capture pairs calculated as AZURE2 does it
    as shipped (an evaluation without ``split_total_capture``, ¹⁴N) gives
    three different answers on three builds: right when the integrals are
    first calculated, garbage on the next (the count check fails and they are
    recalculated), then -- read back from the file -- the same numbers as the
    data model, which is what the published fit shows and what the curve
    must reproduce.  So a build that wrote the file is done again; a build
    that only read it (every one after the first) is kept.
    """

    stored = os.path.join(os.path.dirname(path), "output", "intEC.extrap")

    def stamp():
        try:
            st = os.stat(stored)
            return (st.st_mtime_ns, st.st_size)
        except OSError:
            return None

    for attempt in range(attempts):
        before = stamp()
        model = _open(path, cwd, data_mode=False)
        if stamp() == before or attempt == attempts - 1:
            return model
        model.close()


def fine_curves(state, azr_path, cwd, params):
    """The model on its extended grid, per distinct calculation (see
    :mod:`app.fine`), in one AZURE2 calculation.

    Returns ``(index, energies, mu, mu_sfactor, angles, axes)``: ``index[i]``
    is data segment ``i``'s curve in the other lists (shared by every segment
    measuring the same curve), or ``None``; ``axes[j]`` says whether curve
    ``j`` runs along the energy or the (c.m.) angle.  Each curve is sorted
    along its axis.
    """
    from app import fine

    fine_model(state, azr_path, cwd)
    model, calcs, planned = state["model"], state["calcs"], state["index"]
    if model is None:
        return [None] * len(planned), [], [], [], [], []
    mu, sfactor, energies, angles = evaluate(model, params)
    out = ([], [], [], [], [])
    number = {}
    for j, calc in enumerate(calcs):
        e, m, f, a = fine.join_pieces(calc["pieces"], calc["axis"],
                                      mu, sfactor, energies, angles)
        if len(e) == 0:
            continue
        number[j] = len(out[0])
        for target, value in zip(out, (e, m, f, a, calc["axis"])):
            target.append(value)
    index = [None if j is None else number.get(j) for j in planned]
    return (index,) + out


EXTRAP_DIR = "extrapolations"


def extrap_model(state, azr_path, cwd):
    """Build (once, kept in ``state``) the model the extrapolations are
    calculated by: the evaluation's own file in extrapolation mode, or the
    derived copy of :func:`app.fine.extrap_model` when it has a total capture
    to split or extend, an angle-integrated line to collapse or an energy ×
    angle grid to leave out.  Its integrals then live in ``extrapolations/``
    next to the evaluation."""
    from pyazr.datasets import TestSegmentSet
    from app import fine

    if "model" not in state:
        captures = fine.capture_keys(azr_path)
        tests = TestSegmentSet.from_file(azr_path)
        split = fine.split_enabled(cwd) and fine.summed(tests, captures)
        captures = captures if split else []
        plan = None
        if fine.extrap_needs_model(azr_path, captures, split):
            workdir = fine.workdir_for(cwd, EXTRAP_DIR)
            with fine.building(workdir):
                path, plan = fine.extrap_model(azr_path, workdir, captures)
                model = _open(path, cwd, data_mode=False) if path else None
        else:
            model = _open(azr_path, cwd, data_mode=False)
        state["model"], state["plan"] = model, plan
    return state


def extrap_curves(state, azr_path, cwd, params):
    """The evaluation's extrapolations: ``(energies, angles, mu, mu_sfactor)``
    per *active* ``<segmentsTest>`` line, in file order.  An energy × angle
    grid (:func:`app.fine.is_grid`) comes back as empty arrays: it is
    calculated on request (:func:`grid_curves`).

    Calculated by a second model in extrapolation mode (:func:`extrap_model`),
    so the data model is never re-initialized (a summed-capture model could
    not be, safely).
    """
    from app import fine

    extrap_model(state, azr_path, cwd)
    model, plan = state["model"], state["plan"]
    if model is None and not plan:
        return [], [], [], []
    if plan is None:
        mu, sfactor, energies, angles = evaluate(model, params)
        return energies, angles, mu, sfactor
    if model is not None:
        mu, sfactor, energies, angles = evaluate(model, params)
    else:
        mu = sfactor = energies = angles = []
    empty = np.zeros(0)
    out = ([], [], [], [])
    for pieces in plan:
        if pieces is None:
            values = (empty, empty, empty, empty)
        elif any(max(piece) >= len(mu) for piece in pieces):
            break
        elif len(pieces) == 1:
            group = pieces[0]
            values = (np.asarray(energies[group[0]], dtype=float),
                      np.asarray(angles[group[0]], dtype=float),
                      fine.sum_slots(mu, group), fine.sum_slots(sfactor, group))
        else:
            e, m, f, a = fine.join_pieces(pieces, "energy", mu, sfactor, energies, angles)
            values = (e, a, m, f)
        for target, value in zip(out, values):
            target.append(value)
    return out


GRID_DIR = "extrapolations-grid"


def grid_model(state, azr_path, cwd):
    """Build (once, kept in ``state``) the model of the extrapolations'
    energy × angle grids (:func:`app.fine.grid_model`)."""
    from app import fine

    if "model" not in state:
        workdir = fine.workdir_for(cwd, GRID_DIR)
        with fine.building(workdir):
            path, plan = fine.grid_model(azr_path, workdir)
            model = _open(path, cwd, data_mode=False) if path else None
        state["model"], state["plan"] = model, plan
    return state


def grid_curves(state, azr_path, cwd, params):
    """The energy × angle grids at ``params``: ``(plan, energies, angles,
    mu, mu_sfactor)``, the arrays one per line of the grid model, ``plan``
    as :func:`app.fine.grid_model` returns it (angles and slots)."""
    grid_model(state, azr_path, cwd)
    model, plan = state["model"], state["plan"]
    if model is None:
        return plan, [], [], [], []
    mu, sfactor, energies, angles = evaluate(model, params)
    return plan, energies, angles, mu, sfactor


def _state(azr, name):
    """A derived model's state, kept on the data model it belongs to."""
    state = getattr(azr, name, None)
    if state is None:
        state = {}
        setattr(azr, name, state)
    return state


def _dispatch(azr, command, params):
    """Run one command against the engine.

    The data model stays in data mode for its whole life; the extrapolations
    are calculated by a second model kept on it (:func:`extrap_curves`), and
    a model whose data include a total capture over several capture pairs by
    a third, split one (:func:`data_curves`).

    The parameter vector is converted here rather than trusted from the wire:
    the engine's ``update_segments`` reads its argument through the buffer
    protocol, and a plain Python list segfaults the interpreter instead of
    raising.  A float64 array is what it expects, and the conversion is the one
    line that keeps a bad call an error rather than a crash.
    """
    params = np.asarray(params, dtype=np.float64)

    if command == "data":
        if azr.mode != "data":
            azr.data_mode()
        if _needs_split(azr):
            # A total capture over several capture pairs: AZURE2's own
            # calculation of it is unreliable (app.fine.summed).
            state = _state(azr, "_data_state")
            result = data_curves(state, azr.file, azr.cwd, params)
            if result is not None:
                return result
            _fresh_data(azr)
        mu, sfactor, _, _ = evaluate(azr, params, grid=False)
        return mu, sfactor

    if command == "extrap":
        return extrap_curves(_state(azr, "_extrap_state"), azr.file, azr.cwd, params)

    if command == "prepare_data":
        # The split data model, where the data need one (data_curves), and
        # one calculation: AZURE2's first is the slow one (²⁴Mg: 2.5 s, then
        # 0.4 s), and at the shipped parameters the page never asked for it.
        _dispatch(azr, "data", azr.params)
        return True

    if command == "prepare_extrap":
        extrap_model(_state(azr, "_extrap_state"), azr.file, azr.cwd)
        return True

    if command == "grid":
        return grid_curves(_state(azr, "_grid_state"), azr.file, azr.cwd, params)

    if command == "prepare_grid":
        grid_model(_state(azr, "_grid_state"), azr.file, azr.cwd)
        return True

    raise ValueError(f"unknown command: {command}")


# -- the server-side handle ---------------------------------------------------

class _Process:
    """One worker process (:func:`_worker`) and the pipe to it."""

    def __init__(self, azr_path, cwd, omp_threads, timeout, role, prepare_threads=None):
        self.timeout = timeout
        self.role = role
        # `spawn`, not `fork`: this server is multi-threaded, and forking a
        # threaded process copies locks that no thread in the child will ever
        # release.  A fresh interpreter costs a second at open and cannot
        # deadlock.
        context = multiprocessing.get_context("spawn")
        self._conn, child_conn = context.Pipe()
        self._process = context.Process(
            target=_worker, args=(child_conn, azr_path, cwd, omp_threads, role,
                                  prepare_threads),
            name=f"azure2-{os.path.basename(cwd)}-{role}", daemon=True)
        self._process.start()
        # The parent must drop its copy of the child's end, or the pipe never
        # reports EOF when the child dies and every read waits for the timeout.
        child_conn.close()

        status, payload = self._receive("opening the model")
        if status != "ready":
            self.close()
            raise EngineError(payload)
        self.ready = payload

    def call(self, command, params):
        if not self.is_alive():
            raise EngineError("the AZURE2 worker for this session has exited")
        try:
            self._conn.send((command, [float(v) for v in params]))
        except (BrokenPipeError, OSError) as err:
            raise EngineError(f"lost the AZURE2 worker: {err}") from err

        status, payload = self._receive(command)
        if status != "ok":
            raise EngineError(payload)
        return payload

    def _receive(self, what):
        """Read one reply, turning a dead or wedged worker into an error."""
        try:
            if not self._conn.poll(self.timeout):
                # Either the engine is still grinding after `timeout`, or it
                # died so hard it never wrote to the pipe.  Neither leaves a
                # usable session, so the worker goes.
                self.close()
                raise EngineError(
                    f"AZURE2 did not answer within {self.timeout:.0f}s while {what}")
            return self._conn.recv()
        except EOFError as err:
            self.close()
            raise EngineError(
                f"the AZURE2 worker exited while {what}") from err
        except OSError as err:
            self.close()
            raise EngineError(f"lost the AZURE2 worker while {what}: {err}") from err

    def is_alive(self) -> bool:
        return self._process is not None and self._process.is_alive()

    def close(self):
        """Stop the worker, politely if it is still listening."""
        process, self._process = self._process, None
        if process is None:
            return
        try:
            if process.is_alive():
                try:
                    self._conn.send(("close", None))
                except (BrokenPipeError, OSError):
                    pass
                process.join(timeout=5)
            if process.is_alive():
                # Mid-calculation, so it never reached the next recv.  The C++
                # holds no state worth saving, so end it.
                process.terminate()
                process.join(timeout=5)
        except Exception:
            log.exception("error stopping AZURE2 worker")
        finally:
            try:
                self._conn.close()
            except Exception:
                pass

    @property
    def pid(self) -> Optional[int]:
        return self._process.pid if self._process is not None else None


# What a session's background preparation builds, per step: the role's
# worker process (see _worker).
ROLES = ("data", "fine", "extrap", "grid")


class Engine:
    """The worker processes holding one session's models.

    The evaluation's own model (and its split data model) lives in one
    process, started here; the plots' extended grid, the extrapolations and
    their energy × angle grids each get a process of their own the first
    time they are asked for -- AZURE2 does not keep two models of one
    process apart (see :func:`_worker`).

    Each role's pipe carries one request at a time, so a caller must
    serialize the use of *one role*; different roles may be used at once
    from different threads (they are different processes).
    :class:`app.session.Session` keeps one lock per role.
    """

    def __init__(self, azr_path, cwd, omp_threads=None, timeout=DEFAULT_TIMEOUT,
                 prepare_threads=None):
        self.timeout = timeout
        self._args = (azr_path, cwd, omp_threads, timeout)
        self._prepare_threads = prepare_threads
        self._main = _Process(azr_path, cwd, omp_threads, timeout, "data",
                              prepare_threads)
        self._roles = {}
        self.info: ModelInfo = self._main.ready

    def _role(self, role):
        if not self.is_alive():
            raise EngineError("the AZURE2 worker for this session has exited")
        worker = self._roles.get(role)
        if worker is None or not worker.is_alive():
            worker = _Process(*self._args, role, self._prepare_threads)
            self._roles[role] = worker
        return worker

    # -- calls ----------------------------------------------------------------

    def calculate_data(self, params):
        """Cross sections and S-factors on the data segments: ``(mu, mu_sfactor)``."""
        return self._main.call("data", params)

    def calculate_extrapolations(self, params):
        """``(energies, angles, mu, mu_sfactor)`` on the extrapolation grids."""
        return self._role("extrap").call("extrap", params)

    def calculate_fine(self, params):
        """``(index, energies, mu, mu_sfactor, angles, axes)``: the model on its
        extended grid per distinct calculation (:func:`fine_curves`)."""
        return self._role("fine").call("fine", params)

    def calculate_grid(self, params):
        """The extrapolations' energy × angle grids (:func:`grid_curves`)."""
        return self._role("grid").call("grid", params)

    def prepare(self, step):
        """Build one derived model ahead of need: ``"data"`` (a split data
        model), ``"fine"``, ``"extrap"`` or ``"grid"``.  Calculates nothing
        that is kept."""
        if step not in ROLES:
            raise ValueError(f"unknown preparation step: {step}")
        worker = self._main if step == "data" else self._role(step)
        return worker.call(f"prepare_{step}", [])

    def fine_ready(self) -> bool:
        """Has the fine-grid model been built (so a calculation is cheap)?"""
        worker = self._roles.get("fine")
        if worker is None or not worker.is_alive():
            return False
        return bool(worker.call("fine_ready", []))

    def has_role(self, role) -> bool:
        """Is ``role``'s worker running?"""
        if role == "data":
            return self.is_alive()
        worker = self._roles.get(role)
        return worker is not None and worker.is_alive()

    def close_role(self, role):
        """Stop one derived model's worker (the next call starts it again);
        the caller holds that role's lock."""
        if role == "data":
            raise ValueError("the data model is the session; close the engine")
        worker = self._roles.pop(role, None)
        if worker is not None:
            worker.close()

    def pids(self):
        """``{role: pid}`` of the running workers."""
        out = {"data": self._main.pid}
        for role, worker in list(self._roles.items()):
            if worker.pid is not None:
                out[role] = worker.pid
        return out

    # -- lifecycle ------------------------------------------------------------

    def is_alive(self) -> bool:
        return self._main.is_alive()

    def close(self):
        """Stop every worker of the session."""
        for worker in [self._main, *list(self._roles.values())]:
            worker.close()

    @property
    def pid(self) -> Optional[int]:
        return self._main.pid
