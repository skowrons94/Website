"""Per-session AZURE2 models.

Opening an evaluation starts an AZURE2 worker process that lives until the user
stops touching it.  Each session owns exactly one worker, so two people (or two
browser tabs) editing levels cannot overwrite each other's parameters -- which
the previous single-shared-instance design could not avoid.

Three invariants this module exists to keep:

* **One caller at a time per worker -- and only per worker.**  A session's
  models live in separate processes (``engine.ROLES``: data, fine, extrap,
  grid), and a pipe carries one request at a time, so each role has a lock
  of its own (:meth:`Session.use`).  A background preparation of the
  extrapolations therefore never holds up an edit, which needs the data
  (and, once built, the fine) worker only.
* **The latest edit wins.**  Edits are numbered as they arrive and applied
  to the parameter vector at once; an edit still waiting for its
  calculation when a newer one arrives is not calculated, and answers with
  the newer one's result (:meth:`Session.edit`).
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
import os
import signal
import threading
import time
import uuid
from typing import Dict, List, Optional

from app import cache
from app.engine import PREPARE_STEPS, ROLES, Engine, EngineError

log = logging.getLogger(__name__)


class SessionError(RuntimeError):
    """Raised when a session cannot be created or is no longer usable."""


class ModelError(SessionError):
    """AZURE2 could not start the evaluation's model at all (a broken or
    missing data file, an absolute path from another machine...): reopening
    will not help, so it is reported as such rather than as an expired session.
    ``python -m app.check <id>`` says what is wrong with the files."""


class CapacityError(SessionError):
    """Every model slot is busy: the client should retry after a while
    (HTTP 503 with ``Retry-After``), not reopen at once."""

    def __init__(self, message, retry_after=10):
        super().__init__(message)
        self.retry_after = retry_after


# Which worker each calculation runs on.
ROLE_OF = {"data": "data", "fine": "fine", "extrap": "extrap", "grid": "grid"}


class Session:
    """One open evaluation: an AZURE2 worker plus the parameters being edited.

    The parameter vector holds only the model's *free* parameters --
    ``ModelInfo.parameters`` describes all of them, fixed included -- so a
    parameter's slot here is its ``free_index``, never its ``index``.  Confusing
    the two silently edits the wrong parameter.
    """

    def __init__(self, session_id, evaluation, omp_threads=None, timeout=None,
                 prepare_threads=None, prepare_slots=None):
        self.id = session_id
        self.evaluation = evaluation
        self.created_at = time.time()
        self.last_used = time.time()
        # Last sign of life from the page (a request or POST .../ping), and
        # whether the page sends heartbeats at all (then it may be dropped
        # soon after they stop; see SessionManager.reap).
        self.last_seen = time.time()
        self.heartbeat = False
        self._locks = {role: threading.RLock() for role in ROLES}
        self._params_lock = threading.Lock()
        self._busy = 0                     # user requests using a worker
        self._closed = False
        self._prepare_slots = prepare_slots
        self.timeout = timeout or 600

        kwargs = {} if timeout is None else {"timeout": timeout}
        if prepare_threads:
            kwargs["prepare_threads"] = prepare_threads
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

        # The last result of each calculation, with the parameters it was
        # calculated for: /fine and /data after an edit ask again for what
        # the edit's own response already calculated.
        self._memo = {}
        # Preparation steps done (engine.PREPARE_STEPS), the one under way.
        self.prepared = set()
        self.preparing = None
        self._step_started = None
        self._fine_built = False
        # Handed over from a spare (ready, or still being prepared).
        self.from_spare = False
        # The page that opened it (``?client=`` on /open), if it said.
        self.client = None
        # Called with (key, seconds) when a step is measured (prepare_<step>),
        # so the manager keeps the last duration of each step on this server.
        self.on_measured = None
        # Paused at some point during the step under way (its duration then
        # says nothing about how long the step takes).
        self._paused_in_step = False
        # When each step started (time.time()), and how long it took.
        self.step_started = {}
        self.step_took = {}
        # Called with +1/-1 around a visitor's own preparation (not a
        # spare's), so the manager can give it the machine (SessionManager).
        self.on_visitor_work = None
        self._paused = False
        # When each derived worker was last used (idle ones are closed).
        self.role_used = {}

        # Edits: numbered on arrival; the last one calculated and its answer.
        self._edit_gen = 0
        self._edit_lock = threading.Lock()
        self._edit_done = threading.Condition()
        self._done = (0, None)
        self._edits_active = 0
        self._seq = None

    # -- lifecycle ------------------------------------------------------------

    @property
    def closed(self) -> bool:
        return self._closed

    def touch(self):
        self.last_used = self.last_seen = time.time()

    def ping(self):
        """A heartbeat from the page: the visitor still has it open."""
        self.heartbeat = True
        self.last_seen = time.time()

    def idle_for(self) -> float:
        return time.time() - self.last_used

    def unseen_for(self) -> float:
        return time.time() - self.last_seen

    def busy(self) -> bool:
        """Is a visitor's request using this session right now?  (A
        background preparation does not count.)"""
        return self._busy > 0 or self._edits_active > 0

    @property
    def is_spare(self) -> bool:
        return self.id.startswith("spare-")

    def pause(self):
        """Stop this session's worker processes (SIGSTOP) -- a spare being
        built while a visitor's own model is prepared -- so the visitor gets
        the cores.  :meth:`resume` lets them go on."""
        self._signal(True)

    def resume(self):
        self._signal(False)

    def _signal(self, stop):
        sig = getattr(signal, "SIGSTOP" if stop else "SIGCONT", None)
        if sig is None or self._paused == stop or (stop and self._closed):
            return
        self._paused = stop
        if stop:
            self._paused_in_step = True
        try:
            pids = self.engine.pids() if hasattr(self.engine, "pids") else {}
        except Exception:
            pids = {}
        for pid in (pids or {}).values():
            if pid:
                try:
                    os.kill(pid, sig)
                except OSError:
                    pass

    def close(self):
        """Stop the workers.  Takes no lock: a calculation under way on
        another thread gets an error from its worker rather than keeping the
        session (and its memory) alive until it ends."""
        if self._closed:
            return
        if self._paused:
            self.resume()
        self._closed = True
        with self._edit_done:
            self._edit_done.notify_all()
        try:
            self.engine.close()
        except Exception:            # never let cleanup raise
            log.exception("error closing AZURE2 for session %s", self.id)

    # -- guarded access -------------------------------------------------------

    def use(self, role="data", background=False):
        """Context manager serializing access to one of the session's
        workers (``engine.ROLES``); different roles run concurrently.

        ``with session.use("fine"):`` around a block that talks to that
        worker.  ``background`` marks a use no visitor is waiting for (a
        preparation), which does not keep the session from being evicted.
        """
        return _SessionUse(self, role, background)

    def _check_alive(self):
        if self._closed:
            raise SessionError("session has been closed")
        if not self.engine.is_alive():
            # The worker died under us; a stale handle would fail in confusing
            # ways, so surface it as a dead session instead.
            self._closed = True
            raise SessionError("the AZURE2 process for this session has exited")

    def role_busy(self, role) -> bool:
        lock = self._locks[role]
        if lock.acquire(blocking=False):
            lock.release()
            return False
        return True

    # -- parameters -----------------------------------------------------------

    def snapshot(self) -> tuple:
        """The parameter vector now, as an immutable copy."""
        with self._params_lock:
            return tuple(self.params)

    def set_parameters(self, updates):
        """Apply ``{free_index: value}`` updates to the working vector.

        Returns the number of parameters actually changed.  An out-of-range or
        non-free index is an error rather than a silent no-op, because the
        caller believing it edited a level it did not is the worst outcome.
        Nothing is applied unless every update is valid.
        """
        n = len(self.params)
        clean = {}
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
            clean[index] = value
        changed = 0
        with self._params_lock:
            for index, value in clean.items():
                if self.params[index] != value:
                    self.params[index] = value
                    changed += 1
        return changed

    def reset_parameters(self):
        """Restore the parameters captured when the session opened."""
        with self._params_lock:
            self.params = list(self.initial_params)

    @property
    def is_modified(self) -> bool:
        return list(self.snapshot()) != self.initial_params

    # -- edits: the latest wins -------------------------------------------------

    @property
    def generation(self) -> int:
        return self._edit_gen

    def begin_edit(self, updates=None, reset=False, seq=None) -> int:
        """Apply an edit (or a reset) to the parameters at once and number it.

        ``seq``, when the client numbers its edits, drops an edit that
        arrives after a later one (a reordered request) instead of letting
        it overwrite newer values.  Returns the edit's generation.
        """
        with self._params_lock:
            stale = (seq is not None and self._seq is not None and seq < self._seq)
        if not stale:
            if reset:
                self.reset_parameters()
            else:
                self.set_parameters(updates or {})
        with self._params_lock:
            if seq is not None and not stale:
                self._seq = seq
            if not stale:
                self._edit_gen += 1
            return self._edit_gen if not stale else -1

    def edit(self, gen, calculate, wait_superseded=True):
        """Calculate edit ``gen`` -- ``calculate(params)`` -- unless a newer
        edit has arrived meanwhile.

        Returns ``(result, superseded)``.  A superseded edit is not
        calculated: it waits for the newest one and returns its result
        (``wait_superseded``), or returns ``None`` at once.
        """
        with self._edit_done:
            self._edits_active += 1
        try:
            if gen >= 0:
                with self._edit_lock:
                    with self._params_lock:
                        latest, params = self._edit_gen, tuple(self.params)
                    if gen == latest:
                        try:
                            result = calculate(params)
                        except BaseException:
                            self._finish(latest, None)
                            raise
                        self._finish(latest, result)
                        return result, False
            if not wait_superseded:
                return None, True
            with self._edit_done:
                target = self._edit_gen
                self._edit_done.wait_for(
                    lambda: self._done[0] >= target or self._closed,
                    timeout=self.timeout)
                return self._done[1], True
        finally:
            with self._edit_done:
                self._edits_active -= 1

    def _finish(self, gen, result):
        with self._edit_done:
            if gen >= self._done[0]:
                self._done = (gen, result)
            self._edit_done.notify_all()

    # -- calculations ---------------------------------------------------------

    def calculate_data(self, params=None):
        """Cross sections and S-factors for every data segment, at the current
        parameters.  Returns ``(mu, mu_sfactor)``."""
        return self._cached("data", self.engine.calculate_data, params)

    def calculate_extrapolations(self, params=None):
        """Energies, angles, cross sections and S-factors for every
        extrapolation segment.  Returns ``(energies, angles, mu, mu_sfactor)``."""
        return self._cached("extrap", self.engine.calculate_extrapolations, params)

    def calculate_fine(self, params=None):
        """The model on a fine grid per data segment, at the current
        parameters: ``(index, energies, mu, mu_sfactor, angles, axes)``."""
        result = self._cached("fine", self.engine.calculate_fine, params)
        return result

    def calculate_grid(self, params=None):
        """The extrapolations' energy × angle grids
        (:func:`app.engine.grid_curves`)."""
        return self._cached("grid", self.engine.calculate_grid, params)

    def fine_ready(self, params=None) -> bool:
        """Can the fine grid be calculated without first building its model?

        True at the shipped parameters when the cache holds it, or once the
        worker has built the derived model (and is not busy building it);
        used to decide whether an edit's response may include the fine
        curves without a long wait.
        """
        params = self.snapshot() if params is None else params
        if list(params) == self.initial_params and \
                cache.read(self.evaluation.path, params, "fine", unedited=True) is not None:
            return True
        return (self._fine_built and self.preparing != "fine"
                and self.engine.has_role("fine"))

    def peek(self, key):
        """``key``'s result if it can be had without the worker -- the
        evaluation's own parameters, cached -- else ``None``.  Needs no lock,
        so a page reading cached curves never waits behind a calculation or
        a background preparation."""
        if self._closed:
            raise SessionError("session has been closed")
        self.touch()
        params = self.snapshot()
        memo = self._memo.get(key)
        if memo is not None and memo[0] == params:
            return memo[1]
        if list(params) != self.initial_params:
            return None
        hit = cache.read(self.evaluation.path, list(params), key, unedited=True)
        if hit is not None:
            self._memo[key] = (params, hit)
        return hit

    def prepare(self, step, background=False):
        """Build one derived model ahead of need (``engine.PREPARE_STEPS``),
        so that the first edit does not wait for it.  Idempotent; holds only
        that model's lock (and a machine-wide preparation slot)."""
        if step not in ROLES:
            raise ValueError(f"unknown preparation step: {step}")
        if step in self.prepared:
            return False
        # A spare's build is throttled by the manager instead (it waits for
        # the machine to be free of visitors, and is paused while one
        # prepares): it must not hold a slot a visitor is waiting for.
        visitor = not self.is_spare
        slots = self._prepare_slots if visitor else None
        hook = self.on_visitor_work if visitor else None
        if hook is not None:
            hook(+1)
        if slots is not None:
            slots.acquire()
        try:
            with self.use(step, background=background):
                if step in self.prepared:
                    return False
                self.preparing = step
                started = self._step_started = time.time()
                self.step_started[step] = started
                self._paused_in_step = self._paused
                try:
                    self.engine.prepare(step)
                except EngineError as err:
                    if not self.engine.is_alive():
                        self._closed = True
                        raise SessionError(str(err)) from err
                    # The model could not be built; the calculation that needs it
                    # will report that when it is asked for.
                    log.warning("session %s (%s): preparing %s failed: %s",
                                self.id, self.evaluation.id, step, err)
                finally:
                    self.preparing = None
                    self._step_started = None
                self.prepared.add(step)
                self.role_used[step] = time.time()
                if step == "fine":
                    self._fine_built = True
                took = time.time() - started
                self.step_took[step] = round(took, 2)
                log.info("session %s (%s): prepared %s in %.1f s", self.id,
                         self.evaluation.id, step, took)
                if self.on_measured is not None and not self._paused_in_step:
                    try:
                        self.on_measured(f"prepare_{step}", took)
                    except Exception:
                        log.exception("recording a timing failed")
                return True
        finally:
            if slots is not None:
                slots.release()
            if hook is not None:
                hook(-1)

    def prepare_all(self, steps=PREPARE_STEPS, quiet=0.5, gate=None):
        """Prepare ``steps`` in order, in the background, giving way to edits:
        a step starts only once no edit is being calculated (for ``quiet``
        seconds) and ``gate()``, when given, is true (a spare waits for the
        visitors' own preparations).  Returns when done, or when the session
        closes."""
        for step in steps:
            waited = 0.0
            while not self._closed and waited < 120:
                if self._edits_active == 0:
                    time.sleep(quiet)
                    if self._edits_active == 0:
                        break
                time.sleep(0.05)
                waited += 0.05
            while gate is not None and not self._closed and self.is_spare and not gate():
                time.sleep(0.1)
            if self._closed:
                return
            try:
                self.prepare(step, background=True)
            except SessionError:
                return
            except Exception:
                log.exception("session %s: background preparation of %s failed",
                              self.id, step)

    def start_preparation(self, steps=PREPARE_STEPS):
        """:meth:`prepare_all` on a thread of its own."""
        thread = threading.Thread(target=self.prepare_all, args=(tuple(steps),),
                                  name=f"prepare-{self.id[:8]}", daemon=True)
        thread.start()
        return thread

    def close_idle_role(self, role, ttl) -> bool:
        """Stop a derived worker (extrap, grid) unused for ``ttl`` seconds,
        to give its memory back; the next request starts it again."""
        if role == "data" or not self.engine.has_role(role):
            return False
        if time.time() - self.role_used.get(role, self.created_at) <= ttl:
            return False
        lock = self._locks[role]
        if not lock.acquire(blocking=False):
            return False
        try:
            self.engine.close_role(role)
            self.prepared.discard(role)
            for key in list(self._memo):
                if ROLE_OF.get(key) == role:
                    self._memo.pop(key, None)
            if role == "fine":
                self._fine_built = False
            return True
        finally:
            lock.release()

    def status(self) -> dict:
        started = self._step_started
        return {
            "prepared": [s for s in ROLES if s in self.prepared],
            "preparing": self.preparing,
            # How long the step under way has run, and what the background
            # still has to build: the page's timer scales its estimate by it.
            "preparing_elapsed": (round(time.time() - started, 1)
                                  if started and self.preparing else None),
            "pending": [s for s in PREPARE_STEPS if s not in self.prepared],
            # When each step started (epoch seconds; ``now`` is the server's
            # clock, to compare with) and how long the finished ones took.
            "step_started": {k: round(v, 2) for k, v in self.step_started.items()},
            "step_took": dict(self.step_took),
            "now": round(time.time(), 2),
            "from_spare": self.from_spare,
            "paused": self._paused,
            "running": [r for r in ROLES if self.engine.has_role(r)],
            "busy": [r for r in ROLES if self.role_busy(r)],
            "modified": self.is_modified,
            "generation": self._edit_gen,
            "fine_ready": self.fine_ready(),
        }

    def _cached(self, key, method, params=None):
        """At the evaluation's own parameters, answer from ``app.cache`` when
        it can and fill it when it cannot; after an edit, calculate -- once
        per parameter vector.  Holds the lock of the worker ``key`` runs on."""
        role = ROLE_OF[key]
        params = self.snapshot() if params is None else tuple(params)
        memo = self._memo.get(key)
        if memo is not None and memo[0] == params:
            return memo[1]
        with self.use(role):
            memo = self._memo.get(key)
            if memo is not None and memo[0] == params:
                return memo[1]
            unedited = list(params) == self.initial_params
            result = None
            if unedited:
                result = cache.read(self.evaluation.path, params, key, unedited=True)
            if result is None:
                result = self._engine_call(method, params)
                if unedited:
                    cache.write(self.evaluation.path, params, key, result, unedited=True)
                if role != "data":
                    self.role_used[role] = time.time()
                if key == "fine":
                    self._fine_built = True
            self._memo[key] = (params, result)
            return result

    def _engine_call(self, method, params):
        """Run one engine call, reporting a lost worker as a dead session.

        A worker that has died cannot be revived -- its model state is gone --
        so the session is closed and the client is told to reopen, which is what
        the 409 in the routes means.  A derived worker (fine, extrap, grid)
        that dies is only that: the next call starts it again.
        """
        try:
            return method(list(params))
        except EngineError as err:
            if not self.engine.is_alive():
                self._closed = True
                raise SessionError(str(err)) from err
            raise


