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

## Italiano

Il testo italiano è nei campi `*_it` dei file di contenuto (`content/**`), nei
dizionari `it` di `lib/i18n.ts`, `lib/i18n-eval.ts`, `lib/rates/i18n.ts`,
`lib/data/i18n-public.ts`, nei testi italiani di `lib/rates/curiosities.ts`,
`lib/data/quantity.ts` e `lib/data/paths.ts`, e nelle parti italiane di alcune
pagine scritte nei componenti (`components/pages/about.tsx`, `s-process.tsx`,
`rates.tsx`, `rates-sprocess.tsx`, `exercises.tsx`, `news.tsx`,
`components/rates/credits.tsx`). Vale la stessa regola dell'inglese: si cambia
solo la forma, mai un fatto scientifico, un numero, una citazione, un titolo
di articolo o qualcosa che il sito calcola.

### Voce

- **Home, Ricerca, Prospettive, Informazioni, Software e CV**: prima persona
  singolare, voce attiva ("misuro", "coordino", "ho guidato").
- **Atlante, glossario, metodi, cronologia, processo s, esploratori dei tassi
  e dei dati, curiosità**: forma impersonale, presente. Il soggetto è il
  nucleo o la reazione e il verbo è attivo ("Il ¹⁴N cattura un protone…").
- Al lettore si dà sempre del **tu** ("puoi", "scegli", "seleziona", "cita"),
  mai del voi.
