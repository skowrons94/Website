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

/*
 * Security headers (DEPLOY.md, "Security"). The server build sends them with
 * every page; the static export cannot send headers at all, so
 * scripts/csp-static.mjs writes the same policy into each page as a <meta>
 * tag after the build, with the hash of every inline script instead of
 * 'unsafe-inline'.
 *
 * The server build allows inline scripts ('unsafe-inline'): Next's prerendered
 * pages carry inline bootstrap scripts that differ per page, and a nonce would
 * make every page dynamic. Nothing on the site renders visitors' HTML (pages
 * are built from the author's Markdown, raw HTML dropped), so the policy's
 * value is in what it forbids: scripts and connections to other origins,
 * plugins, framing, <base> and form targets elsewhere.
 *
 * CSP_MODE (build time): "enforce" (default), "report-only" (the browser
 * reports violations in its console and blocks nothing) or "off".
 */
const CSP_MODE = process.env.CSP_MODE ?? "enforce"
const DEV = process.env.NODE_ENV === "development"

function apiOrigin() {
  try {
    const base = process.env.API_BASE
    return base && /^https?:/.test(base) ? new URL(base).origin : ""
  } catch {
    return ""
  }
}

export function contentSecurityPolicy({ scripts = ["'unsafe-inline'"], meta = false } = {}) {
  const api = STATIC ? "" : apiOrigin()
  return [
    "default-src 'self'",
    // 'wasm-unsafe-eval': WebAssembly (the static build's AZURE2 engine).
    // Next's development server needs eval for its hot reloading.
    `script-src 'self' ${scripts.join(" ")} 'wasm-unsafe-eval'${DEV ? " 'unsafe-eval'" : ""}`,
    // Inline style attributes (charts, KaTeX's positioning) are everywhere.
    "style-src 'self' 'unsafe-inline'",
    // data: and blob: for plot exports and inline icons.
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self'${api ? ` ${api}` : ""}${DEV ? " ws:" : ""}`,
    // The rates explorer's worker and the static build's AZURE2 workers.
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "media-src 'self'",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    // Ignored in a <meta> policy (browsers warn about it there).
    ...(meta ? [] : ["frame-ancestors 'none'"]),
  ].join("; ")
}

// Features the site never uses, switched off for it and anything it embeds.
const PERMISSIONS_POLICY =
  "accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()"

function securityHeaders() {
  const headers = [
    { key: "Permissions-Policy", value: PERMISSIONS_POLICY },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  ]
  if (CSP_MODE !== "off") {
    headers.push({
      key: CSP_MODE === "report-only" ? "Content-Security-Policy-Report-Only" : "Content-Security-Policy",
      value: contentSecurityPolicy(),
    })
  }
  return headers
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
    : {
        output: "standalone",
        pageExtensions: ["tsx", "ts", "jsx", "js", "server.ts"],
        // The static export cannot send headers (scripts/csp-static.mjs).
        headers: async () => [{ source: "/:path*", headers: securityHeaders() }],
      }),
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
