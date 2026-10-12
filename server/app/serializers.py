"""Turning pyazr's model objects into the JSON the frontend consumes.

Kept apart from the routes so the wire format is defined in one place, and
apart from pyazr so the package stays free of presentation concerns.

The central convention, which the interactive plot depends on: a parameter the
user can edit is identified by its **free index** -- its slot in the parameter
vector ``azure2.params`` -- and never by its position in ``azure2.parameters``,
which includes fixed parameters and is a different, longer list.  Anything the
user cannot edit carries ``free_index: null``.
"""

import math
import os
from typing import Dict, List, Optional

from app.evaluations import exfor_code
from app.labels import pair_plain, reaction_plain


def _floats(values) -> Optional[List[float]]:
    """A numpy array (or None) as a plain JSON list.

    A NaN or an infinity (AZURE2 returns them, e.g. for a few points of the 7Be
    extrapolations) becomes null: Python would write them as bare NaN/Infinity,
    which is not JSON, and the browser's parse of the whole response fails.
    """
    if values is None:
        return None
    return [f if math.isfinite(f) else None for f in map(float, values)]


def _label_for(key: int, labels) -> str:
    """LaTeX label for a pair *key* (as the .azr file numbers pairs), falling
    back to a plain tag."""
    for label in labels:
        if label.number == key:
            return label.label
    return f"\\text{{pair}}{key}"


def _engine_keys(session) -> Dict[int, int]:
    """Engine pair number -> .azr pair key.

    AZURE2 renumbers pairs when it builds a model (entrance pair first), so the
    number a channel parameter or a ``Pair`` carries is not the key the file
    and its labels use.  Every engine-side pair number goes through this map;
    the data segments already speak in keys.
    """
    return {pair.number: getattr(pair, "key", pair.number)
            for pair in session.pairs}


def _exit_label(exit_key: int, labels) -> str:
    """Exit channels use -1 for the summed 'total capture' case."""
    if exit_key == -1:
        return "\\text{total}"
    return _label_for(exit_key, labels)


# -- level scheme -------------------------------------------------------------

def channel_quantity(level, channel, pair):
    """What a channel's stored value physically *is*, and its unit.

    A channel parameter is not always a partial width.  AZURE2 reinterprets it
    from the model's own geometry -- see ``gui/src/LevelsTab.cpp`` (the
    ``setNormParam`` branches), which this mirrors:

    * a **particle** channel whose level lies below that pair's threshold is
      bound, so the value is an ANC in ``fm^(-1/2)`` -- not a width in eV;
    * the **photon** pair's own bound state holds a static moment: a magnetic
      dipole moment (nm) for M1, an electric quadrupole moment (b) for E2;
    * a **beta** pair holds a dimensionless B;
    * everything else is a partial width in eV.

    Reporting all of these as "eV" is wrong by orders of magnitude and by
    dimension, so the unit travels with the value.
    """
    if pair is None:
        return "width", "eV"

    if pair.ptype == 0:
        # Bound: no open channel, so the asymptotic normalization replaces the
        # width.  The threshold includes the residual's excitation energy.
        if level.energy < pair.sep_energy + pair.excitation:
            return "anc", "fm^(-1/2)"
        return "width", "eV"

    # The photon pair's own bound state: a static moment rather than a decay.
    # Particle 2 of a photon pair is the residual nucleus.
    if (pair.ptype == 10
            and abs(level.energy - pair.excitation) < 1e-6
            and abs(level.J - pair.J2) < 1e-6
            and level.parity == pair.parity2):
        if channel.radiation_type == "M" and channel.L == 1:
            return "moment_m1", "μ_N"
        if channel.radiation_type == "E" and channel.L == 2:
            return "moment_e2", "b"

    if pair.ptype == 20:
        return "beta", ""

    return "width", "eV"


