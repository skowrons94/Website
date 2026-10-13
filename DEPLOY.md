# Deployment checklist

The whole site runs as three containers from `docker-compose.yml`: Caddy
(TLS, ports 80/443), the Next.js site, and the AZURE2 API. README.md
("Deploying") explains the design; this file is the list of things to do.

## 1. The VPS

- Ubuntu 22.04/24.04 or Debian 12, 2+ vCPU.
- **Memory: 4 GB or more, plus 2–4 GB of swap.** The site, Caddy and the idle
  API use about 250 MB. An open evaluation, prepared for edits (its data model,
  plot curves and extrapolations, each a worker process), uses:

  | ⁷Be | ²⁴Mg | ¹⁴N | ²³Na, ²¹Na | ¹³N, ¹⁷F, ⁸Be |
  |---|---|---|---|---|
  | 0.87 GB (+0.15 GB while its 2-D grids are shown) | 0.43 GB | 0.29 GB | 0.24 GB | 0.18–0.20 GB |

  plus, by default, one spare prepared session each of ⁷Be and ²⁴Mg
  (`AZURE2_SPARES`, 1.3 GB together; `0` turns them off). The extrapolations'
  worker is closed after 5 minutes unused (`AZURE2_ROLE_TTL`), which takes
  ⁷Be back to about 0.5 GB. **Sizing `AZURE2_MAX_SESSIONS`** (which counts
  the spares): plan 0.9 GB per slot if visitors mostly open ⁷Be, about 0.35 GB
  otherwise — so per GB left after the site and the spares, about 1 slot for
  ⁷Be-heavy traffic and 3 for the rest. On 4 GB: `AZURE2_MAX_SESSIONS=4`
  with spares, 6 without. On 8 GB: 8 (the default). A full server answers a
  new visitor at once with "busy, retry in 15 s" (HTTP 503) instead of
  hanging, after first evicting a spare of another evaluation and then the
  session seen least recently -- never one whose page pinged in the last
  minute (`AZURE2_EVICT_AFTER`). A tab closed without notice (crash,
  phone) is noticed within 2 minutes (heartbeats). With memory to spare,
  `AZURE2_SPARES=7Be:2,24Mg:1` serves two ⁷Be visitors arriving together
  at once (+0.9 GB); replacements are built one at a time, when no visitor
  is preparing.
- **Disk: 5 GB free** for the images (about 650 MB) and the build cache, plus
  about 1.5 GB for the data explorer's files if you build them (`make data`, §5).
- Install Docker Engine and the Compose plugin:

  ```sh
  curl -fsSL https://get.docker.com | sudo sh
  sudo usermod -aG docker $USER      # then log out and back in
  docker compose version             # must print v2.x or later
  ```

- Open TCP 80 and 443, and UDP 443 (HTTP/3), in the OVH Network Firewall if it
  is on, and in `ufw` if you use it. Nothing else needs to be reachable
  (SSH aside; section 10 has the whole firewall and SSH setup).

## 2. DNS (do this first)

In the OVH DNS zone: an `A` record for the apex and for `www`, both pointing at
the VPS' IPv4. Delete OVH's default parking records. Add `AAAA` only if
`curl -6 https://ifconfig.co` works from the VPS. Wait until

```sh
dig +short example.com          # prints the VPS' IP
dig +short www.example.com      # the same
```

before the first deploy: Let's Encrypt allows only 5 failed validations per
host per hour.

## 3. Configure

```sh
git clone <repository> website && cd website
make env                 # creates .env; sets AZURE2_UID/GID for you
nano .env                # set SITE_DOMAIN and ACME_EMAIL
```

**`SITE_URL`** defaults to `https://` plus `SITE_DOMAIN`; set it in `.env` only
if the site is served from another address. It is the one setting that changes what the built pages say about themselves,
and it is baked in at build time:

