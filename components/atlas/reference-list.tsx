import { LunaBadge } from "@/components/atlas/status-badge"
import { Sci } from "@/components/sci"
import type { Reference } from "@/lib/atlas"

/**
 * A numbered bibliography, set like the publications page: authors, the title
 * as the link, then journal, year and the DOI in mono, with the arXiv id beside
 * it. Each entry carries the anchor `ref-<key>` the in-text numbers point at.
 */
export function ReferenceList({
  keys,
  references,
}: {
  keys: string[]
  references: Record<string, Reference>
}) {
  return (
    <ol className="space-y-4">
      {keys.map((key, i) => {
        const ref = references[key]
        return (
          <li key={key} id={`ref-${key}`} className="flex scroll-mt-24 gap-3">
            <span className="tabular w-6 shrink-0 pt-0.5 text-right text-sm text-muted-foreground/70">
              {i + 1}.
            </span>
            {ref ? <Entry reference={ref} /> : <span className="text-sm text-muted-foreground">{key} (reference not found)</span>}
          </li>
        )
      })}
    </ol>
  )
}

function Entry({ reference: ref }: { reference: Reference }) {
  const doi = ref.doi ? String(ref.doi).replace(/^https?:\/\/(dx\.)?doi\.org\//i, "") : undefined
  const link = doi
    ? `https://doi.org/${doi}`
    : ref.arxiv
      ? `https://arxiv.org/abs/${ref.arxiv}`
      : ref.url
  return (
    <div className="min-w-0">
      <p className="text-sm text-muted-foreground">
        <Sci>{ref.authors}</Sci>
      </p>
      <p className="mt-0.5 text-pretty font-serif text-[1rem] font-semibold leading-snug tracking-tight">
        {link ? (
          <a href={link} target="_blank" rel="noreferrer" className="underline-offset-4 hover:text-link hover:underline">
            <Sci>{ref.title}</Sci>
          </a>
        ) : (
          <Sci>{ref.title}</Sci>
        )}
      </p>
      <p className="mt-1 break-words text-sm text-muted-foreground">
        {ref.journal && <Sci>{ref.journal}</Sci>}
        {ref.year && !String(ref.journal ?? "").includes(`(${ref.year})`) && (
          <span className="tabular"> ({ref.year})</span>
        )}
        {doi && (
          <>
            {" · "}
            <a
              href={`https://doi.org/${doi}`}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-xs underline-offset-2 hover:text-link hover:underline"
            >
              {doi}
            </a>
          </>
        )}
        {ref.arxiv && (
          <>
            {" · "}
            <a
              href={`https://arxiv.org/abs/${ref.arxiv}`}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-xs underline-offset-2 hover:text-link hover:underline"
            >
              arXiv:{ref.arxiv}
            </a>
          </>
        )}
        {ref.luna && <LunaBadge className="ml-2 align-[1px]" />}
      </p>
    </div>
  )
}

/** In-text citation numbers: `[1, 3]`, each a link to its entry. */
export function Cite({ keys, order }: { keys: string[]; order: string[] }) {
  if (keys.length === 0) return null
  return (
    <span className="tabular text-muted-foreground">
      [
      {keys.map((key, i) => (
        <span key={key}>
          {i > 0 && ", "}
          <a href={`#ref-${key}`} className="underline-offset-2 hover:text-link hover:underline">
            {order.indexOf(key) + 1}
          </a>
        </span>
      ))}
      ]
    </span>
  )
}
