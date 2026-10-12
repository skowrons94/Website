"""The fine-grid model (app.fine): what is planned, and when it is trusted."""

import os
import re

import pytest

from app import fine

HERE = os.path.dirname(os.path.abspath(__file__))
EVALUATIONS = os.path.join(HERE, "..", "evaluations")


def test_agrees_and_merge():
    grid_x = [0.0, 1.0, 2.0, 3.0]
    grid_y = [0.0, 1.0, 2.0, 3.0]
    assert fine.agrees(grid_x, grid_y, [0.5, 1.5, 2.5], [0.5, 1.5, 2.5])
    # A systematic difference (a folded segment) is refused.
    assert not fine.agrees(grid_x, grid_y, [0.5, 1.5, 2.5], [0.6, 1.8, 3.0])
    # Nothing to compare with: refused.
    assert not fine.agrees(grid_x, grid_y, [5.0], [5.0])
    xs, ys = fine.merge(grid_x, grid_y, [1.5], [9.0])
    assert xs == [0.0, 1.0, 1.5, 2.0, 3.0] and ys[2] == 9.0


def _lines(path):
    block = re.search(r"<segmentsTest>\n(.*?)</segmentsTest>", open(path).read(), re.S).group(1)
    return [l.split() for l in block.splitlines() if l.strip()]


def test_derived_model_21Na(tmp_path):
    pytest.importorskip("pyazr")
    from pyazr.datasets import SegmentSet

    directory = os.path.join(EVALUATIONS, "21Na")
    azr = os.path.join(directory, "21Na.azr")
    segments = SegmentSet.from_file(azr)
    path, calcs, index = fine.derived_model(azr, directory, segments, str(tmp_path))
    assert path and os.path.exists(path)
    assert len(index) == len(segments)
    lines = _lines(path)
    assert len(lines) == sum(len(p) for c in calcs for p in c["pieces"])
    # Lyons (segment 5): differential, at the 90 degrees of its data points,
    # although the segment's own limits read 0-180.
    lyons = calcs[index[4]]
    assert lyons["axis"] == "energy"
    for piece in lyons["pieces"]:
        t = lines[piece[0]]
        assert t[6] == t[7] == "90" and t[9] == "1"
    # The evaluation's own output directory is left alone.
    text = open(path).read()
    assert str(tmp_path) in text
    # The data segments, and so the parameter vector, are unchanged.
    original = open(azr).read()
    data = re.compile(r"<segmentsData>.*?</segmentsData>", re.S)
    assert data.search(text).group(0) == data.search(original).group(0)


def test_segments_of_one_calculation_share_it():
    """⁷Be: 120 datasets, fewer distinct curves; two segments measuring the
    same thing get the same calculation, different angles different ones."""
    pytest.importorskip("pyazr")
    from pyazr.datasets import SegmentSet

    directory = os.path.join(EVALUATIONS, "7Be")
    azr = os.path.join(directory, "7Be.azr")
    segments = SegmentSet.from_file(azr)
    calcs, index = fine.plan(azr, directory, segments)
    drawn = [j for j in index if j is not None]
    assert len(calcs) < len(drawn)
    assert sorted(set(drawn)) == list(range(len(calcs)))


def _points(lines):
    """The lab energies a set of test lines asks AZURE2 for."""
    out = []
    for t in lines:
        a, b, step = float(t[3]), float(t[4]), float(t[5])
        e = a
        while e <= b + 1e-12:
            out.append(e)
            e += step
    return sorted(out)


def test_extended_grid_13N():
    """¹²C(p,γ): the grid covers the data, reaches down towards the Gamow
    peak (never below 10 keV) and 15% above, and is dense at the 0.42 MeV
    resonance."""
    pytest.importorskip("pyazr")
    from pyazr.datasets import SegmentSet

    directory = os.path.join(EVALUATIONS, "13N")
    azr = os.path.join(directory, "13N.azr")
    segments = SegmentSet.from_file(azr)
    calcs, index = fine.plan(azr, directory, segments)
    pairs = fine.model_pairs(azr)
    factor = pairs[1]["M2"] / (pairs[1]["M1"] + pairs[1]["M2"])
    for i, segment in enumerate(segments):
        if segment.observable != "angle-integrated" or index[i] is None:
            continue
        energies, _ = fine._data_points(directory, segment)
        lab = _points([line.split() for piece in calcs[index[i]]["pieces"] for line in piece])
        assert lab[0] <= min(energies) and lab[-1] >= max(energies) * 1.14
        cm = [e * factor for e in lab]
        assert 0.010 <= cm[0] <= min(energies) * factor / 2.9
        # Resonance refinement: E_R = E_x - S_p, several points within ±Γ/2.
        resonances = [(ex - pairs[1]["threshold"], g) for ex, g in fine.model_levels(azr)]
        e_r, width = min((r for r in resonances if 0.3 < r[0] < 0.5), key=lambda r: abs(r[0] - 0.42))
        near = [e for e in cm if abs(e - e_r) <= width / 2]
        assert len(near) >= 10
        # The data range is covered as densely as the old fine grid.
        union = [e for k, other in enumerate(segments) if index[k] == index[i]
                 for e in fine._data_points(directory, other)[0]]
        inside = [e for e in lab if min(union) <= e <= max(union)]
        assert len(inside) >= fine.DATA_POINTS


