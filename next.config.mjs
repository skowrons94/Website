import fs from "node:fs"
import path from "node:path"

const STATIC = process.env.STATIC_EXPORT === "1"
const BASE_PATH = process.env.BASE_PATH ?? ""

/**
 * The evaluation ids (server/evaluations), for middleware.server.ts: there
 * /evaluations/7be (any case) is redirected to /evaluations/7Be on the server
 * build. Next.js matches redirects() without regard to case, so they cannot
 * do it; and the static export has no middleware at all (the file's
 * extension is a page extension of the server build only), so there the 404
 * page sends the reader on in the browser (components/not-found-client.tsx).
 */
function evaluationIds() {
  try {
    return fs
      .readdirSync(path.join(process.cwd(), "server", "evaluations"), { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort()
  } catch {
    return []
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  images: { unoptimized: true },
  // No "X-Powered-By: Next.js" on every response.
  poweredByHeader: false,
  // English pages and Italian pages (/it) have root layouts of their own, so
  // an address no route matches is answered by app/global-not-found.tsx.
  experimental: { globalNotFound: true },
  // Self-contained server bundle, so the runtime image needs no node_modules.
  // STATIC_EXPORT=1 builds plain files for GitHub Pages instead (see
  // browser/README.md); BASE_PATH is the repository path when the site is
  // served from <user>.github.io/<repo>.
  ...(STATIC
    ? { output: "export", trailingSlash: true, basePath: BASE_PATH || undefined }
    : { output: "standalone", pageExtensions: ["tsx", "ts", "jsx", "js", "server.ts"] }),
  // Inlined at build time, so it must be set before `next build` runs.
  // An empty string is a valid, meaningful value: it makes every API call
  // same-origin and relative, which is what the compose stack wants. Only an
  // unset variable falls back to a local API.
  env: {
    API_BASE:
      process.env.API_BASE === undefined ? "http://localhost:5001" : process.env.API_BASE,
    BASE_PATH,
    EVALUATION_IDS: evaluationIds().join(","),
    // Absolute origin for the hreflang links and Open Graph URLs, when known
    // (e.g. https://example.org); relative links otherwise.
    SITE_URL: process.env.SITE_URL ?? "",
    // The static export ends every URL with a slash; links built by hand
    // (the hreflang pairs) follow suit.
    TRAILING_SLASH: STATIC ? "1" : "",
  },
}

export default nextConfig
