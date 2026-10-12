# skowronski — personal site

Next.js 15 (App Router, Tailwind, KaTeX) and a Flask + AZURE2 service, in one
repository and one `docker compose` stack. The personal/academic pages and the
interactive R-matrix evaluations are served from the same origin, so there is no
CORS configuration anywhere and nothing to point at anything else.

```
/                    landing
/research            research threads
/notes               explanatory notes, Markdown + LaTeX
/notes/[slug]
/evaluations         the AZURE2 evaluation UI
/evaluations/[id]
/atlas               the reaction atlas: introduction and network map
/atlas/[id]          one reaction or decay
/atlas/timeline
/atlas/methods       methods and laboratories
/atlas/data.json     the whole atlas, written at build time
/software
/publications
/cv
/it/…                the same pages in Italian (every route above, under /it)
```

## Deploying

Requires a host with Docker and Compose, and the domain's A/AAAA records
pointing at it. Nothing else — the AZURE2 engine is compiled inside the image.

The step-by-step list (sizing, `.env`, verifying, updating, fixing) is
[DEPLOY.md](DEPLOY.md).

```sh
git clone <this repo> && cd Website
cp .env.example .env       # set SITE_DOMAIN and ACME_EMAIL
make deploy                # == docker compose up -d --build
```

Caddy obtains the certificate on first start and renews it thereafter.

```
caddy   :80 :443   TLS, static compression, routing
  ├── /api/*  →  azure2:5001    Flask + the AZURE2 engine
  └── /*      →  web:3000       this site
```

`make` on its own lists the rest: `update` (rebuild the site alone), `check`,
`logs`, `evaluations`, `restart`, `down`.

### On OVH, concretely

Two separate things, in two different parts of the control panel. They are easy
to confuse, and the domain half is the one that must be done *first*.

**1. The DNS zone** — Web Cloud → Domain names → *your domain* → DNS zone.

| Type | Subdomain | Target |
|---|---|---|
| `A` | *(leave blank — this is the apex)* | the VPS' IPv4 |
| `A` | `www` | the same IPv4 |
| `AAAA` | blank, and `www` | the VPS' IPv6 — **only if it actually works** |

A freshly bought OVH domain arrives with the zone already populated, pointing at
OVH's parking page. **Delete those records**, or they will contend with yours.

Both names are needed because Caddy asks for a certificate per hostname it
serves, and `deploy/Caddyfile` serves the apex and redirects `www` to it. Drop
the `www` block from the Caddyfile if you would rather not have one.

On IPv6: several OVH VPS images ship without a working IPv6 route, and an `AAAA`
record pointing at an address that does not answer makes the site unreachable
for anyone whose connection prefers IPv6. Add it only once `curl -6 https://ifconfig.co`
succeeds *from the VPS*.

**2. The VPS** — install Docker and the Compose plugin, then clone and deploy.
Only 80 and 443 need to be reachable; the site and the API are on `expose:`, not
`ports:`, so neither 3000 nor 5001 is published to the host at all. If the OVH
Network Firewall is switched on for the IP (it is off by default), allow TCP 80
and 443 — and UDP 443 too, or HTTP/3 is simply skipped.

**Wait for DNS before the first deploy.** Check it from the VPS itself:

```sh
dig +short jskowron.eu        # must return the VPS' own IPv4
```

Let's Encrypt validates by connecting to port 80 on whatever the name resolves
to, so a deploy that runs before the record propagates will fail. Caddy retries
with backoff, but Let's Encrypt rate-limits failed validations (5 per hostname
per hour) — so fix the DNS and wait rather than re-running `make deploy` in a
loop. `make logs` shows what it is doing.

### The first build

The AZURE2 image compiles the engine and Minuit2 from source; it took about
three minutes on an 8-core machine, and the result is ~340 MB. It is built once
and left alone thereafter — publishing content rebuilds only the site:

```sh
git pull && make update
```

**On a small VPS, cap the compile.** At one job per core the build needs more
memory than a 2 GB box has, and the C++ compiler is killed with no clear
message. Put `BUILD_JOBS=2` in `.env` and it fits.

### Tuning

`.env` carries the knobs, all optional:

| | |
|---|---|
| `AZURE2_MAX_SESSIONS` | how many evaluations may be open at once. Each is a worker process holding a model. Measured: the API idles at ~45 MB and an open session costs 35–100 MB depending on the model, so 8 open evaluations fit in well under 1 GB. The exception is the `7Be` **extrapolations**: computing them takes that worker to ~3.6 GB until the session closes. This is what bounds memory; see DEPLOY.md. |
| `AZURE2_SESSION_TTL` | seconds before an abandoned session is reaped. |
| `AZURE2_OMP_THREADS` | OpenMP threads per worker. Total load is sessions × threads, so `1` is the right default until the box is large. |
| `AZURE2_THREADS` | Waitress' HTTP threads. Unrelated to the above — these serve requests, they do not run AZURE2. |

## Adding content

**Everything editable lives in `content/`.** Nothing has to be registered
anywhere — a file's existence is its registration. After editing, `make update`.

### A new note

Create `content/notes/my-note.md`. The filename becomes the URL.

