"""Sessions, routes and payloads with a stand-in engine (no AZURE2 needed):
per-role locks, latest-wins edits, the cache under tiny float differences,
503 when every slot is busy, heartbeats, rounding and gzip."""

import gzip
import json
import math
import threading
import time
from types import SimpleNamespace

import numpy as np
import pytest

from app import cache, serializers
from app import session as session_module
from app.engine import ModelInfo
from app.evaluations import Evaluation


class FakeEngine:
    """:class:`app.engine.Engine`'s interface, with timed sleeps for work."""

    delays = {"data": 0.0, "fine": 0.0, "extrap": 0.0, "prepare": {}}
    calls = []

    def __init__(self, azr_path, cwd, omp_threads=None, timeout=None, **_):
        self.info = ModelInfo(
            params=[1.0, 2.0, 3.0], parameters=None, pairs=[],
            scheme=SimpleNamespace(levels=[]), datasets=[], extrapolations=[],
            energies=[], angles=[], cross=[], cross_err=[], sfactor=[], sfactor_err=[])
        self._alive = True
        self._roles = set()
        self.built = set()

    def _work(self, what, seconds, params=None):
        FakeEngine.calls.append((what, tuple(params) if params is not None else None,
                                 time.time()))
        time.sleep(seconds)

    def calculate_data(self, params):
        self._work("data", self.delays["data"], params)
        return ([np.array(params, dtype=float)], [np.array(params, dtype=float)])

    def calculate_fine(self, params):
        self._roles.add("fine")
        self._work("fine", self.delays["fine"], params)
        return ([], [], [], [], [], [])

    def calculate_extrapolations(self, params):
        self._roles.add("extrap")
        self._work("extrap", self.delays["extrap"], params)
        return ([], [], [], [])

    def calculate_grid(self, params):
        self._roles.add("grid")
        return ([], [], [], [], [])

    def prepare(self, step):
        if step != "data":
            self._roles.add(step)
        self._work(f"prepare_{step}", self.delays["prepare"].get(step, 0.0))
        self.built.add(step)
        return True

    def fine_ready(self):
        return "fine" in self.built

    def has_role(self, role):
        return role == "data" or role in self._roles

    def close_role(self, role):
        self._roles.discard(role)

    def is_alive(self):
        return self._alive

    def close(self):
        self._alive = False

    pid = None


@pytest.fixture
def fake(monkeypatch, tmp_path):
    monkeypatch.setattr(session_module, "Engine", FakeEngine)
    FakeEngine.delays = {"data": 0.0, "fine": 0.0, "extrap": 0.0, "prepare": {}}
    FakeEngine.calls = []
    (tmp_path / "m.azr").write_text("model\n")
    evaluation = Evaluation(id="X", path=str(tmp_path),
                            azr_path=str(tmp_path / "m.azr"), title="X", channels=[])
    return evaluation


@pytest.fixture
def client(fake, monkeypatch):
    from flask import Flask
    from app import evaluations as evaluations_module
    from app import install_gzip
    from app.routes import bp

    monkeypatch.setattr(evaluations_module, "get", lambda root, eid: fake)
    app = Flask("test")
    app.config.update(EVALUATIONS_DIR=fake.path)
    manager = session_module.SessionManager(ttl=600, max_sessions=1, retry_after=7)
    app.extensions["sessions"] = manager
    app.register_blueprint(bp)
    install_gzip(app)
    yield app.test_client(), manager
    manager.close_all()


# -- per-role locks -------------------------------------------------------------

def test_edit_completes_while_extrap_is_prepared(fake):
    """An edit needs the data worker only: a long preparation of the
    extrapolations' model (another worker) must not hold it up."""
    FakeEngine.delays.update(data=0.05, prepare={"extrap": 2.0})
    session = session_module.Session("s", fake)
    try:
        preparing = threading.Thread(target=session.prepare, args=("extrap",))
        preparing.start()
        time.sleep(0.2)
        assert session.preparing == "extrap"
        t = time.time()
        gen = session.begin_edit({0: 5.0})
        result, superseded = session.edit(gen, lambda p: session.calculate_data(p))
        elapsed = time.time() - t
        assert not superseded
        assert elapsed < 0.5, elapsed
        assert list(result[0][0]) == [5.0, 2.0, 3.0]
        assert preparing.is_alive()          # still building
        preparing.join()
        assert "extrap" in session.prepared
    finally:
        session.close()


