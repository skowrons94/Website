import { NextResponse, type NextRequest } from "next/server"

/*
 * The server build only (next.config.mjs gives this file's extension to that
 * build alone; the static export does the same in its 404 page,
 * components/not-found-client.tsx): an evaluation's address in any case,
 * /evaluations/7be or /it/evaluations/24MG, is sent on to its own id
 * (/evaluations/7Be) with a permanent redirect, instead of a 404.
 */
const IDS = (process.env.EVALUATION_IDS ?? "").split(",").filter(Boolean)

export function middleware(request: NextRequest) {
  const match = /^(\/it)?\/evaluations\/([^/]+)(\/?)$/.exec(request.nextUrl.pathname)
  if (!match) return NextResponse.next()
  let asked: string
  try {
    asked = decodeURIComponent(match[2])
  } catch {
    // A malformed escape (/evaluations/%E0): no evaluation has that name.
    return NextResponse.next()
  }
  const id = IDS.find((e) => e.toLowerCase() === asked.toLowerCase())
  if (!id || id === asked) return NextResponse.next()
  const url = request.nextUrl.clone()
  url.pathname = `${match[1] ?? ""}/evaluations/${id}${match[3]}`
  return NextResponse.redirect(url, 308)
}

export const config = { matcher: ["/evaluations/:id", "/it/evaluations/:id"] }
