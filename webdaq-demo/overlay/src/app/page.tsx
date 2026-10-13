// WebDAQ demo overlay #4b (design §2.3): the start page. Upstream this file only
// redirects to /auth/login. The demo's start page (shell/StartPage.tsx) is drawn
// by the demo frame in the layout when the path is "/": rendering it from here
// would put a second copy of the frame's code (strings, transport) into this
// route's chunk, and the start page has a 120 kB budget.
export default function Home() {
  return null
}
