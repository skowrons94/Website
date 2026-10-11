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
            conn.send(("ok", _dispatch(azr, command, payload)))
        except BaseException as err:
            conn.send(("error", f"{type(err).__name__}: {err}"))

    try:
        azr.close()
    except Exception:
        pass


def _dispatch(azr, command, params):
    """Run one command against the engine.

    Both calculations set the mode first.  Switching re-runs AZURE2's
    INITIALIZE, which is the expensive half of opening a model, so the switch is
    skipped when the engine is already in the mode asked for -- pyazr tracks it
    on ``azr.mode``, so there is no second copy of that state to fall out of
    step.

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
        return (azr.calculate(params), azr.calculate_sfactor(params))

    if command == "extrap":
        if azr.mode != "extrap":
            azr.extrap_mode()
        return (azr.calculate_energies(params), azr.calculate_angles(params),
                azr.calculate(params), azr.calculate_sfactor(params))

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
