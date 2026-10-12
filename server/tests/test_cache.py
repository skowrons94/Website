"""app.cache: results at an evaluation's own parameters, kept on disk."""

import os

import numpy as np

from app import cache


def _model(tmp_path):
    (tmp_path / "m.azr").write_text("model v1\n")
    (tmp_path / "data").mkdir()
    (tmp_path / "data" / "a.dat").write_text("1 2 3\n")
    return str(tmp_path)


def test_round_trip(tmp_path):
    d = _model(tmp_path)
    params = [1.0, 2.5]
    value = ([np.array([1.0, np.nan, 3.0])], [np.array([4.0, 5.0])])
    cache.write(d, params, "data", value)
    got = cache.read(d, params, "data")
    assert got is not None
    np.testing.assert_array_equal(got[0][0], value[0][0])
    np.testing.assert_array_equal(got[1][0], value[1][0])
    assert cache.read(d, params, "extrap") is None


def test_other_parameters_miss(tmp_path):
    d = _model(tmp_path)
    cache.write(d, [1.0], "data", ([np.zeros(2)], [np.zeros(2)]))
    assert cache.read(d, [1.0000001], "data") is None


def test_edited_model_misses(tmp_path):
    d = _model(tmp_path)
    cache.write(d, [1.0], "data", ([np.zeros(2)], [np.zeros(2)]))
    (tmp_path / "data" / "a.dat").write_text("1 2 4\n")
    assert cache.read(d, [1.0], "data") is None


def test_keys_accumulate_for_the_same_parameters(tmp_path):
    d = _model(tmp_path)
    cache.write(d, [1.0], "data", ([np.ones(1)], [np.ones(1)]))
    cache.write(d, [1.0], "extrap", ([np.ones(1)],) * 4)
    assert cache.read(d, [1.0], "data") is not None
    assert cache.read(d, [1.0], "extrap") is not None


def test_unwritable_directory_is_not_an_error(tmp_path):
    d = _model(tmp_path)
    os.chmod(d, 0o555)
    try:
        cache.write(d, [1.0], "data", ([np.zeros(1)], [np.zeros(1)]))
    finally:
        os.chmod(d, 0o755)
