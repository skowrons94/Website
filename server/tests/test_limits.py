"""Per-address limits (app/limits.py, SessionManager.max_per_owner), the
body cap, CORS and log hygiene, with the stand-in engine of test_session:
one client can no longer keep everyone else out, and a reviewer's ordinary
use (open, edit, ping, close, reopen, two tabs) is never limited."""

import logging
import time

import pytest
from flask import Flask

from app import install_gzip, install_security
from app import session as session_module
from app.evaluations import Evaluation
from app.limits import TokenBucket, client_key, masked, parse_rate, prefix_key

from test_session import FakeEngine


@pytest.fixture
def fake(monkeypatch, tmp_path):
    monkeypatch.setattr(session_module, "Engine", FakeEngine)
    FakeEngine.delays = {"data": 0.0, "fine": 0.0, "extrap": 0.0, "prepare": {}}
    FakeEngine.calls = []
    (tmp_path / "m.azr").write_text("model\n")
    return Evaluation(id="X", path=str(tmp_path), azr_path=str(tmp_path / "m.azr"),
                      title="X", channels=[])


def make_app(fake, monkeypatch, max_sessions=4, per_ip=2, **config):
    from app import evaluations as evaluations_module
    from app.routes import bp

    monkeypatch.setattr(evaluations_module, "get", lambda root, eid: fake)
    app = Flask("test")
    app.config.update(EVALUATIONS_DIR=fake.path, MAX_CONTENT_LENGTH=64 * 1024,
                      TRUSTED_PROXIES=0, CORS_ORIGINS=[], OPEN_RATE="100/1",
                      EDIT_RATE="100/1", MAX_INFLIGHT_PER_IP=8)
    app.config.update(config)
    install_security(app)
    manager = session_module.SessionManager(ttl=600, max_sessions=max_sessions,
                                            retry_after=7, max_per_owner=per_ip)
    app.extensions["sessions"] = manager
    app.register_blueprint(bp)
    install_gzip(app)
    return app, manager


@pytest.fixture
def stack(fake, monkeypatch):
    made = []

    def build(**kw):
        app, manager = make_app(fake, monkeypatch, **kw)
        made.append(manager)
        return app, manager

    yield build
    for manager in made:
        manager.close_all()


def opener(app, ip):
    c = app.test_client()

    def open_(**kw):
        return c.post("/api/evaluations/X/open", environ_base={"REMOTE_ADDR": ip}, **kw)
    return c, open_


# -- the cap per address ---------------------------------------------------------

def test_third_session_from_one_address_is_429(stack):
    app, manager = stack()
    c, open_ = opener(app, "203.0.113.5")
    sids = [open_().get_json()["session_id"] for _ in range(2)]
    for sid in sids:
        c.post(f"/api/sessions/{sid}/ping", environ_base={"REMOTE_ADDR": "203.0.113.5"})
    r = open_()
    assert r.status_code == 429
    assert r.headers["Retry-After"] == "7"
    body = r.get_json()
    assert body["code"] == "busy" and "address" in body["error"]
    # Another address is not affected.
    _, other = opener(app, "198.51.100.9")
    assert other().status_code == 201


def test_own_stale_session_makes_room(stack):
    """A tab closed without notice must not lock its owner out: past the
    cap, the owner's own session unseen for long enough gives way."""
    app, manager = stack()
    _, open_ = opener(app, "203.0.113.5")
    first = open_().get_json()["session_id"]
    open_()
    manager.evict_after = 0.1
    time.sleep(0.2)
    assert open_().status_code == 201
    assert manager.owned(client_key("203.0.113.5")) == 2
    with pytest.raises(session_module.SessionError):
        manager.get(first)