def scheme_to_dict(session, labels) -> Dict:
    """The level scheme, with each editable quantity's parameter slot.

    Widths and energies report their *current* value: for a free parameter that
    is the working vector's entry (which the user may have changed), and for a
    fixed one the model's own constant.
    """
    params = session.params

    def current(free_index, fallback):
        if free_index is None:
            return float(fallback)
        return float(params[free_index])

    pairs_by_number = {pair.number: pair for pair in session.pairs}
    keys = _engine_keys(session)

    levels = []
    for level in session.scheme.levels:
        channels = []
        for channel in level.channels:
            quantity, unit = channel_quantity(
                level, channel, pairs_by_number.get(channel.pair))
            channels.append({
                "pair": keys.get(channel.pair, channel.pair),
                "label": _label_for(keys.get(channel.pair, channel.pair),
                                    labels),
                "L": channel.L,
                "S": channel.S,
                "radiation_type": channel.radiation_type,
                "is_photon": channel.is_photon,
                "quantity": quantity,
                "unit": unit,
                "width": current(channel.free_index, channel.width),
                "initial_width": float(channel.width),
                "fixed": channel.fixed,
                "free_index": channel.free_index,
                # AZURE2 only defines a Wigner limit for unbound particle
                # channels; it is meaningless against an ANC.
                "wigner_limit": (channel.wigner_limit
                                 if quantity == "width" else None),
            })

        levels.append({
            "jgroup": level.jgroup,
            "level": level.level,
            "J": level.J,
            "parity": level.parity,
            "jpi": level.jpi,
            "energy": current(level.energy_free_index, level.energy),
            "initial_energy": float(level.energy),
            "energy_fixed": level.energy_fixed,
            "energy_free_index": level.energy_free_index,
            "channels": channels,
        })

    ranges = data_ranges(session)
    by_key = {label.number: label for label in labels}
    pairs = []
    for pair in sorted(session.pairs, key=lambda p: keys[p.number]):
        key = keys[pair.number]
        threshold = (None if pair.is_photon
                     else float(pair.sep_energy) + float(pair.excitation))
        fitted = ranges.get(key)
        label = by_key.get(key)
        pairs.append({
            # The .azr file's key: what the file, the AZURE2 GUI and the data
            # segments call this pair.  The engine's own number is kept apart.
            "number": key,
            "engine_number": pair.number,
            "label": _label_for(key, labels),
            # Both constituents in Unicode, e.g. "p + ¹²C" (a threshold label).
            "label_plain": pair_plain(label) if label is not None else None,
            "is_photon": pair.is_photon,
            "is_entrance": pair.is_entrance,
            "Z1": pair.Z1, "M1": pair.M1,
            "Z2": pair.Z2, "M2": pair.M2,
            "separation_energy": pair.sep_energy,
            "excitation": pair.excitation,
            # Excitation energy of the compound nucleus at which this pair
            # opens: S + E_x(residual).  None for a photon pair.
            "threshold": threshold,
            # The compound-nucleus excitation range covered by the active
            # data entering through this pair (E_x = E_cm + threshold), or
            # None when no data enter through it.
            "data_ex_min": (fitted[0] + threshold) if fitted and threshold is not None else None,
            "data_ex_max": (fitted[1] + threshold) if fitted and threshold is not None else None,
            "data_ecm_min": fitted[0] if fitted else None,
            "data_ecm_max": fitted[1] if fitted else None,
            "channel_radius": pair.channel_radius,
        })

    return {
        "pairs": pairs,
        "levels": levels,
        "n_free": len(session.params),
        "modified": session.is_modified,
    }


def data_ranges(session) -> Dict[int, tuple]:
    """Per entrance-pair key, the (min, max) c.m. energy of the active data.

    The measured energies are the engine's (centre of mass), read when the
    model opened, so this costs no calculation.
    """
    out = {}
    datasets = getattr(session, "datasets", None) or []
    measured = getattr(getattr(session, "measured", None), "energies", None)
    energies = _aligned(datasets, measured)
    for segment, values in zip(datasets, energies):
        if not segment.active or values is None:
            continue
        finite = [v for v in _floats(values) or [] if v is not None]
        if not finite:
            continue
        lo, hi = min(finite), max(finite)
        if segment.entrance_key in out:
            a, b = out[segment.entrance_key]
            lo, hi = min(lo, a), max(hi, b)
        out[segment.entrance_key] = (lo, hi)
    return out


def _aligned(segments, arrays) -> list:
    """``arrays`` indexed like ``segments``.

    AZURE2 reports only the *active* segments; when some are inactive the
    arrays are fewer than the segments and belong, in order, to the active
    ones.  Inactive segments then get ``None``.
    """
    arrays = list(arrays) if arrays is not None else []
    if len(arrays) >= len(segments):
        return arrays[:len(segments)]
    out, k = [], 0
    for segment in segments:
        if getattr(segment, "active", True) and k < len(arrays):
            out.append(arrays[k])
            k += 1
        else:
            out.append(None)
    return out


def scheme_to_text(session) -> str:
    """pyazr's own grouped rendering of the scheme, for the text export.

    The scheme names itself after the ``.azr`` path it was built from, which is
    a server-side absolute path; the export is a user-facing document, so it is
    titled with the evaluation instead.
    """
    scheme = session.scheme
    original, scheme.name = scheme.name, session.evaluation.id
    try:
        return scheme.format()
    finally:
        scheme.name = original


