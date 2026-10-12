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


def test_derived_model_21Na(tmp_path):
    pytest.importorskip("pyazr")
    from pyazr.datasets import SegmentSet

    directory = os.path.join(EVALUATIONS, "21Na")
    azr = os.path.join(directory, "21Na.azr")
    segments = SegmentSet.from_file(azr)
    path, index = fine.derived_model(azr, directory, segments, str(tmp_path))
    assert path and os.path.exists(path)
    assert len(index) == len(segments)
    text = open(path).read()
    block = re.search(r"<segmentsTest>\n(.*?)</segmentsTest>", text, re.S).group(1)
    lines = [l for l in block.splitlines() if l.strip()]
    assert len(lines) == sum(len(i["slots"]) for i in index if i is not None)
    # Lyons (segment 5): differential, at the 90 degrees of its data points,
    # although the segment's own limits read 0-180.
    assert index[4]["axis"] == "energy"
    lyons = lines[index[4]["slots"][0]].split()
    assert lyons[6] == lyons[7] == "90" and lyons[9] == "1"
    # The evaluation's own output directory is left alone.
    assert str(tmp_path) in text
    # The data segments, and so the parameter vector, are unchanged.
    original = open(azr).read()
    data = re.compile(r"<segmentsData>.*?</segmentsData>", re.S)
    assert data.search(text).group(0) == data.search(original).group(0)


def test_total_capture_is_split_per_capture_pair(tmp_path):
    """17F: a total capture is drawn as one line per capture pair (summed),
    never as AZURE2's own total capture, whose component integrals are
    unreliable once output/intEC.dat exists (app.fine.summed)."""
    pytest.importorskip("pyazr")
    from pyazr.datasets import SegmentSet, TestSegmentSet

    directory = os.path.join(EVALUATIONS, "17F")
    azr = os.path.join(directory, "17F.azr")
    segments = SegmentSet.from_file(azr)
    captures = fine.capture_keys(azr)
    assert captures == [2, 3]
    assert fine.summed(segments, captures)
    path, index = fine.derived_model(azr, directory, segments, str(tmp_path))
    total = index[0]
    assert total["axis"] == "energy" and len(total["slots"]) == 2
    block = re.search(r"<segmentsTest>\n(.*?)</segmentsTest>", open(path).read(), re.S).group(1)
    lines = [l.split() for l in block.splitlines() if l.strip()]
    assert [lines[k][2] for k in total["slots"]] == ["2", "3"]
    assert all(lines[k][9] == "0" for k in total["slots"])


def test_extrap_model_drops_inactive_and_splits(tmp_path):
    pytest.importorskip("pyazr")
    from pyazr.datasets import TestSegmentSet

    azr = os.path.join(EVALUATIONS, "7Be", "7Be.azr")
    tests = TestSegmentSet.from_file(azr)
    captures = fine.capture_keys(azr)
    path, slots = fine.extrap_model(azr, str(tmp_path), captures)
    assert len(slots) == sum(t.active for t in tests)
    # The last two active lines are the total captures: one line per pair.
    assert [len(g) for g in slots[-2:]] == [len(captures)] * 2


def test_angular_distribution_gets_an_angle_grid(tmp_path):
    pytest.importorskip("pyazr")
    from pyazr.datasets import SegmentSet

    directory = os.path.join(EVALUATIONS, "7Be")
    azr = os.path.join(directory, "7Be.azr")
    segments = SegmentSet.from_file(azr)
    planned = fine.plan(azr, directory, segments)
    angular = [p for p in planned if p is not None and p[1] == "angle"]
    assert angular, "the Elwyn angular distributions should be planned"
    t = angular[0][0][0].split()
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
                    ignore=shutil.ignore_patterns("output", "fine", "extrap", "datamodel", "precomputed.json"))
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
        planned = fine.plan(azr, directory, SegmentSet.from_file(azr))
        total = planned[0][0]
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
