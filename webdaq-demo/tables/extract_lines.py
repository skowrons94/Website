#!/usr/bin/env python3
"""
Builds webdaq-demo/sim/data/lines.json: the decay schemes and γ lines the demo
simulates, every value with a source key (design §3.3).

    pip download --no-deps paceENSDF==0.6.3          # ENSDF decay data sets as JSON (~98 MB wheel)
    python3 webdaq-demo/tables/extract_lines.py paceENSDF-0.6.3-py3-none-any.whl

Radioactive sources come from the ENSDF decay data sets (NNDC/IAEA, as converted to
JSON by paceENSDF 0.6.3; files `ENSDF_JSON/j_input_<parent>_<daughter>_…_0keV.json`).
For each decay the level scheme is kept with:
  * the feeding of each level per parent decay (β⁻ / EC+β⁺ intensity × NB × BR / 100),
  * for each γ transition from the level: its branching among the level's transitions
    (total transition intensity Iγ·(1+α) normalised to the level), and the photon
    probability 1/(1+α) (the rest is internal conversion, not simulated).
Walking the scheme reproduces the ENSDF emission probabilities and gives true
cascades, so coincidence summing follows. The script checks the walk against the
ENSDF Iγ (× NR × BR) and prints any line off by more than 3 %.

The hand-entered blocks (¹⁴N(p,γ)¹⁵O, background continuum, ²⁵²Cf, ³He, light
output, …) are in LITERATURE below, each value with its own source key.
"""
import json
import os
import sys
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "sim", "data", "lines.json")

# (key in lines.json, ENSDF file stem, decay-mode key in the level records)
DATASETS = [
    ("Co60", "j_input_Co60_Ni60_027060_028060_0keV.json", "betaMinusDecay"),
    ("Cs137", "j_input_Cs137_Ba137_055137_056137_0keV.json", "betaMinusDecay"),
    ("K40", "j_input_K40_Ar40_019040_018040_0keV.json", "betaPlusDecay"),
    ("Pb214", "j_input_Pb214_Bi214_082214_083214_0keV.json", "betaMinusDecay"),
    ("Bi214", "j_input_Bi214_Po214_083214_084214_0keV.json", "betaMinusDecay"),
    ("Ac228", "j_input_Ac228_Th228_089228_090228_0keV.json", "betaMinusDecay"),
    ("Pb212", "j_input_Pb212_Bi212_082212_083212_0keV.json", "betaMinusDecay"),
    ("Bi212", "j_input_Bi212_Po212_083212_084212_0keV.json", "betaMinusDecay"),
    ("Tl208", "j_input_Tl208_Pb208_081208_082208_0keV.json", "betaMinusDecay"),
]
MIN_LEVEL_POP = 2e-4     # levels reached in fewer than 0.02 % of decays are dropped
MIN_PHOTON = 1e-3        # γ rays emitted in fewer than 0.1 % of decays are dropped

