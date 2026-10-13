# Adding an R-matrix evaluation

An evaluation is one directory, `server/evaluations/<id>/`. Everything the
site shows about it comes from that directory: the AZURE2 model, its data,
and a file called `info.json` with what the model cannot say (the paper, a
name for each data set, one sentence on what the reaction is for). There is
nothing to register anywhere else.

## The short version

```sh
make add-evaluation ID=12C AZR=~/azure/12C/12C.azr      # 1. copy it in
#    edit server/evaluations/12C/info.json               # 2. fill in the TODOs
npm run check:evaluations                                 # 3. check it
cd server && python -m app.warm 12C                       # 4. measure it (Docker: make warm ID=12C)
git add server/evaluations/12C && git commit              # 5. commit it
```

Then rebuild the site (`make update` on the server; the GitHub Pages build
runs by itself on push). The checklist at the end has every step.

## 1. Copy it in: `make add-evaluation`

```sh
make add-evaluation ID=12C AZR=~/azure/12C/12C.azr
make add-evaluation ID=12C AZR=~/azure/12C/12C.azr DATA=~/azure/data   # data files elsewhere
npm run eval:new -- 12C ~/azure/12C/12C.azr --data ~/azure/data         # the same, through npm
```

It takes the `.azr` file exactly as AZURE2 saved it and:

- copies it to `server/evaluations/<ID>/<ID>.azr`, with every path made
  **relative** (`data/kettner_0.dat`, `output/`, `checks/`). The AZURE2 GUI
  writes full paths like `/home/you/azure/12C/data/kettner_0.dat`, which only
  work on your machine; on the server the model would not open;
- copies every data file the model reads into `data/`. It finds them where the
  `.azr` says, or next to the `.azr` (and in its `data/`), or in `DATA=`, and
  prints each copy as `source -> data/name`;
- copies `output/intEC.dat` and `output/intEC.extrap` from your run, if there
  are any (AZURE2's external-capture integrals: slow to recompute);
- writes `info.json`, filled in as far as it can (below), with `TODO` where
  only you know the answer;
- checks the result and prints what is left to do.

Nothing outside the new directory is touched. If something goes wrong,
delete the directory and run it again.

**Only the model's own files are copied.** A file is copied only if the
`.azr` names it (a data segment's file, or the integrals in its output
directory) *and* it lies, after following symlinks, inside the `.azr`'s own
directory (subdirectories included) or a `DATA=` directory you named. A path
that leads anywhere else (`/etc/passwd`, `../../.ssh/id_rsa`, a symlink
pointing out) stops the command with the path it refused, so a `.azr` from a
collaborator cannot slip a private file into the repository. Read the
`source -> data/name` lines before you commit.

**The id** is the directory name and the web address (`/evaluations/12C`).
Use the compound nucleus (`12C`, `24Mg`): it is shown as ¹²C. Letters, digits,
`-` and `_` only. For a second evaluation of the same nucleus, add a suffix:
`12C-2025`. An id that already exists is refused; `FORCE=1` replaces its
model and data but keeps its `info.json`.

To fill in `reactions` by itself the command reads the model with pyazr,
AZURE2's Python package. It looks in `../AZURE2` (set `AZURE2_SRC=` to your
AZURE2 checkout) or a pip-installed pyazr. Without it, it says so, and you
write `reactions` yourself.

## 2. Fill in `info.json`

An annotated example (the `//` comments are only here; JSON has none):

```jsonc
{
  "$schema": "../../app/info.schema.json",   // lets an editor (VS Code) check the file as you type
  "status": "published",                     // published | submitted | in-progress | unpublished
  "reference": "10.1103/PhysRevC.111.035802",// the paper's DOI, bare (not https://doi.org/..., not doi:...); null if none
  "paper": {                                 // optional; shown with the DOI
    "authors": "J. Skowronski et al.",       //   as cited
    "title": "A comparative analysis of R-matrix fitting: ¹²C(p,γ)¹³N as test case",
    "journal": "Phys. Rev. C 111, 035802",
    "year": 2025
  },
  "analysis": "J. Skowronski",               // who did the R-matrix analysis (add-evaluation leaves a TODO here)
  "purpose": "The first step of the CN cycle, which burns hydrogen in stars.",   // on the card, English
  "purpose_it": "Il primo passo del ciclo CN, che brucia idrogeno nelle stelle.", // the same, Italian
  "reactions": ["¹²C(p,γ)¹³N", "¹²C(p,p)¹²C"],// what was fitted, the headline reaction first
  "datasets": {                              // a name for EVERY data file, by file name without .dat
    "kettner_0": "Kettner 2023",             //   just a name...
    "rolfs_0": {                             //   ...or a name and the source (shown in the data table)
      "label": "Rolfs 1974",
      "ref": "Nucl. Phys. A 227, 291 (1974)",
      "doi": "10.1016/0375-9474(74)90798-2"
    }
  },
  "atlas": ["12C-pg-13N"]                    // reaction-atlas pages that link here (file names in content/atlas/reactions/)
}
```

