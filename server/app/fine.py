"""The model on a fine, extended energy grid, for drawing.

AZURE2 evaluates the model in data mode only at the measured energies, so a
plot that joins those values draws straight lines across every gap in the data
(0.65-1.45 MeV for one ¹²C(p,p) set) and cuts through resonances between two
points, and stops where the data stop.  Its extrapolation mode evaluates the
model on any grid, so for drawing each distinct calculation the data measure
-- same entrance and exit pair, same observable, same angle; ⁷Be's 120
datasets share far fewer -- gets matching *extrapolation* segments on a grid
that reaches beyond the data (:func:`plan`):

* below the lowest measurement, to a third of it, and for a charged-particle
  reaction towards the astrophysical region (the Gamow peak at T₉ = 0.01),
  never below 10 keV nor below the threshold of a closed exit channel;
* 15% above the highest;
* log-spaced over all of it, uniform over the data's own range, and refined
  around every resonance of the level scheme (at the shipped parameters), so
  a narrow one is neither missed nor cut.

AZURE2's grids are uniform, so the grid is written as *pieces* (one
``<segmentsTest>`` line each, or one per capture pair for a total capture,
summed) and the pieces are joined and sorted (:func:`join_pieces`).

The model file is left as it is.  A derived copy is written with only
``<segmentsTest>`` replaced and with its own output directory, so neither the
evaluation's extrapolations nor its cached external-capture integrals
(``output/intEC.extrap``) are touched; the data segments, and so the free
parameter vector, are unchanged, which is what lets the same parameters drive
both models.  The integrals of the derived grid are computed once (per
deploy) and are discarded whenever the derived file changes.

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
not; the serializer compares the two models at the data energies
(:func:`agrees`) and keeps the curve only for the segments where they agree --
beyond the data there is nothing to compare, and the extension goes with the
part that agrees.
"""

import math
import os
import re
import tempfile
from typing import Dict, List, Optional, Tuple

# <segmentsData> isDiff -> <segmentsTest> isDiff (see pyazr.datasets: the two
# blocks number their observables differently).
_TEST_CODE = {
    "angle-integrated": 0,
    "differential": 1,
    "total-capture": 4,
    "differential-cm": 5,
}

# The extended energy grid of one calculation (see plan and energy_pieces).
LOG_POINTS = 240        # log-spaced, over the whole extended range
DATA_POINTS = 160       # uniform, over the data's own range
PIECE_RATIO = 2.0       # the log grid as uniform pieces of this energy ratio
EXTEND_BELOW = 3.0      # down to the lowest measurement / this ...
EXTEND_ABOVE = 1.15     # ... and up to the highest × this
# Around a resonance (E_R, Γ): pieces of half-width × Γ and step × Γ.
RESONANCE_PIECES = ((5.0, 1.0), (1.5, 0.25), (0.5, 1 / 12))
ASTRO_T9 = 0.01         # charged-particle reactions: down to this Gamow peak
FLOOR = 0.010           # MeV c.m.: never below (a neutron: FLOOR_NEUTRAL)
FLOOR_NEUTRAL = 0.001
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


FLAG = "split_total_capture"


def split_enabled(directory) -> bool:
    """Has the evaluation opted in (``"split_total_capture": true`` in its
    ``info.json``) to the split total-capture calculation?

    Off by default: the model is calculated as AZURE2 calculates it, which
    at the pinned revision gives the same total (see :func:`summed`).
    """
    import json
    try:
        with open(os.path.join(directory, "info.json")) as f:
            return json.load(f).get(FLAG) is True
    except (OSError, ValueError, AttributeError):
        return False


