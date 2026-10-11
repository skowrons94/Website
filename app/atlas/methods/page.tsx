import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, ExternalLink } from "lucide-react"

import { LunaBadge } from "@/components/atlas/status-badge"
import { Container, PageHeader } from "@/components/page-header"
import { Sci } from "@/components/sci"
import { getAtlas, type Facility, type Method, type Reaction } from "@/lib/atlas"
import { referenceHref, shortCitation } from "@/lib/atlas-format"

export const metadata: Metadata = {
  title: "Methods and laboratories · Reaction atlas",
  description:
    "How cross sections at stellar energies are measured, directly and indirectly, and the laboratories that measure them.",
}

const asList = (value: string | string[] | undefined) =>
  value === undefined ? [] : Array.isArray(value) ? value : [value]

/** Facilities fall in three groups; `group` in the file overrides the guess. */
function groupOf(f: Facility): "underground" | "surface" | "other" {
  if (f.group) return f.group
  if (f.underground === true) return "underground"
  if (f.underground === false) return "surface"
  return "other"
}

const GROUPS = [
  {
    id: "underground",
    title: "Underground laboratories",
    lead: "Accelerators under rock, where the cosmic-ray background is low enough to measure the smallest cross sections.",
  },
  {
    id: "surface",
    title: "Laboratories at the surface",
    lead: "Accelerators, recoil separators and neutron sources above ground, where the higher-energy data and most indirect measurements come from.",
  },
  {
    id: "other",
    title: "Other facilities",
    lead: "Facilities whose description is still being written.",
  },
] as const

function Citations({ keys }: { keys: string[] }) {
  const atlas = getAtlas()
  const refs = keys.map((k) => atlas.references[k]).filter(Boolean)
  if (refs.length === 0) return null
  return (
    <p className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {refs.map((ref) => {
        const href = referenceHref(ref)
        return href ? (
          <a key={ref.key} href={href} target="_blank" rel="noreferrer" className="underline-offset-2 hover:text-link hover:underline">
            <Sci>{shortCitation(ref)}</Sci>
          </a>
        ) : (
          <span key={ref.key}>
            <Sci>{shortCitation(ref)}</Sci>
          </span>
        )
      })}
    </p>
  )
}

function ReactionChips({ reactions }: { reactions: Reaction[] }) {
  if (reactions.length === 0) return null
  return (
    <ul className="flex flex-wrap gap-1.5">
      {reactions.map((r) => (
        <li key={r.id}>
          <Link
            href={`/atlas/${r.id}`}
            className="inline-block rounded-md border border-border bg-background px-2 py-0.5 font-serif text-sm font-semibold transition-colors hover:border-foreground/30 hover:text-link"
          >
            <Sci>{r.label}</Sci>
          </Link>
        </li>
      ))}
    </ul>
  )
}

function MethodCard({ method: m, examples }: { method: Method; examples: Reaction[] }) {
  const strengths = asList(m.strengths)
  const limits = asList(m.limits)
  return (
    <article id={m.id} className="scroll-mt-24 rounded-lg border border-border bg-card p-6 sm:p-7">
      <h3 className="font-serif text-xl font-semibold tracking-tight">
        <Sci>{m.name}</Sci>
      </h3>
      {m.summary ? (
        <p className="mt-3 text-pretty leading-relaxed">
          <Sci>{m.summary}</Sci>
        </p>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">Description in preparation.</p>
      )}
      {m.details && (
        <p className="mt-3 text-pretty text-[0.925rem] leading-relaxed text-muted-foreground">
          <Sci>{m.details}</Sci>
        </p>
      )}
      {(strengths.length > 0 || limits.length > 0) && (
        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          {strengths.length > 0 && (
            <div>
              <h4 className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">Strengths</h4>
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
              <h4 className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">Limits</h4>
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
            Examples in the atlas
          </h4>
          <ReactionChips reactions={examples} />
        </div>
      )}
      <Citations keys={m.refs ?? []} />
    </article>
  )
}

function FacilityCard({ facility: f, reactions }: { facility: Facility; reactions: Reaction[] }) {
  const facts = [
    ["Laboratory", f.lab],
    ["Location", [f.location, f.country].filter(Boolean).join(", ")],
    ["Depth", f.depth],
    ["Accelerator", f.accelerator],
    ["Years", f.years],
  ].filter(([, v]) => v) as [string, string][]
  return (
    <article
      id={f.id}
      className={`scroll-mt-24 rounded-lg border bg-card p-6 ${f.luna ? "border-foreground/30" : "border-border"}`}
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
        <p className="mt-3 text-sm text-muted-foreground">Description in preparation.</p>
      )}
      {f.details && (
        <p className="mt-3 text-pretty text-sm leading-relaxed text-muted-foreground">
          <Sci>{f.details}</Sci>
        </p>
      )}
      {reactions.length > 0 && (
        <div className="mt-4">
          <h4 className="mb-2 text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
            Measurements in the atlas
          </h4>
          <ReactionChips reactions={reactions} />
        </div>
      )}
      <Citations keys={f.refs ?? []} />
      {f.url && (
        <a
          href={f.url}
          target="_blank"
          rel="noreferrer"
          className="mt-4 inline-flex items-center gap-1.5 text-sm text-link underline-offset-4 hover:underline"
        >
          Website <ExternalLink className="h-3.5 w-3.5" />
        </a>
      )}
    </article>
  )
}

