import { Sci } from "@/components/sci"
import type { Lang } from "@/lib/locale"

/**
 * Credits, licences and the references behind the rates pages' numbers
 * (scenario values are cited in scripts/rates/scenarios.yaml and shown in
 * the explorer). DOIs checked against the publishers' records, 2026-10-12.
 */

export interface RatesRef {
  key: string
  text: string
  doi?: string
  url?: string
}

/** The references of each rates page. */
export const LIGHT_REFS = ["cyburt2010", "smith2023", "willcox2018", "lodders2021", "bahcall2001", "woosley2002", "karakas2014", "jose1998", "iliadis2002", "wallace1982", "shampine1997"]
export const SPROCESS_REFS = ["cyburt2010", "smith2023", "willcox2018", "lodders2021", "kaeppeler2011", "straniero2006", "karakas2014", "mohr2016", "woosley2002", "wallace1982", "shampine1997"]

export const RATES_REFS: RatesRef[] = [
  {
    key: "cyburt2010",
    text: "R. H. Cyburt et al., The JINA REACLIB database: its recent updates and impact on type-I X-ray bursts, ApJS 189, 240 (2010)",
    doi: "10.1088/0067-0049/189/1/240",
  },
  {
    key: "smith2023",
    text: "A. I. Smith et al., pynucastro: a Python library for nuclear astrophysics, ApJ 947, 65 (2023)",
    doi: "10.3847/1538-4357/acbaff",
  },
  {
    key: "willcox2018",
    text: "D. E. Willcox and M. Zingale, pynucastro: an interface to nuclear reaction rates and code generator for reaction network equations, JOSS 3, 588 (2018)",
    doi: "10.21105/joss.00588",
  },
  {
    key: "lodders2021",
    text: "K. Lodders, Relative atomic Solar System abundances, mass fractions, and atomic masses of the elements and their isotopes, Space Sci. Rev. 217, 44 (2021)",
    doi: "10.1007/s11214-021-00825-8",
  },
  {
    key: "bahcall2001",
    text: "J. N. Bahcall, M. H. Pinsonneault and S. Basu, Solar models: current epoch and time dependences, neutrinos, and helioseismological properties, ApJ 555, 990 (2001)",
    doi: "10.1086/321493",
  },
  {
    key: "woosley2002",
    text: "S. E. Woosley, A. Heger and T. A. Weaver, The evolution and explosion of massive stars, Rev. Mod. Phys. 74, 1015 (2002)",
    doi: "10.1103/RevModPhys.74.1015",
  },
  {
    key: "karakas2014",
    text: "A. I. Karakas and J. C. Lattanzio, The Dawes review 2: nucleosynthesis and stellar yields of low- and intermediate-mass single stars, PASA 31, e030 (2014)",
    doi: "10.1017/pasa.2014.21",
  },
  {
    key: "jose1998",
    text: "J. José and M. Hernanz, Nucleosynthesis in classical novae: CO versus ONe white dwarfs, ApJ 494, 680 (1998)",
    doi: "10.1086/305244",
  },
  {
    key: "iliadis2002",
    text: "C. Iliadis et al., The effects of thermonuclear reaction-rate variations on nova nucleosynthesis: a sensitivity study, ApJS 142, 105 (2002)",
    doi: "10.1086/341400",
  },
  {
    key: "kaeppeler2011",
    text: "F. Käppeler, R. Gallino, S. Bisterzo and W. Aoki, The s process: nuclear physics, stellar models, and observations, Rev. Mod. Phys. 83, 157 (2011)",
    doi: "10.1103/RevModPhys.83.157",
  },
  {
    key: "straniero2006",
    text: "O. Straniero, R. Gallino and S. Cristallo, s process in low-mass asymptotic giant branch stars, Nucl. Phys. A 777, 311 (2006)",
    doi: "10.1016/j.nuclphysa.2005.01.011",
  },
  {
    key: "mohr2016",
    text: "P. Mohr et al., Re-evaluation of the ¹⁶O(n,γ)¹⁷O cross section at astrophysical energies and its role as neutron poison in the s process, ApJ 827, 29 (2016)",
    url: "https://arxiv.org/abs/1605.02639",
  },
  {
    key: "wallace1982",
    text: "R. K. Wallace, S. E. Woosley and T. A. Weaver, The thermonuclear model for X-ray transients, ApJ 258, 696 (1982) — the screening prescription (screen5)",
    doi: "10.1086/160119",
  },
  {
    key: "shampine1997",
    text: "L. F. Shampine and M. W. Reichelt, The MATLAB ODE suite, SIAM J. Sci. Comput. 18, 1 (1997) — the Rosenbrock integrator",
    doi: "10.1137/S1064827594276424",
  },
]

