"""Curated corrections (scripts/data/corrections.yaml), indirect methods and
the per-point half of "lowest measured" (nucdata/measured.py): on unmodified
EXFOR fixtures and on the committed index."""

import json
import os

import pytest

from conftest import PUBLIC_DATA, read
from nucdata import build_exfor, check, corrections, dataset, ensdf, measured, x4


def sets(name):
    return {d.meta["id"]: d for d in dataset.datasets(x4.parse_entry(read("exfor", f"{name}.x4")),
                                                      ("2026-01-01", 1))}


# -- the table ---------------------------------------------------------------

def test_table_is_complete_and_unreported():
    items = corrections.load()
    ids = [c["id"] for c in items]
    assert len(ids) == len(set(ids))
    for c in items:
        assert c["evidence"] and c["paper"] and c["reaction"]
        assert corrections.yes_no(c["reported_to_nrdc"]) == "no"
        assert "owner to" in c["status"] or "not applied" in c["status"]
    # the R-matrix and expert reviews' items are all there
    for want in ("F0580.002", "O2548.002", "O2313.002", "C2168.002", "C1825.002", "D0468.004", "O2207.006",
                 "A1205.004", "O2597.002", "O1381.003"):
        assert want in ids
    # Raiola 2002 cannot be verified from the EXFOR file: on record, not applied
    assert corrections.for_dataset("O1381.003") == []


def test_nrdc_report_is_generated_from_the_table():
    text = corrections.report()
    with open(corrections.REPORT) as f:
        assert f.read() == text, "run `python scripts/data/dx.py nrdc-report`"
    for c in corrections.load():
        assert c["id"] in text


# -- one test per kind of correction, on the EXFOR files themselves -------------

def test_redder_1987_cm_listed_as_lab():
    for sid, low in (("F0580.002", 0.94), ("F0580.003", 1.40)):
        m, p = sets("F0580")[sid].meta, sets("F0580")[sid].points
        assert m["E_frame"] == "cm" and m["E_source"].startswith("EN (read as EN-CM")
        assert "corrected" in m["flags"] and m["corrections"][0]["reported_to_nrdc"] == "no"
        assert min(p["E_cm"]) == pytest.approx(low)
    # the lowest row, 29.3 +- 23.1, is not 2 sigma above zero: 1.10 MeV at 2 sigma, 0.94 at 1 sigma
    mm = sets("F0580")["F0580.002"].meta["measured_min_cm"]
    assert mm["2sigma"] == pytest.approx(1.10) and mm["1sigma"] == pytest.approx(0.94)


def test_bucher_2015_above_threshold():
    m, p = sets("C2168")["C2168.002"].meta, sets("C2168")["C2168.002"].points
    assert m["threshold_cm"] == pytest.approx(2.599, abs=0.002)
    assert m["E_frame"] == "cm" and min(p["E_cm"]) == pytest.approx(3.1)
    assert min(p["E_cm"]) > m["threshold_cm"]


def test_bruno_2016_resonance_cm():
    for sid in ("O2313.002", "O2313.003"):
        m, p = sets("O2313")[sid].meta, sets("O2313")[sid].points
        assert m["E_frame"] == "cm-res" and p["E_cm"] == [pytest.approx(0.0645)]


def test_chafa_2007_kev_under_ev():
    for sid in ("D0468.004.1", "D0468.004.2"):
        m, p = sets("D0468")[sid].meta, sets("D0468")[sid].points
        assert m["E_frame"] == "lab-res" and p["E_lab"] == [pytest.approx(0.1941)]
        assert p["E_cm"][0] == pytest.approx(0.1833, abs=2e-4)     # as D0468.005 gives it
        assert p["dE"] == [pytest.approx(0.0006)]


def test_krawinkel_1982_partial_s_times_1000():
    ds = sets("A1205")
    tot = ds["A1205.002"].points
    part = ds["A1205.004"].points
    i = part["E_cm"].index(0.1072)
    j = [k for k, e in enumerate(part["E_cm"]) if e == 0.1072]
    # the two partials at 107.2 keV add up to the total of A1205.002 (0.350 mb MeV)
    assert sum(part["value"][k] for k in j) == pytest.approx(tot["value"][tot["E_cm"].index(0.1072)])
    assert part["value"][i] == pytest.approx(254e-6)                # MeV b
    assert part["d_tot"][i] == pytest.approx(46e-6)
    ratio = ds["A1205.005"].points
    assert min(ratio["E_cm"]) == pytest.approx(0.1072)


