"""Human-readable (LaTeX) labels derived from an AZURE2 model's particle pairs.

An ``.azr`` file identifies a channel only by a pair number, but a reader wants
to see ``p`` or ``\\gamma_{1}``.  Everything needed to name a pair is already in
the model -- charges, masses, and the residual's excitation energy -- so these
labels are *derived* rather than configured.  An evaluation may still override
them (see :mod:`app.evaluations`); this module is what makes that optional.

Two entry points, one per source of pair data:

* :func:`labels_from_file` reads the ``<levels>`` block directly, so a listing
  page can label every evaluation without launching AZURE2.
* :func:`labels_from_pairs` uses a running instance's ``azure2.pairs``.

Both funnel into the same naming rule, so the two paths cannot drift apart.
"""

from dataclasses import dataclass
from typing import List, Optional

# Z -> element symbol.  Covers every element an R-matrix evaluation might use.
_ELEMENTS = (
    "n H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co "
    "Ni Cu Zn Ga Ge As Se Br Kr Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te "
    "I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir "
    "Pt Au Hg Tl Pb Bi Po At Rn Fr Ra Ac Th Pa U Np Pu Am Cm Bk Cf Es Fm Md No "
    "Lr Rf Db Sg Bh Hs Mt Ds Rg Cn Nh Fl Mc Lv Ts Og"
).split()

# Light ions get their conventional symbol rather than ^{A}\text{Sym}.
_LIGHT_IONS = {
    (0, 1): "n",
    (1, 1): "p",
    (1, 2): "d",
    (1, 3): "t",
    (2, 3): "^{3}\\text{He}",
    (2, 4): "\\alpha",
}


def element(Z: int) -> str:
    """Element symbol for a proton number (``'C'`` for 6)."""
    return _ELEMENTS[Z] if 0 <= Z < len(_ELEMENTS) else f"Z{Z}"


def nuclide(Z: int, A: int) -> str:
    """LaTeX for a nuclide, e.g. ``'^{13}\\text{N}'``."""
    return f"^{{{A}}}\\text{{{element(Z)}}}"


def _mass_number(M: float) -> int:
    """Mass number from a mass in amu (1.00728 -> 1)."""
    return int(round(M))


def _particle_symbol(Z: int, M: float) -> str:
    """Conventional symbol for one constituent of a pair."""
    A = _mass_number(M)
    light = _LIGHT_IONS.get((Z, A))
    return light if light is not None else nuclide(Z, A)


@dataclass
class ChannelLabel:
    """A pair's derived identity: what it is, and how to render it."""

    # The pair's key as written in the .azr file (column ``ir`` of <levels>,
    # and what <segmentsData> calls the entrance/exit pair).  This is *not*
    # the running engine's pair number: AZURE2 renumbers its pairs with the
    # entrance pair first, so a model whose data enter through pair 2 (24Mg)
    # has engine pair 1 == file key 2.  Map engine pairs back through
    # ``Pair.key`` (see :func:`label_for_engine_pair`).
    number: int
    label: str               # LaTeX, e.g. 'p' or '\\gamma_{1}'
    is_photon: bool
    excitation: float        # residual excitation energy (MeV)
    Z1: int
    A1: int
    Z2: int
    A2: int

    @property
    def reaction(self) -> str:
        """Both constituents, e.g. ``'p + ^{12}\\text{C}'``."""
        if self.is_photon:
            return f"\\gamma + {nuclide(self.Z2, self.A2)}"
        return f"{_particle_symbol(self.Z1, self.A1)} + {nuclide(self.Z2, self.A2)}"


