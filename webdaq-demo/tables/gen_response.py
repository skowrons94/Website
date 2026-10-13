#!/usr/bin/env python3
"""
Response tables for the WebDAQ demo's two generic detectors (design §3.5).

    python3 webdaq-demo/tables/gen_response.py        # writes tables/hpge.json, tables/bgo.json

Deterministic (fixed seed), numpy only. The output is committed; CI does not run this.

What it does
------------
A small photon-transport Monte Carlo in a bare cylinder, for a point source on the
detector axis, at 48 log-spaced energies (30 keV - 8 MeV) and six distances
(1, 2, 5, 10, 25, 50 cm from the end cap; the engine interpolates the
intrinsic efficiency in distance and multiplies by the exact solid angle):

* cross sections: NIST XCOM (Berger, Hubbell, Seltzer et al., "XCOM: Photon Cross
  Section Database", NIST Standard Reference Database 8 / NBSIR 87-3597), element
  files Ge, Bi, O as distributed in PyMca5 5.9.7 (`PyMca5/PyMcaData/attdata/*.mat`,
  MIT-licensed package, public-domain NIST data), copied to tables/xcom/;
* Compton scattering sampled from the Klein-Nishina formula (Klein & Nishina,
  Z. Phys. 52, 853 (1929)), free electrons (binding ignored: fine above ~100 keV);
* photoabsorption deposits the full photon energy (fluorescence escape ignored);
* pair production deposits E - 2 m_e c^2 locally and emits two back-to-back 511 keV
  photons, which are tracked: this is what makes single and double escape peaks;
* coherent scattering is left out (it barely changes direction above 100 keV);
* electrons are absorbed where they are made (no bremsstrahlung or electron escape),
  so at 7 MeV the full-energy probability is somewhat optimistic.

Detector geometry is GENERIC on purpose (design §3.5, open question 3): these are
model assumptions, not a specific detector. They are listed in GEOMETRY below and
written into the output, so every number in the tables can be traced to them.

Output per detector: energy grid, total efficiency eT and full-energy efficiency eFE
per distance, the single- and double-escape probabilities per interacting photon, and
the continuum (all other deposits) as a 256-point quantile function of deposit/E,
stored as Uint16 (x * 65535), base64.
"""
import base64
import json
import math
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ME = 0.51099895  # MeV, electron rest energy (CODATA 2018)

# ── Generic detector geometry (model assumptions) ────────────────────────────
GEOMETRY = {
    "hpge": {
        "label": "generic coaxial p-type HPGe, ~100 % relative efficiency",
        "composition": {"Ge": 1.0},
        "density": 5.323,          # g/cm3, germanium
        # 70 mm x 70 mm: with this bare-crystal model it gives eFE(1332 keV, 25 cm)
        # about 1.1e-3, i.e. ~90 % of the 1.2e-3 that defines 100 % relative
        # efficiency (IEEE Std 325): a typical large coaxial detector.
        "radius_cm": 3.5,
        "length_cm": 7.0,
        "front_dead_cm": 0.07,     # Li-diffused outer contact of a p-type crystal (~0.7 mm)
        "endcap_gap_cm": 0.5,      # end cap to crystal face
        "backscatter_fraction": 0.02,  # extra events near E/(1+2E/mc2), from material around the source
        "n_photons": 60000,
    },
    "bgo": {
        "label": "generic 3 in x 3 in BGO (Bi4Ge3O12)",
        # mass fractions of Bi4Ge3O12: Bi 4*208.98, Ge 3*72.63, O 12*16.00 → M = 1245.8
        "composition": {"Bi": 0.67099, "Ge": 0.17490, "O": 0.15411},
        "density": 7.13,
        "radius_cm": 3.81,
        "length_cm": 7.62,
        "front_dead_cm": 0.0,
        "endcap_gap_cm": 0.3,
        "backscatter_fraction": 0.02,
        "n_photons": 40000,
    },
    "ej309": {
        "label": "generic 2 in x 2 in EJ-309-like liquid scintillator cell",
        # Eljen EJ-309 data sheet: density 0.959 g/cm3, H:C atom ratio 1.25
        # → mass fractions H 1.25*1.008/(1.25*1.008+12.011) = 0.0950, C 0.9050.
        "composition": {"H": 0.0950, "C": 0.9050},
        "density": 0.959,
        "radius_cm": 2.54,
        "length_cm": 5.08,
        "front_dead_cm": 0.0,
        "endcap_gap_cm": 0.2,
        "backscatter_fraction": 0.0,
        "n_photons": 40000,
    },
}
DISTANCES_CM = [1.0, 2.0, 5.0, 10.0, 25.0, 50.0]
N_E = 48
E_MIN, E_MAX = 0.030, 8.0   # MeV
N_Q = 256