# -- data segments ------------------------------------------------------------

def chi2_sum(observed, errors, calculated, norm):
    """``(chi2, points)`` of one segment, or ``(None, 0)`` without errors.

    Follows AZURE2's convention that the normalization scales the data and its
    uncertainty together, so ``norm`` cancels out of a purely statistical
    comparison but still shifts the data relative to the model.  This is the
    data term only; :func:`norm_penalty` is AZURE2's prior on the
    normalization, reported separately so neither hides the other.
    """
    if observed is None or errors is None or calculated is None:
        return None, 0
    total, count = 0.0, 0
    for value, error, model in zip(observed, errors, calculated):
        if not error or value is None or model is None:
            continue
        total += (value * norm - model) ** 2 / (error * norm) ** 2
        count += 1
    if count == 0:
        return None, 0
    return total, count


def chi2_per_point(observed, errors, calculated, norm) -> Optional[float]:
    """Reduced chi-squared of one segment, or ``None`` if it has no errors."""
    total, count = chi2_sum(observed, errors, calculated, norm)
    return None if total is None else total / count


def norm_penalty(segment, norm) -> Optional[float]:
    """AZURE2's normalization prior, ``((n - n0) / (n0 * err/100))^2``.

    Only defined for a varied normalization with a stated systematic error
    (percent, as stored in the file); ``None`` otherwise.
    """
    nominal = segment.norm or 1.0
    error = segment.norm_error or 0.0
    if not segment.vary_norm or error <= 0:
        return None
    return ((norm - nominal) / (nominal * error / 100.0)) ** 2


def data_to_dict(session, labels, mu, mu_sfactor) -> List[Dict]:
    """Every data segment: the measurement, and the model evaluated on it.

    Segment ``i`` of ``azure2.datasets`` corresponds to index ``i`` of the
    calculated arrays, which is the ordering AZURE2 itself uses.
    """
    measured = session.measured
    evaluation = session.evaluation
    by_key = {label.number: label for label in labels}
    segments = []
    datasets = session.datasets
    m_energies = _aligned(datasets, measured.energies)
    m_angles = _aligned(datasets, measured.angles)
    m_cross = _aligned(datasets, measured.cross)
    m_cross_err = _aligned(datasets, measured.cross_err)
    m_sfactor = _aligned(datasets, measured.sfactor)
    m_sfactor_err = _aligned(datasets, measured.sfactor_err)
    mu = _aligned(datasets, mu)
    mu_sfactor = _aligned(datasets, mu_sfactor)

    for i, segment in enumerate(datasets):
        norm = segment.norm or 1.0
        observed = _floats(m_cross[i])
        errors = _floats(m_cross_err[i])
        calculated = _floats(mu[i])
        chi2, counted = chi2_sum(observed, errors, calculated, norm)
        entrance = by_key.get(segment.entrance_key)
        exit_ = by_key.get(segment.exit_key)
        stem = os.path.splitext(os.path.basename(segment.data_file or ""))[0]

        segments.append({
            "index": i,
            "key": segment.key,
            "name": segment.name,
            # A readable name for the data file ("Kettner", "Elwyn (EXFOR
            # F0012.002)"); ``name`` stays the raw identifier.
            "label": evaluation.dataset_label(segment.data_file),
            "exfor": exfor_code(stem),
            # Where the measurement was published, when info.json says.
            "source": evaluation.dataset_source(segment.data_file),
            "active": segment.active,
            "entrance": _label_for(segment.entrance_key, labels),
            "exit": _exit_label(segment.exit_key, labels),
            "entrance_key": segment.entrance_key,
            "exit_key": segment.exit_key,
            # Same species in and out: elastic scattering, for which an
            # astrophysical S-factor is meaningless.
            "elastic": bool(entrance and exit_ and not exit_.is_photon
                            and segment.entrance_key == segment.exit_key),
            "capture": bool(segment.exit_key == -1
                            or (exit_ is not None and exit_.is_photon)),
            "reaction": (reaction_plain(entrance, exit_,
                                        total=segment.exit_key == -1)
                         if entrance is not None and not entrance.is_photon
                         else None),
            "observable": segment.observable,
            "data_file": segment.data_file,
            "energy_min": segment.energy_min,
            "energy_max": segment.energy_max,
            "angle_min": segment.angle_min,
            "angle_max": segment.angle_max,
            "norm": norm,
            "vary_norm": segment.vary_norm,
            "norm_error": segment.norm_error,
            "norm_penalty": norm_penalty(segment, norm),
            "n_points": len(observed) if observed else 0,
            "chi2": None if chi2 is None else chi2 / counted,
            "chi2_sum": chi2,
            "chi2_points": counted,
            "energies": _floats(m_energies[i]),
            "angles": _floats(m_angles[i]),
            "cross_sections": observed,
            "cross_sections_errors": errors,
            "sfactor": _floats(m_sfactor[i]),
            "sfactor_errors": _floats(m_sfactor_err[i]),
            "calculated": calculated,
            "calculated_sfactor": _floats(mu_sfactor[i]),
        })

    return segments


