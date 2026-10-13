// WebDAQ demo overlay #3 (design §2.3): a static export needs every dynamic
// route enumerated. The demo's run numbers are 1…DEMO_MAX_RUN.
export const DEMO_MAX_RUN = 30
export const dynamicParams = false

export function generateStaticParams() {
  return Array.from({ length: DEMO_MAX_RUN }, (_, i) => ({ run_number: String(i + 1) }))
}

export default function LogbookRunLayout({ children }: { children: React.ReactNode }) {
  return children
}
