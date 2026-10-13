"""AME2020 masses (from content/atlas/nuclear-data, the same table the atlas
uses) and the kinematics that turn a laboratory energy into a
centre-of-mass one.

Mass excesses are atomic, in MeV.  Nuclear masses subtract Z electron
masses (electron binding neglected, < 1 keV x Z^2.4 scale, irrelevant here).

Lab -> c.m. (projectile of mass m_p and kinetic energy T on a target at rest,
m_t), relativistically:

    E_cm = sqrt((m_p + m_t)^2 + 2 m_t T) - (m_p + m_t)

which reduces to T m_t / (m_p + m_t) for T << m.  A c.m. energy given by
EXFOR (EN-CM) is converted back with the inverse of the same formula.  For
the AZURE2 export the non-relativistic form is used instead, because that is
what AZURE2 itself applies (EPoint::ConvertLabEnergy, E_cm = E_lab M2/(M1+M2)).

Natural targets (A = 0 in EXFOR, e.g. 6-C-0) use the standard atomic weight
and are marked `cm_approx` by the caller.
"""

import math
import os
from functools import lru_cache
from typing import Optional

from . import config

AMU = 931.49410242          # MeV
ME = 0.51099895             # MeV
ALPHA = 1 / 137.035999084
HBARC = 197.3269804         # MeV fm

SYMBOLS = ["n", "H", "He", "Li", "Be", "B", "C", "N", "O", "F", "Ne", "Na", "Mg", "Al", "Si", "P", "S",
           "Cl", "Ar", "K", "Ca", "Sc", "Ti", "V", "Cr", "Mn", "Fe", "Co", "Ni", "Cu", "Zn", "Ga", "Ge",
           "As", "Se", "Br", "Kr", "Rb", "Sr", "Y", "Zr", "Nb", "Mo", "Tc", "Ru", "Rh", "Pd", "Ag", "Cd",
           "In", "Sn", "Sb", "Te", "I", "Xe", "Cs", "Ba", "La", "Ce", "Pr", "Nd", "Pm", "Sm", "Eu", "Gd",
           "Tb", "Dy", "Ho", "Er", "Tm", "Yb", "Lu", "Hf", "Ta", "W", "Re", "Os", "Ir", "Pt", "Au", "Hg",
           "Tl", "Pb", "Bi", "Po", "At", "Rn", "Fr", "Ra", "Ac", "Th", "Pa", "U", "Np", "Pu", "Am", "Cm",
           "Bk", "Cf", "Es", "Fm", "Md", "No", "Lr", "Rf", "Db", "Sg", "Bh", "Hs", "Mt", "Ds", "Rg", "Cn",
           "Nh", "Fl", "Mc", "Lv", "Ts", "Og"]

# Standard atomic weights (IUPAC 2021, abridged/conventional), Z = 1..83, for
# natural targets only.
STD_WEIGHT = [None, 1.008, 4.0026, 6.94, 9.0122, 10.81, 12.011, 14.007, 15.999, 18.998, 20.180,
              22.990, 24.305, 26.982, 28.085, 30.974, 32.06, 35.45, 39.95, 39.098, 40.078,
              44.956, 47.867, 50.942, 51.996, 54.938, 55.845, 58.933, 58.693, 63.546, 65.38,
              69.723, 72.630, 74.922, 78.971, 79.904, 83.798, 85.468, 87.62, 88.906, 91.224,
              92.906, 95.95, 97.0, 101.07, 102.91, 106.42, 107.87, 112.41, 114.82, 118.71,
              121.76, 127.60, 126.90, 131.29, 132.91, 137.33, 138.91, 140.12, 140.91, 144.24,
              145.0, 150.36, 151.96, 157.25, 158.93, 162.50, 164.93, 167.26, 168.93, 173.05,
              174.97, 178.49, 180.95, 183.84, 186.21, 190.23, 192.22, 195.08, 196.97, 200.59,
              204.38, 207.2, 208.98]


@lru_cache(maxsize=1)
def table():
    """{(A, Z): mass excess MeV} from the atlas' AME2020 file."""
    out = {}
    path = os.path.join(config.NUCLEAR_DATA, "ame2020-mass-excess.txt")
    with open(path) as f:
        for line in f:
            parts = line.split()
            if len(parts) == 3 and parts[0].isdigit():
                try:
                    out[(int(parts[0]), int(parts[1]))] = float(parts[2])
                except ValueError:
                    pass
    return out


def mass_excess(A: int, Z: int) -> Optional[float]:
    return table().get((A, Z))


def nuclear_mass(A: int, Z: int) -> Optional[float]:
    """Nuclear mass in MeV (atomic mass minus Z electrons), or for A == 0 the
    standard atomic weight's equivalent."""
    if A == 0:
        if 0 < Z < len(STD_WEIGHT):
            return STD_WEIGHT[Z] * AMU - Z * ME
        return None
    d = mass_excess(A, Z)
    if d is None:
        return None
    return A * AMU + d - Z * ME


def atomic_mass_u(A: int, Z: int) -> Optional[float]:
    d = mass_excess(A, Z)
    return None if d is None else A + d / AMU


def lab_to_cm(T: float, mp: float, mt: float) -> float:
    s = (mp + mt) ** 2 + 2 * mt * T
    return math.sqrt(s) - (mp + mt)


def cm_to_lab(E: float, mp: float, mt: float) -> float:
    M = mp + mt
    return ((E + M) ** 2 - M ** 2) / (2 * mt)


def separation(A: int, Z: int, a: int, z: int) -> Optional[float]:
    """Separation energy of the particle (a, z) from (A, Z), MeV, from AME2020."""
    d0, d1, d2 = mass_excess(A, Z), mass_excess(A - a, Z - z), mass_excess(a, z)
    if None in (d0, d1, d2):
        return None
    return d1 + d2 - d0


def symbol(Z: int) -> str:
    return SYMBOLS[Z] if 0 <= Z < len(SYMBOLS) else f"Z{Z}"


def two_pi_eta(z1: int, z2: int, mu_mev: float, e_cm: float) -> float:
    """Sommerfeld 2 pi eta for c.m. energy e_cm (MeV), reduced mass mu (MeV)."""
    return 2 * math.pi * ALPHA * z1 * z2 * math.sqrt(mu_mev / (2 * e_cm))
