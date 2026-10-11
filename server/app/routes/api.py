"""The HTTP API.

Shape of a client's interaction:

    GET  /api/evaluations                     what is available
    POST /api/evaluations/<id>/open           -> {session_id, ...}
    GET  /api/sessions/<sid>/scheme           levels + channels
    POST /api/sessions/<sid>/parameters       edit levels, get new curves back
    POST /api/sessions/<sid>/reset            back to the model's own values
    GET  /api/sessions/<sid>/extrapolations   extrapolation curves

Opening an evaluation starts an AZURE2 process, so a client should close its
session when done; idle ones are reaped anyway.
"""

import logging
import os
from datetime import datetime

from flask import Blueprint, current_app, jsonify, request, send_file
from werkzeug.exceptions import HTTPException

from app import evaluations as evaluations_module
from app import serializers
from app.session import SessionError

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


@bp.errorhandler(SessionError)
def _session_gone(err):
    # 409: the request was well-formed but the session it names is no longer
    # usable, so the client should reopen rather than retry verbatim.
    return jsonify({"error": str(err)}), 409


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


@bp.route("/evaluations/<evaluation_id>/open", methods=["POST"])
def open_evaluation(evaluation_id):
    """Launch an AZURE2 instance for this evaluation and return its session."""
    evaluation = evaluations_module.get(_root(), evaluation_id)
    session = _manager().create(evaluation)
    with session.use():
        payload = {
            "session_id": session.id,
            "evaluation": evaluation.to_dict(),
            "scheme": serializers.scheme_to_dict(session, evaluation.labels),
            "n_data_segments": len(session.datasets),
            "n_extrapolations": len(session.extrapolations),
        }
    return jsonify(payload), 201


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
    with session.use():
        return jsonify(serializers.scheme_to_dict(session, labels))


@bp.route("/sessions/<session_id>/scheme/export.txt", methods=["GET"])
def export_scheme_text(session_id):
    session, _ = _session_and_labels(session_id)
    with session.use():
        text = serializers.scheme_to_text(session)
    name = f"{session.evaluation.id}_level_scheme.txt"
    return current_app.response_class(
        text, mimetype="text/plain",
        headers={"Content-Disposition": f'attachment; filename="{name}"'})


# -- data ---------------------------------------------------------------------

@bp.route("/sessions/<session_id>/data", methods=["GET"])
def get_data(session_id):
    session, labels = _session_and_labels(session_id)
    with session.use():
        mu, mu_sfactor = session.calculate_data()
        return jsonify(serializers.data_to_dict(session, labels, mu, mu_sfactor))


# -- interactive parameters ---------------------------------------------------

@bp.route("/sessions/<session_id>/parameters", methods=["POST"])
def set_parameters(session_id):
    """Apply parameter edits and return the recalculated data curves.

    Body: ``{"updates": {"<free_index>": value, ...}}``.  The recalculation is
    returned in the same response so the plot updates in one round trip rather
    than a set-then-fetch pair that could interleave with another edit.
    """
    body = request.get_json(silent=True) or {}
    updates = body.get("updates")
    if not isinstance(updates, dict):
        raise ValueError("body must contain an 'updates' object mapping "
                         "free-parameter index to value")

    session, labels = _session_and_labels(session_id)
    with session.use():
        session.set_parameters(updates)
        mu, mu_sfactor = session.calculate_data()
        return jsonify({
            "scheme": serializers.scheme_to_dict(session, labels),
            "data": serializers.data_to_dict(session, labels, mu, mu_sfactor),
        })


@bp.route("/sessions/<session_id>/reset", methods=["POST"])
def reset_parameters(session_id):
    """Restore the parameters the evaluation was opened with."""
    session, labels = _session_and_labels(session_id)
    with session.use():
        session.reset_parameters()
        mu, mu_sfactor = session.calculate_data()
        return jsonify({
            "scheme": serializers.scheme_to_dict(session, labels),
            "data": serializers.data_to_dict(session, labels, mu, mu_sfactor),
        })


# -- extrapolations -----------------------------------------------------------

@bp.route("/sessions/<session_id>/extrapolations", methods=["GET"])
def get_extrapolations(session_id):
    session, labels = _session_and_labels(session_id)
    with session.use():
        energies, angles, mu, mu_sfactor = session.calculate_extrapolations()
        return jsonify(serializers.extrapolations_to_dict(
            session, labels, energies, angles, mu, mu_sfactor))


@bp.route("/sessions/<session_id>/extrapolations/download.csv", methods=["GET"])
def download_extrapolations(session_id):
    """Extrapolation curves as CSV.

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
    with session.use():
        energies, angles, mu, mu_sfactor = session.calculate_extrapolations()
        segments = serializers.extrapolations_to_dict(
            session, labels, energies, angles, mu, mu_sfactor)
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
    })