def test_one_client_cannot_starve_the_others(stack):
    """The report's attack: open and ping every slot.  Now an address holds
    at most two, and a newcomer on a full server takes one of the heaviest
    holder's sessions, even a pinged one."""
    app, manager = stack(max_sessions=4)
    attacker = "203.0.113.66"
    c, open_ = opener(app, attacker)
    held = []
    for _ in range(6):
        r = open_()
        if r.status_code == 201:
            held.append(r.get_json()["session_id"])
    assert len(held) == 2                     # the rest were 429
    for sid in held:
        c.post(f"/api/sessions/{sid}/ping", environ_base={"REMOTE_ADDR": attacker})
    # Two visitors fill the server.
    visitors = []
    for ip in ("198.51.100.1", "192.0.2.2"):     # two networks (/24s)
        vc, v_open = opener(app, ip)
        r = v_open()
        assert r.status_code == 201
        visitors.append((vc, ip, r.get_json()["session_id"]))
        vc.post(f"/api/sessions/{visitors[-1][2]}/ping", environ_base={"REMOTE_ADDR": ip})
    # A third visitor: every session was seen just now, so before this change
    # the answer was 503; now the attacker gives one up.
    _, v3 = opener(app, "100.64.0.3")
    r = v3()
    assert r.status_code == 201
    alive = [sid for sid in held if not manager._sessions.get(sid) is None]
    assert len(alive) == 1
    # The visitors' sessions are untouched.
    for vc, ip, sid in visitors:
        assert vc.get(f"/api/sessions/{sid}/status",
                      environ_base={"REMOTE_ADDR": ip}).status_code == 200
    # A fourth visitor: the attacker (1) holds no more than anyone else (1),
    # so nobody is evicted and the answer is the usual 503.
    _, v4 = opener(app, "100.65.0.4")
    assert v4().status_code == 503


def test_ipv6_counts_by_64(stack):
    app, _ = stack()
    _, a = opener(app, "2001:db8:1:2::1")
    _, b = opener(app, "2001:db8:1:2::ffff")
    assert a().status_code == 201
    assert b().status_code == 201
    _, c = opener(app, "2001:db8:1:2:abcd::9")
    assert c().status_code == 429


# -- networks (r15 security #1): one /56, or a block of IPv4 addresses ----------

def ping_all(app, held):
    c = app.test_client()
    return [c.post(f"/api/sessions/{sid}/ping", environ_base={"REMOTE_ADDR": ip}).status_code
            for ip, sid in held]


def test_prefix_keys():
    assert prefix_key(client_key("2001:db8:1:2::1")) == "2001:db8:1::/56"
    assert prefix_key(client_key("2001:db8:1:ff::1")) == "2001:db8:1::/56"
    assert prefix_key(client_key("2001:db8:1:100::1")) == "2001:db8:1:100::/56"
    assert prefix_key(client_key("203.0.113.5")) == "203.0.113.0/24"
    assert prefix_key(client_key("::ffff:203.0.113.5")) == "203.0.113.0/24"
    assert prefix_key("203.0.113.5", 32, 128) == "203.0.113.5/32"
    assert prefix_key(None) is None and prefix_key("unix") == "unix"


def test_one_ipv6_56_cannot_fill_the_server(stack):
    """The reviewer's attack: eight /64s of one home /56, one pinged session
    each.  Before: all eight slots taken, every newcomer 503 indefinitely.
    Now the /56 holds three, and the other five are anyone's."""
    app, manager = stack(max_sessions=8, per_ip=2)
    manager.max_per_prefix = 3
    held, codes = [], []
    for i in range(8):
        ip = f"2001:db8:1:{i:x}::1"
        _, open_ = opener(app, ip)
        r = open_()
        codes.append(r.status_code)
        if r.status_code == 201:
            held.append((ip, r.get_json()["session_id"]))
    assert codes == [201, 201, 201] + [429] * 5
    assert "network" in r.get_json()["error"]
    assert ping_all(app, held) == [200] * 3
    for i in range(5):
        _, open_ = opener(app, f"2001:db8:{i + 2}::1")
        assert open_().status_code == 201
    # Another /56 next door is a different network.
    _, open_ = opener(app, "2001:db8:1:100::1")
    assert open_().status_code != 429


def test_own_network_stale_session_makes_room(stack):
    """Past the /56 cap, a session of that network unseen for long enough
    gives way (a tab closed without notice), as for the per-address cap."""
    app, manager = stack(max_sessions=8, per_ip=2)
    manager.max_per_prefix = 2
    _, a = opener(app, "2001:db8:1:1::1")
    _, b = opener(app, "2001:db8:1:2::1")
    first = a().get_json()["session_id"]
    b()
    _, c = opener(app, "2001:db8:1:3::1")
    assert c().status_code == 429
    manager.evict_after = 0.1
    time.sleep(0.2)
    assert c().status_code == 201
    assert first not in manager._sessions