# -- the model on a fine grid ---------------------------------------------------

def fine_to_dict(session, fine_result, mu, mu_sfactor) -> Dict:
    """The model on its extended grid, for drawing: ``{"curves": [...],
    "segments": [{"index": i, "curve": id}, ...]}``.

    One curve per distinct calculation (``app.fine.plan``), shared by every
    data segment that measures it, running from below the lowest measurement
    to above the highest with the resonances resolved.  ``axis`` says what it
    runs along: ``"energy"``, or ``"angle"`` (c.m. degrees) for an angular
    distribution at one energy, whose curve is then in
    ``angles``/``calculated``.

    A segment is listed only if the curve reproduces the data-mode model at
    its measured points (see :func:`app.fine.agrees`; a segment AZURE2 folds
    with the target or the detector does not) -- beyond the data there is
    nothing to compare, and the extension is kept with the part that agrees.
    The values at the measured points of every listed segment are merged in,
    so the curve passes through exactly what the χ² is computed from.  A
    segment left out is drawn through its data points, as before.  A segment
    whose energy shift matters carries it (``shift``, c.m. MeV): its curve is
    the shared one at ``E - shift``.
    """
    from app import fine

    if len(fine_result) < 6:
        return {"curves": [], "segments": []}      # an older cache entry
    index, energies, fine_mu, fine_sfactor, fine_angles, axes = fine_result[:6]
    datasets = session.datasets
    m_energies = _aligned(datasets, session.measured.energies)
    m_angles = _aligned(datasets, session.measured.angles)
    mu = _aligned(datasets, mu)
    mu_sfactor = _aligned(datasets, mu_sfactor)

    pairs = {getattr(p, "key", p.number): p for p in session.pairs}
    grids = {}
    listed = []
    for i, segment in enumerate(datasets):
        j = index[i] if i < len(index) else None
        if j is None or j >= len(fine_mu) or mu[i] is None:
            continue
        axis = axes[j]
        if j not in grids:
            grid_x = _floats(fine_angles[j] if axis == "angle" else energies[j]) or []
            grid_y = _floats(fine_mu[j]) or []
            grid_s = _floats(fine_sfactor[j]) or [None] * len(grid_x)
            # Sorted along the grid (the engine sorts; do not rely on it).
            order = sorted(range(len(grid_x)),
                           key=lambda k: grid_x[k] if grid_x[k] is not None else 0)
            grids[j] = {"axis": axis,
                        "x": [grid_x[k] for k in order],
                        "y": [grid_y[k] for k in order],
                        "s": [grid_s[k] for k in order],
                        "at_x": [], "at_y": [], "at_s": [], "energy": None}
        g = grids[j]
        at_x = _floats(m_angles[i] if axis == "angle" else m_energies[i]) or []
        at_y = _floats(mu[i]) or []
        if not fine.agrees(g["x"], g["y"], at_x, at_y):
            # A segment with an energy shift (a free calibration, in the lab)
            # is calculated at E + shift: next to a narrow resonance its
            # curve is the shared one moved by the shift, drawn on its own.
            shift = float(getattr(segment, "energy_shift", 0.0) or 0.0)
            shift *= _lab_to_cm(pairs.get(segment.entrance_key))
            if (axis != "energy" or shift == 0.0
                    or not fine.agrees([x - shift for x in g["x"]], g["y"], at_x, at_y)):
                continue
            listed.append({"index": i, "curve": j, "shift": shift})
            continue
        g["at_x"] += at_x
        g["at_y"] += at_y
        g["at_s"] += _floats(mu_sfactor[i]) or [None] * len(at_x)
        if axis == "angle" and g["energy"] is None:
            g["energy"] = (_floats(m_energies[i]) or [None])[0]
        listed.append({"index": i, "curve": j})

    curves = []
    used = {entry["curve"] for entry in listed}
    for j, g in sorted(grids.items()):
        if j not in used:
            continue
        xs, ys = fine.merge(g["x"], g["y"], g["at_x"], g["at_y"])
        entry = {"id": j, "axis": g["axis"]}
        if g["axis"] == "angle":
            entry.update({"angles": xs, "calculated": ys, "energy": g["energy"],
                          "energies": [], "sfactor_energies": [],
                          "calculated_sfactor": []})
        else:
            sx, sy = fine.merge(g["x"], g["s"], g["at_x"], g["at_s"])
            entry.update({"energies": xs, "calculated": ys,
                          "sfactor_energies": sx, "calculated_sfactor": sy})
        curves.append(entry)
    return {"curves": curves, "segments": listed}