def test_background_preparation_gives_way_to_edits(fake):
    FakeEngine.delays.update(data=0.3)
    session = session_module.Session("s", fake)
    try:
        gen = session.begin_edit({1: 4.0})
        editing = threading.Thread(target=session.edit,
                                   args=(gen, lambda p: session.calculate_data(p)))
        editing.start()
        time.sleep(0.05)
        session.prepare_all(("fine",), quiet=0.05)
        editing.join()
        order = [c[0] for c in FakeEngine.calls]
        assert order.index("data") < order.index("prepare_fine")
    finally:
        session.close()


def test_fine_not_ready_while_its_model_is_built(fake):
    FakeEngine.delays.update(prepare={"fine": 1.0})
    session = session_module.Session("s", fake)
    try:
        session.set_parameters({0: 9.0})
        t = threading.Thread(target=session.prepare, args=("fine",))
        t.start()
        time.sleep(0.1)
        assert not session.fine_ready()
        t.join()
        assert session.fine_ready()
    finally:
        session.close()


# -- latest wins ----------------------------------------------------------------

def test_stale_queued_edit_is_not_calculated(fake):
    FakeEngine.delays.update(data=0.4)
    session = session_module.Session("s", fake)
    results = {}
    try:
        def run(name, value, delay):
            time.sleep(delay)
            gen = session.begin_edit({0: value})
            results[name] = session.edit(gen, lambda p: session.calculate_data(p))

        threads = [threading.Thread(target=run, args=(n, v, d))
                   for n, v, d in (("a", 10.0, 0.0), ("b", 20.0, 0.1), ("c", 30.0, 0.2))]
        for t in threads:
            t.start()
        for t in threads:
            t.join()
        calculated = [c[1][0] for c in FakeEngine.calls if c[0] == "data"]
        assert calculated == [10.0, 30.0]                 # b never ran
        assert results["b"][1] is True                    # superseded ...
        assert list(results["b"][0][0][0]) == [30.0, 2.0, 3.0]   # ... answered with c
        assert results["c"][1] is False
    finally:
        session.close()


def test_superseded_route_status_and_skip(client):
    c, manager = client
    FakeEngine.delays.update(data=0.4)
    sid = c.post("/api/evaluations/X/open").get_json()["session_id"]
    out = {}

    def edit(name, value, delay, body=None):
        time.sleep(delay)
        r = c.post(f"/api/sessions/{sid}/parameters",
                   json={"updates": {"0": value}, **(body or {})})
        out[name] = (r.status_code, r.get_json())

    threads = [threading.Thread(target=edit, args=a) for a in
               (("a", 1.5, 0.0), ("b", 2.5, 0.1, {"on_superseded": "skip"}), ("c", 3.5, 0.2))]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert out["b"][0] == 200
    assert out["b"][1]["superseded"] is True
    assert "data" not in out["b"][1]
    assert out["c"][1]["generation"] == 3
    assert out["c"][1]["scheme"]["n_free"] == 3


def test_out_of_order_seq_is_ignored(fake):
    session = session_module.Session("s", fake)
    try:
        session.begin_edit({0: 5.0}, seq=2)
        assert session.begin_edit({0: 4.0}, seq=1) == -1
        assert session.snapshot()[0] == 5.0
    finally:
        session.close()


# -- the cache under tiny float differences -------------------------------------------

def test_cache_matches_unedited_params_by_fingerprint(tmp_path):
    (tmp_path / "m.azr").write_text("model\n")
    d = str(tmp_path)
    native = [15353.7, -7848.5302, 1.0]
    cache.write(d, native, "data", ([np.ones(2)], [np.ones(2)]))
    # The WebAssembly engine reads the same file a few ulps -- or 5e-8 -- away.
    wasm = [15353.699999999675, -7848.5298, 1.0]
    assert cache.read(d, wasm, "data") is None
    assert cache.read(d, wasm, "data", unedited=True) is not None
    # A JSON round trip (1e-12) is the same vector even for an edited one.
    assert cache.read(d, [v * (1 + 1e-12) for v in native], "data") is not None
    # An edit is not.
    assert cache.read(d, [15353.7, -7848.5302, 1.001], "data") is None
    # A fill from the WebAssembly side keeps the native entries.
    cache.write(d, wasm, "grid", ([], [], [], [], []), unedited=True)
    assert cache.read(d, native, "data") is not None
    assert cache.read(d, wasm, "grid", unedited=True) is not None