def test_corrected_datasets_in_the_committed_index():
    """Every applied correction shows in the index: flagged, at the corrected energy."""
    with open(os.path.join(PUBLIC_DATA, "exfor", "index.json")) as f:
        idx = json.load(f)
    D = idx["datasets"]
    bit = 1 << build_exfor.FLAG_BITS.index("corrected")
    lowest = {   # E_cm of the lowest point (MeV), after the correction
        "F0580.002": 0.94, "F0580.003": 1.40, "O2548.002.1": 0.233, "O2548.002.2": 0.233,
        "O2313.002": 0.0645, "O2313.003": 0.0645, "C2168.002": 3.1, "C1825.002": 0.1232,
        "C1825.003": 0.1232, "C1825.008": 0.1232, "D0468.004.1": 0.1833, "D0468.004.2": 0.1833,
        "O2207.006": 0.7496, "A1205.004": 0.1072, "A1205.005": 0.1072, "O2597.002": 0.3256,
        "O1420.008": 1.31, "C2375.002": 0.277, "C2254.003": 0.151,
        "D0710.027": 0.8794,
    }
    flagged = {D["id"][k] for k in range(len(D["id"])) if D["f"][k] & bit}
    assert flagged == set(lowest)
    for sid, e in lowest.items():
        k = D["id"].index(sid)
        assert D["e0"][k] == pytest.approx(e, rel=2e-3), sid
    applied = {c["id"] for c in corrections.load() if c.get("apply", True)}
    assert applied == {".".join(s.split(".")[:2]) for s in lowest}


# -- indirect methods -------------------------------------------------------------

def test_indirect_from_analysis_code_not_title():
    m = sets("O2211")["O2211.002"].meta            # Lattuada 2001: ANALYSIS (TROJA), title says nothing
    assert "indirect" in m["flags"] and "TROJA" not in m["title"].upper()


def test_direct_measurement_not_indirect():
    for name in ("F0580", "A1205", "A0379", "C2168"):
        for d in sets(name).values():
            assert "indirect" not in d.meta["flags"], d.meta["id"]


# -- the per-point rule -------------------------------------------------------------

def test_two_sigma_and_limits_per_point():
    pts = {"E_cm": [0.010, 0.016, 0.017, 0.020], "value": [5.0, 7.7, 13.0, 9.0],
           "limit": ["<", None, None, None], "d_tot": [None, 7.7, 5.0, 1.0]}
    # the limit never counts; 7.7 +- 7.7 is 1 sigma, not 2; 13 +- 5 is 2.6 sigma
    assert measured.lowest(pts, True, 0, 2) == 0.017
    assert measured.lowest(pts, True, 0, 1) == 0.016
    # a point without an uncertainty counts when above zero; zero or negative never
    assert measured.lowest({"E_cm": [0.1, 0.2], "value": [0.0, 3.0]}, True, 0, 2) == 0.2
    # the physical floor and the threshold
    assert measured.lowest({"E_cm": [0.0005, 0.002], "value": [1, 1]}, True, 0, 2) == 0.002
    assert measured.lowest({"E_cm": [0.0005, 0.002], "value": [1, 1]}, False, 0, 2) == 0.0005
    assert measured.lowest({"E_cm": [1.5, 3.0], "value": [1, 1]}, True, 2.6, 2) == 3.0


def test_bonetti_1999_counts_despite_one_limit():
    m = sets("A0379")["A0379.002"].meta
    assert "upper-limits" in m["flags"]
    assert m["measured_min_cm"]["2sigma"] == pytest.approx(0.01699)


def test_rule_settings_shared_with_the_pages():
    assert measured.RULE["sigma"] in measured.RULE["sigma_choices"] == [1, 2]
    assert measured.FLOOR_MEV == 0.001


def test_index_columns_decode():
    assert build_exfor.measured_columns(0.1, 0.1, 0.1) == {"m1": 0, "m2": 0}
    assert build_exfor.measured_columns(0.1, 0.1, 0.2) == {"m1": 0.1, "m2": 0.2}
    assert build_exfor.measured_columns(0.1, None, None) == {"m1": None, "m2": None}
    assert build_exfor.measured_columns(0.1, 0.15, 0.15) == {"m1": 0, "m2": 0.15}


def test_check_flags_points_below_threshold():
    shard = {"reaction": {"key": "12C(12C,n)", "atlas": ["x"]}, "datasets": [
        {"meta": {"id": "C2168.002", "threshold_cm": 2.6, "quantity_class": "S", "flags": [], "E_source": "EN"},
         "points": {"E_cm": [1.55, 3.0], "value": [1, 1]}}]}
    assert len(check.below_threshold(shard)) == 1
    shard["datasets"][0]["points"]["E_cm"] = [3.1, 3.2]
    assert check.below_threshold(shard) == []


def test_ensdf_author_markup():
    assert ensdf.clean_authors("M.S. Basunia{+#}, A. Chakraborty{+##}") == "M.S. Basunia, A. Chakraborty"
    assert ensdf.clean_authors("J.H. KELLEY, D.R. TILLEY AND C.M. CHEVES") == "J.H. Kelley, D.R. Tilley and C.M. Cheves"
    assert ensdf.clean_authors("CORAL M. BAGLIN, E.A. MCCUTCHAN") == "Coral M. Baglin, E.A. McCutchan"