- the social-preview image (`og:image`, Twitter card) appears only with it:
  Open Graph needs an absolute address, and the build cannot guess the domain;
  without it a shared link previews with a title and text but no picture;
- the language alternates (`hreflang`), the canonical address of every page,
  the structured data (JSON-LD), `sitemap.xml`, `robots.txt` and the news
  feeds use absolute addresses, as search engines and feed readers need;
- the atlas' "how to cite" box cites the public address rather than whatever
  address the page is being viewed at (`127.0.0.1` on a local build), and the
  printed CV shows it next to the name and email.

After changing it, rebuild the site (`make deploy`); a restart is not enough.

| Variable | Set it to |
|---|---|
| `SITE_DOMAIN` | the bare domain, e.g. `jskowron.eu` (no `https://`, no `www`) |
| `SITE_URL` | the site's public address; defaults to `https://` + `SITE_DOMAIN` (see above) |
| `ACME_EMAIL` | your address, for certificate expiry warnings |
| `BUILD_JOBS` | `2` on a VPS with 2 GB of RAM or less; leave unset otherwise |
| `AZURE2_UID`, `AZURE2_GID` | the owner of `server/evaluations` (`make env` fills these in; check with `stat -c '%u:%g' server/evaluations`) |
| `AZURE2_MAX_SESSIONS` | how many evaluations may be open at once, spares included (default 8); see the memory table in section 1 |
| `AZURE2_SPARES` | `auto` (default) keeps one prepared ⁷Be and ²⁴Mg session ready (1.3 GB); `0` on a box under 4 GB |
| `AZURE2_EVICT_AFTER` | seconds a session must have been unseen (no request, no heartbeat) before a newcomer may evict it; `0` (default): 2 heartbeat intervals, at least 60 |
| `AZURE2_MAX_PER_IP`, `AZURE2_OPEN_RATE`, `AZURE2_EDIT_RATE`, `AZURE2_MAX_INFLIGHT_PER_IP` | per-visitor limits (section 10) |
| `AZURE2_MEM_LIMIT`, `AZURE2_CPUS`, `WEB_*`, `CADDY_*` | container caps (section 10); `make env` sizes AZURE2's to the machine |

Clone as the user that will run `make`, not as root, so the evaluations
directory belongs to that user and `make env` picks the right ID.

## 4. First deploy

```sh
make deploy              # docker compose up -d --build, then make check
```

The first build takes about 4 minutes on 4 cores (2.5 of them compiling
AZURE2) and needs about 2 GB of RAM at `BUILD_JOBS=4`. Then:

- `make check`: all three containers `Up`, azure2 `(healthy)`, and
  `azure2: {... 'evaluations': N, 'status': 'ok'}`, N the number of
  directories in `server/evaluations/`.
- `https://<domain>/` loads with a valid certificate; `http://` and
  `https://www.<domain>` redirect to it.
- `https://<domain>/api/health` returns JSON with `"evaluations": N`.
- `https://<domain>/evaluations` lists the N evaluations. Open ¹³N: the level
  scheme appears within a few seconds, and the Plot tab shows curves.
- `https://<domain>/atlas` and `https://<domain>/it` load.
- `https://<domain>/webdaq-demo/` loads (`make check` says `webdaq-demo:
  served`); the banner says it is a simulation, and *Open WebDAQ* reaches the
  dashboard. `https://<domain>/software/webdaq` links to it.

Then fill the results cache, once:

```sh
make warm                # about 10 minutes; ends with ok/FAILED per evaluation
```

Each evaluation's data and extrapolation curves at its published parameters,
and the model on the extended energy grid that the plots draw, are stored next
to the model (`server/evaluations/<id>/precomputed.json`) and served from there
until a visitor edits a level; the external-capture integrals of the derived
grids are computed on the way and kept. Without it the first visitor to open
the ⁷Be extrapolations waits several minutes; with it, about 2 seconds, and an
edit then recalculates them in about 10. The cache fills itself anyway as visitors use the site, and it
invalidates itself when an evaluation's `.azr` or data files change.

