"""What a page can draw before its AZURE2 session exists.

Opening an evaluation starts a worker process (0.4 s for ¹³N, 3 s for ²⁴Mg
and ⁷Be).  Everything the page shows first -- the level scheme, the data and
the smooth curves at the shipped parameters -- is the same for every visitor,
so it is stored once per model as ``initial.json`` next to the evaluation and
served without a session (``GET /api/evaluations/<id>/initial``; on the static
build the page fetches ``azure2/evaluations/<id>/initial.json`` directly,
without starting Pyodide).  The page draws it and opens the session in the
background; the sliders come alive when the session does.

The file also carries the evaluation's typical **timings** (seconds, measured
by ``python -m app.warm`` on the server, with nothing else running) so the
page's progress timer can show an estimate:

    open            starting the session (POST /open)
    prepare.data    building the data model for edits    (background)
    prepare.fine    building the smooth-curve model      (background)
    prepare.extrap  building the extrapolations' model   (background)
    edit            one edit once prepared: data and smooth curves
    extrap          the extrapolations after an edit
    grid            an energy × angle extrapolation grid (where there is one)

(plus ``source``, ``omp_threads``, ``prepare_threads``, ``cpus`` and
``measured``, the date).  The first edit made before the preparation is done
waits for the step it needs: about ``prepare.data`` + ``edit``, and its
smooth curve about ``prepare.fine``.

It is written by ``app.warm`` (with timings) and, when missing or stale, by the
first session opened at the shipped parameters (without).  An entry is valid
only for the model it was made from: the cache fingerprint (``app.cache``) is
stored with it, so an edited evaluation is not described by an old file.
"""

import json
import logging
import os
import tempfile

from app import cache

log = logging.getLogger(__name__)

FILE = "initial.json"
VERSION = 1
PARTS = ("scheme", "data", "fine")


def read(directory):
    """The stored payload, or None if there is none for this model."""
    try:
        with open(os.path.join(directory, FILE)) as f:
            payload = json.load(f)
    except (OSError, ValueError):
        return None
    if payload.get("version") != VERSION or payload.get("model") != cache.fingerprint(directory):
        return None
    return payload


def build(session, labels, timings=None):
    """The payload for ``session`` at its evaluation's shipped parameters,
    from the cache (data and smooth curves are left out where it holds
    none)."""
    from app import serializers

    params = list(session.initial_params)
    payload = {
        "version": VERSION,
        "model": cache.fingerprint(session.evaluation.path),
        "evaluation": session.evaluation.to_dict(),
        "scheme": serializers.scheme_to_dict(session, labels, params),
        "n_data_segments": len(session.datasets),
        "n_extrapolations": len(session.extrapolations),
    }
    data = cache.read(session.evaluation.path, params, "data", unedited=True)
    if data is not None:
        payload["data"] = serializers.data_to_dict(session, labels, *data)
        fine = cache.read(session.evaluation.path, params, "fine", unedited=True)
        if fine is not None:
            payload["fine"] = serializers.fine_to_dict(session, fine, *data)
    if timings:
        payload["timings"] = timings
    return payload


def write(directory, payload):
    """Store ``payload`` atomically; failures are only logged."""
    try:
        fd, tmp = tempfile.mkstemp(dir=directory, prefix=".initial-", suffix=".json")
        with os.fdopen(fd, "w") as f:
            json.dump(payload, f, separators=(",", ":"))
        os.chmod(tmp, 0o644)
        os.replace(tmp, os.path.join(directory, FILE))
        return True
    except OSError as err:
        log.warning("could not write %s in %s: %s", FILE, directory, err)
        return False


def ensure(session, labels):
    """Write ``initial.json`` for ``session``'s evaluation if there is none
    for this model (keeping the timings of an older one would mislead, so
    they are dropped).  Best-effort, for the first session after a deploy."""
    directory = session.evaluation.path
    current = read(directory)
    if current is not None and all(part in current for part in PARTS):
        return False
    payload = build(session, labels, (current or {}).get("timings"))
    if current is not None and not all(part in payload for part in PARTS):
        return False                    # nothing better to write
    return write(directory, payload)


def select(payload, parts):
    """``payload`` with only ``parts`` of :data:`PARTS` (the rest kept)."""
    if not parts:
        return payload
    return {k: v for k, v in payload.items() if k not in PARTS or k in parts}
