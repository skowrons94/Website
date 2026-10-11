import fs from "node:fs"
import path from "node:path"

import EvaluationWorkspace from "@/components/evaluation-workspace"

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

export default function EvaluationPage() {
  return <EvaluationWorkspace />
}