- Nella microcopy niente "noi" di servizio ("lo stiamo preparando per te") e
  niente "io" della macchina ("sto ancora lavorando", "Carico…"): forma
  impersonale ("il server lo sta ancora preparando", "calcolo ancora in
  corso", "Caricamento…", "Preparazione…").

### Due registri

- `summary`, `role`, `status_plain` e le pagine divulgative: una sola idea per
  frase, non più di 25 parole circa. Ogni sigla si scioglie alla prima
  occorrenza ("nucleosintesi primordiale", non "BBN").
- `details`, `status_note`, `open_questions` e le tabelle per specialisti:
  registro da sezione "Metodi", ma sempre in italiano ("spettroscopia γ in
  linea", non "γ prompt"; "nei gusci", non "in shell"; "serie di dati", non
  "dataset").

### Terminologia

| Usare | Evitare |
|---|---|
| sezione d'urto | — |
| tasso di reazione, tasso di cattura | velocità di reazione, velocità di cattura |
| fattore astrofisico S alla prima occorrenza, poi fattore S | fattore S astrofisico |
| schermaggio elettronico | — |
| analisi, valutazione, teoria R-matrix | "teoria della R-matrix", "la R-matrix" da sola come nome |
| il fit, eseguire il fit, includere nel fit | riadattare |
| energia variabile nel fit (un parametro del fit) | energia libera nel fit |
| intensità della risonanza (ωγ) | forza della risonanza |
| impulso termico | flash dell'elio |
| veleno neutronico | veleno per i neutroni |
| grani presolari, grani di polvere stellare | granelli di polvere di stelle |
| Portavoce (titolo), il portavoce | spokesperson |
| impianto o infrastruttura aperta a utenti esterni | user facility, "struttura" |
| tempo di fascio | tempo fascio |
| sotto terra | sottoterra (resta solo tra le parole chiave di ricerca) |
| il meteorite, i meteoriti | le meteoriti |
| la Bellotti Ion Beam Facility, inaugurata | il Bellotti Ion Beam Facility |
| atti di convegni | atti di congressi, atti di conferenze |
| dell'IAEA; "Agenzia internazionale per l'energia atomica (IAEA)" alla prima occorrenza | della IAEA |
| questioni aperte | domande aperte |
| serie di dati (femminile, invariabile) | dataset |
| modello a zona singola | modello a una zona |
| raggio γ, riga γ a 1809 keV | luce (per una riga γ), "raggi gamma" nel testo corrente |
| deutone (la particella), deuterio (l'isotopo) | — |
| Posizioni (sezione del CV) | Impieghi |
| correlatore di una tesi magistrale o triennale; co-supervisore di un dottorato | co-supervisione di una tesi |

### Articoli davanti a nuclidi e reazioni

- L'articolo segue il numero di massa **come si legge**: ¹⁶O è "sedici-O",
  ⁸⁵Kr "ottantacinque-Kr", ¹⁸F "diciotto-F". Prendono "l'", "dell'", "nell'"
  i numeri che si leggono con una vocale iniziale: 1 (uno), 8 (otto), 11
  (undici), 80–89 (ottanta…), 800–899 (ottocento…). Quindi "dell'⁸B",
  "l'⁸⁵Kr", "l'¹¹C", ma "del ¹⁸F", "il ³He", "del ¹⁶O".
- La regola è `vowelMassNumber` in `lib/localize.mjs`, che scrive il numero
  in lettere (`italianNumber`) e ne guarda la prima lettera; `elideItalian`
  la applica a un testo intero. `npm run test:i18n` la verifica.
- Si scrive giusto nei sorgenti: `localize()` corregge i campi `*_it` a
  runtime, ma il testo deve essere già corretto. Una stringa che compone
  articolo e nuclide (`"del ${system}"`, un modello `"Il {cn}"` riempito da
  `fill()`) passa da `elideItalian`; se il nuclide è un elemento a parte nella
  pagina, si usa `beforeNuclide`.
- Le reazioni sono femminili ("la reazione") e prendono l'articolo anche dopo
  un verbo o una preposizione: "è stata misurata la ¹²C(α,γ)¹⁶O", "attraverso
  la ²²Ne(α,n)²⁵Mg", "compete con la ¹⁷O(p,γ)¹⁸F", "le misure della
  ¹⁴N(p,γ)¹⁵O". Restano senza articolo gli elenchi in apposizione ("le
  sorgenti di neutroni, ¹³C(α,n)¹⁶O e ²²Ne(α,n)²⁵Mg") e le note tecniche
  sulle energie.
- Gli elementi in lettere sono maschili: "del sodio", "dello stronzio-88",
  "dell'alluminio-26".

### Numeri e unità

- Virgola decimale, punto o spazio fine per le migliaia, spazio prima
  dell'unità: "1,944 MeV", "0,24 picobarn".
- Percentuali senza spazio: **"7%"**, "l'1%", "del 10–14%". "Qualche per
  cento" resta in lettere. Le funzioni che formattano una percentuale per
  entrambe le lingue (`lib/data/format.ts`) non si toccano.
- Nello stesso sintagma non si alternano "m" e "metri": "1400 m di roccia,
  pari a 3800 m di acqua equivalente".
- Una riga γ si dà sempre nella stessa unità in tutto il sito: 1809 keV per
  l'²⁶Al, 1275 keV per il ²²Na.
- Date: mesi abbreviati con il punto ("giu. 2025", anche in `months`);
  intervalli con il trattino breve chiuso ("2024–oggi", "ott. 2023–mag.
  2025") oppure "dal 2023".

### Virgolette e maiuscole

- «Caporali» per il testo italiano; “alte” solo per titoli inglesi e
  citazioni annidate; mai virgolette dritte nel testo.
- "Curriculum vitae"; "Agenzia internazionale per l'energia atomica".
  Sistema Solare, Galassia e Universo restano maiuscoli.

### Sintassi

- Verbi prima delle nominalizzazioni.
- Congiuntivo dopo "di quanto" ("di quanto prevedano i modelli") e nelle
  interrogative indirette ("verificare come gli elettroni alterino…").
- "La maggior parte" concorda al singolare ("è nata la maggior parte dello
  stronzio").
- Soggetto esplicito quando cambia ("Quando i neutroni si esauriscono, i
  nuclei decadono…"; "emessi quando il campione cattura un neutrone"); niente
  participi sospesi.
- Niente ripetizioni ravvicinate (punto/punti, teoria/teoria, lungo/lunga;
  per il centro di una stella si scrive "cuore" se nella stessa frase c'è un
  nucleo atomico).
- Calchi da evitare: "è il punto in cui" per una cosa che non è un punto,
  "rende precisa una misura", "prendere una direzione", "libero di essere
  usato", "reverse engineering" (ingegneria inversa), "ripple" senza glossa.

### Controlli che vincolano il testo

- Curiosità (`lib/rates/curiosities.ts`): un aggancio (`hook`) ha al massimo
  15 parole anche in italiano, e ogni avvertenza contiene "Modello a zona
  singola" e "Una stella vera si riassesta" (`npm run test:rates`). Dopo aver
  cambiato una frase o un'avvertenza si rigenerano le schede social con
  `node scripts/rates/curiosity-cards.mjs`; l'avvertenza deve stare su una
  riga della scheda.
- Titoli e descrizioni delle pagine sono ripetuti in
  `scripts/search-index.mjs` (`PAGES`): si cambiano entrambi
  (`npm run test:search`). Le parole chiave di ricerca (`keywords_it`,
  `also_it`) tengono anche le forme da evitare, perché sono quelle che la
  gente scrive.