```markdown
---
title: The title, as it appears everywhere
summary: >-
  One or two sentences. Used on the index, on the landing page, and as the
  page description for search engines.
date: 2026-08-05
topic: R-matrix theory      # groups the note on the index page
featured: true              # optional: pins it to the top and to the landing page
references:                 # optional: numbered list at the foot of the note
  - "A. Author, *Title*, Journal **1**, 1 (2026)."
---

Prose. Inline maths with `$...$`, display maths with `$$...$$` — KaTeX renders
both at build time. Tables, footnotes and task lists work (GFM). Headings at
`##` become the sticky table of contents; `###` do not.
```

Reading time is estimated automatically; set `readingTime:` to override it.

Nuclide notation can be typed as Unicode — `¹²C(p,γ)¹³N`, `MeV⁻¹` — anywhere in
`content/`, in the Markdown and in the YAML alike. It is turned into real
`<sup>`/`<sub>` markup when rendered, which is what makes it set in the page's
own font. (Typing the characters is only a convenience: the web fonts cover
`¹ ² ³` but not `⁰ ⁴ ⁵ ⁶ ⁷ ⁸ ⁹` or any subscript, so left alone `¹⁵O` renders
half in Inter and half in whatever the reader's system substitutes.)

#### One rule about `$$` that matters

A display block must have its delimiters **on their own lines**, or sit entirely
on **one line**. A `$$` that opens with content beside it and closes on a later
line is not a block the Markdown parser recognises, and it will swallow the rest
of the file into a single expression:

```markdown
$$
\hat{n} = \frac{a}{b}          ✅  delimiters on their own lines
$$

$$\hat{n} = \frac{a}{b}$$      ✅  all on one line

$$\hat{n} = \frac{a}
              {b}$$            ❌  opens inline, closes on a later line
```

`npm run build` prints a warning naming the file and the KaTeX parse error if
this (or any other bad expression) slips in, so watch the build output after
adding a note. A long equation that will not fit the column is best broken up
with `\begin{aligned} … \\ … \end{aligned}` rather than left to scroll.

### A new paper

Append an entry to `content/publications.yaml`:

```yaml
  - kind: article           # article | proceedings
    highlight: true         # optional: marks it as a leading-role paper
    authors: J. Skowronski, et al.
    title: The title
    journal: Phys. Rev. C 999, 012345
    doi: 10.1103/PhysRevC.999.012345
    year: 2026
```

Sorted by `year` descending; within a year the file order is preserved, so place
a new same-year entry where you want it to appear. Use `status:` instead of
`journal:` for anything not yet published (`status: under review at Nature`).

### A new experience, award, talk

`content/experience.yaml` and `content/talks.yaml`. Every section is a list of
the same shape, so a new row needs no code change:

```yaml
  - period: Sep 2026 — present
    title: What it is
    detail: Where, and any one-line context
    bullets:                # optional
      - A specific contribution