def test_cache_reads_memoised_until_the_file_changes(tmp_path):
    (tmp_path / "m.azr").write_text("model\n")
    d = str(tmp_path)
    cache.write(d, [1.0], "data", ([np.ones(1)], [np.ones(1)]))
    first = cache.read(d, [1.0], "data")
    assert cache.read(d, [1.0], "data") is first
    time.sleep(0.01)
    cache.write(d, [1.0], "data", ([np.zeros(1)], [np.zeros(1)]))
    assert cache.read(d, [1.0], "data")[0][0][0] == 0.0


def test_session_uses_cache_when_unedited(fake):
    session = session_module.Session("s", fake)
    try:
        cache.write(fake.path, [1.0 + 1e-13, 2.0, 3.0], "data",
                    ([np.full(3, 7.0)], [np.full(3, 7.0)]))
        assert session.peek("data")[0][0][0] == 7.0
        assert not any(c[0] == "data" for c in FakeEngine.calls)
    finally:
        session.close()


# -- capacity ------------------------------------------------------------------------

def test_503_when_every_slot_is_busy(client):
    c, manager = client
    FakeEngine.delays.update(data=1.0)
    sid = c.post("/api/evaluations/X/open").get_json()["session_id"]
    busy = threading.Thread(target=c.post, args=(f"/api/sessions/{sid}/parameters",),
                            kwargs={"json": {"updates": {"0": 2.0}}})
    busy.start()
    time.sleep(0.2)
    t = time.time()
    r = c.post("/api/evaluations/X/open")
    assert time.time() - t < 0.5
    assert r.status_code == 503
    assert r.headers["Retry-After"] == "7"
    assert r.get_json()["code"] == "busy"
    busy.join()
    # Idle, but used a moment ago: still protected (the page is open).
    assert c.post("/api/evaluations/X/open").status_code == 503
    # Unseen for evict_after seconds: the next visitor evicts it.
    manager.evict_after = 0.2
    time.sleep(0.3)
    r = c.post("/api/evaluations/X/open")
    assert r.status_code == 201
    assert c.get(f"/api/sessions/{sid}/status").status_code == 409


def test_heartbeat_ttl(fake):
    manager = session_module.SessionManager(ttl=600, heartbeat_ttl=0.2, max_sessions=4)
    try:
        quiet = manager.create(fake)
        pinging = manager.create(fake)
        pinging.ping()
        time.sleep(0.3)
        assert manager.reap() == 1
        assert pinging.closed and not quiet.closed
    finally:
        manager.close_all()


def test_idle_extrap_worker_closed_first(fake):
    manager = session_module.SessionManager(ttl=600, role_ttl=0.1, max_sessions=4)
    try:
        session = manager.create(fake)
        session.calculate_extrapolations([2.0, 2.0, 2.0])
        assert session.engine.has_role("extrap")
        time.sleep(0.2)
        manager.reap()
        assert not session.engine.has_role("extrap") and not session.closed
    finally:
        manager.close_all()


# -- payloads --------------------------------------------------------------------------

def test_floats_rounded_to_seven_digits():
    out = serializers._floats(np.array([1.2345678912345, -0.000123456789123,
                                        15353.699999999675, math.nan, math.inf, 0.0]))
    assert out == [1.234568, -0.0001234568, 15353.7, None, None, 0.0]
    assert serializers._floats([1.2345678912345], None) == [1.2345678912345]
    assert len(json.dumps(serializers._floats(np.random.rand(1000) * 1e3))) < 11000


def test_compact_fills_constant_arrays():
    payload = [{"angles": [0.0] * 5, "energies": [1.0, 2.0], "name": "x",
                "calculated": [None, None]}]
    assert serializers.compact(payload) == [
        {"angles": {"fill": 0.0, "n": 5}, "energies": [1.0, 2.0], "name": "x",
         "calculated": {"fill": None, "n": 2}}]


