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
* a segment that spans no energy range (an angular distribution at one energy).

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


def plan(azr_path, cwd, segments) -> List[Optional[str]]:
    """One ``<segmentsTest>`` line per data segment, or ``None`` where the
    segment cannot be drawn on a grid.  Index ``i`` belongs to data segment
    ``i``."""
    lines = []
    for segment in segments:
        code = _TEST_CODE.get(segment.observable)
        if code is None or getattr(segment, "composite", False):
            lines.append(None)
            continue
        energies, angles = _data_points(cwd, segment)
        if len(energies) < 2:
            lines.append(None)
            continue
        lo, hi = min(energies), max(energies)
        if hi - lo <= 1e-6 * max(abs(hi), 1.0):
            lines.append(None)
            continue
        angle = 0.0
        if code in (1, 5):
            distinct = {round(a, 3) for a in angles}
            if len(distinct) != 1:
                lines.append(None)
                continue
            angle = angles[0]
        step = (hi - lo) / POINTS
        # Keep the step representable in the file's fixed notation, and let
        # the last grid point reach the last measurement.
        step = float(f"{step:.6g}")
        lines.append(
            f"1 {segment.entrance_key} {segment.exit_key} {lo:.8g} "
            f"{hi + step / 2:.8g} "
            f"{step:.6g} {angle:.6g} {angle:.6g} 0 {code} 0")
    return lines


def derived_model(azr_path, cwd, segments, workdir) -> Tuple[Optional[str], List[Optional[int]]]:
    """Write the derived model into ``workdir``.

    Returns its path and, per data segment, the index of its extrapolation
    segment in the derived model (``None`` for a segment left out), or
    ``(None, [...])`` when no segment can be drawn on a grid.
    """
    lines = plan(azr_path, cwd, segments)
    index, chosen = [], []
    for line in lines:
        if line is None:
            index.append(None)
        else:
            index.append(len(chosen))
            chosen.append(line)
    if not chosen:
        return None, index

    with open(azr_path) as f:
        text = f.read()
    block = "<segmentsTest>\n" + "\n".join(chosen) + "\n</segmentsTest>"
    text, n = re.subn(r"<segmentsTest>.*?</segmentsTest>", lambda _: block,
                      text, flags=re.S)
    if n != 1:
        return None, [None] * len(lines)

    # Its own output and checks directories (absolute: the model runs with the
    # evaluation's directory as cwd, so its data files resolve as before).
    output = os.path.join(workdir, "output") + os.sep
    checks = os.path.join(workdir, "checks") + os.sep
    os.makedirs(output, exist_ok=True)
    os.makedirs(checks, exist_ok=True)
    config = re.search(r"<config>\n(.*?)</config>", text, flags=re.S)
    if config is None:
        return None, [None] * len(lines)
    rows = config.group(1).split("\n")
    # Row 1: output directory, row 2: checks directory (after the A-matrix flag).
    for row, value in ((1, output), (2, checks)):
        if row < len(rows):
            comment = rows[row][rows[row].find("#"):] if "#" in rows[row] else ""
            rows[row] = f"{value:<100}{comment}"
    text = text[:config.start(1)] + "\n".join(rows) + text[config.end(1):]

    path = os.path.join(workdir, "fine.azr")
    fd, tmp = tempfile.mkstemp(dir=workdir, prefix=".fine-", suffix=".azr")
    with os.fdopen(fd, "w") as f:
        f.write(text)
    os.replace(tmp, path)
    return path, index


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


def workdir_for(cwd) -> str:
    """Where the derived model and its integrals live.

    Next to the evaluation when that directory is writable, so the
    external-capture integrals of the fine grid are computed once per deploy;
    otherwise a private temporary directory.
    """
    preferred = os.path.join(cwd, "fine")
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
