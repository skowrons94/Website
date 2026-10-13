"""Application factory."""

import atexit
import logging
import os
import signal
import sys

from flask import Flask
from flask_cors import CORS

from app.session import SessionManager
from app.utils.logging_config import setup_logging
from config import Config


def create_app(config=Config):
    app = Flask(__name__)
    app.config.from_object(config)
    CORS(app)

    setup_logging(app.config["LOG_FILE"])

    manager = SessionManager(
        ttl=app.config["SESSION_TTL"],
        max_sessions=app.config["MAX_SESSIONS"],
        reaper_interval=app.config["REAPER_INTERVAL"],
        omp_threads=app.config["OMP_THREADS"],
        timeout=app.config["CALL_TIMEOUT"],
        heartbeat_ttl=app.config["HEARTBEAT_TTL"],
        idle_ttl=app.config["IDLE_TTL"],
        role_ttl=app.config["ROLE_TTL"],
        prepare_threads=app.config["PREPARE_THREADS"],
        prepare_concurrency=app.config["PREPARE_CONCURRENCY"],
        auto_prepare=app.config["AUTO_PREPARE"],
        retry_after=app.config["RETRY_AFTER"],
        spare_delay=app.config.get("SPARE_DELAY", 3),
        spare_wait=app.config.get("SPARE_WAIT", 20),
        evict_after=app.config.get("EVICT_AFTER") or None,
    )
    if app.config.get("GZIP"):
        install_gzip(app, app.config.get("GZIP_LEVEL", 5))

    manager.start_reaper()
    app.extensions["sessions"] = manager

    # Workers are our own children and exit on their own when this process
    # goes -- their pipe closes and the blocking recv raises EOF -- so nothing
    # can be orphaned.  Closing them explicitly on a clean exit just frees the
    # memory sooner.
    atexit.register(manager.close_all)

    # atexit does NOT run on SIGTERM -- Python installs no handler, so the
    # default action terminates the interpreter outright.  That is the normal
    # way a container or `systemctl stop` ends this process, so without this the
    # workers would only notice at their next read.  Chain to any previously
    # installed handler rather than replacing it.
    def _terminate(signum, frame):
        log = logging.getLogger(__name__)
        log.info("received signal %s; closing %d AZURE2 session(s)",
                 signum, len(manager.stats()))
        manager.close_all()
        previous = _previous_handlers.get(signum)
        if callable(previous):
            previous(signum, frame)
        else:
            sys.exit(0)

    _previous_handlers = {}
    for sig in (signal.SIGTERM, signal.SIGINT):
        try:
            _previous_handlers[sig] = signal.signal(sig, _terminate)
        except ValueError:
            # Not the main thread (e.g. under some WSGI servers); atexit still
            # covers the clean-exit path.
            pass

    from app.routes import bp
    app.register_blueprint(bp)

    # Report broken evaluations (info.json, .azr paths, data files) in the
    # log at start-up, with what to fix: python -m app.check prints the same.
    from app import check
    check.log_problems(app.config["EVALUATIONS_DIR"])

    # The blueprint's handlers only see errors raised inside its views; an
    # unknown path or a wrong method fails in routing, before any view, and
    # would otherwise come back as Flask's HTML page to a JSON client.
    from flask import jsonify
    from werkzeug.exceptions import HTTPException

    @app.errorhandler(HTTPException)
    def _http_error(err):
        return jsonify({"error": err.description}), err.code

    root = app.config["EVALUATIONS_DIR"]
    log = logging.getLogger(__name__)
    log.info("serving evaluations from %s", root)

    try:
        start_spares(manager, root, app.config.get("SPARES", ""),
                     app.config.get("SPARE_THRESHOLD", 6))
    except Exception:
        log.exception("could not start the spare sessions")

    # A worker runs with the evaluation's directory as its working directory and
    # caches the external-capture integrals there. Read-only, that fails deep
    # inside AZURE2 with nothing pointing at the cause, so it is checked once
    # here where the message can name it.
    if os.path.isdir(root) and not os.access(root, os.W_OK | os.X_OK):
        log.warning(
            "%s is not writable by uid %s: AZURE2 caches its external-capture "
            "integrals in each evaluation's directory, and will recompute them "
            "on every open. Give the directory to this user (see AZURE2_UID in "
            ".env).", root, os.getuid())

    return app


COMPRESSIBLE = ("application/json", "text/csv", "text/plain")


def install_gzip(app, level=5, minimum=1024):
    """gzip the API's responses for a client that accepts it (``Accept-
    Encoding: gzip``).  ⁷Be's smooth curves go from 2.0 MB to ~0.3 MB.
    Caddy compresses too (``encode zstd gzip``) and passes an encoded
    response through as it is, so both paths work."""
    import gzip as gzip_module

    @app.after_request
    def _gzip(response):
        try:
            accepted = request_accepts_gzip()
        except RuntimeError:
            return response
        if (not accepted or response.direct_passthrough
                or response.status_code < 200 or response.status_code >= 300
                or "Content-Encoding" in response.headers
                or response.mimetype not in COMPRESSIBLE):
            return response
        body = response.get_data()
        if len(body) < minimum:
            return response
        response.set_data(gzip_module.compress(body, compresslevel=level))
        response.headers["Content-Encoding"] = "gzip"
        response.headers["Content-Length"] = str(len(response.get_data()))
        vary = response.headers.get("Vary")
        response.headers["Vary"] = f"{vary}, Accept-Encoding" if vary else "Accept-Encoding"
        return response

    return _gzip


def request_accepts_gzip() -> bool:
    from flask import request
    header = request.headers.get("Accept-Encoding", "")
    for part in header.split(","):
        token, _, q = part.strip().partition(";")
        if token.strip().lower() in ("gzip", "*"):
            q = q.strip()
            if q.startswith("q="):
                try:
                    return float(q[2:]) > 0
                except ValueError:
                    return True
            return True
    return False


def spare_counts(evaluations, setting, threshold=6):
    """``{evaluation id: count}`` from ``AZURE2_SPARES`` (see config.py)."""
    from app import initial
    setting = (setting or "").strip()
    if setting in ("", "0", "none", "off"):
        return {}
    if setting == "auto":
        out = {}
        for evaluation in evaluations:
            timings = (initial.read(evaluation.path) or {}).get("timings") or {}
            prepare = timings.get("prepare") or {}
            slow = (timings.get("open") or 0) + (prepare.get("data") or 0) + (prepare.get("fine") or 0)
            if slow >= threshold:
                out[evaluation.id] = 1
        return out
    out = {}
    for part in setting.split(","):
        name, _, count = part.strip().partition(":")
        if name:
            try:
                out[name] = int(count or 1)
            except ValueError:
                continue
    return out


def start_spares(manager, root, setting, threshold=6):
    from app import evaluations as evaluations_module
    if not os.path.isdir(root):
        return
    found = evaluations_module.discover(root)
    manager.spares = spare_counts(found, setting, threshold)
    manager.spare_policy = lambda evaluation: spare_counts(
        [evaluation], setting, threshold).get(evaluation.id, 0)
    if manager.spares:
        logging.getLogger(__name__).info("keeping spare sessions: %s", manager.spares)
        manager.start_spares(found)