def test_extended_range_rules():
    pairs = {1: {"Z1": 2, "Z2": 2, "M1": 3.016, "M2": 4.0026, "threshold": 1.586, "photon": False},
             2: {"Z1": 1, "Z2": 3, "M1": 1.008, "M2": 6.015, "threshold": 5.606, "photon": False},
             4: {"Z1": 0, "Z2": 4, "M1": 0, "M2": 7, "threshold": 0.0, "photon": True}}
    # Capture: down to the Gamow peak at T9 = 0.01, not below 10 keV.
    lo, hi = fine.extended_range(1, 4, 0.09, 3.0, pairs)
    assert lo == pytest.approx(max(0.010, min(0.03, fine.gamow_peak(pairs[1], 0.01))))
    assert hi == pytest.approx(3.45)
    # A closed channel (Q < 0): never below where it opens.
    lo, _ = fine.extended_range(1, 2, 4.5, 6.0, pairs)
    assert lo > 5.606 - 1.586
    # Elastic: a third of the lowest energy.
    lo, _ = fine.extended_range(1, 1, 0.9, 3.0, pairs)
    assert lo == pytest.approx(0.3)


def test_total_capture_is_split_per_capture_pair(tmp_path):
    """17F: a total capture is drawn as one line per capture pair (summed
    within every piece of the grid), never as AZURE2's own total capture,
    whose component integrals are unreliable once output/intEC.dat exists
    (app.fine.summed)."""
    pytest.importorskip("pyazr")
    from pyazr.datasets import SegmentSet

    directory = os.path.join(EVALUATIONS, "17F")
    azr = os.path.join(directory, "17F.azr")
    segments = SegmentSet.from_file(azr)
    captures = fine.capture_keys(azr)
    assert captures == [2, 3]
    assert fine.summed(segments, captures)
    path, calcs, index = fine.derived_model(azr, directory, segments, str(tmp_path))
    total = calcs[index[0]]
    assert total["axis"] == "energy"
    lines = _lines(path)
    for piece in total["pieces"]:
        assert [lines[k][2] for k in piece] == ["2", "3"]
        assert all(lines[k][9] == "0" for k in piece)


def test_join_pieces():
    import numpy as np
    mu = [np.array([1.0, 2.0]), np.array([10.0, 20.0]), np.array([3.0, 4.0])]
    energies = [np.array([0.1, 0.2]), np.array([0.1, 0.2]), np.array([0.2, 0.3])]
    angles = [np.zeros(2)] * 3
    e, m, f, a = fine.join_pieces([[0, 1], [2]], "energy", mu, mu, energies, angles)
    assert list(e) == [0.1, 0.2, 0.3]
    assert list(m) == [11.0, 22.0, 4.0]


def test_extrap_model_drops_inactive_and_splits(tmp_path):
    pytest.importorskip("pyazr")
    from pyazr.datasets import TestSegmentSet

    azr = os.path.join(EVALUATIONS, "7Be", "7Be.azr")
    tests = TestSegmentSet.from_file(azr)
    captures = fine.capture_keys(azr)
    path, plan = fine.extrap_model(azr, str(tmp_path), captures)
    assert len(plan) == sum(t.active for t in tests)
    # The last two active lines are the total captures: one line per pair,
    # on their own grid (one piece).
    assert [len(p) for p in plan[-2:]] == [1, 1]
    assert [len(p[0]) for p in plan[-2:]] == [len(captures)] * 2


def test_angular_distribution_gets_an_angle_grid(tmp_path):
    pytest.importorskip("pyazr")
    from pyazr.datasets import SegmentSet

    directory = os.path.join(EVALUATIONS, "7Be")
    azr = os.path.join(directory, "7Be.azr")
    segments = SegmentSet.from_file(azr)
    calcs, _ = fine.plan(azr, directory, segments)
    angular = [c for c in calcs if c["axis"] == "angle"]
    assert angular, "the Elwyn angular distributions should be planned"
    t = angular[0]["pieces"][0][0].split()
    assert t[3] == t[4] and float(t[7]) > float(t[6])