def read_xcom(path):
    """Parse an XCOM element file (PyMca 'attdata' .mat). Returns energies (MeV) and
    cross sections (cm2/g): coherent, incoherent, photo, pair nuclear, pair electron."""
    with open(path) as fh:
        lines = fh.read().splitlines()
    sections, cur = {}, None
    for ln in lines[6:]:
        s = ln.strip()
        if not s:
            continue
        if s[0].isalpha():
            cur = s
            sections[cur] = []
            continue
        if cur:
            sections[cur].extend(float(x) for x in s.split())
    keys = list(sections)
    e = np.array(sections[keys[0]])
    cols = [np.array(sections[k]) for k in keys[1:6]]
    # The first group of the energy list is a small header block below 1.5 keV; keep
    # the ascending part above 10 keV, where everything we need lives.
    keep = e >= 0.010
    return e[keep], [c[keep] for c in cols]


def loglog(x, xp, fp):
    out = np.zeros_like(x)
    pos = fp > 0
    xp2, fp2 = xp[pos], fp[pos]
    ok = x >= xp2[0]
    out[ok] = np.exp(np.interp(np.log(x[ok]), np.log(xp2), np.log(fp2)))
    return out


class Material:
    def __init__(self, comp, density):
        self.tables = []
        for el, w in comp.items():
            e, cols = read_xcom(os.path.join(HERE, "xcom", f"{el}.mat"))
            # Edges appear as repeated energies; nudge the duplicate up so that interp
            # sees the above-edge value just above the edge.
            for i in range(1, len(e)):
                if e[i] <= e[i - 1]:
                    e[i] = e[i - 1] * (1 + 1e-9)
            self.tables.append((w, e, cols))
        self.rho = density

    def mu(self, E):
        """Linear attenuation coefficients (1/cm): incoherent, photo, pair (no coherent)."""
        E = np.atleast_1d(np.asarray(E, dtype=float))
        inc = np.zeros_like(E); ph = np.zeros_like(E); pp = np.zeros_like(E)
        for w, e, (coh, incoh, photo, pn, pe) in self.tables:
            inc += w * loglog(E, e, incoh)
            ph += w * loglog(E, e, photo)
            pp += w * (loglog(E, e, pn) + loglog(E, e, pe))
        pp[E < 2 * ME] = 0.0
        return inc * self.rho, ph * self.rho, pp * self.rho


def kn_sample(rng, k):
    """Sample cos(theta) and E'/E from Klein-Nishina for k = E/mc2 (Kahn's method)."""
    n = k.size
    eps = np.empty(n); done = np.zeros(n, bool)
    while not done.all():
        idx = np.flatnonzero(~done)
        kk = k[idx]
        r1, r2, r3 = rng.random(idx.size), rng.random(idx.size), rng.random(idx.size)
        branch = r1 <= (1 + 2 * kk) / (9 + 2 * kk)
        x = np.where(branch, 1 + 2 * kk * r2, (1 + 2 * kk) / (1 + 2 * kk * r2))
        acc = np.where(branch,
                       r3 <= 4 * (1 / x - 1 / x ** 2),
                       r3 <= 0.5 * ((1 - (1 + 2 * kk) / kk / x + 1 / kk) ** 2 + 1 / x))
        sel = idx[acc]
        eps[sel] = 1 / x[acc]
        done[sel] = True
    cos = 1 - (1 / eps - 1) / k
    return np.clip(cos, -1, 1), eps


def rotate(u, cos_t, phi):
    """Rotate unit vectors u by polar angle acos(cos_t) and azimuth phi."""
    sin_t = np.sqrt(np.maximum(0, 1 - cos_t ** 2))
    ux, uy, uz = u[:, 0], u[:, 1], u[:, 2]
    cp, sp = np.cos(phi), np.sin(phi)
    out = np.empty_like(u)
    perp = np.sqrt(np.maximum(1e-30, 1 - uz ** 2))
    normal = np.abs(uz) < 0.99999
    out[:, 0] = np.where(normal, sin_t * (ux * uz * cp - uy * sp) / perp + ux * cos_t, sin_t * cp)
    out[:, 1] = np.where(normal, sin_t * (uy * uz * cp + ux * sp) / perp + uy * cos_t, sin_t * sp)
    out[:, 2] = np.where(normal, -sin_t * perp * cp + uz * cos_t, np.sign(uz) * cos_t)
    return out


