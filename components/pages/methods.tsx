import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, ChevronRight, ExternalLink } from "lucide-react"

import { LunaBadge } from "@/components/atlas/status-badge"
import { LunaFigure } from "@/components/atlas/luna-figure"
import { Container, PageHeader } from "@/components/page-header"
import { Sci } from "@/components/sci"
import { getAtlas, type Facility, type Method, type Reaction } from "@/lib/atlas"
import { referenceHref, shortCitation } from "@/lib/atlas-format"
import { dict, localePath, type Lang } from "@/lib/i18n"
import { pageMetadata } from "@/lib/metadata"

export const methodsMetadata = (lang: Lang): Metadata =>
  pageMetadata(dict(lang).atlas.methodsMeta, dict(lang).atlas.methodsDescription, lang)

const asList = (value: string | string[] | undefined) =>
  value === undefined ? [] : Array.isArray(value) ? value : [value]

/** Facilities fall in three groups; `group` in the file overrides the guess. */
function groupOf(f: Facility): "underground" | "surface" | "other" {
  if (f.group) return f.group
  if (f.underground === true) return "underground"
  if (f.underground === false) return "surface"
  return "other"
}

const GROUPS = ["underground", "surface", "other"] as const

function Citations({ keys, lang }: { keys: string[]; lang: Lang }) {
  const atlas = getAtlas(lang)
  const refs = keys.map((k) => atlas.references[k]).filter(Boolean)
  if (refs.length === 0) return null
  return (
    <p className="mt-4 flex flex-wrap gap-x-4 text-xs text-muted-foreground">
      {refs.map((ref) => {
        const href = referenceHref(ref)
        return href ? (
          <a key={ref.key} href={href} target="_blank" rel="noreferrer" className="inline-flex min-h-6 items-center underline-offset-2 hover:text-link hover:underline">
            <Sci>{shortCitation(ref, lang)}</Sci>
          </a>
        ) : (
          <span key={ref.key}>
            <Sci>{shortCitation(ref, lang)}</Sci>
          </span>
        )
      })}
    </p>
  )
}

function ReactionChips({ reactions, lang }: { reactions: Reaction[]; lang: Lang }) {
  if (reactions.length === 0) return null
  return (
    <ul className="flex flex-wrap gap-1.5">
      {reactions.map((r) => (
        <li key={r.id}>
          <Link
            href={localePath(lang, `/atlas/${r.id}`)}
            className="inline-block rounded-md border border-border bg-background px-2 py-0.5 font-serif text-sm font-semibold transition-colors hover:border-foreground/30 hover:text-link"
          >
            <Sci>{r.label}</Sci>
          </Link>
        </li>
      ))}
    </ul>
  )
}

/** The specialist paragraph of a method or a facility, folded away by default. */
function Specialist({ text, lang }: { text: string; lang: Lang }) {
  return (
    <details className="group mt-3">
      <summary className="inline-flex min-h-8 cursor-pointer list-none items-center gap-1.5 rounded text-sm text-link focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        <ChevronRight className="h-4 w-4 transition-transform group-open:rotate-90" aria-hidden />
        {dict(lang).atlas.forSpecialists}
      </summary>
      <p className="mt-2 text-pretty text-[0.925rem] leading-relaxed text-muted-foreground">
        <Sci>{text}</Sci>
      </p>
    </details>
  )
}