export default function MethodsPage() {
  const atlas = getAtlas()

  const examplesFor = (m: Method) => {
    const explicit = (m.examples ?? []).map((id) => atlas.reactions.find((r) => r.id === id)).filter(Boolean) as Reaction[]
    const derived = atlas.reactions.filter(
      (r) => !explicit.includes(r) && (r.methods.includes(m.id) || r.measurements.some((x) => x.method === m.id)),
    )
    return [...explicit, ...derived].slice(0, 8)
  }
  const measuredAt = (f: Facility) => atlas.reactions.filter((r) => r.measurements.some((m) => m.facility === f.id))

  const grouped = GROUPS.map((g) => ({
    ...g,
    // LUNA first within its group, otherwise file order.
    facilities: atlas.facilities
      .filter((f) => groupOf(f) === g.id)
      .map((f, i) => ({ f, i }))
      .sort((a, b) => Number(b.f.luna ?? false) - Number(a.f.luna ?? false) || a.i - b.i)
      .map(({ f }) => f),
  })).filter((g) => g.facilities.length > 0)

  return (
    <Container wide>
      <Link
        href="/atlas"
        className="mb-8 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Atlas
      </Link>
      <PageHeader
        eyebrow="Reaction atlas"
        title="Methods and laboratories"
        lead="A cross section at stellar energies can be measured directly, by aiming a beam at a target and counting the reactions, or inferred from other reactions and from theory. Each way has its own reach and its own systematic limits."
      />

      <nav className="mb-14 flex flex-wrap gap-x-6 gap-y-2 text-sm">
        <a href="#methods" className="text-muted-foreground underline-offset-4 hover:text-link hover:underline">
          Methods
        </a>
        {grouped.map((g) => (
          <a key={g.id} href={`#${g.id}`} className="text-muted-foreground underline-offset-4 hover:text-link hover:underline">
            {g.title}
          </a>
        ))}
      </nav>

      <section id="methods" className="scroll-mt-24">
        <h2 className="mb-6 font-serif text-2xl font-semibold tracking-tight">Methods</h2>
        {atlas.methods.length === 0 ? (
          <p className="text-muted-foreground">The methods are being described.</p>
        ) : (
          <div className="grid gap-6 lg:grid-cols-2">
            {atlas.methods.map((m) => (
              <MethodCard key={m.id} method={m} examples={examplesFor(m)} />
            ))}
          </div>
        )}
      </section>

      {grouped.map((g) => (
        <section key={g.id} id={g.id} className="mt-20 scroll-mt-24">
          <h2 className="font-serif text-2xl font-semibold tracking-tight">{g.title}</h2>
          <p className="mt-2 max-w-2xl text-pretty leading-relaxed text-muted-foreground">{g.lead}</p>
          <div className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {g.facilities.map((f) => (
              <FacilityCard key={f.id} facility={f} reactions={measuredAt(f)} />
            ))}
          </div>
        </section>
      ))}
    </Container>
  )
}
