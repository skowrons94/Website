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
  /** what the page takes from it, in each language */
  note?: { en: string; it: string }
  doi?: string
  url?: string
}

/** The references of each rates page. */
export const LIGHT_REFS = [
  "cyburt2010",
  "smith2023",
  "willcox2018",
  "kondev2021",
  "lodders2021",
  "bahcall2001",
  "woosley2002",
  "karakas2014",
  "jose1998",
  "ritossa1996",
  "iliadis2002",
  "wallace1982",
  "sandu1997",
  "shampine1997",
]
export const SPROCESS_REFS = [
  "cyburt2010",
  "smith2023",
  "willcox2018",
  "kondev2021",
  "lodders2021",
  "kaeppeler2011",
  "straniero2006",
  "karakas2014",
  "pignatari2010",
  "woosley2002",
  "jung1992",
  "takahashi1987",
  "wallace1982",
  "sandu1997",
  "shampine1997",
]

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
    key: "kondev2021",
    text: "F. G. Kondev, M. Wang, W. J. Huang, S. Naimi and G. Audi, The NUBASE2020 evaluation of nuclear physics properties, Chinese Phys. C 45, 030001 (2021)",
    note: {
      en: "half-lives, and the ground-state decay of ²⁶Al",
      it: "tempi di dimezzamento, e il decadimento dello stato fondamentale del ²⁶Al",
    },
    doi: "10.1088/1674-1137/abddae",
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
    key: "ritossa1996",
    text: "C. Ritossa, E. García-Berro and I. Iben Jr., On the evolution of stars that form electron-degenerate cores processed by carbon burning. II. Isotope abundances and thermal pulses in a 10 M☉ model with an ONe core, ApJ 460, 489 (1996)",
    note: { en: "the ONe white dwarf of the ONe nova", it: "la nana bianca ONe della nova ONe" },
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
    key: "pignatari2010",
    text: "M. Pignatari et al., The weak s-process in massive stars and its dependence on the neutron capture cross sections, ApJ 710, 1557 (2010)",
    doi: "10.1088/0004-637X/710/2/1557",
  },
  {
    key: "jung1992",
    text: "M. Jung et al., First observation of bound-state β⁻ decay, Phys. Rev. Lett. 69, 2164 (1992)",
    note: { en: "why ¹⁶⁴Er is not made here", it: "perché qui non si forma il ¹⁶⁴Er" },
    doi: "10.1103/PhysRevLett.69.2164",
  },
  {
    key: "takahashi1987",
    text: "K. Takahashi and K. Yokoi, Beta-decay rates of highly ionized heavy atoms in stellar interiors, At. Data Nucl. Data Tables 36, 375 (1987)",
    note: { en: "why ¹⁷⁶Hf is not modelled here", it: "perché qui il ¹⁷⁶Hf non è modellato" },
    doi: "10.1016/0092-640X(87)90010-6",
  },
  {
    key: "wallace1982",
    text: "R. K. Wallace, S. E. Woosley and T. A. Weaver, The thermonuclear model for X-ray transients, ApJ 258, 696 (1982)",
    note: { en: "the screening prescription (screen5)", it: "la prescrizione per lo schermaggio (screen5)" },
    doi: "10.1086/160119",
  },
  {
    key: "sandu1997",
    text: "A. Sandu, J. G. Verwer, J. G. Blom, E. J. Spee, G. R. Carmichael and F. A. Potra, Benchmarking stiff ODE solvers for atmospheric chemistry problems II: Rosenbrock solvers, Atmos. Environ. 31, 3459 (1997)",
    note: {
      en: "RODAS3, the Rosenbrock integrator the explorer runs",
      it: "RODAS3, l'integratore di Rosenbrock che usa l'esploratore",
    },
  },
  {
    key: "shampine1997",
    text: "L. F. Shampine and M. W. Reichelt, The MATLAB ODE suite, SIAM J. Sci. Comput. 18, 1 (1997)",
    note: { en: "ode23s, the second integrator", it: "ode23s, il secondo integratore" },
    doi: "10.1137/S1064827594276424",
  },
]

const TEXT = {
  en: {
    title: "Credits, licences and sources",
    reaclib:
      "Reaction rates: the JINA REACLIB database (Cyburt et al. 2010), snapshot of 30 March 2025 as distributed with pynucastro; each rate's own source is listed with it in the specialist tables. REACLIB is free to use with citation.",
    pynucastro:
      "The networks, the rate sources, the solar composition and the screening were exported with pynucastro (Smith et al. 2023; Willcox & Zingale 2018), BSD 3-Clause licence. The browser's solver is checked against pynucastro's own integration of the same networks.",
    refs: "References",
  },
  it: {
    title: "Riconoscimenti, licenze e fonti",
    reaclib:
      "Tassi di reazione: il database JINA REACLIB (Cyburt et al. 2010), versione del 30 marzo 2025 distribuita con pynucastro; la fonte di ogni tasso è indicata accanto a esso nelle tabelle per specialisti. REACLIB si può usare liberamente, citandone la fonte.",
    pynucastro:
      "Le reti, le fonti dei tassi, la composizione solare e lo schermaggio elettronico sono stati esportati con pynucastro (Smith et al. 2023; Willcox e Zingale 2018), licenza BSD a 3 clausole. Il risolutore che gira nel browser è stato verificato sull'integrazione delle stesse reti eseguita da pynucastro.",
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
              <Sci>{r.text}</Sci>
              {r.note && (
                <span className="text-muted-foreground">
                  {" "}
                  — <Sci>{r.note[lang]}</Sci>
                </span>
              )}
              .{" "}
              {r.url && !r.doi && (
                <a
                  href={r.url}
                  className="break-all text-link underline-offset-4 hover:underline"
                  target="_blank"
                  rel="noreferrer"
                >
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
