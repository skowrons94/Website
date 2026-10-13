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
  is on, and in `ufw` if you use it. Nothing else needs to be reachable.

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
docker run --rm -v website_caddy_data:/d -v "$PWD":/b alpine \
  tar czf /b/caddy_data.tgz -C /d .
```

(`website_` is the clone's directory name; check with `docker volume ls`.)

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
