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


class EngineError(RuntimeError):
    """Raised when the worker cannot be started, has died, or reported a failure."""


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

def _worker(conn, azr_path, cwd, omp_threads):
    """Own one ``pyazr.azure2`` and answer commands until the pipe closes.

    Runs in a fresh interpreter (the ``spawn`` start method), so nothing of the
    server's threaded state is inherited -- which is the point: this process has
    its own working directory and its own copy of the engine.
    """
    # Each session is a process, so left alone every one of them would claim all
    # the cores for its own OpenMP pool and they would fight.  Set before pyazr
    # is imported, since the runtime reads it at load.
    if omp_threads:
        os.environ["OMP_NUM_THREADS"] = str(omp_threads)

    try:
        import pyazr
        azr = pyazr.azure2(azr_path, cwd=cwd)
        conn.send(("ready", model_info(azr)))
    except BaseException as err:            # the model may simply not open
        try:
            conn.send(("error", f"{type(err).__name__}: {err}"))
        except Exception:
            pass
        return

    fine = {}
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
            if command == "fine":
                result = fine_curves(fine, azr_path, cwd, payload)
            elif command == "fine_ready":
                result = "model" in fine
            else:
                result = _dispatch(azr, command, payload)
            conn.send(("ok", result))
        except BaseException as err:
            conn.send(("error", f"{type(err).__name__}: {err}"))

    for model in (azr, fine.get("model"), getattr(azr, "_extrap_state", {}).get("model"),
                  getattr(azr, "_data_state", {}).get("model")):
        try:
            if model is not None:
                model.close()
        except Exception:
            pass


def data_curves(state, azr_path, cwd, params):
    """``(mu, mu_sfactor)`` per data segment of a model whose total capture
    sums several capture pairs, from the split model of
    :func:`app.fine.split_data_model` (built once and kept in ``state``).

    Returns ``None`` when the model cannot be split, and the caller falls
    back on a fresh initialization of its own model (:func:`_fresh_data`).
    """
    import pyazr
    from app import fine

    if "model" not in state:
        captures = fine.capture_keys(azr_path)
        workdir = fine.workdir_for(cwd, "datamodel")
        with fine.building(workdir):
            path, groups = fine.split_data_model(azr_path, workdir, captures)
            model = pyazr.azure2(path, cwd=cwd) if path else None
        state["model"], state["groups"] = model, groups
    model, groups = state["model"], state["groups"]
    if model is None:
        return None
    params = np.asarray(params, dtype=np.float64)
    if len(params) != len(model.params):
        return None
    mu = model.calculate(params)
    sfactor = model.calculate_sfactor(params)
    return ([fine.sum_slots(mu, g) for g in groups],
            [fine.sum_slots(sfactor, g) for g in groups])


def _needs_split(azr) -> bool:
    needs = getattr(azr, "_needs_split", None)
    if needs is None:
        from app import fine
        try:
            needs = fine.summed(azr.datasets, fine.capture_keys(azr.file))
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
    azr._fresh_ec = True


def fine_curves(state, azr_path, cwd, params):
    """The model on a fine grid per data segment (see :mod:`app.fine`).

    ``state`` keeps the derived model between calls: building it runs AZURE2's
    INITIALIZE, external-capture integrals included, which is slow the first
    time and is then reused for every later parameter vector.  Returns
    ``(index, energies, mu, mu_sfactor, angles, axes)``: ``index[i]`` is data
    segment ``i``'s slot in the other lists, or ``None``; ``axes[j]`` says
    whether slot ``j`` runs along the energy or the (c.m.) angle.
    """
    import pyazr
    from pyazr.datasets import SegmentSet
    from app import fine

    if "model" not in state:
        segments = SegmentSet.from_file(azr_path)
        workdir = fine.workdir_for(cwd)
        with fine.building(workdir):
            path, index = fine.derived_model(azr_path, cwd, segments, workdir)
            model = (pyazr.azure2(path, cwd=cwd, data_mode=False)
                     if path else None)
        state["index"] = index
        state["model"] = model
    model = state["model"]
    planned = state["index"]
    index = [None] * len(planned)
    if model is None:
        return index, [], [], [], [], []
    params = np.asarray(params, dtype=np.float64)
    energies = model.calculate_energies(params)
    angles = model.calculate_angles(params)
    mu = model.calculate(params)
    sfactor = model.calculate_sfactor(params)
    out = ([], [], [], [], [])
    for i, item in enumerate(planned):
        if not item:
            continue
        slots = item["slots"]
        if max(slots) >= len(mu):
            continue
        index[i] = len(out[0])
        first = slots[0]
        out[0].append(np.asarray(energies[first], dtype=float))
        out[1].append(fine.sum_slots(mu, slots))
        out[2].append(fine.sum_slots(sfactor, slots))
        out[3].append(np.asarray(angles[first], dtype=float))
        out[4].append(item["axis"])
    return (index,) + out