# -- extrapolations -----------------------------------------------------------

def extrapolations_to_dict(session, labels, energies, angles, mu,
                           mu_sfactor) -> List[Dict]:
    """Every extrapolation segment and the curve calculated on its grid.

    AZURE2 reports extrapolation segments in ``<segmentsTest>`` order, so the
    parsed metadata and the calculated arrays line up by index.
    """
    segments = []
    tests = session.extrapolations
    energies = _aligned(tests, energies)
    angles = _aligned(tests, angles)
    mu = _aligned(tests, mu)
    mu_sfactor = _aligned(tests, mu_sfactor)
    pairs = {getattr(p, "key", p.number): p for p in session.pairs}
    by_key = {label.number: label for label in labels}

    for i, segment in enumerate(tests):
        entrance = by_key.get(segment.entrance_key)
        exit_ = by_key.get(segment.exit_key)
        # The file gives the grid in the laboratory frame of the entrance
        # pair; every energy the page shows is centre-of-mass, so the limits
        # are converted (AZURE2's own calculated energies already are).
        lab_to_cm = _lab_to_cm(pairs.get(segment.entrance_key))
        segments.append({
            "index": i,
            "key": segment.key,
            "name": segment.name,
            "active": segment.active,
            "entrance": _label_for(segment.entrance_key, labels),
            "exit": _exit_label(segment.exit_key, labels),
            "entrance_key": segment.entrance_key,
            "exit_key": segment.exit_key,
            # A(a,b)B, as the data segments carry it: what the page names
            # the curve by.
            "reaction": (reaction_plain(entrance, exit_,
                                        total=segment.exit_key == -1)
                         if entrance is not None and not entrance.is_photon
                         else None),
            "observable": segment.observable,
            "energy_frame": "cm",
            "energy_min": segment.energy_min * lab_to_cm,
            "energy_max": segment.energy_max * lab_to_cm,
            "energy_step": segment.energy_step * lab_to_cm,
            "energy_min_lab": segment.energy_min,
            "energy_max_lab": segment.energy_max,
            "angle_min": segment.angle_min,
            "angle_max": segment.angle_max,
            "angle_step": segment.angle_step,
            "is_angle_integrated": segment.is_angle_integrated,
            "energies": _floats(energies[i]),
            "angles": _floats(angles[i]),
            "calculated": _floats(mu[i]),
            "calculated_sfactor": _floats(mu_sfactor[i]),
        })

    return segments


def _lab_to_cm(pair) -> float:
    """E_cm / E_lab for a projectile on a target at rest (M2 the target)."""
    try:
        m1, m2 = float(pair.M1), float(pair.M2)
        if m1 > 0 and m2 > 0 and not getattr(pair, "is_photon", False):
            return m2 / (m1 + m2)
    except (AttributeError, TypeError, ValueError):
        pass
    return 1.0


def extrapolations_to_csv(segments, selected=None) -> str:
    """Extrapolation curves as CSV: one block per segment.

    Segments have different grids, so they are emitted as consecutive blocks
    with their own headers rather than forced into shared columns.
    """
    lines = []
    for segment in segments:
        if selected is not None and segment["index"] not in selected:
            continue
        energies = segment["energies"] or []
        cross = segment["calculated"] or []
        sfactor = segment["calculated_sfactor"] or []

        lines.append(f"# segment {segment['key']}: "
                     f"{segment['entrance']} -> {segment['exit']}, "
                     f"{segment['observable']}")
        if not segment["is_angle_integrated"]:
            lines.append(f"# angle: {segment['angle_min']}-"
                         f"{segment['angle_max']} deg")
        lines.append("energy_cm_MeV,cross_section_b,s_factor_MeV_b")
        for j, energy in enumerate(energies):
            c = cross[j] if j < len(cross) else None
            s = sfactor[j] if j < len(sfactor) else None
            lines.append(",".join("" if v is None else repr(v)
                                  for v in (energy, c, s)))
        lines.append("")

    return "\n".join(lines)