def summed(segments, captures) -> bool:
    """Does AZURE2 build *component* segments for this set?

    A total-capture segment over more than one capture pair is calculated as
    the first pair plus one component segment per further pair.  Up to
    AZURE2 7e533b7 the external-capture integrals of those components were
    mishandled whenever ``output/intEC.*`` already existed: read back as
    zeros when the file held only the regular segments' integrals, or out of
    step -- garbage -- when it held both.  ¹⁷F's total capture then came out
    as the ground-state transition alone, ~15x below the data, and ⁷Be's
    ³He(α,γ) 20% low.  The pinned revision (bc3bd57, fix 886cdf7) is right
    either way; the split model (:mod:`app.engine`, for an evaluation whose
    ``info.json`` opts in: :func:`split_enabled`; README.md) is the
    workaround the site used before, and gives the same numbers.
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


def model_pairs(azr_path) -> Dict[int, dict]:
    """Per pair key, what the extended grid needs to know of it: charges,
    masses, its threshold (an excitation energy of the compound nucleus) and
    whether it is a photon pair.  Read from the ``<levels>`` lines, which
    carry every pair a level decays to."""
    try:
        from pyazr import AzrModel
        model = AzrModel.from_file(azr_path)
    except Exception:
        return {}
    pairs = {}
    for level in model.levels:
        for c in level.channels:
            if c.pair in pairs:
                continue
            pairs[c.pair] = {
                "Z1": c.Z1, "Z2": c.Z2, "M1": c.M1, "M2": c.M2,
                "threshold": c.sep_energy + c.excitation,
                "photon": c.ptype != 0,
            }
    return pairs


def model_levels(azr_path) -> List[Tuple[float, float]]:
    """``(E_x, Γ)`` in MeV of every active level, at the shipped parameters.

    Γ is the sum of the level's partial widths (eV in the file): photon
    channels, and particle channels the level lies above (below a pair's
    threshold the stored value is an ANC, not a width).
    """
    try:
        from pyazr import AzrModel
        model = AzrModel.from_file(azr_path)
    except Exception:
        return []
    out = []
    for level in model.levels:
        channels = [c for c in level.channels if c.active]
        if not channels:
            continue
        energy = level.energy
        width = 0.0
        for c in channels:
            if c.ptype == 0:
                if energy >= c.sep_energy + c.excitation:
                    width += abs(c.gamma)
            elif c.ptype == 10:
                width += abs(c.gamma)
        out.append((energy, width * 1e-6))
    return out


def _lab_factor(pair) -> float:
    """E_cm / E_lab for the entrance pair (light particle on the heavy one at
    rest), as AZURE2 converts a segment's laboratory energies."""
    try:
        m1, m2 = float(pair["M1"]), float(pair["M2"])
        if m1 > 0 and m2 > 0:
            return m2 / (m1 + m2)
    except (KeyError, TypeError, ValueError):
        pass
    return 1.0


def gamow_peak(pair, T9) -> float:
    """The Gamow peak (MeV) of a charged pair at temperature ``T9``."""
    m1, m2 = float(pair["M1"]), float(pair["M2"])
    mu = m1 * m2 / (m1 + m2)
    return 0.122 * (pair["Z1"] ** 2 * pair["Z2"] ** 2 * mu * T9 ** 2) ** (1 / 3)


def extended_range(entrance, exit_, lo, hi, pairs, lab_angle=False) -> Tuple[float, float]:
    """The c.m. energy range one calculation is drawn over, beyond the data's
    own ``[lo, hi]``.

    Up to ``EXTEND_ABOVE`` × the highest measurement.  Down to a third of the
    lowest, and for a charged-particle capture or reaction further, to the
    Gamow peak at T₉ = 0.01 (the astrophysical region, where the model is
    used); never below ``FLOOR`` (10 keV; 1 keV for a neutron) nor, for an
    exit channel that opens above the entrance (Q < 0), below its threshold
    -- nor, measured at a laboratory angle (``lab_angle``), below the data.
    """
    pin = pairs.get(entrance) or {}
    charged = bool(pin) and pin.get("Z1", 0) * pin.get("Z2", 0) > 0
    reaction = exit_ != entrance
    floor = FLOOR if charged or not pin else FLOOR_NEUTRAL
    e_lo = lo / EXTEND_BELOW
    if charged and reaction:
        try:
            e_lo = min(e_lo, gamow_peak(pin, ASTRO_T9))
        except (KeyError, TypeError, ValueError, ZeroDivisionError):
            pass
    e_lo = max(e_lo, floor)
    pout = pairs.get(exit_)
    if pin and pout and not pout.get("photon") and reaction:
        opens = pout["threshold"] - pin["threshold"]
        if opens > 0:
            e_lo = max(e_lo, opens + max(1e-3, 2e-3 * opens))
            if lab_angle:
                # Near the threshold of an endothermic reaction the ejectile
                # is thrown forward: a laboratory angle the data were taken
                # at is not reachable below them.
                e_lo = lo
    return min(e_lo, lo), hi * EXTEND_ABOVE


