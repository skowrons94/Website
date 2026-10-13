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

Next to it, ``initial-extrapolations.json`` holds the extrapolations at the
shipped parameters (``GET /api/evaluations/<id>/initial/extrapolations``; on
the static build ``azure2/evaluations/<id>/extrapolations.json``): the page
shows them, faded, while a visitor's own are calculated after an edit,
rather than an empty box.  It is kept apart because it is large (⁷Be: 1.4 MB)
and only needed then.

It is written by ``app.warm`` (with timings) and, when missing or stale, by the
first session opened at the shipped parameters (without).  An entry is valid
only for the model it was made from: the cache fingerprint (``app.cache``) is
stored with it, so an edited evaluation is not described by an old file.
"""

import hashlib
import json
import logging
import os
import tempfile

from app import cache

log = logging.getLogger(__name__)

FILE = "initial.json"
EXTRAP_FILE = "initial-extrapolations.json"
VERSION = 1
PARTS = ("scheme", "data", "fine")


_parsed = {}


def read(directory):
    """The stored payload, or None if there is none for this model
    (parsed once while the file is unchanged)."""
    path = os.path.join(directory, FILE)
    try:
        raw = _memo_file(path)
        if raw is None:
            return None
        hit = _parsed.get(path)
        if hit is None or hit[0] is not raw:
            hit = (raw, json.loads(raw))
            _parsed[path] = hit
        payload = hit[1]
    except (OSError, ValueError):
        return None
    if payload.get("version") != VERSION or payload.get("model") != cache.fingerprint(directory):
        return None
    # The labels and references come from info.json, which the model
    # fingerprint leaves out: a stored payload from an older info.json is stale.
    if payload.get("info") != info_fingerprint(directory):
        return None
    return payload


def info_fingerprint(directory):
    """A hash of the evaluation's info.json (None when it has none)."""
    try:
        with open(os.path.join(directory, "info.json"), "rb") as f:
            return hashlib.sha256(f.read()).hexdigest()
    except OSError:
        return None


_bytes = {}


def read_bytes(directory):
    """``initial.json`` as stored (valid: :func:`read` said so), memoised
    while the file is unchanged."""
    return _memo_file(os.path.join(directory, FILE))


def _memo_file(path):
    try:
        st = os.stat(path)
    except OSError:
        return None
    key = (st.st_mtime_ns, st.st_size)
    hit = _bytes.get(path)
    if hit is not None and hit[0] == key:
        return hit[1]
    with open(path, "rb") as f:
        raw = f.read()
    _bytes[path] = (key, raw)
    return raw


def has_extrapolations(directory):
    return read_extrapolations(directory) is not None


def read_extrapolations(directory):
    """``initial-extrapolations.json`` (bytes) if it describes this model."""
    path = os.path.join(directory, EXTRAP_FILE)
    raw = _memo_file(path)
    if raw is None:
        return None
    try:
        # Only the head is checked: the version and the model come first.
        head = json.loads(raw[:200].split(b',"extrapolations"')[0] + b"}")
    except (ValueError, IndexError):
        return None
    if head.get("version") != VERSION or head.get("model") != cache.fingerprint(directory):
        return None
    return raw


def build_extrapolations(session, labels):
    """The extrapolations at the shipped parameters, from the cache
    (compact, as ``?compact=1``), or None when it holds none."""
    from app import serializers

    params = list(session.initial_params)
    hit = cache.read(session.evaluation.path, params, "extrap", unedited=True)
    if hit is None:
        return None
    return {"version": VERSION, "model": cache.fingerprint(session.evaluation.path),
            "extrapolations": serializers.compact(
                serializers.extrapolations_to_dict(session, labels, *hit))}


def build(session, labels, timings=None):
    """The payload for ``session`` at its evaluation's shipped parameters,
    from the cache (data and smooth curves are left out where it holds
    none)."""
    from app import serializers

    params = list(session.initial_params)
    payload = {
        "version": VERSION,
        "model": cache.fingerprint(session.evaluation.path),
        "info": info_fingerprint(session.evaluation.path),
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


def write(directory, payload, name=FILE):
    """Store ``payload`` atomically; failures are only logged."""
    try:
        fd, tmp = tempfile.mkstemp(dir=directory, prefix=".initial-", suffix=".json")
        with os.fdopen(fd, "w") as f:
            json.dump(payload, f, separators=(",", ":"))
        os.chmod(tmp, 0o644)
        os.replace(tmp, os.path.join(directory, name))
        return True
    except OSError as err:
        log.warning("could not write %s in %s: %s", name, directory, err)
        return False


def ensure_extrapolations(session, labels):
    """Write ``initial-extrapolations.json`` if missing or stale."""
    directory = session.evaluation.path
    if has_extrapolations(directory):
        return False
    payload = build_extrapolations(session, labels)
    return payload is not None and write(directory, payload, EXTRAP_FILE)


def ensure(session, labels):
    """Write ``initial.json`` for ``session``'s evaluation if there is none
    for this model (keeping the timings of an older one would mislead, so
    they are dropped).  Best-effort, for the first session after a deploy."""
    directory = session.evaluation.path
    ensure_extrapolations(session, labels)
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
