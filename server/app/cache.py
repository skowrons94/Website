"""Results at an evaluation's own parameters, kept on disk.

Until a visitor edits a level, every session of an evaluation asks AZURE2 the
same two questions -- the data curves and the extrapolations at the shipped
parameters -- and the extrapolations can take minutes (external capture).  The
answers are stored next to the model, in ``precomputed.json``, the first time
they are calculated, and returned from there afterwards: by the server
(``app.session``), by the in-browser build (``browser/bridge.py``, which ships the
file with each evaluation) and by ``python -m app.warm``, which fills the cache
for every evaluation after a deploy.

An entry is used only if it was calculated for the same model -- the
fingerprint covers the .azr file and the data files, so editing an evaluation
invalidates its cache -- *and* for the same parameter vector.  For a session
nobody has edited, the fingerprint alone is enough (``unedited=True``): its
parameters are the ones the .azr file ships, whatever the last bits the
engine reads them back with (the WebAssembly build reads 90 of ²⁴Mg's
parameters a few ulps -- some 5·10⁻⁸ relative -- away from the native one,
and an exact comparison then never hit).  An edited vector must agree to a
relative 1e-9 (a JSON round trip, not an edit).  Writing is best-effort: a
read-only evaluations directory only costs the speed-up.

The file and the fingerprint are read once per process and again only when
a file changes (``_load``), so a page reading cached curves does not parse
⁷Be's 10 MB file on every request.
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
# 3: the fine grid is one extended curve per distinct calculation (below and
#    above the data, resonances resolved), shared by the segments measuring
#    it; angle-integrated extrapolations are calculated at one angle.
# 4: an energy × angle extrapolation grid is calculated on request ("grid"),
#    not with the other extrapolations; a total capture on a much shorter
#    grid than its partial captures is extended (app.fine.extrap_model).
# 5: AZURE2 pinned at bc3bd57 (from 7e533b7): a total capture over several
#    capture pairs is calculated right without the split, a data file's last
#    line is read without a trailing newline, and the external-capture
#    integrals carry a signature.  Bump this with every new pin
#    (deploy/Dockerfile.azure2): the fingerprint does not cover the engine.
REVISION = "5"

# Parameters closer than this (relative) are the same vector.
TOLERANCE = 1e-9


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

def _model_files(directory):
    paths = [os.path.join(directory, f) for f in sorted(os.listdir(directory))
             if f.endswith(".azr")]
    data = os.path.join(directory, "data")
    if os.path.isdir(data):
        for root, dirs, files in os.walk(data):
            dirs.sort()
            paths += [os.path.join(root, f) for f in sorted(files)]
    return paths


def _stamp(paths):
    out = []
    for path in paths:
        try:
            st = os.stat(path)
            out.append((path, st.st_mtime_ns, st.st_size))
        except OSError:
            out.append((path, None, None))
    return tuple(out)


_FINGERPRINTS = {}


def fingerprint(directory):
    """A hash of the model: its .azr file(s) and everything under data/
    (and whether it splits its total capture).  Recomputed only when one of
    those files changes."""
    from app.fine import split_enabled
    split = split_enabled(directory)
    paths = _model_files(directory)
    stamp = (split, _stamp(paths))
    hit = _FINGERPRINTS.get(directory)
    if hit is not None and hit[0] == stamp:
        return hit[1]
    h = hashlib.sha256()
    h.update(f"revision {REVISION}".encode())
    # Toggling the split total-capture calculation changes every result.
    h.update(f"split {split}".encode())
    for path in paths:
        h.update(os.path.relpath(path, directory).encode())
        with open(path, "rb") as f:
            h.update(f.read())
    value = h.hexdigest()
    _FINGERPRINTS[directory] = (stamp, value)
    return value


_LOADED = {}


def _load(directory):
    path = os.path.join(directory, CACHE_FILE)
    try:
        st = os.stat(path)
    except OSError:
        _LOADED.pop(path, None)
        return None
    stamp = (st.st_mtime_ns, st.st_size)
    hit = _LOADED.get(path)
    if hit is not None and hit[0] == stamp:
        return hit[1]
    try:
        with open(path) as f:
            value = json.load(f)
    except (OSError, ValueError):
        return None
    _LOADED[path] = (stamp, value)
    return value


def same_params(a, b, tolerance=TOLERANCE) -> bool:
    """Are two parameter vectors the same, to ``tolerance`` (relative)?"""
    if a is None or b is None or len(a) != len(b):
        return False
    for x, y in zip(a, b):
        x, y = float(x), float(y)
        if x == y:
            continue
        if abs(x - y) > tolerance * max(abs(x), abs(y)):
            return False
    return True


def read(directory, params, key, unedited=False):
    """The cached ``key`` ("data", "fine", "extrap", "grid") for ``params``,
    or None.  ``unedited``: the parameters are the model's own, as the
    session read them from the .azr file -- the fingerprint is enough."""
    cache = _load(directory)
    if not cache or key not in cache:
        return None
    if cache.get("model") not in (None, fingerprint(directory)):
        return None
    if not unedited and not same_params(params, cache.get("params")):
        return None
    if unedited and cache.get("model") is None and not same_params(params, cache.get("params")):
        # An entry without a fingerprint can only be trusted on its parameters.
        return None
    decoded = cache.get("_decoded", {})
    if key not in decoded:
        decoded[key] = tuple(decode(cache[key]))
        cache["_decoded"] = decoded
    return decoded[key]


def write(directory, params, key, value, unedited=False):
    """Store ``value`` under ``key`` for ``params``; failures are only logged.
    ``unedited``: the parameters are the model's own (see :func:`read`), so
    the entries already there for this model are kept even if their
    parameters differ in the last bits."""
    params = [float(v) for v in params]
    try:
        model = fingerprint(directory)
        cache = _load(directory)
        keep = unedited and cache and cache.get("model") == model
        if not keep and (not cache or not same_params(cache.get("params"), params)
                         or cache.get("model") not in (None, model)):
            cache = {"params": params}
        cache = {k: v for k, v in cache.items() if k != "_decoded"}
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
