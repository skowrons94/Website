import "@/components/math-styles"

import type { Metadata } from "next"
import Link from "next/link"
import { ChevronRight } from "lucide-react"

import { PageLd } from "@/components/json-ld"
import { Container, PageHeader } from "@/components/page-header"
import { getProfile, renderMarkdown } from "@/lib/content"
import { EX2, THIRTEEN_N, exercise1, exercise2 } from "@/lib/exercises"
import { dict, localePath, type Lang } from "@/lib/i18n"
import { pageMetadata } from "@/lib/metadata"
import { pageUrl } from "@/lib/site-url"
import { PERSON_ID } from "@/lib/structured-data"

/*
 * /learn/exercises: three short problems for students, each solved with the
 * site's own tools and each with a worked solution folded under it.
 *
 * Every number in the solutions is computed at build time (lib/exercises.ts,
 * from the AME2020 masses the atlas uses and the formulas the atlas and the
 * rates explorer use), or is an AZURE2 result recorded with how to repeat it
 * (THIRTEEN_N), or is cited. The text is Markdown with KaTeX, rendered by the
 * notes' renderer.
 */

/* -- numbers --------------------------------------------------------------- */

const SUP: Record<string, string> = { "-": "⁻", "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹" }

function fmt(lang: Lang) {
  const comma = (s: string) => (lang === "it" ? s.replace(".", ",") : s)
  /** Fixed decimals. */
  const f = (x: number, d: number) => comma(x.toFixed(d))
  /** Whole number with a thin space between thousands (SI style); English leaves four digits whole (docs/STYLE.md). */
  const n = (x: number) => {
    const r = Math.round(x)
    return lang === "en" && Math.abs(r) < 10000 ? String(r) : r.toString().replace(/\B(?=(\d{3})+(?!\d))/g, "\u202f")
  }
  /** a × 10ⁿ with `d` decimals in the mantissa. */
  const e = (x: number, d = 1) => {
    const exp = Math.floor(Math.log10(Math.abs(x)))
    const m = x / 10 ** exp
    return `${comma(m.toFixed(d))} × 10${String(exp).replace(/[-0-9]/g, (c) => SUP[c])}`
  }
  /** A percentage change, signed. */
  const pct = (before: number, after: number) => {
    const p = ((after - before) / before) * 100
    return `${p >= 0 ? "+" : "−"}${comma(Math.abs(p).toFixed(0))}%`
  }
  return { f, n, e, pct }
}

/* -- the words ------------------------------------------------------------- */

type Section = { id: string; title: string; needs: string; problem: string; solution: string }

