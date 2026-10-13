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
/atlas/rates         reaction rates: how fast, and what if (pp, CNO, NeNa, MgAl)
/atlas/rates/s-process  the s-process: neutron sources, poisons and seeds, what if
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
| `AZURE2_MAX_SESSIONS` | how many evaluations may be open at once (spare sessions included). Each is a few worker processes (the model, its plot curves, its extrapolations: AZURE2 does not keep two models of one process apart): 0.2–0.3 GB for most evaluations, 0.43 GB for ²⁴Mg and 0.87 GB for ⁷Be with everything prepared. DEPLOY.md has the table and how many fit per GB. |
| `AZURE2_SESSION_TTL` | seconds before a session of a page that sends no heartbeat is reaped (600); a page that pings is closed `AZURE2_HEARTBEAT_TTL` (120) seconds after its pings stop. |
| `AZURE2_SPARES` | `auto` (default): keep one session of each slow evaluation (⁷Be, ²⁴Mg) opened and prepared for the next visitor, so their first edit takes ~2 s instead of 20–60 s; `0` to turn off; or `7Be:1,24Mg:1`. |
| `AZURE2_OMP_THREADS` | OpenMP threads per worker for calculations. Edits do not run in parallel in AZURE2, so `1` is right. |
| `AZURE2_PREPARE_THREADS` | OpenMP threads while a worker *builds* a model (external-capture integrals), which does scale: all cores by default. |
| `AZURE2_THREADS` | Waitress' HTTP threads. Unrelated to the above — these serve requests, they do not run AZURE2. |

server/README.md documents the API, the scheduling (per-worker locks, the
latest edit wins, background preparation) and the rest of the knobs
(`server/config.py`).

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

### The reaction rates explorer

`/atlas/rates` (and `/atlas/rates/s-process`) plot REACLIB rates against
temperature, show how long a nucleus waits before each reaction at a chosen
site, and rerun a one-zone burn when a rate is scaled. Everything runs in the
browser from static files, so it works the same on the server and on GitHub
Pages.

```
scripts/rates/networks.yaml     the networks, as data (nuclei, selection, key reactions)
scripts/rates/scenarios.yaml    the astrophysical sites, every value with its source
scripts/rates/pyna_export.py    pynucastro → network JSON, as importable functions
scripts/rates/build.py          writes public/rates/<id>.json        (Python, pynucastro)
scripts/rates/reference.py      pynucastro + scipy BDF answers       (Python, pynucastro)
scripts/rates/evaluated_rates.py  ¹²C(p,γ), ¹³C(p,γ) from the 13N/14N evaluations (Python, pyazr)
scripts/rates/evaluated/        their N_A⟨σv⟩ tables, read by build.py
scripts/rates/baseline.mjs      the precomputed first view           (Node, the browser's solver)
scripts/rates/sensitivity.mjs   every rate ×2 in turn, per scenario   (written by baseline.mjs)
scripts/rates/test.mjs          npm run test:rates: browser vs pynucastro
scripts/rates/curiosity-cards.mjs  the curiosities' 1200×630 social cards (sharp; committed)
lib/rates/curiosities.ts        the "what if a rate were twice as fast" sentences (words only)
lib/rates/                      schema, rate providers, screening, sparse LU, solver, worker
components/rates/               the explorer's charts and controls
```

The JSON is committed: `npm run build` needs no Python. To change a network,
a scenario or the REACLIB snapshot:

```sh
pip install pynucastro numpy scipy pyyaml numba
python scripts/rates/build.py          # public/rates/<id>.json
python scripts/rates/reference.py      # scripts/rates/reference/<id>.json
npm run rates:baseline                 # public/rates/<id>.baseline.json, <id>.sensitivity.json
npm run test:rates                     # must pass
```

