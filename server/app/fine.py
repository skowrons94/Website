"""The model on a fine energy grid, for drawing.

AZURE2 evaluates the model in data mode only at the measured energies, so a
plot that joins those values draws straight lines across every gap in the data
(0.65-1.45 MeV for one ¹²C(p,p) set) and cuts through resonances between two
points.  Its extrapolation mode evaluates the model on any grid, so for drawing
each data segment gets a matching *extrapolation* segment -- same entrance and
exit pair, same observable, same angle, the segment's own energy range -- on a
dense uniform grid.

The model file is left as it is.  A derived copy is written with only
``<segmentsTest>`` replaced and with its own output directory, so neither the
evaluation's extrapolations nor its cached external-capture integrals
(``output/intEC.extrap``) are touched; the data segments, and so the free
parameter vector, are unchanged, which is what lets the same parameters drive
both models.

What cannot be matched is skipped rather than approximated, and the page then
draws the model at the data points as before:

* composite (sum/ratio) and phase-shift segments;
* a differential segment whose points are at several angles (the curve is not
  a function of energy alone);
* a segment that spans no energy range and no angle range either.

An angular distribution (one energy, several angles) is drawn on an angle grid
instead, and a total-capture segment as the sum of one line per capture pair
(see :func:`summed`).

AZURE2 can also fold some data segments with the target thickness or the
detector's angular attenuation (``<targetInt>``), which an extrapolation does
not; :func:`attach` compares the two models at the data energies and keeps the
fine curve only where they agree.
"""

import math
import os
import re
import tempfile
from typing import List, Optional, Tuple

# <segmentsData> isDiff -> <segmentsTest> isDiff (see pyazr.datasets: the two
# blocks number their observables differently).
_TEST_CODE = {
    "angle-integrated": 0,
    "differential": 1,
    "total-capture": 4,
    "differential-cm": 5,
}

POINTS = 300
# An angular distribution is drawn on a grid of about this many angles.
ANGLES = 180


def capture_keys(azr_path) -> List[int]:
    """The keys of the model's capture (photon) pairs, ascending.

    These are the pairs AZURE2 sums over for a "total capture" segment.
    """
    try:
        from pyazr import AzrModel
        model = AzrModel.from_file(azr_path)
    except Exception:
        return []
    keys = set()
    for level in model.levels:
        for channel in level.channels:
            if getattr(channel, "ptype", None) == 10:
                keys.add(channel.pair)
    return sorted(keys)


def summed(segments, captures) -> bool:
    """Does AZURE2 build *component* segments for this set?

    A total-capture segment over more than one capture pair is calculated as
    the first pair plus one component segment per further pair, and at the
    pinned AZURE2 revision the external-capture integrals of those components
    are mishandled whenever ``output/intEC.*`` already exists: read back as
    zeros when the file holds only the regular segments' integrals (the
    shipped files), or out of step -- garbage -- when it holds both.  ¹⁷F's
    total capture then came out as the ground-state transition alone, ~15x
    below the data, and ⁷Be's ³He(α,γ) 20% low.  A fresh calculation is
    right.  See :mod:`app.engine` for how each model avoids the reuse.
    """
    if len(captures) < 2:
        return False
    return any(getattr(s, "active", True) and s.observable == "total-capture"
               for s in segments)


def _data_points(cwd, segment) -> Tuple[List[float], List[float]]:
    """``(energies, angles)`` of a segment's points, in the file's own frame
    (laboratory energy, as the segment's energy limits are), filtered by the
    segment's energy and angle windows the way AZURE2 filters them."""
    path = os.path.join(cwd, segment.data_file)
    energies, angles = [], []
    try:
        with open(path) as f:
            for line in f:
                tokens = line.split()
                if len(tokens) < 2:
                    continue
                try:
                    energy, angle = float(tokens[0]), float(tokens[1])
                except ValueError:
                    continue
                if not (segment.energy_min <= energy <= segment.energy_max):
                    continue
                if not (segment.angle_min <= angle <= segment.angle_max):
                    continue
                energies.append(energy)
                angles.append(angle)
    except OSError:
        pass
    return energies, angles


def _same(values, tolerance=1e-4) -> bool:
    lo, hi = min(values), max(values)
    return hi - lo <= tolerance * max(abs(hi), 1.0)


