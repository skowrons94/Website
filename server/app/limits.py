"""Per-address limits, so one client cannot take the API from everyone else.

An open evaluation is a worker process, and the server runs only
``AZURE2_MAX_SESSIONS`` of them; the waitress pool has ``AZURE2_THREADS``
request threads.  Without limits a single client could hold every slot (open
and ping four sessions) or every thread (ten slow requests at once).  So, per
client address (:func:`client_key`):

* at most ``AZURE2_MAX_PER_IP`` sessions open at once (default 2; the
  session manager enforces it, ``SessionManager.max_per_owner``), and at
  most ``AZURE2_MAX_PER_PREFIX`` (default 3) per IPv6 /56
  (:func:`prefix_key`; IPv4 /24s are only weighed when the server is full,
  see ``SessionManager._evict_candidate``);
* a token bucket on ``/open`` (``AZURE2_OPEN_RATE``, default ``10/60``: ten a
  minute, in bursts of up to ``AZURE2_OPEN_BURST``) and another on edits
  (``AZURE2_EDIT_RATE``, default ``20/1``, burst ``AZURE2_EDIT_BURST``);
* at most ``AZURE2_MAX_INFLIGHT_PER_IP`` slow requests (calculations,
  opening, preparing) under way at once (default 8).

Past a limit the answer is 429 with ``Retry-After`` and ``code: "busy"``,
which the page treats like a full server: it waits and tries again.  Everything
is in-process (one waitress process), so nothing needs a store; a restart
forgets the buckets.

The address is ``request.remote_addr``.  Behind Caddy that is Caddy's own,
unless ``AZURE2_TRUSTED_PROXIES`` is 1 (docker-compose.yml sets it): then
Werkzeug's ProxyFix takes the client's from ``X-Forwarded-For``, which Caddy
writes itself (it drops one sent by the client).  Never set it on a server a
client can reach directly, or the client chooses its own address.
"""

import ipaddress
import logging
import math
import threading
import time

from flask import jsonify, request

log = logging.getLogger(__name__)

# The routes that hold a request thread for long: a calculation, a model
# build, opening a session.  The rest (status, ping, close, the static
# payloads) are quick and never limited, so a page over its limit can still
# close its sessions and keep its heartbeat.
SLOW = frozenset({
    "api.open_evaluation", "api.prepare_session", "api.set_parameters",
    "api.reset_parameters", "api.get_data", "api.get_fine",
    "api.get_extrapolations", "api.get_extrapolation_grid",
    "api.download_extrapolations", "api.export_scheme_text", "api.get_scheme",
})
EDITS = frozenset({"api.set_parameters", "api.reset_parameters"})
OPENS = frozenset({"api.open_evaluation"})


def client_key(address):
    """The address limits are counted against: an IPv4 address as it is, an
    IPv6 one by its /64 (one household or server usually holds a whole /64,
    so counting single addresses there would limit nothing).  None when
    unknown."""
    if not address:
        return None
    try:
        ip = ipaddress.ip_address(address)
    except ValueError:
        return str(address)[:64]
    if ip.version == 6:
        if ip.ipv4_mapped is not None:
            return str(ip.ipv4_mapped)
        return str(ipaddress.ip_network(f"{ip}/64", strict=False))
    return str(ip)


def prefix_key(key, v4_prefix=24, v6_prefix=56):
    """The wider network ``key`` (a :func:`client_key`) belongs to, which
    the session manager counts too: an IPv6 /64 by its /56 (a home line is
    usually given a whole /56, i.e. 256 /64s, so the /64 alone limits little),
    an IPv4 address by its /24.  A prefix of 128 (IPv6) or 32 (IPv4) makes it
    the key itself.  None stays None; an unparsable key is its own prefix."""
    if key is None:
        return None
    try:
        net = ipaddress.ip_network(key, strict=False)
    except ValueError:
        return key
    prefix = v6_prefix if net.version == 6 else v4_prefix
    if prefix >= net.prefixlen:
        return str(net)
    return str(net.supernet(new_prefix=max(0, prefix)))


def masked(address):
    """The address as it goes into a log: an IPv4 address without its last
    octet, an IPv6 one cut to its /48 -- as Caddy's access log keeps them
    (deploy/Caddyfile), so neither log holds a full address."""
    if not address:
        return "-"
    try:
        ip = ipaddress.ip_address(address)
    except ValueError:
        return "?"
    if ip.version == 6 and ip.ipv4_mapped is not None:
        ip = ip.ipv4_mapped
    prefix = 24 if ip.version == 4 else 48
    return str(ipaddress.ip_network(f"{ip}/{prefix}", strict=False))