A scenario can change during the burn: the novae start at their peak and
cool as the envelope expands (`history: {kind: cooling, tau_s, rho_exp}` in
`scenarios.yaml`, T ∝ e^(−t/τ), ρ ∝ T³), written into the network file as a
`profile` the solver interpolates (`historyOf` in `lib/rates/run.ts`);
`reference.py` integrates the same profile with scipy.

The "Use the LUNA/AZURE2 rates" switch on the CNO page runs ¹²C(p,γ)¹³N and
¹³C(p,γ)¹⁴N with rates computed from the site's own evaluations
(`server/evaluations/13N`, `14N`): `evaluated_rates.py` asks AZURE2 (pyazr,
`PYTHONPATH=<pyazr>`) for each evaluation's cross section at its shipped
parameters on a grid of its own (a derived copy of the .azr with only its
extrapolation segments replaced: 1 keV to 4 MeV, refined around narrow
levels), integrates the Maxwell–Boltzmann average numerically and writes a
table; `build.py` puts it into the network file as the reaction's
`alternatives`. Rerun it when an evaluation changes. The switch is off
until `LUNA_RATES_PUBLIC` in `lib/rates/features.ts` is set to true (the
tables and their tests are in place either way; the LUNA marks always show). The LUNA marks and the
"newer data" notes come from the atlas (`content/atlas/reactions/*.yaml`:
underground measurements and evaluations newer than the REACLIB sets).

The s-process network (`builder: sprocess` in `networks.yaml`; 481 nuclei,
721 reactions) is built by `s_process_rates` in `pyna_export.py`: every
nucleus of Lodders' solar mixture from iron to polonium, closed under (n,γ)
from anything living longer than six hours and under decay, plus the light
nuclei that make and steal the neutrons. `reference.py` integrates it with
numba's JIT switched off (a child process; compiling it would take longer
than running it), about a minute for its three scenarios.