def transport(rng, mat, geo, E0, z0, n):
    """Track n photons of energy E0 (MeV) from a point at distance z0 (cm) before the
    crystal face. Returns (deposit per photon in MeV, geometric weight)."""
    R, L, dead = geo["radius_cm"], geo["length_cm"], geo["front_dead_cm"]
    cmax = z0 / math.sqrt(z0 ** 2 + R ** 2)
    weight = 0.5 * (1 - cmax)
    cos = 1 - rng.random(n) * (1 - cmax)
    phi = 2 * np.pi * rng.random(n)
    sin = np.sqrt(1 - cos ** 2)
    d = np.stack([sin * np.cos(phi), sin * np.sin(phi), cos], 1)
    t = z0 / cos
    p = np.stack([d[:, 0] * t, d[:, 1] * t, np.zeros(n)], 1)
    E = np.full(n, E0)
    ev = np.arange(n)
    dep = np.zeros(n)
    for _ in range(200):
        if E.size == 0:
            break
        mi, mp, mpp = mat.mu(E)
        mt = mi + mp + mpp
        # distance to exit
        a = d[:, 0] ** 2 + d[:, 1] ** 2
        b = 2 * (p[:, 0] * d[:, 0] + p[:, 1] * d[:, 1])
        c = p[:, 0] ** 2 + p[:, 1] ** 2 - R ** 2
        with np.errstate(divide="ignore", invalid="ignore"):
            tr = np.where(a > 1e-14, (-b + np.sqrt(np.maximum(0, b * b - 4 * a * c))) / (2 * a), np.inf)
            tz = np.where(d[:, 2] > 0, (L - p[:, 2]) / d[:, 2], np.where(d[:, 2] < 0, -p[:, 2] / d[:, 2], np.inf))
        texit = np.minimum(tr, tz)
        s = -np.log(rng.random(E.size)) / mt
        inside = s < texit
        p, d, E, ev, s = p[inside], d[inside], E[inside], ev[inside], s[inside]
        mi, mp, mpp, mt = mi[inside], mp[inside], mpp[inside], mt[inside]
        if E.size == 0:
            break
        p = p + d * s[:, None]
        active = p[:, 2] >= dead
        r = rng.random(E.size) * mt
        is_c = r < mi
        is_p = (r >= mi) & (r < mi + mp)
        is_pp = r >= mi + mp
        # photoabsorption
        np.add.at(dep, ev[is_p & active], E[is_p & active])
        # pair
        if is_pp.any():
            ed = (E[is_pp] - 2 * ME) * active[is_pp]
            np.add.at(dep, ev[is_pp], ed)
            m = int(is_pp.sum())
            cz = 2 * rng.random(m) - 1
            ph = 2 * np.pi * rng.random(m)
            sz = np.sqrt(1 - cz ** 2)
            dd = np.stack([sz * np.cos(ph), sz * np.sin(ph), cz], 1)
            pa = p[is_pp]
            new_p = np.concatenate([pa, pa])
            new_d = np.concatenate([dd, -dd])
            new_E = np.full(2 * m, ME)
            new_ev = np.concatenate([ev[is_pp], ev[is_pp]])
        else:
            new_p = np.zeros((0, 3)); new_d = np.zeros((0, 3)); new_E = np.zeros(0); new_ev = np.zeros(0, int)
        # Compton
        if is_c.any():
            k = E[is_c] / ME
            ct, eps = kn_sample(rng, k)
            ed = E[is_c] * (1 - eps) * active[is_c]
            np.add.at(dep, ev[is_c], ed)
            dc = rotate(d[is_c], ct, 2 * np.pi * rng.random(ct.size))
            dc /= np.linalg.norm(dc, axis=1)[:, None]
            cp, cE, cev = p[is_c], E[is_c] * eps, ev[is_c]
        else:
            dc = np.zeros((0, 3)); cp = np.zeros((0, 3)); cE = np.zeros(0); cev = np.zeros(0, int)
        p = np.concatenate([cp, new_p]); d = np.concatenate([dc, new_d])
        E = np.concatenate([cE, new_E]); ev = np.concatenate([cev, new_ev])
        # photons below 1 keV are absorbed where they are
        low = E < 0.001
        if low.any():
            np.add.at(dep, ev[low], E[low] * (p[low, 2] >= dead))
            p, d, E, ev = p[~low], d[~low], E[~low], ev[~low]
    return dep, weight