def test_gzip_when_accepted(client):
    c, _ = client
    sid = c.post("/api/evaluations/X/open").get_json()["session_id"]
    big = c.get(f"/api/sessions/{sid}/status")
    assert "Content-Encoding" not in big.headers           # small: left alone
    from flask import Flask, jsonify
    from app import install_gzip
    app = Flask("g")
    install_gzip(app)
    app.add_url_rule("/x", "x", lambda: jsonify(list(range(2000))))
    tc = app.test_client()
    r = tc.get("/x", headers={"Accept-Encoding": "gzip, deflate"})
    assert r.headers["Content-Encoding"] == "gzip"
    assert json.loads(gzip.decompress(r.data)) == list(range(2000))
    assert "Content-Encoding" not in tc.get("/x").headers


def test_ping_and_status(client):
    c, manager = client
    sid = c.post("/api/evaluations/X/open").get_json()["session_id"]
    r = c.post(f"/api/sessions/{sid}/ping")
    assert r.status_code == 200 and "prepared" in r.get_json()
    assert manager.get(sid).heartbeat


def test_spare_session_is_handed_over_prepared(fake):
    """A spare is opened and prepared before anyone asks, handed to the next
    visitor at the shipped parameters, and replaced afterwards."""
    FakeEngine.delays.update(prepare={"fine": 0.2})
    manager = session_module.SessionManager(max_sessions=4, spares={"X": 1}, spare_delay=0)
    try:
        manager.start_spares([fake])
        deadline = time.time() + 5
        while not manager._spare.get("X") and time.time() < deadline:
            time.sleep(0.05)
        spare = manager._spare["X"][0]
        assert {"data", "fine", "extrap"} <= spare.prepared
        t = time.time()
        session = manager.create(fake)
        assert time.time() - t < 0.2
        assert session is spare and not session.id.startswith("spare-")
        assert not session.is_modified
        assert manager.get(session.id) is session
        deadline = time.time() + 5
        while not manager._spare.get("X") and time.time() < deadline:
            time.sleep(0.05)
        assert manager._spare.get("X") and manager._spare["X"][0] is not session
    finally:
        manager.close_all()


def test_spare_of_another_evaluation_gives_way(fake):
    manager = session_module.SessionManager(max_sessions=1, spares={"Y": 1}, spare_delay=0)
    try:
        other = Evaluation(id="Y", path=fake.path, azr_path=fake.azr_path, title="Y", channels=[])
        manager.start_spares([other])
        deadline = time.time() + 5
        while not manager._spare.get("Y") and time.time() < deadline:
            time.sleep(0.05)
        spare = manager._spare["Y"][0]
        session = manager.create(fake)
        assert spare.closed and not session.closed
    finally:
        manager.close_all()


# -- eviction and spares: the visitor first ----------------------------------------

def _wait(predicate, timeout=5.0):
    deadline = time.time() + timeout
    while time.time() < deadline:
        if predicate():
            return True
        time.sleep(0.02)
    return False


def test_session_that_pinged_recently_is_not_evicted(fake):
    """A session whose page pinged a second ago is never closed to make room
    (r8: one was); the newcomer gets a 503 instead.  Once the page has been
    quiet for evict_after seconds (a hidden tab stops pinging) it can go,
    least recently seen first."""
    manager = session_module.SessionManager(max_sessions=2, evict_after=0.4)
    try:
        a = manager.create(fake)
        b = manager.create(fake)
        a.ping()
        b.ping()
        with pytest.raises(session_module.CapacityError):
            manager.create(fake)
        assert not a.closed and not b.closed
        time.sleep(0.5)
        b.ping()                              # b's page is still open
        c = manager.create(fake)
        assert a.closed and not b.closed and not c.closed
    finally:
        manager.close_all()