_WAITING = threading.Lock()


class _SessionUse:
    def __init__(self, session, role="data", background=False):
        if role not in session._locks:
            raise ValueError(f"unknown role: {role}")
        self._session = session
        self._role = role
        self._background = background

    def __enter__(self):
        session = self._session
        if not self._background:
            with _WAITING:
                session._busy += 1
        try:
            session._locks[self._role].acquire()
        except BaseException:
            self._leave()
            raise
        try:
            session._check_alive()
        except Exception:
            session._locks[self._role].release()
            self._leave()
            raise
        return session

    def _leave(self):
        if not self._background:
            with _WAITING:
                self._session._busy -= 1

    def __exit__(self, *exc):
        if not self._background:
            self._session.touch()
        self._session._locks[self._role].release()
        self._leave()
        return False


class SessionManager:
    """Creates, tracks and reaps :class:`Session` objects.

    Lifetimes: a session whose page sends heartbeats (``POST
    /api/sessions/<id>/ping``) is closed ``heartbeat_ttl`` seconds after
    they stop (the tab is gone), or after ``idle_ttl`` seconds of
    heartbeats with no use; a session without heartbeats (an older page)
    after ``ttl`` seconds without a request.  The extrapolations' workers,
    the largest, are closed after ``role_ttl`` seconds unused.
    """

    def __init__(self, ttl=600, max_sessions=8, reaper_interval=60,
                 omp_threads=None, timeout=None, heartbeat_ttl=120,
                 idle_ttl=3600, role_ttl=300, prepare_threads=None,
                 prepare_concurrency=None, auto_prepare=False, retry_after=15,
                 spares=None, spare_delay=3, evict_after=None, spare_wait=20,
                 spare_quiet=2.0):
        self.ttl = ttl
        self.max_sessions = max_sessions
        self.reaper_interval = reaper_interval
        self.omp_threads = omp_threads
        self.timeout = timeout
        self.heartbeat_ttl = heartbeat_ttl
        self.idle_ttl = idle_ttl
        self.role_ttl = role_ttl
        self.prepare_threads = prepare_threads
        self.auto_prepare = auto_prepare
        self.retry_after = retry_after
        self.prepare_slots = (threading.BoundedSemaphore(prepare_concurrency)
                              if prepare_concurrency else None)
        self._sessions: Dict[str, Session] = {}
        self._lock = threading.Lock()
        self._stop = threading.Event()
        self._reaper = None
        # Slots reserved by a create() that is still spawning.  Launching a
        # worker takes seconds and must not hold the lock, so without counting
        # the in-flight spawns every concurrent request would see the same
        # "there is room" snapshot and the cap would not bind at all.
        self._pending = 0
        # Spare sessions: opened and prepared ahead of any visitor, for the
        # evaluations whose opening and preparation are slow (⁷Be, ²⁴Mg:
        # 3 s to open and 10-40 s to prepare), and handed to the next
        # visitor as they are -- at the shipped parameters, never used --
        # so the scheme comes at once and the first edit takes what an edit
        # takes.  ``spares`` maps an evaluation id to how many to keep.
        self.spares = dict(spares or {})
        # Optional: evaluation -> how many spares, asked again at each open
        # (an evaluation warmed after startup gets its spare then).
        self.spare_policy = None
        self.spare_delay = spare_delay
        self._spare = {}                    # evaluation id -> [Session]
        self._spare_building = set()
        self._spare_evaluations = {}
        # Spares being built: evaluation id -> [record], a record being
        # {"session": Session or None while its worker starts, "claimed":
        # bool}.  A visitor who arrives meanwhile takes the one under way
        # (waiting up to ``spare_wait`` seconds for its worker to start)
        # rather than starting a second, competing build.
        self._wip = {}
        self._wip_cond = threading.Condition(self._lock)
        # One spare is built at a time (each build takes every core).
        self._spare_build = threading.Lock()
        self.spare_wait = spare_wait
        # Visitors' own preparations under way (their sessions opening or
        # building models): spares are built only when there is none (for
        # ``spare_quiet`` seconds), and paused while one runs.
        self._visitor_work = 0
        self._visitor_quiet_since = time.time()
        self.spare_quiet = spare_quiet
        # A session seen (a request or a heartbeat) within ``evict_after``
        # seconds is never evicted to make room: a visible page pings every
        # heartbeat_ttl/4 seconds.  None: twice that interval, at least 60 s.
        if evict_after is None:
            evict_after = max(60.0, 2 * max(5, heartbeat_ttl // 4))
        self.evict_after = evict_after
        # The last measured duration of each step on this server, by
        # evaluation: {"7Be": {"open_cold": 2.1, "prepare_fine": 13.0}}.
        # The page's timer counts down from these (live, unlike the
        # warm-up's timings in initial.json).
        self._measured: Dict[str, Dict[str, float]] = {}

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

    def record(self, evaluation_id, key, seconds):
        """Keep ``seconds`` as the last measured duration of ``key``
        (open_cold, prepare_<step>) for ``evaluation_id``."""
        with self._lock:
            self._measured.setdefault(evaluation_id, {})[key] = round(float(seconds), 2)

    def measured(self, evaluation_id) -> Dict[str, float]:
        with self._lock:
            return dict(self._measured.get(evaluation_id, {}))

    def availability(self, evaluation_id) -> Dict:
        """What a page about to open ``evaluation_id`` can expect: a spare
        ready (opening takes a moment) or being built (it is handed over
        unfinished), or neither (a cold open), and the builds sharing the
        cores now."""
        with self._lock:
            ready = any(not s.closed for s in self._spare.get(evaluation_id, []))
            building = any(not r["claimed"] and not r.get("cancelled")
                           for r in self._wip.get(evaluation_id, []))
            full = (len(self._sessions) + self._pending + self._spare_count()
                    >= self.max_sessions)
        return {"spare_ready": ready, "spare_building": building,
                "full": full, "builds": self.builds(),
                "measured": self.measured(evaluation_id)}

    def _measuring(self, session):
        evaluation_id = session.evaluation.id
        session.on_measured = lambda key, seconds: self.record(evaluation_id, key, seconds)

    def expired(self, session) -> bool:
        if session.closed:
            return True
        if session.busy():
            return False
        if session.client and not session.heartbeat:
            # Opened by a page that sends heartbeats (it named itself on
            # /open) but never pinged: the page moved on while the session
            # was opening (a client-side navigation), so nobody will.
            return session.unseen_for() > self.heartbeat_ttl
        if session.heartbeat:
            return (session.unseen_for() > self.heartbeat_ttl
                    or session.idle_for() > self.idle_ttl)
        return session.idle_for() > self.ttl

    def reap(self) -> int:
        """Close every expired session (see the class docstring), and the
        idle extrapolation workers of the others."""
        with self._lock:
            expired = [s for s in self._sessions.values() if self.expired(s)]
            for session in expired:
                self._sessions.pop(session.id, None)
            alive = list(self._sessions.values())
        for session in expired:
            log.info("reaping idle session %s (%s), idle %.0fs, unseen %.0fs",
                     session.id, session.evaluation.id, session.idle_for(),
                     session.unseen_for())
            session.close()
        # Spares evicted to make room come back once there is room again.
        for evaluation in list(self._spare_evaluations.values()):
            self._replenish_later(evaluation, delay=0)
        if self.role_ttl:
            for session in alive:
                for role in ("grid", "extrap"):
                    try:
                        if session.close_idle_role(role, self.role_ttl):
                            log.info("closed idle %s worker of session %s (%s)",
                                     role, session.id, session.evaluation.id)
                    except Exception:
                        log.exception("closing the %s worker of %s failed",
                                      role, session.id)
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

        A spare session of this evaluation, when one is ready, is handed over
        instead (and another one built a little later).  If the cap is
        reached a spare of another evaluation, else the least-recently-used
        session that no visitor is waiting on, is closed; if every session is
        genuinely busy the request is refused at once (:class:`CapacityError`,
        a 503) rather than starving the ones already running.
        """
        self.reap()
        if self.spare_policy is not None:
            try:
                self.spares[evaluation.id] = self.spare_policy(evaluation)
            except Exception:
                log.exception("spare policy failed for %s", evaluation.id)

        spare = self._take_spare(evaluation.id)
        if spare is None:
            spare = self._claim_building(evaluation.id)
        if spare is not None:
            log.info("opened session %s for %s from a spare%s (%d/%d slots in use)",
                     spare.id, evaluation.id,
                     "" if PREPARE_STEPS[-1] in spare.prepared else " still being prepared",
                     len(self._sessions), self.max_sessions)
            self._replenish_later(evaluation)
            return spare

        victim = self._reserve_slot()
        if victim is not None:
            log.info("evicting %s %s (%s) to make room",
                     "spare" if victim.id.startswith("spare-") else "LRU session",
                     victim.id, victim.evaluation.id)
            victim.close()

        session_id = uuid.uuid4().hex
        self._visitor_working(+1)
        opening = time.time()
        try:
            session = Session(session_id, evaluation,
                              omp_threads=self.omp_threads, timeout=self.timeout,
                              prepare_threads=self.prepare_threads,
                              prepare_slots=self.prepare_slots)
        except Exception as err:
            with self._lock:
                self._pending -= 1
            raise ModelError(
                f"could not start AZURE2 for {evaluation.id}: {err} "
                f"(python -m app.check {evaluation.id} says what is wrong)") from err
        finally:
            self._visitor_working(-1)
        session.on_visitor_work = self._visitor_working
        self.record(evaluation.id, "open_cold", time.time() - opening)
        self._measuring(session)

        with self._lock:
            self._pending -= 1
            self._sessions[session_id] = session
        log.info("opened session %s for %s (%d/%d slots in use)",
                 session_id, evaluation.id, len(self._sessions),
                 self.max_sessions)
        if self.auto_prepare:
            session.start_preparation()
        if self.spares.get(evaluation.id):
            self._replenish_later(evaluation)
        return session

    # -- spares ----------------------------------------------------------------

    def _spare_count(self) -> int:
        return sum(len(v) for v in self._spare.values())

    def _take_spare(self, evaluation_id) -> Optional[Session]:
        with self._lock:
            pool = self._spare.get(evaluation_id) or []
            while pool:
                spare = pool.pop(0)
                if spare.closed or not spare.engine.is_alive():
                    continue
                self._adopt(spare)
                return spare
        return None

    def _adopt(self, spare):
        """Make a spare a visitor's session (caller holds ``_lock``)."""
        spare.id = uuid.uuid4().hex
        spare.from_spare = True
        spare.touch()
        spare.created_at = time.time()
        spare.role_used = {role: time.time() for role in spare.role_used}
        spare.on_visitor_work = self._visitor_working
        self._sessions[spare.id] = spare

    def _claim_building(self, evaluation_id) -> Optional[Session]:
        """Take a spare of ``evaluation_id`` that is still being built, if
        there is one: its preparation goes on, now as this visitor's (and
        with priority).  Waits up to ``spare_wait`` seconds for its worker to
        start."""
        deadline = time.time() + self.spare_wait
        with self._wip_cond:
            while True:
                records = [r for r in self._wip.get(evaluation_id, [])
                           if not r["claimed"] and not r.get("cancelled")]
                if not records:
                    return None
                ready = [r for r in records if r["session"] is not None
                         and not r["session"].closed]
                if ready:
                    record = ready[0]
                    record["claimed"] = True
                    spare = record["session"]
                    if record["counted"]:
                        record["counted"] = False
                        self._pending -= 1
                    self._adopt(spare)
                    break
                left = deadline - time.time()
                if left <= 0:
                    return None
                self._wip_cond.wait(min(left, 0.5))
        spare.resume()
        return spare

    def _visitor_working(self, delta):
        """A visitor's preparation starts (+1) or ends (-1): spares being
        built are paused while any runs."""
        with self._lock:
            self._visitor_work += delta
            n = self._visitor_work
            if n == 0:
                self._visitor_quiet_since = time.time()
            building = [r["session"] for records in self._wip.values() for r in records
                        if r["session"] is not None and not r["claimed"]]
        for spare in building:
            if n > 0 and not spare._paused:
                log.info("pausing the spare %s (%s) while a visitor prepares",
                         spare.id, spare.evaluation.id)
                spare.pause()
            elif n == 0 and spare._paused:
                log.info("resuming the spare %s (%s)", spare.id, spare.evaluation.id)
                spare.resume()

    def visitors_quiet(self) -> bool:
        """No visitor's preparation has run for ``spare_quiet`` seconds."""
        with self._lock:
            return (self._visitor_work == 0
                    and time.time() - self._visitor_quiet_since >= self.spare_quiet)

    def builds(self) -> int:
        """Model builds running now, spares included (paused ones not)."""
        with self._lock:
            sessions = list(self._sessions.values())
            sessions += [r["session"] for records in self._wip.values() for r in records
                         if r["session"] is not None and not r["claimed"]]
        return sum(1 for s in sessions if s.preparing and not s._paused)

    def start_spares(self, evaluations):
        """Build the configured spares (on a thread; at startup)."""
        for evaluation in evaluations:
            if self.spares.get(evaluation.id):
                self._spare_evaluations[evaluation.id] = evaluation
                self._replenish_later(evaluation, delay=0)

    def _replenish_later(self, evaluation, delay=None):
        if not self.spares.get(evaluation.id) or self._stop.is_set():
            return
        with self._lock:
            if evaluation.id in self._spare_building:
                return
            self._spare_building.add(evaluation.id)
        delay = self.spare_delay if delay is None else delay
        thread = threading.Thread(target=self._replenish, args=(evaluation, delay),
                                  name=f"spare-{evaluation.id}", daemon=True)
        thread.start()

    def _replenish(self, evaluation, delay):
        """Build spares of ``evaluation`` up to its count, while there is
        room under the cap -- after ``delay`` seconds, and only once no
        visitor's own preparation has run for ``spare_quiet`` seconds (a
        visitor never shares the cores with a spare: one being built is
        paused while a visitor prepares, see :meth:`_visitor_working`)."""
        try:
            if delay and self._stop.wait(delay):
                return
            while not self._stop.is_set():
                while not self.visitors_quiet() or not self._spare_build.acquire(blocking=False):
                    if self._stop.wait(0.25):
                        return
                try:
                    if not self._build_one_spare(evaluation):
                        return
                finally:
                    self._spare_build.release()
        finally:
            with self._lock:
                self._spare_building.discard(evaluation.id)

    def _build_one_spare(self, evaluation) -> bool:
        """Build one spare of ``evaluation`` (see :meth:`_replenish`):
        False when there is nothing (more) to build or no room."""
        with self._lock:
            have = len([s for s in self._spare.get(evaluation.id, []) if not s.closed])
            have += len([r for r in self._wip.get(evaluation.id, []) if not r["claimed"]])
            room = (len(self._sessions) + self._pending + self._spare_count()
                    < self.max_sessions)
            if have >= self.spares.get(evaluation.id, 0) or not room:
                return False
            self._pending += 1
            record = {"session": None, "claimed": False, "counted": True}
            self._wip.setdefault(evaluation.id, []).append(record)
        try:
            opening = time.time()
            spare = Session(f"spare-{uuid.uuid4().hex}", evaluation,
                            omp_threads=self.omp_threads, timeout=self.timeout,
                            prepare_threads=self.prepare_threads,
                            prepare_slots=self.prepare_slots)
            self.record(evaluation.id, "open_cold", time.time() - opening)
            self._measuring(spare)
        except Exception:
            log.exception("could not open a spare session of %s", evaluation.id)
            with self._wip_cond:
                if record["counted"]:
                    self._pending -= 1
                self._wip[evaluation.id].remove(record)
                self._wip_cond.notify_all()
            return False
        with self._wip_cond:
            record["session"] = spare
            self._wip_cond.notify_all()
            paused = self._visitor_work > 0
            cancelled = record.get("cancelled")
            if cancelled:
                self._wip[evaluation.id].remove(record)
        if cancelled:
            spare.close()
            return False
        if paused:
            spare.pause()
        spare.prepare_all(quiet=0, gate=lambda: self._visitor_work == 0)
        with self._wip_cond:
            self._wip[evaluation.id].remove(record)
            if record["counted"]:
                self._pending -= 1
            if record["claimed"]:
                log.info("spare session of %s, taken while being built, is prepared (%s)",
                         evaluation.id, ", ".join(sorted(spare.prepared)))
                return True
            if self._stop.is_set() or spare.closed:
                spare.close()
                return False
            self._spare.setdefault(evaluation.id, []).append(spare)
        log.info("spare session of %s ready (prepared: %s)", evaluation.id,
                 ", ".join(sorted(spare.prepared)))
        return True

    def _reserve_slot(self) -> Optional[Session]:
        """Take one worker slot, evicting if needed.

        Returns a session the caller must close (a spare of another
        evaluation, or the LRU idle one, evicted to make room), or ``None``.
        Raises :class:`CapacityError` if no slot can be freed.  The
        reservation is counted in ``_pending`` so concurrent callers see it.
        """
        with self._lock:
            if len(self._sessions) + self._pending + self._spare_count() < self.max_sessions:
                self._pending += 1
                return None

            victim = None
            for pool in self._spare.values():
                if pool:
                    victim = pool.pop()
                    break
            if victim is None:
                # A spare still being built gives way too: its build stops.
                cancelled = self._cancel_wip()
                if cancelled is not None:
                    self._pending += 1
                    return cancelled[0]
            if victim is None:
                victim = self._evict_candidate()
                if victim is None:
                    raise CapacityError(
                        f"all {self.max_sessions} model slots are busy; "
                        "please try again shortly", retry_after=self.retry_after)
                self._sessions.pop(victim.id, None)
            self._pending += 1
            return victim

    def _cancel_wip(self):
        """Stop a spare still being built, to free its slot (caller holds
        ``_lock``): ``(session or None while its worker starts,)``, or None
        if there is none.  Its build thread notices and lets it go."""
        for records in self._wip.values():
            for record in records:
                if record["claimed"] or record.get("cancelled"):
                    continue
                record["cancelled"] = True
                if record["counted"]:
                    record["counted"] = False
                    self._pending -= 1
                return (record["session"],)
        return None

    def _evict_candidate(self) -> Optional[Session]:
        """The session seen least recently, among those no visitor is
        mid-request on (a background preparation does not count) and not
        seen -- a request or a heartbeat -- for ``evict_after`` seconds: a
        page that is open and visible is never closed under its reader.
        Caller holds ``_lock``."""
        # A page that is open pings at once; a session that has never pinged
        # belongs to a page that went away before it could (or to a client
        # without heartbeats) and is protected only briefly.
        def grace(s):
            return self.evict_after if s.heartbeat else min(self.evict_after, 15.0)
        free = [s for s in self._sessions.values()
                if not s.busy() and s.unseen_for() >= grace(s)
                and s.idle_for() >= grace(s)]
        if not free:
            return None
        return min(free, key=lambda s: max(s.last_seen, s.last_used))

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

    # -- sessions by page (see routes.api.close_client) --------------------------

    _GONE_TTL = 600.0

    def attach_client(self, token, session) -> bool:
        """Record that the page ``token`` opened ``session``; False if that
        page has already gone (the caller then closes the session)."""
        with self._lock:
            clients = self.__dict__.setdefault("_clients", {})
            gone = self.__dict__.setdefault("_gone_clients", {})
            now = time.time()
            for t in [t for t, at in gone.items() if now - at > self._GONE_TTL]:
                del gone[t]
            if token in gone:
                return False
            clients.setdefault(token, set()).add(session.id)
            session.client = token
            return True

    def close_client(self, token) -> int:
        """Close every session the page ``token`` opened, and refuse any it
        still has on the way.  Returns how many were closed."""
        with self._lock:
            clients = self.__dict__.setdefault("_clients", {})
            gone = self.__dict__.setdefault("_gone_clients", {})
            gone[token] = time.time()
            ids = clients.pop(token, set())
        closed = 0
        for session_id in ids:
            with self._lock:
                present = session_id in self._sessions
            if present:
                self.close(session_id)
                closed += 1
        return closed

    def close_all(self):
        """Shut down every session this manager owns, spares included."""
        self._stop.set()
        with self._lock:
            sessions = list(self._sessions.values())
            self._sessions.clear()
            for pool in self._spare.values():
                sessions += pool
            self._spare.clear()
            sessions += [r["session"] for records in self._wip.values() for r in records
                         if r["session"] is not None and not r["claimed"]]
        for session in sessions:
            session.close()

    def stats(self) -> List[Dict]:
        with self._lock:
            sessions = list(self._sessions.values())
        return [{"id": s.id, "evaluation": s.evaluation.id,
                 "idle_seconds": round(s.idle_for(), 1),
                 "heartbeat": s.heartbeat,
                 "prepared": sorted(s.prepared),
                 "running": [r for r in ROLES if s.engine.has_role(r)],
                 "modified": s.is_modified}
                for s in sessions]