## 5. Updating

```sh
git pull
make update              # rebuilds the site only (content/, app/, components/, lib/)
```

`make update` does **not** rebuild the API. When a pull changes `server/` or
`deploy/Dockerfile.azure2`, run `make deploy` instead (or
`docker compose up -d --build azure2`). If unsure, `make deploy` is always
safe; unchanged layers are reused.

A new or corrected evaluation under `server/evaluations/` needs only
`make evaluations` (restarts the API, no rebuild), then `make warm`, and
`make update` for its page. docs/ADDING-AN-EVALUATION.md has the whole recipe
(`make add-evaluation` on your own machine first, then commit and pull here).
`make warm` writes `timings.json` next to each evaluation it measures: commit
those back from the server, or run it locally before committing.

**The data explorer's files** (EXFOR per-reaction data and ENSDF summaries,
`public/data/`) are not in git, apart from the index; build them on the host
before `make update`, once and again whenever `scripts/data/` or
`scripts/data/sources.json` changes:

```sh
sudo apt-get install -y python3-yaml     # PyYAML; git and python3 are already there
make data                                # ~8 min, ~600 MB of inputs in build/dx/, ~480 MB in public/data/
make update
```

The site image copies `public/data/`, so it grows by about 480 MB. Without
`make data` the site still builds and runs; the explorer pages then have the
index and the atlas nuclei, but no data points.

**The WebDAQ demo** (`/webdaq-demo/`, webdaq-demo/README.md) is built inside
the site image by its own stage of `deploy/Dockerfile.web`: it fetches the
WebDAQ frontend at the commit pinned in `webdaq-demo/pin.json` from GitHub,
applies the demo's overlay and exports static files into the image's
`public/webdaq-demo/`; Caddy turns its directory addresses into
`index.html` (`deploy/Caddyfile`). This adds about a minute and some 400 MB of
build cache to `make update`, and needs github.com and the npm registry
reachable from the build. Nothing runs on the server for it: the simulated
DAQ runs in the visitor's browser. To show a newer WebDAQ, change
`webdaq-demo/pin.json` (webdaq-demo/README.md, "Updating WebDAQ") and
`make update`. `make demo` builds it into `public/webdaq-demo/` outside
Docker.

## 6. Where things live

- **Evaluations:** `server/evaluations/` in the clone, bind-mounted into the
  API at `/app/evaluations`. The API writes AZURE2's `output/` and `checks/`
  files there, so the container user (`AZURE2_UID`) must be able to write to
  it. When it can't, `make logs-azure2` shows "is not writable by uid …" at
  startup, and every extrapolation recomputes its external-capture integrals
  (minutes for ⁷Be).
- **Certificates and the access log:** the `caddy_data` volume
  (`docker volume ls | grep caddy_data`), access log at `/data/access.log`
  inside the Caddy container.
- **Configuration:** `.env` (not in git).

## 7. Logs

```sh
make logs                # everything, followed
make logs-azure2         # the API: sessions opened, evicted, reaped
docker compose exec caddy tail -f /data/access.log
```

## 8. Backups

The repository is the source of truth for the site and the evaluations. Keep a
copy of `.env`. The certificates can be issued again, but a backup avoids
Let's Encrypt rate limits after a rebuild of the VPS:

```sh
mkdir -p ~/backups && chmod 700 ~/backups
docker run --rm -v website_caddy_data:/d:ro -v ~/backups:/b alpine \
  sh -c 'umask 077 && tar czf /b/caddy_data.tgz -C /d .'
```

