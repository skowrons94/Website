import fs from "node:fs"
import path from "node:path"

import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, ArrowRight, SlidersHorizontal } from "lucide-react"

import { Cite, ReferenceList } from "@/components/atlas/reference-list"
import { LunaBadge, StatusBadge } from "@/components/atlas/status-badge"
import { Sci } from "@/components/sci"
import {
  eventsFor,
  formatGamow,
  formatQ,
  formatTemperature,
  getAtlas,
  getFacility,
  getMethod,
  getReaction,
  getReactionIds,
  KIND_LABEL,
  renderDetails,
  STATUS_HINT,
  type Reaction,
} from "@/lib/atlas"

export function generateStaticParams() {
  return getReactionIds().map((id) => ({ id }))
}

export const dynamicParams = false

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const reaction = getReaction(id)
  if (!reaction) return {}
  return {
    title: reaction.label,
    description: reaction.summary || `${reaction.label}: entry in preparation in the reaction atlas.`,
  }
}

/* -- pieces ---------------------------------------------------------------- */

function SectionTitle({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="scroll-mt-24 font-serif text-2xl font-semibold tracking-tight">
      {children}
    </h2>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-4 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">{children}</h2>
  )
}

function Facts({ reaction: r }: { reaction: Reaction }) {
  const atlas = getAtlas()
  return (
    <div className="rounded-lg border border-border bg-card p-5 sm:p-6">
      <Label>Facts</Label>
      <dl className="space-y-4 text-sm">
        {r.q && (
          <div>
            <dt className="text-muted-foreground">Q-value</dt>
            <dd className="mt-0.5 text-base font-medium tabular">{formatQ(r.q)}</dd>
            {r.q.annihilation && (
              <dd className="mt-1 text-xs leading-snug text-muted-foreground">
                Q includes positron annihilation (2m<sub>e</sub>c² = 1.022 MeV). Without it,{" "}
                <span className="tabular">{r.q.kinetic.toFixed(3)} MeV</span> is shared by the positron and the
                neutrino.
              </dd>
            )}
          </div>
        )}

        {r.halfLife && (
          <div>
            <dt className="text-muted-foreground">
              Half-life of <Sci>{r.from ? displayCode(r.target) : r.target}</Sci>
            </dt>
            <dd className="mt-0.5 text-base font-medium tabular">
              <Sci>{r.halfLife.text}</Sci>
            </dd>
            {r.kind !== "decay" && (
              <dd className="mt-1 text-xs leading-snug text-muted-foreground">
                In the laboratory, as a neutral atom. In a star the electron density, and so the rate, differs.
              </dd>
            )}
          </div>
        )}

        {r.gamow.length > 0 && (
          <div>
            <dt className="text-muted-foreground">Gamow window</dt>
            <dd>
              <ul className="mt-1 space-y-1.5">
                {r.gamow.map((g) => (
                  <li key={`${g.T9}-${g.label}`}>
                    <span className="font-medium tabular">{formatGamow(g)}</span>
                    <span className="block text-xs text-muted-foreground">
                      <Sci>{g.label}</Sci>, {formatTemperature(g.T9)} (
                      {atlas.networks.find((n) => n.id === g.network)?.name ?? g.network})
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs leading-snug text-muted-foreground">
                Peak energy E<sub>0</sub> ± half the 1/e width, centre of mass, from the AME2020 masses.
              </p>
            </dd>
          </div>
        )}

        {r.thermal.length > 0 && (
          <div>
            <dt className="text-muted-foreground">Thermal energy kT</dt>
            <dd>
              <ul className="mt-1 space-y-1.5">
                {r.thermal.map((t) => (
                  <li key={t.T9}>
                    <span className="font-medium tabular">{t.kT.toFixed(t.kT < 10 ? 1 : 0)} keV</span>
                    <span className="block text-xs text-muted-foreground">
                      <Sci>{t.label}</Sci>, {formatTemperature(t.T9)}
                    </span>
                  </li>
                ))}
              </ul>
            </dd>
          </div>
        )}

        {r.windowNote && r.gamow.length === 0 && (
          <div>
            <dt className="text-muted-foreground">{r.thermal.length > 0 ? "Why no Gamow window" : "Energies"}</dt>
            <dd className="mt-1 text-xs leading-relaxed text-muted-foreground">
              <Sci>{r.windowNote}</Sci>
            </dd>
          </div>
        )}

        {r.productHalfLife && !r.productHalfLife.stable && r.kind !== "decay" && (
          <div>
            <dt className="text-muted-foreground">
              Product <Sci>{displayCode(r.product)}</Sci>
            </dt>
            <dd className="mt-0.5">
              radioactive, t<sub>½</sub> = <span className="tabular"><Sci>{r.productHalfLife.text}</Sci></span>
            </dd>
          </div>
        )}

        <div>
          <dt className="text-muted-foreground">Kind</dt>
          <dd className="mt-0.5">{KIND_LABEL[r.kind] ?? r.kind}</dd>
        </div>
      </dl>
    </div>
  )
}

/** `14N` → `¹⁴N`, for the facts box; leaves anything else as it is. */
function displayCode(code: string): string {
  const match = /^(\d+)([A-Z][a-z]?)$/.exec(code)
  if (!match) return code
  const sup = "⁰¹²³⁴⁵⁶⁷⁸⁹"
  return `${match[1].replace(/\d/g, (d) => sup[Number(d)])}${match[2]}`
}

/* -- page ------------------------------------------------------------------ */

/** The site's own R-matrix evaluations linked from a reaction (rmatrix: in its file). */
function rmatrixEvaluations(ids: string[]) {
  return ids.map((id) => {
    const file = path.join(process.cwd(), "server", "evaluations", id, "info.json")
    let reference: string | null = null
    try {
      const info = JSON.parse(fs.readFileSync(file, "utf8"))
      reference = typeof info.reference === "string" && info.reference.startsWith("10.") ? info.reference : null
    } catch {
      /* an evaluation without info.json still links */
    }
    return { id, reference }
  })
}

export default async function ReactionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const r = getReaction(id)
  if (!r) notFound()

  const atlas = getAtlas()
  const html = await renderDetails(r.details)
  const events = eventsFor(r.id)
  const networks = r.networks
    .map((nid) => atlas.networks.find((n) => n.id === nid))
    .filter((n): n is NonNullable<typeof n> => Boolean(n))
  const family = networks[0] ? atlas.families.find((f) => f.id === networks[0].family) : undefined

  // Previous and next along the first network the reaction belongs to.
  const sequence = networks[0]?.reactions ?? []
  const position = sequence.indexOf(r.id)
  const prev = position > 0 ? getReaction(sequence[position - 1]) : undefined
  const next = position >= 0 && position < sequence.length - 1 ? getReaction(sequence[position + 1]) : undefined

  const related = r.related.map((rid) => getReaction(rid)).filter((x): x is Reaction => Boolean(x))
  const methods = r.methods.map((mid) => getMethod(mid) ?? { id: mid, name: mid })
  const order = r.references

  return (
    <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8 xl:max-w-7xl">
      <Link
        href={family ? `/atlas#${family.id}` : "/atlas"}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Atlas
      </Link>

      {/* -- header -------------------------------------------------------- */}
      <header className="mt-8 border-b border-border/70 pb-8">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
          {KIND_LABEL[r.kind] ?? r.kind}
          {networks.length > 0 && " · "}
          {networks.map((n, i) => (
            <span key={n.id}>
              {i > 0 && ", "}
              <Link href={`/atlas#${n.family}`} className="underline-offset-4 hover:text-foreground hover:underline">
                <Sci>{n.name}</Sci>
              </Link>
            </span>
          ))}
        </p>
        <h1 className="mt-3 font-serif text-4xl font-semibold tracking-tight sm:text-5xl">
          <Sci>{r.label}</Sci>
        </h1>
        <div className="mt-5 flex flex-wrap items-center gap-2">
          {r.kind !== "decay" && <StatusBadge status={r.status} pending={!r.hasFile} />}
          {!r.hasFile && r.kind === "decay" && <StatusBadge status={null} pending />}
          {r.luna && <LunaBadge label="Measured at LUNA" />}
        </div>
        {r.status && r.kind !== "decay" && (
          <p className="mt-3 max-w-2xl text-pretty text-sm leading-relaxed text-muted-foreground">
            {r.statusNote ? <Sci>{r.statusNote}</Sci> : STATUS_HINT[r.status]}
          </p>
        )}
      </header>

      <div className="mt-10 lg:grid lg:grid-cols-[minmax(0,1fr)_18rem] lg:gap-14 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <article className="min-w-0 max-w-[46rem] xl:max-w-[50rem]">
          {/* -- for a general reader --------------------------------------- */}
          {r.hasFile ? (
            <div className="space-y-5">
              {r.summary && (
                <p className="text-pretty text-xl leading-relaxed">
                  <Sci>{r.summary}</Sci>
                </p>
              )}
              {r.role && (
                <p className="text-pretty text-[1.0625rem] leading-[1.75] text-foreground/90">
                  <Sci>{r.role}</Sci>
                </p>
              )}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border p-6">
              <p className="font-serif text-lg font-semibold tracking-tight">Entry in preparation</p>
              <p className="mt-2 text-pretty leading-relaxed text-muted-foreground">
                The description of this reaction and its measurements has not been written yet. Its place in{" "}
                {networks.length === 1 ? "its network" : "its networks"} and the quantities computed from the
                nuclear masses are already here.
              </p>
            </div>
          )}

          {/* facts sit here on a phone, beside the text on a wide screen */}
          <div className="mt-10 lg:hidden">
            <Facts reaction={r} />
          </div>

          {/* -- timeline strip --------------------------------------------- */}
          {events.length > 0 && (
            <section className="mt-12">
              <Label>On the timeline</Label>
              <ol className="relative space-y-3 border-l border-border pl-5">
                {events.map((e) => (
                  <li key={e.id} className="relative">
                    <span
                      aria-hidden
                      className={`absolute -left-[1.6rem] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-background ${e.luna ? "bg-foreground" : "bg-muted-foreground/50"}`}
                    />
                    <Link href={`/atlas/timeline#${e.id}`} className="group flex flex-wrap items-baseline gap-x-3">
                      <span className="tabular text-sm font-medium">{e.year}</span>
                      <span className="text-[0.95rem] text-muted-foreground group-hover:text-link">
                        <Sci>{e.title}</Sci>
                      </span>
                      {e.luna && <LunaBadge />}
                    </Link>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {/* -- how it was measured ----------------------------------------- */}
          {(methods.length > 0 || r.measurements.length > 0) && (
            <section className="mt-14">
              <SectionTitle id="measured">How it was measured</SectionTitle>
              {methods.length > 0 && (
                <ul className="mt-5 flex flex-wrap gap-2">
                  {methods.map((m) => (
                    <li key={m.id}>
                      <Link
                        href={`/atlas/methods#${m.id}`}
                        className="inline-block rounded-md border border-border px-2.5 py-1 text-sm text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
                      >
                        <Sci>{m.name}</Sci>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}

              {r.measurements.length > 0 && (
                <ol className="mt-8 divide-y divide-border/70 border-y border-border/70">
                  {r.measurements.map((m, i) => {
                    const facility = m.facility ? getFacility(m.facility) : undefined
                    const method = m.method ? getMethod(m.method) : undefined
                    return (
                      <li
                        key={i}
                        className={`grid grid-cols-[3.25rem_minmax(0,1fr)] gap-x-4 py-5 sm:grid-cols-[4rem_minmax(0,1fr)] ${m.luna ? "border-l-2 border-l-foreground/40 pl-3 sm:pl-4" : "pl-[calc(0.75rem+2px)] sm:pl-[calc(1rem+2px)]"}`}
                      >
                        <p className="tabular pt-0.5 text-sm font-medium">{m.year ?? "—"}</p>
                        <div className="min-w-0">
                          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                            {facility ? (
                              <Link
                                href={`/atlas/methods#${facility.id}`}
                                className="font-medium underline-offset-4 hover:text-link hover:underline"
                              >
                                <Sci>{facility.name}</Sci>
                              </Link>
                            ) : m.lab ? (
                              <span className="font-medium">
                                <Sci>{m.lab}</Sci>
                              </span>
                            ) : (
                              <span className="text-muted-foreground">Laboratory not given</span>
                            )}
                            {facility?.lab && (
                              <span className="text-muted-foreground">
                                <Sci>{facility.lab}</Sci>
                              </span>
                            )}
                            {m.luna && <LunaBadge />}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {method && (
                              <Link href={`/atlas/methods#${method.id}`} className="underline-offset-2 hover:text-link hover:underline">
                                <Sci>{method.name}</Sci>
                              </Link>
                            )}
                            {method && m.energy && " · "}
                            {m.energy && <Sci>{m.energy}</Sci>}
                          </p>
                          {m.note && (
                            <p className="mt-2 text-pretty text-[0.95rem] leading-relaxed text-foreground/90">
                              <Sci>{m.note}</Sci> <Cite keys={m.refs} order={order} />
                            </p>
                          )}
                          {!m.note && m.refs.length > 0 && (
                            <p className="mt-2 text-sm">
                              <Cite keys={m.refs} order={order} />
                            </p>
                          )}
                        </div>
                      </li>
                    )
                  })}
                </ol>
              )}
            </section>
          )}

          {/* -- for a specialist -------------------------------------------- */}
          {r.rmatrix.length > 0 && (
            <section className="mt-12 rounded-lg border border-border bg-card p-5 sm:p-6">
              <div className="flex items-start gap-3">
                <SlidersHorizontal className="mt-1 h-5 w-5 shrink-0 text-link" aria-hidden />
                <div className="min-w-0">
                  <h2 className="font-serif text-lg font-semibold tracking-tight">Try it: an R-matrix evaluation</h2>
                  <p className="mt-1.5 text-pretty text-[0.95rem] leading-relaxed text-muted-foreground">
                    An AZURE2 model of this system runs on this site. Change the energies and widths of the
                    levels and watch the fit to the data and the extrapolation to stellar energies follow.
                  </p>
                  <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-[0.95rem]">
                    {rmatrixEvaluations(r.rmatrix).map((ev) => (
                      <li key={ev.id} className="flex flex-wrap items-baseline gap-x-2">
                        <Link href={`/evaluations/${ev.id}`} className="font-medium text-link hover:underline">
                          Open the <Sci>{ev.id.replace(/^(\d+)/, (m) => m.split("").map((d) => "⁰¹²³⁴⁵⁶⁷⁸⁹"[+d]).join(""))}</Sci>{" "}
                          evaluation →
                        </Link>
                        {ev.reference && (
                          <a href={`https://doi.org/${ev.reference}`} className="text-sm text-muted-foreground hover:text-foreground">
                            doi:{ev.reference}
                          </a>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </section>
          )}

          {html && (
            <section className="mt-14">
              <SectionTitle id="details">Details</SectionTitle>
              <div className="prose-note mt-5" dangerouslySetInnerHTML={{ __html: html }} />
            </section>
          )}

          {r.evaluations.length > 0 && (
            <section className="mt-14">
              <SectionTitle id="evaluations">Evaluations</SectionTitle>
              <p className="mt-3 text-pretty text-[0.95rem] leading-relaxed text-muted-foreground">
                Compilations that combine the data into a recommended rate.
              </p>
              <ul className="mt-4 space-y-2 text-[0.95rem]">
                {r.evaluations.map((key) => {
                  const ref = atlas.references[key]
                  return (
                    <li key={key} className="flex gap-2.5">
                      <span className="select-none text-muted-foreground/50">—</span>
                      <span className="text-pretty">
                        {ref ? (
                          <>
                            <Sci>{shortAuthors(ref.authors)}</Sci>
                            {ref.journal ? (
                              <span className="text-muted-foreground">
                                , <Sci>{ref.journal}</Sci>
                              </span>
                            ) : (
                              <span className="text-muted-foreground"> ({ref.year})</span>
                            )}{" "}
                          </>
                        ) : (
                          `${key} `
                        )}
                        <Cite keys={[key]} order={order} />
                      </span>
                    </li>
                  )
                })}
              </ul>
            </section>
          )}

          {r.openQuestions.length > 0 && (
            <section className="mt-14">
              <SectionTitle id="open-questions">Open questions</SectionTitle>
              <ul className="mt-5 space-y-3 border-l-2 border-border pl-5 text-[0.95rem] leading-relaxed text-foreground/90">
                {r.openQuestions.map((q, i) => (
                  <li key={i} className="text-pretty">
                    <Sci>{q}</Sci>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {related.length > 0 && (
            <section className="mt-14">
              <Label>Related reactions</Label>
              <ul className="flex flex-wrap gap-2">
                {related.map((x) => (
                  <li key={x.id}>
                    <Link
                      href={`/atlas/${x.id}`}
                      className="inline-block rounded-md border border-border bg-card px-3 py-1.5 font-serif text-[0.95rem] font-semibold transition-colors hover:border-foreground/30 hover:text-link"
                    >
                      <Sci>{x.label}</Sci>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {order.length > 0 && (
            <section className="mt-16 border-t border-border/70 pt-8">
              <Label>References</Label>
              <ReferenceList keys={order} references={atlas.references} />
            </section>
          )}

          {/* -- along the network ------------------------------------------- */}
          {(prev || next) && (
            <nav
              aria-label={`Along ${networks[0]?.name ?? "the network"}`}
              className="mt-16 grid gap-4 border-t border-border/70 pt-8 sm:grid-cols-2"
            >
              {prev ? (
                <Link href={`/atlas/${prev.id}`} className="group block rounded-lg border border-border p-4 transition-colors hover:border-foreground/30">
                  <span className="flex items-center gap-1.5 text-xs uppercase tracking-[0.12em] text-muted-foreground">
                    <ArrowLeft className="h-3.5 w-3.5" /> Previous in <Sci>{networks[0]?.name}</Sci>
                  </span>
                  <span className="mt-1.5 block font-serif text-lg font-semibold group-hover:text-link">
                    <Sci>{prev.label}</Sci>
                  </span>
                </Link>
              ) : (
                <span className="hidden sm:block" />
              )}
              {next && (
                <Link
                  href={`/atlas/${next.id}`}
                  className="group block rounded-lg border border-border p-4 text-right transition-colors hover:border-foreground/30"
                >
                  <span className="flex items-center justify-end gap-1.5 text-xs uppercase tracking-[0.12em] text-muted-foreground">
                    Next in <Sci>{networks[0]?.name}</Sci> <ArrowRight className="h-3.5 w-3.5" />
                  </span>
                  <span className="mt-1.5 block font-serif text-lg font-semibold group-hover:text-link">
                    <Sci>{next.label}</Sci>
                  </span>
                </Link>
              )}
            </nav>
          )}
        </article>

        <aside className="hidden lg:block">
          <div className="sticky top-24">
            <Facts reaction={r} />
          </div>
        </aside>
      </div>
    </div>
  )
}

/** `B. Acharya et al.` stays; a long author list is cut to the first name. */
function shortAuthors(authors: string): string {
  const parts = authors.split(",")
  if (parts.length <= 2 || /et al/.test(authors)) return authors
  return `${parts[0].trim()} et al.`
}