Required: `status`, `analysis`, `purpose`, `purpose_it`, `reactions`,
`datasets`. Everything else is optional:

| field | what it is |
|---|---|
| `status` | `published` (in a journal: give `reference`), `submitted` (sent to a journal), `in-progress` (still being fitted), `unpublished` (finished, no paper yet). Without a paper the page says "Not yet published". |
| `reference` | the paper's DOI, e.g. `10.1103/PhysRevC.111.035802`, or `null` |
| `paper` | `authors` (required), `title`, `journal`, `year` |
| `analysis` | who did the R-matrix analysis (need not be the paper's authors) |
| `purpose`, `purpose_it` | one plain sentence for a non-specialist, on what the reaction does in stars; shown on the evaluation's card |
| `reactions` | written like `¹²C(p,γ)¹³N`: target(in,out)product, no spaces. Copy the superscripts from another `info.json` |
| `datasets` | a label for every data file the model reads; the check lists any you missed |
| `atlas` | the atlas pages that should link to this evaluation, and that it links back to. `[]` for none |
| `summary`, `summary_it` | optional: one paragraph on what was fitted (used by the site search) |
| `citation` | optional: the full "how to cite" text, if the default is not right |
| `title` | optional: a LaTeX title, e.g. `^{12}\\text{C}`; derived from the model if absent |
| `channels` | optional: LaTeX names of the particle pairs, in pair order; derived if absent |
| `split_total_capture` | `true` for a model with total-capture data over several capture pairs (see README, "Total capture") |

The full definition is `server/app/info.schema.json`.

`analysis` starts as a `TODO`, like `purpose`: the command cannot know who
made the fit, and the check refuses the evaluation until you write it.

### Total capture over several capture pairs: `split_total_capture`

**When it matters.** Only for a model with *two or more capture pairs* (γ
exit channels, e.g. to the ground state and to an excited state) *and* a data
segment of **total capture** over them (in AZURE2, exit pair `-1`). AZURE2
calculates such a segment as the first pair plus one component segment per
further pair, and at the pinned revision it reuses the external-capture
integrals (`output/intEC.*`) wrongly for those components: the total comes
out too low (¹⁷F's about 15 times, ⁷Be's ³He(α,γ) about 20%). Only a
calculation with no stored integrals is right; the server reuses them, and so
does AZURE2 on your machine from the second run on, so a fit may have been
made against the wrong total too. The details are in the
README ("Total capture and `split_total_capture`") and in `summed` in
`server/app/fine.py`. With a single capture pair, or no total-capture data,
leave the flag out: it changes nothing.

**What it does.** With `"split_total_capture": true` the server calculates
each total capture as one segment per capture pair and sums them, which does
not depend on the reused integrals. The `.azr` and its parameters are not
changed. Without the flag the model is calculated as AZURE2 does as shipped.

**Turn it on, then check it against the published fit:**

1. Open the evaluation locally without the flag (`make dev-server`,
   `make dev-site`, `/evaluations/<id>`) and note the χ²/N of the
   total-capture data sets in the data table and how their curve sits.
2. Add `"split_total_capture": true` to `info.json` and restart the API
   (`make evaluations` on the server). The flag is part of the cache key, so
   everything is calculated again.
3. Compare with the paper: the total-capture curve should now go through the
   total-capture data, with χ²/N close to the published value (or better),
   and every other data set should be unchanged. Keep the flag.
4. If the corrected total misses the data (¹⁴N: χ²/N 0.9 → 95), the fit
   itself relied on the wrong numbers. Leave the flag off, so the page shows
   the fit as published, and have the fit checked.

## 3. Check it

```sh
npm run check:evaluations      # the site's check (also runs before every build)
make check-evaluations         # the same, from Python (no Node needed)
```

Each problem names the file, the line or field, and what to change, e.g.

```
• 12C/info.json: `status` is "publised"; it must be one of "published", … (did you mean "published"?)
• 12C/info.json: data file "kettner_55" has no label: add "kettner_55": "Author year" … to `datasets`
• 12C/12C.azr:53: the data path "/home/you/azure/12C/data/kettner_0.dat" is absolute … ("data/kettner_0.dat")
```

Errors stop the build (so a broken evaluation never goes online); warnings do
not. What is checked: `info.json` parses and has the fields above with sensible
values (status, DOIs, reactions, true/false, no misspelt field names, no TODO
left); the `.azr` has relative paths and every data file is there; every data
file has a label and every label is a data file; the `atlas` pages exist, and
every `rmatrix:` in an atlas page is an evaluation. The server runs the same
check when it starts and writes problems to its log.

## 4. Measure it: `make warm`

```sh
cd server && PYTHONPATH=<pyazr> python -m app.warm 12C   # locally
make warm ID=12C                                         # on the server (Docker); without ID, all of them
```

This runs the model once at its fitted parameters and stores the curves, so
the first visitor does not wait, and measures how long opening and editing
take. The timings go to `server/evaluations/<id>/timings.json`: **commit that
file**, it is what the page shows as "opens in about N s". Never edit it by
hand; run `python -m app.warm --force <id>` to measure again. (Its `browser`
part, the timings of the GitHub Pages version, is estimated from the server's
unless someone measured it in a browser.)

At the end it prints one line per evaluation, `ok` or `FAILED` with the
reason, and fails (exit status 1) if any failed. A model that AZURE2 cannot
open also shows on the page as an error, not as an expired session.

## 5. How it appears on the site

After the next build (`make update` on the server, or a push for GitHub
Pages):

- a card on `/evaluations` (and `/it/evaluations`): the reactions, the
  `purpose`, the paper or "Not yet published", "opens in about N s";
- its own page, `/evaluations/<id>`, with the level scheme, the plots, the
  data table (with your dataset labels and sources), the extrapolations and
  "how to cite";
- a link from each atlas page in `atlas`, and back;
- an entry in the site search, and one more in the count on the home page.

On the server, `make evaluations` (a restart of the API) serves the model at
once, but its page is only built by `make update`.

## Renaming or removing one

- **Remove:** delete `server/evaluations/<id>/`, then run
  `npm run check:evaluations`: it lists any atlas page that still says
  `rmatrix: [<id>]`; remove the id there. Commit, and `make update`.
- **Rename:** rename the directory and its `.azr` file (`git mv`), change
  `id` in `info.json` if it has one, then run the check, which points at
  every atlas page still using the old id. The old address stops working.
- **Replace the model** (a new fit): `make add-evaluation ID=<id> AZR=... FORCE=1`
  keeps `info.json`; check the dataset labels, then `make warm ID=<id>` and
  `python -m app.warm --force <id>` for new timings.

If the evaluation feeds the reaction rates (¹²C(p,γ), ¹³C(p,γ)), rerun
`scripts/rates/evaluated_rates.py` (README, "Reaction rates").

## Checklist

- [ ] `make add-evaluation ID=<id> AZR=<file.azr>` ran without errors
- [ ] `info.json`: no TODO left; `status`, `reference`, `paper`, `analysis` right
- [ ] total capture over two or more capture pairs: `split_total_capture` checked against the published fit (section 2)
- [ ] `purpose` and `purpose_it` read well to a non-physicist
- [ ] `reactions`: headline reaction first
- [ ] every data file has a real label ("Author year"), with `ref` and `doi` where known
- [ ] `atlas` lists the atlas pages it belongs on
- [ ] `npm run check:evaluations` passes
- [ ] `python -m app.warm <id>` (or `make warm ID=<id>`) says `ok`; `timings.json` exists
- [ ] the page works locally (`make dev-server`, `make dev-site`, open `/evaluations/<id>`), or on the server after `make evaluations`
- [ ] committed: `git add server/evaluations/<id>`; then `make update` on the server
