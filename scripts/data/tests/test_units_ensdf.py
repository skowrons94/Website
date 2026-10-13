"""Kinematics and unit conversions; the ENSDF reader."""

import math

import pytest

from conftest import read
from nucdata import dataset, ensdf, masses


def test_lab_cm_round_trip_and_limit():
    mp, mt = masses.nuclear_mass(4, 2), masses.nuclear_mass(12, 6)
    for T in (1e-3, 0.3, 5.0, 100.0):
        E = masses.lab_to_cm(T, mp, mt)
        assert masses.cm_to_lab(E, mp, mt) == pytest.approx(T, rel=1e-12)
    # Non-relativistic limit: E_cm = T m_t / (m_p + m_t).
    assert masses.lab_to_cm(0.1, mp, mt) == pytest.approx(0.1 * mt / (mp + mt), rel=5e-6)


def test_masses_and_separation_energies():
    # AME2020: 15O S_p = 7296.8 keV, 13C S_n = 4946.3 keV, 16O S_a = 7162.2 keV.
    assert masses.separation(15, 8, 1, 1) == pytest.approx(7.2968, abs=2e-4)
    assert masses.separation(13, 6, 1, 0) == pytest.approx(4.9463, abs=2e-4)
    assert masses.separation(16, 8, 4, 2) == pytest.approx(7.1619, abs=2e-4)
    assert masses.atomic_mass_u(12, 6) == pytest.approx(12.0, abs=1e-9)
    assert masses.nuclear_mass(0, 6) == pytest.approx(12.011 * masses.AMU - 6 * masses.ME)


def test_sommerfeld():
    # 2 pi eta = 31.29 Z1 Z2 sqrt(mu[u] / E[keV]) (standard approximation).
    mu = 1.0 * 14.0 / 15.0
    approx = 31.29 * 7 * math.sqrt(mu / 100.0)
    assert masses.two_pi_eta(1, 7, mu * masses.AMU, 0.1) == pytest.approx(approx, rel=2e-3)


@pytest.mark.parametrize("unit,factor,label", [
    ("MB", 1e-3, "b"), ("MICRO-B", 1e-6, "b"), ("B/SR", 1.0, "b/sr"), ("MB/SR", 1e-3, "b/sr"),
    ("KEV", 1e-3, "MeV"), ("EV", 1e-6, "MeV"), ("B*KEV", 1e-3, "MeV b"), ("MB*MEV", 1e-3, "MeV b"),
    ("ADEG", 1.0, "deg"), ("PER-CENT", 1.0, "%"), ("NO-DIM", 1.0, ""),
])
def test_unit_scale(unit, factor, label):
    f, lab, _ = dataset.unit_scale(unit)
    assert f == pytest.approx(factor) and lab == label


@pytest.mark.parametrize("v,dv,val,unc,txt", [
    ("6793.1", "17", 6793.1, 1.7, ""), ("5183", "1", 5183.0, 1.0, ""), ("1.2E-3", "4", 1.2e-3, 0.4e-3, ""),
    ("0.99", "LT", 0.99, None, "LT"), ("X", "", None, None, ""), ("2.6", "+3-2", 2.6, None, "+0.3-0.2"),
])
def test_ensdf_uncertainties(v, dv, val, unc, txt):
    a, b, c = ensdf.value_unc(v, dv)
    assert a == val and (b == pytest.approx(unc) if unc is not None else b is None) and c == txt


def test_ensdf_15O_adopted():
    ds = ensdf.parse(read("ensdf", "15O-adopted.ens"))
    assert len(ds) == 1 and ds[0].dsid == "ADOPTED LEVELS, GAMMAS"
    s = ensdf.summary(ds[0])
    assert s["evaluation"]["citation"] == "NP A523,1 (1991)" and s["evaluation"]["cutoff"] == "1-Jul-1990"
    assert s["Q"]["S_p_keV"] == 7296.8 and s["Q"]["dS_p_keV"] == 0.5
    lv = {round(l["E_keV"], 1): l for l in s["levels"] if l["E_keV"] is not None}
    gs = lv[0.0]
    assert gs["J"] == "1/2-" and gs["firm"] and gs["t_half_s"] == pytest.approx(122.24)
    assert gs["T"] == "1/2" and gs["decay"] == {"%EC+%B+": "100"}
    l6793 = lv[6793.1]
    assert l6793["dE_keV"] == pytest.approx(1.7) and l6793["limit"] == "LT"
    assert l6793["gammas"][0]["M"] == "[E1(+M2)]" and l6793["gammas"][0]["delta"] == 0.02
    l7556 = lv[7556.5]
    assert l7556["width_eV"] == pytest.approx(990.0) and l7556["dwidth_eV"] == pytest.approx(100.0)
    br = {g["E_keV"]: g.get("BR") for g in l7556["gammas"]}
    assert br[697.1] is None                        # an upper limit is not a branch
    assert sum(v for v in br.values() if v) == pytest.approx(100.0)
    # Final levels, with the nuclear recoil (8281.5 keV gamma from 8284.0 to the ground state).
    l8284 = lv[8284.0]
    assert {g["E_keV"]: g["E_final_keV"] for g in l8284["gammas"]}[8281.5] == 0.0


def test_ensdf_synthetic_edge_cases():
    s = ensdf.summary(ensdf.parse(read("ensdf", "synthetic-99Tc.ens"))[0])
    lv = s["levels"]
    assert lv[1]["J"] == "(5/2,7/2)+" and lv[1]["firm"] is False and lv[1]["T"] == "1/2"
    assert lv[1]["t_half_s"] == pytest.approx(6 * 3600)
    assert lv[1]["gammas"][0]["delta_text"] == "+0.05-0.03"
    assert lv[2]["T"] == "1/2" and lv[2]["J"] == "3/2-" and lv[2]["d_asym"] == "+0.3-0.2"
    assert lv[2]["width_eV"] == pytest.approx(2600.0)
    assert lv[2]["gammas"][1]["questionable"] is True
    assert lv[3]["E_keV"] is None and lv[3]["E_text"] == "X"
    assert lv[4]["E_keV_offset"] == [1000.0, "X"]
    assert s["unplaced_gammas"][0]["I_limit"] == "LT"
    assert s["Q"]["Q_alpha_keV"] == -2000.0 and s["Q"]["dQ_alpha_keV"] == 20.0
    assert s["evaluation"]["cutoff"] == "1-Jan-2026"
