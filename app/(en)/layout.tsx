import type { Metadata, Viewport } from "next"

import { RootShell } from "@/components/root-shell"
import { rootMetadata, rootViewport } from "@/lib/metadata"

// The English pages, at the root of the site. The page bodies are shared
// with the Italian ones (components/pages/); see lib/i18n.ts.
export const viewport: Viewport = rootViewport
export const metadata: Metadata = rootMetadata("en")

export default function Layout({ children }: { children: React.ReactNode }) {
  return <RootShell lang={"en"}>{children}</RootShell>
}
