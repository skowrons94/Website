/** The site's public repository, its issue tracker, and a pre-filled new issue. */
export const REPO = "https://github.com/skowrons94/Website"

export function issueUrl(title: string, body: string): string {
  return `${REPO}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`
}
