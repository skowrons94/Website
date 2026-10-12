"""The HTTP API.

Shape of a client's interaction:

    GET  /api/evaluations                     what is available
    GET  /api/evaluations/<id>/initial        scheme, data, smooth curves and typical
                                              timings at the shipped parameters --
                                              no session, a static file (app.initial)
    POST /api/evaluations/<id>/open           -> {session_id, ...}
    GET  /api/sessions/<sid>/scheme           levels + channels
    POST /api/sessions/<sid>/parameters       edit levels, get new curves back
    POST /api/sessions/<sid>/reset            back to the model's own values
    GET  /api/sessions/<sid>/extrapolations   extrapolation curves
    GET  /api/sessions/<sid>/extrapolations/<i>/grid?view=angles|map
                                              an energy × angle grid, on request
    GET  /api/sessions/<sid>/fine             the model on an extended fine grid
    POST /api/sessions/<sid>/prepare          build the derived models (waits for them)
    GET  /api/sessions/<sid>/status           what is prepared, what is being built
    POST /api/sessions/<sid>/ping             heartbeat: the page is still open

Opening an evaluation starts an AZURE2 process, so a client should close its
session when done; idle ones are reaped anyway.  The full contract, with the
status codes, is in server/README.md ("API").
"""

import logging
import os
import threading
from datetime import datetime

from flask import Blueprint, current_app, jsonify, request, send_file
from werkzeug.exceptions import HTTPException

from app import evaluations as evaluations_module
from app import initial as initial_module
from app import serializers
from app.engine import PREPARE_STEPS, ROLES, EngineError
from app.session import CapacityError, SessionError

log = logging.getLogger(__name__)

bp = Blueprint("api", __name__, url_prefix="/api")


# -- plumbing -----------------------------------------------------------------

@bp.before_request
def _log_request():
    log.info("%s %s from %s at %s", request.method, request.path,
             request.remote_addr, datetime.now().isoformat(timespec="seconds"))


@bp.errorhandler(FileNotFoundError)
def _not_found(err):
    return jsonify({"error": str(err)}), 404


@bp.errorhandler(CapacityError)
def _full(err):
    # 503 + Retry-After: every slot is serving someone; try again shortly.
    response = jsonify({"error": str(err), "code": "busy",
                        "retry_after": err.retry_after})
    response.headers["Retry-After"] = str(err.retry_after)
    return response, 503


@bp.errorhandler(EngineError)
def _worker_failed(err):
    # One of the session's derived workers failed (it is started again on
    # the next request); the session itself is fine.
    log.warning("worker error on %s: %s", request.path, err)
    return jsonify({"error": str(err), "code": "worker"}), 500


@bp.errorhandler(SessionError)
def _session_gone(err):
    # 409: the request was well-formed but the session it names is no longer
    # usable, so the client should reopen rather than retry verbatim.
    return jsonify({"error": str(err), "code": "expired"}), 409


@bp.errorhandler(ValueError)
@bp.errorhandler(IndexError)
@bp.errorhandler(KeyError)
def _bad_request(err):
    return jsonify({"error": str(err)}), 400


@bp.errorhandler(Exception)
def _unexpected(err):
    if isinstance(err, HTTPException):
        # Raised by Flask itself (a malformed body, say): keep its status.
        return jsonify({"error": err.description}), err.code
    log.exception("unhandled error on %s", request.path)
    return jsonify({"error": "internal server error"}), 500


def _root():
    return current_app.config["EVALUATIONS_DIR"]


def _manager():
    return current_app.extensions["sessions"]


def _session_and_labels(session_id):
    """The session plus the channel labels of the evaluation it holds."""
    session = _manager().get(session_id)
    return session, session.evaluation.labels


# -- evaluations --------------------------------------------------------------

@bp.route("/evaluations", methods=["GET"])
def list_evaluations():
    found = evaluations_module.discover(_root())
    return jsonify([e.to_dict() for e in found])


@bp.route("/evaluations/<evaluation_id>", methods=["GET"])
def get_evaluation(evaluation_id):
    evaluation = evaluations_module.get(_root(), evaluation_id)
    return jsonify(evaluation.to_dict())


@bp.route("/evaluations/<evaluation_id>/download", methods=["GET"])
def download_evaluation(evaluation_id):
    """The evaluation's .azr file, as AZURE2 would open it."""
    evaluation = evaluations_module.get(_root(), evaluation_id)
    return send_file(evaluation.azr_path, as_attachment=True,
                     download_name=evaluation.azr_filename,
                     mimetype="text/plain")