function MethodCard({ method: m, examples, lang }: { method: Method; examples: Reaction[]; lang: Lang }) {
  const t = dict(lang).atlas
  const strengths = asList(m.strengths)
  const limits = asList(m.limits)
  return (
    <article id={m.id} className="min-w-0 scroll-mt-24 rounded-lg border border-border bg-card p-4 [overflow-wrap:anywhere] sm:p-7">
      <h3 className="font-serif text-xl font-semibold tracking-tight">
        <Sci>{m.name}</Sci>
      </h3>
      {m.summary ? (
        <p className="mt-3 text-pretty leading-relaxed">
          <Sci>{m.summary}</Sci>
        </p>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">{t.descriptionPending}</p>
      )}
      {m.details && <Specialist text={m.details} lang={lang} />}
      {(strengths.length > 0 || limits.length > 0) && (
        <div className="mt-5 grid grid-cols-[minmax(0,1fr)] gap-5 sm:grid-cols-2">
          {strengths.length > 0 && (
            <div>
              <h4 className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">{t.strengths}</h4>
              <ul className="mt-2 space-y-1.5 text-[0.925rem] leading-relaxed">
                {strengths.map((s, i) => (
                  <li key={i} className="flex gap-2.5">
                    <span className="select-none text-muted-foreground/60">+</span>
                    <span className="text-pretty">
                      <Sci>{s}</Sci>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {limits.length > 0 && (
            <div>
              <h4 className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">{t.limits}</h4>
              <ul className="mt-2 space-y-1.5 text-[0.925rem] leading-relaxed">
                {limits.map((s, i) => (
                  <li key={i} className="flex gap-2.5">
                    <span className="select-none text-muted-foreground/60">−</span>
                    <span className="text-pretty">
                      <Sci>{s}</Sci>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      {examples.length > 0 && (
        <div className="mt-5">
          <h4 className="mb-2 text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
            {t.examples}
          </h4>
          <ReactionChips reactions={examples} lang={lang} />
        </div>
      )}
      <Citations keys={m.refs ?? []} lang={lang} />
    </article>
  )
}

function FacilityCard({ facility: f, reactions, lang }: { facility: Facility; reactions: Reaction[]; lang: Lang }) {
  const t = dict(lang).atlas
  const facts = [
    [t.facts_.lab, f.lab],
    [t.facts_.location, [f.location, f.country].filter(Boolean).join(", ")],
    [t.facts_.depth, f.depth],
    [t.facts_.accelerator, f.accelerator],
    [t.facts_.years, f.years],
  ].filter(([, v]) => v) as [string, string][]
  return (
    <article
      id={f.id}
      className="min-w-0 scroll-mt-24 rounded-lg border border-border bg-card p-4 [overflow-wrap:anywhere] sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <h3 className="font-serif text-lg font-semibold tracking-tight">
          <Sci>{f.name}</Sci>
        </h3>
        {f.luna && <LunaBadge />}
      </div>
      {facts.length > 0 && (
        <dl className="mt-3 space-y-1 text-sm">
          {facts.map(([label, value]) => (
            <div key={label} className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-3">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="text-pretty">
                <Sci>{value}</Sci>
              </dd>
            </div>
          ))}
        </dl>
      )}
      {f.summary ? (
        <p className="mt-4 text-pretty text-[0.95rem] leading-relaxed">
          <Sci>{f.summary}</Sci>
        </p>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">{t.descriptionPending}</p>
      )}
      {f.details && <Specialist text={f.details} lang={lang} />}
      {reactions.length > 0 && (
        <div className="mt-4">
          <h4 className="mb-2 text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
            {t.measurementsHere}
          </h4>
          <ReactionChips reactions={reactions} lang={lang} />
        </div>
      )}
      <Citations keys={f.refs ?? []} lang={lang} />
      {f.url && (
        <a
          href={f.url}
          target="_blank"
          rel="noreferrer"
          className="mt-4 inline-flex items-center gap-1.5 text-sm text-link underline-offset-4 hover:underline"
        >
          {t.website} <ExternalLink className="h-3.5 w-3.5" />
        </a>
      )}
    </article>
  )
}

export function MethodsPage({ lang }: { lang: Lang }) {
  const atlas = getAtlas(lang)
  const t = dict(lang).atlas

  const examplesFor = (m: Method) => {
    const explicit = (m.examples ?? []).map((id) => atlas.reactions.find((r) => r.id === id)).filter(Boolean) as Reaction[]
    const derived = atlas.reactions.filter(
      (r) => !explicit.includes(r) && (r.methods.includes(m.id) || r.measurements.some((x) => x.method === m.id)),
    )
    return [...explicit, ...derived].slice(0, 8)
  }
  const measuredAt = (f: Facility) => atlas.reactions.filter((r) => r.measurements.some((m) => m.facility === f.id))

  const grouped = GROUPS.map((id) => ({
    id,
    ...t.groups[id],
    // LUNA first within its group, otherwise file order.
    facilities: atlas.facilities
      .filter((f) => groupOf(f) === id)
      .map((f, i) => ({ f, i }))
      .sort((a, b) => Number(b.f.luna ?? false) - Number(a.f.luna ?? false) || a.i - b.i)
      .map(({ f }) => f),
  })).filter((g) => g.facilities.length > 0)

  return (
    <Container wide>
      <Link
        href={localePath(lang, "/atlas")}
        className="-mt-2.5 mb-[1.375rem] inline-flex py-2.5 items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        {t.name}
      </Link>
      <PageHeader eyebrow={t.name} title={t.methodsTitle} lead={t.methodsLead} />

      <nav className="mb-14 flex flex-wrap gap-x-6 gap-y-2 text-sm">
        <a href="#methods" className="text-muted-foreground underline-offset-4 hover:text-link hover:underline">
          {t.methods}
        </a>
        {grouped.map((g) => (
          <a key={g.id} href={`#${g.id}`} className="text-muted-foreground underline-offset-4 hover:text-link hover:underline">
            {g.title}
          </a>
        ))}
      </nav>

      <section id="methods" className="scroll-mt-24">
        <h2 className="mb-6 font-serif text-2xl font-semibold tracking-tight">{t.methods}</h2>
        {atlas.methods.length === 0 ? (
          <p className="text-muted-foreground">{t.methodsPending}</p>
        ) : (
          <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-2">
            {atlas.methods.map((m) => (
              <MethodCard key={m.id} method={m} examples={examplesFor(m)} lang={lang} />
            ))}
          </div>
        )}
      </section>

      {grouped.map((g) => (
        <section key={g.id} id={g.id} className="mt-20 scroll-mt-24">
          <h2 className="font-serif text-2xl font-semibold tracking-tight">{g.title}</h2>
          <p className="mt-2 max-w-2xl text-pretty leading-relaxed text-muted-foreground">{g.lead}</p>
          {g.id === "underground" && <LunaFigure lang={lang} className="mt-6 max-w-3xl" />}
          <div className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-5 md:grid-cols-2 xl:grid-cols-3">
            {g.facilities.map((f) => (
              <FacilityCard key={f.id} facility={f} reactions={measuredAt(f)} lang={lang} />
            ))}
          </div>
        </section>
      ))}
    </Container>
  )
}
