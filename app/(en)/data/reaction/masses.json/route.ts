import fs from "node:fs"
import path from "node:path"

import { parseAme } from "@/lib/data/masses"

// The atlas' AME2020 mass excesses as {"A,Z": MeV}, for the data explorer's
// exports (lib/data/client.ts loadMasses): written once at build time.
export const dynamic = "force-static"

export function GET() {
  const text = fs.readFileSync(path.join(process.cwd(), "content", "atlas", "nuclear-data", "ame2020-mass-excess.txt"), "utf8")
  return new Response(JSON.stringify(parseAme(text)), { headers: { "Content-Type": "application/json" } })
}