(`website_` is the clone's directory name; check with `docker volume ls`.)
The archive holds the TLS private key and the access log, so it goes outside
the clone, readable by you alone, and off the machine (section 10) -- never
into git (`*.tgz` is ignored anyway).

## 9. When something fails

| Symptom | Cause and fix |
|---|---|
| Browser shows a certificate error; `make logs` shows `challenge failed` | DNS not pointing at the VPS yet, or port 80 blocked. Fix it, then `docker compose restart caddy`, once. Do not loop `make deploy`. |
| Build dies with `Killed` or `c++: fatal error` | Out of memory compiling AZURE2. Set `BUILD_JOBS=2` (or `1`) in `.env`, add swap, run `make deploy` again. |
| Build fails with `429 Too Many Requests` from Docker Hub | Too many anonymous image pulls. Wait an hour, or `docker login`. |
| `/evaluations` says the server cannot be reached | The API is down: `make check`, then `make logs-azure2`. |
| An evaluation says "all model slots are busy" | `AZURE2_MAX_SESSIONS` visitors are calculating at once (idle ones are evicted for a newcomer). Raise it if memory allows (section 1). |
| ⁷Be extrapolations end with "session expired" | The worker was killed for lack of memory (`dmesg | grep -i oom`). Add RAM or swap, or set `AZURE2_SPARES=0`. |
| After a deploy the first visitor of ⁷Be waits ~20 s | The caches are cold: `make warm` (it also measures the timings the page shows, and writes `initial.json`). |
| `git pull` refuses: local changes to `server/evaluations/.../output/intEC.*` | AZURE2 rewrote a cached integral file. `git checkout -- server/evaluations` and pull again. |
| Started on the wrong domain | Fix `SITE_DOMAIN` in `.env`, then `docker compose up -d caddy`. |
| `/evaluations` says "the server is busy" for one visitor while others work | That visitor's address is over a per-visitor limit (429 in `make logs-azure2`, "rate limit" / "Too many"): usually several people behind one office NAT. Raise `AZURE2_MAX_PER_IP` (section 10). If *everyone* is limited together, `AZURE2_TRUSTED_PROXIES` is not `1` (the API logs a warning). |

## 10. Security

What the stack does on its own, and the checklist for the VPS around it.

**Built in.** Every container drops all Linux capabilities (Caddy keeps the
one to bind ports 80/443), cannot gain privileges, runs as a non-root user
(site and API) on a read-only root filesystem, and is capped in memory, CPU and
processes; Docker keeps at most 3 x 10 MB of each container's log. Caddy
refuses request bodies over 64 KB, and the API does again. The API sends no
CORS headers (everything is same-origin) and limits each client address
(an IPv6 address counts by its /64) and each IPv6 network (/56):

| Variable (`.env`) | Default | What it limits |
|---|---|---|
| `AZURE2_MAX_PER_IP` | `2` | evaluations open at once; past it, that address's own stale session gives way, else "busy, retrying" (HTTP 429) |
| `AZURE2_MAX_PER_PREFIX` | `3` | evaluations open at once from one IPv6 /56 (a home line usually holds a whole /56, i.e. 256 /64s); same answer past it. IPv4 /24s are not capped |
| `AZURE2_MAX_AGE` | `1800` | seconds after which a session gives its slot to a waiting newcomer when the server is full, even with its page open; the page reopens it on its own, with its changes |
| `AZURE2_OPEN_RATE` | `10/60` | opening evaluations: 10 per 60 s |
| `AZURE2_EDIT_RATE` | `20/1` | level edits: 20 per second, bursts of 60 |
| `AZURE2_MAX_INFLIGHT_PER_IP` | `8` | slow requests (calculations) under way at once; keep it below `AZURE2_THREADS` (16) |

`0` turns one off. When the server is full, a newcomer takes, in this order:
the slot of a session nobody has seen for a minute; else the oldest session of
the network holding the most slots, if it holds at least two more than the
newcomer's (an IPv6 /56, an IPv4 /24: `AZURE2_V6_PREFIX`, `AZURE2_V4_PREFIX`);
else the oldest session past `AZURE2_MAX_AGE`; else "busy, retrying" (503).
So neither one /56 nor a handful of addresses can keep others out for more
than half an hour.

*Why IPv4 /24s are weighed but not capped.* A /24 is often one campus, one
office or a carrier's NAT pool, with many unrelated visitors; a hard cap
there would refuse them while the server has room. They are counted only
when the server is full, and then only to decide who gives way, so the cost
falls on a /24 that holds more than everyone else. The price: two colleagues
on one campus network, each with a model open, can lose the older one to an
outsider on a full server (the page reopens it once there is room again). To
stop grouping IPv4 addresses, set `AZURE2_V4_PREFIX=32`. An IPv6 /56 is
capped because it normally belongs to one household or one server. A session
evicted this way shows in `make logs-azure2` as "evicting ... of a network
holding N sessions" or "past AZURE2_MAX_AGE"; frequent ones mean
`AZURE2_MAX_SESSIONS` is too small for the traffic. These need the visitor's real address, which Caddy passes on and the API
believes because compose sets `AZURE2_TRUSTED_PROXIES=1`; never set that on an
API reachable without Caddy. Raise `AZURE2_MAX_PER_IP` to 4 if a whole
institute behind one address uses the site at once (a workshop).

**Container caps.** `make env` writes `AZURE2_MEM_LIMIT` (RAM - 1 GB) and
`AZURE2_CPUS` (vCPUs - 0.5) into a new `.env`; with an existing `.env`, add
them yourself (defaults: 3g and 2). A CPU cap above the machine's vCPUs stops
the container from starting. If `make logs-azure2` shows sessions dying and
`docker inspect --format '{{.State.OOMKilled}}' $(docker compose ps -q azure2)`
says `true`, the cap is below what `AZURE2_MAX_SESSIONS` needs (section 1):
lower that, or raise the cap. Apply a change with `docker compose up -d`.

**Logs and retention.** Caddy's access log (`/data/access.log` in the
`caddy_data` volume) stores addresses cut to /24 (IPv4) or /48 (IPv6), drops
cookies and credentials, rolls daily and deletes files older than 14 days
(`roll_keep_for 336h` in `deploy/Caddyfile`). The API's log, through Docker,
holds the same cut addresses and is rotated at 3 x 10 MB (`logging` in
`docker-compose.yml`). To change the retention, edit `roll_keep_for` (and the
14 in `components/pages/privacy.tsx`, which states it on /privacy), then
`docker compose up -d caddy`. Read the log with
`docker compose exec caddy tail -f /data/access.log`.