SOURCES = {
    "ensdf": {
        "ref": "ENSDF decay data sets (NNDC, Brookhaven; evaluated nuclear structure data file), "
               "as distributed in JSON by paceENSDF 0.6.3 (PyPI)",
        "url": "https://www.nndc.bnl.gov/ensdf/",
    },
    "ensdf-bi212": {
        "ref": "ENSDF ²¹²Bi decay data set (β⁻ branch 64.06 %, hence α branch to ²⁰⁸Tl 35.94 %), paceENSDF 0.6.3",
        "url": "https://www.nndc.bnl.gov/ensdf/",
    },
    "marta2011": {
        "ref": "M. Marta et al. (LUNA), Phys. Rev. C 83, 045804 (2011): ¹⁴N(p,γ)¹⁵O, E_p = 278 keV resonance γ branchings",
        "doi": "10.1103/PhysRevC.83.045804",
    },
    "imbriani2005": {
        "ref": "G. Imbriani et al. (LUNA), Eur. Phys. J. A 25, 455 (2005)",
        "doi": "10.1140/epja/i2005-10138-7",
    },
    "sf2": {
        "ref": "E. G. Adelberger et al., Rev. Mod. Phys. 83, 195 (2011) (Solar Fusion II): ωγ of the 259 keV resonance",
        "doi": "10.1103/RevModPhys.83.195",
    },
    "tunl15": {
        "ref": "F. Ajzenberg-Selove, Nucl. Phys. A 523, 1 (1991), A = 13-15 evaluation (TUNL); ¹⁵O level energies",
        "doi": "10.1016/0375-9474(91)90446-D",
    },
    "ame2020": {
        "ref": "M. Wang et al., Chin. Phys. C 45, 030003 (2021) (AME2020): Q(¹⁴N(p,γ)) and masses",
        "doi": "10.1088/1674-1137/abddaf",
    },
    "codata2018": {
        "ref": "E. Tiesinga et al., Rev. Mod. Phys. 93, 025010 (2021) (CODATA 2018): proton and electron masses, e, ħc",
        "doi": "10.1103/RevModPhys.93.025010",
    },
    "srim": {
        "ref": "J. F. Ziegler, M. D. Ziegler, J. P. Biersack, Nucl. Instrum. Meth. B 268, 1818 (2010) (SRIM); "
               "stopping of 278 keV protons in N and Ti, rounded (to verify)",
        "doi": "10.1016/j.nimb.2010.02.091",
    },
    "bemmerer2005": {
        "ref": "D. Bemmerer et al., Eur. Phys. J. A 24, 313 (2005): γ background at LNGS vs surface",
        "doi": "10.1140/epja/i2004-10135-y",
    },
    "caciolli2009": {
        "ref": "A. Caciolli et al., Eur. Phys. J. A 39, 179 (2009): ultra-sensitive in-beam γ spectroscopy at LUNA",
        "doi": "10.1140/epja/i2008-10706-1",
    },
    "krane-co60": {
        "ref": "Angular correlation of the ⁶⁰Co 1173–1332 keV cascade (4→2→0): a2 = 0.1020, a4 = 0.0091 (theory, pure E2-E2), "
               "e.g. K. S. Krane, 'Introductory Nuclear Physics' (Wiley 1988) §10.4",
    },
    "watt-cf252": {
        "ref": "²⁵²Cf spontaneous-fission neutron spectrum as a Watt distribution a = 1.025 MeV, b = 2.926 MeV⁻¹ "
               "(MCNP manual default for ²⁵²Cf; Shultis & Faw); ν̄ = 3.7676 (Santi & Miller / ENDF); SF branch 3.092 % (ENSDF ²⁵²Cf)",
    },
    "verbinski1973": {
        "ref": "V. V. Verbinski, H. Weber, R. E. Sund, Phys. Rev. C 7, 1173 (1973): ²⁵²Cf prompt fission γ rays, "
               "≈ 7.8 photons per fission, mean ≈ 0.88 MeV",
        "doi": "10.1103/PhysRevC.7.1173",
    },
    "knoll": {
        "ref": "G. F. Knoll, Radiation Detection and Measurement, 4th ed. (Wiley 2010): n-p cross section approximation "
               "σ ≈ 4.83/√E − 0.578 b (Marion & Young), ³He(n,p) Q = 764 keV, wall effect (ch. 14-15)",
    },
    "eljen309": {
        "ref": "Eljen Technology, EJ-309 data sheet: light output 80 % anthracene (≈ 12 300 photons/MeVee), "
               "H:C 1.25, density 0.959 g/cm³, decay components used for PSD",
    },
    "enqvist2013": {
        "ref": "A. Enqvist et al., Nucl. Instrum. Meth. A 715, 79 (2013): EJ-309 proton light output "
               "L = 0.817 E − 2.63 (1 − exp(−0.297 E)) MeVee (E in MeV)",
        "doi": "10.1016/j.nima.2013.03.032",
    },
    "dietze1982": {
        "ref": "G. Dietze, H. Klein, Nucl. Instrum. Meth. 193, 549 (1982): resolution form ΔL/L = √(α² + β²/L + γ²/L²)",
        "doi": "10.1016/0029-554X(82)90249-X",
    },
    "illustrative": {
        "ref": "Illustrative model choice of the demo (not a measurement); declared as such in the scenario panel and in metadata.json → Demo",
    },
    "design": {
        "ref": "WebDAQ demo design, §3.2-§3.7 (assumptions declared in the demo, to be confirmed by Jakub)",
    },
}

