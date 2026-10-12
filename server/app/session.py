"""Per-session AZURE2 models.

Opening an evaluation starts an AZURE2 worker process that lives until the user
stops touching it.  Each session owns exactly one worker, so two people (or two
browser tabs) editing levels cannot overwrite each other's parameters -- which
the previous single-shared-instance design could not avoid.

Two invariants this module exists to keep:

* **One caller at a time per worker.**  The pipe to a worker carries one request
  at a time, so two concurrent calls would interleave.  Every use goes through
  :meth:`Session.use`, which holds the session's lock.
* **The model's own values are kept.**  ``initial_params`` is captured when the
  session opens, so "reset" restores exactly what the evaluation shipped rather
  than whatever the files happen to say later.

Why the mode is *not* tracked here: pyazr keeps it on the engine, and
:mod:`app.engine` switches only on an actual change.  A second copy of that
state on this side could disagree with the engine's, which would silently
calculate the wrong segments.
"""

import logging
import math
import threading
import time
import uuid
from typing import Dict, List, Optional

from app import cache
from app.engine import Engine, EngineError

log = logging.getLogger(__name__)


class SessionError(RuntimeError):
    """Raised when a session cannot be created or is no longer usable."""


class Session:
    """One open evaluation: an AZURE2 worker plus the parameters being edited.

    The parameter vector holds only the model's *free* parameters --
    ``ModelInfo.parameters`` describes all of them, fixed included -- so a
    parameter's slot here is its ``free_index``, never its ``index``.  Confusing
    the two silently edits the wrong parameter.
    """

    def __init__(self, session_id, evaluation, omp_threads=None, timeout=None):
        self.id = session_id
        self.evaluation = evaluation
        self.created_at = time.time()
        self.last_used = time.time()
        self._lock = threading.RLock()
        self._closed = False

        kwargs = {} if timeout is None else {"timeout": timeout}
        self.engine = Engine(evaluation.azr_path, evaluation.path,
                             omp_threads=omp_threads, **kwargs)
        info = self.engine.info

        # Captured once, so "reset" is exact rather than a re-read of whatever
        # the model files happen to say now.
        self.initial_params = list(info.params)
        self.params = list(info.params)

        # Metadata that never changes for the life of the model.
        self.parameters = info.parameters
        self.pairs = info.pairs
        self.scheme = info.scheme
        self.datasets = info.datasets
        self.extrapolations = info.extrapolations

        # The measurements the model is being compared against.
        self.measured = info

    # -- lifecycle ------------------------------------------------------------

    @property
    def closed(self) -> bool:
        return self._closed

    def touch(self):
        self.last_used = time.time()

    def idle_for(self) -> float:
        return time.time() - self.last_used

    def close(self):
        with self._lock:
            if self._closed:
                return
            self._closed = True
            try:
                self.engine.close()
            except Exception:            # never let cleanup raise
                log.exception("error closing AZURE2 for session %s", self.id)

    # -- guarded access -------------------------------------------------------

    def use(self):
        """Context manager serializing access to the AZURE2 worker.

        ``with session.use():`` around every block that talks to AZURE2.
        """
        return _SessionUse(self)

    def _check_alive(self):
        if self._closed:
            raise SessionError("session has been closed")
        if not self.engine.is_alive():
            # The worker died under us; a stale handle would fail in confusing
            # ways, so surface it as a dead session instead.
            self._closed = True
            raise SessionError("the AZURE2 process for this session has exited")

    # -- parameters -----------------------------------------------------------

    def set_parameters(self, updates):
        """Apply ``{free_index: value}`` updates to the working vector.

        Returns the number of parameters actually changed.  An out-of-range or
        non-free index is an error rather than a silent no-op, because the
        caller believing it edited a level it did not is the worst outcome.
        """
        n = len(self.params)
        changed = 0
        for raw_index, value in updates.items():
            index = int(raw_index)
            if index < 0 or index >= n:
                raise IndexError(
                    f"free-parameter index {index} out of range (0..{n - 1})")
            # bool is an int to Python, null is not a number, and NaN or an
            # infinity would come back out as bare NaN/Infinity tokens, which
            # are not JSON and break the client's parse of every curve.
            if isinstance(value, bool) or not isinstance(value, (int, float, str)):
                raise ValueError(
                    f"value for parameter {index} must be a number")
            value = float(value)
            if not math.isfinite(value):
                raise ValueError(
                    f"value for parameter {index} must be finite")
            if self.params[index] != value:
                self.params[index] = value
                changed += 1
        return changed

    def reset_parameters(self):
        """Restore the parameters captured when the session opened."""
        self.params = list(self.initial_params)

    @property
    def is_modified(self) -> bool:
        return self.params != self.initial_params

    # -- calculations ---------------------------------------------------------

    def calculate_data(self):
        """Cross sections and S-factors for every data segment, at the current
        parameters.  Returns ``(mu, mu_sfactor)``."""
        return self._cached("data", self.engine.calculate_data)

    def calculate_extrapolations(self):
        """Energies, angles, cross sections and S-factors for every
        extrapolation segment.  Returns ``(energies, angles, mu, mu_sfactor)``."""
        return self._cached("extrap", self.engine.calculate_extrapolations)

    def _cached(self, key, method):
        """At the evaluation's own parameters, answer from ``app.cache`` when
        it can and fill it when it cannot; after an edit, always calculate."""
        if self.is_modified:
            return self._engine_call(method)
        hit = cache.read(self.evaluation.path, self.params, key)
        if hit is not None:
            return hit
        result = self._engine_call(method)
        cache.write(self.evaluation.path, self.params, key, result)
        return result

    def _engine_call(self, method):
        """Run one engine call, reporting a lost worker as a dead session.

        A worker that has died cannot be revived -- its model state is gone --
        so the session is closed and the client is told to reopen, which is what
        the 409 in the routes means.
        """
        try:
            return method(self.params)
        except EngineError as err:
            self._closed = True
            raise SessionError(str(err)) from err