def extrap_curves(state, azr_path, cwd, params):
    """The evaluation's extrapolations: ``(energies, angles, mu, mu_sfactor)``
    per *active* ``<segmentsTest>`` line, in file order.

    Calculated by a second model in extrapolation mode, so the data model is
    never re-initialized (a summed-capture model could not be, safely).  When
    the extrapolations include a total capture over several capture pairs,
    that model is a derived copy with one line per pair (summed here), whose
    integrals live in ``extrap/`` next to the evaluation and are reused safely.
    """
    import pyazr
    from pyazr.datasets import TestSegmentSet
    from app import fine

    if "model" not in state:
        captures = fine.capture_keys(azr_path)
        tests = TestSegmentSet.from_file(azr_path)
        slots = None
        if fine.summed(tests, captures):
            workdir = fine.workdir_for(cwd, "extrap")
            with fine.building(workdir):
                path, slots = fine.extrap_model(azr_path, workdir, captures)
                model = pyazr.azure2(path, cwd=cwd, data_mode=False) if path else None
        else:
            model = pyazr.azure2(azr_path, cwd=cwd, data_mode=False)
        state["model"], state["slots"] = model, slots
    model, slots = state["model"], state["slots"]
    if model is None:
        return [], [], [], []
    params = np.asarray(params, dtype=np.float64)
    energies = model.calculate_energies(params)
    angles = model.calculate_angles(params)
    mu = model.calculate(params)
    sfactor = model.calculate_sfactor(params)
    if slots is None:
        return energies, angles, mu, sfactor
    out = ([], [], [], [])
    for group in slots:
        if max(group) >= len(mu):
            break
        out[0].append(energies[group[0]])
        out[1].append(angles[group[0]])
        out[2].append(fine.sum_slots(mu, group))
        out[3].append(fine.sum_slots(sfactor, group))
    return out


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
            state = getattr(azr, "_data_state", None)
            if state is None:
                state = {}
                azr._data_state = state
            result = data_curves(state, azr.file, azr.cwd, params)
            if result is not None:
                return result
            _fresh_data(azr)
        return (azr.calculate(params), azr.calculate_sfactor(params))

    if command == "extrap":
        state = getattr(azr, "_extrap_state", None)
        if state is None:
            state = {}
            azr._extrap_state = state
        return extrap_curves(state, azr.file, azr.cwd, params)

    raise ValueError(f"unknown command: {command}")


# -- the server-side handle ---------------------------------------------------

class Engine:
    """A worker process holding one open model.

    Not thread-safe by itself: the pipe carries one request at a time, so a
    caller must serialize its use.  :class:`app.session.Session` does that with
    its own lock, which is also what makes eviction safe.
    """

    def __init__(self, azr_path, cwd, omp_threads=None, timeout=DEFAULT_TIMEOUT):
        self.timeout = timeout
        # `spawn`, not `fork`: this server is multi-threaded, and forking a
        # threaded process copies locks that no thread in the child will ever
        # release.  A fresh interpreter costs a second at open and cannot
        # deadlock.
        context = multiprocessing.get_context("spawn")
        self._conn, child_conn = context.Pipe()
        self._process = context.Process(
            target=_worker, args=(child_conn, azr_path, cwd, omp_threads),
            name=f"azure2-{os.path.basename(cwd)}", daemon=True)
        self._process.start()
        # The parent must drop its copy of the child's end, or the pipe never
        # reports EOF when the child dies and every read waits for the timeout.
        child_conn.close()

        status, payload = self._receive("opening the model")
        if status != "ready":
            self.close()
            raise EngineError(payload)
        self.info: ModelInfo = payload

    # -- calls ----------------------------------------------------------------

    def calculate_data(self, params):
        """Cross sections and S-factors on the data segments: ``(mu, mu_sfactor)``."""
        return self._call("data", params)

    def calculate_extrapolations(self, params):
        """``(energies, angles, mu, mu_sfactor)`` on the extrapolation grids."""
        return self._call("extrap", params)

    def calculate_fine(self, params):
        """``(index, energies, mu, mu_sfactor, angles, axes)``: the model on a
        fine grid per data segment (:func:`fine_curves`)."""
        return self._call("fine", params)

    def fine_ready(self) -> bool:
        """Has the fine-grid model been built (so a calculation is cheap)?"""
        return bool(self._call("fine_ready", []))

    def _call(self, command, params):
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

    # -- lifecycle ------------------------------------------------------------

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
