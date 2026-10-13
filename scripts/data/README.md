# The nuclear data explorer's data pipeline

EXFOR (measured reaction data) and ENSDF (nuclear levels) → schema-versioned
JSON under `public/data/`, served as `/data/...`. Python 3.10+, standard
library plus PyYAML (atlas files); `pytest` and `jsonschema` for the tests.

```sh
python scripts/data/dx.py fetch-exfor            # bare clone of exfor_master at the pinned commit (~270 MB)
python scripts/data/dx.py build-exfor            # index + every shard (~6 min on 4 cores)
python scripts/data/dx.py fetch-ensdf            # NNDC archive, else the pinned mirror
python scripts/data/dx.py build-ensdf            # ENSDF summaries of the scope's nuclei
python scripts/data/dx.py check                  # schemas, size budgets, points below threshold
python scripts/data/dx.py nrdc-report            # scripts/data/nrdc-report.md from corrections.yaml
python -m pytest -q scripts/data/tests           # == npm run test:data
python scripts/data/dx.py export O1195.002 --format azure2 --out /tmp/az   # also csv, json, bibtex
```

`make data` runs the first five; `make data-committed` regenerates what is
committed (below). Inputs, cache and scratch go to `build/dx/` (`DX_CACHE`),
outputs to `public/data/` (`DX_OUT`).

## Sources, pinned (`sources.json`)