```

`content/profile.yaml` holds the name, tagline, landing-page paragraphs and
external links. `content/research.yaml` holds the long-form research threads.

### The Italian pages

Every page also exists in Italian, under `/it`, statically generated in both
builds; the EN / IT switch in the header goes to the same page in the other
language. **To translate content**, add a field with the suffix `_it` beside
the English one in the same YAML file: `role_it` beside `role`, `intro_it`
beside `intro`, `summary_it` beside `summary` in an atlas reaction. Anything
without a translation is shown in English on the Italian page, so a new entry
can go live in English first. UI strings (buttons, labels, headings) are in
`lib/i18n.ts`, one dictionary per language; a key added to `en` must be added
to `it` too, or TypeScript complains. The notes are not translated:
`/it/notes` lists them and says they are in English. Run `npm run check:atlas`
after translating the atlas: it lists what is still untranslated.

### Adding to the atlas

Everything under `/atlas` comes from `content/atlas/`; its own
[README](content/atlas/README.md) gives the schema of every file. A new reaction
is a new file in `content/atlas/reactions/`, named after its id
(`14N-pg-15O.yaml`), plus its id in a network of `networks.yaml` if it should be
on the map. A reaction listed in a network before its file exists is shown as
"entry in preparation", built from the id.

Q-values, Gamow windows and half-lives are computed from the AME2020 and
NUBASE2020 tables in `nuclear-data/`; never type them into a reaction file.

```sh
npm run check:atlas      # validate content/atlas, list errors and warnings
```

`npm run build` runs the same check first (`prebuild`), and stops on an error:
a field of the wrong kind, an id that points nowhere, a file whose name is not
its id, a reference key defined twice with different DOIs, a reference without
`checked`. Warnings (a reaction without a file yet, a facility with only a name)
are printed and the build goes on. The prebuild then writes the whole database,
derived numbers included, to `public/atlas/data.json` with
`scripts/atlas-export.mjs`; that file is generated, not committed.

`ATLAS_DIR=/some/copy npm run check:atlas` (or `… npx next build`) points the
check and the site at another copy of the directory, for trying out changes.

### Software

`content/software.yaml`, one entry per program; the comment at the top of the
file lists the fields.

### A new evaluation

Drop a directory containing a `.azr` file into `server/evaluations/`, with its
`data/` beside it and an optional `info.json`:

```json
{
  "id": "13N",
  "title": "^{13}\\text{N}",
  "reference": "10.1103/PhysRevC.111.035802",
  "paper": {"authors": "J. Skowronski et al.", "title": "…",
            "journal": "Phys. Rev. C 111, 035802", "year": 2025},
  "analysis": "J. Skowronski",
  "channels": ["p", "\\gamma", "\\gamma_{1}"],
  "datasets": {"kettner_0": {"label": "Kettner 2023",
                             "ref": "Phys. Rev. C 108, 035805 (2023)",
                             "doi": "10.1103/PhysRevC.108.035805"}}
}
```

`paper.authors` is the paper as cited (first author et al.); `analysis` is who
did the R-matrix analysis — they need not be the same person. `datasets` names
data files (by stem), as a plain string or with their source.

`title` and `channels` are rendered as LaTeX, and both are optional: with no
`info.json` at all the compound nucleus and the channel labels are derived from
the model's own particle pairs. The directory is bind-mounted into the API
container, so `make evaluations` serves it at once; its page, though, is
generated when the site is built (an id the build has not seen is a 404), so
run `make update` too.

Only the inputs are committed. `output/` and `checks/` are regenerated, with one
exception: `output/intEC.dat` and `output/intEC.extrap` hold the external-capture
integrals, which take minutes to recompute, so those two are kept. `fine/` is
written by the server (the model on a fine grid for the plots,
`server/app/fine.py`) and is not committed.

## Development

```sh
npm install
make dev-site          # http://localhost:3000
```

The evaluation pages need the API, which needs `pyazr` — the Python half of
AZURE2. Build AZURE2 with `-DUSE_API=ON` and either `pip install` it or point at
the checkout:

```sh
make dev-server                        # AZURE2_SRC=../AZURE2 by default
make dev-server AZURE2_SRC=/path/to/AZURE2
```

The rest of the site works without it.

## GitHub Pages (no server)

The same site also builds as plain files for GitHub Pages, with AZURE2 running
in the visitor's browser instead of on a server. `.github/workflows/pages.yml`
does it on every push to `main`. To turn it on once: Settings → Pages →
Source: **GitHub Actions**. The site is then at
`https://<user>.github.io/<repository>/`.

Everything works as on the server — level scheme, data, plots, parameter edits,
extrapolations, downloads — with three differences:

- The first evaluation a visitor opens takes about ten seconds: Python and the
  engine (about 20 MB, cached by the browser afterwards) are loaded then.
- Results at an evaluation's own parameters were calculated when the site was
  built, so they appear at once. After an edit the browser recalculates, on one
  core: from under a second (¹⁴N data) to several minutes (the ⁷Be
  extrapolations, which carry external-capture integrals).
- An evaluation added under `server/evaluations/` appears after the next build,
  not immediately.

How it works, and how to build it locally: `browser/README.md`.

## How the two halves fit together

**`API_BASE` is inlined at build time**, not read at runtime — it ends up in the
client bundle. It is deliberately set to the empty string in `docker-compose.yml`,
which makes every API call same-origin and relative. The image therefore contains
no hostname and works under any domain.

**Each open evaluation owns an AZURE2 process.** Since pyazr 2.8 the engine is a
pybind11 extension module rather than a subprocess spoken to over a socket, so
it runs *inside* a Python interpreter — and a model names its files relative to
the process' working directory, which a process has only one of. Each session
therefore gets an interpreter of its own (`server/app/engine.py`), which is also
what keeps a crash in the engine from taking the API down with it. Workers are
children blocked on a pipe, so they exit by themselves if the server dies, however
it dies.

The engine and `pyazr` must come from the same build — `deploy/Dockerfile.azure2`
compiles one and installs the other from the same tree, at a pinned commit, so a
rebuild cannot quietly change the physics the published evaluations are
calculated with.

## Layout

```
app/(en)/            routes of the English pages (thin: they render components/pages)
app/it/              the same routes in Italian
components/pages/    the page bodies, shared by both languages (`lang` prop)
lib/i18n.ts          UI strings in both languages, and the /it path helpers
lib/localize.mjs     picks `*_it` fields from the content, English as fallback
components/          site shell, plus the evaluation UI
components/sci.tsx   Unicode super/subscripts → <sup>/<sub>
content/             ← everything you edit
lib/content.ts       the loader: Markdown + YAML → typed objects, at build time
lib/atlas-core.mjs   the atlas loader and its physics (Q, Gamow window, half-life)
lib/atlas.ts         the same, typed, for the pages
components/atlas/    the network map, timeline and badges
scripts/             atlas check and JSON export, run before every build
lib/api.ts           client for the AZURE2 API
server/              the Flask API
server/app/engine.py one AZURE2 model per process
server/evaluations/  the .azr models and their data
deploy/              Dockerfiles and Caddyfile
browser/             the GitHub Pages build: AZURE2 in WebAssembly, in the page
lib/browser-engine.ts  client for it
_source/             original CV and raw notes, not published
```