const TEXT = {
  en: {
    title: "Credits, licences and sources",
    reaclib:
      "Reaction rates: the JINA REACLIB database (Cyburt et al. 2010), snapshot of 30 March 2025 as distributed with pynucastro; each rate's own source is listed with it in the specialist tables. REACLIB is free to use with citation.",
    pynucastro:
      "The networks, the rate sources, the solar composition and the screening were exported with pynucastro (Smith et al. 2023; Willcox & Zingale 2018), BSD 3-Clause licence. The browser's solver is checked against pynucastro's own integration of the same networks (scripts/rates/reference.py).",
    refs: "References",
  },
  it: {
    title: "Riconoscimenti, licenze e fonti",
    reaclib:
      "Tassi di reazione: il database JINA REACLIB (Cyburt et al. 2010), versione del 30 marzo 2025 distribuita con pynucastro; la fonte di ogni tasso è indicata accanto a esso nelle tabelle per specialisti. REACLIB è libero di essere usato, citandolo.",
    pynucastro:
      "Le reti, le fonti dei tassi, la composizione solare e lo schermo elettronico sono stati esportati con pynucastro (Smith et al. 2023; Willcox e Zingale 2018), licenza BSD 3-Clause. Il risolutore del browser è verificato con l'integrazione delle stesse reti fatta da pynucastro (scripts/rates/reference.py).",
    refs: "Bibliografia",
  },
} as const

export function RatesCredits({ lang, keys }: { lang: Lang; keys?: string[] }) {
  const t = TEXT[lang]
  const refs = keys ? keys.map((k) => RATES_REFS.find((r) => r.key === k)!).filter(Boolean) : RATES_REFS
  return (
    <section
      id="credits"
      className="mt-16 scroll-mt-24 border-t border-border/70 pt-10"
      aria-labelledby="credits-heading"
    >
      <h2 id="credits-heading" className="font-serif text-2xl font-semibold tracking-tight">
        {t.title}
      </h2>
      <div className="mt-4 max-w-[46rem] space-y-3 text-pretty text-sm leading-relaxed text-muted-foreground">
        <p>
          {t.reaclib}{" "}
          <a
            href="https://reaclib.jinaweb.org/"
            className="text-link underline-offset-4 hover:underline"
            target="_blank"
            rel="noreferrer"
          >
            reaclib.jinaweb.org
          </a>
        </p>
        <p>
          {t.pynucastro}{" "}
          <a
            href="https://github.com/pynucastro/pynucastro"
            className="text-link underline-offset-4 hover:underline"
            target="_blank"
            rel="noreferrer"
          >
            github.com/pynucastro/pynucastro
          </a>
        </p>
      </div>
      <h3 className="mb-3 mt-8 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">{t.refs}</h3>
      <ol className="max-w-[52rem] space-y-2 text-sm leading-relaxed">
        {refs.map((r, i) => (
          <li key={r.key} className="grid grid-cols-[1.75rem_minmax(0,1fr)]">
            <span className="tabular text-muted-foreground">{i + 1}.</span>
            <span>
              <Sci>{r.text}</Sci>.{" "}
              {r.url && !r.doi && (
                <a href={r.url} className="break-all text-link underline-offset-4 hover:underline" target="_blank" rel="noreferrer">
                  {r.url.replace(/^https?:\/\//, "")}
                </a>
              )}
              {r.doi && (
                <a
                  href={`https://doi.org/${r.doi}`}
                  className="break-all text-link underline-offset-4 hover:underline"
                  target="_blank"
                  rel="noreferrer"
                >
                  doi:{r.doi}
                </a>
              )}
            </span>
          </li>
        ))}
      </ol>
    </section>
  )
}