| Source | Pinned | Licence |
|---|---|---|
| [IAEA-NDS/exfor_master](https://github.com/IAEA-NDS/exfor_master) | commit `d2af85eca4ce9b76529f096e7f9603da60654732` (2026-09-28, release `Backup-2026-09-28`) | CC BY 4.0 (`LICENSE.txt`) |
| [IAEA-NDS/exfor_dictionary](https://github.com/IAEA-NDS/exfor_dictionary) | commit `3e06256f…` (2026-08-17); the subset used is vendored in `vendor/` | MIT (`vendor/exfor-dictionary-LICENSE.txt`) |
| ENSDF archive (NNDC) | archive of 2025-12-01; URLs and SHA-256 in `sources.json` | free distribution by NNDC/NSDD; cite ENSDF and each nuclide's NDS evaluation |
| ENSDF mirror (fallback) | [vzerkin/ENSDF-myjson-test](https://github.com/vzerkin/ENSDF-myjson-test) `c55fc5d2…` | the original `.ens` files of the same archive, per nuclide (V. Zerkin, IAEA-NDS) |
| AME2020 | `content/atlas/nuclear-data/ame2020-mass-excess.txt` (the atlas' own table) | cited by the site |

`exforparser` (IAEA-NDS) is **not** used: it is GPL-2.0, and reading `.x4`
directly (`nucdata/x4.py`) is short. To move to a newer EXFOR snapshot, change
the commit in `sources.json`, run `make data-committed`, run the tests (the
regression counts may move by a dataset or two: update them deliberately),
and commit.

The NNDC host and nds.iaea.org were unreachable where this was written, so
`fetch-ensdf` falls back to the mirror, and the NNDC checksums are recorded
on the first successful fetch (`fetch-ensdf --source nndc --record`; commit
the change to `sources.json`). After that, a changed archive fails the fetch.

## Scope

A dataset is one EXFOR subentry and reaction pointer (`O1709.002.1`). It is in
scope when its (first) reaction unit is in one of the slices
(`nucdata/scope.py`):

| Slice | | Datasets (snapshot above) |
|---|---|---|
| A | charged particles (p, d, t, ³He, α, ions Z ≤ 8) on targets Z ≤ 30 | 49,133 |
| B | (n,γ) on Z = 26–83 | 13,671 |
| M | Maxwellian / spectrum averages (SF8 MXW, SPA), n-induced, Z ≤ 83 | 7,442 |
| N | every n-induced reaction on Z ≤ 30 | 27,218 |

Total 89,804 datasets from 14,422 entries, 10.06 M points, 7,668 reactions
(target, projectile, process).

## Rules

- **Frames are never mixed.** Each point has `E_lab` (laboratory energy of the
  projectile) and `E_cm`; the one EXFOR gives is copied, the other computed
  relativistically with AME2020 nuclear masses (`masses.py`). `meta.E_frame`
  says which was given (`lab`, `cm`, `lab-res`, `cm-res` for resonance
  energies) and `E_source` the heading. Angles keep their frame
  (`ang_frame`). Natural targets use the standard atomic weight (`cm_approx`).
- **Extrapolated rows are not data.** A row whose FLAG's BIB text says
  "extrapolated", or whose incident energy is exactly 0, goes to `excluded`
  with its reason (O1195.002: five S(0) rows). The dataset gets the flag
  `has-extrapolated-rows`; `npts` and `emin_cm` count the remaining points.
- **EXFOR's own errors are corrected, from a list.** `corrections.yaml` names
  each subentry whose energies or values EXFOR gives in the wrong frame (c.m.
  energies under a laboratory heading such as `EN` or `EN-RES`), unit (MeV
  under `KEV`) or scale (×1000), with the evidence from the `.x4` file and the
  paper, and `reported_to_nrdc`. `nucdata/corrections.py` applies it to the
  columns before anything reads them, so the index, the shards, the exports
  and the plots are all corrected; the dataset gets the flag `corrected` and
  `meta.corrections` (what, why, status), and its export headers say so. An
  entry with `apply: false` stays on record only (Raiola 2002: the file does
  not say which frame). A change limited to some rows (`where`) reads plain
  values as upper limits (`DATA` -> `DATA-MAX`) where the literature says
  that is what they are: ²²Ne(α,n) below the 830 keV resonance (Drotleff
  1991, Harms 1991), where the later direct measurements give only limits;
  such entries are not compilation errors (`nrdc: false`). `dx.py
  nrdc-report` writes the draft report to the NRDC, `nrdc-report.md`, which
  the owner has decided not to send. Each entry's `status` says whether the
  owner has confirmed it.
- **Indirect methods are flagged** `indirect`: an `ANALYSIS` code `TROJA`,
  `ANC` or `SURGT` (the entry's or the subentry's), the free text of `METHOD`
  and `ANALYSIS` naming the Trojan-horse method, Coulomb dissociation or
  break-up, an ANC or a surrogate reaction, or a title naming the Trojan
  horse, Coulomb dissociation or an indirect method (a title that only
  mentions an ANC is not enough: Burtebaev 2008, A0819, is direct).
- **Flags** (`meta.flags`, index bits): `digitised` (STATUS CURVE or an ERR-DIG
  column), `superseded` (STATUS SPSDD, `superseded_by`), `deleted` (HISTORY D),
  `preliminary`, `relative` (SF8 REL/RTH), `not-experimental` (SF9
  CALC/EVAL/RECOM), `derived` (SF9 DERIV, e.g. an S-factor from ANCs),
  `outdated-normalisation`, `renormalised-by-compiler`, `dependent`,
  `upper-limits` (DATA-MAX/MIN rows, `points.limit`), `indirect`, `corrected`.
- **Error components stay apart.** `meta.err_components` lists every
  uncertainty heading (ERR-S, ERR-SYS, ERR-T, ERR-1…n, DATA-ERR, ERR-DIG) with
  its kind (stat / sys / total / digitising, from the heading and the
  ERR-ANALYS text), where it is (per point, or common = one value for the
  dataset, usually a normalisation), its unit and the ERR-ANALYS text.
  Point-wise columns are in `points.err` or, when one column is exactly
  `d_stat`, `d_sys` or `d_tot`, there (`meta.err_columns` says which).
  `d_tot` is the EXFOR total where given, row by row, else the quadrature of
  the components (`d_tot_source`). Nothing is renormalised.
- **No silent conversions.** S-factors stay S-factors, Legendre coefficients
  stay coefficients, relative data stay relative; units are normalised only
  (below).

Units: energies MeV; σ b; dσ/dΩ b/sr; S MeV b; d²σ b/(sr MeV); angles deg;
dimensionless as given. Other units are kept as EXFOR writes them
(`value_unit`).

## Outputs (`public/data/`)

| File | Committed | What |
|---|---|---|
| `meta.json` | yes | sources, snapshot, licences, the attribution line, citations, scope, counts, file layout, bit meanings |
| `exfor/index.json` | yes | every dataset in scope, columnar: 8.4 MB, **1.15 MB gzipped** |
| `exfor/r/<slug>.json` | no (built) | one shard per reaction: metadata and points of all its datasets |
| `exfor/r/<slug>/<n>.json` | no | pages of a large shard |
| `exfor/sets/<entry>/<id>.json.gz` | no | full-resolution points of a decimated dataset (download) |
| `ensdf/<nuclide>.json`, `ensdf/index.json` | atlas nuclei (62 files, 1.6 MB) | ENSDF summaries |

Full build: 7,668 shards (median 2.4 kB, max 200 kB gzipped; 120 decimated,
10 paged), 999 full-resolution sets; 462 MB on disk in all, far under the
1 GB GitHub Pages limit, no file near 100 MB. The 61 atlas reactions with data
come to 13.9 MB of shards (+3.6 MB of gzipped sets): too large to commit, so
they are built like the rest. ENSDF for the whole scope: 773 nuclides, 21 MB
(built); the 62 atlas nuclei are committed.

### index.json (`dx-exfor-index`, schema_version 1)

```
snapshot {commit, date}
reactions {key[], slug[], n[], atlas[][]}      key "14N(p,g)"; slug → exfor/r/<slug>.json
strings {quantities[], authors[], institutes[], facilities[]}
columns [...]; datasets {column: [...]}        one array per column, same order
  id   "O1195.002" (".p" pointer suffix)      r    reaction index
  q    quantity class index (meta.flags.quantity_classes)
  qs   SF5-SF9 string index                    fr   energy frame index (lab, cm, lab-res, cm-res, null)
  e0 e1  lowest/highest E_cm of the points (MeV)   k0 k1  kT range (MACS)
  n    points        y year      a first author (+ = more)   i first institute code   fa facility
  f    flag bits (meta.flags.bits)    er error bits (stat, sys, total-given, total-combined, normalisation)
  lv   number of distinct final levels   s slice bits (A, B, M, N)   u entry revision YYYYMMDD
  m1 m2  lowest E_cm (MeV) of a measured point at 1 and 2 standard deviations
       (below): null none, 0 the same as e0 (m2) or as m2 (m1), else the energy
```

### Shard (`dx-exfor-shard`, schema_version 1)

```
reaction {key, slug, target, projectile, process, compound, atlas[]}
entries {entry: {authors, first_author, title, refs[{code, type, journal, year, doi, note}], doi,
                 institutes[{code, name}], facility[{code, name, institute, text}], methods,
                 detectors, entry_date, entry_updated, entry_revisions, year, entry_history,
                 entry_status, links {exfor, master}}}
datasets [{meta, points, excluded, decimated?, page?}]
pages [...]                                     only when paged: points then live in the pages
```

`meta`: `id entry subentry pointer code sf[[SF1..SF9]] complex reaction target
projectile process product compound quantity quantity_class quantity_text
E_frame E_source ang_frame value_frame value_unit cm_approx emin_cm emax_cm
emin_lab emax_lab kt_min kt_max npts nexcluded final_levels level_heading
err_components d_tot_source err_columns monitor flags corrections analysis
threshold_cm measured_min_cm flag_texts status superseded_by history
subentry_date slices`, plus any entry field in which the subentry differs
from its entry. `points`: `E_lab E_cm [dE kT ang E_level
level_number] value [limit d_stat d_sys d_tot flag err{}]`, parallel arrays.
`decimated {total, kept, full}`: the shard holds `kept` points spread over the
energy range; `full` is the gzipped set. `nucdata/store.py` reads all of this
back (`find(dir, id)`).

### ENSDF (`dx-ensdf`, schema_version 1)

```
nuclide, Z, A, separation {S_n, S_p, S_a (MeV, AME2020)}, xundl
ensdf {nucid, dsid, dsref, pub, date,
       evaluation {authors, citation, cutoff, type}, history[],
       Q {Q_minus, S_n, S_p, Q_alpha with uncertainties, keV; ref},
       levels [{E_keV, dE_keV | dE_text | E_text, J, firm, T (isospin),
                t_half_s, dt_half_s | width_eV, dwidth_eV | limit | d_asym,
                decay {%P ...}, widths {WIDTHG ...}, L, questionable, isomer,
                gammas [{E_keV, dE_keV, I, dI, I_limit, BR (%), M, delta, d_delta,
                         delta_text, B {BE2W ...}, E_final_keV, questionable}]}],
       unplaced_gammas []}
```

`firm` is false for any J with parentheses, alternatives or ranges. `BR` is
the photon branching from the relative intensities of the level (limits left
out). `E_final_keV` matches E_level − E_γ − recoil to a level.

## AZURE2 export

AZURE2 (the commit pinned in `deploy/Dockerfile.azure2`) reads exactly four
numbers per line and no comments (`DataLine.h`), so a dataset becomes:

- `data/<Author>-<entry><subentry>[-p<pointer>][-<E_x keV>].dat`:
  `E_lab [MeV]  angle [deg]  value [b, b/sr]  uncertainty`, one file per final
  level. `E_lab` is that of the particle the `.azr` entrance pair moves
  (`--lab-particle projectile|target`), from E_cm with AZURE2's own
  non-relativistic relation and AME2020 or integer masses (`--masses`), so
  AZURE2 recovers E_cm exactly. Angle 0 for angle-integrated data, else as
  EXFOR gives it (segment type 1 lab, 4 c.m.; 7 analysing power). S-factors are
  converted to σ = S/E exp(−2πη) (AZURE2 reads cross sections) and the header
  says so. Column 4: statistical ⊕ point-wise systematic (`--error point`,
  default), `stat`, or `total`; never the common (normalisation) parts.
- `data/<stem>.csv`: every column (E_lab for AZURE2, E_cm, E_lab of the
  projectile, angle, value as in EXFOR, value as exported, d_stat, d_sys, d_tot,
  d_azure2, E_level, flag) under a `#` header: EXFOR id and links, revision
  dates, reaction code, quantity, frames, final levels, monitor, common
  systematic uncertainty, every uncertainty component, flags, excluded rows,
  authors, title, references and DOI, the licence and citation.
- `segments.txt`: one `<segmentsData>` line per file, with `ENTR`/`EXIT` to
  replace by the `.azr` pair keys (`-1` already for a total capture), the
  energy and angle ranges, the data type and the common systematic
  uncertainty as the normalisation uncertainty (%). `README.txt` lists them.
  E_min and E_max bracket the energies as the `.dat` file writes them by a
  relative 1e-5 (angles by 0.001°), because AZURE2 keeps a point only if
  E_min ≤ E ≤ E_max. The normalisation is varied only where EXFOR gives a
  common systematic uncertainty; without one it is fixed (`vary norm 0`), as
  a free normalisation with a 0% uncertainty would float. Rows without an
  uncertainty are left out of the `.dat` (AZURE2 gives them no weight in χ²)
  and kept in the `.csv`, which says how many; a file with none is skipped.
  The page's default selection is the counted angle-integrated totals, one
  dataset per EXFOR subentry (σ before S, so pointer twins are not fitted
  twice); partials, dσ/dΩ and the twins are opt-in.

Cross-check (`tests/test_export.py`): the pipeline reproduces the ⁷Be
evaluation's files `Costantini-O1709001`, `Szucs-D4400001`, `Toth-D4430001`,
`Parker-A1088001` and `Switkowski-F0032001` to 1e-4 in energy and exactly in
value and uncertainty; DiLeva, Osborne, Piatti (⁷Be) and Caciolli (²⁴Mg)
match in energy and value, with uncertainties the evaluator chose.

## Attribution (in `meta.json`, for the pages)

- `exfor.line`: "Data: EXFOR (IAEA/NRDC), snapshot of 28 September 2026, CC BY
  4.0" (and `line_it`, "versione del 28 settembre 2026": the house style of
  dates, docs/STYLE.md); `exfor.entry_url` (`https://nds.iaea.org/EXFOR/<entry>`) and
  `exfor.master_url` (the `.x4` file at the pinned commit); every shard entry
  has both links; `exfor.changes` states what was changed (CC BY 4.0 asks).
- `exfor.citation`: N. Otuka et al., Nucl. Data Sheets 120, 272 (2014); cite
  each dataset's own paper (`refs`, `doi`) too.
- `ensdf.citation` and, per nuclide, `ensdf.evaluation.citation` and `cutoff`.
- `masses`: AME2020.

## Tests

`npm run test:data` (= `python3 -m pytest -q scripts/data/tests`): the reader
(numbers, BIB items, wrapped tables, pointers, empty SUBENT), datasets
(O1195's extrapolated rows, frames, units, error components, limits,
digitised), kinematics and units, ENSDF (15O and ⁷Be adopted data sets from
the archive, a synthetic file for the edge cases), AZURE2/CSV/BibTeX exports
and the cross-check, and on the committed outputs: regression counts
(¹⁴N(p,γ) 126 datasets / 31 entries, ¹²C(α,γ) 64/21, ³He(α,γ) 44/22,
¹³C(α,n) 65/31, ²²Ne(α,n) 16/9, ¹⁹⁷Au(n,γ) 278/187), schemas, budgets and the
attribution fields. The EXFOR fixtures (`tests/fixtures/exfor/*.x4`) are
unmodified master files (CC BY 4.0), except `T0001.x4`, which is synthetic.

## Lowest measured energy: one rule

Every page of the explorer gives the same "lowest measured energy" for a
reaction: /data and its guided paths, the reaction pages, the atlas panel
and search (`npm run test:data-ui` checks that they agree on every atlas
reaction). The rule is `lib/data/lowest.mjs`; its settings (the JSON between
`rule:begin` and `rule:end`) are read by the pipeline too
(`nucdata/measured.py`).

1. **Per point** (pipeline, `nucdata/measured.py`, written to the index as
   `m1` and `m2`): a point is measured when it is a value, not an upper or
   lower limit (limits are judged row by row: a dataset with one DATA-MAX row
   still counts by its other rows, as Bonetti 1999 does); when its value is at
   least `sigma` standard deviations above zero (the point's total
   uncertainty, else statistical and systematic in quadrature; a point
   without any uncertainty counts when above zero; Legendre coefficients by
   their absolute value); and when its energy is physical: at least 1 keV
   (centre of mass) for a charged projectile on a charged target, and not
   below the threshold −Q of an endothermic reaction (AME2020).
   `sigma` is 1, the owner's choice; setting it to 2 in `lowest.mjs` needs no
   rebuild of the data (the index carries both).
2. **Per dataset** (`lowest.mjs`): it measures the reaction at an energy
   (quantity class `sigma`, `S`, `dsigma`, `legendre`, `yield` or
   `strength`); it is not flagged `not-experimental` (calculated, evaluated,
   recommended), `derived`, `superseded`, `deleted`, `preliminary`, `complex`
   (a ratio) or `indirect`; it is not a single S-factor value (in EXFOR a fit
   result such as S(25 keV), not a measurement at that energy). Extrapolated
   rows never reach the points, and `corrections.yaml` has been applied.
3. **The lowest** of those is credited to every dataset that reaches it
   within 0.5% or 0.1 keV, one per EXFOR entry, earliest first (the
   ²²Ne(p,γ) resonance at 149 keV: Cavanna 2015, Depalo 2016, Ferraro 2018,
   Lennarz 2020, Williams 2020).

The measured ranges behind "rate from unmeasured energies" use the same
datasets, from their lowest measured point to their highest. The words on
the pages are `lib/data/rule-text.ts` (EN and IT), shown on /data and in the
"How these numbers are made" fold of the reaction pages and the atlas panel.

## The public page's summary (`/data`)

The public entry page (`components/pages/data-explorer.tsx`) never loads the
index. `node scripts/data-summary.mjs` (run by `npm run prebuild` and
`predev`; also `npm run data:summary`) writes `public/data/summary.json`
(about 25 kB, not committed) from the committed index
(`lib/data/public-summary.mjs`): per atlas reaction the number of datasets
and entries, the years, the LUNA datasets (institute or facility `2ITYLGS`)
and the lowest measured energy by the rule above, with every dataset that
reaches it.
