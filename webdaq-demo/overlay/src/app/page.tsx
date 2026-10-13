// WebDAQ demo overlay #4b (design §2.3): the start page. Upstream this file only
// redirects to /auth/login; in the demo it is where the visitor chooses the
// detectors and the source (shell/StartPage.tsx).
import StartPage from '@/demo/shell/StartPage'

export default function Home() {
  return <StartPage />
}