def plan(azr_path, cwd, segments, captures=None) -> List[Optional[Tuple[List[str], str]]]:
    """Per data segment, the ``<segmentsTest>`` lines that draw it and the
    axis they run along (``"energy"`` or ``"angle"``), or ``None`` where the
    segment cannot be drawn on a grid.  Index ``i`` belongs to data segment
    ``i``.

    * An excitation function (points at one angle, several energies) gets an
      energy grid at that angle.
    * An angular distribution (one energy, several angles) gets an angle grid
      at that energy -- it is plotted against the angle.
    * A total-capture segment is drawn as one angle-integrated line per
      capture pair, summed by the caller, rather than as AZURE2's own total
      capture (whose integrals are unreliable, see :func:`summed`).
    """
    if captures is None:
        captures = capture_keys(azr_path)
    out = []
    for segment in segments:
        code = _TEST_CODE.get(segment.observable)
        if code is None or getattr(segment, "composite", False):
            out.append(None)
            continue
        energies, angles = _data_points(cwd, segment)
        if len(energies) < 2:
            out.append(None)
            continue
        lo, hi = min(energies), max(energies)
        if code in (1, 5) and _same(energies) and not _same(angles, 1e-3):
            # An angular distribution at one energy.
            amin, amax = min(angles), max(angles)
            astep = float(f"{max((amax - amin) / ANGLES, 0.1):.3g}")
            energy = sum(energies) / len(energies)
            out.append(([
                f"1 {segment.entrance_key} {segment.exit_key} {energy:.8g} "
                f"{energy:.8g} 0.01 {amin:.6g} {amax + astep / 2:.6g} "
                f"{astep:.6g} {code} 0"], "angle"))
            continue
        if hi - lo <= 1e-6 * max(abs(hi), 1.0):
            out.append(None)
            continue
        angle = 0.0
        if code in (1, 5):
            distinct = {round(a, 3) for a in angles}
            if len(distinct) != 1:
                out.append(None)
                continue
            angle = angles[0]
        step = (hi - lo) / POINTS
        # Keep the step representable in the file's fixed notation, and let
        # the last grid point reach the last measurement.
        step = float(f"{step:.6g}")
        exits = [segment.exit_key]
        if code == 4:
            exits, code = (captures or [segment.exit_key]), 0
            if exits == [segment.exit_key]:
                code = 4
        out.append(([
            f"1 {segment.entrance_key} {exit_} {lo:.8g} "
            f"{hi + step / 2:.8g} "
            f"{step:.6g} {angle:.6g} {angle:.6g} 0 {code} 0"
            for exit_ in exits], "energy"))
    return out


def with_directories(text, output, checks) -> Optional[str]:
    """``text`` (an .azr file) writing its output and checks to the given
    absolute directories, or ``None`` if it has no ``<config>`` block."""
    config = re.search(r"<config>\n(.*?)</config>", text, flags=re.S)
    if config is None:
        return None
    rows = config.group(1).split("\n")
    # Row 1: output directory, row 2: checks directory (after the A-matrix flag).
    for row, value in ((1, output), (2, checks)):
        if row < len(rows):
            comment = rows[row][rows[row].find("#"):] if "#" in rows[row] else ""
            rows[row] = f"{value:<100}{comment}"
    return text[:config.start(1)] + "\n".join(rows) + text[config.end(1):]


def _write_model(text, workdir, name) -> Optional[str]:
    """Write ``text`` as ``workdir/name`` with its own output and checks
    directories there (absolute: the model runs with the evaluation's
    directory as cwd, so its data files resolve as before)."""
    output = os.path.join(workdir, "output") + os.sep
    checks = os.path.join(workdir, "checks") + os.sep
    os.makedirs(output, exist_ok=True)
    os.makedirs(checks, exist_ok=True)
    text = with_directories(text, output, checks)
    if text is None:
        return None
    path = os.path.join(workdir, name)
    fd, tmp = tempfile.mkstemp(dir=workdir, prefix=".fine-", suffix=".azr")
    with os.fdopen(fd, "w") as f:
        f.write(text)
    os.replace(tmp, path)
    return path


def _with_tests(text, lines) -> Optional[str]:
    block = "<segmentsTest>\n" + "\n".join(lines) + "\n</segmentsTest>"
    text, n = re.subn(r"<segmentsTest>.*?</segmentsTest>", lambda _: block,
                      text, flags=re.S)
    return text if n == 1 else None


def derived_model(azr_path, cwd, segments, workdir):
    """Write the derived model into ``workdir``.

    Returns its path and, per data segment, ``{"slots": [...], "axis": ...}``
    -- the indices of its extrapolation segments in the derived model (summed
    when there are several) and the variable they run along -- or ``None``
    for a segment left out.  The path is ``None`` when no segment can be
    drawn on a grid.
    """
    planned = plan(azr_path, cwd, segments)
    index, chosen = [], []
    for item in planned:
        if item is None:
            index.append(None)
            continue
        lines, axis = item
        index.append({"slots": list(range(len(chosen), len(chosen) + len(lines))),
                      "axis": axis})
        chosen.extend(lines)
    if not chosen:
        return None, index

    with open(azr_path) as f:
        text = _with_tests(f.read(), chosen)
    if text is None:
        return None, [None] * len(planned)
    path = _write_model(text, workdir, "fine.azr")
    if path is None:
        return None, [None] * len(planned)
    return path, index


