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
/publications
/cv
```

## Deploying

Requires a host with Docker and Compose, and the domain's A/AAAA records
pointing at it. Nothing else — the AZURE2 engine is compiled inside the image.

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

### The first build

The AZURE2 image compiles the engine and Minuit2 from source; expect roughly ten
minutes on a decent box. It is built once and left alone thereafter — publishing
content rebuilds only the site:

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
| `AZURE2_MAX_SESSIONS` | how many evaluations may be open at once. Each is a worker process holding a model; budget a few hundred MB per slot for the larger ones. This is what bounds memory. |
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

### A new evaluation

Drop a directory containing a `.azr` file into `server/evaluations/`, with its
`data/` beside it and an optional `info.json`:

```json
{
  "id": "13N",
  "title": "^{13}\\text{N}",
  "reference": "10.1103/PhysRevC.111.035802",
  "author": "J. Skowronski",
  "channels": ["p", "\\gamma", "\\gamma_{1}"]
}
```

`title` and `channels` are rendered as LaTeX, and both are optional: with no
`info.json` at all the compound nucleus and the channel labels are derived from
the model's own particle pairs. The directory is bind-mounted into the API
container, so `make evaluations` is enough — no rebuild.

Only the inputs are committed. `output/` and `checks/` are regenerated, with one
exception: `output/intEC.dat` and `output/intEC.extrap` hold the external-capture
integrals, which take minutes to recompute, so those two are kept.

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
app/                 routes
components/          site shell, plus the evaluation UI
components/sci.tsx   Unicode super/subscripts → <sup>/<sub>
content/             ← everything you edit
lib/content.ts       the loader: Markdown + YAML → typed objects, at build time
lib/api.ts           client for the AZURE2 API
server/              the Flask API
server/app/engine.py one AZURE2 model per process
server/evaluations/  the .azr models and their data
deploy/              Dockerfiles and Caddyfile
_source/             original CV and raw notes, not published
```