def test_ipv4_24_is_never_capped_only_weighed_when_full(stack):
    """A /24 (a campus, a carrier NAT) may hold every free slot; when the
    server is full a newcomer from elsewhere takes its oldest session."""
    app, manager = stack(max_sessions=4, per_ip=2)
    manager.max_per_prefix = 3
    held = []
    for i in range(4):
        ip = f"203.0.113.{10 + i}"
        _, open_ = opener(app, ip)
        r = open_()
        assert r.status_code == 201          # no cap on the /24
        held.append((ip, r.get_json()["session_id"]))
        time.sleep(0.01)
    assert ping_all(app, held) == [200] * 4
    _, newcomer = opener(app, "198.51.100.7")
    assert newcomer().status_code == 201
    # The /24's oldest session went; its page's next ping gets 409 (and the
    # page reopens it), the others are untouched.
    assert ping_all(app, held) == [409, 200, 200, 200]


def test_eight_ipv4_addresses_yield_after_max_age(stack):
    """Eight addresses in eight networks, one pinged session each: nobody
    holds more than anyone else, so fairness does not apply; past
    AZURE2_MAX_AGE the oldest gives way to a waiting newcomer."""
    app, manager = stack(max_sessions=8, per_ip=2)
    manager.max_age = 1800
    held = []
    for i in range(8):
        ip = f"198.51.{i}.1"
        _, open_ = opener(app, ip)
        held.append((ip, open_().get_json()["session_id"]))
    assert ping_all(app, held) == [200] * 8
    _, newcomer = opener(app, "192.0.2.77")
    assert newcomer().status_code == 503
    # Half an hour later (pinged all along).
    for k, (_, sid) in enumerate(held):
        manager._sessions[sid].created_at -= 1801 + (8 - k)
    assert ping_all(app, held) == [200] * 8
    assert newcomer().status_code == 201
    assert ping_all(app, held) == [409] + [200] * 7
    # The page of the closed one reopens: the next oldest gives way to it.
    _, back = opener(app, held[0][0])
    assert back().status_code == 201
    assert ping_all(app, held[1:]) == [409] + [200] * 6


def test_max_age_spares_busy_sessions_and_young_ones(stack):
    app, manager = stack(max_sessions=2, per_ip=2)
    manager.max_age = 60
    a = opener(app, "198.51.100.1")[1]().get_json()["session_id"]
    b = opener(app, "192.0.2.1")[1]().get_json()["session_id"]
    ping_all(app, [("198.51.100.1", a), ("192.0.2.1", b)])
    manager._sessions[a].created_at -= 120
    manager._sessions[a]._busy += 1           # mid-calculation
    _, newcomer = opener(app, "100.64.0.1")
    assert newcomer().status_code == 503       # b is young, a is busy
    manager._sessions[a]._busy -= 1
    assert newcomer().status_code == 201
    assert a not in manager._sessions and b in manager._sessions


def test_max_age_off_by_zero(stack):
    app, manager = stack(max_sessions=1, per_ip=2)
    manager.max_age = 0
    sid = opener(app, "198.51.100.1")[1]().get_json()["session_id"]
    ping_all(app, [("198.51.100.1", sid)])
    manager._sessions[sid].created_at -= 10 ** 6
    assert opener(app, "192.0.2.1")[1]().status_code == 503


# -- rates --------------------------------------------------------------------------

def test_open_rate_limit(stack):
    app, _ = stack(per_ip=0, max_sessions=50, OPEN_RATE="3/60")
    c, open_ = opener(app, "203.0.113.7")
    codes = []
    for _ in range(4):
        r = open_()
        codes.append(r.status_code)
        if r.status_code == 201:
            c.delete(f"/api/sessions/{r.get_json()['session_id']}",
                     environ_base={"REMOTE_ADDR": "203.0.113.7"})
    assert codes == [201, 201, 201, 429]
    assert int(r.headers["Retry-After"]) >= 1
    # Someone else still can.
    _, other = opener(app, "203.0.113.8")
    assert other().status_code == 201