# ¹⁴N(p,γ)¹⁵O at the E_p = 278 keV (E_cm = 259 keV) resonance.
LITERATURE = {
    "n14pg": {
        "src": "marta2011",
        "Q_keV": {"v": 7296.8, "src": "ame2020", "note": "to verify against AME2020 (LUNA papers quote 7297 keV)"},
        "Ep_res_keV": {"v": 278.0, "src": "imbriani2005"},
        "Ecm_res_keV": {"v": 259.0, "src": "imbriani2005"},
        "omega_gamma_meV": {"v": 13.1, "src": "sf2"},
        # Stopping cross sections per atom, lab, 278 keV protons, 1e-15 eV cm²/atom.
        "eps_N": {"v": 13.0, "src": "srim"},
        "eps_Ti": {"v": 33.0, "src": "srim"},
        "M15O_MeV": {"v": 13971.18, "src": "ame2020",
                     "note": "nuclear mass: 15 u + mass excess 2855.6 keV − 8 mₑ"},
        "Mp_MeV": {"v": 938.272, "src": "codata2018"},
        "levels_keV": {"v": [0, 5181, 6172, 6792], "src": "tunl15"},
        # Primary branchings of the resonance, % (R→0, R→5181, R→6172, R→6792)
        "branching_pct": {"v": [1.49, 17.3, 58.3, 22.9], "src": "marta2011"},
        "secondary_to_gs": {"v": 1.0, "src": "tunl15",
                            "note": "secondaries taken as 100 % to the ground state (design §3.3, to verify)"},
        "detector_angle_deg": {"v": 55.0, "src": "design"},
        "yield_factor_default": {"v": 20, "src": "design"},
        # Beam-induced background lines, ¹²C 4439 and ¹⁶O 6129 keV (level energies,
        # ENSDF adopted levels); intensities relative to the resonance rate are illustrative.
        "beam_bg": {"v": [[4438.9, 0.002], [6129.9, 0.002]], "src": "illustrative",
                    "note": "energies: ENSDF adopted ¹²C 4438.9 and ¹⁶O 6129.9 keV levels; intensities illustrative"},
    },
    "co60_correlation": {"a2": 0.1020, "a4": 0.0091, "src": "krane-co60"},
    "background": {
        "src": "illustrative",
        "note": "Room background seen by an unshielded detector underground. Chain activities are illustrative "
                "point-source equivalents at 25 cm, not a measurement of any laboratory.",
        # Bq-equivalent of each component placed at 25 cm.
        "components": {"v": [["K40", 400.0], ["Pb214", 120.0], ["Bi214", 120.0], ["Ac228", 60.0],
                              ["Pb212", 60.0], ["Bi212", 60.0], ["Tl208", 21.6]], "src": "illustrative",
                       "note": "Tl208 = 0.3594 × Th-chain activity (Bi212 α branch, ensdf-bi212)"},
        # Power-law continuum (deposited energy), counts/s per detector above 50 keV.
        "continuum": {"rate_cps": 8.0, "index": 1.6, "src": "illustrative"},
        "annihilation_cps": {"v": 0.15, "src": "illustrative"},
        # Cosmic-ray induced continuum above 3 MeV: surface rate and the underground
        # suppression (order 10³, Bemmerer 2005; Caciolli 2009; exact factor to verify).
        "cosmic_surface_cps": {"v": 3.0, "src": "illustrative"},
        "underground_suppression": {"v": 1000.0, "src": "bemmerer2005",
                                    "note": "order of magnitude; see also caciolli2009"},
    },
    "cf252": {
        "src": "watt-cf252",
        "watt_a_MeV": {"v": 1.025, "src": "watt-cf252"},
        "watt_b_perMeV": {"v": 2.926, "src": "watt-cf252"},
        "nubar": {"v": 3.7676, "src": "watt-cf252"},
        "sf_branch": {"v": 0.03092, "src": "watt-cf252"},
        "gammas_per_fission": {"v": 7.8, "src": "verbinski1973"},
        "gamma_mean_MeV": {"v": 0.88, "src": "verbinski1973"},
    },
    "ej309": {
        "src": "eljen309",
        "photons_per_MeVee": {"v": 12300, "src": "eljen309"},
        "pe_per_photon": {"v": 0.12, "src": "illustrative", "note": "QE × light collection, typical PMT-coupled cell"},
        "proton_light": {"a": 0.817, "b": 2.63, "c": 0.297, "src": "enqvist2013"},
        "resolution": {"alpha": 0.11, "beta": 0.10, "gamma": 0.003, "src": "dietze1982",
                       "note": "form from dietze1982; parameter values illustrative for a 2 in cell"},
        # Three-exponential light pulse (ns) with the slow fraction depending on the
        # particle: electrons vs recoil protons (illustrative, chosen to give FOM ≈ 1–2).
        "tau_ns": {"v": [3.5, 32.0, 270.0], "src": "illustrative"},
        "weights_electron": {"v": [0.84, 0.10, 0.06], "src": "illustrative"},
        "weights_proton": {"v": [0.66, 0.16, 0.18], "src": "illustrative"},
        "np_xs": {"a_b": 4.83, "c_b": 0.578, "src": "knoll"},
        "nH_per_cm3": {"v": 5.43e22, "src": "eljen309"},
        "cell_length_cm": {"v": 5.08, "src": "illustrative"},
        "cell_radius_cm": {"v": 2.54, "src": "illustrative"},
        "rise_ns": {"v": 1.0, "src": "illustrative"},
        "noise_keV_per_sqrt_ns": {"v": 0.05, "src": "illustrative"},
        "q_per_keV": {"v": 10.0, "src": "illustrative"},
        "adc_per_keV": {"v": 3.0, "src": "illustrative"},
    },
    "he3": {
        "src": "knoll",
        "Q_keV": {"v": 764.0, "src": "knoll"},
        "E_p_keV": {"v": 573.0, "src": "knoll"},
        "E_t_keV": {"v": 191.0, "src": "knoll"},
        "wall_fraction": {"v": 0.25, "src": "illustrative",
                          "note": "fraction of captures losing p or t in the wall; depends on tube size and pressure"},
        "intrinsic_eff_thermal": {"v": 0.5, "src": "illustrative",
                                  "note": "moderated source; illustrative"},
        "tau_ns": {"v": 2000.0, "src": "illustrative", "note": "charge-preamp decay seen by the digitiser"},
        "rise_ns": {"v": 400.0, "src": "illustrative", "note": "drift-limited rise of a proportional counter"},
        "r_int": {"v": 0.02, "src": "illustrative"},
        "noise_keV_per_sqrt_ns": {"v": 0.3, "src": "illustrative"},
        "q_per_keV": {"v": 40.0, "src": "illustrative"},
        "adc_per_keV": {"v": 3.0, "src": "illustrative"},
        "tube_radius_cm": {"v": 1.27, "src": "illustrative"},
    },
    "bgo": {
        "src": "illustrative",
        "photons_per_keV": {"v": 8.2, "src": "illustrative", "note": "≈ 8–9 photons/keV for BGO (design §3.4)"},
        "pe_fraction": {"v": 0.175, "src": "design", "note": "QE 25 % × collection 0.7 (design §3.4)"},
        "tau_ns": {"v": [300.0, 60.0], "src": "design"},
        "weights": {"v": [0.9, 0.1], "src": "design"},
        "rise_ns": {"v": 10.0, "src": "design"},
        "excess_noise": {"v": 2.0, "src": "illustrative",
                         "note": "PMT excess noise × BGO transfer variance; tuned so FWHM ≈ 11 % at 662 keV with long gates (design §3.4)"},
        "r_int": {"v": 0.005, "src": "illustrative"},
        "noise_keV_per_sqrt_ns": {"v": 0.2, "src": "illustrative"},
        "q_per_keV": {"v": 7.9, "src": "illustrative", "note": "charge gain: 7.6 MeV fully integrated ≈ Q_long 60 000"},
        "adc_per_keV": {"v": 1.2, "src": "illustrative"},
    },
    "hpge": {
        "src": "design",
        "A_keV2us": {"v": 1.33, "src": "design"},
        "B_keV2perus": {"v": 0.080, "src": "design"},
        "C_keV2": {"v": 0.20, "src": "design"},
        "fano": {"v": 0.08, "src": "design"},
        "eps_eV": {"v": 2.96, "src": "design"},
        "c_cc": {"v": 3.8e-4, "src": "design"},
        "tc_us": {"v": [0.1, 0.6], "src": "design"},
        "tau_preamp_us": {"v": 50.0, "src": "design"},
        "adc_per_keV": {"v": 1.6, "src": "design",
                        "note": "≈ 195 mV/MeV at 2 Vpp / 14 bit: 2.6 MeV fits at 50 % DC offset, 6.8 MeV saturates (§3.4)"},
        "gain_g0": {"v": 22.2, "src": "design", "note": "2.7 MeV near channel 30 000 at the default Fine Gain and rescaling"},
        "sigma_tr_ref_lsb": {"v": 18.0, "src": "illustrative", "note": "RC-CR² noise at τ_in = 48 ns, 4-sample smoothing"},
    },
}