The curiosities (`/atlas/rates/curiosities`, three at a time on the explorer
pages) are sixteen sentences whose numbers are read at build time from the
sensitivity tables; `test:rates` reruns the solver for each and fails when a
sentence would read differently, or when a social card in
`public/rates/cards/` is stale (rerun `node scripts/rates/curiosity-cards.mjs`
with `SITE_URL` set, so the cards print the site's address).

Accuracy (`npm run test:rates`): rates agree with pynucastro's `Rate.eval`
to 1e-11; burns at rtol 1e-6 agree with pynucastro's own network integrated
by scipy BDF to ≤ 2.3e-6 (light networks) and ≤ 1.4e-6 (s-process), and at
the tolerances the explorer uses (1e-4; 1e-3 for the s-process) to ≤ 8e-5.

Physics checks in `npm run test:rates`: no decay of a nucleus that NUBASE2020
(the atlas' `nubase2020-halflife.txt`) gives as stable or longer-lived than
10⁸ years, every half-life as NUBASE2020 has it, ²⁶Al decaying with its
laboratory half-life at hydrogen-burning temperatures, the mass fractions
conserved at both ends of every composition slider, and the bottleneck of a
hot cycle found on its slow decays. REACLIB's decays are not taken blindly:
`lab_decays` in `pyna_export.py` drops those of (practically) stable nuclei
(REACLIB gives ⁹⁶Zr a 7-year β⁻ decay and ¹²³Te a 100-second β⁺) and adds the
ground-state decay of ²⁶Al, which REACLIB lacks (its entry is only the
thermally populated isomer). ¹⁶⁴Er and ¹⁷⁶Hf, which need stellar decays the
network does not have, are marked `not_modelled` in `networks.yaml`.

#### Design

Made to be reused when pynucastro also runs on the server and stellar
tracks drive the network:

- **The network file is a versioned schema** (`schema`, `schema_version`;
  `lib/rates/schema.ts`, documented in `pyna_export.py`). Units are in the
  field names (`T9`, `time_s`, `Q_MeV`, `halfLife_s`) and spelled out in
  `units`; every reaction carries its rate as data (`rate.kind: "reaclib"`
  with the seven coefficients of each set and the fit's validity range; a
  `"table"` kind is already understood) and its provenance (REACLIB set
  labels with author, reference and link). Nothing about a network is written
  in a component: key reactions, the cycle whose slowest step is the
  bottleneck, the default plot reference and the nuclei shown first are in
  `ui`.
- **The solver is a pure TypeScript module** (`lib/rates/solver.ts`, no DOM):
  `integrate(compile(network), {scale, history, X0, tEnd_s, until,
  screening})` returns abundances over time. `history` is constant T and ρ or
  a time series `{t_s[], T9[], rho[]}` (a MIST central track, later the
  output of a stellar code). The equations are pynucastro's term for term,
  with its `screen5` screening; the integrator is an L-stable Rosenbrock
  method (ode23s) on a sparse LU whose fill is found once per network. The
  Web Worker (`lib/rates/worker.ts`) and the Node scripts run the same code;
  Node 22 imports the `.ts` files directly.
- **Rates sit behind one interface**, `RateProvider.rate(reactionId, T9) →
  N_A⟨σv⟩` (`lib/rates/rate-provider.ts`). The network's own REACLIB fits are
  the default; `overrideProvider` swaps in any reaction from elsewhere (a
  server-computed table, an AZURE2 evaluation) without touching the solver.
- **pynucastro is called from functions** (`scripts/rates/pyna_export.py`:
  `network_rates`, `export_network`, `resolve_composition`,
  `python_network`), so a server endpoint can build a network for a spec of
  its own and hand the same JSON to the same solver.
- **Derived physics is pure and shared**: `lib/rates/composition.ts` (the
  composition sliders, mass conserved), `lib/rates/flow.ts` (the path the
  flow takes, its bottleneck with branchings, integrated flows),
  `lib/rates/analysis.ts` (decays after a burn, MACS, neutrons per seed),
  `lib/rates/first-view.ts` (what the s-process page sends with its HTML).
  test:rates, the baselines and the page call the same functions.

The page is built for speed: the first light network and its precomputed
burn are sent with the HTML (`preloadNetwork` in `lib/rates/catalog.ts`), so
the first chart is drawn on the server with no request and no worker; the
s-process page sends its first site's production factors (a few kB) and
loads the 500 kB network behind them. Burns run in the worker, which fetches
the network files itself; a newer request supersedes a queued one, and a
stale s-process run in progress is cancelled by restarting the worker. On
the page, results arrive as React transitions and the conditions are
deferred, so a slider drag keeps the main thread; closed folds and
downloads are built on demand and sections below the fold use
`content-visibility`. The sensitivity map is precomputed
(`<id>.sensitivity.json`, loaded when asked for) and the Gamow peak is
computed in closed form.

The charts share one colour language (`components/rates/chart-kit.tsx`):
the three series colours of `lib/viz.ts` mark identity (a picked reaction
keeps its colour in every chart), grey is the unchanged burn and context,
ink is what the page points at (the bottleneck, the current temperature),
and violet/brown are "more"/"less" and the result of a change. A dash means
"unchanged" and nothing else; marker shapes are the second cue of identity.

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

#### The model curves on the plot

The Plot & data tab draws the model as a smooth curve, not as a line joining
its values at the data points: one curve per distinct calculation (same
channels, observable and angle; ⁷Be's 120 datasets need 106), calculated on
its own grid in AZURE2's extrapolation mode (`server/app/fine.py`):

- from a third of the lowest measured energy (for a charged-particle reaction
  further, down to the Gamow peak at T₉ = 0.01; never below 10 keV c.m., nor
  below the threshold of an exit channel that opens above the entrance) up to
  15% above the highest;
- 240 log-spaced points over all of it, 160 uniform points over the data's own
  range, and around every resonance of the level scheme (E_R = E_x − entrance
  threshold, Γ the sum of its partial widths, at the shipped parameters) nested
  pieces at ±5Γ, ±1.5Γ and ±Γ/2 wherever they are finer than the grid already
  there, so a narrow resonance is neither missed nor cut. AZURE2's grids are
  uniform, so this is written as pieces and joined.

The page draws it solid over the shown data's range and dashed beyond
("Extend beyond data", on by default, which also widens the energy axis). A
dataset AZURE2 folds with the target or the detector (`<targetInt>`), where the
curve does not reproduce the data-mode values, keeps its own line through its
points; one whose energy shift moves it next to a narrow resonance gets the
curve shifted. At the shipped parameters the curves come from
`precomputed.json` (`make warm`, which also writes `initial.json`, what the page
draws before its session has started, with the evaluation's typical timings);
as soon as a session opens the server builds the derived models in the
background, one worker each, so an edit never waits for the extrapolations' model
and the first one answers with the new curve in about two seconds.

#### Total capture and `split_total_capture`

AZURE2 at the pinned revision (`7e533b7`) calculates a total capture over
several capture pairs (a data segment with exit `-1`) as the first pair plus one
*component segment* per further pair, and mishandles the components'
external-capture integrals whenever `output/intEC.*` already exists: if the
file holds only the regular segments' integrals (as the shipped ones do) the
components read zeros, so the total is the first transition alone; if it holds
both, the count check fails and the components read the wrong numbers
(`EData::CountECAmplitudes` counts regular segments only, while
`InitializeComponentSegments` reuses the file whatever that check decided). A
fresh calculation is right. 17F's total capture came out ~15x low, 7Be's
³He(α,γ) ~20% low.

An evaluation opts in to the workaround with `"split_total_capture": true` in
its `info.json`: the server then calculates the data through a copy of the model
in which each total capture is one angle-integrated segment per capture pair
(appended, with fixed normalisations, so no key or free parameter moves) and
sums them back (`server/app/fine.py` `split_data_model`, `server/app/engine.py`);
the extrapolations and the fine-grid curves likewise. Those integrals can be
reused, and live in `datamodel/` and `extrapolations/` (not committed). Without the
flag a total capture is calculated as AZURE2 does as shipped, so a published
fit looks exactly as published. It is set for 17F, 7Be and 23Na, where the
corrected total reproduces the data; 14N is left off (corrected, its LUNA total
capture is 20% above the data, χ²/N 0.9 → 95: the fit needs checking). The flag
is part of the results-cache key, so toggling it recalculates.

### The data explorer's data

`scripts/data/` turns EXFOR (measured reaction data, IAEA/NRDC, CC BY 4.0)
and ENSDF (levels and γ-rays, NNDC) into JSON under `public/data/`: an index
of every dataset in scope (charged-particle reactions on Z ≤ 30, s-process
captures and MACS, neutron reactions on Z ≤ 30), one file per reaction with
the points, and a summary per nucleus. Both sources are pinned
(`scripts/data/sources.json`). The index and the atlas nuclei's ENSDF files
are committed; the per-reaction files (~460 MB) are built by `make data`
(and by the Pages workflow), so the site builds without them. Exports for a
selection: AZURE2 data files with a stub `<segmentsData>`, CSV, JSON, BibTeX
(`python scripts/data/dx.py export ...`). Tests: `npm run test:data`.
Everything else — scope, rules, schemas, the AZURE2 column layout, licences —
is in `scripts/data/README.md`.

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
  built, so they appear at once (²⁴Mg: data, curves and extrapolations in
  0.1–0.2 s each). After an edit the browser recalculates, on one core: from
  under a second (¹⁴N data) to a minute or more for ⁷Be.
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
scripts/data/        EXFOR + ENSDF → public/data/ (the data explorer's data)
lib/api.ts           client for the AZURE2 API
server/              the Flask API
server/app/engine.py one AZURE2 model per process
server/evaluations/  the .azr models and their data
deploy/              Dockerfiles and Caddyfile
browser/             the GitHub Pages build: AZURE2 in WebAssembly, in the page
lib/browser-engine.ts  client for it
_source/             original CV and raw notes, not published
```