def energy_pieces(lo, hi, e_lo, e_hi, resonances) -> List[Tuple[float, float, float]]:
    """The extended grid of one calculation as uniform pieces ``(start, stop,
    step)`` in c.m. MeV -- AZURE2 grids are uniform -- to be calculated
    separately and joined:

    * a logarithmic base over ``[e_lo, e_hi]`` (``LOG_POINTS``), as pieces of
      ratio ``PIECE_RATIO`` with a uniform step each;
    * ``DATA_POINTS`` uniform points over the data's own range (the grid the
      plots drew before the extension);
    * around every resonance ``(E_R, Γ)`` inside the range, nested pieces at
      ±5Γ, ±1.5Γ and ±Γ/2 with steps Γ, Γ/4 and Γ/12 (``RESONANCE_PIECES``,
      ~35 points, densest at the peak), so a narrow resonance is neither
      missed nor cut -- each only where it is finer than the grid already
      there.
    """
    out = []
    ratio = e_hi / e_lo if e_lo > 0 else 1.0
    if ratio > 1:
        k = max(1, math.ceil(math.log(ratio) / math.log(PIECE_RATIO)))
        n = max(4, math.ceil(LOG_POINTS / k))
        for i in range(k):
            a = e_lo * ratio ** (i / k)
            b = e_lo * ratio ** ((i + 1) / k)
            out.append((a, b, (b - a) / n))
    if hi > lo:
        out.append((lo, hi, (hi - lo) / DATA_POINTS))
    base = list(out)

    def spacing(energy):
        """The base grid's step at ``energy``."""
        steps = [step for a, b, step in base if a <= energy <= b]
        return min(steps) if steps else math.inf

    for e_r, width in resonances:
        if not (e_lo < e_r < e_hi) or width <= 0 or width > e_r:
            continue
        # A width the grid's digits cannot resolve is drawn as one this wide.
        width = max(width, 2e-6 * e_r)
        local = spacing(e_r)
        for half, step in RESONANCE_PIECES:
            half, step = half * width, step * width
            # Only where it is finer than the grid already there: a broad
            # resonance needs nothing added.
            if step >= 0.7 * local:
                continue
            a, b = max(e_lo, e_r - half), min(e_hi, e_r + half)
            if b - a > step / 2:
                out.append((a, b, step))
    return out


def _calc_key(segment, code, angle, energy=None):
    """What makes two data segments one calculation: the same channels,
    observable and angle (an excitation function), or the same energy (an
    angular distribution)."""
    if energy is not None:
        return ("angle", segment.entrance_key, segment.exit_key, code, round(energy, 6))
    return ("energy", segment.entrance_key, segment.exit_key, code, round(angle, 2))


