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

    number: int              # 1-based pair number (matches Parameter.pair)
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


def compound_nucleus(records) -> Optional[str]:
    """LaTeX for the compound nucleus, from the entrance pair.

    ``records`` is any iterable of :class:`ChannelLabel`.  The entrance channel's
    two constituents fuse into the compound system that names the evaluation
    (``p + ^{12}\\text{C}`` -> ``^{13}\\text{N}``).  Pair 1 is the entrance pair
    in every AZURE2 model, and a photon pair's "constituents" already sum to the
    compound system, so both cases fall out of the same arithmetic.
    """
    entrance = next((c for c in records if c.number == 1), None)
    if entrance is None:
        return None
    return nuclide(entrance.Z1 + entrance.Z2, entrance.A1 + entrance.A2)