def _build(records) -> List[ChannelLabel]:
    """Name every pair, subscripting only where a species is ambiguous.

    ``records`` is a list of ``(number, is_photon, excitation, Z1, M1, Z2, M2)``.

    A model with one capture channel wants a plain ``\\gamma``; one with seven
    wants ``\\gamma_{0}``..``\\gamma_{6}`` ordered by the residual's excitation
    energy.  So a subscript is added only when a base symbol is shared by more
    than one pair, and the rank is by excitation -- which reproduces the
    hand-written conventions in the existing evaluations.
    """
    base = {}
    for number, is_photon, exc, Z1, M1, Z2, M2 in records:
        sym = "\\gamma" if is_photon else _particle_symbol(Z1, M1)
        base.setdefault(sym, []).append((number, exc, Z1, M1, Z2, M2))

    out = []
    for sym, group in base.items():
        ranked = sorted(group, key=lambda g: (g[1], g[0]))
        ambiguous = len(ranked) > 1
        for rank, (number, exc, Z1, M1, Z2, M2) in enumerate(ranked):
            label = f"{sym}_{{{rank}}}" if ambiguous else sym
            out.append(ChannelLabel(
                number=number, label=label,
                is_photon=sym == "\\gamma", excitation=exc,
                Z1=Z1, A1=_mass_number(M1), Z2=Z2, A2=_mass_number(M2)))
    return sorted(out, key=lambda c: c.number)


def labels_from_pairs(pairs) -> List[ChannelLabel]:
    """Derive labels from a running instance's ``azure2.pairs``."""
    return _build([(p.number, p.is_photon, p.excitation, p.Z1, p.M1, p.Z2, p.M2)
                   for p in pairs])


def labels_from_file(azr_path: str) -> List[ChannelLabel]:
    """Derive labels from an ``.azr`` file's ``<levels>`` block, without
    launching AZURE2.

    Only pairs referenced by at least one level appear -- which is exactly the
    set AZURE2 itself builds, so this agrees with :func:`labels_from_pairs`.
    """
    from pyazr import AzrModel

    model = AzrModel.from_file(azr_path)
    seen = {}
    for level in model.levels:
        for ch in level.channels:
            if ch.pair not in seen:
                seen[ch.pair] = (ch.pair, ch.is_photon, ch.excitation,
                                 ch.Z1, ch.M1, ch.Z2, ch.M2)
    return _build(list(seen.values()))


def compound_nucleus(records, entrance_key: Optional[int] = None) -> Optional[str]:
    """LaTeX for the compound nucleus, from the entrance pair.

    ``records`` is any iterable of :class:`ChannelLabel`.  The entrance channel's
    two constituents fuse into the compound system that names the evaluation
    (``p + ^{12}\\text{C}`` -> ``^{13}\\text{N}``).  Every pair of a model sums
    to the same compound system (a photon pair's "constituents" already do), so
    any pair would give the same answer; the entrance pair is preferred only
    because it is the one a reader expects.  It is *not* assumed to be key 1:
    pass the key the data enter through (:func:`entrance_key`).
    """
    records = list(records)
    entrance = next((c for c in records if c.number == entrance_key), None)
    if entrance is None:
        entrance = records[0] if records else None
    if entrance is None:
        return None
    return nuclide(entrance.Z1 + entrance.Z2, entrance.A1 + entrance.A2)


def entrance_key(segments, labels) -> Optional[int]:
    """The pair key the measured data enter through.

    An ``.azr`` file does not flag an entrance pair; the data segments say it.
    The most common entrance key among the active segments wins (7Be enters
    through both ``^{3}He + alpha`` and ``^{6}Li + p``), ties going to the lower
    key.  A model with no data segments falls back to its first particle pair.
    """
    counts = {}
    for segment in segments:
        if getattr(segment, "active", True):
            counts[segment.entrance_key] = counts.get(segment.entrance_key, 0) + 1
    if counts:
        return min(counts, key=lambda k: (-counts[k], k))
    particle = [c.number for c in labels if not c.is_photon]
    return min(particle) if particle else None


