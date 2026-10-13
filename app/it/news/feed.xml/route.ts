import { newsFeed } from "@/lib/news-feed"

// Written once at build time: a file in the static export, a cached response on the server.
export const dynamic = "force-static"

export function GET() {
  return new Response(newsFeed("it"), { headers: { "Content-Type": "application/atom+xml; charset=utf-8" } })
}
