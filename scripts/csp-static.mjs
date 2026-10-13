// The static export's Content-Security-Policy (run after `next build`, as
// npm's postbuild; does nothing unless STATIC_EXPORT=1).
//
// GitHub Pages sends no headers a site can choose, so the policy goes into
// every page as <meta http-equiv="Content-Security-Policy">, right after the
// charset. It is the server build's policy (next.config.mjs) with one
// difference: instead of 'unsafe-inline', script-src lists the SHA-256 of
// each inline script of that page (Next's bootstrap and payload scripts, the
// theme script), so an injected script would not run. A meta policy cannot
// say frame-ancestors (it is left out) and cannot be report-only, so
// CSP_MODE=report-only or off leaves the pages without one.
//
//   STATIC_EXPORT=1 API_BASE=browser BASE_PATH=/Website npm run build
//   node scripts/csp-static.mjs [out]      # again, by hand (idempotent)

import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"

const MODE = process.env.CSP_MODE ?? "enforce"

if (process.env.STATIC_EXPORT !== "1" && !process.argv[2]) process.exit(0)

const { contentSecurityPolicy } = await import("../next.config.mjs")
const root = process.argv[2] ?? "out"

if (MODE !== "enforce") {
  console.log(`csp-static: CSP_MODE=${MODE}, pages left without a policy`)
  process.exit(0)
}
if (!fs.existsSync(root)) {
  console.error(`csp-static: ${root}/ not found (run the static export first)`)
  process.exit(1)
}

const SCRIPT = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi
const MARK = /<meta http-equiv="Content-Security-Policy"[^>]*>/i

function* pages(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) yield* pages(p)
    else if (entry.name.endsWith(".html")) yield p
  }
}

const attr = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;")

let count = 0
let most = 0
for (const file of pages(root)) {
  let html = fs.readFileSync(file, "utf8").replace(MARK, "")
  const hashes = new Set()
  for (const [, attrs, body] of html.matchAll(SCRIPT)) {
    if (/\bsrc\s*=/.test(attrs) || !body) continue
    // A data block (JSON-LD and the like) never runs, so needs no hash.
    const type = /\btype\s*=\s*["']?([^"'\s>]+)/i.exec(attrs)?.[1]?.toLowerCase()
    if (type && !["text/javascript", "module", "application/javascript"].includes(type)) continue
    hashes.add(`'sha256-${crypto.createHash("sha256").update(body, "utf8").digest("base64")}'`)
  }
  const policy = contentSecurityPolicy({ scripts: [...hashes], meta: true })
  const tag = `<meta http-equiv="Content-Security-Policy" content="${attr(policy)}"/>`
  const charset = /<meta charSet="utf-8"\/>|<meta charset="utf-8">/i.exec(html)
  if (charset) {
    const at = charset.index + charset[0].length
    html = html.slice(0, at) + tag + html.slice(at)
  } else {
    html = html.replace(/<head([^>]*)>/i, (m) => m + tag)
  }
  fs.writeFileSync(file, html)
  count += 1
  most = Math.max(most, hashes.size)
}
console.log(`csp-static: a Content-Security-Policy in ${count} pages (up to ${most} inline-script hashes each)`)