def extrap_model(azr_path, workdir, captures):
    """The evaluation's own extrapolations as a model without component
    segments: every active total-capture line becomes one angle-integrated
    line per capture pair (summed back by the caller), and inactive lines,
    which AZURE2 does not calculate, are dropped.

    Returns ``(path, slots)``: ``slots[j]`` lists the derived segments that
    make up the ``j``-th *active* extrapolation segment.
    """
    with open(azr_path) as f:
        text = f.read()
    block = re.search(r"<segmentsTest>\n(.*?)</segmentsTest>", text, flags=re.S)
    if block is None:
        return None, []
    lines, slots = [], []
    for raw in block.group(1).split("\n"):
        t = raw.split()
        if len(t) < 10 or int(float(t[0])) != 1:
            continue
        if int(float(t[9])) == 4 and int(float(t[2])) == -1 and len(captures) > 1:
            group = []
            for key in captures:
                u = list(t)
                u[2], u[9] = str(key), "0"
                group.append(len(lines))
                lines.append(" ".join(u))
            slots.append(group)
        else:
            slots.append([len(lines)])
            lines.append(" ".join(t))
    text = _with_tests(text, lines)
    if text is None:
        return None, []
    return _write_model(text, workdir, "extrap.azr"), slots


def _expand(listing: str) -> List[int]:
    """A <targetInt> segment list ("4-7", "1,3,10-12") as keys."""
    keys = []
    for part in listing.split(","):
        part = part.strip()
        if not part:
            continue
        if "-" in part:
            a, b = part.split("-", 1)
            try:
                keys.extend(range(int(a), int(b) + 1))
            except ValueError:
                continue
        else:
            try:
                keys.append(int(part))
            except ValueError:
                continue
    return keys


def split_data_model(azr_path, workdir, captures):
    """The model with every total capture written out per capture pair.

    Each active total-capture data line becomes an angle-integrated line for
    the first capture pair (same key, same normalisation), and one more line
    per further capture pair is appended after all the others, with the same
    data file, a fixed normalisation and no energy shift -- so no segment key
    and no free parameter of the evaluation moves.  Summing the appended
    lines back onto their base (:func:`sum_slots`) gives AZURE2's total
    capture without its component segments, whose external-capture integrals
    the engine cannot reuse (:func:`summed`); this model's integrals it can,
    so they are computed once per deploy.

    ``<targetInt>`` segment lists are rewritten as explicit keys so that a
    range like "4-7" does not reach the appended lines (and a target effect
    on a total capture covers its appended parts too).

    Returns ``(path, groups)``: ``groups[j]`` lists the slots (in the
    calculated arrays) that make up the ``j``-th *active* data segment.
    """
    with open(azr_path) as f:
        text = f.read()
    block = re.search(r"<segmentsData>\n(.*?)</segmentsData>", text, flags=re.S)
    if block is None or len(captures) < 2:
        return None, []
    raw = [line for line in block.group(1).split("\n") if line.strip()]
    n = len(raw)
    active = [len(line.split()) > 0 and int(float(line.split()[0])) == 1 for line in raw]
    # AZURE2 reports active segments only, in file order: a line's slot in
    # the calculated arrays is its rank among the active ones.
    slot, rank = {}, 0
    for i, on in enumerate(active):
        if on:
            slot[i] = rank
            rank += 1
    lines, extra, groups, totals = [], [], [], {}
    for i, line in enumerate(raw):
        t = line.split()
        if not active[i]:
            lines.append(line)
            continue
        if len(t) >= 15 and int(float(t[7])) == 3 and int(float(t[2])) == -1:
            base = list(t)
            base[2], base[7] = str(captures[0]), "0"
            lines.append("  ".join(base))
            group = [slot[i]]
            for key in captures[1:]:
                u = list(t)
                u[2], u[7], u[9] = str(key), "0", "0"
                group.append(rank + len(extra))
                totals.setdefault(i + 1, []).append(n + len(extra) + 1)
                extra.append("  ".join(u))
            groups.append(group)
        else:
            lines.append(line)
            groups.append([slot[i]])
    if not extra:
        return None, []
    text = (text[:block.start(1)] + "\n".join(lines + extra) + "\n"
            + text[block.end(1):])

    def relist(match):
        keys = []
        for key in _expand(match.group(2)):
            if 1 <= key <= n:
                keys.append(key)
                keys.extend(totals.get(key, []))
        return f'{match.group(1)}"{",".join(str(k) for k in keys) or "0"}"'

    target = re.search(r"<targetInt>\n(.*?)</targetInt>", text, flags=re.S)
    if target is not None:
        body = re.sub(r'^(\s*\S+\s+)"([^"]*)"', relist, target.group(1), flags=re.M)
        text = text[:target.start(1)] + body + text[target.end(1):]
    return _write_model(text, workdir, "data.azr"), groups


