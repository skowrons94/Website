/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  images: { unoptimized: true },
  // Self-contained server bundle, so the runtime image needs no node_modules.
  output: "standalone",
  // Inlined at build time, so it must be set before `next build` runs.
  // An empty string is a valid, meaningful value: it makes every API call
  // same-origin and relative, which is what the compose stack wants. Only an
  // unset variable falls back to a local API.
  env: {
    API_BASE:
      process.env.API_BASE === undefined ? "http://localhost:5001" : process.env.API_BASE,
  },
}

export default nextConfig
