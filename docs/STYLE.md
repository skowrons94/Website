# House style

How the text of this site is written. Follow it for new pages, content files
(`content/**`) and interface strings (`lib/i18n.ts`, `lib/i18n-eval.ts`,
`lib/rates/i18n.ts`, `lib/data/i18n-public.ts`). It covers wording only: never
change a scientific fact, a number, a citation, a reference title or anything
the site computes in order to follow it.

## English

The English text is the non-`_it` fields of the content files and the `en`
dictionaries.

### Spelling

British spelling with *-ize* endings (Oxford spelling):

- colour, centre, behaviour, licence (noun), programme, tunnelling, modelling,
  analyse, aluminium, flavour;
- but normalization, polarization, ionization, characterization, organization,
  recognize, digitized.

Exceptions:

- *analyzing power*, the term of art as Physical Review writes it;
- the published spelling of every proper name and every title (papers, talks,
  events). Never respell a reference title.
- Identifiers stay as they are, even when they are British: the glossary id
  `normalisation` is a URL (`/glossary#normalisation`), and keys such as
  `outdated-normalisation` are data. `scripts/search-index.mjs` keeps the
  British spellings as search aliases.

### Voice

- **Home, Research, Outlook, About, Software and the CV**: first person and
  active voice. Say what Jakub did: "I led…", "I designed…". His stated views
  stay his, in his words, polished but not removed (for example his love of
  R-matrix theory on Research, and his view of AI as a research tool on About).
- **Atlas, glossary, timeline, methods, s-process, rate explorer, data
  explorer, curiosities**: physics first. Impersonal, present tense, no "I".
  In the timeline, events are told in the past tense; headlines are short
  sentences in the present ("Salpeter shows how helium burns to carbon").
- **Notes and exercises**: as a tutor, with "we" or the imperative ("Take a
  single-level fit…", "Draw a sphere…"). Not "one draws".

### Headings and labels

- Sentence case for every heading, tab, button, card title and CV entry
  title ("LUNA experiment", "AZURE2 R-matrix code", "AGATA set-up").
- Capital letters only for proper nouns and formal role titles used as labels:
  Working Group Leader, DAQ Coordinator, Maintainer and Lead Developer,
  Spokesperson, Honorary Fellow. In running prose, roles are lower case.
- No full stop at the end of a heading or of a one-line description (menus,
  404 links). The run-in leads of the outlook ("Open data that stays open.")
  keep theirs.
- Microcopy:
  - "Choose" for selecting options in prose ("Choose a site…"), never "Pick"
    or "Select". A checkbox's own label may say "Select {id}".
  - Errors: "X could not be loaded." (and "Try again." when there is a way to).
  - Status lines are sentences that end in "…". Say what is shown "until
    then", not "meanwhile".
  - Instructions name the effect: "see the cross section change", "see how
    the heavy isotopes change", "and the lead falls". Avoid "watch X respond".

### Punctuation

- No serial (Oxford) comma unless it prevents ambiguity: "teaching, outreach
  and software".
- Spaced em dashes ( — ) sparingly: at most one pair per paragraph. Prefer a
  colon, a semicolon or brackets.
- Ranges take an unspaced en dash: `2020–2025`, `0.3–1.3 MeV`, `2020–present`.
  When either end contains a space, space the en dash: `Jun 2025 – present`.
- Possessive of a word ending in s: "the atlas's", "a nucleus's", or reword
  ("the atlas text"). Never "atlas'".
- Typographic quotation marks (“ ”) in prose.

### Numbers and units

- A no-break space between a number and its unit: `70 keV`, `1.4 km`,
  `3.5 MV`.
- Per cent: `5%` closed up, in text and tables. In words, "per cent" ("a few
  per cent"), never "percent".
- Four-digit numbers take no separator (`1400`, `3500`); from five digits use
  a thin space (`12 000`). Never a comma. (Number formatters that the English
  pages use follow this; the Italian ones follow the Italian style.)
- Depth: "1.4 km" in prose; "1400 m (3800 m w.e.)" only in the figure and the
  facilities table.
- Temperature: "15 million kelvin" or "0.2 billion kelvin" in prose; `MK` and
  `GK` in labels, axes, fact boxes and the one-line model caveats. Never
  "degrees".
- S-factor in `keV b`. `c.m.` only in axis labels and table headers; in prose,
  "centre of mass".

### Terms

- γ-ray, always hyphenated, as noun and adjective, in technical text; "gamma
  ray" only in a plain-language gloss that introduces the symbol.
- α particle in technical text, "alpha particle" in plain text; not both in
  one paragraph.
- s-process, r-process, i-process (hyphen); pp chain(s), CNO cycle(s), Solar
  System (capitalized), R-matrix.
- "data set" (two words) in atlas prose; "dataset" in the evaluation and data
  explorer interfaces. One form per page.
- PhD, MSc, BSc without points; "email", not "e-mail".
- The tools: "the rate explorer" (not "rates explorer" or "reaction-rate
  explorer"), "the reaction atlas", "the evaluations", "the data explorer".
  The page titles ("Reaction rates: how fast, and what if?") are names and stay
  as they are.
- The 3.5 MV machine has no nickname on this site: write "the 3.5 MV
  accelerator of the Bellotti Ion Beam Facility" or "the 3.5 MV machine at the
  Bellotti Ion Beam Facility (BIBF)", and never join "LUNA" and "MV" into a
  name.
- "Doubling" or "×2" for the curiosities' what-if; "about half the nuclei
  heavier than iron" for the s-process claim, everywhere it is made.

### Words to avoid

actually, genuinely, quietly, beautifully, "exactly" as an intensifier,
so-called, cleft openings ("It is what…", "is what lets…"), "meanwhile" in
status lines, "watch X respond". Don't hard-code counts in prose ("in sixteen
sentences"): they go out of date; the pages compute them.

### One fact, one home

Each claim has one canonical page; other pages state it briefly or link to it:

- the AI rationale: About (Research keeps one sentence of outlook);
- 1.4 km of rock and one muon in a million: the atlas primer (home and Research
  mention the rock once, without the factor);
- "the reference R-matrix code": Research (elsewhere "the R-matrix code used
  across the field" or "used worldwide");
- Eddington, 1920: the timeline;
- "first direct evidence that stars build elements" (technetium, 1952): the
  timeline; the s-process page words it differently.

### Checks that constrain the wording

- Curiosities (`lib/rates/curiosities.ts`): an English hook has at most 15
  words, and every caveat contains "One-zone model" and "Real stars adjust"
  (`npm run test:rates`). After changing a sentence or a caveat, rerun
  `node scripts/rates/curiosity-cards.mjs` so the social cards match.
- Page titles and descriptions are mirrored in `scripts/search-index.mjs`
  (`PAGES`): change both (`npm run test:search`).
- `lib/data/export.ts` writes files that must match the Python pipeline byte
  for byte (`npm run test:data-ui`): its strings are data, not prose.
