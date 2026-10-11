import type { Metadata } from "next"

import { RootShell } from "@/components/root-shell"
import { rootMetadata } from "@/lib/metadata"

// The Italian pages, under /it. The page bodies are shared
// with the English ones (components/pages/); see lib/i18n.ts.
export const metadata: Metadata = rootMetadata("it")

export default function Layout({ children }: { children: React.ReactNode }) {
  return <RootShell lang={"it"}>{children}</RootShell>
}