def test_edit_rate_limit_and_quick_routes_unlimited(stack):
    app, _ = stack(EDIT_RATE="2/60")
    env = {"REMOTE_ADDR": "203.0.113.9"}
    c = app.test_client()
    sid = c.post("/api/evaluations/X/open", environ_base=env).get_json()["session_id"]
    codes = [c.post(f"/api/sessions/{sid}/parameters", json={"updates": {"0": 1.5 + i}},
                    environ_base=env).status_code for i in range(3)]
    assert codes == [200, 200, 429]
    # Heartbeats, status and close are never limited.
    assert c.post(f"/api/sessions/{sid}/ping", environ_base=env).status_code == 200
    assert c.get(f"/api/sessions/{sid}/status", environ_base=env).status_code == 200
    assert c.post(f"/api/sessions/{sid}/close", environ_base=env).status_code == 200


def test_token_bucket_refills():
    bucket = TokenBucket(2, 1.0)
    assert bucket.take("a", now=0) == 0
    assert bucket.take("a", now=0) == 0
    assert bucket.take("a", now=0) == pytest.approx(0.5)
    assert bucket.take("a", now=0.6) == 0
    assert bucket.take("b", now=0.6) == 0


def test_token_bucket_is_bounded():
    bucket = TokenBucket(1, 1.0)
    bucket.MAX_KEYS = 100
    for i in range(1000):
        bucket.take(f"k{i}", now=0)
    assert len(bucket._buckets) <= 101


def test_parse_rate():
    assert parse_rate("10/60", None) == (10, 60)
    assert parse_rate("5", None) == (5, 1)
    assert parse_rate("0", "1/1") is None
    assert parse_rate("nonsense", "1/2") == (1, 2)


# -- the address behind Caddy ----------------------------------------------------------

def test_proxy_fix_takes_the_address_caddy_wrote(stack):
    app, manager = stack(TRUSTED_PROXIES=1)
    c = app.test_client()
    proxy = {"REMOTE_ADDR": "172.18.0.5"}

    def open_as(ip):
        return c.post("/api/evaluations/X/open", environ_base=proxy,
                      headers={"X-Forwarded-For": ip})
    assert open_as("203.0.113.1").status_code == 201
    assert open_as("203.0.113.2").status_code == 201
    assert open_as("203.0.113.2").status_code == 201
    assert open_as("203.0.113.2").status_code == 429
    # A client-supplied X-Forwarded-For ahead of Caddy's entry is ignored:
    # only the last hop (the one Caddy appended) counts.
    assert c.post("/api/evaluations/X/open", environ_base=proxy,
                  headers={"X-Forwarded-For": "1.2.3.4, 203.0.113.2"}).status_code == 429


def test_without_trusted_proxy_forwarded_for_is_ignored(stack):
    app, _ = stack()
    c = app.test_client()
    peer = {"REMOTE_ADDR": "203.0.113.50"}
    for spoof in ("10.0.0.1", "10.0.0.2"):
        assert c.post("/api/evaluations/X/open", environ_base=peer,
                      headers={"X-Forwarded-For": spoof}).status_code == 201
    assert c.post("/api/evaluations/X/open", environ_base=peer,
                  headers={"X-Forwarded-For": "10.0.0.3"}).status_code == 429


# -- a reviewer's ordinary use -------------------------------------------------------