def sum_slots(arrays, slots):
    """The sum of ``arrays[k]`` over ``k`` in ``slots`` (one array: itself)."""
    import numpy as np
    first = np.asarray(arrays[slots[0]], dtype=float)
    if len(slots) == 1:
        return first
    total = first.copy()
    for k in slots[1:]:
        other = np.asarray(arrays[k], dtype=float)
        n = min(len(total), len(other))
        total = total[:n] + other[:n]
    return total


class building:
    """An exclusive lock on ``workdir`` while a derived model initializes.

    Two sessions of one evaluation would otherwise compute (and write) the
    same external-capture integrals at once; the second now waits and then
    reads them.  Where file locks do not exist (the in-browser build, which
    runs one request at a time anyway) it does nothing.
    """

    def __init__(self, workdir):
        self.path = os.path.join(workdir, ".lock")
        self.file = None

    def __enter__(self):
        try:
            import fcntl
            self.file = open(self.path, "w")
            fcntl.flock(self.file, fcntl.LOCK_EX)
        except (ImportError, OSError):
            self.file = None
        return self

    def __exit__(self, *exc):
        if self.file is not None:
            try:
                import fcntl
                fcntl.flock(self.file, fcntl.LOCK_UN)
            finally:
                self.file.close()
        return False


def workdir_for(cwd, name="fine") -> str:
    """Where a derived model and its integrals live.

    Next to the evaluation when that directory is writable, so the
    external-capture integrals of the derived grid are computed once per
    deploy; otherwise a private temporary directory.
    """
    preferred = os.path.join(cwd, name)
    try:
        os.makedirs(preferred, exist_ok=True)
        probe = os.path.join(preferred, ".probe")
        with open(probe, "w"):
            pass
        os.remove(probe)
        return preferred
    except OSError:
        return tempfile.mkdtemp(prefix="azure2-fine-")


# -- joining the fine curve onto the data segments -------------------------------

def _interp(xs, ys, x):
    """Linear interpolation on a sorted grid; None outside it."""
    if not xs or x < xs[0] or x > xs[-1]:
        return None
    lo, hi = 0, len(xs) - 1
    while hi - lo > 1:
        mid = (lo + hi) // 2
        if xs[mid] <= x:
            lo = mid
        else:
            hi = mid
    if xs[hi] == xs[lo]:
        return ys[lo]
    t = (x - xs[lo]) / (xs[hi] - xs[lo])
    if ys[lo] is None or ys[hi] is None:
        return None
    return ys[lo] + t * (ys[hi] - ys[lo])


def agrees(grid_x, grid_y, at_x, at_y, tolerance=0.01) -> bool:
    """Does the fine curve reproduce the model at the data energies?

    The median relative difference over the points is used, so a narrow
    resonance between two grid points (where linear interpolation is poor) does
    not reject a curve that is right everywhere else, while a systematic
    difference -- a segment AZURE2 folds with the target or the detector -- does.
    """
    diffs = []
    for x, y in zip(at_x, at_y):
        if x is None or y is None or not math.isfinite(y) or y == 0:
            continue
        g = _interp(grid_x, grid_y, x)
        if g is None or not math.isfinite(g):
            continue
        diffs.append(abs(g - y) / abs(y))
    if not diffs:
        return False
    diffs.sort()
    return diffs[len(diffs) // 2] < tolerance


def merge(grid_x, grid_y, at_x, at_y):
    """The fine grid with the model's exact values at the data energies
    merged in, sorted by energy: the curve then passes through every value the
    χ² is computed from, and is smooth in between."""
    points = {}
    for x, y in zip(grid_x, grid_y):
        if x is not None and y is not None and math.isfinite(y):
            points[x] = y
    for x, y in zip(at_x, at_y):
        if x is not None and y is not None and math.isfinite(y):
            points[x] = y
    xs = sorted(points)
    return xs, [points[x] for x in xs]
