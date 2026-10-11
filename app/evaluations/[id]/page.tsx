import fs from "node:fs"
import path from "node:path"

import type { Metadata } from "next"
import Link from "next/link"

import EvaluationWorkspace from "@/components/evaluation-workspace"
import { Sci } from "@/components/sci"
import { getAtlas } from "@/lib/atlas"
import { pageMetadata } from "@/lib/metadata"

/**
 * Every evaluation directory that holds a .azr file, so a static build has a
 * page for each. On the server build a new evaluation is still served on
 * demand without rebuilding the site.
 */
export function generateStaticParams() {
  const root = path.join(process.cwd(), "server", "evaluations")
  if (!fs.existsSync(root)) return []
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .filter((d) => fs.readdirSync(path.join(root, d.name)).some((f) => f.endsWith(".azr")))
    .map((d) => ({ id: d.name }))
}

/** `14N` → `¹⁴N`; anything else is left as it is. */
function nuclide(id: string): string {
  return id.replace(/^(\d+)/, (m) => m.replace(/\d/g, (d) => "⁰¹²³⁴⁵⁶⁷⁸⁹"[Number(d)]))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  return pageMetadata(
    `${nuclide(id)} R-matrix evaluation`,
    `An interactive AZURE2 R-matrix evaluation of the ${nuclide(id)} system: level scheme, fitted data and the extrapolation to stellar energies.`,
  )
}

export default async function EvaluationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  // The atlas entries that point at this evaluation (rmatrix: in their file),
  // so the way back to the physics is as short as the way in.
  const reactions = getAtlas().reactions.filter((r) => r.rmatrix.includes(id))

  return (
    <>
      <EvaluationWorkspace />
      {reactions.length > 0 && (
        <aside className="mt-16 border-t border-border/70 pt-8 text-sm">
          <h2 className="mb-3 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
            In the reaction atlas
          </h2>
          <p className="max-w-2xl text-pretty leading-relaxed text-muted-foreground">
            What this reaction does in stars, how it has been measured and what is still uncertain:
          </p>
          <ul className="mt-4 flex flex-wrap gap-2">
            {reactions.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/atlas/${r.id}`}
                  className="inline-flex min-h-10 items-center rounded-md border border-border bg-card px-3 py-1.5 font-serif text-[0.95rem] font-semibold transition-colors hover:border-foreground/30 hover:text-link"
                >
                  <Sci>{r.label}</Sci>
                </Link>
              </li>
            ))}
          </ul>
        </aside>
      )}
    </>
  )
}