def load(zf, stem):
    for n in zf.namelist():
        if n.endswith("/" + stem):
            return json.loads(zf.read(n))
    raise SystemExit(f"missing {stem}")


def scheme(d, mode):
    norm = d["decaySchemeNormalization"][0]["normalizationRecord"][0]
    nr = norm["multiplerPhotonIntensity"] or 1.0
    nb = norm["multiplerLeptonIntensity"] or 1.0
    br = norm["multiplerBranchingRatio"] or 1.0
    lv = d["levelScheme"]
    feed = []
    for L in lv:
        f = 0.0
        for rec in L.get(mode) or []:
            if mode == "betaMinusDecay":
                f += rec.get("betaMinusIntensity") or 0.0
            else:
                f += rec.get("totalElectronCaptureBetaPlusIntensity") or 0.0
        feed.append(f * nb * br / 100.0)
    s = sum(feed)
    if s > 1.0:
        feed = [f / s for f in feed]
    trans = []
    for L in lv:
        ts = []
        for g in L.get("gammaDecay") or []:
            ig = g.get("gammaIntensity") or 0.0
            a = g.get("calculatedTotalInternalConversionCoefficient") or g.get("experimentalTotalInternalConversionCoefficient") or 0.0
            ti = ig * (1 + a)
            if ti <= 0:
                continue
            ts.append([g["levelIndexFinal"], ti, 1.0 / (1 + a), g["gammaEnergy"], ig * nr * br / 100.0])
        tot = sum(t[1] for t in ts)
        for t in ts:
            t[1] /= tot
        trans.append(ts)
    # populations by walking down (levels are ordered by energy)
    pop = feed[:]
    for i in range(len(lv) - 1, -1, -1):
        for t in trans[i]:
            pop[t[0]] += pop[i] * t[1]
    return lv, feed, trans, pop