**Content-Security-Policy.** Set by the site itself (`next.config.mjs`;
`scripts/csp-static.mjs` writes it into the GitHub Pages build), enforced.
If a page ever breaks with a "Refused to ..." error in the browser console,
set `CSP_MODE=report-only` in `.env` and `make update`: violations are then
only reported in the console, nothing is blocked. `CSP_MODE=enforce` (the
default) switches it back. (Without Docker: `CSP_MODE=report-only npm run
build`. The GitHub Pages build can only enforce or have none.)

**The VPS checklist** (once, then monthly):

- [ ] **SSH keys only.** In `/etc/ssh/sshd_config`: `PasswordAuthentication no`,
  `PermitRootLogin no`, then `sudo systemctl reload ssh`, keeping a second
  session open until a new login works. Restrict port 22 to your own
  addresses in the OVH Network Firewall, or `sudo apt install fail2ban`.
- [ ] **Firewall: 80 and 443 only** (plus SSH):
  ```sh
  sudo ufw default deny incoming && sudo ufw default allow outgoing
  sudo ufw allow 22/tcp && sudo ufw allow 80/tcp && sudo ufw allow 443/tcp && sudo ufw allow 443/udp
  sudo ufw enable
  ```
  Docker publishes only Caddy's ports (the site and API are `expose`d to the
  stack alone), but Docker's own rules bypass `ufw`: never add `ports:` to
  `web` or `azure2`. Check from another machine: `nmap -Pn <vps>` shows 22,
  80, 443 only.