def test_ordinary_use_is_never_limited(stack):
    app, manager = stack()
    env = {"REMOTE_ADDR": "192.0.2.10"}
    c = app.test_client()
    # Browse four evaluations in turn, closing each (the page's beacon).
    for i in range(4):
        r = c.post(f"/api/evaluations/X/open?client=page{i:05d}", environ_base=env)
        assert r.status_code == 201, r.get_json()
        sid = r.get_json()["session_id"]
        assert c.post(f"/api/sessions/{sid}/ping", environ_base=env).status_code == 200
        for value in (1.1, 1.2, 1.3, 1.4, 1.5):
            assert c.post(f"/api/sessions/{sid}/parameters", json={"updates": {"0": value}, "seq": 1},
                          environ_base=env).status_code == 200
        assert c.get(f"/api/sessions/{sid}/fine", environ_base=env).status_code == 200
        assert c.get(f"/api/sessions/{sid}/extrapolations", environ_base=env).status_code == 200
        assert c.post(f"/api/sessions/{sid}/reset", json={"seq": 2},
                      environ_base=env).status_code == 200
        assert c.post(f"/api/clients/page{i:05d}/close", environ_base=env).status_code == 200
    # Two tabs side by side, then a reload of one (beacon, then a new open).
    a = c.post("/api/evaluations/X/open?client=tabaaaaa", environ_base=env).get_json()["session_id"]
    c.post("/api/evaluations/X/open?client=tabbbbbb", environ_base=env)
    c.post(f"/api/sessions/{a}/close", environ_base=env)
    assert c.post("/api/evaluations/X/open?client=tabaaab2", environ_base=env).status_code == 201


# -- body size, bad bodies, CORS, logs ------------------------------------------------

def test_body_too_large_is_413(stack):
    app, _ = stack()
    c = app.test_client()
    env = {"REMOTE_ADDR": "192.0.2.11"}
    sid = c.post("/api/evaluations/X/open", environ_base=env).get_json()["session_id"]
    r = c.post(f"/api/sessions/{sid}/parameters", data="x" * (100 * 1024),
               content_type="application/json", environ_base=env)
    assert r.status_code == 413
    assert "error" in r.get_json()


def test_non_object_bodies_are_400(stack):
    app, _ = stack()
    c = app.test_client()
    env = {"REMOTE_ADDR": "192.0.2.12"}
    sid = c.post("/api/evaluations/X/open", environ_base=env).get_json()["session_id"]
    for route in ("parameters", "reset", "prepare"):
        r = c.post(f"/api/sessions/{sid}/{route}", json=[1, 2], environ_base=env)
        assert r.status_code == 400, route
    r = c.post(f"/api/sessions/{sid}/reset", json={"seq": "x"}, environ_base=env)
    assert r.status_code == 400


def test_no_cors_by_default(stack):
    app, _ = stack()
    r = app.test_client().get("/api/health", headers={"Origin": "https://evil.example"})
    assert "Access-Control-Allow-Origin" not in r.headers


def test_cors_only_for_listed_origins(stack):
    app, _ = stack(CORS_ORIGINS=["http://localhost:3000"])
    c = app.test_client()
    r = c.get("/api/health", headers={"Origin": "http://localhost:3000"})
    assert r.headers.get("Access-Control-Allow-Origin") == "http://localhost:3000"
    r = c.get("/api/health", headers={"Origin": "https://evil.example"})
    assert "Access-Control-Allow-Origin" not in r.headers


def test_log_line_cannot_be_forged(stack, caplog):
    from app.utils.logging_config import OneLine
    app, _ = stack()
    caplog.handler.addFilter(OneLine())
    with caplog.at_level(logging.INFO, logger="app.routes.api"):
        app.test_client().get("/api/evaluations/X%0a2026-01-01 FAKE ENTRY",
                              environ_base={"REMOTE_ADDR": "192.0.2.13"})
    text = caplog.text
    assert "\n2026-01-01 FAKE" not in text
    assert "192.0.2.0/24" in text and "192.0.2.13" not in text


def test_masked_and_keys():
    assert masked("192.0.2.13") == "192.0.2.0/24"
    assert masked("2001:db8:1:2::1") == "2001:db8:1::/48"
    assert masked("::ffff:192.0.2.13") == "192.0.2.0/24"
    assert client_key("::ffff:192.0.2.13") == "192.0.2.13"
    assert client_key("2001:db8:1:2::1") == "2001:db8:1:2::/64"
    assert client_key(None) is None


def test_gone_clients_are_bounded(fake):
    manager = session_module.SessionManager(max_sessions=1)
    manager._GONE_MAX = 50
    for i in range(500):
        manager.close_client(f"token{i:06d}")
    assert len(manager._gone_clients) <= 50
    manager.close_all()
