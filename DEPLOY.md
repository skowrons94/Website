# Deployment checklist

The whole site runs as three containers from `docker-compose.yml`: Caddy
(TLS, ports 80/443), the Next.js site, and the AZURE2 API. README.md
("Deploying") explains the design; this file is the list of things to do.

## 1. The VPS

- Ubuntu 22.04/24.04 or Debian 12, 2+ vCPU.
- **Memory: 4 GB or more, plus 2–4 GB of swap.** The site, Caddy and the idle
  API use about 250 MB, and an open evaluation 35–100 MB. The exception is the
  ⁷Be extrapolations: computing them takes one worker to about 3.6 GB until the
  visitor closes the tab. With less memory the kernel kills that worker and the
  page says the session expired; the rest of the site keeps running.
- **Disk: 5 GB free** for the images (about 650 MB) and the build cache.
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

| Variable | Set it to |
|---|---|
| `SITE_DOMAIN` | the bare domain, e.g. `jskowron.eu` (no `https://`, no `www`) |
| `ACME_EMAIL` | your address, for certificate expiry warnings |
| `BUILD_JOBS` | `2` on a VPS with 2 GB of RAM or less; leave unset otherwise |
| `AZURE2_UID`, `AZURE2_GID` | the owner of `server/evaluations` (`make env` fills these in; check with `stat -c '%u:%g' server/evaluations`) |
| `AZURE2_MAX_SESSIONS` | how many evaluations may be open at once (default 8); lower it on a small box |

Clone as the user that will run `make`, not as root, so the evaluations
directory belongs to that user and `make env` picks the right ID.

## 4. First deploy

```sh
make deploy              # docker compose up -d --build, then make check
```

The first build takes about 4 minutes on 4 cores (2.5 of them compiling
AZURE2) and needs about 2 GB of RAM at `BUILD_JOBS=4`. Then:

- `make check`: all three containers `Up`, azure2 `(healthy)`, and
  `azure2: {... 'evaluations': 8, 'status': 'ok'}`.
- `https://<domain>/` loads with a valid certificate; `http://` and
  `https://www.<domain>` redirect to it.
- `https://<domain>/api/health` returns JSON with `"evaluations": 8`.
- `https://<domain>/evaluations` lists 8 evaluations. Open ¹³N: the level
  scheme appears within a few seconds, and the Plot tab shows curves.
- `https://<domain>/atlas` and `https://<domain>/it` load.

Then fill the results cache, once:

```sh
make warm                # about 2 minutes; prints one line per evaluation
```

Each evaluation's data and extrapolation curves at its published parameters
are stored next to the model (`server/evaluations/<id>/precomputed.json`) and
served from there until a visitor edits a level. Without it the first visitor
to open the ⁷Be extrapolations waits about 2.5 minutes; with it, about 2
seconds. The cache fills itself anyway as visitors use the site, and it
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
`make evaluations` (restarts the API, no rebuild), then `make warm`.

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
| An evaluation says "all model slots are busy" | `AZURE2_MAX_SESSIONS` visitors have evaluations open. Raise it if memory allows; idle sessions are closed after `AZURE2_SESSION_TTL` seconds. |
| ⁷Be extrapolations end with "session expired" | The worker was killed for lack of memory (`dmesg | grep -i oom`). Add RAM or swap. |
| `git pull` refuses: local changes to `server/evaluations/.../output/intEC.*` | AZURE2 rewrote a cached integral file. `git checkout -- server/evaluations` and pull again. |
| Started on the wrong domain | Fix `SITE_DOMAIN` in `.env`, then `docker compose up -d caddy`. |
