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
    assert len(lines) == sum(i is not None for i in index)
    # Lyons (segment 5): differential, at the 90 degrees of its data points,
    # although the segment's own limits read 0-180.
    lyons = lines[index[4]].split()
    assert lyons[6] == lyons[7] == "90" and lyons[9] == "1"
    # The evaluation's own output directory is left alone.
    assert str(tmp_path) in text
    # The data segments, and so the parameter vector, are unchanged.
    original = open(azr).read()
    data = re.compile(r"<segmentsData>.*?</segmentsData>", re.S)
    assert data.search(text).group(0) == data.search(original).group(0)