def label_for_engine_pair(pair, labels) -> Optional["ChannelLabel"]:
    """The label of a running engine's :class:`pyazr.Pair`, matched by key."""
    key = getattr(pair, "key", None)
    for label in labels:
        if label.number == key:
            return label
    return None


# -- reaction notation --------------------------------------------------------

_SUPERSCRIPT = str.maketrans("0123456789", "⁰¹²³⁴⁵⁶⁷⁸⁹")

# Light particles as they appear inside the parentheses of A(a,b)B.
_LIGHT_PLAIN = {
    (0, 1): "n", (1, 1): "p", (1, 2): "d", (1, 3): "t",
    (2, 3): "³He", (2, 4): "α",
}


def nuclide_plain(Z: int, A: int) -> str:
    """Unicode nuclide, e.g. ``'¹³N'`` -- what the site's <Sci> renders."""
    return f"{str(A).translate(_SUPERSCRIPT)}{element(Z)}"


def _light_plain(Z: int, A: int) -> str:
    return _LIGHT_PLAIN.get((Z, A)) or nuclide_plain(Z, A)


def _split(label: "ChannelLabel"):
    """``(light, heavy)`` constituents of a particle pair, as ``(Z, A)``.

    The lighter one is the projectile (or ejectile), except that an alpha
    particle stays the projectile against anything lighter -- the usual
    ``³He(α,γ)⁷Be`` and ``⁶Li(p,α)³He`` rather than ``⁴He(³He,γ)⁷Be``.
    """
    one, two = (label.Z1, label.A1), (label.Z2, label.A2)
    if two == (2, 4) and one[1] < 4:
        return two, one
    if one == (2, 4) and two[1] < 4:
        return one, two
    return (one, two) if (one[1], one[0]) <= (two[1], two[0]) else (two, one)


def pair_plain(label: "ChannelLabel") -> str:
    """Unicode pair, light constituent first: ``'p + ¹²C'``, ``'α + ³He'``,
    ``'γ + ¹³N'``."""
    if label.is_photon:
        return f"γ + {nuclide_plain(label.Z2, label.A2)}"
    (zl, al), (zh, ah) = _split(label)
    return f"{_light_plain(zl, al)} + {nuclide_plain(zh, ah)}"


def reaction_plain(entrance: "ChannelLabel", exit: Optional["ChannelLabel"],
                   total: bool = False) -> str:
    """Unicode reaction notation for one entrance/exit pair, e.g.
    ``'¹²C(p,γ)¹³N'``, ``'²³Na(p,α)²⁰Ne'``, ``'⁶Li(p,³He)⁴He'``.

    ``total`` (or a photon exit) is radiative capture into the compound
    nucleus; an exit equal to the entrance species is elastic scattering.
    """
    (zp, ap), (zt, at) = _split(entrance)
    target, projectile = nuclide_plain(zt, at), _light_plain(zp, ap)
    if total or exit is None or exit.is_photon:
        return f"{target}({projectile},γ){nuclide_plain(zp + zt, ap + at)}"
    (zl, al), (zr, ar) = _split(exit)
    return f"{target}({projectile},{_light_plain(zl, al)}){nuclide_plain(zr, ar)}"


def reactions(segments, labels) -> List[str]:
    """Every distinct reaction the active data segments measure.

    Capture first, then other reactions, then elastic scattering -- the order
    a title reads in -- and file order within each.
    """
    by_key = {c.number: c for c in labels}
    out = []
    for segment in segments:
        if not getattr(segment, "active", True):
            continue
        entrance = by_key.get(segment.entrance_key)
        if entrance is None or entrance.is_photon:
            continue
        exit = by_key.get(segment.exit_key)
        text = reaction_plain(entrance, exit, total=segment.exit_key == -1)
        if text not in out:
            out.append(text)

    def rank(text):
        inside = text[text.index("(") + 1:text.index(")")].split(",")
        return 0 if inside[1] == "γ" else (2 if inside[0] == inside[1] else 1)
    return sorted(out, key=rank)
