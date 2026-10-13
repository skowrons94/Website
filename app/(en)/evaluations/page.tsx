import { EvaluationsIndex } from "@/components/pages/evaluations-index"
import { evaluationIds, evaluationMeta } from "@/lib/evaluation-meta"

// The cards are rendered from the repository at build time, so they are in
// the HTML; the client then asks the AZURE2 server (or, in the GitHub Pages
// build, the static index) for the live list. Its language comes from the layout.
export default function Page() {
  const initial = evaluationIds().map((id) => {
    const m = evaluationMeta(id)
    return {
      id,
      reactions: m.reactions,
      analysis: m.analysis,
      paper: m.paper,
      doi: m.doi,
      reference: m.reference,
      status: m.status,
      filename: m.filename,
      purpose: m.purpose,
      timings: m.timings,
    }
  })
  return <EvaluationsIndex initial={initial} />
}