def test_visitor_takes_over_a_spare_being_built(fake):
    """A visitor arriving while the spare is still being prepared gets that
    session (its preparation goes on as theirs) instead of a second build
    competing with it for the cores."""
    FakeEngine.delays.update(prepare={"fine": 0.6})
    built = []
    real_init = FakeEngine.__init__

    def counting_init(self, *args, **kwargs):
        built.append(self)
        real_init(self, *args, **kwargs)
    FakeEngine.__init__ = counting_init
    manager = session_module.SessionManager(max_sessions=4, spares={"X": 1},
                                            spare_delay=0, spare_quiet=0.3)
    try:
        manager.start_spares([fake])
        assert _wait(lambda: any(r["session"] is not None
                                 for r in manager._wip.get("X", [])))
        session = manager.create(fake)
        assert session.from_spare and not session.id.startswith("spare-")
        assert len(built) == 1                 # no second build beside it
        assert manager.get(session.id) is session
        assert _wait(lambda: "extrap" in session.prepared)
        assert session.status()["from_spare"] is True
        # The replacement comes only once that preparation is over.
        assert _wait(lambda: manager._spare.get("X"))
        assert manager._spare["X"][0] is not session
        assert manager._pending == 0
    finally:
        FakeEngine.__init__ = real_init
        manager.close_all()


def test_spare_waits_for_visitor_preparation(fake):
    """A replacement spare is not built while a visitor's own model is being
    prepared, and one under way is paused meanwhile."""
    FakeEngine.delays.update(prepare={"fine": 0.8})
    manager = session_module.SessionManager(max_sessions=4, spares={"Y": 1},
                                            spare_delay=0, spare_quiet=0.2)
    paused = []
    real_pause = session_module.Session.pause
    session_module.Session.pause = lambda self: (paused.append(self.id), real_pause(self))
    try:
        visitor = manager.create(fake)                 # a cold session of X
        worker = threading.Thread(target=visitor.prepare_all, kwargs={"quiet": 0})
        worker.start()
        assert _wait(lambda: visitor.preparing == "fine")
        other = Evaluation(id="Y", path=fake.path, azr_path=fake.azr_path, title="Y",
                           channels=[])
        manager.start_spares([other])
        time.sleep(0.3)
        # The visitor is preparing: no spare has even been started.
        assert not manager._wip.get("Y") and not manager._spare.get("Y")
        worker.join()
        assert _wait(lambda: manager._spare.get("Y"))
        spare = manager._spare["Y"][0]
        # Its first step started only after the visitor's last one ended.
        ends = sorted(c[2] for c in FakeEngine.calls if c[0] == "prepare_extrap")
        fine = sorted(c[2] for c in FakeEngine.calls if c[0] == "prepare_fine")
        assert len(fine) == 2 and fine[1] >= ends[0]
        assert spare.prepared >= {"data", "fine", "extrap"}

        # A spare being built when a visitor starts preparing is paused.
        manager.spares["Y"] = 2
        manager._replenish_later(other, delay=0)
        assert _wait(lambda: any(r["session"] is not None
                                 for r in manager._wip.get("Y", [])))
        manager._visitor_working(+1)
        building = [r["session"] for r in manager._wip["Y"]]
        assert building and building[0].id in paused
        manager._visitor_working(-1)
        assert not building[0]._paused
    finally:
        session_module.Session.pause = real_pause
        manager.close_all()


def test_open_reports_spare_and_status_reports_progress(client):
    c, manager = client
    r = c.post("/api/evaluations/X/open").get_json()
    assert r["from_spare"] is False and "prepared" in r and "builds" in r
    status = c.get(f"/api/sessions/{r['session_id']}/status").get_json()
    assert status["pending"] == ["data", "fine", "extrap"]
    assert status["from_spare"] is False and status["builds"] == 0


def test_spare_being_built_gives_way_to_a_visitor(fake):
    """At the cap, a spare still being built is stopped for a visitor of
    another evaluation rather than refusing them."""
    FakeEngine.delays.update(prepare={"fine": 2.0})
    manager = session_module.SessionManager(max_sessions=1, spares={"Y": 1},
                                            spare_delay=0, spare_quiet=0)
    try:
        other = Evaluation(id="Y", path=fake.path, azr_path=fake.azr_path, title="Y",
                           channels=[])
        manager.start_spares([other])
        assert _wait(lambda: any(r["session"] is not None
                                 for r in manager._wip.get("Y", [])))
        building = manager._wip["Y"][0]["session"]
        session = manager.create(fake)
        assert not session.closed and building.closed
        assert _wait(lambda: not manager._wip.get("Y"))
        assert manager._pending == 0 and not manager._spare.get("Y")
    finally:
        manager.close_all()