def test_split_data_model_keeps_keys_and_parameters(tmp_path):
    """17F: the total capture is written out per capture pair, appended after
    every other segment with a fixed normalisation, and target-effect ranges
    no longer reach the appended lines."""
    pytest.importorskip("pyazr")
    azr = os.path.join(EVALUATIONS, "17F", "17F.azr")
    path, groups = fine.split_data_model(azr, str(tmp_path), fine.capture_keys(azr))
    assert groups[0] == [0, 6] and groups[1:] == [[k] for k in range(1, 6)]
    text = open(path).read()
    block = re.search(r"<segmentsData>\n(.*?)</segmentsData>", text, re.S).group(1)
    lines = [l.split() for l in block.splitlines() if l.strip()]
    assert len(lines) == 7
    assert lines[0][2] == "2" and lines[0][7] == "0" and lines[0][9] == "1"
    assert lines[6][2] == "3" and lines[6][7] == "0" and lines[6][9] == "0"
    target = re.search(r"<targetInt>\n(.*?)</targetInt>", text, re.S).group(1)
    assert '"4,5,6"' in target and "7" not in target.split('"')[1]


def _copy(name, tmp_path, flag):
    """An evaluation copied with ``split_total_capture`` set to ``flag``."""
    import json
    import shutil
    target = tmp_path / name
    shutil.copytree(os.path.join(EVALUATIONS, name), target,
                    ignore=shutil.ignore_patterns("output", "fine", "extrap", "extrapolations", "datamodel", "precomputed.json"))
    info = json.loads((target / "info.json").read_text())
    if flag is None:
        info.pop(fine.FLAG, None)
    else:
        info[fine.FLAG] = flag
    (target / "info.json").write_text(json.dumps(info))
    return str(target)


def test_split_is_opt_in(tmp_path):
    """Without the flag a total capture is planned as AZURE2's own (one
    code-4 line), exactly as before; with it, one line per capture pair."""
    pytest.importorskip("pyazr")
    from pyazr.datasets import SegmentSet

    off = _copy("17F", tmp_path / "off", None)
    on = _copy("17F", tmp_path / "on", True)
    assert not fine.split_enabled(off) and fine.split_enabled(on)
    for directory, lines in ((off, 1), (on, 2)):
        azr = os.path.join(directory, "17F.azr")
        calcs, index = fine.plan(azr, directory, SegmentSet.from_file(azr))
        total = calcs[index[0]]["pieces"][0]
        assert len(total) == lines
        if lines == 1:
            t = total[0].split()
            assert t[2] == "-1" and t[9] == "4"


def test_flag_changes_the_cache_key(tmp_path):
    from app import cache
    off = _copy("17F", tmp_path / "off", False)
    on = _copy("17F", tmp_path / "on", True)
    assert cache.fingerprint(off) != cache.fingerprint(on)


def test_shipped_flags():
    """Opted in where the split reproduces the data; 14N stays as published."""
    for name, expected in (("17F", True), ("7Be", True), ("23Na", True), ("14N", False)):
        assert fine.split_enabled(os.path.join(EVALUATIONS, name)) is expected


def test_engine_paths_17F(tmp_path):
    """The two calculations of 17F's total capture (Hester): flag off gives
    AZURE2 as shipped (ground-state transition only, ~0.5 keV b), flag on
    the sum over both capture pairs (~7.4 keV b, what the data show)."""
    pytest.importorskip("pyazr")
    import shutil
    import numpy as np
    import pyazr
    from app.engine import _dispatch

    results = {}
    for flag in (False, True):
        directory = _copy("17F", tmp_path / str(flag), flag)
        shutil.copytree(os.path.join(EVALUATIONS, "17F", "output"), os.path.join(directory, "output"))
        os.makedirs(os.path.join(directory, "checks"), exist_ok=True)
        azr = pyazr.azure2(os.path.join(directory, "17F.azr"), cwd=directory)
        try:
            params = np.asarray(azr.params, dtype=np.float64)
            _, sfactor = _dispatch(azr, "data", params)
            results[flag] = float(sfactor[0][0]) * 1e3
        finally:
            for model in (getattr(azr, "_data_state", {}).get("model"), azr):
                if model is not None:
                    model.close()
    assert results[False] == pytest.approx(0.48, rel=0.05)
    assert results[True] == pytest.approx(7.40, rel=0.02)