function content(lang: Lang) {
  const x1 = exercise1()
  const x2 = exercise2()
  const t = THIRTEEN_N
  const { f, n, e, pct } = fmt(lang)
  const to = (p: string) => localePath(lang, p)
  const ratio = x2.sigmaPeak_b / x2.sigma_b
  const muc2 = (x1.mu * 931.49410242).toFixed(2)
  const lowE = x1.E0 - x1.width / 2
  const highE = x1.E0 + x1.width / 2
  const effLo = x2.perDay[0]
  const effHi = x2.perDay[x2.perDay.length - 1]
  const perSecond = x2.sigma_b * 1e-24 * EX2.target_per_cm2 * x2.protonsPerSecond
  const oneIn = 1 / x2.fractionMax
  const years = 1 / x2.peakPerYear

  if (lang === "it") {
    return {
      title: "Esercizi",
      eyebrow: "Approfondimenti",
      description:
        "Tre esercizi di astrofisica nucleare con soluzione svolta: il picco di Gamow di ¹⁴N + p, perché LUNA è sotto terra, e un livello R-matrix del ¹³N da modificare.",
      lead:
        "Tre problemi brevi per studenti, da un primo corso di fisica nucleare a un corso di dottorato in astrofisica nucleare. Ognuno si risolve con carta, penna e gli strumenti di questo sito, e ha una soluzione svolta da aprire alla fine.",
      howTo:
        "I numeri delle soluzioni non sono scritti a mano: sono calcolati quando il sito viene generato, con le masse AME2020 e le formule dell'atlante e dell'esploratore dei tassi, oppure sono risultati di AZURE2 sulla valutazione del ¹³N, oppure sono citati. Arrotondali pure: è il ragionamento che conta.",
      contents: "Gli esercizi",
      solution: "Soluzione svolta",
      needsLabel: "Serve:",
      sources: "Fonti",
      glossaryLine: "Per mettere alla prova queste parole:",
      sections: [
        {
          id: "gamow",
          title: "Il picco di Gamow di ¹⁴N + p a 15 milioni di kelvin",
          needs: "una calcolatrice; per la verifica, l'atlante o l'esploratore dei tassi.",
          problem: `Nel ciclo CNO il passo più lento è la ¹⁴N(p,γ)¹⁵O. A che energia reagiscono davvero protoni e nuclei di ¹⁴N in una stella a $T = 15$ MK, e in quale intervallo?

1. Calcola $kT$ a 15 MK ($k = 8{,}617 \\times 10^{-5}$ eV/K).
2. Calcola l'energia di Gamow $E_G = 2\\mu c^2 (\\pi \\alpha Z_1 Z_2)^2$, con la massa ridotta $\\mu$ di p + ¹⁴N (masse atomiche 1,007825 u e 14,003074 u; 1 u = 931,494 MeV/c²; $\\alpha = 1/137{,}036$).
3. Il prodotto del fattore di Maxwell–Boltzmann $e^{-E/kT}$ e della probabilità di tunnel $e^{-\\sqrt{E_G/E}}$ ha il massimo in $E_0 = \\left(E_G (kT)^2/4\\right)^{1/3}$; approssimato con una gaussiana, la sua larghezza piena a $1/e$ è $\\Delta = 4\\sqrt{E_0 kT/3}$. Calcola entrambi.
4. Verifica. La [scheda della ¹⁴N(p,γ)¹⁵O](${to("/atlas/14N-pg-15O")}) nell'atlante dà la finestra al centro del Sole, $T_9 = 0{,}0157$: riportala a 15 MK sapendo che $E_0 \\propto T^{2/3}$ e $\\Delta \\propto T^{5/6}$. Oppure apri l'[esploratore dei tassi](${to("/atlas/rates")}) sul ciclo CNO, scegli ¹⁴N(p,γ) e porta la temperatura a 15 MK: il pannello del picco di Gamow mostra $E_0 \\pm \\Delta/2$.
5. LUNA ha misurato questa reazione fino a 70 keV. Supponendo il fattore $S$ costante, di quanto è più piccola la sezione d'urto in $E_0$ che a 70 keV?`,
          solution: `1. $kT = 8{,}617 \\times 10^{-5}\\ \\text{eV/K} \\times 1{,}5 \\times 10^{7}\\ \\text{K}$ = **${f(x1.kT, 3)} keV**.
2. $\\mu$ = ${f(x1.mu, 5)} u, quindi $\\mu c^2$ = ${muc2.replace(".", ",")} MeV, e $E_G$ = **${f(x1.EG / 1000, 1)} MeV** (${n(x1.EG)} keV).
3. $E_0$ = **${f(x1.E0, 1)} keV** e $\\Delta$ = **${f(x1.width, 1)} keV**: la finestra va all'incirca da ${f(lowE, 0)} a ${f(highE, 0)} keV. $E_0$ vale circa ${f(x1.E0 / x1.kT, 0)} volte $kT$: le reazioni vengono dalla coda lontana della distribuzione termica, dove i protoni sono pochi ma la barriera è un po' più sottile.
4. L'atlante dà ${f(x1.atlasE0, 1)} keV e ${f(x1.atlasWidth, 1)} keV a 15,7 MK; riportati a 15 MK diventano ${f(x1.scaledE0, 1)} keV e ${f(x1.scaledWidth, 1)} keV, come sopra. L'esploratore dei tassi mostra ${f(x1.explorerE0, 1)} ± ${f(x1.explorerHalf, 1)} keV: usa i numeri di massa (14 e 1) per la massa ridotta, e un $\\mu$ più piccolo dello 0,7% sposta $E_0$ dello 0,2% ($E_0 \\propto \\mu^{1/3}$).
5. $\\sigma(E) = \\dfrac{S}{E}\\, e^{-\\sqrt{E_G/E}}$, quindi $\\dfrac{\\sigma(E_0)}{\\sigma(70\\ \\text{keV})} = \\dfrac{70}{E_0}\\, e^{\\sqrt{E_G/70} - \\sqrt{E_G/E_0}}$ ≈ **${e(ratio)}**: circa ${f(1 / ratio / 1e6, 1)} milioni di volte più piccola. Per questo, alle energie del Sole, la sezione d'urto si estrapola (esercizio 3) invece di misurarla.`,
        },
        {
          id: "underground",
          title: "Perché LUNA è sotto terra?",
          needs: "una calcolatrice e i risultati dell'esercizio 1.",
          problem: `Stima il segnale della ¹⁴N(p,γ)¹⁵O alla più bassa energia misurata da LUNA, 70 keV, e confrontalo con il fondo dei raggi cosmici in un rivelatore di raggi γ in superficie e sotto il Gran Sasso.

Prendi:
- $S \\approx 1{,}7$ keV b, il fattore $S$ totale di LUNA ([atlante](${to("/atlas/14N-pg-15O")}); Formicola et al. 2004), costante a queste energie, ed $E_G$ dall'esercizio 1;
- un fascio di protoni di 200 µA, un bersaglio con 10¹⁸ nuclei di ¹⁴N per cm² e un'efficienza di rivelazione fra l'1% (un rivelatore al germanio) e il 50% (un cristallo a somma che circonda il bersaglio). Sono ipotesi tonde, dell'ordine di grandezza giusto, non i parametri di un esperimento preciso;
- un rivelatore che offre 100 cm² al cielo, e in superficie circa un muone cosmico per cm² al minuto (Particle Data Group);
- la roccia sopra LUNA, circa 1400 m, riduce i muoni di circa un milione di volte ([glossario](${to("/glossary#luna")})).

1. Quanto vale $\\sigma$(70 keV)?
2. Quante reazioni al giorno vedi?
3. Quanti muoni attraversano il rivelatore in un giorno, in superficie e sotto terra?
4. Quale frazione dei muoni dovrebbe finire nella finestra di energia del segnale (circa 7,3 MeV) perché in superficie il fondo uguagli il segnale? È plausibile?
5. Per finire: quante reazioni all'anno vedresti al picco di Gamow dell'esercizio 1?`,
          solution: `1. $\\sigma = \\dfrac{1{,}7\\ \\text{keV b}}{70\\ \\text{keV}}\\, e^{-\\sqrt{E_G/70\\ \\text{keV}}}$ = **${e(x2.sigma_b, 1)} b**, cioè ${f(x2.sigma_b * 1e12, 2)} pb (1 pb = 10⁻³⁶ cm²).
2. 200 µA sono ${e(x2.protonsPerSecond, 2)} protoni al secondo. Reazioni al secondo: $\\sigma\\, n_t\\, N_p$ = ${e(x2.sigma_b * 1e-24, 1)} cm² × 10¹⁸ cm⁻² × ${e(x2.protonsPerSecond, 2)} s⁻¹ = ${e(perSecond, 1)} s⁻¹, cioè ${f(perSecond * 86400, 0)} al giorno. Rivelate: **${f(effLo.rate, 2)} al giorno** con l'1% di efficienza, **circa ${f(effHi.rate, 0)} al giorno** con il 50%. È quello che l'atlante chiama reazioni che avvengono «solo poche volte al giorno».
3. In superficie: 1 cm⁻² min⁻¹ × 100 cm² × 1440 min = **${n(x2.muonsSurface)} muoni al giorno**. Sotto terra, un milione di volte meno: **${f(x2.muonsUnderground, 2)} al giorno**, uno ogni settimana circa.
4. Con ${f(effHi.rate, 0)} eventi di segnale al giorno, il fondo dei muoni lo eguaglia già se ne finisce nella finestra uno su ${n(oneIn)} (${e(x2.fractionMax, 0)}). Un muone che attraversa tutto il cristallo vi lascia decine di MeV, sopra la finestra; ma quelli che ne sfiorano un angolo, e gli elettroni, i fotoni e i neutroni che i muoni producono nella schermatura e nelle pareti, distribuiscono energia su tutto lo spettro. Tenerne meno di uno su diecimila in una finestra di qualche centinaio di keV non è realistico in superficie: per questo il fondo dei muoni «limita la sensibilità per raggi γ fino a qualche MeV» ([metodi](${to("/atlas/methods")})). Sotto terra il problema sparisce: anche se ogni muone finisse nella finestra, sarebbero ${f(x2.muonsUnderground, 2)} eventi al giorno contro ${f(effHi.rate, 0)}. Il fondo che resta viene dalla radioattività della roccia e dell'apparato, quasi tutto sotto 2,6 MeV (la riga γ più energetica della radioattività naturale, del ²⁰⁸Tl), e dalle reazioni del fascio sulle impurità del bersaglio. Una via di mezzo è il Felsenkeller di Dresda: 45 m di roccia riducono i muoni di un fattore 40, e con un veto attivo il fondo è circa il doppio di quello di un laboratorio profondo ([cronologia](${to("/atlas/timeline")})).
5. Al picco di Gamow, $E_0$ = ${f(x2.E0, 1)} keV, $\\sigma$ ≈ ${e(x2.sigmaPeak_b, 0)} b: con lo stesso fascio, lo stesso bersaglio e il 50% di efficienza, **${e(x2.peakPerYear, 0)} reazioni all'anno**, una ogni ${n(years)} anni circa. Nessun laboratorio misura lì: alle energie del Sole si arriva estrapolando i dati con la teoria R-matrix, che è l'argomento dell'esercizio 3.`,
        },
        {
          id: "rmatrix",
          title: "Un livello R-matrix del ¹³N da modificare",
          needs: `un browser: la [valutazione del ¹³N](${to("/evaluations/13N")}).`,
          problem: `Apri la valutazione della ¹²C(p,γ)¹³N. Il fattore $S$ è dominato dal livello 1/2⁺ del ¹³N a $E_x$ = ${f(t.level.Ex_MeV, 4)} MeV: con la soglia protonica a 1,944 MeV, è una risonanza a $E_R$ ≈ ${f(t.level.ER_keV / 1000, 2)} MeV nel centro di massa, con larghezza protonica $\\Gamma_p$ = ${t.level.gammaP_keV} keV e larghezza γ di circa 0,5 eV.

1. Prima di toccare qualunque cosa, prevedi. In un'approssimazione di Breit–Wigner a un solo livello, $\\sigma(E) \\propto \\dfrac{\\Gamma_p \\Gamma_\\gamma}{(E-E_R)^2 + \\Gamma^2/4}$ con $\\Gamma \\approx \\Gamma_p$ (perché $\\Gamma_\\gamma \\ll \\Gamma_p$). Se $\\Gamma_p$ passa da ${t.level.gammaP_keV} a ${t.level.changedTo_keV} keV, che cosa succede (a) al fattore $S$ al picco, (b) alla larghezza del picco, (c) al fattore $S$ molto sotto la risonanza, alle energie stellari?
2. Annota il χ² ai parametri pubblicati: quello di tutti i dati («χ² per tutti i dati del fit») e quello dei dati LUNA (HPGe) nella tabella degli insiemi di dati.
3. Nello «Schema dei livelli» scegli il livello 1/2⁺ a ${f(t.level.Ex_MeV, 4)} MeV e porta la larghezza del canale protonico a ${t.level.changedTo_keV} keV. Aspetta il ricalcolo e confronta con le tue previsioni: il picco nel grafico, il fattore $S$ a circa 25 keV nella scheda «Estrapolazioni», i due χ².
4. Perché i dati LUNA, che stanno tutti sotto la risonanza (fra 68 e 362 keV), reagiscono così tanto? E perché il fattore $S$ alle energie stellari cresce meno di $\\Gamma_p$?
5. Torna ai valori pubblicati («Ripristina tutto») e sposta invece l'energia del livello di 5 keV verso l'alto. Che cosa succede al χ²?`,
          solution: `1. Al picco, $E = E_R$: $\\sigma \\propto 4\\Gamma_\\gamma/\\Gamma_p$, quindi scende di ${t.level.gammaP_keV}/${t.level.changedTo_keV} = ${f(t.level.gammaP_keV / t.level.changedTo_keV, 2)}, **−15%**. La larghezza del picco è $\\Gamma \\approx \\Gamma_p$: **+18%**. Lontano dalla risonanza, $(E-E_R)^2 \\gg \\Gamma^2/4$ e $\\sigma \\propto \\Gamma_p \\Gamma_\\gamma/(E-E_R)^2$: la coda **sale del 18%**. Un picco più largo e più basso, con le code più alte.
2. e 3. Con AZURE2 su questa valutazione (calcolato il 13 ottobre 2026; solo $\\Gamma_p$ cambiato, tutto il resto come pubblicato):

| | pubblicato | $\\Gamma_p$ = ${t.level.changedTo_keV}\u00a0keV | |
|---|---|---|---|
| $S$ al picco | ${f(t.sfactor.peak.before, 0)}\u00a0keV\u00a0b | ${f(t.sfactor.peak.after, 0)}\u00a0keV\u00a0b | ${pct(t.sfactor.peak.before, t.sfactor.peak.after)} |
| larghezza a metà altezza | ${f(t.fwhm.before, 1)}\u00a0keV | ${f(t.fwhm.after, 1)}\u00a0keV | ${pct(t.fwhm.before, t.fwhm.after)} |
| $S$(24 keV) | ${f(t.sfactor.at24keV.before, 3)}\u00a0keV\u00a0b | ${f(t.sfactor.at24keV.after, 3)}\u00a0keV\u00a0b | ${pct(t.sfactor.at24keV.before, t.sfactor.at24keV.after)} |
| $S$(600 keV), sopra il picco | ${f(t.sfactor.at600keV.before, 2)}\u00a0keV\u00a0b | ${f(t.sfactor.at600keV.after, 2)}\u00a0keV\u00a0b | ${pct(t.sfactor.at600keV.before, t.sfactor.at600keV.after)} |
| χ², tutti i dati (${t.chi2.all.points} punti) | ${n(t.chi2.all.before)} | ${n(t.chi2.all.after)} | |
| χ², LUNA HPGe (${t.chi2.lunaHpge.points} punti) | ${n(t.chi2.lunaHpge.before)} | ${n(t.chi2.lunaHpge.after)} | |

Il picco e la larghezza si comportano come prevede la formula a un livello. Il χ²/N del fit pubblicato è già molto sopra 1 su questa pagina, che non include nel fit le normalizzazioni dei dati (la pagina spiega perché): conta la variazione, non il valore assoluto. E la variazione è enorme: i dati fissano $\\Gamma_p$ molto meglio dei 6 keV di cui l'hai spostata.
4. I dati LUNA stanno sul fianco di bassa energia della risonanza, dove il fattore $S$ sale del 10–14% circa (a 300 keV da 6,72 a 7,64 keV b), e hanno incertezze intorno all'1%: ogni punto si sposta di una decina di deviazioni standard, e il χ² cresce col quadrato dello scarto. Alle energie stellari, invece, il fattore $S$ cresce solo del ${pct(t.sfactor.at24keV.before, t.sfactor.at24keV.after).replace(/[+ %]/g, "")}%, non del 18%: lì non c'è solo la coda della risonanza ma anche la cattura diretta, che non dipende da $\\Gamma_p$, e le due ampiezze si sommano (interferiscono) prima di elevare al quadrato. Cresce solo la parte risonante.
5. Con l'energia spostata di 5 keV il χ² di tutti i dati arriva a ${n(t.energyShift.chi2All)}, più che cambiando la larghezza: sui fianchi ripidi di una risonanza larga ${t.level.gammaP_keV} keV, spostarla di 5 keV cambia il fattore $S$ di molte volte l'incertezza dei dati misurati lì. Per questo l'energia di una risonanza ben misurata è il parametro più vincolato di un fit R-matrix.`,
        },
      ] satisfies Section[],
      sourceList: [
        { text: "AME2020: M. Wang et al., Chin. Phys. C 45, 030003 (2021): le masse atomiche", href: "https://doi.org/10.1088/1674-1137/abddaf" },
        { text: "A. Formicola et al. (LUNA), Phys. Lett. B 591, 61 (2004): S(0) della ¹⁴N(p,γ)¹⁵O", href: "https://doi.org/10.1016/j.physletb.2004.03.092" },
        { text: "Particle Data Group, Review of Particle Physics, rassegna «Cosmic rays»: circa 1 muone cm⁻² min⁻¹ al livello del mare", href: "https://pdg.lbl.gov/2024/reviews/rpp2024-rev-cosmic-rays.pdf" },
        { text: "J. Skowronski et al., Phys. Rev. C 111, 035802 (2025): la valutazione del ¹³N", href: "https://doi.org/10.1103/PhysRevC.111.035802" },
      ],
    }
  }

  return {
    title: "Exercises",
    eyebrow: "Learn",
    description:
      "Three nuclear-astrophysics exercises with worked solutions: the Gamow peak of ¹⁴N + p, why LUNA is underground, and an R-matrix level of ¹³N to change.",
    lead:
      "Three short problems for students, from a first course in nuclear physics to a PhD course in nuclear astrophysics. Each is solved with pen, paper and the tools of this site, and has a worked solution to open at the end.",
    howTo:
      "The numbers in the solutions are not typed in: they are computed when the site is built, from the AME2020 masses and the formulas the atlas and the rate explorer use, or they are AZURE2 results on the ¹³N evaluation, or they are cited. Round them as you like: the reasoning is what counts.",
    contents: "The exercises",
    solution: "Worked solution",
    needsLabel: "You need:",
    sources: "Sources",
    glossaryLine: "To put these words to work:",
    sections: [
      {
        id: "gamow",
        title: "The Gamow peak of ¹⁴N + p at 15 million kelvin",
        needs: "a calculator; to check, the atlas or the rate explorer.",
        problem: `The slowest step of the CNO cycle is ¹⁴N(p,γ)¹⁵O. At what energy do protons and ¹⁴N nuclei react in a star at $T = 15$ MK, and over what range?

1. Compute $kT$ at 15 MK ($k = 8.617 \\times 10^{-5}$ eV/K).
2. Compute the Gamow energy $E_G = 2\\mu c^2 (\\pi \\alpha Z_1 Z_2)^2$, with the reduced mass $\\mu$ of p + ¹⁴N (atomic masses 1.007825 u and 14.003074 u; 1 u = 931.494 MeV/c²; $\\alpha = 1/137.036$).
3. The product of the Maxwell–Boltzmann factor $e^{-E/kT}$ and the tunnelling probability $e^{-\\sqrt{E_G/E}}$ peaks at $E_0 = \\left(E_G (kT)^2/4\\right)^{1/3}$; approximated by a Gaussian, its full width at $1/e$ is $\\Delta = 4\\sqrt{E_0 kT/3}$. Compute both.
4. Check. The atlas entry for [¹⁴N(p,γ)¹⁵O](${to("/atlas/14N-pg-15O")}) gives the window at the centre of the Sun, $T_9 = 0.0157$: scale it to 15 MK, knowing that $E_0 \\propto T^{2/3}$ and $\\Delta \\propto T^{5/6}$. Or open the [rate explorer](${to("/atlas/rates")}) on the CNO cycle, choose ¹⁴N(p,γ) and bring the temperature to 15 MK: the Gamow-peak panel shows $E_0 \\pm \\Delta/2$.
5. LUNA measured this reaction down to 70 keV. Taking the $S$-factor as constant, how much smaller is the cross section at $E_0$ than at 70 keV?`,
        solution: `1. $kT = 8.617 \\times 10^{-5}\\ \\text{eV/K} \\times 1.5 \\times 10^{7}\\ \\text{K}$ = **${f(x1.kT, 3)} keV**.
2. $\\mu$ = ${f(x1.mu, 5)} u, so $\\mu c^2$ = ${muc2} MeV, and $E_G$ = **${f(x1.EG / 1000, 1)} MeV** (${n(x1.EG)} keV).
3. $E_0$ = **${f(x1.E0, 1)} keV** and $\\Delta$ = **${f(x1.width, 1)} keV**: the window runs from about ${f(lowE, 0)} to ${f(highE, 0)} keV. $E_0$ is about ${f(x1.E0 / x1.kT, 0)} times $kT$: the reactions come from the far tail of the thermal distribution, where protons are few but the barrier is a little thinner.
4. The atlas gives ${f(x1.atlasE0, 1)} keV and ${f(x1.atlasWidth, 1)} keV at 15.7 MK; scaled to 15 MK they become ${f(x1.scaledE0, 1)} keV and ${f(x1.scaledWidth, 1)} keV, as above. The rate explorer shows ${f(x1.explorerE0, 1)} ± ${f(x1.explorerHalf, 1)} keV: it takes the mass numbers (14 and 1) for the reduced mass, and a $\\mu$ 0.7% smaller moves $E_0$ by 0.2% ($E_0 \\propto \\mu^{1/3}$).
5. $\\sigma(E) = \\dfrac{S}{E}\\, e^{-\\sqrt{E_G/E}}$, so $\\dfrac{\\sigma(E_0)}{\\sigma(70\\ \\text{keV})} = \\dfrac{70}{E_0}\\, e^{\\sqrt{E_G/70} - \\sqrt{E_G/E_0}}$ ≈ **${e(ratio)}**: about ${f(1 / ratio / 1e6, 1)} million times smaller. That is why, at the Sun's energies, the cross section is extrapolated (exercise 3) rather than measured.`,
      },
      {
        id: "underground",
        title: "Why is LUNA underground?",
        needs: "a calculator and the results of exercise 1.",
        problem: `Estimate the signal of ¹⁴N(p,γ)¹⁵O at the lowest energy LUNA measured, 70 keV, and compare it with the cosmic-ray background in a γ-ray detector at the surface and under the Gran Sasso.

Take:
- $S \\approx 1.7$ keV b, LUNA's total $S$-factor ([atlas](${to("/atlas/14N-pg-15O")}); Formicola et al. 2004), constant at these energies, and $E_G$ from exercise 1;
- a proton beam of 200 µA, a target with 10¹⁸ ¹⁴N nuclei per cm², and a detection efficiency between 1% (a germanium detector) and 50% (a summing crystal around the target). These are round assumptions of the right order of magnitude, not the parameters of a particular experiment;
- a detector that presents 100 cm² to the sky, and at the surface about one cosmic-ray muon per cm² per minute (Particle Data Group);
- the rock above LUNA, about 1.4 km of it, reduces the muons about a millionfold ([glossary](${to("/glossary#luna")})).

1. What is $\\sigma$(70 keV)?
2. How many reactions a day do you detect?
3. How many muons cross the detector in a day, at the surface and underground?
4. What fraction of the muons would have to land in the signal's energy window (around 7.3 MeV) for the background at the surface to equal the signal? Is that plausible?
5. Finally: how many reactions a year would you see at the Gamow peak of exercise 1?`,
        solution: `1. $\\sigma = \\dfrac{1.7\\ \\text{keV b}}{70\\ \\text{keV}}\\, e^{-\\sqrt{E_G/70\\ \\text{keV}}}$ = **${e(x2.sigma_b, 1)} b**, that is ${f(x2.sigma_b * 1e12, 2)} pb (1 pb = 10⁻³⁶ cm²).
2. 200 µA is ${e(x2.protonsPerSecond, 2)} protons per second. Reactions per second: $\\sigma\\, n_t\\, N_p$ = ${e(x2.sigma_b * 1e-24, 1)} cm² × 10¹⁸ cm⁻² × ${e(x2.protonsPerSecond, 2)} s⁻¹ = ${e(perSecond, 1)} s⁻¹, or ${f(perSecond * 86400, 0)} a day. Detected: **${f(effLo.rate, 2)} a day** at 1% efficiency, **about ${f(effHi.rate, 0)} a day** at 50%. This is what the atlas means by reactions that happen "only a few times per day".
3. At the surface: 1 cm⁻² min⁻¹ × 100 cm² × 1440 min = **${n(x2.muonsSurface)} muons a day**. Underground, a million times fewer: **${f(x2.muonsUnderground, 2)} a day**, about one a week.
4. With ${f(effHi.rate, 0)} signal events a day, the muon background equals it as soon as one muon in ${n(oneIn)} (${e(x2.fractionMax, 0)}) lands in the window. A muon that crosses the whole crystal leaves tens of MeV in it, above the window; but those that clip a corner, and the electrons, photons and neutrons the muons make in the shielding and the walls, spread energy over the whole spectrum. Keeping fewer than one in ten thousand in a window a few hundred keV wide is not realistic at the surface: that is why the muon background "limits the sensitivity for γ-ray energies up to several MeV" ([methods](${to("/atlas/methods")})). Underground the problem disappears: even if every muon landed in the window, it would be ${f(x2.muonsUnderground, 2)} events a day against ${f(effHi.rate, 0)}. The background that remains comes from the radioactivity of the rock and of the set-up, nearly all of it below 2.6 MeV (the most energetic γ-ray line of natural radioactivity, from ²⁰⁸Tl), and from beam-induced reactions on target contaminants. Felsenkeller in Dresden is the middle way: 45 m of rock reduces the muons by a factor of 40, and with an active veto the background is about twice that of a deep laboratory ([timeline](${to("/atlas/timeline")})).
5. At the Gamow peak, $E_0$ = ${f(x2.E0, 1)} keV, $\\sigma$ ≈ ${e(x2.sigmaPeak_b, 0)} b: with the same beam, target and 50% efficiency, **${e(x2.peakPerYear, 0)} reactions a year**, one every ${n(years)} years or so. No laboratory measures there: the Sun's energies are reached by extrapolating the data with R-matrix theory, which is what exercise 3 is about.`,
      },
      {
        id: "rmatrix",
        title: "An R-matrix level of ¹³N to change",
        needs: `a browser: the [¹³N evaluation](${to("/evaluations/13N")}).`,
        problem: `Open the ¹²C(p,γ)¹³N evaluation. Its $S$-factor is dominated by the 1/2⁺ level of ¹³N at $E_x$ = ${f(t.level.Ex_MeV, 4)} MeV: with the proton threshold at 1.944 MeV, a resonance at $E_R$ ≈ ${f(t.level.ER_keV / 1000, 2)} MeV in the centre of mass, with proton width $\\Gamma_p$ = ${t.level.gammaP_keV} keV and a γ width of about 0.5 eV.

1. Before touching anything, predict. In a single-level Breit–Wigner approximation, $\\sigma(E) \\propto \\dfrac{\\Gamma_p \\Gamma_\\gamma}{(E-E_R)^2 + \\Gamma^2/4}$ with $\\Gamma \\approx \\Gamma_p$ (because $\\Gamma_\\gamma \\ll \\Gamma_p$). If $\\Gamma_p$ goes from ${t.level.gammaP_keV} to ${t.level.changedTo_keV} keV, what happens to (a) the $S$-factor at the peak, (b) the width of the peak, (c) the $S$-factor far below the resonance, at stellar energies?
2. Note the χ² at the published parameters: for all the data ("χ² for all the data in the fit") and for the LUNA (HPGe) data in the table of all datasets.
3. In the "Level scheme", choose the 1/2⁺ level at ${f(t.level.Ex_MeV, 4)} MeV and set the width of its proton channel to ${t.level.changedTo_keV} keV. Wait for the recalculation and compare with your predictions: the peak in the plot, the $S$-factor at about 25 keV in the "Extrapolations" tab, the two χ².
4. Why do the LUNA data, all of them below the resonance (68 to 362 keV), react so strongly? And why does the $S$-factor at stellar energies grow by less than $\\Gamma_p$ does?
5. Go back to the published values ("Reset all") and move the level's energy up by 5 keV instead. What happens to the χ²?`,
        solution: `1. At the peak, $E = E_R$: $\\sigma \\propto 4\\Gamma_\\gamma/\\Gamma_p$, so it falls by ${t.level.gammaP_keV}/${t.level.changedTo_keV} = ${f(t.level.gammaP_keV / t.level.changedTo_keV, 2)}, **−15%**. The width of the peak is $\\Gamma \\approx \\Gamma_p$: **+18%**. Far from the resonance, $(E-E_R)^2 \\gg \\Gamma^2/4$ and $\\sigma \\propto \\Gamma_p \\Gamma_\\gamma/(E-E_R)^2$: the tail **rises by 18%**. A wider, lower peak with higher wings.
2. and 3. With AZURE2 on this evaluation (computed on 13 October 2026; only $\\Gamma_p$ changed, everything else as published):

| | published | $\\Gamma_p$ = ${t.level.changedTo_keV}\u00a0keV | |
|---|---|---|---|
| $S$ at the peak | ${f(t.sfactor.peak.before, 0)}\u00a0keV\u00a0b | ${f(t.sfactor.peak.after, 0)}\u00a0keV\u00a0b | ${pct(t.sfactor.peak.before, t.sfactor.peak.after)} |
| full width at half maximum | ${f(t.fwhm.before, 1)}\u00a0keV | ${f(t.fwhm.after, 1)}\u00a0keV | ${pct(t.fwhm.before, t.fwhm.after)} |
| $S$(24 keV) | ${f(t.sfactor.at24keV.before, 3)}\u00a0keV\u00a0b | ${f(t.sfactor.at24keV.after, 3)}\u00a0keV\u00a0b | ${pct(t.sfactor.at24keV.before, t.sfactor.at24keV.after)} |
| $S$(600 keV), above the peak | ${f(t.sfactor.at600keV.before, 2)}\u00a0keV\u00a0b | ${f(t.sfactor.at600keV.after, 2)}\u00a0keV\u00a0b | ${pct(t.sfactor.at600keV.before, t.sfactor.at600keV.after)} |
| χ², all data (${t.chi2.all.points} points) | ${n(t.chi2.all.before)} | ${n(t.chi2.all.after)} | |
| χ², LUNA HPGe (${t.chi2.lunaHpge.points} points) | ${n(t.chi2.lunaHpge.before)} | ${n(t.chi2.lunaHpge.after)} | |

The peak and the width do what the one-level formula says. The published fit's χ²/N is already far above 1 on this page, which does not refit the data's normalizations (the page explains why): what counts is the change, not the absolute value. And the change is huge: the data fix $\\Gamma_p$ far more tightly than the 6 keV you moved it by.
4. The LUNA data sit on the low-energy flank of the resonance, where the $S$-factor rises by some 10–14% (at 300 keV from 6.72 to 7.64 keV b), and their uncertainties are around 1%: every point moves by about ten standard deviations, and the χ² grows with the square of the shift. At stellar energies, though, the $S$-factor grows by only ${pct(t.sfactor.at24keV.before, t.sfactor.at24keV.after).replace(/[+ %]/g, "")}%, not 18%: there it is not only the resonance's tail but also direct capture, which does not depend on $\\Gamma_p$, and the two amplitudes add (interfere) before they are squared. Only the resonant part grows.
5. With the energy moved by 5 keV the χ² of all the data reaches ${n(t.energyShift.chi2All)}, more than for the change of width: on the steep flanks of a resonance ${t.level.gammaP_keV} keV wide, moving it by 5 keV changes the $S$-factor by many times the uncertainty of the data measured there. That is why the energy of a well-measured resonance is the most tightly constrained parameter of an R-matrix fit.`,
      },
    ] satisfies Section[],
    sourceList: [
      { text: "AME2020: M. Wang et al., Chin. Phys. C 45, 030003 (2021): the atomic masses", href: "https://doi.org/10.1088/1674-1137/abddaf" },
      { text: "A. Formicola et al. (LUNA), Phys. Lett. B 591, 61 (2004): S(0) of ¹⁴N(p,γ)¹⁵O", href: "https://doi.org/10.1016/j.physletb.2004.03.092" },
      { text: "Particle Data Group, Review of Particle Physics, “Cosmic rays” review: about 1 muon cm⁻² min⁻¹ at sea level", href: "https://pdg.lbl.gov/2024/reviews/rpp2024-rev-cosmic-rays.pdf" },
      { text: "J. Skowronski et al., Phys. Rev. C 111, 035802 (2025): the ¹³N evaluation", href: "https://doi.org/10.1103/PhysRevC.111.035802" },
    ],
  }
}

