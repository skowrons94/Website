"""Server configuration, all overridable by environment variable."""

import os

_HERE = os.path.dirname(os.path.abspath(__file__))


def _int(name, default):
    try:
        return int(os.environ.get(name, default))
    except (TypeError, ValueError):
        return default


class Config:
    # Where evaluations live.  Each subdirectory holding a .azr file is one
    # evaluation; nothing needs registering.
    EVALUATIONS_DIR = os.environ.get(
        "AZURE2_EVALUATIONS_DIR", os.path.join(_HERE, "evaluations"))

    # An open evaluation owns AZURE2 worker processes for as long as someone is
    # using it, and at most MAX_SESSIONS run at once (a new visitor evicts the
    # least recently used idle one; when none is idle the answer is 503 with
    # Retry-After).  Lifetimes (app.session.SessionManager):
    # * a page that sends heartbeats (POST /api/sessions/<id>/ping) keeps its
    #   session until HEARTBEAT_TTL seconds after they stop, or IDLE_TTL
    #   seconds without an edit;
    # * a page that does not (an older client) until SESSION_TTL seconds
    #   without a request;
    # * the extrapolations' workers, the largest (⁷Be), are closed after
    #   ROLE_TTL seconds unused and started again on the next request.
    SESSION_TTL = _int("AZURE2_SESSION_TTL", 600)           # 10 minutes
    HEARTBEAT_TTL = _int("AZURE2_HEARTBEAT_TTL", 120)
    IDLE_TTL = _int("AZURE2_IDLE_TTL", 3600)
    ROLE_TTL = _int("AZURE2_ROLE_TTL", 300)
    MAX_SESSIONS = _int("AZURE2_MAX_SESSIONS", 8)
    REAPER_INTERVAL = _int("AZURE2_REAPER_INTERVAL", 30)
    RETRY_AFTER = _int("AZURE2_RETRY_AFTER", 15)

    # Build every derived model (data, smooth curves, extrapolations) in the
    # background as soon as a session opens, each holding only its own
    # worker, so the first edit does not wait for them.
    AUTO_PREPARE = _int("AZURE2_AUTO_PREPARE", 1) == 1

    # Spare sessions, opened and prepared before anyone asks, handed to the
    # next visitor of that evaluation (then replaced SPARE_DELAY seconds
    # later): "auto" keeps one for each evaluation whose warm-up timings
    # (initial.json) say opening and preparing take SPARE_THRESHOLD seconds
    # or more (⁷Be, ²⁴Mg); "7Be:1,24Mg:1" names them; "0" or "" none.  Each
    # costs the memory of an open session (DEPLOY.md) and counts against
    # MAX_SESSIONS (a visitor's session evicts a spare of another
    # evaluation first).
    SPARES = os.environ.get("AZURE2_SPARES", "auto")
    SPARE_THRESHOLD = _int("AZURE2_SPARE_THRESHOLD", 6)
    SPARE_DELAY = _int("AZURE2_SPARE_DELAY", 20)

    # OpenMP threads per worker.  Every session is a separate process, so left
    # unset each one claims all the cores and MAX_SESSIONS of them contend for
    # the same machine; one thread apiece keeps a small VPS responsive, and a
    # bigger box can afford more.
    OMP_THREADS = _int("AZURE2_OMP_THREADS", 1)
    # ... except while a worker *builds* a model (INITIALIZE: the
    # external-capture integrals), which does scale with threads (⁷Be's
    # preparation: 39 s on one, 13 s on four); edits do not (update_segments
    # is serial).  At most PREPARE_CONCURRENCY builds run at once.
    PREPARE_THREADS = _int("AZURE2_PREPARE_THREADS", os.cpu_count() or 1)
    PREPARE_CONCURRENCY = _int("AZURE2_PREPARE_CONCURRENCY",
                               max(1, (os.cpu_count() or 1) // 2))

    # gzip JSON responses for clients that accept it.  Behind Caddy (whose
    # `encode zstd gzip` leaves an already-encoded response alone) this is
    # harmless; set 0 to leave compression to the proxy alone.
    GZIP = _int("AZURE2_GZIP", 1) == 1
    GZIP_LEVEL = _int("AZURE2_GZIP_LEVEL", 5)

    # How long to wait for one engine call before declaring the worker wedged.
    # An uncached external-capture integral is the slow case, so this is minutes
    # rather than seconds.
    CALL_TIMEOUT = _int("AZURE2_CALL_TIMEOUT", 600)

    HOST = os.environ.get("AZURE2_HOST", "0.0.0.0")
    PORT = _int("AZURE2_PORT", 5001)
    THREADS = _int("AZURE2_THREADS", 10)

    LOG_FILE = os.environ.get("AZURE2_LOG_FILE",
                              os.path.join(_HERE, "access.log"))