def build(name, seed):
    geo = GEOMETRY[name]
    mat = Material(geo["composition"], geo["density"])
    rng = np.random.default_rng(seed)
    grid = np.exp(np.linspace(math.log(E_MIN), math.log(E_MAX), N_E))
    eT = np.zeros((len(DISTANCES_CM), N_E)); eFE = np.zeros_like(eT)
    pSE = np.zeros(N_E); pDE = np.zeros(N_E)
    quant = np.zeros((N_E, N_Q), dtype=np.uint16)
    tol = 0.0005  # MeV: a deposit within 0.5 keV of a peak counts as that peak
    for j, E0 in enumerate(grid):
        pooled = []
        se_n = de_n = int_n = 0
        for i, dist in enumerate(DISTANCES_CM):
            z0 = dist + geo["endcap_gap_cm"]
            dep, w = transport(rng, mat, geo, E0, z0, geo["n_photons"])
            hit = dep > 1e-5
            fe = dep > E0 - tol
            eT[i, j] = w * hit.mean()
            eFE[i, j] = w * fe.mean()
            se = hit & (np.abs(dep - (E0 - ME)) < tol)
            de = hit & (np.abs(dep - (E0 - 2 * ME)) < tol) if E0 > 2 * ME else np.zeros_like(hit)
            se_n += int(se.sum()); de_n += int(de.sum()); int_n += int(hit.sum())
            cont = hit & ~fe & ~se & ~de
            pooled.append(dep[cont] / E0)
        pSE[j] = se_n / max(1, int_n) if E0 > 2 * ME else 0.0
        pDE[j] = de_n / max(1, int_n) if E0 > 2 * ME else 0.0
        x = np.sort(np.concatenate(pooled))
        if x.size < 10:
            q = np.linspace(0, 1, N_Q) * 0.5
        else:
            q = np.quantile(x, (np.arange(N_Q) + 0.5) / N_Q)
        quant[j] = np.clip(np.round(q * 65535), 0, 65535).astype(np.uint16)
        sys.stderr.write(f"{name} {E0*1000:8.1f} keV  eT(10cm)={eT[3,j]:.4g} eFE(10cm)={eFE[3,j]:.4g} "
                         f"P/T={eFE[3,j]/max(eT[3,j],1e-12):.3f} SE={pSE[j]:.4f} DE={pDE[j]:.4f}\n")
    out = {
        "generator": "webdaq-demo/tables/gen_response.py",
        "seed": seed,
        "detector": name,
        "geometry": {k: v for k, v in geo.items()},
        "sources": {
            "xcom": "NIST XCOM photon cross sections (Berger et al., NBSIR 87-3597), Ge/Bi/O files from PyMca5 5.9.7 attdata",
            "kn": "Klein & Nishina, Z. Phys. 52, 853 (1929)",
            "geometry": "generic model assumption (design §3.2, §3.5); not a specific detector",
        },
        "energies_keV": [round(float(e) * 1000, 3) for e in grid],
        "distances_cm": DISTANCES_CM,
        "solidAngle": [float(f"{0.5 * (1 - (d + geo['endcap_gap_cm']) / math.hypot(d + geo['endcap_gap_cm'], geo['radius_cm'])):.6g}") for d in DISTANCES_CM],
        "eT": [[float(f"{v:.4g}") for v in row] for row in eT],
        "eFE": [[float(f"{v:.4g}") for v in row] for row in eFE],
        "pSE": [float(f"{v:.4g}") for v in pSE],
        "pDE": [float(f"{v:.4g}") for v in pDE],
        "nQ": N_Q,
        "q": base64.b64encode(quant.astype("<u2").tobytes()).decode(),
    }
    return out


def main():
    for i, name in enumerate(["hpge", "bgo", "ej309"]):
        if len(sys.argv) > 1 and name not in sys.argv[1:]:
            continue
        out = build(name, 20261013 + i)
        with open(os.path.join(HERE, f"{name}.json"), "w") as fh:
            json.dump(out, fh, separators=(",", ":"))
        sys.stderr.write(f"wrote tables/{name}.json\n")


if __name__ == "__main__":
    main()
