# The reaction atlas: data files

Everything shown under `/atlas` comes from the files in this directory. Nothing
is registered anywhere else: a new reaction is a new file in `reactions/`, a new
reference is a new entry in any file of `references/`. `npm run check:atlas`
validates the whole directory (schema, cross-references, unknown ids) and is run
before every build.

```
networks.yaml          the processes (pp chains, CNO cycles, ...) and their reactions, in order
reactions/<id>.yaml    one reaction or decay per file
references/*.yaml      the bibliography, split in several files (merged on load)
facilities.yaml        laboratories and accelerators
methods.yaml           how cross sections are measured
timeline.yaml          the history of the field
nuclear-data/          AME2020 mass excesses and NUBASE2020 half-lives (read, never edited)
```

## Conventions

- Nuclides are written as mass number and symbol: `12C`, `4He`, `7Be`. The
  proton is `1H` (`p` is accepted in reaction strings), the neutron `n`, the
  deuteron `2H`, the alpha particle `4He`.
- Displayed text uses Unicode nuclide notation (`¹⁴N(p,γ)¹⁵O`), which the site
  turns into real superscripts.
- Energies are in keV, centre-of-mass, unless a field says otherwise.
- Q-values, half-lives and Gamow windows are computed by the site from
  `nuclear-data/` and the temperatures given in `networks.yaml`. Do not type
  them into the reaction files.
- Text has two registers. `summary` and `role` are for a general reader:
  short sentences, no jargon left undefined, no equations. `details`,
  `measurements` and `open_questions` are for a physicist: precise, with
  numbers, in the style of a methods section.
- The site is also in Italian, under `/it`. A translation sits beside the field
  it translates, with the suffix `_it`: `summary_it` beside `summary`,
  `role_it` beside `role`, `label_it` beside a temperature's `label`. Every
  translation is optional; where one is missing the Italian page shows the
  English. Translate the general-reader fields (`summary`, `role`,
  `status_note`, names and summaries in the other files); the specialist ones
  (`details`, measurement `note`s, `open_questions`) may stay English, and the
  Italian page says so above them. Nuclide notation, numbers and units are
  written as in the English; ids and anchors are never translated.
- Every factual statement about a measurement must be backed by a reference id,
  and every reference must have been checked against the publisher page, the
  arXiv entry or INSPIRE before it is added. `checked` records how.

## reactions/&lt;id&gt;.yaml

The file name is the id: target, projectile and ejectile codes, product, e.g.
`14N-pg-15O`, `3He-ag-7Be`, `13C-an-16O`, `13N-bp-13C` (β⁺ decay),
`7Be-ec-7Li` (electron capture), `1H-pp-2H` (p + p → d e⁺ ν).

```yaml
id: 14N-pg-15O
label: ¹⁴N(p,γ)¹⁵O               # as displayed
kind: capture                    # capture | transfer | fusion | weak | decay
target: 14N
projectile: 1H                   # 1H, 2H, 3H, 3He, 4He, n, e- (electron capture), "" for decays
ejectile: g                      # g (γ), 1H, n, 2H, 4He, "2 1H", "e+ nu", "nu", ...
product: 15O
networks: [cno1]                 # ids from networks.yaml (a reaction may belong to several)
importance: key                  # key | major | minor: drawing weight on the map
summary: >-                      # one or two sentences for a general reader
  The slowest step of the CNO cycle. ...
role: >-                         # a paragraph for a general reader: why it matters
  ...
details: >-                      # specialist paragraph(s), Markdown allowed
  ...
status: improving                # well-known | improving | uncertain | unmeasured
status_note: >-                  # one sentence: how well the rate is known, and why
  ...
methods: [direct-underground, direct-surface, inverse-kinematics, anc]   # ids from methods.yaml
measurements:                    # chronological; the main ones, not an exhaustive list
  - year: 2006
    facility: luna-400           # id from facilities.yaml
    method: direct-underground
    energy: "70–228 keV"         # range covered, with its frame if not obvious
    note: >-                     # one or two sentences: what was new
      ...
    refs: [lemut2006]
evaluations: [adelberger2011, acharya2025]   # compilations / evaluations used for the rate
open_questions:
  - ...
related: [15N-pa-12C]            # other reaction ids worth a link
summary_it: >-                   # optional Italian versions, beside or after the English
  Il passo più lento del ciclo CNO. ...
role_it: >-
  ...
status_note_it: >-
  ...
```

A decay needs only `id`, `label`, `kind: decay`, `target`, `product`,
`ejectile` (`e+ nu`, `e- nubar`), `networks` and a one-sentence `summary`; its
half-life comes from NUBASE2020.

## references/*.yaml

A map from a short key (first author, year, optional letter) to the reference.

```yaml
lemut2006:
  authors: A. Lemut et al. (LUNA Collaboration)
  title: First measurement of the ¹⁴N(p,γ)¹⁵O cross section down to 70 keV
  journal: Phys. Lett. B 634, 483 (2006)
  year: 2006
  doi: 10.1016/j.physletb.2006.02.021
  arxiv: nucl-ex/0602012
  luna: true                     # a LUNA paper
  checked: arXiv abstract page and publisher DOI, 2026-10-11
```

The same key may appear in two files only if both entries carry the same DOI.
References are not translated: titles stay as published.

## networks.yaml, facilities.yaml, methods.yaml, timeline.yaml

See the comments at the top of each file. Every list is plain YAML; order in the
file is display order.

## Checks on translations

`npm run check:atlas` treats the `_it` fields as optional. It stops the build
only on a translation of the wrong kind (a list where the English is text, or
the reverse). A translation whose English field does not exist, and the
general-reader fields still without an Italian version, are listed as
warnings, one line per file.