export const exercisesMetadata = (lang: Lang): Metadata => {
  const c = content(lang)
  return pageMetadata(c.title, c.description, lang)
}

/** The glossary's pointer to this page (components/pages/glossary.tsx). */
export function ExercisesPointer({ lang }: { lang: Lang }) {
  const c = content(lang)
  return (
    <p className="-mt-6 mb-10 max-w-2xl text-pretty text-sm leading-relaxed text-muted-foreground">
      {c.glossaryLine}{" "}
      <Link href={localePath(lang, "/learn/exercises")} className="text-link underline underline-offset-4 decoration-link/40 hover:decoration-link">
        {dict(lang).nav.exercises.toLowerCase()}
      </Link>
      .
    </p>
  )
}

export async function ExercisesPage({ lang }: { lang: Lang }) {
  const c = content(lang)
  const sections = await Promise.all(
    c.sections.map(async (s) => ({
      ...s,
      needsHtml: await renderMarkdown(s.needs),
      problemHtml: await renderMarkdown(s.problem),
      solutionHtml: await renderMarkdown(s.solution),
    })),
  )
  const name = getProfile(lang).name
  const learning = {
    "@type": "LearningResource",
    name: c.title,
    description: c.description,
    url: pageUrl(localePath(lang, "/learn/exercises")),
    inLanguage: lang,
    learningResourceType: "Problem set",
    educationalLevel: "University",
    teaches: c.sections.map((s) => s.title),
    author: { "@id": PERSON_ID(), name },
    isAccessibleForFree: true,
  }

  return (
    <Container>
      <PageLd lang={lang} trail={[{ name: dict(lang).nav.exercises, path: "/learn/exercises" }]} nodes={[learning]} />
      <PageHeader eyebrow={c.eyebrow} title={c.title} lead={c.lead} />
      <p className="-mt-6 mb-8 max-w-2xl text-pretty text-sm leading-relaxed text-muted-foreground">{c.howTo}</p>

      <nav aria-labelledby="exercises-contents" className="mb-14">
        <h2 id="exercises-contents" className="mb-3 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
          {c.contents}
        </h2>
        <ol className="space-y-1 text-[0.95rem]">
          {sections.map((s, i) => (
            <li key={s.id}>
              <a href={`#${s.id}`} className="inline-flex min-h-10 items-baseline gap-2 text-link underline-offset-4 hover:underline [@media(pointer:fine)]:min-h-8">
                <span className="tabular-nums text-muted-foreground">{i + 1}.</span>
                <span>{s.title}</span>
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <div className="space-y-16">
        {sections.map((s, i) => (
          <section key={s.id} id={s.id} aria-labelledby={`${s.id}-title`} className="scroll-mt-24 border-t border-border/70 pt-8">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
              {c.eyebrow} · {i + 1}/{sections.length}
            </p>
            <h2 id={`${s.id}-title`} className="mt-2 hyphens-auto text-balance font-serif text-2xl font-semibold tracking-tight">
              {s.title}
            </h2>
            <div className="mt-2 flex flex-wrap gap-x-1.5 text-sm text-muted-foreground [&_a]:text-link [&_a]:underline [&_a]:underline-offset-4 [&_p]:inline">
              <span className="font-medium text-foreground/80">{c.needsLabel}</span>
              <span dangerouslySetInnerHTML={{ __html: s.needsHtml }} />
            </div>
            <div className="prose-note mt-6" dangerouslySetInnerHTML={{ __html: s.problemHtml }} />
            <details className="group mt-8 rounded-lg border border-border bg-card">
              <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                <ChevronRight aria-hidden className="h-4 w-4 shrink-0 transition-transform group-open:rotate-90 motion-reduce:transition-none" />
                {c.solution}
              </summary>
              <div className="prose-note border-t border-border px-4 pb-6 pt-2 sm:px-6 [&_table]:text-[0.9em]" dangerouslySetInnerHTML={{ __html: s.solutionHtml }} />
            </details>
          </section>
        ))}
      </div>

      <section aria-labelledby="exercises-sources" className="mt-16 border-t border-border/70 pt-8">
        <h2 id="exercises-sources" className="mb-3 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
          {c.sources}
        </h2>
        <ul className="space-y-2 text-sm leading-relaxed text-muted-foreground">
          {c.sourceList.map((src) => (
            <li key={src.href} className="[overflow-wrap:anywhere]">
              <a href={src.href} className="text-link underline underline-offset-4 decoration-link/40 hover:decoration-link">
                {src.text}
              </a>
            </li>
          ))}
        </ul>
      </section>
    </Container>
  )
}
