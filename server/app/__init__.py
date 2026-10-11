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
    )

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