def plan(azr_path, cwd, segments, captures=None):
    """The calculations that draw the data segments, and which one draws which.

    Returns ``(calcs, index)``.  ``index[i]`` is the calculation drawing data
    segment ``i`` (shared by every segment measuring the same curve: ⁷Be has
    120 datasets and far fewer distinct curves), or ``None`` where the segment
    cannot be drawn on a grid.  ``calcs[j]`` is ``{"axis": ..., "pieces":
    [[line, ...], ...]}``: ``<segmentsTest>`` lines, one *piece* per uniform
    stretch of the grid, the lines of a piece summed (one per capture pair for
    a total capture), the pieces joined and sorted by the caller.

    * An excitation function (points at one angle, several energies) gets the
      extended energy grid of :func:`energy_pieces` at that angle, over the
      range of :func:`extended_range` around every dataset sharing it.
    * An angular distribution (one energy, several angles) gets an angle grid
      at that energy -- it is plotted against the angle.
    * A total-capture segment is drawn as one angle-integrated line per
      capture pair, summed, rather than as AZURE2's own total capture (whose
      integrals were unreliable up to AZURE2 7e533b7, see :func:`summed`) --
      where the evaluation opts in (:func:`split_enabled`).
    """
    if captures is None:
        captures = capture_keys(azr_path) if split_enabled(cwd) else []
    pairs = model_pairs(azr_path)
    levels = model_levels(azr_path)

    groups = {}             # key -> {"segments": [...], ...}
    index = []
    for i, segment in enumerate(segments):
        code = _TEST_CODE.get(segment.observable)
        if code is None or getattr(segment, "composite", False):
            index.append(None)
            continue
        energies, angles = _data_points(cwd, segment)
        if len(energies) < 2:
            index.append(None)
            continue
        lo, hi = min(energies), max(energies)
        if code in (1, 5) and _same(energies) and not _same(angles, 1e-3):
            energy = sum(energies) / len(energies)
            key = _calc_key(segment, code, None, energy)
            g = groups.setdefault(key, {"segment": segment, "code": code,
                                        "energy": energy, "lo": min(angles),
                                        "hi": max(angles)})
            g["lo"], g["hi"] = min(g["lo"], min(angles)), max(g["hi"], max(angles))
            index.append(key)
            continue
        if hi - lo <= 1e-6 * max(abs(hi), 1.0):
            index.append(None)
            continue
        angle = 0.0
        if code in (1, 5):
            distinct = {round(a, 3) for a in angles}
            if len(distinct) != 1:
                index.append(None)
                continue
            angle = angles[0]
        key = _calc_key(segment, code, angle)
        g = groups.setdefault(key, {"segment": segment, "code": code,
                                    "angle": angle, "lo": lo, "hi": hi})
        g["lo"], g["hi"] = min(g["lo"], lo), max(g["hi"], hi)
        index.append(key)

    calcs, number = [], {}
    for key, g in groups.items():
        segment, code = g["segment"], g["code"]
        if key[0] == "angle":
            amin, amax = g["lo"], g["hi"]
            astep = float(f"{max((amax - amin) / ANGLES, 0.1):.3g}")
            energy = g["energy"]
            pieces = [[
                f"1 {segment.entrance_key} {segment.exit_key} {energy:.8g} "
                f"{energy:.8g} 0.01 {amin:.6g} {amax + astep / 2:.6g} "
                f"{astep:.6g} {code} 0"]]
            number[key] = len(calcs)
            calcs.append({"axis": "angle", "pieces": pieces})
            continue
        entrance, exit_ = segment.entrance_key, segment.exit_key
        factor = _lab_factor(pairs.get(entrance) or {})
        lo, hi = g["lo"] * factor, g["hi"] * factor        # c.m.
        e_lo, e_hi = extended_range(entrance, exit_, lo, hi, pairs, lab_angle=code == 1)
        threshold = (pairs.get(entrance) or {}).get("threshold")
        resonances = ([(ex - threshold, width) for ex, width in levels]
                      if threshold is not None else [])
        exits, line_code = [exit_], code
        if code == 4 and captures and captures != [exit_]:
            exits, line_code = captures, 0
        angle = g["angle"]
        pieces = []
        for a, b, step in energy_pieces(lo, hi, e_lo, e_hi, resonances):
            a, b, step = a / factor, b / factor, step / factor          # lab
            pieces.append([
                f"1 {entrance} {x} {a:.10g} {b + step / 2:.10g} {step:.8g} "
                f"{angle:.6g} {angle:.6g} 0 {line_code} 0"
                for x in exits])
        number[key] = len(calcs)
        calcs.append({"axis": "energy", "pieces": pieces})
    return calcs, [None if key is None else number[key] for key in index]


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
    # External-capture integrals belong to the grid they were calculated on:
    # a model written differently from the one there (a new grid, a changed
    # evaluation) must not read the old ones back.
    # (The directories it names are left out of the comparison: the
    # in-browser build ships the integrals computed at another path.)
    def body(t):
        return re.sub(r"<config>.*?</config>", "", t, count=1, flags=re.S)
    try:
        with open(path) as f:
            same = body(f.read()) == body(text)
    except OSError:
        same = False
    if not same:
        for stale in ("intEC.dat", "intEC.extrap"):
            try:
                os.remove(os.path.join(output, stale))
            except OSError:
                pass
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

    Returns ``(path, calcs, index)``: ``index[i]`` is the calculation drawing
    data segment ``i`` (or ``None``), and ``calcs[j]`` is ``{"axis": ...,
    "pieces": [[slot, ...], ...]}`` -- the derived model's extrapolation
    segments of each piece of that calculation's grid (summed within a piece,
    joined across pieces; see :func:`plan`).  The path is ``None`` when no
    segment can be drawn on a grid.
    """
    planned, index = plan(azr_path, cwd, segments)
    lines, calcs = [], []
    for calc in planned:
        pieces = []
        for piece in calc["pieces"]:
            pieces.append(list(range(len(lines), len(lines) + len(piece))))
            lines.extend(piece)
        calcs.append({"axis": calc["axis"], "pieces": pieces})
    if not lines:
        return None, [], [None] * len(index)

    with open(azr_path) as f:
        text = _with_tests(f.read(), lines)
    if text is None:
        return None, [], [None] * len(index)
    path = _write_model(text, workdir, "fine.azr")
    if path is None:
        return None, [], [None] * len(index)
    return path, calcs, index


def _active_tests(text):
    block = re.search(r"<segmentsTest>\n(.*?)</segmentsTest>", text, flags=re.S)
    if block is None:
        return None
    return [raw.split() for raw in block.group(1).split("\n")
            if len(raw.split()) >= 10 and int(float(raw.split()[0])) == 1]


def _collapsible(t) -> bool:
    """An angle-integrated (or total-capture) line over a range of angles:
    AZURE2 calculates the same number once per angle (⁷Be: 0-180° in steps of
    1°, 181 identical copies of every energy)."""
    return (int(float(t[9])) in (0, 4) and float(t[8]) > 0
            and float(t[7]) > float(t[6]))


# -- the extrapolations' derived models -----------------------------------------

# Energy × angle grids (a differential line over a range of energies *and*
# angles: ⁷Be's ⁶Li(p,α) at 2.8-6 MeV × 0-180°, 58,101 points) are not
# calculated with the other extrapolations: they were three quarters of ⁷Be's
# extrapolation points and most of its time and payload.  They are calculated
# on request (:func:`grid_model`) as a few representative angles and as a
# coarse energy × angle map.
GRID_ANGLES = (20.0, 45.0, 70.0, 90.0, 110.0, 135.0, 160.0)
MAP_ANGLE_STEP = 5.0     # degrees
MAP_ENERGIES = 61        # energies per map row

# A total capture shipped on a short grid (²²Ne(p,γ): 1-100 keV, 10 points,
# while its partial captures run to 3 MeV) is drawn on a longer one: log-
# spaced from ``CAPTURE_LOG_FROM`` (c.m. MeV) up to the partials' maximum,
# plus the partials' own uniform grid -- the shipped points are kept.
CAPTURE_LOG_FROM = 0.030
CAPTURE_LOG_PER_PIECE = 24


def _points(lo, hi, step) -> int:
    if step <= 0 or hi <= lo:
        return 1
    return int(math.floor((hi - lo) / step + 1e-9)) + 1


def is_grid(t) -> bool:
    """A differential line over a range of energies and of angles."""
    try:
        code = int(float(t[9]))
        return (code in (1, 5)
                and _points(float(t[3]), float(t[4]), float(t[5])) > 1
                and float(t[8]) > 0 and float(t[7]) > float(t[6]))
    except (IndexError, ValueError):
        return False


def _capture_extension(t, tests, lab_factor, photons) -> List[Tuple[float, float, float]]:
    """Extra ``(lo, hi, step)`` lab-energy pieces for a total-capture line
    that stops well below the partial captures of its entrance pair (lines
    to a photon pair in ``photons``; ``[]`` when it does not)."""
    try:
        if int(float(t[9])) != 4:
            return []
        lo, hi = float(t[3]), float(t[4])
        siblings = [u for u in tests if u is not t and u[1] == t[1]
                    and int(float(u[2])) in photons
                    and int(float(u[9])) in (0, 4) and float(u[4]) > float(u[3])]
        if not siblings:
            return []
        top = max(float(u[4]) for u in siblings)
        if top < 2 * hi:
            return []
        step = min(float(u[5]) for u in siblings if float(u[4]) == top)
    except (IndexError, ValueError):
        return []
    pieces = []
    start = max(lo, CAPTURE_LOG_FROM / lab_factor)
    if top > start:
        k = max(1, math.ceil(math.log(top / start) / math.log(PIECE_RATIO)))
        for i in range(k):
            a = start * (top / start) ** (i / k)
            b = start * (top / start) ** ((i + 1) / k)
            pieces.append((a, b, (b - a) / CAPTURE_LOG_PER_PIECE))
    if step > 0 and top > hi:
        pieces.append((hi, top, step))
    return pieces


def _pair_facts(azr_path):
    """``(E_cm / E_lab per pair key as a string, the photon pairs' keys)``."""
    pairs = model_pairs(azr_path)
    return ({str(key): _lab_factor(pair) for key, pair in pairs.items()},
            {key for key, pair in pairs.items() if pair.get("photon")})


def extrap_needs_model(azr_path, captures, split) -> bool:
    """Should the extrapolations be calculated by :func:`extrap_model` rather
    than by the evaluation's own file: a total capture to split or to extend,
    an angle-integrated line to collapse to one angle, or an energy × angle
    grid to leave out."""
    try:
        with open(azr_path) as f:
            tests = _active_tests(f.read())
    except OSError:
        return False
    if not tests:
        return False
    if any(_collapsible(t) or is_grid(t) for t in tests):
        return True
    _, photons = _pair_facts(azr_path)
    if any(_capture_extension(t, tests, 1.0, photons) for t in tests):
        return True
    return bool(split and len(captures) > 1 and any(
        int(float(t[9])) == 4 and int(float(t[2])) == -1 for t in tests))


def extrap_model(azr_path, workdir, captures):
    """The evaluation's own extrapolations as AZURE2 can calculate them
    quickly and right, the numbers at the shipped grid points unchanged:

    * an angle-integrated (or total-capture) line declared over a range of
      angles is calculated at its first angle only (:func:`_collapsible`) --
      the value does not depend on it;
    * with ``captures`` (two or more capture pairs: the evaluation splits its
      total capture), every active total-capture line becomes one
      angle-integrated line per capture pair, summed back by the caller;
    * a total capture shipped on a much shorter grid than the other lines of
      its entrance pair gets extra pieces up to theirs
      (:func:`_capture_extension`), joined back by the caller;
    * an energy × angle grid (:func:`is_grid`) is left out: it is calculated
      on request by :func:`grid_model`;
    * inactive lines, which AZURE2 does not calculate, are dropped.

    Returns ``(path, plan)``: ``plan[j]`` is, for the ``j``-th *active*
    extrapolation segment, a list of pieces -- each a list of derived
    segments summed together, the pieces then joined along the energy --
    or ``None`` for a grid left out.
    """
    with open(azr_path) as f:
        text = f.read()
    tests = _active_tests(text)
    if tests is None:
        return None, []
    factors, photons = _pair_facts(azr_path)
    lines, plan = [], []

    def add(t):
        """One line (or one per capture pair): its slots."""
        if int(float(t[9])) == 4 and int(float(t[2])) == -1 and len(captures) > 1:
            group = []
            for key in captures:
                u = list(t)
                u[2], u[9] = str(key), "0"
                group.append(len(lines))
                lines.append(" ".join(u))
            return group
        lines.append(" ".join(t))
        return [len(lines) - 1]

    for original in tests:
        t = list(original)
        if is_grid(t):
            plan.append(None)
            continue
        if _collapsible(t):
            t[7], t[8] = t[6], "0"
        pieces = [add(t)]
        for lo, hi, step in _capture_extension(original, tests, factors.get(t[1], 1.0),
                                               photons):
            u = list(t)
            u[3], u[4], u[5] = f"{lo:.9g}", f"{hi:.9g}", f"{step:.9g}"
            pieces.append(add(u))
        plan.append(pieces)
    if not lines:
        return None, plan
    text = _with_tests(text, lines)
    if text is None:
        return None, []
    return _write_model(text, workdir, "extrap.azr"), plan


def grid_angles(lo, hi) -> List[float]:
    """The representative angles of a grid over ``[lo, hi]`` degrees."""
    inside = [a for a in GRID_ANGLES if lo <= a <= hi]
    if len(inside) >= 3:
        return inside
    return sorted({lo, (lo + hi) / 2, hi})


def map_angles(lo, hi) -> List[float]:
    n = max(1, int(math.floor((hi - lo) / MAP_ANGLE_STEP + 1e-9)))
    return [lo + i * (hi - lo) / n for i in range(n + 1)]


def grid_model(azr_path, workdir):
    """The energy × angle grids of the extrapolations (:func:`is_grid`),
    each as one line per representative angle (:func:`grid_angles`, at the
    shipped energy step) and one per map angle (:func:`map_angles`, every
    ``MAP_ANGLE_STEP`` degrees, ``MAP_ENERGIES`` energies).

    Returns ``(path, plan)``: ``plan[j]`` for the ``j``-th active
    extrapolation segment is ``None`` (not a grid) or ``{"angles": [(angle,
    slot), ...], "map": [(angle, slot), ...]}``.
    """
    with open(azr_path) as f:
        text = f.read()
    tests = _active_tests(text)
    if tests is None:
        return None, []
    lines, plan = [], []
    for t in tests:
        if not is_grid(t):
            plan.append(None)
            continue
        e_lo, e_hi, e_step = float(t[3]), float(t[4]), float(t[5])
        a_lo, a_hi = float(t[6]), float(t[7])
        coarse = max(e_step, (e_hi - e_lo) / (MAP_ENERGIES - 1))
        entry = {"angles": [], "map": []}
        for view, angles, step in (("angles", grid_angles(a_lo, a_hi), e_step),
                                   ("map", map_angles(a_lo, a_hi), coarse)):
            for angle in angles:
                u = list(t)
                u[5] = f"{step:.9g}"
                u[6] = u[7] = f"{angle:.6g}"
                u[8] = "0"
                entry[view].append((angle, len(lines)))
                lines.append(" ".join(u))
        plan.append(entry)
    if not lines:
        return None, plan
    text = _with_tests(text, lines)
    if text is None:
        return None, []
    return _write_model(text, workdir, "grid.azr"), plan


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
    AZURE2 up to 7e533b7 could not reuse (:func:`summed`); this model's it can,
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


def join_pieces(pieces, axis, mu, sfactor, energies, angles):
    """One calculation's curve from its pieces (:func:`derived_model`): each
    piece summed over its slots, the pieces joined and sorted along ``axis``,
    a point two pieces share kept once.  Returns ``(energies, mu, sfactor,
    angles)`` as float arrays."""
    import numpy as np
    parts = ([], [], [], [])
    for slots in pieces:
        if max(slots) >= len(mu):
            continue
        e = np.asarray(energies[slots[0]], dtype=float)
        a = np.asarray(angles[slots[0]], dtype=float)
        m = sum_slots(mu, slots)
        f = sum_slots(sfactor, slots)
        n = min(len(e), len(a), len(m), len(f))
        for out, values in zip(parts, (e, m, f, a)):
            out.append(values[:n])
    if not parts[0]:
        empty = np.zeros(0)
        return empty, empty, empty, empty
    e, m, f, a = (np.concatenate(p) for p in parts)
    x = a if axis == "angle" else e
    order = np.argsort(x, kind="stable")
    x = x[order]
    keep = np.ones(len(x), dtype=bool)
    if len(x) > 1:
        keep[1:] = np.diff(x) > 1e-9 * np.maximum(np.abs(x[1:]), 1e-12)
    order = order[keep]
    return e[order], m[order], f[order], a[order]


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
    deploy; otherwise a directory of the same name in a private temporary
    one (the name is what ``app.integrals`` matches a frozen seed by).
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
        fallback = os.path.join(tempfile.mkdtemp(prefix="azure2-"), name)
        os.makedirs(fallback)
        return fallback


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
