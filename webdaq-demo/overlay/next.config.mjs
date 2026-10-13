// WebDAQ demo overlay #1 (design §2.3): static export under a base path, the
// API base set to the in-page adapter, and the webpack alias of `axios` to the
// demo axios (real axios whose instances get the in-browser adapter).
// (load-jsroot is replaced as a file, overlay #6, not aliased.)
// Replaces upstream frontend/next.config.mjs (hash-pinned in pin.json).
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const BASE = process.env.DEMO_BASE_PATH ?? '/webdaq-demo'
const here = path.dirname(new URL(import.meta.url).pathname)

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  trailingSlash: true,
  basePath: BASE,
  images: { unoptimized: true },
  eslint: { ignoreDuringBuilds: true },
  // Upstream builds with its own type errors tolerated by `next lint` only;
  // the demo's own code is type-checked by `tsc` in webdaq-demo (see README).
  typescript: { ignoreBuildErrors: true },
  productionBrowserSourceMaps: false,
  env: {
    NEXT_PUBLIC_API_URL: 'demo:',
    NEXT_PUBLIC_DEMO_BASE_PATH: BASE,
    NEXT_PUBLIC_DEMO_WORKER: process.env.NEXT_PUBLIC_DEMO_WORKER ?? '',
    NEXT_PUBLIC_DEMO_JSROOT: process.env.NEXT_PUBLIC_DEMO_JSROOT ?? '',
    NEXT_PUBLIC_DEMO_WEBDAQ_COMMIT: process.env.NEXT_PUBLIC_DEMO_WEBDAQ_COMMIT ?? '',
  },
  webpack(config) {
    config.resolve.alias = {
      ...config.resolve.alias,
      axios$: path.join(here, 'src/demo/shim/axios-demo.ts'),
      // axios' `exports` map forbids deep imports, so the real one is reached
      // by its absolute path.
      'axios-real$': path.join(path.dirname(require.resolve('axios/package.json')), 'index.js'),
    }
    return config
  },
}

export default nextConfig