def parse_rate(text, default):
    """``"10/60"`` -> (10 tokens, per 60 s); ``"0"`` or empty: no limit."""
    text = (text or "").strip()
    if text in ("", "0", "off", "none"):
        return None
    try:
        count, _, seconds = text.partition("/")
        count, seconds = float(count), float(seconds or 1)
        if count > 0 and seconds > 0:
            return count, seconds
    except ValueError:
        pass
    log.warning("ignoring the rate %r (expected N/SECONDS); using %s", text, default)
    return parse_rate(default, None) if default else None


class TokenBucket:
    """One bucket per key: ``burst`` tokens, refilled at ``count`` per
    ``seconds``.  :meth:`take` returns 0 when a token was taken, else the
    seconds until one will be there."""

    MAX_KEYS = 10000

    def __init__(self, count, seconds, burst=None):
        self.rate = count / seconds
        self.burst = float(burst if burst else count)
        self._buckets = {}            # key -> (tokens, at)
        self._lock = threading.Lock()

    def take(self, key, now=None) -> float:
        now = time.monotonic() if now is None else now
        with self._lock:
            tokens, at = self._buckets.get(key, (self.burst, now))
            tokens = min(self.burst, tokens + (now - at) * self.rate)
            if tokens >= 1:
                self._buckets[key] = (tokens - 1, now)
                wait = 0.0
            else:
                self._buckets[key] = (tokens, now)
                wait = (1 - tokens) / self.rate
            if len(self._buckets) > self.MAX_KEYS:
                self._prune(now)
        return wait

    def _prune(self, now):
        # A full bucket is the same as no bucket: forget those first, then
        # the oldest, so a flood of addresses cannot grow this without bound.
        full = [k for k, (t, at) in self._buckets.items()
                if t + (now - at) * self.rate >= self.burst]
        for k in full:
            del self._buckets[k]
        while len(self._buckets) > self.MAX_KEYS // 2:
            del self._buckets[next(iter(self._buckets))]


def too_many(message, retry_after):
    retry_after = max(1, int(math.ceil(retry_after)))
    response = jsonify({"error": message, "code": "busy", "retry_after": retry_after})
    response.headers["Retry-After"] = str(retry_after)
    return response, 429


class Limiter:
    """The request-side limits (rates and requests in flight); the session
    cap is the session manager's.  ``install(app)`` hooks it in."""

    def __init__(self, open_rate="10/60", open_burst=0, edit_rate="20/1",
                 edit_burst=0, max_inflight=8):
        rate = parse_rate(open_rate, "10/60")
        self.opens = TokenBucket(*rate, burst=open_burst or None) if rate else None
        rate = parse_rate(edit_rate, "20/1")
        self.edits = TokenBucket(*rate, burst=edit_burst or None) if rate else None
        self.max_inflight = max_inflight
        self._inflight = {}
        self._lock = threading.Lock()
        self._warned = False

    def install(self, app):
        app.extensions["limiter"] = self
        app.before_request(self._before)
        app.teardown_request(self._after)

    def _before(self):
        endpoint = request.endpoint or ""
        if endpoint not in SLOW:
            return None
        key = client_key(request.remote_addr)
        if key is None:
            return None
        self._warn_once()
        if endpoint in OPENS and self.opens is not None:
            wait = self.opens.take(key)
            if wait:
                log.info("rate limit: /open from %s", masked(request.remote_addr))
                return too_many("Too many evaluations opened from your address in a "
                                "short time; please wait a moment.", wait)
        if endpoint in EDITS and self.edits is not None:
            wait = self.edits.take(key)
            if wait:
                return too_many("Too many changes in a short time; please wait a moment.", wait)
        if self.max_inflight:
            with self._lock:
                n = self._inflight.get(key, 0)
                if n >= self.max_inflight:
                    log.info("limit: %d requests in flight from %s", n, masked(request.remote_addr))
                    return too_many("Too many calculations under way from your address; "
                                    "please wait for them to finish.", 2)
                self._inflight[key] = n + 1
            request.environ["azure2.inflight"] = key
        return None

    def _after(self, _exc=None):
        key = request.environ.pop("azure2.inflight", None)
        if key is None:
            return
        with self._lock:
            n = self._inflight.get(key, 0) - 1
            if n > 0:
                self._inflight[key] = n
            else:
                self._inflight.pop(key, None)

    def _warn_once(self):
        # Behind a proxy without AZURE2_TRUSTED_PROXIES every visitor has the
        # proxy's address, and the per-address cap becomes a global one.
        if self._warned or "X-Forwarded-For" not in request.headers:
            return
        self._warned = True
        if request.environ.get("werkzeug.proxy_fix.orig") is None:
            log.warning("requests arrive through a proxy (X-Forwarded-For) but "
                        "AZURE2_TRUSTED_PROXIES is 0: the per-address limits count "
                        "the proxy's address, i.e. every visitor together. Set "
                        "AZURE2_TRUSTED_PROXIES=1 behind Caddy.")
