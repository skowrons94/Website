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

    # An open evaluation owns an AZURE2 worker process for as long as someone is
    # using it.  Idle sessions are reaped after SESSION_TTL seconds, and at most
    # MAX_SESSIONS run at once -- together these bound memory use.
    SESSION_TTL = _int("AZURE2_SESSION_TTL", 1800)          # 30 minutes
    MAX_SESSIONS = _int("AZURE2_MAX_SESSIONS", 8)
    REAPER_INTERVAL = _int("AZURE2_REAPER_INTERVAL", 60)

    # OpenMP threads per worker.  Every session is a separate process, so left
    # unset each one claims all the cores and MAX_SESSIONS of them contend for
    # the same machine; one thread apiece keeps a small VPS responsive, and a
    # bigger box can afford more.
    OMP_THREADS = _int("AZURE2_OMP_THREADS", 1)

    # How long to wait for one engine call before declaring the worker wedged.
    # An uncached external-capture integral is the slow case, so this is minutes
    # rather than seconds.
    CALL_TIMEOUT = _int("AZURE2_CALL_TIMEOUT", 600)

    HOST = os.environ.get("AZURE2_HOST", "0.0.0.0")
    PORT = _int("AZURE2_PORT", 5001)
    THREADS = _int("AZURE2_THREADS", 10)

    LOG_FILE = os.environ.get("AZURE2_LOG_FILE",
                              os.path.join(_HERE, "access.log"))
