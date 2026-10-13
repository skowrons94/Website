"""Frozen external-capture integrals (app.integrals): ¹⁴N calculates its
published curves, and nothing replaces its integrals."""

import os
import shutil

import numpy as np
import pytest

from app import integrals

HERE = os.path.dirname(os.path.abspath(__file__))
EVALUATIONS = os.path.join(HERE, "..", "evaluations")

# ¹³C(p,γ)¹⁴N at the shipped parameters, as published (S-factor in MeV b;
# energies in MeV, c.m.), written by the precompute at AZURE2 7e533b7.
# The total capture of the extrapolations, (index, E, S):
TOTAL_EXTRAPOLATION = [
    (0, 0.0009281062732144337, 0.006051309724340021),
    (3, 0.02877129446964744, 0.006365775043756539),
    (11, 0.10301979632680211, 0.007484074570791231),
    (32, 0.29792211370183325, 0.016392924211301785),
    (48, 0.4464191174161428, 0.10598423729361424),
    (108, 1.0032828813448031, 0.008206860161205067),
    (269, 2.4975339812200286, 0.0006656786352517141),
]
# The LUNA total-capture data segment (data/c13_bgo.dat), (point, S):
TOTAL_DATA = [(0, 0.006789366469031346), (16, 0.010398362467692221),
              (33, 0.028236492092768323)]
TOTAL_DATA_CHI2 = 30.815132941162922
# The plots' extended curve of that segment, (point, E, S):
TOTAL_FINE = [(0, 0.01828282506975493, 0.006241972421828613),
              (200, 0.14134401543906072, 0.008297816858202203),
              (434, 0.41860377129417803, 0.05909248557130652)]
# Zero against non-zero component amplitudes is a difference of ~20 %; the
# engine reproduces itself to ~1e-9 across builds (6.6e-10 between the old
# and new pin on the narrow 448 keV resonance), so this is not tighter.
RTOL = 1e-9
TOTAL_DATA_FILE = "data/c13_bgo.dat"


def _total_capture_indices(azr_path):
    """The LUNA segment among the active data segments, and the total-capture
    line (exit -1) among the active extrapolations, looked up rather than
    assumed."""
    from pyazr.datasets import SegmentSet, TestSegmentSet
    data = [s for s in SegmentSet.from_file(azr_path) if s.active]
    tests = [t for t in TestSegmentSet.from_file(azr_path) if t.active]
    i = [k for k, s in enumerate(data) if s.data_file == TOTAL_DATA_FILE]
    j = [k for k, t in enumerate(tests) if t.exit_key == -1]
    assert len(i) == 1, f"{TOTAL_DATA_FILE}: {len(i)} active data segments"
    assert len(j) == 1, f"{len(j)} active total-capture extrapolations"
    return i[0], j[0]


def _copy(tmp_path, name="14N"):
    target = tmp_path / name
    shutil.copytree(os.path.join(EVALUATIONS, name), target,
                    ignore=shutil.ignore_patterns("fine", "extrap", "extrapolations",
                                                  "datamodel", "checks", "precomputed.json",
                                                  "initial*.json"))
    os.makedirs(target / "checks", exist_ok=True)
    return str(target)


def test_14N_lists_its_integrals():
    directory = os.path.join(EVALUATIONS, "14N")
    listed = integrals.frozen(directory)
    assert {"output/intEC.dat", "output/intEC.extrap", "output/fine-intEC.extrap"} <= set(listed)
    assert all(p + ".sig" in listed for p in ("output/intEC.dat", "output/intEC.extrap"))
    assert integrals.problems(directory) == []


def test_14N_calculates_the_published_curves(tmp_path):
    """Data, extrapolations and the plots' extended grid, each by the engine's
    own path, in this one process (after any other model), to RTOL."""
    pyazr = pytest.importorskip("pyazr")
    from app import engine

    directory = _copy(tmp_path)
    azr_path = os.path.join(directory, "14N.azr")
    before = {p: integrals._sha256(os.path.join(directory, p))
              for p in integrals.frozen(directory)}
    seg, line = _total_capture_indices(azr_path)
    azr = engine._open(azr_path, directory)
    try:
        params = np.asarray(azr.params, dtype=np.float64)
        _, sfactor = engine._dispatch(azr, "data", params)
        for i, value in TOTAL_DATA:
            assert sfactor[seg][i] == pytest.approx(value, rel=RTOL)
        # the site's χ² of that segment (the page's; serializers) is the
        # engine's residuals' -- the same as AZURE2's own split of chi-squared
        assert azr.segment_chi2()[seg] == pytest.approx(TOTAL_DATA_CHI2, rel=RTOL)

        state = {}
        energies, _, _, extrap = engine.extrap_curves(state, azr_path, directory, params)
        for i, e, value in TOTAL_EXTRAPOLATION:
            assert energies[line][i] == pytest.approx(e, rel=RTOL)
            assert extrap[line][i] == pytest.approx(value, rel=RTOL)

        fine_state = {}
        index, e, _, f, _, _ = engine.fine_curves(fine_state, azr_path, directory, params)
        curve = index[seg]
        for i, energy, value in TOTAL_FINE:
            assert e[curve][i] == pytest.approx(energy, rel=RTOL)
            assert f[curve][i] == pytest.approx(value, rel=RTOL)
        for s in (state, fine_state):
            if s.get("model") is not None:
                s["model"].close()
    finally:
        azr.close()
    # nothing rewrote them
    assert {p: integrals._sha256(os.path.join(directory, p)) for p in before} == before


