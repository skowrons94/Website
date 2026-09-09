import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Evaluations",
  description:
    "Interactive R-matrix evaluations running on AZURE2: level schemes, fitted data and extrapolations.",
}

/**
 * The evaluation UI is wider than the prose pages — a level scheme plus its
 * plots does not fit a reading measure — so it gets its own frame rather than
 * the shared Container.
 */
export default function EvaluationsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <div className="mx-auto max-w-6xl px-5 py-10 sm:px-8 xl:max-w-7xl">{children}</div>
}
