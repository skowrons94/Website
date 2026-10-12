"""Results at an evaluation's own parameters, kept on disk.

Until a visitor edits a level, every session of an evaluation asks AZURE2 the
same two questions -- the data curves and the extrapolations at the shipped
parameters -- and the extrapolations can take minutes (external capture).  The
answers are stored next to the model, in ``precomputed.json``, the first time
they are calculated, and returned from there afterwards: by the server
(``app.session``), by the in-browser build (``browser/bridge.py``, which ships the
file with each evaluation) and by ``python -m app.warm``, which fills the cache
for every evaluation after a deploy.

An entry is used only if it was calculated for exactly the same parameter
vector *and* the same model: the fingerprint covers the .azr file and the data
files, so editing an evaluation invalidates its cache.  Writing is best-effort:
a read-only evaluations directory only costs the speed-up.
"""

import hashlib
import json
import logging
import os
import tempfile

import numpy as np

log = logging.getLogger(__name__)

CACHE_FILE = "precomputed.json"

# Bumped whenever what the engine side computes changes shape or meaning, so
# entries written by an older server are recalculated rather than trusted.
# 2: total capture over several capture pairs calculated with fresh external-
#    capture integrals (app.fine.summed); the fine grid carries angles and
#    axes; extrapolations come from their own model.
REVISION = "2"


# -- engine output to and from JSON --------------------------------------------

def encode(value):
    """Engine output (tuples and lists of arrays) as plain JSON."""
    if isinstance(value, np.ndarray):
        return {"__ndarray__": value.tolist(), "dtype": str(value.dtype)}
    if isinstance(value, (list, tuple)):
        return [encode(v) for v in value]
    if isinstance(value, (np.floating, np.integer)):
        return value.item()
    return value


def decode(value):
    if isinstance(value, dict) and "__ndarray__" in value:
        return np.asarray(value["__ndarray__"], dtype=value["dtype"])
    if isinstance(value, list):
        return [decode(v) for v in value]
    return value


# -- the file -------------------------------------------------------------------

def fingerprint(directory):
    """A hash of the model: its .azr file(s) and everything under data/."""
    h = hashlib.sha256()
    h.update(f"revision {REVISION}".encode())
    # Toggling the split total-capture calculation changes every result.
    from app.fine import split_enabled
    h.update(f"split {split_enabled(directory)}".encode())
    paths = [os.path.join(directory, f) for f in sorted(os.listdir(directory))
             if f.endswith(".azr")]
    data = os.path.join(directory, "data")
    if os.path.isdir(data):
        for root, dirs, files in os.walk(data):
            dirs.sort()
            paths += [os.path.join(root, f) for f in sorted(files)]
    for path in paths:
        h.update(os.path.relpath(path, directory).encode())
        with open(path, "rb") as f:
            h.update(f.read())
    return h.hexdigest()


def _load(directory):
    path = os.path.join(directory, CACHE_FILE)
    try:
        with open(path) as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


def read(directory, params, key):
    """The cached ``key`` ("data" or "extrap") for ``params``, or None."""
    cache = _load(directory)
    if not cache or key not in cache:
        return None
    if [float(v) for v in params] != cache.get("params"):
        return None
    if cache.get("model") not in (None, fingerprint(directory)):
        return None
    return tuple(decode(cache[key]))


def write(directory, params, key, value):
    """Store ``value`` under ``key`` for ``params``; failures are only logged."""
    params = [float(v) for v in params]
    try:
        model = fingerprint(directory)
        cache = _load(directory)
        if not cache or cache.get("params") != params or cache.get("model") not in (None, model):
            cache = {"params": params}
        cache["model"] = model
        cache[key] = encode(value)
        # Atomic: a reader never sees half a file, and two sessions finishing
        # at once simply both write a valid one.
        fd, tmp = tempfile.mkstemp(dir=directory, prefix=".precomputed-", suffix=".json")
        with os.fdopen(fd, "w") as f:
            json.dump(cache, f)
        os.chmod(tmp, 0o644)
        os.replace(tmp, os.path.join(directory, CACHE_FILE))
    except OSError as err:
        log.warning("could not cache %s results in %s: %s", key, directory, err)
