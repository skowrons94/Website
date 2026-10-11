const STATIC = process.env.STATIC_EXPORT === "1"
const BASE_PATH = process.env.BASE_PATH ?? ""

/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  images: { unoptimized: true },
  // Self-contained server bundle, so the runtime image needs no node_modules.
  // STATIC_EXPORT=1 builds plain files for GitHub Pages instead (see
  // browser/README.md); BASE_PATH is the repository path when the site is
  // served from <user>.github.io/<repo>.
  ...(STATIC
    ? { output: "export", trailingSlash: true, basePath: BASE_PATH || undefined }
    : { output: "standalone" }),
  // Inlined at build time, so it must be set before `next build` runs.
  // An empty string is a valid, meaningful value: it makes every API call
  // same-origin and relative, which is what the compose stack wants. Only an
  // unset variable falls back to a local API.
  env: {
    API_BASE:
      process.env.API_BASE === undefined ? "http://localhost:5001" : process.env.API_BASE,
    BASE_PATH,
  },
}

export default nextConfig