def build_nuclide(d, mode, key):
    lv, feed, trans, pop = scheme(d, mode)
    keep = [i for i in range(len(lv)) if i == 0 or pop[i] >= MIN_LEVEL_POP]
    idx = {o: n for n, o in enumerate(keep)}
    levels = []
    for o in keep:
        gs = []
        for to, b, ph, eg, ensdf_i in trans[o]:
            if to not in idx:
                continue
            gs.append([idx[to], round(b, 6), round(ph, 6), eg])
        if gs:
            s = sum(g[1] for g in gs)
            for g in gs:
                g[1] = round(g[1] / s, 6)
        levels.append([lv[o]["levelEnergy"], round(feed[o], 6), gs])
    # check against ENSDF absolute intensities
    lines = []
    for o in keep:
        for to, b, ph, eg, ensdf_i in trans[o]:
            if to not in idx:
                continue
            walk = pop[o] * b * ph
            if walk >= MIN_PHOTON or ensdf_i >= MIN_PHOTON:
                lines.append([eg, round(ensdf_i, 6)])
                if ensdf_i > 0.005 and abs(walk / ensdf_i - 1) > 0.03:
                    sys.stderr.write(f"  {key}: {eg} keV walk {walk:.4f} vs ENSDF {ensdf_i:.4f}\n")
    hl = d["parentDecay"][0]["halfLife"][0]
    return {
        "src": "ensdf",
        "dataset": f"{d['parentID']} → {d['daughterID']} ({d['decayMode']})",
        "halfLife_s": hl.get("halfLifeConverted"),
        "levels": levels,
        "lines": sorted(lines),
    }


def main():
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    zf = zipfile.ZipFile(sys.argv[1])
    nuclides = {}
    for key, stem, mode in DATASETS:
        d = load(zf, stem)
        nuclides[key] = build_nuclide(d, mode, key)
        if key == "Bi212":
            nuclides[key]["src"] = "ensdf-bi212"
        sys.stderr.write(f"{key}: {len(nuclides[key]['levels'])} levels, {len(nuclides[key]['lines'])} lines\n")
    out = {
        "schema": 1,
        "generator": "webdaq-demo/tables/extract_lines.py",
        "notice": "Simulated data for the WebDAQ demo. Each value carries a source key from `sources`.",
        "sources": SOURCES,
        "nuclides": nuclides,
        **LITERATURE,
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w") as fh:
        json.dump(out, fh, ensure_ascii=False, separators=(",", ":"))
    sys.stderr.write(f"wrote {os.path.relpath(OUT)} ({os.path.getsize(OUT)} bytes)\n")


if __name__ == "__main__":
    main()
