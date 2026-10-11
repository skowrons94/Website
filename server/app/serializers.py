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
from typing import Dict, List, Optional


def _floats(values) -> Optional[List[float]]:
    """A numpy array (or None) as a plain JSON list.

    A NaN or an infinity (AZURE2 returns them, e.g. for a few points of the 7Be
    extrapolations) becomes null: Python would write them as bare NaN/Infinity,
    which is not JSON, and the browser's parse of the whole response fails.
    """
    if values is None:
        return None
    return [f if math.isfinite(f) else None for f in map(float, values)]


def _label_for(pair: int, labels) -> str:
    """LaTeX label for a pair number, falling back to a plain tag."""
    for label in labels:
        if label.number == pair:
            return label.label
    return f"\\text{{pair}}{pair}"


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
            return "moment_m1", "nm"
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

    levels = []
    for level in session.scheme.levels:
        channels = []
        for channel in level.channels:
            quantity, unit = channel_quantity(
                level, channel, pairs_by_number.get(channel.pair))
            channels.append({
                "pair": channel.pair,
                "label": _label_for(channel.pair, labels),
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

    pairs = [{
        "number": pair.number,
        "label": _label_for(pair.number, labels),
        "is_photon": pair.is_photon,
        "is_entrance": pair.is_entrance,
        "Z1": pair.Z1, "M1": pair.M1,
        "Z2": pair.Z2, "M2": pair.M2,
        "separation_energy": pair.sep_energy,
        "excitation": pair.excitation,
        "channel_radius": pair.channel_radius,
    } for pair in session.pairs]

    return {
        "pairs": pairs,
        "levels": levels,
        "n_free": len(session.params),
        "modified": session.is_modified,
    }


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

def chi2_per_point(observed, errors, calculated, norm) -> Optional[float]:
    """Reduced chi-squared of one segment, or ``None`` if it has no errors.

    Follows AZURE2's convention that the normalization scales the data and its
    uncertainty together, so ``norm`` cancels out of a purely statistical
    comparison but still shifts the data relative to the model.
    """
    if observed is None or errors is None or calculated is None:
        return None
    total, count = 0.0, 0
    for value, error, model in zip(observed, errors, calculated):
        if not error or value is None or model is None:
            continue
        total += (value * norm - model) ** 2 / (error * norm) ** 2
        count += 1
    if count == 0:
        return None
    return total / count


def data_to_dict(session, labels, mu, mu_sfactor) -> List[Dict]:
    """Every data segment: the measurement, and the model evaluated on it.

    Segment ``i`` of ``azure2.datasets`` corresponds to index ``i`` of the
    calculated arrays, which is the ordering AZURE2 itself uses.
    """
    measured = session.measured
    segments = []

    for i, segment in enumerate(session.datasets):
        norm = segment.norm or 1.0
        observed = _floats(measured.cross[i])
        errors = _floats(measured.cross_err[i])
        calculated = _floats(mu[i])

        segments.append({
            "index": i,
            "key": segment.key,
            "name": segment.name,
            "active": segment.active,
            "entrance": _label_for(segment.entrance_key, labels),
            "exit": _exit_label(segment.exit_key, labels),
            "entrance_key": segment.entrance_key,
            "exit_key": segment.exit_key,
            "observable": segment.observable,
            "data_file": segment.data_file,
            "energy_min": segment.energy_min,
            "energy_max": segment.energy_max,
            "angle_min": segment.angle_min,
            "angle_max": segment.angle_max,
            "norm": norm,
            "vary_norm": segment.vary_norm,
            "norm_error": segment.norm_error,
            "n_points": len(observed) if observed else 0,
            "chi2": chi2_per_point(observed, errors, calculated, norm),
            "energies": _floats(measured.energies[i]),
            "angles": _floats(measured.angles[i]),
            "cross_sections": observed,
            "cross_sections_errors": errors,
            "sfactor": _floats(measured.sfactor[i]),
            "sfactor_errors": _floats(measured.sfactor_err[i]),
            "calculated": calculated,
            "calculated_sfactor": _floats(mu_sfactor[i]),
        })

    return segments


# -- extrapolations -----------------------------------------------------------

def extrapolations_to_dict(session, labels, energies, angles, mu,
                           mu_sfactor) -> List[Dict]:
    """Every extrapolation segment and the curve calculated on its grid.

    AZURE2 reports extrapolation segments in ``<segmentsTest>`` order, so the
    parsed metadata and the calculated arrays line up by index.
    """
    segments = []

    for i, segment in enumerate(session.extrapolations):
        segments.append({
            "index": i,
            "key": segment.key,
            "name": segment.name,
            "active": segment.active,
            "entrance": _label_for(segment.entrance_key, labels),
            "exit": _exit_label(segment.exit_key, labels),
            "entrance_key": segment.entrance_key,
            "exit_key": segment.exit_key,
            "observable": segment.observable,
            "energy_min": segment.energy_min,
            "energy_max": segment.energy_max,
            "energy_step": segment.energy_step,
            "angle_min": segment.angle_min,
            "angle_max": segment.angle_max,
            "angle_step": segment.angle_step,
            "is_angle_integrated": segment.is_angle_integrated,
            "energies": _floats(energies[i]) if i < len(energies) else None,
            "angles": _floats(angles[i]) if i < len(angles) else None,
            "calculated": _floats(mu[i]) if i < len(mu) else None,
            "calculated_sfactor": (_floats(mu_sfactor[i])
                                   if i < len(mu_sfactor) else None),
        })

    return segments


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
        lines.append("energy_MeV,cross_section,s_factor")
        for j, energy in enumerate(energies):
            c = cross[j] if j < len(cross) else None
            s = sfactor[j] if j < len(sfactor) else None
            lines.append(",".join("" if v is None else repr(v)
                                  for v in (energy, c, s)))
        lines.append("")

    return "\n".join(lines)