- [ ] **Unattended upgrades:** `sudo apt install unattended-upgrades &&
  sudo dpkg-reconfigure -plow unattended-upgrades` (security updates daily;
  reboots when `/var/run/reboot-required` appears, or set
  `Unattended-Upgrade::Automatic-Reboot "true";` with a night-time
  `Automatic-Reboot-Time`). The containers restart by themselves.
- [ ] **Docker and image updates, monthly:** `sudo apt upgrade` updates Docker
  itself; then `git pull && docker compose pull caddy && docker compose build
  --pull && docker compose up -d` takes the patched base images (Caddy 2.11.x,
  node 22; Ubuntu 22.04 is pinned by digest in `deploy/Dockerfile.azure2`, so
  it moves when you merge Dependabot's pull request for it). Bump Caddy's
  minor version in `docker-compose.yml` deliberately. Merge the Dependabot
  pull requests (pinned GitHub Actions, npm, the WebDAQ demo's npm, the
  hash-pinned pip files, the Docker base images) after their checks pass.
- [ ] **Backups**, off the machine and encrypted (e.g. `restic` to another
  provider's storage): `.env`, the `caddy_data` volume (section 8; it holds
  the TLS key) and any evaluation edited on the server and not committed.
  Restore once to check that it works.
- [ ] **Monitoring:** an external uptime check on `https://<domain>/` and
  `https://<domain>/api/health` (any free uptime service, alerting by email),
  and a disk alert (`df -h /` under 80%; the Docker build cache is the usual
  culprit: `docker builder prune`). `make check` shows the containers'
  health.
- [ ] **The `docker` group is root-equivalent:** only your own account in it,
  and that account with keys only.
- [ ] **After each deploy:** from another machine,
  `curl -sI -H 'Origin: https://evil.example' https://<domain>/api/health`
  has no `Access-Control-Allow-Origin`; a 100 KB POST to `/api/...` answers
  413; opening a third evaluation in a third tab says "busy, retrying".

**Changing the pinned downloads in CI** (`.github/workflows/pages.yml`): a new
Pyodide or Emscripten version needs its checksums too (Pyodide's also in
`XBUILDENV_SHA256` in `browser/azure2/build.sh`). The other pinned inputs:
GSL's commit (`GSL_COMMIT`, same file); the browser's Python packages, by
URL and SHA-256 from PyPI's JSON API (`PURE` in `browser/assemble.py`);
and the pip files `.github/requirements-*.txt` and
`deploy/requirements-azure2.txt`, regenerated with the `uv pip compile`
command at the top of each. Download the file,
`sha256sum` it, compare with a second source where there is one (GitHub's
release page shows a digest; nodejs.org publishes SHASUMS256.txt), and update
the `*_SHA256` values with the version; for emsdk, `git ls-remote
https://github.com/emscripten-core/emsdk refs/tags/<version>` gives
`EMSDK_COMMIT`, and `emscripten-releases-tags.json` at that commit gives
`EMSDK_RELEASE`. Record the NNDC ENSDF checksums once with
`python scripts/data/dx.py fetch-ensdf --source nndc --record` and commit
`scripts/data/sources.json`; CI then uses NNDC instead of the mirror.

**The WebDAQ demo in CI.** The Pages build fetches WebDAQ by the commit in
`webdaq-demo/pin.json` (git checks every object against it), checks the
SHA-256 of every upstream file the demo's overlay replaces (the
`overrides` in the same file) and installs JSROOT from the npm tarball whose
integrity `pin.json` records; `npm ci --ignore-scripts` installs the rest from
`webdaq-demo/package-lock.json`. The fetched source is cached by the commit
(written by main only, like the other caches). `scripts/size.mjs` then fails
the build if the demo is over its size budgets (`webdaq-demo/budgets.json`).
