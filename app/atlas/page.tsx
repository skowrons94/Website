import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight, Download } from "lucide-react"

import { NetworkMap } from "@/components/atlas/network-map"
import { LunaBadge } from "@/components/atlas/status-badge"
import { Sci } from "@/components/sci"
import { getAtlas, getMapData } from "@/lib/atlas"
import { pageMetadata } from "@/lib/metadata"

export const metadata: Metadata = pageMetadata(
  "Reaction atlas",
  "The nuclear reactions that power stars and make the elements: where they sit on the chart of nuclides, how well each is known, and how it was measured.",
)

/** `2004–2011`, `2006`, or nothing. */
function span(years: number[]): string {
  if (years.length === 0) return ""
  const first = years[0]
  const last = years[years.length - 1]
  return first === last ? String(first) : `${first}–${last}`
}

export default function AtlasPage() {
  const atlas = getAtlas()
  const map = getMapData()
  const luna = atlas.reactions.filter((r) => r.luna)
  const written = atlas.reactions.filter((r) => r.hasFile).length

  return (
    <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8 xl:max-w-7xl">
      {/* -- introduction -------------------------------------------------- */}
      <header className="border-b border-border/70 pb-10 lg:grid lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-16">
        <div>
          <p className="mb-3 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
            Reaction atlas
          </p>
          <h1 className="text-balance font-serif text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
            The nuclear reactions that make stars shine
          </h1>
          <nav className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <Link href="/atlas/timeline" className="text-link underline-offset-4 hover:underline">
              A history of the field
            </Link>
            <Link href="/atlas/methods" className="text-link underline-offset-4 hover:underline">
              Methods and laboratories
            </Link>
          </nav>
        </div>

        <div className="mt-8 space-y-4 text-pretty text-[1.0625rem] leading-relaxed text-muted-foreground lg:mt-0">
          <p>
            Stars shine because light nuclei fuse into heavier ones, and almost every element heavier than
            helium was made this way. To model a star, or to read the composition of an old one, we need to
            know how fast each of these reactions runs at the temperature inside it.
          </p>
          <p>
            That rate is hard to measure. Nuclei repel each other electrically, and at stellar temperatures
            they have far too little energy to overcome the repulsion. They fuse only by quantum tunnelling,
            and only within a narrow band of energies, the Gamow window, where the nuclei are fast enough
            and still numerous enough. In the Sun the window for <Sci>¹⁴N + p</Sci> lies near 27 keV. At
            70 keV, the lowest energy at which this reaction has been measured, its cross section is
            0.24 picobarn, or 2.4 × 10<sup>−37</sup> cm².
          </p>
          <p>
            Even an intense beam then produces only a trickle of reactions, and at the surface of the Earth
            cosmic rays make far more counts than that in any γ-ray detector.
            In the early 1990s the LUNA collaboration therefore moved its accelerator under the Gran Sasso
            mountain in Italy, where 1400 m of rock reduce the cosmic-ray muons by about a factor of a
            million. Several reactions of the pp chains and the CNO cycles have since been measured there
            at, or close to, the energies at which the Sun runs them.
          </p>
          <p>
            This atlas collects the reactions that matter most. For each it says what the reaction does, why
            it matters, how it has been measured and what is still uncertain. The map places them on the
            chart of nuclides; pick a process to follow its path.
          </p>
        </div>
      </header>

      {/* -- the map ------------------------------------------------------- */}
      <section className="pt-10" aria-label="Network map">
        <NetworkMap data={map} />
      </section>

      {/* -- LUNA ---------------------------------------------------------- */}
      {luna.length > 0 && (
        <section className="mt-16 border-t border-border/70 pt-10" aria-labelledby="luna-heading">
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
            <h2 id="luna-heading" className="font-serif text-2xl font-semibold tracking-tight">
              LUNA measurements
            </h2>
            <span className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
              <Link href="/atlas/timeline?only=luna" className="text-link underline-offset-4 hover:underline">
                LUNA on the timeline
              </Link>
              <Link href="/research#luna" className="text-link underline-offset-4 hover:underline">
                My work at LUNA
              </Link>
            </span>
          </div>
          <p className="mt-3 max-w-3xl text-pretty leading-relaxed text-muted-foreground">
            Reactions in the atlas with at least one measurement published by the LUNA collaboration, with
            the years of those measurements.
          </p>
          <ul className="mt-6 flex flex-wrap gap-2">
            {luna.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/atlas/${r.id}`}
                  className="group inline-flex items-baseline gap-2 rounded-md border border-border bg-card px-3 py-2 transition-colors hover:border-foreground/30"
                >
                  <span className="font-serif text-[0.95rem] font-semibold group-hover:text-link">
                    <Sci>{r.label}</Sci>
                  </span>
                  {r.lunaYears.length > 0 && (
                    <span className="tabular text-xs text-muted-foreground">{span(r.lunaYears)}</span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* -- further ------------------------------------------------------- */}
      <section className="mt-16 grid gap-6 border-t border-border/70 pt-10 sm:grid-cols-2 lg:grid-cols-3">
        <Link href="/atlas/timeline" className="group block rounded-lg border border-border bg-card p-6">
          <h2 className="font-serif text-lg font-semibold tracking-tight group-hover:text-link">Timeline</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            From Eddington&apos;s guess in 1920 to the latest underground measurements, with the
            observations and facilities in between.
          </p>
          <ArrowRight className="mt-4 h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
        </Link>
        <Link href="/atlas/methods" className="group block rounded-lg border border-border bg-card p-6">
          <h2 className="font-serif text-lg font-semibold tracking-tight group-hover:text-link">
            Methods and laboratories
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            How a cross section at stellar energies is measured, directly or indirectly, and where.
          </p>
          <ArrowRight className="mt-4 h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
        </Link>
        <a
          href={`${process.env.BASE_PATH ?? ""}/atlas/data.json`}
          download
          className="group block rounded-lg border border-border bg-card p-6 sm:col-span-2 lg:col-span-1"
        >
          <h2 className="font-serif text-lg font-semibold tracking-tight group-hover:text-link">The data</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            The whole atlas as one JSON file: {atlas.reactions.length} reactions ({written} with an entry),{" "}
            {Object.keys(atlas.references).length} references, with Q-values and Gamow windows computed from
            AME2020.
          </p>
          <Download className="mt-4 h-4 w-4 text-muted-foreground" />
        </a>
      </section>

      <p className="mt-10 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <LunaBadge /> marks LUNA work throughout the atlas. Q-values from the AME2020 mass evaluation,
        half-lives from NUBASE2020.
      </p>
    </div>
  )
}