def _compact() -> bool:
    """Has the client asked for compact payloads (``?compact=1``)?"""
    return request.args.get("compact", "").lower() in ("1", "true", "yes")


def _json(payload, status=200):
    if _compact():
        payload = serializers.compact(payload)
    return jsonify(payload), status


def _heartbeat_interval():
    manager = _manager()
    return max(5, int(getattr(manager, "heartbeat_ttl", 120) or 120) // 4)


@bp.route("/evaluations/<evaluation_id>/initial", methods=["GET"])
def initial_evaluation(evaluation_id):
    """What the page draws before its session exists (``app.initial``):
    ``{evaluation, scheme, data, fine, n_data_segments, n_extrapolations,
    timings}`` at the shipped parameters.  ``?parts=scheme`` (comma list of
    scheme, data, fine) trims it.  404 with ``code: "not_prepared"`` when
    it has not been written for this model yet (the page then opens a
    session as before)."""
    evaluation = evaluations_module.get(_root(), evaluation_id)
    payload = initial_module.read(evaluation.path)
    if payload is None:
        return jsonify({"error": "no initial payload for this evaluation yet",
                        "code": "not_prepared"}), 404
    parts = [p for p in request.args.get("parts", "").split(",") if p.strip()]
    response = jsonify(initial_module.select(payload, parts))
    response.headers["Cache-Control"] = "public, max-age=300"
    return response


@bp.route("/evaluations/<evaluation_id>/open", methods=["POST"])
def open_evaluation(evaluation_id):
    """Launch an AZURE2 instance for this evaluation and return its session.

    The session's derived models (data, smooth curves, extrapolations) are
    then built in the background; ``/status`` reports how far it has got.
    503 + Retry-After when every slot is busy.
    """
    evaluation = evaluations_module.get(_root(), evaluation_id)
    session = _manager().create(evaluation)
    stored = initial_module.read(evaluation.path) or {}
    payload = {
        "session_id": session.id,
        "evaluation": evaluation.to_dict(),
        "scheme": serializers.scheme_to_dict(session, evaluation.labels),
        "n_data_segments": len(session.datasets),
        "n_extrapolations": len(session.extrapolations),
        "generation": session.generation,
        "heartbeat_interval": _heartbeat_interval(),
        "timings": stored.get("timings"),
    }
    if not stored or "fine" not in stored:
        # The first session of a model writes its initial.json.
        try:
            threading.Thread(target=_ensure_initial, args=(session, evaluation.labels),
                             daemon=True).start()
        except RuntimeError:            # no threads (the in-browser build)
            pass
    return jsonify(payload), 201


def _ensure_initial(session, labels):
    try:
        initial_module.ensure(session, labels)
    except Exception:
        log.exception("could not write the initial payload of %s", session.evaluation.id)


# -- session lifecycle --------------------------------------------------------

@bp.route("/sessions/<session_id>", methods=["DELETE"])
def close_session(session_id):
    _manager().close(session_id)
    return jsonify({"closed": True})


@bp.route("/sessions/<session_id>/close", methods=["POST"])
def close_session_beacon(session_id):
    """Close a session via POST, for ``navigator.sendBeacon`` on page unload.

    A beacon is the only request a browser reliably completes while the tab is
    closing, and it is always a POST -- hence this alias for the DELETE above.
    Releasing the slot promptly is what keeps the instance cap meaningful.
    """
    _manager().close(session_id)
    return jsonify({"closed": True})


@bp.route("/sessions/<session_id>/ping", methods=["POST"])
def ping_session(session_id):
    """Heartbeat: the page is still open.  A session that has pinged once is
    closed ``AZURE2_HEARTBEAT_TTL`` seconds (default 120) after the pings
    stop -- a crashed or killed tab sends no beacon -- so the page should
    ping every ``heartbeat_interval`` seconds (from /open; 30 by default)
    while it is visible.  Returns ``/status``; 409 if the session is gone."""
    session = _manager().get(session_id)
    session.ping()
    return jsonify(session.status())


@bp.route("/sessions/<session_id>/status", methods=["GET"])
def session_status(session_id):
    """``{prepared, preparing, running, busy, modified, generation,
    fine_ready}``: which derived models are built, which one is being built
    (the page can say "preparing the model for edits"), which workers run
    and which are calculating."""
    session = _manager().get(session_id)
    return jsonify(session.status())


@bp.route("/sessions", methods=["GET"])
def list_sessions():
    # Load only: a session id is all it takes to drive someone else's model,
    # so ids are never listed publicly.
    stats = _manager().stats()
    return jsonify([{k: v for k, v in s.items() if k != "id"} for s in stats])


# -- level scheme -------------------------------------------------------------

@bp.route("/sessions/<session_id>/scheme", methods=["GET"])
def get_scheme(session_id):
    session, labels = _session_and_labels(session_id)
    session.touch()
    return jsonify(serializers.scheme_to_dict(session, labels))


@bp.route("/sessions/<session_id>/scheme/export.txt", methods=["GET"])
def export_scheme_text(session_id):
    session, _ = _session_and_labels(session_id)
    with session.use("data"):
        text = serializers.scheme_to_text(session)
    name = f"{session.evaluation.id}_level_scheme.txt"
    return current_app.response_class(
        text, mimetype="text/plain",
        headers={"Content-Disposition": f'attachment; filename="{name}"'})


# -- data ---------------------------------------------------------------------

@bp.route("/sessions/<session_id>/data", methods=["GET"])
def get_data(session_id):
    session, labels = _session_and_labels(session_id)
    hit = session.peek("data")
    if hit is not None:
        mu, mu_sfactor = hit
        return _json(serializers.data_to_dict(session, labels, mu, mu_sfactor))
    params = session.snapshot()
    mu, mu_sfactor = session.calculate_data(params)
    return _json(serializers.data_to_dict(session, labels, mu, mu_sfactor))


@bp.route("/sessions/<session_id>/fine", methods=["GET"])
def get_fine(session_id):
    """The model on a fine energy grid for every data segment that allows one.

    The first call builds a second, derived model (its external-capture
    integrals can take a minute); later calls, and the shipped parameters once
    cached, are quick.  Segments missing from the answer are drawn through
    their data points.
    """
    session, _ = _session_and_labels(session_id)
    data, result = session.peek("data"), session.peek("fine")
    if data is not None and result is not None:
        return _json(serializers.fine_to_dict(session, result, *data))
    params = session.snapshot()
    mu, mu_sfactor = session.calculate_data(params)
    result = session.calculate_fine(params)
    return _json(serializers.fine_to_dict(session, result, mu, mu_sfactor))


@bp.route("/sessions/<session_id>/prepare", methods=["POST"])
def prepare_session(session_id):
    """Build the session's derived models before anything asks for them, and
    wait for them: ``{"steps": [...]}`` drawn from data, fine, extrap (and
    grid); every step by default.

    A session already prepares data, fine and extrap in the background from
    the moment it opens (``AZURE2_AUTO_PREPARE``), each step holding only
    its own worker, so an edit never waits for the extrapolations' model;
    this request only waits for what the background has not finished (or
    builds it, with auto-preparation off).  Returns ``{"prepared": [the
    steps this request built]}``.
    """
    body = request.get_json(silent=True) or {}
    steps = body.get("steps") or list(PREPARE_STEPS)
    if not isinstance(steps, list) or any(step not in ROLES for step in steps):
        raise ValueError(f"'steps' must be a list drawn from {list(ROLES)}")
    session, _ = _session_and_labels(session_id)
    done = []
    for step in ROLES:
        if step in steps and session.prepare(step):
            done.append(step)
    return jsonify({"prepared": done})


def _edit_payload(session, labels, params, compact):
    """The answer to an edit, at ``params``: scheme and data, plus the fine
    curves when they cost no model build (``fine`` is absent otherwise; the
    client keeps asking ``/fine``)."""
    mu, mu_sfactor = session.calculate_data(params)
    data = serializers.data_to_dict(session, labels, mu, mu_sfactor)
    payload = {
        "scheme": serializers.scheme_to_dict(session, labels, params),
        "data": serializers.without_measurements(data) if compact else data,
    }
    if session.fine_ready(params):
        payload["fine"] = serializers.fine_to_dict(
            session, session.calculate_fine(params), mu, mu_sfactor)
    return payload


def _run_edit(session, labels, gen, body):
    """Calculate edit ``gen`` unless a newer one has arrived (latest wins).

    A superseded edit is not calculated.  By default it waits for the newest
    edit and answers with *its* result, marked ``"superseded": true`` (so
    an older client still draws the latest state); with ``"on_superseded":
    "skip"`` it answers at once with ``{"superseded": true, "generation":
    n}`` only.  Either way the status is 200.
    """
    compact = _compact()
    skip = body.get("on_superseded") == "skip"
    payload, superseded = session.edit(
        gen, lambda params: _edit_payload(session, labels, params, compact),
        wait_superseded=not skip)
    if payload is None:
        payload = {}
    else:
        payload = dict(payload)
    payload["generation"] = session.generation if superseded else gen
    if superseded:
        payload["superseded"] = True
    if "seq" in body:
        payload["seq"] = body["seq"]
    return _json(payload)


# -- interactive parameters ---------------------------------------------------

@bp.route("/sessions/<session_id>/parameters", methods=["POST"])
def set_parameters(session_id):
    """Apply parameter edits and return the recalculated data curves.

    Body: ``{"updates": {"<free_index>": value, ...}}``, optionally ``"seq"``
    (the client's own edit counter: an edit arriving after a later one is
    ignored) and ``"on_superseded": "skip"`` (see :func:`_run_edit`).
    The recalculation is returned in the same response so the plot updates
    in one round trip.  The updates are applied on arrival, in order; only
    the calculation of an edit overtaken by a newer one is skipped.
    """
    body = request.get_json(silent=True) or {}
    updates = body.get("updates")
    if not isinstance(updates, dict):
        raise ValueError("body must contain an 'updates' object mapping "
                         "free-parameter index to value")
    seq = body.get("seq")
    if seq is not None and (isinstance(seq, bool) or not isinstance(seq, int)):
        raise ValueError("'seq' must be an integer")

    session, labels = _session_and_labels(session_id)
    gen = session.begin_edit(updates, seq=seq)
    return _run_edit(session, labels, gen, body)


@bp.route("/sessions/<session_id>/reset", methods=["POST"])
def reset_parameters(session_id):
    """Restore the parameters the evaluation was opened with."""
    body = request.get_json(silent=True) or {}
    session, labels = _session_and_labels(session_id)
    gen = session.begin_edit(reset=True, seq=body.get("seq"))
    return _run_edit(session, labels, gen, body)


# -- extrapolations -----------------------------------------------------------

@bp.route("/sessions/<session_id>/extrapolations", methods=["GET"])
def get_extrapolations(session_id):
    session, labels = _session_and_labels(session_id)
    hit = session.peek("extrap")
    if hit is not None:
        return _json(serializers.extrapolations_to_dict(session, labels, *hit))
    energies, angles, mu, mu_sfactor = session.calculate_extrapolations()
    return _json(serializers.extrapolations_to_dict(
        session, labels, energies, angles, mu, mu_sfactor))


@bp.route("/sessions/<session_id>/extrapolations/<int:index>/grid", methods=["GET"])
def get_extrapolation_grid(session_id, index):
    """An energy × angle extrapolation grid (a segment whose ``grid`` is
    set), calculated on request: ``?view=angles`` (default; a few
    representative angles) or ``?view=map`` (every 5°, ~60 energies).
    See :func:`app.serializers.grid_to_dict` for the shape."""
    view = request.args.get("view", "angles")
    session, _ = _session_and_labels(session_id)
    result = session.peek("grid")
    if result is None:
        result = session.calculate_grid()
    return _json(serializers.grid_to_dict(session, index, result, view))


@bp.route("/sessions/<session_id>/extrapolations/download.csv", methods=["GET"])
def download_extrapolations(session_id):
    """Extrapolation curves as CSV, at full precision.

    ``?segments=0,2,5`` restricts the export; omitted, everything is written.
    """
    raw = request.args.get("segments")
    selected = None
    if raw:
        try:
            selected = {int(part) for part in raw.split(",") if part.strip()}
        except ValueError:
            raise ValueError("'segments' must be a comma-separated list of "
                             "segment indices")

    session, labels = _session_and_labels(session_id)
    energies, angles, mu, mu_sfactor = session.calculate_extrapolations()
    segments = serializers.extrapolations_to_dict(
        session, labels, energies, angles, mu, mu_sfactor, digits=None)
    csv = serializers.extrapolations_to_csv(segments, selected)

    name = f"{session.evaluation.id}_extrapolations.csv"
    return current_app.response_class(
        csv, mimetype="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{name}"'})


# -- health -------------------------------------------------------------------

@bp.route("/health", methods=["GET"])
def health():
    root = _root()
    return jsonify({
        "status": "ok",
        "evaluations_dir": root,
        "evaluations": len(evaluations_module.discover(root))
        if os.path.isdir(root) else 0,
        "sessions": len(_manager().stats()),
        "spares": {k: len(v) for k, v in getattr(_manager(), "_spare", {}).items() if v},
    })