def test_a_regenerated_file_is_refused(tmp_path):
    pytest.importorskip("pyazr")
    from app import engine

    directory = _copy(tmp_path)
    with open(os.path.join(directory, "output", "intEC.dat"), "a") as f:
        f.write("(0,0)\n")
    with pytest.raises(integrals.FrozenIntegralsError):
        engine._open(os.path.join(directory, "14N.azr"), directory)


def test_a_recalculation_is_undone_and_refused(tmp_path):
    """A .sig that no longer matches makes AZURE2 recalculate: the files are
    put back and the build fails."""
    pytest.importorskip("pyazr")
    from app import engine

    directory = _copy(tmp_path)
    sig = os.path.join(directory, "output", "intEC.dat.sig")
    with open(sig) as f:
        text = f.read()
    with open(sig, "w") as f:
        f.write(text.replace("AZURE2-EC-SIGNATURE 1 ", "AZURE2-EC-SIGNATURE 1 0"))
    # the list says what the files must be: this one now differs
    assert integrals.problems(directory) == ["output/intEC.dat.sig differs from the hash in output/FROZEN"]
    listed = integrals.frozen(directory)
    marker = os.path.join(directory, integrals.MARKER)
    with open(marker) as f:
        lines = f.read()
    with open(marker, "w") as f:
        f.write(lines.replace(listed["output/intEC.dat.sig"], integrals._sha256(sig)))
    data = os.path.join(directory, "output", "intEC.dat")
    digest = integrals._sha256(data)
    with pytest.raises(integrals.FrozenIntegralsError):
        engine._open(os.path.join(directory, "14N.azr"), directory)
    assert integrals._sha256(data) == digest
    assert integrals.problems(directory) == []


def test_seed_found_by_name_outside_the_evaluation(tmp_path, monkeypatch):
    """A read-only evaluation directory: the derived model is built in a
    temporary directory of the same name (fine.workdir_for), and is still
    seeded and guarded."""
    pytest.importorskip("pyazr")
    from app import engine, fine

    directory = _copy(tmp_path)
    azr_path = os.path.join(directory, "14N.azr")
    seg, _ = _total_capture_indices(azr_path)
    elsewhere = tmp_path / "private" / "fine"
    elsewhere.mkdir(parents=True)
    monkeypatch.setattr(fine, "workdir_for", lambda cwd, name="fine": str(tmp_path / "private" / name))
    azr = engine._open(azr_path, directory)
    try:
        state = {}
        index, e, _, f, _, _ = engine.fine_curves(state, azr_path, directory,
                                                  np.asarray(azr.params, dtype=np.float64))
        for i, energy, value in TOTAL_FINE:
            assert f[index[seg]][i] == pytest.approx(value, rel=RTOL)
        state["model"].close()
    finally:
        azr.close()


def test_derived_model_without_seed_is_refused(tmp_path, monkeypatch):
    """A derived model of a frozen evaluation with no seed would calculate
    its integrals: the build fails, and what it wrote is removed."""
    pytest.importorskip("pyazr")
    from app import engine, fine

    directory = _copy(tmp_path)
    azr_path = os.path.join(directory, "14N.azr")
    other = tmp_path / "private" / "unseeded"
    other.mkdir(parents=True)
    monkeypatch.setattr(fine, "workdir_for", lambda cwd, name="fine": str(other))
    with pytest.raises(integrals.FrozenIntegralsError):
        engine.fine_model({}, azr_path, directory)
    assert not [n for n in os.listdir(other / "output") if n.startswith("intEC")]


def test_frozen_list_takes_sha256sum_output(tmp_path):
    marker = tmp_path / "output" / "FROZEN"
    marker.parent.mkdir()
    marker.write_text("# comment\n" + "AB" * 32 + " *output/intEC.dat\n"
                      + "cd" * 32 + "\toutput/intEC.dat.sig\n")
    assert integrals.frozen(str(tmp_path)) == {"output/intEC.dat": "ab" * 32,
                                               "output/intEC.dat.sig": "cd" * 32}