class _SessionUse:
    def __init__(self, session):
        self._session = session

    def __enter__(self):
        self._session._lock.acquire()
        try:
            self._session._check_alive()
        except Exception:
            self._session._lock.release()
            raise
        return self._session

    def __exit__(self, *exc):
        self._session.touch()
        self._session._lock.release()
        return False


class SessionManager:
    """Creates, tracks and reaps :class:`Session` objects."""

    def __init__(self, ttl=1800, max_sessions=8, reaper_interval=60,
                 omp_threads=None, timeout=None):
        self.ttl = ttl
        self.max_sessions = max_sessions
        self.reaper_interval = reaper_interval
        self.omp_threads = omp_threads
        self.timeout = timeout
        self._sessions: Dict[str, Session] = {}
        self._lock = threading.Lock()
        self._stop = threading.Event()
        self._reaper = None
        # Slots reserved by a create() that is still spawning.  Launching a
        # worker takes seconds and must not hold the lock, so without counting
        # the in-flight spawns every concurrent request would see the same
        # "there is room" snapshot and the cap would not bind at all.
        self._pending = 0

    # -- reaper ---------------------------------------------------------------

    def start_reaper(self):
        if self._reaper is not None:
            return
        self._reaper = threading.Thread(
            target=self._reap_loop, name="session-reaper", daemon=True)
        self._reaper.start()

    def _reap_loop(self):
        while not self._stop.wait(self.reaper_interval):
            try:
                self.reap()
            except Exception:
                log.exception("session reaper failed")

    def reap(self) -> int:
        """Close every session idle for longer than the TTL."""
        with self._lock:
            expired = [s for s in self._sessions.values()
                       if s.idle_for() > self.ttl or s.closed]
            for session in expired:
                self._sessions.pop(session.id, None)
        for session in expired:
            log.info("reaping idle session %s (%s), idle %.0fs",
                     session.id, session.evaluation.id, session.idle_for())
            session.close()
        return len(expired)

    # -- lifecycle ------------------------------------------------------------

    def create(self, evaluation) -> Session:
        """Open ``evaluation`` in a new session.

        The worker cap is what bounds memory use, so it is reserved *before* the
        process is launched: a slot is taken under the lock, the spawn happens
        outside it (it takes seconds), and the slot is released again if the
        spawn fails.  Checking the cap and inserting afterwards would let every
        simultaneous request pass the same check and blow straight through it --
        with a cap of 3, ten concurrent opens produced ten workers.

        If the cap is reached the least-recently-used *unlocked* session is
        evicted; if every session is genuinely busy the request is refused rather
        than starving the ones already running.
        """
        self.reap()

        victim = self._reserve_slot()
        if victim is not None:
            log.info("evicting LRU session %s to make room", victim.id)
            victim.close()

        session_id = uuid.uuid4().hex
        try:
            session = Session(session_id, evaluation,
                              omp_threads=self.omp_threads, timeout=self.timeout)
        except Exception as err:
            with self._lock:
                self._pending -= 1
            raise SessionError(
                f"could not start AZURE2 for {evaluation.id}: {err}") from err

        with self._lock:
            self._pending -= 1
            self._sessions[session_id] = session
        log.info("opened session %s for %s (%d/%d slots in use)",
                 session_id, evaluation.id, len(self._sessions),
                 self.max_sessions)
        return session

    def _reserve_slot(self) -> Optional[Session]:
        """Take one worker slot, evicting if needed.

        Returns a session the caller must close (evicted to make room), or
        ``None``.  Raises :class:`SessionError` if no slot can be freed.  The
        reservation is counted in ``_pending`` so concurrent callers see it.
        """
        with self._lock:
            if len(self._sessions) + self._pending < self.max_sessions:
                self._pending += 1
                return None

            victim = self._evict_candidate()
            if victim is None:
                raise SessionError(
                    f"all {self.max_sessions} model slots are busy; "
                    "please try again shortly")
            self._sessions.pop(victim.id, None)
            self._pending += 1
            return victim

    def _evict_candidate(self) -> Optional[Session]:
        """The least-recently-used session that nobody is mid-request on.

        "Idle" means the session's lock is free: every use of a worker holds it,
        so a session whose lock can be taken is not being calculated on right
        now.  (Comparing ``idle_for() > 0`` instead would match essentially every
        session, since time always advances, and would happily evict a worker
        out from under a running calculation.)  Caller holds ``_lock``.
        """
        free = []
        for session in self._sessions.values():
            if session._lock.acquire(blocking=False):
                session._lock.release()
                free.append(session)
        if not free:
            return None
        return min(free, key=lambda s: s.last_used)

    def get(self, session_id) -> Session:
        with self._lock:
            session = self._sessions.get(session_id)
        if session is None or session.closed:
            raise SessionError(
                "this model session has expired; please reopen the evaluation")
        return session

    def close(self, session_id):
        with self._lock:
            session = self._sessions.pop(session_id, None)
        if session is not None:
            session.close()

    def close_all(self):
        """Shut down every session this manager owns."""
        self._stop.set()
        with self._lock:
            sessions = list(self._sessions.values())
            self._sessions.clear()
        for session in sessions:
            session.close()

    def stats(self) -> List[Dict]:
        with self._lock:
            sessions = list(self._sessions.values())
        return [{"id": s.id, "evaluation": s.evaluation.id,
                 "idle_seconds": round(s.idle_for(), 1),
                 "modified": s.is_modified}
                for s in sessions]
